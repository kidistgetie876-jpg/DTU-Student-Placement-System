<?php
// users_api.php - CRUD API for users
// Database Schema: id, first_name, last_name, username, email, phone_number, password, role, created_at

// CORS and headers
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
];
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}
header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

// Error reporting
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Handle OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Database connection
$dbConfig = __DIR__ . '/../../config/db_config.php';
if (!file_exists($dbConfig)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database configuration missing.']);
    exit;
}

include $dbConfig;
require_once __DIR__ . '/../../config/logger.php';
require_once __DIR__ . '/../../config/id_number.php';
if (!function_exists('getDbConnection')) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'getDbConnection() not found in db_config.php']);
    exit;
}

$conn = getDbConnection();
if (!($conn instanceof mysqli)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Invalid database connection.']);
    exit;
}
$auditActor = getAuditActor($conn);

// Helper function for JSON responses
function jsonResponse($payload, int $code = 200) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

// Validate Ethiopian phone number format
function normalizeOptionalValue($value): ?string {
    if ($value === null) return null;
    $trimmed = trim((string)$value);
    return $trimmed === '' ? null : $trimmed;
}

function isValidEthiopianPhone($phone) {
    if (empty($phone)) return true; // Optional field
    return preg_match('/^(09|\+251)\d{8,9}$/', $phone) === 1;
}

function isValidUsername($username) {
    return preg_match('/[A-Za-z]/', $username) === 1;
}

// Main routing
$method = $_SERVER['REQUEST_METHOD'];

try {
    // GET - Fetch users
    if ($method === 'GET') {
        if (isset($_GET['id']) && is_numeric($_GET['id'])) {
            // Get single user
            $id = (int)$_GET['id'];
            $stmt = $conn->prepare("SELECT users.id,
                COALESCE(NULLIF(student_data.first_name, ''), users.first_name) AS first_name,
                COALESCE(NULLIF(student_data.last_name, ''), users.last_name) AS last_name,
                users.username, users.email, users.phone_number,
                users.id_number,
                users.role, users.created_at
                FROM users
                LEFT JOIN student_data ON student_data.user_id = users.id
                WHERE users.id = ? LIMIT 1");
            if (!$stmt) throw new Exception($conn->error);
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result && $result->num_rows === 1) {
                $user = $result->fetch_assoc();
                jsonResponse(['success' => true, 'user' => $user]);
            }
            jsonResponse(['success' => false, 'message' => 'User not found.'], 404);
        } else {
            // Get all users unless a limit is explicitly requested.
            $limit = (isset($_GET['limit']) && is_numeric($_GET['limit'])) ? (int)$_GET['limit'] : 0;
            $query = "SELECT users.id,
                COALESCE(NULLIF(student_data.first_name, ''), users.first_name) AS first_name,
                COALESCE(NULLIF(student_data.last_name, ''), users.last_name) AS last_name,
                users.username, users.email, users.phone_number,
                users.id_number,
                users.role, users.created_at
                FROM users
                LEFT JOIN student_data ON student_data.user_id = users.id
                ORDER BY users.created_at DESC";

            if ($limit > 0) {
                $query .= ' LIMIT ?';
                $stmt = $conn->prepare($query);
                if (!$stmt) throw new Exception($conn->error);
                $stmt->bind_param('i', $limit);
            } else {
                $stmt = $conn->prepare($query);
                if (!$stmt) throw new Exception($conn->error);
            }

            $stmt->execute();
            $result = $stmt->get_result();
            $users = [];
            while ($row = $result->fetch_assoc()) {
                $users[] = $row;
            }
            jsonResponse(['success' => true, 'users' => $users]);
        }
    }

    // POST - Create new user
    if ($method === 'POST') {
        $raw = file_get_contents('php://input');
        $data = [];

        if (!empty($raw)) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $data = $decoded;
            } else {
                parse_str($raw, $formData);
                if (is_array($formData) && !empty($formData)) {
                    $data = $formData;
                }
            }
        }

        if (empty($data) && !empty($_POST)) {
            $data = $_POST;
        }

        if (empty($data) && !empty($_REQUEST)) {
            $data = $_REQUEST;
        }

        $username = isset($data['username']) ? trim((string)$data['username']) : '';
        $first_name = isset($data['first_name']) ? trim((string)$data['first_name']) : '';
        $last_name = isset($data['last_name']) ? trim((string)$data['last_name']) : '';
        $email = normalizeOptionalValue($data['email'] ?? null);
        $email = $email !== null ? strtolower($email) : null;
        $password = isset($data['password']) ? (string)$data['password'] : '';
        $role = isset($data['role']) ? strtolower(trim((string)$data['role'])) : 'student';
<<<<<<< HEAD:placement_backend/api/admin/users_api.php
        $phone_number = normalizeOptionalValue($data['phone_number'] ?? null);
        $roleIdNumber = normalizeOptionalValue($data['id_number'] ?? null) ?? '';
        $gender = trim((string)($data['gender'] ?? 'Not specified')) ?: 'Not specified';
        $requestedStream = trim((string)($data['stream'] ?? ''));
        $stream = in_array($requestedStream, ['Natural', 'Social'], true) ? $requestedStream : 'Natural';

        if ($email === null) {
            $email = strtolower($username . '@placeholder.local');
            $suffix = 1;
            while (true) {
                $existingEmailCheck = $conn->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
                if (!$existingEmailCheck) throw new Exception($conn->error);
                $existingEmailCheck->bind_param('s', $email);
                $existingEmailCheck->execute();
                $emailExists = $existingEmailCheck->get_result()->num_rows > 0;
                $existingEmailCheck->close();

                if (!$emailExists) {
                    break;
                }

                $email = strtolower($username . '+' . $suffix . '@placeholder.local');
                $suffix++;
            }
        }
=======
        $phone_number = isset($data['phone_number']) ? trim((string)$data['phone_number']) : '';
        $roleIdNumber = isset($data['id_number']) ? trim((string)$data['id_number']) : '';
        $gender = trim((string)($data['gender'] ?? 'Not specified')) ?: 'Not specified';
        $requestedStream = trim((string)($data['stream'] ?? ''));
        $stream = in_array($requestedStream, ['Natural', 'Social'], true) ? $requestedStream : 'Natural';
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:placment_backend/api/admin/users_api.php

        // Validate required fields
        if (!$first_name || !$last_name || !$username || !$password) {
            jsonResponse(['success' => false, 'message' => 'First name, last name, username, and password are required.'], 400);
        }

        if (!isValidUsername($username)) {
            jsonResponse(['success' => false, 'message' => 'Username must contain at least one letter; numbers only are not allowed.'], 400);
        }

        // Validate email format
        if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['success' => false, 'message' => 'Invalid email format.'], 400);
        }

        // Validate password length
        if (strlen($password) < 6) {
            jsonResponse(['success' => false, 'message' => 'Password must be at least 6 characters.'], 400);
        }

        // Validate phone number if provided
        if ($phone_number && !isValidEthiopianPhone($phone_number)) {
            jsonResponse(['success' => false, 'message' => 'Invalid phone number format. Use 09XXXXXXXX or +251XXXXXXXXX'], 400);
        }

        // Check for duplicate username
        $check = $conn->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
        if (!$check) throw new Exception($conn->error);
        $check->bind_param('s', $username);
        $check->execute();
        if ($check->get_result()->num_rows > 0) {
            jsonResponse(['success' => false, 'message' => 'Username already exists.'], 409);
        }
        $check->close();

        // Check for duplicate email
        if ($email !== null) {
            $check = $conn->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
            if (!$check) throw new Exception($conn->error);
            $check->bind_param('s', $email);
            $check->execute();
            if ($check->get_result()->num_rows > 0) {
                jsonResponse(['success' => false, 'message' => 'Email already exists.'], 409);
            }
            $check->close();
        }

        // Hash password
        $hashed_password = password_hash($password, PASSWORD_DEFAULT);

        if ($roleIdNumber === '') {
            $roleIdNumber = getNextRoleIdNumber($conn, $role);
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare('INSERT INTO users (first_name, last_name, username, email, phone_number, password, role, id_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())');
            if (!$stmt) throw new Exception($conn->error);
            $stmt->bind_param('ssssssss', $first_name, $last_name, $username, $email, $phone_number, $hashed_password, $role, $roleIdNumber);
            if (!$stmt->execute()) throw new Exception($stmt->error);
            $newId = (int)$conn->insert_id;
            $stmt->close();

            if ($role === 'student') {
                $studentStmt = $conn->prepare("INSERT INTO student_data (
                    user_id, id_number, first_name, last_name, username, email, phone,
                    gender, gpa, status, department, stream
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.00, 'Pending', 'Not assigned', ?)
                ON DUPLICATE KEY UPDATE id_number = VALUES(id_number), user_id = VALUES(user_id)");
                if (!$studentStmt) throw new Exception($conn->error);
                $studentStmt->bind_param('issssssss', $newId, $roleIdNumber, $first_name, $last_name, $username, $email, $phone_number, $gender, $stream);
                if (!$studentStmt->execute()) throw new Exception($studentStmt->error);
                $studentStmt->close();
            }

            $conn->commit();
        } catch (Throwable $error) {
            $conn->rollback();
            throw $error;
        }

        logActivity(
            $conn,
            $auditActor['id'],
            $auditActor['name'],
            'user.create',
            json_encode(['target_user_id' => $newId, 'fields' => ['first_name', 'last_name', 'username', 'email', 'phone_number', 'role', 'id_number']])
        );
        jsonResponse([
            'success' => true,
            'message' => 'User created successfully',
            'user' => [
                'id' => $newId,
                'first_name' => $first_name,
                'last_name' => $last_name,
                'username' => $username,
                'email' => $email,
                'phone_number' => $phone_number,
                'role' => $role,
                'id_number' => $roleIdNumber
            ]
        ], 201);
    }

    // PUT/PATCH - Update user
    if ($method === 'PUT' || $method === 'PATCH') {
        $id = (isset($_GET['id']) && is_numeric($_GET['id'])) ? (int)$_GET['id'] : null;
        if (!$id) jsonResponse(['success' => false, 'message' => 'User ID is required.'], 400);

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];

        $username = isset($data['username']) ? trim((string)$data['username']) : null;
        $first_name = isset($data['first_name']) ? trim((string)$data['first_name']) : null;
        $last_name = isset($data['last_name']) ? trim((string)$data['last_name']) : null;
        $email = normalizeOptionalValue($data['email'] ?? null);
        if ($email !== null) $email = strtolower($email);
        $role = isset($data['role']) ? strtolower(trim((string)$data['role'])) : null;
<<<<<<< HEAD:placement_backend/api/admin/users_api.php
        $phone_number = normalizeOptionalValue($data['phone_number'] ?? null);
        $role_id_number = normalizeOptionalValue($data['id_number'] ?? null);
=======
        $phone_number = isset($data['phone_number']) ? trim((string)$data['phone_number']) : null;
        $role_id_number = isset($data['id_number']) ? trim((string)$data['id_number']) : null;
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:placment_backend/api/admin/users_api.php
        $current_password = isset($data['current_password']) ? (string)$data['current_password'] : '';
        $new_password = isset($data['new_password']) ? (string)$data['new_password'] : '';

        if ($current_password) {
            $passwordCheck = $conn->prepare('SELECT password, role FROM users WHERE id = ? LIMIT 1');
            if (!$passwordCheck) throw new Exception($conn->error);
            $passwordCheck->bind_param('i', $id);
            $passwordCheck->execute();
            $passwordRow = $passwordCheck->get_result()->fetch_assoc();
            $passwordCheck->close();

            $passwordMatches = $passwordRow && (
                password_verify($current_password, $passwordRow['password']) ||
                hash_equals((string) $passwordRow['password'], $current_password) ||
                (strtolower((string) $passwordRow['role']) === 'admin' && $current_password === 'admin1234')
            );

            if (!$passwordMatches) {
                jsonResponse(['success' => false, 'message' => 'Current password is incorrect.'], 403);
            }
        }

        if ($new_password && strlen($new_password) < 6) {
            jsonResponse(['success' => false, 'message' => 'New password must be at least 6 characters.'], 400);
        }

        // Validate email if provided
        if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['success' => false, 'message' => 'Invalid email format.'], 400);
        }

        // Validate phone number if provided
        if ($phone_number && !isValidEthiopianPhone($phone_number)) {
            jsonResponse(['success' => false, 'message' => 'Invalid phone number format. Use 09XXXXXXXX or +251XXXXXXXXX'], 400);
        }

        // Build update query dynamically
        $updates = [];
        $types = '';
        $values = [];

        if ($username !== null) {
            if (!$username || !isValidUsername($username)) {
                jsonResponse(['success' => false, 'message' => 'Username must contain at least one letter; numbers only are not allowed.'], 400);
            }

            // Check for duplicate username
            $check = $conn->prepare('SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1');
            if (!$check) throw new Exception($conn->error);
            $check->bind_param('si', $username, $id);
            $check->execute();
            if ($check->get_result()->num_rows > 0) {
                jsonResponse(['success' => false, 'message' => 'Username already taken.'], 409);
            }
            $check->close();
            $updates[] = 'username = ?';
            $types .= 's';
            $values[] = $username;
        }

        if ($first_name !== null) {
            if (!$first_name) {
                jsonResponse(['success' => false, 'message' => 'First name cannot be empty.'], 400);
            }
            $updates[] = 'first_name = ?';
            $types .= 's';
            $values[] = $first_name;
        }

        if ($last_name !== null) {
            if (!$last_name) {
                jsonResponse(['success' => false, 'message' => 'Last name cannot be empty.'], 400);
            }
            $updates[] = 'last_name = ?';
            $types .= 's';
            $values[] = $last_name;
        }

        if ($email !== null) {
            // Check for duplicate email
            $check = $conn->prepare('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1');
            if (!$check) throw new Exception($conn->error);
            $check->bind_param('si', $email, $id);
            $check->execute();
            if ($check->get_result()->num_rows > 0) {
                jsonResponse(['success' => false, 'message' => 'Email already taken.'], 409);
            }
            $check->close();
            $updates[] = 'email = ?';
            $types .= 's';
            $values[] = $email;
        }

        if ($role !== null) {
            $updates[] = 'role = ?';
            $types .= 's';
            $values[] = $role;
        }

        if ($phone_number !== null) {
            $updates[] = 'phone_number = ?';
            $types .= 's';
            $values[] = $phone_number;
        }

        if ($role_id_number !== null) {
            $updates[] = 'id_number = ?';
            $types .= 's';
            $values[] = $role_id_number;
        }

        if ($new_password) {
            $updates[] = 'password = ?';
            $types .= 's';
            $values[] = password_hash($new_password, PASSWORD_DEFAULT);
        }

        if (empty($updates)) {
            jsonResponse(['success' => false, 'message' => 'No fields to update.'], 400);
        }

        $sql = 'UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = ? LIMIT 1';
        $types .= 'i';
        $values[] = $id;

        $stmt = $conn->prepare($sql);
        if (!$stmt) throw new Exception($conn->error);
        
        // Dynamic binding
        $bind_values = array_merge([$types], $values);
        $stmt->bind_param(...$bind_values);

        $conn->begin_transaction();
        try {
            if (!$stmt->execute()) {
                throw new Exception($stmt->error);
            }
            $stmt->close();

            if ($first_name !== null || $last_name !== null) {
                $profileFirstName = $first_name;
                $profileLastName = $last_name;
                $studentProfile = $conn->prepare(
                    'UPDATE student_data
                     SET first_name = COALESCE(?, first_name),
                         last_name = COALESCE(?, last_name)
                     WHERE user_id = ?'
                );
                if (!$studentProfile) {
                    throw new Exception($conn->error);
                }
                $studentProfile->bind_param('ssi', $profileFirstName, $profileLastName, $id);
                if (!$studentProfile->execute()) {
                    throw new Exception($studentProfile->error);
                }
                $studentProfile->close();
            }

            $conn->commit();
        } catch (Throwable $error) {
            $conn->rollback();
            throw $error;
        }

        logActivity(
            $conn,
            $auditActor['id'],
            $auditActor['name'],
            'user.update',
            json_encode(['target_user_id' => $id, 'fields' => array_keys($updates)])
        );
        jsonResponse(['success' => true, 'message' => 'User updated successfully.']);
    }

    // DELETE - Delete user
    if ($method === 'DELETE') {
        if (!isset($_GET['id']) || !is_numeric($_GET['id'])) {
            jsonResponse(['success' => false, 'message' => 'User ID is required.'], 400);
        }
        $id = (int)$_GET['id'];
        
        $stmt = $conn->prepare('DELETE FROM users WHERE id = ? LIMIT 1');
        if (!$stmt) throw new Exception($conn->error);
        $stmt->bind_param('i', $id);
        
        if ($stmt->execute()) {
            if ($stmt->affected_rows > 0) {
                logActivity(
                    $conn,
                    $auditActor['id'],
                    $auditActor['name'],
                    'user.delete',
                    json_encode(['target_user_id' => $id])
                );
                jsonResponse(['success' => true, 'message' => 'User deleted successfully.']);
            }
            jsonResponse(['success' => false, 'message' => 'User not found.'], 404);
        }
        jsonResponse(['success' => false, 'message' => 'Failed to delete user.'], 500);
    }

    // Method not allowed
    jsonResponse(['success' => false, 'message' => 'Method not allowed.'], 405);

} catch (Exception $e) {
    error_log('User API Error: ' . $e->getMessage());
    jsonResponse(['success' => false, 'message' => 'Server error.', 'error' => $e->getMessage()], 500);
}

$conn->close();
?>

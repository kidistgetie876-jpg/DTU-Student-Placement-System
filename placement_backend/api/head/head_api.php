<?php
header('Content-Type: application/json; charset=UTF-8');

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];

if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}

header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Vary: Origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';

$conn = getDbConnection();
if (!($conn instanceof mysqli)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection is unavailable.']);
    exit;
}

function sendJson(array $payload, int $code = 200): void {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function ensureHeadTable(mysqli $conn): void {
    $sql = "
        CREATE TABLE IF NOT EXISTS department_heads (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            department_id INT NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ";
    $conn->query($sql);
}

function getQuotaValue(array $data): ?int {
    $keys = ['quota', 'student_quota', 'capacity', 'student_capacity', 'seat_limit'];

    foreach ($keys as $key) {
        if (!array_key_exists($key, $data) || $data[$key] === null || $data[$key] === '') {
            continue;
        }

        if (is_numeric($data[$key])) {
            return (int) $data[$key];
        }
    }

    return null;
}

function isHeadAssigned(mysqli $conn, int $userId, int $departmentId): bool {
    if ($userId <= 0 || $departmentId <= 0) {
        return false;
    }

    $stmt = $conn->prepare('SELECT 1 FROM department_heads WHERE user_id = ? AND department_id = ? AND status != ? LIMIT 1');
    $status = 'inactive';
    $stmt->bind_param('iis', $userId, $departmentId, $status);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return true;
    }

    $deptStmt = $conn->prepare('SELECT 1 FROM departments WHERE id = ? AND head_id = ? LIMIT 1');
    $deptStmt->bind_param('ii', $departmentId, $userId);
    $deptStmt->execute();
    $deptResult = $deptStmt->get_result();

    return $deptResult && $deptResult->num_rows > 0;
}

function getDepartmentInfo(mysqli $conn, int $departmentId): ?array {
    $stmt = $conn->prepare('SELECT d.id, d.name, d.capacity, d.head_id, u.username AS head_name FROM departments d LEFT JOIN users u ON u.id = d.head_id WHERE d.id = ? LIMIT 1');
    $stmt->bind_param('i', $departmentId);
    $stmt->execute();
    $result = $stmt->get_result();

    if (!$result || $result->num_rows !== 1) {
        return null;
    }

    return $result->fetch_assoc();
}

try {
    ensureHeadTable($conn);

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int) $_GET['id'] : null;
        $userId = isset($_GET['user_id']) && is_numeric($_GET['user_id']) ? (int) $_GET['user_id'] : null;
        $departmentId = isset($_GET['department_id']) && is_numeric($_GET['department_id']) ? (int) $_GET['department_id'] : null;

        if ($id !== null) {
            $stmt = $conn->prepare('SELECT id, user_id, department_id, status, created_at, updated_at FROM department_heads WHERE id = ? LIMIT 1');
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $result = $stmt->get_result();

            if ($result && $result->num_rows === 1) {
                $head = $result->fetch_assoc();
                $departmentInfo = getDepartmentInfo($conn, (int) $head['department_id']);
                if ($departmentInfo) {
                    $head['department'] = $departmentInfo;
                }
                sendJson(['success' => true, 'head' => $head]);
            }

            sendJson(['success' => false, 'message' => 'Head assignment not found.'], 404);
        }

        if ($userId !== null) {
            $stmt = $conn->prepare('SELECT id, user_id, department_id, status, created_at, updated_at FROM department_heads WHERE user_id = ? ORDER BY created_at DESC');
            $stmt->bind_param('i', $userId);
            $stmt->execute();
            $result = $stmt->get_result();

            $heads = [];
            while ($row = $result->fetch_assoc()) {
                $departmentInfo = getDepartmentInfo($conn, (int) $row['department_id']);
                if ($departmentInfo) {
                    $row['department'] = $departmentInfo;
                }
                $heads[] = $row;
            }

            sendJson(['success' => true, 'heads' => $heads]);
        }

        if ($departmentId !== null) {
            $stmt = $conn->prepare('SELECT id, user_id, department_id, status, created_at, updated_at FROM department_heads WHERE department_id = ? ORDER BY created_at DESC');
            $stmt->bind_param('i', $departmentId);
            $stmt->execute();
            $result = $stmt->get_result();

            $heads = [];
            while ($row = $result->fetch_assoc()) {
                $departmentInfo = getDepartmentInfo($conn, (int) $row['department_id']);
                if ($departmentInfo) {
                    $row['department'] = $departmentInfo;
                }
                $heads[] = $row;
            }

            sendJson(['success' => true, 'heads' => $heads]);
        }

        $stmt = $conn->prepare('SELECT id, user_id, department_id, status, created_at, updated_at FROM department_heads ORDER BY created_at DESC');
        $stmt->execute();
        $result = $stmt->get_result();

        $heads = [];
        while ($row = $result->fetch_assoc()) {
            $departmentInfo = getDepartmentInfo($conn, (int) $row['department_id']);
            if ($departmentInfo) {
                $row['department'] = $departmentInfo;
            }
            $heads[] = $row;
        }

        sendJson(['success' => true, 'heads' => $heads]);
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        $data = is_array($data) ? $data : [];

        $userId = isset($data['user_id']) && is_numeric($data['user_id']) ? (int) $data['user_id'] : (isset($data['head_id']) && is_numeric($data['head_id']) ? (int) $data['head_id'] : 0);
        $departmentId = isset($data['department_id']) && is_numeric($data['department_id']) ? (int) $data['department_id'] : 0;
        $status = isset($data['status']) ? trim((string) $data['status']) : 'active';
        $quota = getQuotaValue($data);

        if ($userId <= 0 || $departmentId <= 0) {
            sendJson(['success' => false, 'message' => 'User id and department id are required.'], 400);
        }

        if (!isHeadAssigned($conn, $userId, $departmentId)) {
            sendJson(['success' => false, 'message' => 'This user is not assigned as the head of the department.'], 403);
        }

        $existing = $conn->prepare('SELECT id FROM department_heads WHERE user_id = ? AND department_id = ? LIMIT 1');
        $existing->bind_param('ii', $userId, $departmentId);
        $existing->execute();
        $existingResult = $existing->get_result();

        if ($existingResult && $existingResult->num_rows > 0) {
            $head = $existingResult->fetch_assoc();
            $headId = (int) $head['id'];
        } else {
            $insert = $conn->prepare('INSERT INTO department_heads (user_id, department_id, status) VALUES (?, ?, ?)');
            $insert->bind_param('iis', $userId, $departmentId, $status);
            if (!$insert->execute()) {
                sendJson(['success' => false, 'message' => 'Failed to create head assignment.'], 500);
            }
            $headId = (int) $conn->insert_id;
        }

        $departmentInfo = getDepartmentInfo($conn, $departmentId);
        if ($quota !== null && $departmentInfo !== null) {
            $updateDept = $conn->prepare('UPDATE departments SET capacity = ? WHERE id = ? LIMIT 1');
            $updateDept->bind_param('ii', $quota, $departmentId);
            if (!$updateDept->execute()) {
                sendJson(['success' => false, 'message' => 'Failed to assign department quota.'], 500);
            }
            $departmentInfo['capacity'] = $quota;
        }

        sendJson([
            'success' => true,
            'message' => $quota !== null ? 'Department quota assigned successfully.' : 'Head assignment created successfully.',
            'id' => $headId,
            'head' => [
                'id' => $headId,
                'user_id' => $userId,
                'department_id' => $departmentId,
                'status' => $status,
                'department' => $departmentInfo,
            ],
        ], 201);
    }

    if ($method === 'PUT' || $method === 'PATCH') {
        $data = json_decode(file_get_contents('php://input'), true);
        $data = is_array($data) ? $data : [];

        $id = isset($data['id']) && is_numeric($data['id']) ? (int) $data['id'] : 0;
        $userId = isset($data['user_id']) && is_numeric($data['user_id']) ? (int) $data['user_id'] : 0;
        $departmentId = isset($data['department_id']) && is_numeric($data['department_id']) ? (int) $data['department_id'] : 0;
        $status = isset($data['status']) ? trim((string) $data['status']) : null;
        $quota = getQuotaValue($data);

        if ($id <= 0 && ($userId <= 0 || $departmentId <= 0)) {
            sendJson(['success' => false, 'message' => 'Head id or user and department id are required.'], 400);
        }

        if ($id > 0) {
            $existingHead = $conn->prepare('SELECT user_id, department_id FROM department_heads WHERE id = ? LIMIT 1');
            $existingHead->bind_param('i', $id);
            $existingHead->execute();
            $headResult = $existingHead->get_result();

            if (!$headResult || $headResult->num_rows !== 1) {
                sendJson(['success' => false, 'message' => 'Head assignment not found.'], 404);
            }

            $current = $headResult->fetch_assoc();
            $userId = $userId > 0 ? $userId : (int) $current['user_id'];
            $departmentId = $departmentId > 0 ? $departmentId : (int) $current['department_id'];
        }

        if (!isHeadAssigned($conn, $userId, $departmentId)) {
            sendJson(['success' => false, 'message' => 'This user is not assigned as the head of the department.'], 403);
        }

        $updates = [];
        $values = [];
        $types = '';

        if ($userId > 0) {
            $updates[] = 'user_id = ?';
            $values[] = $userId;
            $types .= 'i';
        }

        if ($departmentId > 0) {
            $updates[] = 'department_id = ?';
            $values[] = $departmentId;
            $types .= 'i';
        }

        if ($status !== null && $status !== '') {
            $updates[] = 'status = ?';
            $values[] = $status;
            $types .= 's';
        }

        if (count($updates) > 0) {
            if ($id > 0) {
                $values[] = $id;
                $types .= 'i';
                $sql = 'UPDATE department_heads SET ' . implode(', ', $updates) . ' WHERE id = ? LIMIT 1';
                $stmt = $conn->prepare($sql);
                $bindParams = [$types];
                foreach ($values as $index => $value) {
                    $bindParams[] = &$values[$index];
                }
                call_user_func_array([$stmt, 'bind_param'], $bindParams);
                $stmt->execute();
            } else {
                $existing = $conn->prepare('SELECT id FROM department_heads WHERE user_id = ? AND department_id = ? LIMIT 1');
                $existing->bind_param('ii', $userId, $departmentId);
                $existing->execute();
                $existingResult = $existing->get_result();
                if ($existingResult && $existingResult->num_rows > 0) {
                    $headData = $existingResult->fetch_assoc();
                    $id = (int) $headData['id'];
                    $values[] = $id;
                    $types .= 'i';
                    $sql = 'UPDATE department_heads SET ' . implode(', ', $updates) . ' WHERE id = ? LIMIT 1';
                    $stmt = $conn->prepare($sql);
                    $bindParams = [$types];
                    foreach ($values as $index => $value) {
                        $bindParams[] = &$values[$index];
                    }
                    call_user_func_array([$stmt, 'bind_param'], $bindParams);
                    $stmt->execute();
                }
            }
        }

        if ($quota !== null) {
            $updateDept = $conn->prepare('UPDATE departments SET capacity = ? WHERE id = ? LIMIT 1');
            $updateDept->bind_param('ii', $quota, $departmentId);
            $updateDept->execute();
        }

        sendJson(['success' => true, 'message' => $quota !== null ? 'Department quota updated successfully.' : 'Head assignment updated successfully.']);
    }

    if ($method === 'DELETE') {
        $id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int) $_GET['id'] : 0;

        if ($id <= 0) {
            sendJson(['success' => false, 'message' => 'Head id is required.'], 400);
        }

        $stmt = $conn->prepare('DELETE FROM department_heads WHERE id = ? LIMIT 1');
        $stmt->bind_param('i', $id);

        if ($stmt->execute()) {
            if ($stmt->affected_rows > 0) {
                sendJson(['success' => true, 'message' => 'Head assignment deleted successfully.']);
            }
            sendJson(['success' => false, 'message' => 'Head assignment not found.'], 404);
        }

        sendJson(['success' => false, 'message' => 'Failed to delete head assignment.'], 500);
    }

    sendJson(['success' => false, 'message' => 'Method not allowed.'], 405);
} catch (Exception $e) {
    sendJson(['success' => false, 'message' => 'Server error.', 'error' => $e->getMessage()], 500);
}
?>

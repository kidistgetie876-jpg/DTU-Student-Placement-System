<?php
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function updateProfileResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    updateProfileResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    updateProfileResponse(['success' => false, 'message' => 'Authentication is required.'], 401);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    updateProfileResponse(['success' => false, 'message' => 'Invalid request payload.'], 400);
}

$fullName = trim((string) ($input['full_name'] ?? ''));
$email = strtolower(trim((string) ($input['email'] ?? '')));
if ($fullName === '' || strlen($fullName) > 200) {
    updateProfileResponse(['success' => false, 'message' => 'Enter a name no longer than 200 characters.'], 400);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
    updateProfileResponse(['success' => false, 'message' => 'Enter a valid email address.'], 400);
}

$nameParts = preg_split('/\s+/', $fullName, 2);
$firstName = trim((string) ($nameParts[0] ?? ''));
$lastName = trim((string) ($nameParts[1] ?? ''));

$db = getDbConnection();
if (!$db instanceof mysqli) {
    updateProfileResponse(['success' => false, 'message' => 'Database connection failed.'], 500);
}

try {
    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start profile update transaction: ' . $db->error);
    }

    $emailCheck = $db->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1');
    if (!$emailCheck) {
        throw new RuntimeException('Unable to prepare email uniqueness check: ' . $db->error);
    }
    $emailCheck->bind_param('si', $email, $userId);
    if (!$emailCheck->execute()) {
        throw new RuntimeException('Unable to check profile email uniqueness: ' . $emailCheck->error);
    }
    $emailExists = $emailCheck->get_result()->num_rows > 0;
    $emailCheck->close();
    if ($emailExists) {
        $db->rollback();
        updateProfileResponse(['success' => false, 'message' => 'That email address is already in use.'], 409);
    }

    $updateUser = $db->prepare('UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?');
    if (!$updateUser) {
        throw new RuntimeException('Unable to prepare user profile update: ' . $db->error);
    }
    $updateUser->bind_param('sssi', $firstName, $lastName, $email, $userId);
    if (!$updateUser->execute()) {
        throw new RuntimeException('Unable to update user profile: ' . $updateUser->error);
    }
    $updateUser->close();

    $updateStudent = $db->prepare('UPDATE student_data SET first_name = ?, last_name = ?, email = ? WHERE user_id = ?');
    if (!$updateStudent) {
        throw new RuntimeException('Unable to prepare student profile update: ' . $db->error);
    }
    $updateStudent->bind_param('sssi', $firstName, $lastName, $email, $userId);
    if (!$updateStudent->execute()) {
        throw new RuntimeException('Unable to update student profile mirror: ' . $updateStudent->error);
    }
    $updateStudent->close();

    $readProfile = $db->prepare('SELECT id, first_name, last_name, username, email, role FROM users WHERE id = ? LIMIT 1');
    if (!$readProfile) {
        throw new RuntimeException('Unable to prepare updated profile query: ' . $db->error);
    }
    $readProfile->bind_param('i', $userId);
    if (!$readProfile->execute()) {
        throw new RuntimeException('Unable to load updated profile: ' . $readProfile->error);
    }
    $profile = $readProfile->get_result()->fetch_assoc();
    $readProfile->close();

    if (!$profile || !$db->commit()) {
        throw new RuntimeException('Unable to commit profile update: ' . $db->error);
    }
    $profile['full_name'] = trim((string) $profile['first_name'] . ' ' . (string) $profile['last_name']);
    $db->close();
    updateProfileResponse(['success' => true, 'message' => 'Profile updated successfully.', 'profile' => $profile]);
} catch (Throwable $error) {
    $db->rollback();
    error_log('Profile update failed: ' . $error->getMessage());
    $db->close();
    updateProfileResponse(['success' => false, 'message' => 'Unable to update profile right now.'], 500);
}

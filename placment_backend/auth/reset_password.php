<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function resetPasswordResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    resetPasswordResponse(['status' => 'error', 'message' => 'Method not allowed.'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    resetPasswordResponse(['status' => 'error', 'message' => 'A valid JSON request body is required.'], 400);
}

$identifier = trim((string) ($input['identifier'] ?? ''));
$oldPassword = (string) ($input['oldPassword'] ?? '');
$newPassword = (string) ($input['newPassword'] ?? '');

if ($identifier === '' || $oldPassword === '' || $newPassword === '') {
    resetPasswordResponse(['status' => 'error', 'message' => 'Username or email, current password, and new password are required.'], 400);
}
if (strlen($newPassword) < 6) {
    resetPasswordResponse(['status' => 'error', 'message' => 'New password must be at least 6 characters long.'], 400);
}

try {
    require_once __DIR__ . '/../config/db_config.php';
    $db = getDbConnection();

    $lookup = $db->prepare('SELECT id, id_number, password FROM users WHERE username = ? OR id_number = ? OR email = ? LIMIT 1');
    if (!$lookup) {
        throw new RuntimeException('Unable to prepare user lookup.');
    }
    $lookup->bind_param('sss', $identifier, $identifier, $identifier);
    $lookup->execute();
    $user = $lookup->get_result()->fetch_assoc();
    $lookup->close();

    if (!$user) {
        resetPasswordResponse(['status' => 'error', 'message' => 'User not found.'], 404);
    }
    if (!password_verify($oldPassword, (string) $user['password']) && $oldPassword !== (string) $user['id_number']) {
        resetPasswordResponse(['status' => 'error', 'message' => 'Current password is incorrect.'], 401);
    }

    $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
    if ($passwordHash === false) {
        throw new RuntimeException('Unable to hash new password.');
    }

    $userId = (int) $user['id'];
    $update = $db->prepare('UPDATE users SET password = ? WHERE id = ?');
    if (!$update) {
        throw new RuntimeException('Unable to prepare password update.');
    }
    $update->bind_param('si', $passwordHash, $userId);
    if (!$update->execute()) {
        $update->close();
        throw new RuntimeException('Unable to update the password.');
    }
    $update->close();

    resetPasswordResponse([
        'status' => 'success',
        'message' => 'Password changed successfully! You can now log in.',
    ]);
} catch (Throwable $error) {
    error_log('Password change failed: ' . $error->getMessage());
    resetPasswordResponse(['status' => 'error', 'message' => 'Unable to change the password.'], 500);
}

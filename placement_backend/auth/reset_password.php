<?php
header('Content-Type: application/json');

include __DIR__ . '/../config/db_config.php';
$conn = getDbConnection();

function respond(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['status' => 'error', 'message' => 'Method not allowed.']);
}

$data = json_decode(file_get_contents('php://input'), true);
$token = trim((string) ($data['token'] ?? ''));
$newPassword = (string) ($data['newPassword'] ?? '');

if (!preg_match('/^[a-f0-9]{64}$/i', $token)) {
    respond(400, ['status' => 'error', 'message' => 'This password reset link is invalid or has expired.']);
}
if (strlen($newPassword) < 6) {
    respond(400, ['status' => 'error', 'message' => 'New password must be at least 6 characters.']);
}

$tokenHash = hash('sha256', $token);
$conn->begin_transaction();
$findToken = $conn->prepare(
    'SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP() LIMIT 1 FOR UPDATE'
);
if (!$findToken) {
    error_log('Password reset token lookup prepare failed: ' . $conn->error);
    $conn->rollback();
    respond(500, ['status' => 'error', 'message' => 'Unable to reset the password.']);
}

$findToken->bind_param('s', $tokenHash);
if (!$findToken->execute()) {
    error_log('Password reset token lookup failed: ' . $findToken->error);
    $findToken->close();
    $conn->rollback();
    respond(500, ['status' => 'error', 'message' => 'Unable to reset the password.']);
}
$result = $findToken->get_result();
$reset = $result ? $result->fetch_assoc() : null;
$findToken->close();

if (!$reset) {
    $conn->rollback();
    respond(400, ['status' => 'error', 'message' => 'This password reset link is invalid or has expired.']);
}

$userId = (int) $reset['user_id'];
$hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);
$updatePassword = $conn->prepare('UPDATE users SET password = ? WHERE id = ?');
$deleteToken = $conn->prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?');
if (!$updatePassword || !$deleteToken) {
    error_log('Password reset update statement prepare failed: ' . $conn->error);
    $conn->rollback();
    respond(500, ['status' => 'error', 'message' => 'Unable to reset the password.']);
}

$updatePassword->bind_param('si', $hashedPassword, $userId);
$updated = $updatePassword->execute();
$updatePassword->close();

if ($updated) {
    $deleteToken->bind_param('s', $tokenHash);
    $updated = $deleteToken->execute();
}
$deleteToken->close();

if (!$updated || !$conn->commit()) {
    error_log('Password reset transaction failed: ' . $conn->error);
    $conn->rollback();
    respond(500, ['status' => 'error', 'message' => 'Unable to reset the password.']);
}

respond(200, ['status' => 'success', 'message' => 'Your password has been reset. You can now sign in with your new password.']);

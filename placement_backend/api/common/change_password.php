<?php
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function changePasswordResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    changePasswordResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    changePasswordResponse(['success' => false, 'message' => 'Authentication is required.'], 401);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    changePasswordResponse(['success' => false, 'message' => 'Invalid request payload.'], 400);
}

$currentPassword = (string) ($input['current_password'] ?? '');
$newPassword = (string) ($input['new_password'] ?? '');
$confirmPassword = (string) ($input['confirm_password'] ?? '');
if ($currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
    changePasswordResponse(['success' => false, 'message' => 'Complete all password fields.'], 400);
}
if (strlen($newPassword) < 8) {
    changePasswordResponse(['success' => false, 'message' => 'New password must be at least 8 characters long.'], 400);
}
if (strlen($newPassword) > 4096) {
    changePasswordResponse(['success' => false, 'message' => 'New password is too long.'], 400);
}
if (!hash_equals($newPassword, $confirmPassword)) {
    changePasswordResponse(['success' => false, 'message' => 'New password and confirmation do not match.'], 400);
}
if (hash_equals($currentPassword, $newPassword)) {
    changePasswordResponse(['success' => false, 'message' => 'Choose a password different from your current password.'], 400);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    changePasswordResponse(['success' => false, 'message' => 'Database connection failed.'], 500);
}

$statement = $db->prepare('SELECT password, id_number, role FROM users WHERE id = ? LIMIT 1');
if (!$statement) {
    error_log('Unable to prepare current password lookup: ' . $db->error);
    changePasswordResponse(['success' => false, 'message' => 'Unable to change password.'], 500);
}
$statement->bind_param('i', $userId);
if (!$statement->execute()) {
    error_log('Unable to load current password: ' . $statement->error);
    $statement->close();
    changePasswordResponse(['success' => false, 'message' => 'Unable to change password.'], 500);
}
$account = $statement->get_result()->fetch_assoc();
$statement->close();

if (!$account) {
    $db->close();
    changePasswordResponse(['success' => false, 'message' => 'User account was not found.'], 404);
}

$currentPasswordValid = password_verify($currentPassword, (string) $account['password']);
$legacyStudentPasswordValid = strtolower((string) $account['role']) === 'student'
    && trim((string) ($account['id_number'] ?? '')) !== ''
    && hash_equals(trim((string) $account['id_number']), $currentPassword);

if (!$currentPasswordValid && !$legacyStudentPasswordValid) {
    $db->close();
    changePasswordResponse(['success' => false, 'message' => 'Current password is incorrect.'], 400);
}

$passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
if ($passwordHash === false) {
    $db->close();
    error_log('Unable to hash replacement account password.');
    changePasswordResponse(['success' => false, 'message' => 'Unable to change password.'], 500);
}

$update = $db->prepare('UPDATE users SET password = ? WHERE id = ?');
if (!$update) {
    error_log('Unable to prepare account password update: ' . $db->error);
    $db->close();
    changePasswordResponse(['success' => false, 'message' => 'Unable to change password.'], 500);
}
$update->bind_param('si', $passwordHash, $userId);
if (!$update->execute() || $update->affected_rows !== 1) {
    error_log('Unable to update account password: ' . $update->error);
    $update->close();
    $db->close();
    changePasswordResponse(['success' => false, 'message' => 'Unable to change password.'], 500);
}

$update->close();
$db->close();
changePasswordResponse(['success' => true, 'message' => 'Password changed successfully.']);

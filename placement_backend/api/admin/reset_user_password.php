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

function adminResetPasswordResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    adminResetPasswordResponse(['success' => false, 'message' => 'Method not allowed.'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$userId = filter_var(is_array($input) ? ($input['id'] ?? null) : null, FILTER_VALIDATE_INT);
if ($userId === false || $userId === null || $userId < 1) {
    adminResetPasswordResponse(['success' => false, 'message' => 'A valid user ID is required.'], 400);
}

try {
    require_once __DIR__ . '/../../config/db_config.php';
    $db = getDbConnection();

    $lookup = $db->prepare('SELECT id_number FROM users WHERE id = ? LIMIT 1');
    if (!$lookup) {
        throw new RuntimeException('Unable to prepare user lookup.');
    }
    $lookup->bind_param('i', $userId);
    $lookup->execute();
    $user = $lookup->get_result()->fetch_assoc();
    $lookup->close();

    $idNumber = trim((string) ($user['id_number'] ?? ''));
    if (!$user || $idNumber === '') {
        adminResetPasswordResponse(['success' => false, 'message' => 'User or default ID number not found.'], 404);
    }

    $passwordHash = password_hash($idNumber, PASSWORD_DEFAULT);
    if ($passwordHash === false) {
        throw new RuntimeException('Unable to hash default password.');
    }

    $update = $db->prepare('UPDATE users SET password = ? WHERE id = ?');
    if (!$update) {
        throw new RuntimeException('Unable to prepare password update.');
    }
    $update->bind_param('si', $passwordHash, $userId);
    if (!$update->execute()) {
        $update->close();
        throw new RuntimeException('Unable to reset the user password.');
    }
    $update->close();

    adminResetPasswordResponse([
        'success' => true,
        'message' => 'Password reset to default ID number successfully.',
    ]);
} catch (Throwable $error) {
    error_log('Admin password reset failed: ' . $error->getMessage());
    adminResetPasswordResponse(['success' => false, 'message' => 'Unable to reset the user password.'], 500);
}

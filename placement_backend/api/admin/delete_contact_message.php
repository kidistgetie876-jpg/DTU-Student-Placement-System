<?php
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';

function deleteContactMessageResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    deleteContactMessageResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    deleteContactMessageResponse(['success' => false, 'message' => 'You must be logged in to delete contact messages.'], 401);
}

$rawInput = file_get_contents('php://input');
$input = is_string($rawInput) ? json_decode($rawInput, true) : null;
$messageId = is_array($input) ? filter_var($input['id'] ?? null, FILTER_VALIDATE_INT) : false;
if ($messageId === false || $messageId === null || $messageId <= 0) {
    deleteContactMessageResponse(['success' => false, 'message' => 'A valid contact message ID is required.'], 400);
}

try {
    $pdo = getAuditPdo();
    $actor = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
    $actor->execute([':id' => $userId]);
    $user = $actor->fetch() ?: [];
    if (strtolower(trim((string) ($user['role'] ?? ''))) !== 'admin') {
        deleteContactMessageResponse(['success' => false, 'message' => 'Only System Administrators may delete contact messages.'], 403);
    }

    $statement = $pdo->prepare('DELETE FROM contact_messages WHERE id = :id');
    $statement->execute([':id' => $messageId]);
    if ($statement->rowCount() !== 1) {
        deleteContactMessageResponse(['success' => false, 'message' => 'Contact message not found.'], 404);
    }

    deleteContactMessageResponse(['success' => true, 'message' => 'Contact message deleted.']);
} catch (Throwable $error) {
    error_log('Contact message deletion failed: ' . $error->getMessage());
    deleteContactMessageResponse(['success' => false, 'message' => 'Unable to delete the contact message.'], 500);
}

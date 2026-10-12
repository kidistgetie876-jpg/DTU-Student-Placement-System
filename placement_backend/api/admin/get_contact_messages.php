<?php
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';

function contactMessagesResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    contactMessagesResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    contactMessagesResponse(['success' => false, 'message' => 'You must be logged in to view contact messages.'], 401);
}

try {
    $pdo = getAuditPdo();
    $actor = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
    $actor->execute([':id' => $userId]);
    $role = strtolower(trim((string) ($actor->fetchColumn() ?: '')));
    if (!in_array($role, ['admin', 'registrar'], true)) {
        contactMessagesResponse(['success' => false, 'message' => 'Only administrators and registrars can view contact messages.'], 403);
    }

    $statement = $pdo->query(
        "SELECT id, name AS full_name, email, subject, message,
                CASE WHEN LOWER(status) = 'read' THEN 'read' ELSE 'unread' END AS status,
                created_at
         FROM contact_messages
         ORDER BY created_at DESC, id DESC"
    );
    contactMessagesResponse(['success' => true, 'messages' => $statement->fetchAll()]);
} catch (Throwable $error) {
    error_log('Contact messages load failed: ' . $error->getMessage());
    contactMessagesResponse(['success' => false, 'message' => 'Unable to load contact messages.'], 500);
}

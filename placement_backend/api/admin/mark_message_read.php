<?php
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';

function markContactMessageResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    markContactMessageResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    markContactMessageResponse(['success' => false, 'message' => 'You must be logged in to update contact messages.'], 401);
}

$input = json_decode(file_get_contents('php://input'), true);
$messageId = is_array($input) ? filter_var($input['id'] ?? null, FILTER_VALIDATE_INT) : false;
if ($messageId === false || $messageId === null || $messageId <= 0) {
    markContactMessageResponse(['success' => false, 'message' => 'A valid message ID is required.'], 400);
}

try {
    $pdo = getAuditPdo();
    $actor = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
    $actor->execute([':id' => $userId]);
    $user = $actor->fetch() ?: [];
    if (strtolower(trim((string) ($user['role'] ?? ''))) !== 'admin') {
        markContactMessageResponse(['success' => false, 'message' => 'Only System Administrators may update contact messages.'], 403);
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS contact_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL DEFAULT '',
            subject VARCHAR(255) NOT NULL DEFAULT '',
            message TEXT NOT NULL,
            recipient_role ENUM('all', 'registrar', 'admin', 'head', 'student') NOT NULL DEFAULT 'all',
            target_type ENUM('all', 'individual') NOT NULL DEFAULT 'all',
            specific_recipient VARCHAR(255) NULL,
            student_id VARCHAR(100) NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'unread',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $schemaColumns = [
        'recipient_role' => "ENUM('all', 'registrar', 'admin', 'head', 'student') NOT NULL DEFAULT 'all' AFTER message",
        'target_type' => "ENUM('all', 'individual') NOT NULL DEFAULT 'all' AFTER recipient_role",
        'specific_recipient' => 'VARCHAR(255) NULL AFTER target_type',
        'student_id' => 'VARCHAR(100) NULL AFTER specific_recipient',
        'status' => "VARCHAR(20) NOT NULL DEFAULT 'unread' AFTER student_id",
    ];
    foreach ($schemaColumns as $columnName => $definition) {
        $column = $pdo->query("SHOW COLUMNS FROM contact_messages LIKE '{$columnName}'");
        if (!$column) {
            throw new RuntimeException('Unable to verify contact message storage.');
        }
        $columnDefinition = $column->fetch();
        if (!$columnDefinition) {
            $pdo->exec("ALTER TABLE contact_messages ADD COLUMN {$columnName} {$definition}");
        } elseif ($columnName === 'recipient_role') {
            if (strpos((string) ($columnDefinition['Type'] ?? ''), "'student'") === false) {
                $pdo->exec(
                    "ALTER TABLE contact_messages
                     MODIFY COLUMN recipient_role ENUM('all', 'registrar', 'admin', 'head', 'student') NOT NULL DEFAULT 'all'"
                );
            }
        }
    }
    $statement = $pdo->prepare("UPDATE contact_messages SET status = 'read' WHERE id = :id");
    $statement->execute([':id' => $messageId]);
    if ($statement->rowCount() === 0) {
        $exists = $pdo->prepare('SELECT id FROM contact_messages WHERE id = :id LIMIT 1');
        $exists->execute([':id' => $messageId]);
        if (!$exists->fetchColumn()) {
            markContactMessageResponse(['success' => false, 'message' => 'Contact message not found.'], 404);
        }
    }

    markContactMessageResponse(['success' => true, 'message' => 'Message marked as read.']);
} catch (Throwable $error) {
    error_log('Contact message status update failed: ' . $error->getMessage());
    markContactMessageResponse(['success' => false, 'message' => 'Unable to mark the message as read.'], 500);
}

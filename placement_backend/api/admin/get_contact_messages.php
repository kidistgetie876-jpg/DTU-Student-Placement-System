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
    $user = $actor->fetch() ?: [];
    if (strtolower(trim((string) ($user['role'] ?? ''))) !== 'admin') {
        contactMessagesResponse(['success' => false, 'message' => 'Only System Administrators may view contact messages.'], 403);
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

    $recipientColumn = $pdo->query("SHOW COLUMNS FROM contact_messages LIKE 'recipient_role'");
    if (!$recipientColumn) {
        throw new RuntimeException('Unable to verify contact message recipient storage.');
    }
    $recipientDefinition = $recipientColumn->fetch();
    if (!$recipientDefinition) {
        $pdo->exec(
            "ALTER TABLE contact_messages
             ADD COLUMN recipient_role ENUM('all', 'registrar', 'admin', 'head', 'student') NOT NULL DEFAULT 'all'
             AFTER message"
        );
    } elseif (strpos((string) $recipientDefinition['Type'], "'student'") === false) {
        $pdo->exec(
            "ALTER TABLE contact_messages
             MODIFY COLUMN recipient_role ENUM('all', 'registrar', 'admin', 'head', 'student') NOT NULL DEFAULT 'all'"
        );
    }

    $routingColumns = [
        'target_type' => "ENUM('all', 'individual') NOT NULL DEFAULT 'all' AFTER recipient_role",
        'specific_recipient' => 'VARCHAR(255) NULL AFTER target_type',
        'student_id' => 'VARCHAR(100) NULL AFTER specific_recipient',
        'status' => "VARCHAR(20) NOT NULL DEFAULT 'unread' AFTER student_id",
        'admin_reply' => 'TEXT NULL AFTER status',
    ];
    foreach ($routingColumns as $columnName => $definition) {
        $columnResult = $pdo->query("SHOW COLUMNS FROM contact_messages LIKE '{$columnName}'");
        if (!$columnResult) {
            throw new RuntimeException('Unable to verify contact message routing storage.');
        }
        if (!$columnResult->fetch()) {
            $pdo->exec("ALTER TABLE contact_messages ADD COLUMN {$columnName} {$definition}");
        }
    }

    $statement = $pdo->prepare(
        "SELECT id, name AS full_name, email, subject, message, admin_reply,
                CASE
                    WHEN LOWER(status) = 'replied' THEN 'replied'
                    WHEN LOWER(status) = 'read' THEN 'read'
                    ELSE 'unread'
                END AS status,
                student_id, created_at
         FROM contact_messages
         ORDER BY created_at DESC, id DESC"
    );
    $statement->execute();
    contactMessagesResponse(['success' => true, 'messages' => $statement->fetchAll()]);
} catch (Throwable $error) {
    error_log('Contact messages load failed: ' . $error->getMessage());
    contactMessagesResponse(['success' => false, 'message' => 'Unable to load contact messages.'], 500);
}

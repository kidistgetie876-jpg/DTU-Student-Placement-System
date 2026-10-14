<?php
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

$db = getDbConnection();

function submitContactResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function cleanContactValue($value): string
{
    if (!is_string($value) && !is_numeric($value)) {
        return '';
    }

    return trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string) $value) ?? '');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    submitContactResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (!($db instanceof mysqli)) {
    error_log('Contact message submission failed: database connection unavailable.');
    submitContactResponse(['success' => false, 'message' => 'Unable to send your message right now. Please try again later.'], 500);
}

$rawInput = file_get_contents('php://input');
$input = is_string($rawInput) ? json_decode($rawInput, true) : null;
if (!is_array($input)) {
    submitContactResponse(['success' => false, 'message' => 'Please fill in all required fields with a valid email address.'], 400);
}

$name = cleanContactValue($input['full_name'] ?? $input['name'] ?? null);
$email = cleanContactValue($input['email'] ?? null);
$subject = cleanContactValue($input['subject'] ?? null);
$message = cleanContactValue($input['message'] ?? null);
$recipientRole = 'registrar';
$targetType = 'all';
$specificRecipient = '';
$studentId = '';

if (
    $name === ''
    || $email === ''
    || !filter_var($email, FILTER_VALIDATE_EMAIL)
    || $subject === ''
    || $message === ''
) {
    submitContactResponse(['success' => false, 'message' => 'Please provide your name, a valid email address, a subject, and a message.'], 400);
}
if (
    mb_strlen($name) > 255
    || mb_strlen($email) > 255
    || mb_strlen($subject) > 255
    || mb_strlen($message) > 10000
    || mb_strlen($specificRecipient) > 255
    || mb_strlen($studentId) > 100
) {
    submitContactResponse(['success' => false, 'message' => 'Contact details are too long.'], 400);
}

try {
    $createTable = $db->query(
        "CREATE TABLE IF NOT EXISTS contact_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
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
    if (!$createTable) {
        throw new Exception('Unable to prepare contact message storage.');
    }

    $statusColumn = $db->query("SHOW COLUMNS FROM contact_messages LIKE 'status'");
    if (!$statusColumn) {
        throw new Exception('Unable to verify contact message status storage: ' . $db->error);
    }
    if ($statusColumn->num_rows === 0 && !$db->query(
        "ALTER TABLE contact_messages ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'unread' AFTER message"
    )) {
        throw new Exception('Unable to add contact message status storage: ' . $db->error);
    }

    $recipientColumn = $db->query("SHOW COLUMNS FROM contact_messages LIKE 'recipient_role'");
    if (!$recipientColumn) {
        throw new Exception('Unable to verify contact message recipient storage: ' . $db->error);
    }
    if ($recipientColumn->num_rows === 0) {
        if (!$db->query(
            "ALTER TABLE contact_messages
             ADD COLUMN recipient_role ENUM('all', 'registrar', 'admin', 'head', 'student') NOT NULL DEFAULT 'all'
             AFTER message"
        )) {
            throw new Exception('Unable to add contact message recipient storage: ' . $db->error);
        }
    } else {
        $column = $recipientColumn->fetch_assoc();
        if (strpos((string) ($column['Type'] ?? ''), "'student'") === false && !$db->query(
            "ALTER TABLE contact_messages
             MODIFY COLUMN recipient_role ENUM('all', 'registrar', 'admin', 'head', 'student') NOT NULL DEFAULT 'all'"
        )) {
            throw new Exception('Unable to enable student message recipients: ' . $db->error);
        }
    }

    $routingColumns = [
        'target_type' => "ENUM('all', 'individual') NOT NULL DEFAULT 'all' AFTER recipient_role",
        'specific_recipient' => 'VARCHAR(255) NULL AFTER target_type',
        'student_id' => 'VARCHAR(100) NULL AFTER specific_recipient',
    ];
    foreach ($routingColumns as $columnName => $definition) {
        $columnResult = $db->query("SHOW COLUMNS FROM contact_messages LIKE '{$columnName}'");
        if (!$columnResult) {
            throw new Exception('Unable to verify contact message routing storage: ' . $db->error);
        }
        if ($columnResult->num_rows === 0 && !$db->query(
            "ALTER TABLE contact_messages ADD COLUMN {$columnName} {$definition}"
        )) {
            throw new Exception('Unable to add contact message routing storage: ' . $db->error);
        }
    }

    $statement = $db->prepare(
        "INSERT INTO contact_messages
            (name, email, subject, message, recipient_role, target_type, specific_recipient, student_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), 'unread', NOW())"
    );
    if (!$statement) {
        throw new Exception('Unable to prepare contact message.');
    }
    $statement->bind_param('ssssssss', $name, $email, $subject, $message, $recipientRole, $targetType, $specificRecipient, $studentId);
    if (!$statement->execute()) {
        $statement->close();
        throw new Exception('Unable to save contact message.');
    }

    $messageId = $statement->insert_id;
    $statement->close();
    submitContactResponse(['success' => true, 'message' => 'Your message was sent to the Registrar and Administrator.', 'message_id' => $messageId]);
} catch (Throwable $error) {
    error_log('Contact message submission failed: ' . $error->getMessage());
    submitContactResponse(['success' => false, 'message' => 'Unable to send your message right now. Please try again later.'], 500);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>

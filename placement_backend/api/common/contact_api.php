<?php
include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

$db = getDbConnection();

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$name = trim((string) ($input['name'] ?? ''));
$email = trim((string) ($input['email'] ?? ''));
$subject = trim((string) ($input['subject'] ?? ''));
$message = trim((string) ($input['message'] ?? ''));

if ($name === '' || $email === '' || $message === '') {
    respond(['success' => false, 'message' => 'Name, email, and message are required.'], 400);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(['success' => false, 'message' => 'Please enter a valid email address.'], 400);
}
if (mb_strlen($name) > 255 || mb_strlen($email) > 255 || mb_strlen($subject) > 255) {
    respond(['success' => false, 'message' => 'Contact details are too long.'], 400);
}

try {
    $createTable = $db->query(
        "CREATE TABLE IF NOT EXISTS contact_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            subject VARCHAR(255) NOT NULL DEFAULT '',
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    if (!$createTable) {
        throw new Exception('Unable to prepare contact message storage.');
    }

    $statement = $db->prepare('INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)');
    if (!$statement) {
        throw new Exception('Unable to prepare contact message.');
    }
    $statement->bind_param('ssss', $name, $email, $subject, $message);
    if (!$statement->execute()) {
        $statement->close();
        throw new Exception('Unable to save contact message.');
    }

    $messageId = $statement->insert_id;
    $statement->close();
    respond(['success' => true, 'message' => 'Your message was sent to the Placement Office.', 'message_id' => $messageId]);
} catch (Throwable $error) {
    respond(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    $db->close();
}
?>
<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';
require_once dirname(__DIR__, 3) . '/vendor/autoload.php';

function contactReplyResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function contactReplyGetDatabase(): PDO
{
    $pdo = getAuditPdo();
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    global $db_host, $db_name, $db_user, $db_pass;
    $configuredPort = getenv('DB_PORT') ?: getenv('MYSQLPORT') ?: getenv('MYSQL_PORT');
    $isHosted = strtolower((string) (getenv('RENDER') ?: '')) === 'true';
    $ports = $configuredPort !== false && $configuredPort !== ''
        ? [(int) $configuredPort]
        : ($isHosted ? [3306] : [8889, 3306]);
    $lastError = 'No database port is configured.';

    foreach ($ports as $port) {
        try {
            return new PDO(
                "mysql:host={$db_host};dbname={$db_name};port={$port};charset=utf8mb4",
                $db_user,
                $db_pass,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
        } catch (Throwable $error) {
            $lastError = $error->getMessage();
        }
    }

    throw new RuntimeException('Contact reply database connection failed: ' . $lastError);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    contactReplyResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    contactReplyResponse(['success' => false, 'message' => 'You must be logged in to reply to contact messages.'], 401);
}

$rawInput = file_get_contents('php://input');
$input = is_string($rawInput) ? json_decode($rawInput, true) : null;
if (!is_array($input)) {
    contactReplyResponse(['success' => false, 'message' => 'Request body must be valid JSON.'], 400);
}

$messageId = filter_var($input['message_id'] ?? null, FILTER_VALIDATE_INT);
$recipientEmail = $input['recipient_email'] ?? null;
$replyText = $input['reply_text'] ?? null;
if ($messageId === false || $messageId === null || $messageId <= 0) {
    contactReplyResponse(['success' => false, 'message' => 'A valid message ID is required.'], 400);
}
if (!is_string($recipientEmail) || !filter_var(trim($recipientEmail), FILTER_VALIDATE_EMAIL)) {
    contactReplyResponse(['success' => false, 'message' => 'A valid recipient email is required.'], 400);
}
if (!is_string($replyText) || trim($replyText) === '' || strlen($replyText) > 10000) {
    contactReplyResponse(['success' => false, 'message' => 'Write a reply of no more than 10,000 characters.'], 400);
}

try {
    $pdo = contactReplyGetDatabase();
    $actor = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
    $actor->execute([':id' => $userId]);
    $user = $actor->fetch() ?: [];
    if (strtolower(trim((string) ($user['role'] ?? ''))) !== 'admin') {
        contactReplyResponse(['success' => false, 'message' => 'Only System Administrators may reply to contact messages.'], 403);
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS contact_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL DEFAULT '',
            subject VARCHAR(255) NOT NULL DEFAULT '',
            message TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'unread',
            admin_reply TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $statusColumn = $pdo->query("SHOW COLUMNS FROM contact_messages LIKE 'status'");
    if (!$statusColumn || !$statusColumn->fetch()) {
        $pdo->exec("ALTER TABLE contact_messages ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'unread'");
    }
    $replyColumn = $pdo->query("SHOW COLUMNS FROM contact_messages LIKE 'admin_reply'");
    if (!$replyColumn || !$replyColumn->fetch()) {
        $pdo->exec('ALTER TABLE contact_messages ADD COLUMN admin_reply TEXT NULL AFTER status');
    }

    $messageStatement = $pdo->prepare(
        'SELECT email, subject FROM contact_messages WHERE id = :id LIMIT 1'
    );
    $messageStatement->execute([':id' => $messageId]);
    $contactMessage = $messageStatement->fetch();
    if (!$contactMessage) {
        contactReplyResponse(['success' => false, 'message' => 'Contact message not found.'], 404);
    }

    $student_email = trim((string) ($contactMessage['email'] ?? ''));
    if (
        !filter_var($student_email, FILTER_VALIDATE_EMAIL)
        || strtolower($student_email) !== strtolower(trim($recipientEmail))
    ) {
        contactReplyResponse(['success' => false, 'message' => 'The recipient does not match this contact message.'], 400);
    }

    $statusStatement = $pdo->prepare(
        "UPDATE contact_messages
         SET status = 'Replied', admin_reply = :reply_text
         WHERE id = :id"
    );
    $statusStatement->execute([
        ':reply_text' => trim($replyText),
        ':id' => $messageId,
    ]);

    $smtpUsername = getenv('SMTP_USERNAME') ?: 'kidistgetie876@gmail.com';
    $smtpPassword = getenv('SMTP_PASSWORD') ?: 'kkkd lsvb klna rmtd';
    $emailSent = false;
    if (is_string($smtpUsername) && $smtpUsername !== '' && is_string($smtpPassword) && $smtpPassword !== '') {
        try {
            $mail = new PHPMailer(true);
            $mail->isSMTP();
            $mail->Host = 'smtp.gmail.com';
            $mail->SMTPAuth = true;
            $mail->Username = $smtpUsername;
            $mail->Password = $smtpPassword;
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port = 587;
            $mail->CharSet = 'UTF-8';
            $mail->setFrom($smtpUsername, 'DTU Placement Portal');
            $mail->addAddress($student_email);
            $mail->isHTML(false);
            $subject = trim((string) ($contactMessage['subject'] ?? ''));
            $mail->Subject = 'Re: ' . ($subject !== '' ? $subject : 'Your contact message');
            $mail->Body = trim($replyText);
            $mail->send();
            $emailSent = true;
        } catch (PHPMailerException $emailError) {
            error_log('Contact message reply email failed; database reply was saved: ' . $emailError->getMessage());
        } catch (Throwable $emailError) {
            error_log('Contact message reply email failed unexpectedly; database reply was saved: ' . $emailError->getMessage());
        }
    } else {
        error_log('Contact message reply email skipped: SMTP credentials are not configured; database reply was saved.');
    }

    contactReplyResponse([
        'success' => true,
        'email_sent' => $emailSent,
        'message' => $emailSent
            ? 'Email sent and reply recorded.'
            : 'Reply saved, but email delivery failed. Check Gmail SMTP configuration and server logs.',
    ]);
} catch (Throwable $error) {
    error_log('Contact message reply failed: ' . $error->getMessage());
    contactReplyResponse(['success' => false, 'message' => 'Unable to save the reply. Please try again later.'], 500);
}

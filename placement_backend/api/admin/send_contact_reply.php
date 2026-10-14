<?php
use PHPMailer\PHPMailer\PHPMailer;

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
    $pdo = getAuditPdo();
    $actor = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
    $actor->execute([':id' => $userId]);
    $user = $actor->fetch() ?: [];
    if (strtolower(trim((string) ($user['role'] ?? ''))) !== 'admin') {
        contactReplyResponse(['success' => false, 'message' => 'Only System Administrators may reply to contact messages.'], 403);
    }

    $messageStatement = $pdo->prepare(
        'SELECT email, subject FROM contact_messages WHERE id = :id LIMIT 1'
    );
    $messageStatement->execute([':id' => $messageId]);
    $contactMessage = $messageStatement->fetch();
    if (!$contactMessage) {
        contactReplyResponse(['success' => false, 'message' => 'Contact message not found.'], 404);
    }

    $storedEmail = trim((string) ($contactMessage['email'] ?? ''));
    if (
        !filter_var($storedEmail, FILTER_VALIDATE_EMAIL)
        || strtolower($storedEmail) !== strtolower(trim($recipientEmail))
    ) {
        contactReplyResponse(['success' => false, 'message' => 'The recipient does not match this contact message.'], 400);
    }

    $smtpUsername = getenv('SMTP_USERNAME');
    $smtpPassword = getenv('SMTP_PASSWORD');
    if (!is_string($smtpUsername) || $smtpUsername === '' || !is_string($smtpPassword) || $smtpPassword === '') {
        throw new RuntimeException('Contact reply SMTP credentials are not configured.');
    }

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
    $mail->addAddress($storedEmail);
    $mail->isHTML(false);
    $subject = trim((string) ($contactMessage['subject'] ?? ''));
    $mail->Subject = 'Re: ' . ($subject !== '' ? $subject : 'Your contact message');
    $mail->Body = trim($replyText);
    $mail->send();

    $statusStatement = $pdo->prepare("UPDATE contact_messages SET status = 'replied' WHERE id = :id");
    $statusStatement->execute([':id' => $messageId]);

    contactReplyResponse(['success' => true, 'message' => 'Reply sent successfully!']);
} catch (Throwable $error) {
    error_log('Contact message reply failed: ' . $error->getMessage());
    contactReplyResponse(['success' => false, 'message' => 'Unable to send the reply. Please try again later.'], 500);
}

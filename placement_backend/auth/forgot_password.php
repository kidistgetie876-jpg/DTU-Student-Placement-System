<?php
header('Content-Type: application/json');

include __DIR__ . '/../config/db_config.php';
$conn = getDbConnection();

function respond(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['status' => 'error', 'message' => 'Method not allowed.']);
}

$data = json_decode(file_get_contents('php://input'), true);
$email = trim((string) ($data['email'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(400, ['status' => 'error', 'message' => 'Enter a valid email address.']);
}

$frontendUrl = trim((string) getenv('DTU_FRONTEND_URL'));
if ($frontendUrl === '') {
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    if (preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#i', $origin)) {
        $frontendUrl = $origin;
    }
}

$frontendParts = parse_url($frontendUrl);
$mailFrom = trim((string) getenv('DTU_MAIL_FROM'));
if (
    $frontendUrl === ''
    || filter_var($frontendUrl, FILTER_VALIDATE_URL) === false
    || !in_array(strtolower((string) ($frontendParts['scheme'] ?? '')), ['http', 'https'], true)
    || isset($frontendParts['query'])
    || isset($frontendParts['fragment'])
    || !filter_var($mailFrom, FILTER_VALIDATE_EMAIL)
) {
    error_log('Password reset email is not configured. Set DTU_FRONTEND_URL and DTU_MAIL_FROM.');
    respond(500, ['status' => 'error', 'message' => 'Password reset email is not configured. Please contact the system administrator.']);
}

$lookup = $conn->prepare('SELECT id, email FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1');
if (!$lookup) {
    error_log('Password reset user lookup prepare failed: ' . $conn->error);
    respond(500, ['status' => 'error', 'message' => 'Unable to process the request.']);
}
$lookup->bind_param('s', $email);
if (!$lookup->execute()) {
    error_log('Password reset user lookup failed: ' . $lookup->error);
    respond(500, ['status' => 'error', 'message' => 'Unable to process the request.']);
}
$result = $lookup->get_result();
$user = $result ? $result->fetch_assoc() : null;
$lookup->close();

$genericMessage = 'If an account exists for that email, a password reset link has been sent.';
if (!$user) {
    respond(200, ['status' => 'success', 'message' => $genericMessage]);
}

$token = bin2hex(random_bytes(32));
$tokenHash = hash('sha256', $token);
$userId = (int) $user['id'];

$conn->begin_transaction();
$removeOldTokens = $conn->prepare('DELETE FROM password_reset_tokens WHERE user_id = ?');
$saveToken = $conn->prepare(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))'
);

if (!$removeOldTokens || !$saveToken) {
    error_log('Password reset token statement prepare failed: ' . $conn->error);
    $conn->rollback();
    respond(500, ['status' => 'error', 'message' => 'Unable to process the request.']);
}

$removeOldTokens->bind_param('i', $userId);
$saved = $removeOldTokens->execute();
$removeOldTokens->close();
if ($saved) {
    $saveToken->bind_param('is', $userId, $tokenHash);
    $saved = $saveToken->execute();
}
$saveToken->close();

if (!$saved) {
    error_log('Password reset token could not be saved: ' . $conn->error);
    $conn->rollback();
    respond(500, ['status' => 'error', 'message' => 'Unable to process the request.']);
}
$conn->commit();

$resetUrl = rtrim($frontendUrl, '/') . '/reset-password?token=' . rawurlencode($token);
$subject = 'Reset your DTU Placement Portal password';
$message = "Hello,\n\nA password reset was requested for your DTU Placement Portal account. Use the link below to choose a new password:\n\n"
    . $resetUrl
    . "\n\nThis link expires in one hour and can only be used once. If you did not request a password reset, you can ignore this email.\n";
$headers = [
    'From: DTU Placement Portal <' . $mailFrom . '>',
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: PHP/' . PHP_VERSION,
];

if (!mail((string) $user['email'], $subject, $message, implode("\r\n", $headers))) {
    $deleteToken = $conn->prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?');
    if ($deleteToken) {
        $deleteToken->bind_param('s', $tokenHash);
        $deleteToken->execute();
        $deleteToken->close();
    }
    error_log('Password reset email could not be sent for user ID: ' . $userId);
    respond(500, ['status' => 'error', 'message' => 'The reset email could not be sent. Please try again later or contact the system administrator.']);
}

respond(200, ['status' => 'success', 'message' => $genericMessage]);

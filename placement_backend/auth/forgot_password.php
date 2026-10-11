<?php
use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/password_reset_helpers.php';
require_once dirname(__DIR__, 2) . '/vendor/autoload.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    passwordResetResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

$input = json_decode((string) file_get_contents('php://input'), true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($input)) {
    passwordResetResponse(['success' => false, 'message' => 'Request body must be valid JSON.'], 400);
}

$emailInput = $input['email'] ?? null;
if (!is_string($emailInput)) {
    passwordResetResponse(['success' => false, 'message' => 'Enter a valid email address.'], 400);
}

$email = strtolower(trim($emailInput));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    passwordResetResponse(['success' => false, 'message' => 'Enter a valid email address.'], 400);
}

$db = getDbConnection();
$userId = null;
$codeHash = null;
$transactionOpen = false;

try {
    ensurePasswordResetTokensTable($db);

    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start password reset transaction.');
    }
    $transactionOpen = true;

    $userStatement = $db->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1 FOR UPDATE');
    if (!$userStatement) {
        throw new RuntimeException('Unable to prepare password reset account lookup: ' . $db->error);
    }
    $userStatement->bind_param('s', $email);
    if (!$userStatement->execute()) {
        throw new RuntimeException('Unable to look up password reset account: ' . $userStatement->error);
    }
    $user = $userStatement->get_result()->fetch_assoc();
    $userStatement->close();

    if (!$user) {
        if (!$db->commit()) {
            throw new RuntimeException('Unable to complete password reset lookup: ' . $db->error);
        }
        $transactionOpen = false;
        passwordResetResponse([
            'success' => true,
            'message' => 'If an account uses that email, a verification code will arrive shortly.'
        ]);
    }

    $userId = (int) $user['id'];
    $existingStatement = $db->prepare(
        'SELECT created_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) AS in_cooldown
         FROM password_reset_tokens
         WHERE user_id = ?
         LIMIT 1
         FOR UPDATE'
    );
    if (!$existingStatement) {
        throw new RuntimeException('Unable to prepare password reset cooldown lookup: ' . $db->error);
    }
    $existingStatement->bind_param('i', $userId);
    if (!$existingStatement->execute()) {
        throw new RuntimeException('Unable to check password reset cooldown: ' . $existingStatement->error);
    }
    $existingToken = $existingStatement->get_result()->fetch_assoc();
    $existingStatement->close();

    if ($existingToken && (int) $existingToken['in_cooldown'] === 1) {
        if (!$db->commit()) {
            throw new RuntimeException('Unable to complete password reset cooldown check: ' . $db->error);
        }
        $transactionOpen = false;
        passwordResetResponse([
            'success' => true,
            'message' => 'If an account uses that email, a verification code will arrive shortly.'
        ]);
    }

    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $codeHash = password_hash($code, PASSWORD_DEFAULT);
    if ($codeHash === false) {
        throw new RuntimeException('Unable to hash password reset code.');
    }

    $storeStatement = $db->prepare(
        'INSERT INTO password_reset_tokens (user_id, code_hash, expires_at, attempts, created_at)
         VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE), 0, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at),
                                 attempts = 0, created_at = CURRENT_TIMESTAMP'
    );
    if (!$storeStatement) {
        throw new RuntimeException('Unable to prepare password reset code storage: ' . $db->error);
    }
    $storeStatement->bind_param('is', $userId, $codeHash);
    if (!$storeStatement->execute()) {
        throw new RuntimeException('Unable to store password reset code: ' . $storeStatement->error);
    }
    $storeStatement->close();

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit password reset code: ' . $db->error);
    }
    $transactionOpen = false;

    $smtpUsername = getenv('SMTP_USERNAME');
    $smtpPassword = getenv('SMTP_PASSWORD');
    if (!is_string($smtpUsername) || $smtpUsername === '' ||
        !is_string($smtpPassword) || $smtpPassword === '') {
        throw new RuntimeException('Password reset SMTP credentials are not configured.');
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
    $mail->addAddress($email);
    $mail->isHTML(false);
    $mail->Subject = 'Your DTU placement portal password reset code';
    $mail->Body = "Your password reset code is: {$code}\n\n"
        . "This code expires in 10 minutes and can only be used once.\n"
        . "If you did not request a password reset, you can ignore this email.";
    $mail->send();

    passwordResetResponse([
        'success' => true,
        'message' => 'If an account uses that email, a verification code will arrive shortly.'
    ]);
} catch (Throwable $error) {
    if ($transactionOpen) {
        $db->rollback();
    }

    if ($userId !== null && $codeHash !== null) {
        $cleanupStatement = $db->prepare(
            'DELETE FROM password_reset_tokens WHERE user_id = ? AND code_hash = ?'
        );
        if ($cleanupStatement) {
            $cleanupStatement->bind_param('is', $userId, $codeHash);
            if (!$cleanupStatement->execute()) {
                error_log('Password reset token cleanup failed.');
            }
            $cleanupStatement->close();
        } else {
            error_log('Password reset token cleanup could not be prepared.');
        }
    }

    if ($error instanceof Exception) {
        error_log('Password reset email delivery failed.');
    } else {
        error_log('Password reset request failed: ' . $error->getMessage());
    }
    passwordResetResponse(['success' => false, 'message' => 'Unable to process the password reset request right now.'], 500);
} finally {
    $db->close();
}

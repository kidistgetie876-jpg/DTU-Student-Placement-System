<?php
use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
require_once __DIR__ . '/../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/password_reset_helpers.php';

$composerAutoload = dirname(__DIR__, 2) . '/vendor/autoload.php';
if (!is_file($composerAutoload)) {
    passwordResetResponse([
        'status' => 'error',
        'success' => false,
        'message' => 'Password reset email service is unavailable. Install the backend Composer dependencies.'
    ], 503);
}
require_once $composerAutoload;

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

$db = null;
$userId = null;
$codeHash = null;
$transactionOpen = false;
$mail = null;
$phase = 'database';

try {
    $db = getDbConnection();
    if (!($db instanceof mysqli)) {
        throw new RuntimeException('Password reset database connection is unavailable.');
    }

    ensurePasswordResetTokensTable($db);

    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start password reset transaction.');
    }
    $transactionOpen = true;

    $userStatement = $db->prepare(
        'SELECT id, email FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1 FOR UPDATE'
    );
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
        $studentStatement = $db->prepare(
            'SELECT u.id, u.email
             FROM student_data AS sd
             INNER JOIN users AS u ON u.id = sd.user_id
             WHERE LOWER(sd.email) = LOWER(?)
             LIMIT 1
             FOR UPDATE'
        );
        if (!$studentStatement) {
            throw new RuntimeException('Unable to prepare student account lookup: ' . $db->error);
        }
        $studentStatement->bind_param('s', $email);
        if (!$studentStatement->execute()) {
            throw new RuntimeException('Unable to look up student account: ' . $studentStatement->error);
        }
        $user = $studentStatement->get_result()->fetch_assoc();
        $studentStatement->close();
    }

    if (!$user) {
        if (!$db->commit()) {
            throw new RuntimeException('Unable to complete password reset lookup: ' . $db->error);
        }
        $transactionOpen = false;
        passwordResetResponse([
            'status' => 'error',
            'success' => false,
            'message' => 'Email address not found in system'
        ], 404);
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
            'status' => 'success',
            'success' => true,
            'message' => 'Password reset instructions sent to your email.'
        ]);
    }

    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $codeHash = password_hash($code, PASSWORD_DEFAULT);
    if ($codeHash === false) {
        throw new RuntimeException('Unable to hash password reset code.');
    }

    $storeStatement = $db->prepare(
        'INSERT INTO password_reset_tokens (user_id, code_hash, expires_at, attempts, created_at)
         VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE), 0, CURRENT_TIMESTAMP)
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

    // --- Hardcoded Gmail SMTP Credentials ---
    $phase = 'smtp_delivery';
    $smtpUsername = 'kidistgetie876@gmail.com';
    $smtpPassword = 'rwnv wjtw tztt cdet';

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
    $mail->isHTML(true);
    $mail->Subject = 'Your DTU placement portal password reset code';
    $safeCode = htmlspecialchars($code, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $mail->Body = '<!doctype html><html lang="en"><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">'
        . '<div style="max-width:560px;margin:32px auto;padding:32px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">'
        . '<p style="margin:0 0 8px;color:#4f46e5;font-size:13px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;">Debre Tabor University</p>'
        . '<h1 style="margin:0 0 16px;font-size:24px;">Password reset request</h1>'
        . '<p style="font-size:15px;line-height:1.6;">Use this one-time code to reset your Student Placement System password:</p>'
        . '<div style="margin:24px 0;padding:16px;text-align:center;background:#eef2ff;border-radius:12px;color:#3730a3;font-size:32px;font-weight:bold;letter-spacing:8px;">'
        . $safeCode . '</div>'
        . '<p style="font-size:14px;line-height:1.6;">This code expires in 15 minutes and can only be used once. If you did not request a password reset, you can ignore this email.</p>'
        . '<p style="margin:28px 0 0;color:#64748b;font-size:12px;">Debre Tabor University · Student Placement System</p>'
        . '</div></body></html>';
    $mail->AltBody = "Your password reset code is: {$code}\n\n"
        . "This code expires in 15 minutes and can only be used once.\n"
        . "If you did not request a password reset, you can ignore this email.";

    $mail->send();

    passwordResetResponse([
        'status' => 'success',
        'success' => true,
        'message' => 'Password reset instructions sent to your email.'
    ]);
} catch (Throwable $error) {
    try {
        if ($db instanceof mysqli && $transactionOpen) {
            $db->rollback();
        }

        if ($db instanceof mysqli && $userId !== null && $codeHash !== null) {
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
    } catch (Throwable $cleanupError) {
        error_log('Password reset cleanup failed: ' . $cleanupError->getMessage());
    }

    if ($error instanceof Exception) {
        $mailError = $mail instanceof PHPMailer ? trim($mail->ErrorInfo) : '';
        error_log(
            'Password reset email delivery failed at ' . $error->getFile() . ':' . $error->getLine()
            . ': ' . ($mailError !== '' ? $mailError : $error->getMessage())
        );
    } else {
        error_log(
            'Password reset request failed at ' . $error->getFile() . ':' . $error->getLine()
            . ': ' . $error->getMessage()
        );
    }
    $response = [
        'status' => 'error',
        'success' => false,
        'message' => 'Unable to process the password reset request right now.'
    ];
    $status = 503;
    if ($phase === 'smtp_delivery') {
        $status = 503;
        $response['message'] = 'The reset email could not be delivered. Check the server SMTP settings and PHP error log.';
    } elseif ($phase === 'database') {
        $status = 503;
        $response['message'] = 'Password reset is temporarily unavailable because the database could not be reached. Check the database settings and PHP error log.';
    }
    passwordResetResponse($response, $status);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
<?php
require_once __DIR__ . '/../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/password_reset_helpers.php';

header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    passwordResetResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

$input = json_decode((string) file_get_contents('php://input'), true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($input)) {
    passwordResetResponse([
        'status' => 'error',
        'success' => false,
        'message' => 'Request body must be valid JSON.'
    ], 400);
}

$emailInput = $input['email'] ?? null;
$codeInput = $input['code'] ?? null;
$passwordInput = $input['new_password'] ?? $input['newPassword'] ?? null;
if (!is_string($emailInput) || !is_string($codeInput) || !is_string($passwordInput)) {
    passwordResetResponse([
        'status' => 'error',
        'success' => false,
        'message' => 'Email, verification code, and new password are required.'
    ], 400);
}

$email = strtolower(trim($emailInput));
$code = trim($codeInput);
$newPassword = $passwordInput;

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^\d{6}$/', $code)) {
    passwordResetResponse([
        'status' => 'error',
        'success' => false,
        'message' => 'Enter a valid email address and six-digit verification code.'
    ], 400);
}
if (strlen($newPassword) < 6) {
    passwordResetResponse([
        'status' => 'error',
        'success' => false,
        'message' => 'Password must be at least 6 characters long.'
    ], 400);
}

$db = null;
$transactionOpen = false;
try {
    $db = getDbConnection();
    if (!($db instanceof mysqli)) {
        throw new RuntimeException('Password reset database connection is unavailable.');
    }
    ensurePasswordResetTokensTable($db);
    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start password reset transaction: ' . $db->error);
    }
    $transactionOpen = true;

    $userStatement = $db->prepare(
        'SELECT id
         FROM users
         WHERE LOWER(email) = LOWER(?)
         LIMIT 1
         FOR UPDATE'
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
        $db->rollback();
        $transactionOpen = false;
        passwordResetResponse([
            'status' => 'error',
            'success' => false,
            'message' => 'The code is invalid or expired. Request a new code and try again.'
        ], 400);
    }

    $userId = (int) $user['id'];
    $tokenStatement = $db->prepare(
        'SELECT code_hash, expires_at, attempts,
                expires_at > CURRENT_TIMESTAMP AS is_valid
         FROM password_reset_tokens
         WHERE user_id = ?
         FOR UPDATE'
    );
    if (!$tokenStatement) {
        throw new RuntimeException('Unable to prepare password reset code lookup: ' . $db->error);
    }
    $tokenStatement->bind_param('i', $userId);
    if (!$tokenStatement->execute()) {
        throw new RuntimeException('Unable to load password reset code: ' . $tokenStatement->error);
    }
    $token = $tokenStatement->get_result()->fetch_assoc();
    $tokenStatement->close();

    if (!$token || (int) $token['is_valid'] !== 1 || (int) $token['attempts'] >= 5) {
        $deleteStatement = $db->prepare('DELETE FROM password_reset_tokens WHERE user_id = ?');
        if (!$deleteStatement) {
            throw new RuntimeException('Unable to prepare expired reset code cleanup: ' . $db->error);
        }
        $deleteStatement->bind_param('i', $userId);
        if (!$deleteStatement->execute()) {
            throw new RuntimeException('Unable to clear expired reset code: ' . $deleteStatement->error);
        }
        $deleteStatement->close();
        if (!$db->commit()) {
            throw new RuntimeException('Unable to complete expired reset code cleanup: ' . $db->error);
        }
        $transactionOpen = false;
        passwordResetResponse([
            'status' => 'error',
            'success' => false,
            'message' => 'The code is invalid or expired. Request a new code and try again.'
        ], 400);
    }

    if (!password_verify($code, (string) $token['code_hash'])) {
        $attemptStatement = $db->prepare('UPDATE password_reset_tokens SET attempts = attempts + 1 WHERE user_id = ?');
        if (!$attemptStatement) {
            throw new RuntimeException('Unable to prepare password reset attempt update: ' . $db->error);
        }
        $attemptStatement->bind_param('i', $userId);
        if (!$attemptStatement->execute()) {
            throw new RuntimeException('Unable to record password reset attempt: ' . $attemptStatement->error);
        }
        $attemptStatement->close();
        if (!$db->commit()) {
            throw new RuntimeException('Unable to save reset code attempt: ' . $db->error);
        }
        $transactionOpen = false;
        passwordResetResponse([
            'status' => 'error',
            'success' => false,
            'message' => 'The code is invalid or expired. Request a new code and try again.'
        ], 400);
    }

    $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
    if (!is_string($passwordHash) || $passwordHash === '') {
        throw new RuntimeException('Unable to hash the new password.');
    }
    $updateStatement = $db->prepare('UPDATE users SET password = ? WHERE id = ?');
    if (!$updateStatement) {
        throw new RuntimeException('Unable to prepare password update: ' . $db->error);
    }
    $updateStatement->bind_param('si', $passwordHash, $userId);
    if (!$updateStatement->execute() || $updateStatement->affected_rows !== 1) {
        throw new RuntimeException('Unable to update account password: ' . $updateStatement->error);
    }
    $updateStatement->close();

    $deleteStatement = $db->prepare('DELETE FROM password_reset_tokens WHERE user_id = ?');
    if (!$deleteStatement) {
        throw new RuntimeException('Unable to prepare reset code cleanup: ' . $db->error);
    }
    $deleteStatement->bind_param('i', $userId);
    if (!$deleteStatement->execute()) {
        throw new RuntimeException('Unable to invalidate used reset code: ' . $deleteStatement->error);
    }
    $deleteStatement->close();

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit password reset: ' . $db->error);
    }
    $transactionOpen = false;

    passwordResetResponse([
        'status' => 'success',
        'success' => true,
        'message' => 'Password reset successfully'
    ]);
} catch (Throwable $error) {
    error_log('Password reset completion failed: ' . $error->getMessage());
    if ($db instanceof mysqli && $transactionOpen) {
        try {
            $db->rollback();
        } catch (Throwable $rollbackError) {
            error_log('Password reset rollback failed: ' . $rollbackError->getMessage());
        }
    }
    passwordResetResponse([
        'status' => 'error',
        'success' => false,
        'message' => 'Password reset is temporarily unavailable. Please try again later.'
    ], 503);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>

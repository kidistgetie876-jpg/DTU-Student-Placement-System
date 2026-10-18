<?php
require_once __DIR__ . '/../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/password_reset_helpers.php';

header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    passwordResetResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$email = strtolower(trim((string) ($input['email'] ?? '')));
$code = trim((string) ($input['code'] ?? ''));
$newPassword = (string) ($input['newPassword'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^\d{6}$/', $code)) {
    passwordResetResponse(['success' => false, 'message' => 'Enter a valid email address and six-digit verification code.'], 400);
}
if (strlen($newPassword) < 6) {
    passwordResetResponse(['success' => false, 'message' => 'Password must be at least 6 characters long.'], 400);
}

$db = getDbConnection();
try {
    ensurePasswordResetTokensTable($db);
    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start password reset transaction: ' . $db->error);
    }

    $userStatement = $db->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1');
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
        passwordResetResponse(['success' => false, 'message' => 'The code is invalid or expired. Request a new code and try again.'], 400);
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
        if ($deleteStatement) {
            $deleteStatement->bind_param('i', $userId);
            $deleteStatement->execute();
            $deleteStatement->close();
        }
        $db->commit();
        passwordResetResponse(['success' => false, 'message' => 'The code is invalid or expired. Request a new code and try again.'], 400);
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
        $db->commit();
        passwordResetResponse(['success' => false, 'message' => 'The code is invalid or expired. Request a new code and try again.'], 400);
    }

    $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
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

    passwordResetResponse(['success' => true, 'message' => 'Your password has been reset. You can now sign in.']);
} catch (Throwable $error) {
    $db->rollback();
    error_log('Password reset completion failed: ' . $error->getMessage());
    passwordResetResponse(['success' => false, 'message' => 'Unable to reset the password right now.'], 500);
} finally {
    $db->close();
}
?>

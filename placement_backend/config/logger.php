<?php
function getAuditPdo(): PDO {
    global $db_host, $db_user, $db_pass, $db_name;
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $pdo = new PDO("mysql:host={$db_host};dbname={$db_name};charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

/** Write an audit event without exposing database errors to API clients. */
function logActivity($db, ?int $userId, ?string $fullName, string $action, string $details): bool {
    $action = trim($action);
    $details = trim($details);
    $fullName = $fullName !== null ? trim($fullName) : null;
    if ($action === '' || strlen($action) > 100 || strlen($details) > 4000) return false;

    try {
        $ipAddress = $_SERVER['REMOTE_ADDR'] ?? null;
        if ($db instanceof PDO) {
            $stmt = $db->prepare('INSERT INTO audit_logs (user_id, full_name, action, details, ip_address) VALUES (:user_id, :full_name, :action, :details, :ip_address)');
            $stmt->execute([
                ':user_id' => $userId, ':full_name' => $fullName, ':action' => $action,
                ':details' => $details, ':ip_address' => $ipAddress,
            ]);
            return true;
        }
        if ($db instanceof mysqli) {
            $stmt = $db->prepare('INSERT INTO audit_logs (user_id, full_name, action, details, ip_address) VALUES (?, ?, ?, ?, ?)');
            if (!$stmt) throw new RuntimeException($db->error);
            $stmt->bind_param('issss', $userId, $fullName, $action, $details, $ipAddress);
            $success = $stmt->execute();
            $stmt->close();
            return $success;
        }
    } catch (Throwable $error) {
        error_log('Audit log insert failed: ' . $error->getMessage());
    }
    return false;
}

/** Resolve the current actor from the server-side PHP session. */
function getAuditActor($db): array {
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $userId = isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : 0;
    if ($userId <= 0) return ['id' => null, 'name' => null, 'role' => null];

    if ($db instanceof PDO) {
        $stmt = $db->prepare('SELECT id, username, role FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $actor = $stmt->fetch() ?: null;
    } elseif ($db instanceof mysqli) {
        $stmt = $db->prepare('SELECT id, username, role FROM users WHERE id = ? LIMIT 1');
        if (!$stmt) return ['id' => null, 'name' => null, 'role' => null];
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        $result = $stmt->get_result();
        $actor = $result ? $result->fetch_assoc() : null;
        $stmt->close();
    } else {
        $actor = null;
    }
    if (!$actor) return ['id' => null, 'name' => null, 'role' => null];
    return ['id' => (int) $actor['id'], 'name' => $actor['username'], 'role' => $actor['role']];
}
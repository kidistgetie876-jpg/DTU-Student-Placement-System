<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/role_feature_permissions.php';

function rolePermissionsRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST, OPTIONS');
    rolePermissionsRespond(['success' => false, 'message' => 'Only GET and POST requests are allowed.'], 405);
}

$db = null;
try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }
    if ($method === 'GET') {
        rolePermissionsRespond([
            'success' => true,
            'permissions' => roleFeatureSettings($db),
        ]);
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $adminId = (int) ($_SESSION['user_id'] ?? 0);
    if ($adminId <= 0) {
        rolePermissionsRespond(['success' => false, 'message' => 'Administrator login is required.'], 401);
    }
    $adminStatement = $db->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
    if (!$adminStatement) {
        throw new RuntimeException('Unable to validate administrator access: ' . $db->error);
    }
    $adminStatement->bind_param('i', $adminId);
    if (!$adminStatement->execute()) {
        $error = $adminStatement->error;
        $adminStatement->close();
        throw new RuntimeException('Unable to validate administrator access: ' . $error);
    }
    $admin = $adminStatement->get_result()->fetch_assoc();
    $adminStatement->close();
    if (strtolower(trim((string) ($admin['role'] ?? ''))) !== 'admin') {
        rolePermissionsRespond(['success' => false, 'message' => 'Only administrators can change role permissions.'], 403);
    }

    $createTable = $db->query(
        "CREATE TABLE IF NOT EXISTS system_settings (
            setting_key VARCHAR(100) PRIMARY KEY,
            setting_value LONGTEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    if (!$createTable) {
        throw new RuntimeException('Unable to prepare role permission storage: ' . $db->error);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input) || !isset($input['permissions']) || !is_array($input['permissions'])) {
        rolePermissionsRespond(['success' => false, 'message' => 'A role permissions object is required.'], 400);
    }
    $permissions = roleFeatureDefaults();
    foreach ($permissions as $featureId => $defaultValue) {
        if ($featureId !== 'admin.system-settings' && array_key_exists($featureId, $input['permissions'])) {
            if (!is_bool($input['permissions'][$featureId])) {
                rolePermissionsRespond(['success' => false, 'message' => "Permission '{$featureId}' must be a boolean."], 400);
            }
            $permissions[$featureId] = $input['permissions'][$featureId];
        }
    }
    $encoded = json_encode($permissions, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) {
        throw new RuntimeException('Unable to encode role permissions.');
    }
    $key = 'role_permissions';
    $save = $db->prepare(
        'INSERT INTO system_settings (setting_key, setting_value, updated_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()'
    );
    if (!$save) {
        throw new RuntimeException('Unable to prepare role permission update: ' . $db->error);
    }
    $save->bind_param('ss', $key, $encoded);
    if (!$save->execute()) {
        $error = $save->error;
        $save->close();
        throw new RuntimeException('Unable to save role permissions: ' . $error);
    }
    $save->close();
    rolePermissionsRespond([
        'success' => true,
        'message' => 'Role permissions saved.',
        'permissions' => $permissions,
    ]);
} catch (Throwable $error) {
    error_log('Role permissions API failed: ' . $error->getMessage());
    if ($db instanceof mysqli) {
        $db->close();
    }
    rolePermissionsRespond(['success' => false, 'message' => 'Unable to process role permissions.'], 500);
}

<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST, OPTIONS');
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only POST requests are allowed.']);
    exit;
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ((int) ($_SESSION['user_id'] ?? 0) <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Registrar access is required.']);
    exit;
}

try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }
    $columns = studentPlacementTableColumns($db, 'placement_settings');
    $semester = 1;
    if (in_array('active_semester', $columns, true)) {
        $result = $db->query('SELECT active_semester FROM placement_settings WHERE id = 1 LIMIT 1');
        if (!$result) {
            throw new RuntimeException('Unable to read the active placement semester.');
        }
        $semester = (int) ($result->fetch_assoc()['active_semester'] ?? 1);
        $result->free();
    }
    $db->close();
    if ($semester !== 2) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Second-semester placement is not active yet.']);
        exit;
    }
    require __DIR__ . '/placement_engine.php';
} catch (Throwable $error) {
    error_log('Second-semester placement run failed: ' . $error->getMessage());
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to run second-semester placement.']);
}

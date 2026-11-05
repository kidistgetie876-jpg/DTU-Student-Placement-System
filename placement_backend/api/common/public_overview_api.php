<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only GET requests are allowed.']);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';

try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $studentResult = $db->query("SELECT COUNT(*) AS total FROM users WHERE LOWER(TRIM(role)) = 'student'");
    if (!$studentResult) {
        throw new RuntimeException('Unable to count public student statistics: ' . $db->error);
    }
    $activeStudents = (int) ($studentResult->fetch_assoc()['total'] ?? 0);
    $studentResult->free();

    $departmentResult = $db->query('SELECT COUNT(*) AS total FROM departments');
    if (!$departmentResult) {
        throw new RuntimeException('Unable to count public department statistics: ' . $db->error);
    }
    $departments = (int) ($departmentResult->fetch_assoc()['total'] ?? 0);
    $departmentResult->free();
    $db->close();

    echo json_encode([
        'success' => true,
        'data' => [
            'activeStudents' => $activeStudents,
            'departments' => $departments,
        ],
    ]);
} catch (Throwable $error) {
    error_log('Public overview API error: ' . $error->getMessage());
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to retrieve public overview data.']);
}

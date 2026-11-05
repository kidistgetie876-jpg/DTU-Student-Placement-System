<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
require_once __DIR__ . '/../common/student_placement_reset.php';
header('Content-Type: application/json; charset=UTF-8');

function clearPlacementsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    clearPlacementsResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    clearPlacementsResponse(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    clearPlacementsResponse(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

$requestBody = file_get_contents('php://input');
$requestData = json_decode(is_string($requestBody) ? $requestBody : '', true);
$semester = filter_var(
    is_array($requestData) ? ($requestData['semester'] ?? null) : null,
    FILTER_VALIDATE_INT
);
if (!in_array($semester, [1, 2], true)) {
    $db->close();
    clearPlacementsResponse([
        'success' => false,
        'message' => 'A valid semester (1 or 2) is required.',
    ], 400);
}

try {
    resetPlacementStateForFreshRun($db, $semester);

    $db->close();
    clearPlacementsResponse([
        'success' => true,
        'message' => 'Semester ' . $semester . ' placement records, statuses, and capacities were cleared successfully.',
    ]);
} catch (Throwable $error) {
    error_log('Clear placements failed: ' . $error->getMessage());
    $db->close();
    clearPlacementsResponse([
        'success' => false,
        'message' => 'Unable to clear Semester ' . $semester . ' placement records. Check server logs for details.',
    ], 500);
}

<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Access-Control-Allow-Methods: DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'DELETE') {
    header('Allow: DELETE, OPTIONS');
    respond(['success' => false, 'message' => 'Only DELETE requests are allowed.'], 405);
}

$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    respond(['success' => false, 'message' => 'Only registrars and administrators can delete student information.'], 403);
}

$input = json_decode((string) file_get_contents('php://input'), true);
$studentId = is_array($input) ? filter_var($input['student_id'] ?? null, FILTER_VALIDATE_INT) : false;
if ($studentId === false || $studentId === null || $studentId <= 0) {
    respond(['success' => false, 'message' => 'A valid student ID is required.'], 400);
}

$db = getDbConnection();
try {
    $statement = $db->prepare('DELETE FROM student_data WHERE user_id = ? LIMIT 1');
    if (!$statement) {
        throw new RuntimeException('Unable to prepare student deletion.');
    }

    $statement->bind_param('i', $studentId);
    if (!$statement->execute()) {
        throw new RuntimeException('Unable to delete student information.');
    }

    if ($statement->affected_rows !== 1) {
        $statement->close();
        respond(['success' => false, 'message' => 'Student information not found.'], 404);
    }

    $statement->close();
    respond(['success' => true, 'message' => 'Student deleted successfully']);
} catch (Throwable $error) {
    error_log('Student information deletion failed: ' . $error->getMessage());
    respond(['success' => false, 'message' => 'Unable to delete student information.'], 500);
} finally {
    $db->close();
}
?>

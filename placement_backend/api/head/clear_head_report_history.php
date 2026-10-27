<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/head_department.php';

function clearHeadReportHistoryResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    clearHeadReportHistoryResponse(['success' => true]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    clearHeadReportHistoryResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$headId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($headId <= 0 || !in_array($role, ['head', 'department head', 'department_head', 'head of department', 'hod', 'coordinator'], true)) {
    clearHeadReportHistoryResponse(['success' => false, 'message' => 'Only department heads can clear report history.'], 403);
}

$db = getDbConnection();
if (!$db) {
    clearHeadReportHistoryResponse(['success' => false, 'message' => 'Database connection failed.'], 500);
}

$status = 200;
$payload = [];
try {
    $department = resolveHeadDepartment(
        $db,
        $_SESSION['user_id'],
        isset($_SESSION['email']) ? (string) $_SESSION['email'] : null
    );
    if (!$department) {
        $status = 403;
        throw new Exception('No active department is assigned to this head.');
    }

    $departmentId = (int) $department['id'];
    $statement = $db->prepare(
        "DELETE FROM notifications
         WHERE (recipient_role = 'head'
                AND (recipient_id = ? OR department_id = ? OR department_id IS NULL))
            OR (sender_id = ? AND sender_role IN ('head', 'hod', 'coordinator'))"
    );
    if (!$statement) {
        throw new Exception('Unable to prepare the history deletion.');
    }
    $statement->bind_param('iii', $headId, $departmentId, $headId);
    if (!$statement->execute()) {
        throw new Exception('Unable to delete report history.');
    }
    $payload = [
        'success' => true,
        'message' => 'Report history deleted.',
        'deleted_count' => $statement->affected_rows,
    ];
    $statement->close();
} catch (Throwable $error) {
    error_log('Head report history deletion failed: ' . $error->getMessage());
    if ($status !== 403) {
        $status = 500;
        $payload = ['success' => false, 'message' => 'Unable to delete report history.'];
    } else {
        $payload = ['success' => false, 'message' => $error->getMessage()];
    }
} finally {
    $db->close();
}

clearHeadReportHistoryResponse($payload, $status);
?>

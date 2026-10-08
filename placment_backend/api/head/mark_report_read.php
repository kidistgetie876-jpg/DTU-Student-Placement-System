<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

function markReadResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') markReadResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') markReadResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);

$headId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower((string) ($_SESSION['role'] ?? ''));
if ($headId <= 0 || !in_array($role, ['head', 'hod', 'coordinator'], true)) {
    markReadResponse(['success' => false, 'message' => 'Only department heads can update reports.'], 403);
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$notificationId = (int) ($input['notification_id'] ?? 0);
if ($notificationId <= 0) markReadResponse(['success' => false, 'message' => 'A valid notification is required.'], 400);

$db = getDbConnection();
try {
    $departmentStatement = $db->prepare("SELECT id FROM departments WHERE head_id = ? AND status = 'active' LIMIT 1");
    if (!$departmentStatement) throw new Exception('Unable to load the department assignment.');
    $departmentStatement->bind_param('i', $headId);
    $departmentStatement->execute();
    $department = $departmentStatement->get_result()->fetch_assoc();
    $departmentStatement->close();
    $departmentId = (int) ($department['id'] ?? 0);

    if ($departmentId <= 0) {
        $assignedDepartmentStatement = $db->prepare(
            "SELECT assigned_dept_id
             FROM users
             WHERE id = ? AND LOWER(role) IN ('head', 'hod', 'coordinator')
             LIMIT 1"
        );
        if (!$assignedDepartmentStatement) throw new Exception('Unable to load the department assignment.');
        $assignedDepartmentStatement->bind_param('i', $headId);
        $assignedDepartmentStatement->execute();
        $assignedDepartment = $assignedDepartmentStatement->get_result()->fetch_assoc();
        $assignedDepartmentStatement->close();
        $departmentId = (int) ($assignedDepartment['assigned_dept_id'] ?? 0);
    }

    $statement = $db->prepare(
        'UPDATE notifications
         SET is_read = 1, read_at = NOW()
         WHERE id = ? AND (recipient_id = ? OR (recipient_role = ? AND (department_id IS NULL OR department_id = ?)))'
    );
    if (!$statement) throw new Exception('Unable to update report status.');
    $recipientRole = 'head';
    $statement->bind_param('iisi', $notificationId, $headId, $recipientRole, $departmentId);
    $statement->execute();
    if ($statement->affected_rows === 0) {
        $statement->close();
        markReadResponse(['success' => false, 'message' => 'Report not found or not addressed to you.'], 404);
    }
    $statement->close();
    markReadResponse(['success' => true, 'message' => 'Notification marked as read.']);
} catch (Throwable $error) {
    markReadResponse(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    $db->close();
}
?>
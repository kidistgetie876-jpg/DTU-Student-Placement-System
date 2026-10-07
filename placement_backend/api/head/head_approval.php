<?php
include __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';
header('Content-Type: application/json; charset=UTF-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    respond(['success' => true]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

$db = getDbConnection();
$headId = (int) ($_SESSION['user_id'] ?? 0);

try {
    if ($headId <= 0) {
        respond(['success' => false, 'message' => 'You must be logged in as a HoD.'], 401);
    }

    if (!in_array(strtolower((string) ($_SESSION['role'] ?? '')), ['head', 'hod', 'coordinator'], true)) {
        respond(['success' => false, 'message' => 'Only department heads can approve placements.'], 403);
    }

    $headSql = $db->prepare("SELECT id, username FROM users WHERE id = ? AND role IN ('head', 'hod', 'coordinator') LIMIT 1");
    if (!$headSql) throw new Exception('Unable to validate HoD account.');
    $headSql->bind_param('i', $headId);
    $headSql->execute();
    $head = $headSql->get_result()->fetch_assoc();
    $headSql->close();

    if (!$head) {
        respond(['success' => false, 'message' => 'Only department heads can approve placements.'], 403);
    }

    $departmentSql = $db->prepare("SELECT id, name FROM departments WHERE head_id = ? AND status = 'active' LIMIT 1");
    if (!$departmentSql) throw new Exception('Unable to load assigned department.');
    $departmentSql->bind_param('i', $headId);
    $departmentSql->execute();
    $department = $departmentSql->get_result()->fetch_assoc();
    $departmentSql->close();

    if (!$department) {
        respond(['success' => false, 'message' => 'No active department is assigned to this HoD.'], 404);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $placementId = (int) ($input['placement_id'] ?? 0);
    if ($placementId <= 0) {
        respond(['success' => false, 'message' => 'Placement ID is required.'], 400);
    }

    $db->begin_transaction();

    $placementSql = $db->prepare("SELECT student_id, dept_name FROM placement_results WHERE id = ? AND dept_id = ? AND status = 'Pending' AND approved_at IS NULL FOR UPDATE");
    if (!$placementSql) throw new Exception('Unable to validate placement.');
    $departmentId = (int) $department['id'];
    $placementSql->bind_param('ii', $placementId, $departmentId);
    $placementSql->execute();
    $placement = $placementSql->get_result()->fetch_assoc();
    $placementSql->close();

    if (!$placement) {
        throw new Exception('Placement is not pending or does not belong to your department.');
    }

    $approveSql = $db->prepare("UPDATE placement_results SET approved_at = NOW() WHERE id = ? AND dept_id = ? AND status = 'Pending' AND approved_at IS NULL");
    if (!$approveSql) throw new Exception('Unable to prepare approval update.');

    $approveSql->bind_param('ii', $placementId, $departmentId);
    if (!$approveSql->execute() || $approveSql->affected_rows !== 1) {
        throw new Exception('Unable to approve placement.');
    }

    $approveSql->close();
    $db->commit();

    $studentId = (int) $placement['student_id'];

    logActivity($db, $headId, $head['username'], 'head.placement_approve', json_encode([
        'placement_id' => $placementId,
        'student_id' => $studentId,
        'department_id' => $departmentId,
    ]));

    respond(['success' => true, 'message' => 'Placement reviewed and forwarded for Registrar publication.', 'placement_id' => $placementId]);
} catch (Throwable $error) {
    if ($db->connect_errno === 0) {
        $db->rollback();
    }
    respond(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    $db->close();
}
?>

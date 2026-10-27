<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();

if (session_status() === PHP_SESSION_NONE) {
    session_name('DTUPLACEMENTSESSID');
    session_start();
}

header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/head_department.php';

function departmentCapacityRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    departmentCapacityRespond(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

$userId = filter_var($_SESSION['user_id'] ?? null, FILTER_VALIDATE_INT);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId === false || $userId === null || $userId <= 0
    || !in_array($role, ['head', 'department head', 'department_head', 'head of department', 'hod', 'coordinator'], true)) {
    departmentCapacityRespond(['success' => false, 'message' => 'Only department heads can view department capacity.'], 403);
}

$db = null;
try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection failed.');
    }
    $department = resolveHeadDepartment(
        $db,
        $_SESSION['user_id'],
        isset($_SESSION['email']) ? (string) $_SESSION['email'] : null
    );
    if (!$department) {
        departmentCapacityRespond([
            'success' => false,
            'message' => 'No active department is assigned to this head.',
        ], 404);
    }

    $placementColumns = studentPlacementTableColumns($db, 'placement_results');
    $departmentColumn = in_array('dept_id', $placementColumns, true)
        ? 'dept_id'
        : (in_array('department_id', $placementColumns, true) ? 'department_id' : '');
    if ($departmentColumn === '') {
        throw new RuntimeException('The placement_results table is missing dept_id or department_id.');
    }
    $departmentId = (int) $department['id'];
    $hasStatus = in_array('status', $placementColumns, true);
    $statusExpression = $hasStatus ? "LOWER(TRIM(COALESCE(status, '')))" : "''";
    $publishedCondition = in_array('is_published', $placementColumns, true)
        ? 'is_published = 1'
        : "{$statusExpression} IN ('approved', 'published', 'placed')";
    $placementStatement = $db->prepare(
        'SELECT'
        . ' SUM(CASE WHEN ' . $publishedCondition . ' THEN 1 ELSE 0 END) AS assigned_students,'
        . " SUM(CASE WHEN {$statusExpression} = 'pending'"
        . (in_array('approved_at', $placementColumns, true) ? ' AND approved_at IS NULL' : '')
        . (in_array('is_published', $placementColumns, true) ? ' AND is_published = 0' : '')
        . ' THEN 1 ELSE 0 END) AS pending_approvals'
        . ' FROM placement_results WHERE `' . $departmentColumn . '` = ?'
    );
    if (!$placementStatement) {
        throw new RuntimeException('Unable to prepare department capacity query: ' . $db->error);
    }
    $placementStatement->bind_param('i', $departmentId);
    if (!$placementStatement->execute()) {
        throw new RuntimeException('Unable to load department capacity totals: ' . $placementStatement->error);
    }
    $counts = $placementStatement->get_result()->fetch_assoc() ?: [];
    $placementStatement->close();

    $capacity = (int) ($department['capacity'] ?? 0);
    $assigned = (int) ($counts['assigned_students'] ?? 0);
    $department['capacity'] = $capacity;
    $department['assigned'] = $assigned;
    $department['available'] = max(0, $capacity - $assigned);
    $department['pending_approvals'] = (int) ($counts['pending_approvals'] ?? 0);

    departmentCapacityRespond([
        'success' => true,
        'department' => $department,
        'capacity' => $capacity,
        'assigned' => $assigned,
        'available' => $department['available'],
        'pending_approvals' => $department['pending_approvals'],
    ]);
} catch (Throwable $error) {
    error_log('Department capacity lookup failed: ' . $error->getMessage());
    departmentCapacityRespond(['success' => false, 'message' => 'Unable to load department capacity.'], 500);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}

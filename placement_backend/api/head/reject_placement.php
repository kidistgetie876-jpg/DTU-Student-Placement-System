<?php
if (session_status() === PHP_SESSION_NONE) {
    session_name('DTUPLACEMENTSESSID');
    session_start();
}

header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/head_department.php';

function rejectPlacementRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    rejectPlacementRespond(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

$headId = filter_var($_SESSION['user_id'] ?? null, FILTER_VALIDATE_INT);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$allowedRoles = ['head', 'department head', 'department_head', 'head of department', 'hod', 'coordinator'];
if ($headId === false || $headId === null || $headId <= 0 || !in_array($role, $allowedRoles, true)) {
    rejectPlacementRespond(['success' => false, 'message' => 'Only department heads can reject placements.'], 403);
}

$input = json_decode(file_get_contents('php://input'), true);
$placementId = filter_var(is_array($input) ? ($input['placement_id'] ?? null) : null, FILTER_VALIDATE_INT);
$requestedDepartmentId = filter_var(is_array($input) ? ($input['department_id'] ?? null) : null, FILTER_VALIDATE_INT);
if ($placementId === false || $placementId === null || $placementId <= 0) {
    rejectPlacementRespond(['success' => false, 'message' => 'A valid placement ID is required.'], 400);
}

$db = null;
$transactionStarted = false;
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
        rejectPlacementRespond(['success' => false, 'message' => 'No active department is assigned to this head.'], 404);
    }
    $departmentId = (int) $department['id'];
    if ($requestedDepartmentId !== false && $requestedDepartmentId !== null
        && $requestedDepartmentId > 0 && $requestedDepartmentId !== $departmentId) {
        rejectPlacementRespond(['success' => false, 'message' => 'You can only reject placements in your assigned department.'], 403);
    }

    $placementColumns = studentPlacementTableColumns($db, 'placement_results');
    $departmentColumn = in_array('dept_id', $placementColumns, true)
        ? 'dept_id'
        : (in_array('department_id', $placementColumns, true) ? 'department_id' : '');
    if (!in_array('id', $placementColumns, true) || !in_array('status', $placementColumns, true) || $departmentColumn === '') {
        throw new RuntimeException('The placement results schema is missing required identifiers or status.');
    }
    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    $profileStatusColumn = in_array('placement_status', $studentColumns, true)
        ? 'placement_status'
        : (in_array('status', $studentColumns, true) ? 'status' : '');
    if ($profileStatusColumn === '' || !in_array('id', $studentColumns, true)) {
        throw new RuntimeException('Student profiles cannot be safely returned to the unassigned pool.');
    }

    $placementFields = ['id'];
    foreach (['student_id', 'admission_number', 'id_number'] as $column) {
        if (in_array($column, $placementColumns, true)) {
            $placementFields[] = "`{$column}`";
        }
    }
    $db->begin_transaction();
    $transactionStarted = true;
    $placementStatement = $db->prepare(
        'SELECT ' . implode(', ', $placementFields) . ' FROM placement_results'
        . " WHERE id = ? AND `{$departmentColumn}` = ?"
        . " AND LOWER(TRIM(COALESCE(status, ''))) = 'pending'"
        . (in_array('approved_at', $placementColumns, true) ? ' AND approved_at IS NULL' : '')
        . ' LIMIT 1 FOR UPDATE'
    );
    if (!$placementStatement) {
        throw new RuntimeException('Unable to prepare pending placement lookup: ' . $db->error);
    }
    $placementStatement->bind_param('ii', $placementId, $departmentId);
    if (!$placementStatement->execute()) {
        $placementStatement->close();
        throw new RuntimeException('Unable to load pending placement: ' . $db->error);
    }
    $placement = $placementStatement->get_result()->fetch_assoc();
    $placementStatement->close();
    if (!$placement) {
        $db->rollback();
        $transactionStarted = false;
        rejectPlacementRespond(['success' => false, 'message' => 'Pending placement not found in your department.'], 404);
    }

    $profileConditions = [];
    $profileValues = [];
    $profileTypes = '';
    if (isset($placement['student_id']) && (int) $placement['student_id'] > 0
        && in_array('user_id', $studentColumns, true)) {
        $profileConditions[] = 'user_id = ?';
        $profileValues[] = (int) $placement['student_id'];
        $profileTypes .= 'i';
    }
    $admissionNumber = trim((string) ($placement['admission_number'] ?? $placement['id_number'] ?? ''));
    if ($admissionNumber !== '') {
        foreach (['admission_number', 'id_number', 'moe_admission_number', 'student_id'] as $column) {
            if (!in_array($column, $studentColumns, true)) {
                continue;
            }
            $profileConditions[] = "TRIM(`{$column}`) = ?";
            $profileValues[] = $admissionNumber;
            $profileTypes .= 's';
        }
    }
    if (!$profileConditions) {
        throw new RuntimeException('The placement has no supported student identity.');
    }

    $profileLookup = $db->prepare(
        'SELECT id FROM student_data WHERE (' . implode(' OR ', $profileConditions) . ') LIMIT 1 FOR UPDATE'
    );
    if (!$profileLookup) {
        throw new RuntimeException('Unable to prepare student profile lookup: ' . $db->error);
    }
    $profileArguments = [$profileTypes];
    foreach ($profileValues as &$value) {
        $profileArguments[] = &$value;
    }
    unset($value);
    call_user_func_array([$profileLookup, 'bind_param'], $profileArguments);
    if (!$profileLookup->execute()) {
        $profileLookup->close();
        throw new RuntimeException('Unable to verify student profile: ' . $db->error);
    }
    $profile = $profileLookup->get_result()->fetch_assoc();
    $profileLookup->close();
    if (!$profile) {
        throw new RuntimeException('Student profile not found; placement was not rejected.');
    }

    $profileUpdates = ["`{$profileStatusColumn}` = 'Not assigned'"];
    if (in_array('department', $studentColumns, true)) {
        $profileUpdates[] = "department = 'Not assigned'";
    }
    $profileUpdate = $db->prepare(
        'UPDATE student_data SET ' . implode(', ', $profileUpdates) . ' WHERE id = ?'
    );
    if (!$profileUpdate) {
        throw new RuntimeException('Unable to prepare student profile reset: ' . $db->error);
    }
    $profileId = (int) $profile['id'];
    $profileUpdate->bind_param('i', $profileId);
    if (!$profileUpdate->execute()) {
        $profileUpdate->close();
        throw new RuntimeException('Unable to return student to the unassigned pool: ' . $db->error);
    }
    $profileUpdate->close();

    $placementUpdate = $db->prepare(
        "UPDATE placement_results SET status = 'Rejected' WHERE id = ? AND `{$departmentColumn}` = ?"
        . " AND LOWER(TRIM(COALESCE(status, ''))) = 'pending'"
    );
    if (!$placementUpdate) {
        throw new RuntimeException('Unable to prepare placement rejection: ' . $db->error);
    }
    $placementUpdate->bind_param('ii', $placementId, $departmentId);
    if (!$placementUpdate->execute() || $placementUpdate->affected_rows !== 1) {
        $placementUpdate->close();
        throw new RuntimeException('Unable to reject placement.');
    }
    $placementUpdate->close();

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit placement rejection: ' . $db->error);
    }
    $transactionStarted = false;
    rejectPlacementRespond([
        'success' => true,
        'message' => 'Placement rejected and student returned to the unassigned pool.',
        'placement_id' => (int) $placementId,
        'department_id' => $departmentId,
        'status' => 'Rejected',
    ]);
} catch (Throwable $error) {
    if ($transactionStarted && $db instanceof mysqli) {
        $db->rollback();
    }
    error_log('Department head placement rejection failed: ' . $error->getMessage());
    rejectPlacementRespond(['success' => false, 'message' => 'Unable to reject placement.'], 500);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}

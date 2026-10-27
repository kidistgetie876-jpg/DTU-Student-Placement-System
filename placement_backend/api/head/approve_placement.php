<?php
if (session_status() === PHP_SESSION_NONE) {
    session_name('DTUPLACEMENTSESSID');
    session_start();
}

header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/head_department.php';

function approvePlacementRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function approvePlacementBind(mysqli_stmt $statement, string $types, array &$values): bool
{
    $arguments = [$types];
    foreach ($values as &$value) {
        $arguments[] = &$value;
    }
    unset($value);
    return call_user_func_array([$statement, 'bind_param'], $arguments);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    approvePlacementRespond(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

$headId = filter_var($_SESSION['user_id'] ?? null, FILTER_VALIDATE_INT);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$allowedRoles = ['head', 'department head', 'department_head', 'head of department', 'hod', 'coordinator'];
if ($headId === false || $headId === null || $headId <= 0 || !in_array($role, $allowedRoles, true)) {
    approvePlacementRespond(['success' => false, 'message' => 'Only department heads can approve placements.'], 403);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    approvePlacementRespond(['success' => false, 'message' => 'A valid JSON request is required.'], 400);
}
$placementId = filter_var($input['placement_id'] ?? null, FILTER_VALIDATE_INT);
$studentId = trim((string) ($input['student_id'] ?? ''));
$admissionNumber = trim((string) ($input['admission_number'] ?? ''));
$requestedDepartmentId = filter_var($input['department_id'] ?? null, FILTER_VALIDATE_INT);
if (($placementId === false || $placementId === null || $placementId <= 0)
    && $studentId === '' && $admissionNumber === '') {
    approvePlacementRespond(['success' => false, 'message' => 'Placement ID, student ID, or admission number is required.'], 400);
}

$db = null;
$transactionStarted = false;
try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection failed.');
    }

    $userColumns = studentPlacementTableColumns($db, 'users');
    $userIdColumn = in_array('id', $userColumns, true)
        ? 'id'
        : (in_array('user_id', $userColumns, true) ? 'user_id' : '');
    if ($userIdColumn === '') {
        throw new RuntimeException('User identifiers are unavailable.');
    }
    if (in_array('role', $userColumns, true)) {
        $headQuery = 'SELECT `' . $userIdColumn . '` FROM users'
            . ' WHERE `' . $userIdColumn . '` = ?'
            . " AND LOWER(TRIM(role)) IN ('head', 'department head', 'department_head', 'hod', 'coordinator') LIMIT 1";
        $headStatement = $db->prepare($headQuery);
        if (!$headStatement) {
            throw new RuntimeException('Unable to verify department-head account: ' . $db->error);
        }
        $headStatement->bind_param('i', $headId);
        if (!$headStatement->execute()) {
            throw new RuntimeException('Unable to verify department-head account: ' . $headStatement->error);
        }
        $isHead = $headStatement->get_result()->num_rows > 0;
        $headStatement->close();
        if (!$isHead) {
            approvePlacementRespond(['success' => false, 'message' => 'Only department heads can approve placements.'], 403);
        }
    }

    $department = resolveHeadDepartment(
        $db,
        $_SESSION['user_id'],
        isset($_SESSION['email']) ? (string) $_SESSION['email'] : null
    );
    if (!$department) {
        approvePlacementRespond(['success' => false, 'message' => 'No active department is assigned to this head.'], 404);
    }
    $departmentId = (int) $department['id'];
    if ($requestedDepartmentId !== false && $requestedDepartmentId !== null
        && $requestedDepartmentId > 0 && $requestedDepartmentId !== $departmentId) {
        approvePlacementRespond(['success' => false, 'message' => 'You can only approve placements in your assigned department.'], 403);
    }

    $placementColumns = studentPlacementTableColumns($db, 'placement_results');
    if (!in_array('status', $placementColumns, true)) {
        throw new RuntimeException('The placement_results table is missing status.');
    }
    $departmentColumn = in_array('dept_id', $placementColumns, true)
        ? 'dept_id'
        : (in_array('department_id', $placementColumns, true) ? 'department_id' : '');
    if ($departmentColumn === '') {
        throw new RuntimeException('The placement_results table is missing dept_id or department_id.');
    }

    $conditions = [];
    $parameters = [];
    $types = '';
    if ($placementId !== false && $placementId !== null && $placementId > 0
        && in_array('id', $placementColumns, true)) {
        $conditions[] = 'pr.id = ?';
        $parameters[] = $placementId;
        $types .= 'i';
    } else {
        if ($studentId !== '') {
            if (ctype_digit($studentId) && in_array('student_id', $placementColumns, true)) {
                $conditions[] = 'pr.student_id = ?';
                $parameters[] = (int) $studentId;
                $types .= 'i';
            } elseif (in_array('admission_number', $placementColumns, true)) {
                $conditions[] = 'TRIM(pr.admission_number) = ?';
                $parameters[] = $studentId;
                $types .= 's';
            } elseif (in_array('id_number', $placementColumns, true)) {
                $conditions[] = 'TRIM(pr.id_number) = ?';
                $parameters[] = $studentId;
                $types .= 's';
            }
        }
        if ($admissionNumber !== '') {
            $identifiers = [];
            foreach (['admission_number', 'id_number'] as $column) {
                if (in_array($column, $placementColumns, true)) {
                    $identifiers[] = "TRIM(pr.`{$column}`) = ?";
                    $parameters[] = $admissionNumber;
                    $types .= 's';
                }
            }
            if ($identifiers) {
                $conditions[] = '(' . implode(' OR ', $identifiers) . ')';
            }
        }
    }
    if (!$conditions) {
        approvePlacementRespond(['success' => false, 'message' => 'The supplied student identifier is not supported by the placement schema.'], 400);
    }
    $pendingCondition = "LOWER(TRIM(COALESCE(pr.status, ''))) = 'pending'";
    $approvedAtCondition = in_array('approved_at', $placementColumns, true) ? ' AND pr.approved_at IS NULL' : '';
    $placementSql = 'SELECT pr.id FROM placement_results pr'
        . ' WHERE pr.`' . $departmentColumn . '` = ? AND ' . $pendingCondition . $approvedAtCondition
        . ' AND (' . implode(' OR ', $conditions) . ')'
        . (in_array('id', $placementColumns, true) ? ' ORDER BY pr.id DESC' : '')
        . ' LIMIT 1 FOR UPDATE';
    $db->begin_transaction();
    $transactionStarted = true;
    $placementStatement = $db->prepare($placementSql);
    if (!$placementStatement) {
        throw new RuntimeException('Unable to prepare placement lookup: ' . $db->error);
    }
    array_unshift($parameters, $departmentId);
    $types = 'i' . $types;
    if (!approvePlacementBind($placementStatement, $types, $parameters)) {
        throw new RuntimeException('Unable to bind placement lookup: ' . $placementStatement->error);
    }
    if (!$placementStatement->execute()) {
        throw new RuntimeException('Unable to load pending placement: ' . $placementStatement->error);
    }
    $placement = $placementStatement->get_result()->fetch_assoc();
    $placementStatement->close();
    if (!$placement) {
        $db->rollback();
        $transactionStarted = false;
        approvePlacementRespond([
            'success' => false,
            'message' => 'Pending placement not found in your department.',
        ], 404);
    }

    $updates = ["status = 'Approved'"];
    if (in_array('approved_at', $placementColumns, true)) {
        $updates[] = 'approved_at = COALESCE(approved_at, NOW())';
    }
    $updateSql = 'UPDATE placement_results SET ' . implode(', ', $updates)
        . ' WHERE id = ? AND `' . $departmentColumn . '` = ?'
        . " AND LOWER(TRIM(COALESCE(status, ''))) = 'pending'";
    $updateStatement = $db->prepare($updateSql);
    if (!$updateStatement) {
        throw new RuntimeException('Unable to prepare placement approval: ' . $db->error);
    }
    $placementIdValue = (int) $placement['id'];
    $updateStatement->bind_param('ii', $placementIdValue, $departmentId);
    if (!$updateStatement->execute() || $updateStatement->affected_rows !== 1) {
        throw new RuntimeException('Unable to approve placement.');
    }
    $updateStatement->close();
    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit placement approval: ' . $db->error);
    }
    $transactionStarted = false;

    approvePlacementRespond([
        'success' => true,
        'message' => 'Placement approved and forwarded for Registrar publication.',
        'placement_id' => $placementIdValue,
        'department_id' => $departmentId,
        'status' => 'Approved',
    ]);
} catch (Throwable $error) {
    if ($transactionStarted && $db instanceof mysqli) {
        $db->rollback();
    }
    error_log('Department head placement approval failed: ' . $error->getMessage());
    approvePlacementRespond(['success' => false, 'message' => 'Unable to approve placement.'], 500);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}

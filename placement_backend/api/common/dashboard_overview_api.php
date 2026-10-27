<?php
error_reporting(E_ALL);
ini_set('display_errors', '0');

/**
 * Dashboard Overview API - Registrar Dashboard Statistics
 * Fetches dynamic data for Overview cards using MySQLi
 * 
 * Returns registrar overview statistics using the tables available in this installation.
 */

header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only GET requests are allowed.']);
    exit;
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function countQuery(mysqli $db, string $sql): int
{
    $result = $db->query($sql);
    if (!$result) {
        throw new RuntimeException($db->error);
    }

    $row = $result->fetch_assoc();
    return (int) ($row['total'] ?? 0);
}

function dashboardTableColumns(mysqli $db, string $table): array
{
    $statement = $db->prepare(
        'SELECT COLUMN_NAME
         FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ?'
    );
    if (!$statement) {
        throw new RuntimeException($db->error);
    }
    $statement->bind_param('s', $table);
    if (!$statement->execute()) {
        throw new RuntimeException($statement->error);
    }
    $result = $statement->get_result();
    $columns = [];
    while ($row = $result->fetch_assoc()) {
        $columns[] = (string) $row['COLUMN_NAME'];
    }
    $statement->close();
    return $columns;
}

function dashboardCountWhere(mysqli $db, string $table, array $columns, array $conditions): int
{
    if (!$conditions) {
        return 0;
    }

    $safeConditions = [];
    foreach ($conditions as $column => $condition) {
        if (!in_array($column, $columns, true)) {
            continue;
        }
        $safeConditions[] = $condition;
    }
    if (!$safeConditions) {
        return 0;
    }

    $sql = 'SELECT COUNT(*) AS total FROM `' . str_replace('`', '``', $table) . '` WHERE '
        . implode(' OR ', $safeConditions);
    return countQuery($db, $sql);
}

try {
    require_once __DIR__ . '/../../config/db_config.php';
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }
    $userColumns = dashboardTableColumns($db, 'users');
    $departmentColumns = dashboardTableColumns($db, 'departments');
    if (!in_array('role', $userColumns, true) || !in_array('id', $userColumns, true)) {
        throw new RuntimeException('The users table is missing required id or role columns.');
    }
    if (!in_array('id', $departmentColumns, true)) {
        throw new RuntimeException('The departments table is missing its id column.');
    }

    $studentColumns = dashboardTableColumns($db, 'students');
    $studentTable = $studentColumns ? 'students' : 'student_data';
    if (!$studentColumns) {
        $studentColumns = dashboardTableColumns($db, $studentTable);
    }
    $assignmentColumns = dashboardTableColumns($db, 'department_assignments');
    $assignmentTable = $assignmentColumns ? 'department_assignments' : 'placement_results';
    if (!$assignmentColumns) {
        $assignmentColumns = dashboardTableColumns($db, $assignmentTable);
    }
    $approvalColumns = dashboardTableColumns($db, 'placement_approvals');

    $totalDepartments = countQuery($db, 'SELECT COUNT(*) AS total FROM departments');
    $activeStudents = countQuery($db, "SELECT COUNT(*) AS total FROM users WHERE LOWER(TRIM(role)) = 'student'");

    $verifiedConditions = [];
    if (in_array('status', $studentColumns, true)) {
        $verifiedConditions['status'] = "LOWER(TRIM(COALESCE(`status`, ''))) = 'verified'";
    }
    if (in_array('is_verified', $studentColumns, true)) {
        $verifiedConditions['is_verified'] = '`is_verified` = 1';
    }
    $verifiedStudents = dashboardCountWhere($db, $studentTable, $studentColumns, $verifiedConditions);

    $awaitingConditions = [];
    if (in_array('placement_status', $studentColumns, true)) {
        $awaitingConditions['placement_status'] = "LOWER(TRIM(COALESCE(`placement_status`, ''))) = 'pending'";
    } elseif (in_array('status', $studentColumns, true)) {
        $awaitingConditions['status'] = "LOWER(TRIM(COALESCE(`status`, ''))) = 'pending'";
    }
    foreach (['assigned_department', 'assigned_dept_id'] as $assignmentColumn) {
        if (in_array($assignmentColumn, $studentColumns, true)) {
            $awaitingConditions[$assignmentColumn] = "`{$assignmentColumn}` IS NULL";
        }
    }
    $awaitingPlacement = dashboardCountWhere($db, $studentTable, $studentColumns, $awaitingConditions);

    $finalizedConditions = [];
    $departmentAssignmentColumn = null;
    foreach (['dept_id', 'department_id', 'dept_name', 'department_name'] as $column) {
        if (in_array($column, $assignmentColumns, true)) {
            $departmentAssignmentColumn = $column;
            break;
        }
    }
    if ($departmentAssignmentColumn !== null) {
        $assignmentStatusCondition = '';
        if (in_array('status', $assignmentColumns, true)) {
            $assignmentStatusCondition = " WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('approved', 'placed', 'published', 'finalized', 'completed')";
        }
        $assignmentTableSql = str_replace('`', '``', $assignmentTable);
        $assignmentColumnSql = str_replace('`', '``', $departmentAssignmentColumn);
        $finalizedDepartments = countQuery($db, "
            SELECT COUNT(DISTINCT `{$assignmentColumnSql}`) AS total
            FROM `{$assignmentTableSql}`{$assignmentStatusCondition}
              " . ($assignmentStatusCondition === '' ? " WHERE " : " AND ")
            . "`{$assignmentColumnSql}` IS NOT NULL AND TRIM(CAST(`{$assignmentColumnSql}` AS CHAR)) <> ''
        ");
    } else {
        if (in_array('approval_status', $departmentColumns, true)) {
            $finalizedConditions['approval_status'] = "LOWER(TRIM(COALESCE(`approval_status`, ''))) = 'approved'";
        }
        if (in_array('capacity_approved', $departmentColumns, true)) {
            $finalizedConditions['capacity_approved'] = '`capacity_approved` = 1';
        }
        $finalizedDepartments = dashboardCountWhere($db, 'departments', $departmentColumns, $finalizedConditions);
    }

        $studentPlacementStatusColumn = in_array('placement_status', $studentColumns, true)
            ? 'placement_status'
            : (in_array('status', $studentColumns, true) ? 'status' : null);
        $placementsCompleted = $studentPlacementStatusColumn === null
            ? 0
            : countQuery($db, "
                SELECT COUNT(*) AS total
                FROM `{$studentTable}`
                WHERE LOWER(TRIM(COALESCE(`{$studentPlacementStatusColumn}`, '')))
                    IN ('placed', 'approved', 'published')
            ");

    if (in_array('status', $approvalColumns, true)) {
        $pendingApprovals = countQuery($db, "
            SELECT COUNT(*) AS total FROM placement_approvals
            WHERE LOWER(TRIM(COALESCE(status, ''))) = 'pending'
        ");
    } elseif (in_array('status', $assignmentColumns, true)) {
        $pendingCountExpression = in_array('student_id', $assignmentColumns, true)
            ? 'COUNT(DISTINCT student_id)'
            : 'COUNT(*)';
        $assignmentTableSql = str_replace('`', '``', $assignmentTable);
        $pendingApprovals = countQuery($db, "
            SELECT {$pendingCountExpression} AS total FROM `{$assignmentTableSql}`
            WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('pending', 'pending_approval')
        ");
    } else {
        $pendingApprovals = 0;
    }

    $db->close();
    $stats = [
        'total_departments' => $totalDepartments,
        'verified_students' => $verifiedStudents,
        'finalized_departments' => $finalizedDepartments,
        'awaiting_placement' => $awaitingPlacement,
        'pending_approvals' => $pendingApprovals,
        // Keep the legacy fields available for the admin dashboard.
        'departments' => $totalDepartments,
        'activeStudents' => $activeStudents,
        'placementsCompleted' => $placementsCompleted,
        'unplacedStudents' => $awaitingPlacement,
        'pendingApprovals' => $pendingApprovals,
    ];
    respond([
        'success' => true,
        'total_departments' => $totalDepartments,
        'verified_students' => $verifiedStudents,
        'finalized_departments' => $finalizedDepartments,
        'awaiting_placement' => $awaitingPlacement,
        'pending_approvals' => $pendingApprovals,
        'data' => $stats,
    ]);

} catch (Throwable $error) {
    error_log('Dashboard Overview API Error: ' . $error->getMessage());
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
    respond([
        'success' => false,
        'message' => 'Unable to retrieve dashboard overview data.',
    ], 500);
}
?>

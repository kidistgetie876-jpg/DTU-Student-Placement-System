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

function dashboardCycleConditions(
    mysqli $db,
    array $columns,
    array $settings,
    string $alias,
    bool $includeSemester = false
): array {
    $conditions = [];
    foreach ([
        'batch_id' => ['active_batch_id', 'batch_id'],
        'academic_year' => ['active_academic_year', 'academic_year'],
    ] as $column => $settingCandidates) {
        if (!in_array($column, $columns, true)) {
            continue;
        }
        foreach ($settingCandidates as $setting) {
            if (!array_key_exists($setting, $settings) || $settings[$setting] === null || trim((string) $settings[$setting]) === '') {
                continue;
            }
            $value = $db->real_escape_string((string) $settings[$setting]);
            $conditions[] = "`{$alias}`.`{$column}` = '{$value}'";
            break;
        }
    }

    if ($includeSemester && in_array('placement_semester', $columns, true)) {
        $semester = (int) ($settings['active_semester'] ?? 1);
        if (in_array($semester, [1, 2], true)) {
            $conditions[] = "`{$alias}`.`placement_semester` = {$semester}";
        }
    }
    return $conditions;
}

function dashboardStudentCountExpression(array $columns, string $alias): string
{
    $identifiers = [];
    foreach (['student_id', 'admission_number', 'id_number'] as $column) {
        if (in_array($column, $columns, true)) {
            $identifiers[] = "NULLIF(TRIM(CAST(`{$alias}`.`{$column}` AS CHAR)), '')";
        }
    }
    return $identifiers
        ? 'COUNT(DISTINCT COALESCE(' . implode(', ', $identifiers) . '))'
        : 'COUNT(*)';
}

try {
    require_once __DIR__ . '/../../config/db_config.php';
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }
    $userColumns = dashboardTableColumns($db, 'users');
    $departmentColumns = dashboardTableColumns($db, 'departments');
    $studentColumns = dashboardTableColumns($db, 'student_data');
    $assignmentColumns = dashboardTableColumns($db, 'placement_results');
    $approvalColumns = dashboardTableColumns($db, 'placement_approvals');
    if (!in_array('role', $userColumns, true) || !in_array('id', $userColumns, true)) {
        throw new RuntimeException('The users table is missing required id or role columns.');
    }
    if (!in_array('id', $departmentColumns, true)) {
        throw new RuntimeException('The departments table is missing its id column.');
    }
    if (!$studentColumns) {
        throw new RuntimeException('The student_data table is unavailable.');
    }

    $settingsColumns = dashboardTableColumns($db, 'placement_settings');
    $settings = [];
    $settingsFields = array_values(array_intersect(
        ['active_semester', 'active_batch_id', 'batch_id', 'active_academic_year', 'academic_year'],
        $settingsColumns
    ));
    if ($settingsFields) {
        $settingsResult = $db->query(
            'SELECT `' . implode('`, `', $settingsFields) . '` FROM placement_settings WHERE id = 1 LIMIT 1'
        );
        if (!$settingsResult) {
            throw new RuntimeException('Unable to load the active placement cycle: ' . $db->error);
        }
        $settings = $settingsResult->fetch_assoc() ?: [];
        $settingsResult->free();
    }

    $totalDepartments = countQuery($db, 'SELECT COUNT(*) AS total FROM departments');
    $activeStudents = countQuery($db, "SELECT COUNT(*) AS total FROM users WHERE LOWER(TRIM(role)) = 'student'");

    $studentCycleConditions = dashboardCycleConditions($db, $studentColumns, $settings, 'sd');
    $verifiedConditions = $studentCycleConditions;
    if (in_array('is_verified', $studentColumns, true)) {
        $verifiedConditions[] = '`sd`.`is_verified` = 1';
    } elseif (in_array('is_active', $studentColumns, true)) {
        $verifiedConditions[] = '`sd`.`is_active` = 1';
    } elseif (in_array('verification_status', $studentColumns, true)) {
        $verifiedConditions[] = "LOWER(TRIM(COALESCE(`sd`.`verification_status`, ''))) IN ('verified', 'active', 'approved')";
    } elseif (in_array('admission_number', $studentColumns, true)) {
        $verifiedConditions[] = "NULLIF(TRIM(`sd`.`admission_number`), '') IS NOT NULL";
    } elseif (in_array('id_number', $studentColumns, true)) {
        $verifiedConditions[] = "NULLIF(TRIM(`sd`.`id_number`), '') IS NOT NULL";
    }
    $verifiedStudents = countQuery(
        $db,
        'SELECT COUNT(*) AS total FROM student_data sd'
            . ($verifiedConditions ? ' WHERE ' . implode(' AND ', $verifiedConditions) : '')
    );

    $studentPlacementStatus = in_array('placement_status', $studentColumns, true)
        ? '`sd`.`placement_status`'
        : (in_array('status', $studentColumns, true) ? '`sd`.`status`' : null);
    $awaitingPlacement = 0;
    if ($studentPlacementStatus !== null) {
        $awaitingConditions = array_merge(
            $studentCycleConditions,
            ["LOWER(TRIM(REPLACE(COALESCE({$studentPlacementStatus}, ''), '_', ' '))) IN ('pending 1st semester', 'pending 2nd semester', 'unassigned')"]
        );
        $awaitingPlacement = countQuery(
            $db,
            'SELECT COUNT(*) AS total FROM student_data sd WHERE ' . implode(' AND ', $awaitingConditions)
        );
    }

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
            $assignmentStatusCondition = " WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('assigned', 'approved', 'placed', 'published', 'finalized', 'completed')";
        }
        $assignmentColumnSql = str_replace('`', '``', $departmentAssignmentColumn);
        $finalizedDepartments = countQuery($db, "
            SELECT COUNT(DISTINCT `{$assignmentColumnSql}`) AS total
            FROM `placement_results`{$assignmentStatusCondition}
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

    $placementsCompleted = 0;
    if (in_array('status', $assignmentColumns, true)) {
        $assignmentCycleConditions = dashboardCycleConditions($db, $assignmentColumns, $settings, 'pr', true);
        $assignmentCycleConditions[] = "LOWER(TRIM(COALESCE(`pr`.`status`, ''))) = 'assigned'";
        $placementsCompleted = countQuery(
            $db,
            'SELECT ' . dashboardStudentCountExpression($assignmentColumns, 'pr')
                . ' AS total FROM placement_results pr WHERE ' . implode(' AND ', $assignmentCycleConditions)
        );
    }

    if (in_array('status', $approvalColumns, true)) {
        $approvalCycleConditions = dashboardCycleConditions($db, $approvalColumns, $settings, 'pa');
        $approvalCycleConditions[] = "LOWER(TRIM(COALESCE(`pa`.`status`, ''))) IN ('pending', 'pending_approval')";
        $pendingApprovals = countQuery($db, "
            SELECT COUNT(*) AS total FROM placement_approvals pa
            WHERE " . implode(' AND ', $approvalCycleConditions)
        );
    } elseif (in_array('status', $assignmentColumns, true)) {
        $pendingConditions = dashboardCycleConditions($db, $assignmentColumns, $settings, 'pr', true);
        $pendingConditions[] = "LOWER(TRIM(COALESCE(`pr`.`status`, ''))) IN ('pending', 'pending_approval')";
        if (in_array('is_published', $assignmentColumns, true)) {
            $pendingConditions[] = 'COALESCE(`pr`.`is_published`, 0) = 0';
        }
        if (in_array('dept_name', $assignmentColumns, true)) {
            $pendingConditions[] = "NULLIF(TRIM(`pr`.`dept_name`), '') IS NOT NULL";
            $pendingConditions[] = "LOWER(TRIM(`pr`.`dept_name`)) NOT IN ('unassigned', 'not assigned')";
        } elseif (in_array('dept_id', $assignmentColumns, true)) {
            $pendingConditions[] = '`pr`.`dept_id` IS NOT NULL';
        }
        $pendingApprovals = countQuery($db, "
            SELECT " . dashboardStudentCountExpression($assignmentColumns, 'pr') . " AS total
            FROM placement_results pr
            WHERE " . implode(' AND ', $pendingConditions)
        );
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
        'placements_completed' => $placementsCompleted,
        'unplacedStudents' => $awaitingPlacement,
        'unplaced_students' => $awaitingPlacement,
        'pendingApprovals' => $pendingApprovals,
    ];
    respond([
        'success' => true,
        'total_departments' => $totalDepartments,
        'verified_students' => $verifiedStudents,
        'finalized_departments' => $finalizedDepartments,
        'awaiting_placement' => $awaitingPlacement,
        'unplaced_students' => $awaitingPlacement,
        'placements_completed' => $placementsCompleted,
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

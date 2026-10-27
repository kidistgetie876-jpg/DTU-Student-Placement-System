<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();

if (session_status() === PHP_SESSION_NONE) {
    session_name('DTUPLACEMENTSESSID');
    session_start();
}

header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/department_capacity.php';
require_once __DIR__ . '/head_department.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only GET requests are allowed']);
    exit;
}

$userId = filter_var($_SESSION['user_id'] ?? null, FILTER_VALIDATE_INT);
if ($userId === false || $userId === null || $userId <= 0) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'You must be logged in as a department head']);
    exit;
}

$sessionRole = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if (!in_array($sessionRole, ['head', 'department head', 'department_head', 'head of department', 'hod', 'coordinator'], true)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'You must be logged in as a department head']);
    exit;
}

$db = null;
try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection failed.');
    }
    ensureDepartmentCapacityApprovalSchema($db);
    $department = resolveHeadDepartment($db, $_SESSION['user_id'], isset($_SESSION['email']) ? (string) $_SESSION['email'] : null);
    if (!$department) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'No active department is assigned to this head']);
        exit;
    }
    $departmentId = (int) $department['id'];

    $placementColumnNames = studentPlacementTableColumns($db, 'placement_results');
    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    $choiceColumns = studentPlacementTableColumns($db, 'student_choices');
    if (!in_array('admission_number', $choiceColumns, true)
        || !in_array('admission_number', $studentColumns, true)
        || !in_array('priority', $choiceColumns, true)) {
        throw new RuntimeException('The student choices or student data table is missing required admission_number or priority columns.');
    }
    $choiceDepartmentConditions = [];
    $userColumns = studentPlacementTableColumns($db, 'users');
    $hasAssignedDepartmentId = in_array('assigned_dept_id', $userColumns, true)
        && in_array('id', $userColumns, true);
    $pendingChoiceJoins = '';
    if ($hasAssignedDepartmentId) {
        $pendingChoiceJoins .= ' LEFT JOIN users head_user ON head_user.id = ' . $userId;
    }
    $pendingChoiceJoins .= ' INNER JOIN departments approval_department ON approval_department.id = ' . $departmentId;
    if (in_array('dept_id', $choiceColumns, true)) {
        $choiceDepartmentConditions[] = $hasAssignedDepartmentId
            ? 'sc.dept_id = head_user.assigned_dept_id'
            : 'CAST(sc.dept_id AS CHAR) = CAST(' . $departmentId . ' AS CHAR)';
    }
    foreach (['dept_name', 'department_name'] as $choiceNameColumn) {
        if (in_array($choiceNameColumn, $choiceColumns, true)) {
            $choiceDepartmentConditions[] = "LOWER(TRIM(sc.`{$choiceNameColumn}`)) = LOWER(TRIM(approval_department.name))";
        }
    }
    if (!$choiceDepartmentConditions) {
        throw new RuntimeException('The student_choices table has no supported department identifier.');
    }
    $pendingChoiceCondition = '(' . implode(' OR ', $choiceDepartmentConditions) . ')';
    $placementDepartmentColumn = in_array('dept_id', $placementColumnNames, true)
        ? 'dept_id'
        : (in_array('department_id', $placementColumnNames, true) ? 'department_id' : '');
    if ($placementDepartmentColumn === '') {
        throw new RuntimeException('The placement_results table is missing dept_id or department_id.');
    }
    $hasPublishFlag = in_array('is_published', $placementColumnNames, true);

    $placementStatus = in_array('status', $placementColumnNames, true)
        ? "LOWER(TRIM(COALESCE(pr.status, '')))"
        : "''";
    $statusPublishedCondition = $hasPublishFlag
        ? 'pr.is_published = 1'
        : "{$placementStatus} IN ('approved', 'published', 'placed')";
    $departmentFilter = "pr.`{$placementDepartmentColumn}` = ?";
    $assignedStatement = $db->prepare(
        "SELECT COUNT(*) AS assigned_students FROM placement_results pr
         WHERE {$departmentFilter} AND {$statusPublishedCondition}"
    );
    if (!$assignedStatement) {
        throw new RuntimeException('Unable to prepare assigned student count: ' . $db->error);
    }
    $assignedStatement->bind_param('i', $departmentId);
    if (!$assignedStatement->execute()) {
        throw new RuntimeException('Unable to count assigned students: ' . $assignedStatement->error);
    }
    $assigned = $assignedStatement->get_result()->fetch_assoc() ?: ['assigned_students' => 0];
    $assignedStatement->close();

    $pendingCondition = "{$placementStatus} = 'pending'";
    $approvedAtCondition = in_array('approved_at', $placementColumnNames, true) ? ' AND pr.approved_at IS NULL' : '';
    $studentIdExpression = studentPlacementColumnExpression($placementColumnNames, 'pr', ['student_id']);
    $admissionExpression = studentPlacementColumnExpression($placementColumnNames, 'pr', ['admission_number', 'id_number']);
    $joinConditions = [];
    if (in_array('user_id', $studentColumns, true) && in_array('student_id', $placementColumnNames, true)) {
        $joinConditions[] = 'sd.user_id = pr.student_id';
    }
    foreach (['admission_number', 'id_number'] as $studentKey) {
        if (!in_array($studentKey, $studentColumns, true)) continue;
        foreach (['admission_number', 'id_number'] as $placementKey) {
            if (in_array($placementKey, $placementColumnNames, true)) {
                $joinConditions[] = "TRIM(sd.`{$studentKey}`) = TRIM(pr.`{$placementKey}`)";
            }
        }
    }
    $studentJoin = $joinConditions ? implode(' OR ', array_unique($joinConditions)) : '1 = 0';
    $userJoin = in_array('id', $userColumns, true) && in_array('student_id', $placementColumnNames, true)
        ? ' LEFT JOIN users u ON u.id = pr.student_id'
        : ' LEFT JOIN users u ON 1 = 0';
    $nameExpression = studentPlacementTextExpression($studentColumns, 'sd', ['given_name', 'first_name']);
    $lastNameExpression = studentPlacementTextExpression($studentColumns, 'sd', ['father_name', 'last_name']);
    if (in_array('first_name', $userColumns, true)) {
        $nameExpression = "COALESCE(NULLIF({$nameExpression}, ''), u.first_name, '')";
    }
    if (in_array('last_name', $userColumns, true)) {
        $lastNameExpression = "COALESCE(NULLIF({$lastNameExpression}, ''), u.last_name, '')";
    }
    $usernameExpression = studentPlacementTextExpression($studentColumns, 'sd', ['username']);
    if (in_array('username', $userColumns, true)) {
        $usernameExpression = "COALESCE(NULLIF({$usernameExpression}, ''), u.username, '')";
    }
    $usernameExpression = "COALESCE(NULLIF({$usernameExpression}, ''), NULLIF(TRIM(CONCAT_WS(' ', NULLIF({$nameExpression}, ''), NULLIF({$lastNameExpression}, ''))), ''), '')";
    $emailExpression = studentPlacementTextExpression($studentColumns, 'sd', ['email']);
    if (in_array('email', $userColumns, true)) {
        $emailExpression = "COALESCE(NULLIF({$emailExpression}, ''), u.email, '')";
    }
    $idNumberExpression = studentPlacementTextExpression($studentColumns, 'sd', ['admission_number', 'id_number']);
    if (in_array('id_number', $userColumns, true)) {
        $idNumberExpression = "COALESCE(NULLIF({$idNumberExpression}, ''), u.id_number, {$admissionExpression}, '')";
    } else {
        $idNumberExpression = "COALESCE(NULLIF({$idNumberExpression}, ''), {$admissionExpression}, '')";
    }
    $fields = [
        studentPlacementColumnExpression($placementColumnNames, 'pr', ['id'], '0') . ' AS placement_id',
        "{$studentIdExpression} AS student_id",
        "{$idNumberExpression} AS id_number",
        "{$idNumberExpression} AS admission_number",
        "{$nameExpression} AS first_name",
        "{$lastNameExpression} AS last_name",
        "{$nameExpression} AS given_name",
        "{$lastNameExpression} AS father_name",
        studentPlacementColumnExpression($studentColumns, 'sd', ['total_mark']) . ' AS total_mark',
        "{$usernameExpression} AS username",
        "{$emailExpression} AS email",
    ];
    foreach ([
        'gender' => ['gender', 'sex'],
        'gpa' => ['gpa', 'cgpa'],
        'phone' => ['phone', 'phone_number'],
        'disability' => ['disability'],
        'minority' => ['minority'],
    ] as $alias => $candidates) {
        $fields[] = studentPlacementColumnExpression($studentColumns, 'sd', $candidates) . " AS `{$alias}`";
    }
    foreach ([
        'dept_name' => ['dept_name', 'department_name'],
        'final_score' => ['final_score', 'cumulative_score'],
        'choice_rank' => ['choice_rank', 'priority'],
        'status' => ['status'],
        'placed_at' => ['placed_at'],
        'approved_at' => ['approved_at'],
    ] as $alias => $candidates) {
        $sourceColumns = in_array($candidates[0], $placementColumnNames, true)
            ? $placementColumnNames
            : (isset($candidates[1]) && in_array($candidates[1], $placementColumnNames, true) ? $placementColumnNames : []);
        $fields[] = studentPlacementColumnExpression($sourceColumns, 'pr', $candidates) . " AS `{$alias}`";
    }
    $studentFieldsSql = 'SELECT ' . implode(', ', $fields)
        . ' FROM placement_results pr LEFT JOIN student_data sd ON ' . $studentJoin
        . $userJoin . " WHERE {$departmentFilter}";
    $pendingFromSql = ' FROM placement_results pr LEFT JOIN student_data sd ON ' . $studentJoin
        . $userJoin
        . ' INNER JOIN student_choices sc ON TRIM(sc.admission_number) = TRIM(sd.admission_number)'
        . $pendingChoiceJoins;
    $pendingWhereSql = " WHERE {$departmentFilter} AND {$pendingCondition}{$approvedAtCondition}"
        . " AND {$pendingChoiceCondition}"
        . ' AND ' . ($hasPublishFlag ? 'pr.is_published = 0' : "{$placementStatus} = 'pending'");
    $pendingStatement = $db->prepare(
        'SELECT COUNT(DISTINCT pr.id) AS pending_approvals' . $pendingFromSql . $pendingWhereSql
    );
    if (!$pendingStatement) {
        throw new RuntimeException('Unable to prepare pending approval count: ' . $db->error);
    }
    $pendingStatement->bind_param('i', $departmentId);
    if (!$pendingStatement->execute()) {
        throw new RuntimeException('Unable to count pending approvals: ' . $pendingStatement->error);
    }
    $pending = $pendingStatement->get_result()->fetch_assoc() ?: ['pending_approvals' => 0];
    $pendingStatement->close();

    $orderScore = in_array('final_score', $placementColumnNames, true)
        ? 'pr.final_score DESC'
        : (in_array('cumulative_score', $placementColumnNames, true) ? 'pr.cumulative_score DESC' : 'pr.id DESC');
    $orderDate = in_array('placed_at', $placementColumnNames, true) ? ', pr.placed_at DESC' : '';
    $studentsStatement = $db->prepare(
        $studentFieldsSql . " AND {$statusPublishedCondition} ORDER BY {$orderScore}{$orderDate}"
    );
    if (!$studentsStatement) {
        throw new RuntimeException('Unable to prepare placed student query: ' . $db->error);
    }
    $studentsStatement->bind_param('i', $departmentId);
    if (!$studentsStatement->execute()) {
        throw new RuntimeException('Unable to load placed students: ' . $studentsStatement->error);
    }
    $studentsResult = $studentsStatement->get_result();
    $students = [];
    while ($student = $studentsResult->fetch_assoc()) {
        $student['student_id'] = isset($student['student_id']) ? (int) $student['student_id'] : 0;
        $student['final_score'] = isset($student['final_score']) ? (float) $student['final_score'] : 0.0;
        $student['choice_rank'] = isset($student['choice_rank']) ? (int) $student['choice_rank'] : 0;
        $students[] = $student;
    }
    $studentsStatement->close();

    $pendingStudents = [];
    if (in_array('status', $placementColumnNames, true)) {
        $pendingFields = $fields;
        $pendingFields[] = 'sc.priority AS priority';
        $pendingStudentsStatement = $db->prepare(
            'SELECT DISTINCT ' . implode(', ', $pendingFields)
            . $pendingFromSql . $pendingWhereSql
            . " ORDER BY {$orderScore}{$orderDate}"
        );
        if (!$pendingStudentsStatement) {
            throw new RuntimeException('Unable to prepare pending student query: ' . $db->error);
        }
        $pendingStudentsStatement->bind_param('i', $departmentId);
        if (!$pendingStudentsStatement->execute()) {
            throw new RuntimeException('Unable to load pending students: ' . $pendingStudentsStatement->error);
        }
        $pendingStudentsResult = $pendingStudentsStatement->get_result();
        while ($student = $pendingStudentsResult->fetch_assoc()) {
            $student['student_id'] = isset($student['student_id']) ? (int) $student['student_id'] : 0;
            $student['final_score'] = isset($student['final_score']) ? (float) $student['final_score'] : 0.0;
            $student['choice_rank'] = isset($student['choice_rank']) ? (int) $student['choice_rank'] : 0;
            $pendingStudents[] = $student;
        }
        $pendingStudentsStatement->close();
    }

    $department['id'] = $departmentId;
    $department['capacity'] = (int) ($department['capacity'] ?? 0);
    $department['assigned'] = (int) ($assigned['assigned_students'] ?? 0);
    $department['available'] = max(0, $department['capacity'] - $department['assigned']);

    echo json_encode([
        'success' => true,
        'department' => $department ?: [],
        'students' => $students,
        'pendingStudents' => $pendingStudents,
        'stats' => [
            'totalStudents' => $department['assigned'],
            'placedStudents' => count($students),
            'approvalRequests' => (int) ($pending['pending_approvals'] ?? 0),
            'capacityUsed' => $department['capacity'] > 0
                ? round(($department['assigned'] / $department['capacity']) * 100, 1)
                : 0,
        ],
    ]);
} catch (Throwable $error) {
    error_log('Get Head Dashboard Error: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to load dashboard data.',
        'error' => $error->getMessage(),
    ]);
    exit;
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>

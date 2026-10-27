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

function headPlacedStudentsRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    headPlacedStudentsRespond(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

$headId = filter_var($_SESSION['user_id'] ?? null, FILTER_VALIDATE_INT);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($headId === false || $headId === null || $headId <= 0
    || !in_array($role, ['head', 'department head', 'department_head', 'head of department', 'hod', 'coordinator'], true)) {
    headPlacedStudentsRespond(['success' => false, 'message' => 'You must be logged in as a department head.'], 401);
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
        headPlacedStudentsRespond([
            'success' => false,
            'message' => 'No active department is assigned to this head.',
            'students' => [],
        ], 404);
    }
    $departmentId = (int) $department['id'];

    $placementColumns = studentPlacementTableColumns($db, 'placement_results');
    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    if (!in_array('status', $placementColumns, true)) {
        throw new RuntimeException('The placement_results table is missing status.');
    }
    $placementDepartmentColumn = in_array('dept_id', $placementColumns, true)
        ? 'dept_id'
        : (in_array('department_id', $placementColumns, true) ? 'department_id' : '');
    if ($placementDepartmentColumn === '') {
        throw new RuntimeException('The placement_results table is missing dept_id or department_id.');
    }

    $studentJoinConditions = [];
    if (in_array('user_id', $studentColumns, true) && in_array('student_id', $placementColumns, true)) {
        $studentJoinConditions[] = 'sd.user_id = pr.student_id';
    }
    foreach (['admission_number', 'id_number'] as $studentKey) {
        if (!in_array($studentKey, $studentColumns, true)) continue;
        foreach (['admission_number', 'id_number'] as $placementKey) {
            if (in_array($placementKey, $placementColumns, true)) {
                $studentJoinConditions[] = "TRIM(sd.`{$studentKey}`) = TRIM(pr.`{$placementKey}`)";
            }
        }
    }
    $studentJoin = $studentJoinConditions ? implode(' OR ', array_unique($studentJoinConditions)) : '1 = 0';

    $studentIdExpression = studentPlacementColumnExpression($placementColumns, 'pr', ['student_id']);
    $placementAdmission = studentPlacementTextExpression($placementColumns, 'pr', ['admission_number', 'id_number']);
    $admissionExpression = studentPlacementTextExpression($studentColumns, 'sd', ['admission_number', 'id_number']);
    $idNumberExpression = "COALESCE(NULLIF({$admissionExpression}, ''), {$placementAdmission}, '')";
    $firstName = studentPlacementTextExpression($studentColumns, 'sd', ['given_name', 'first_name']);
    $lastName = studentPlacementTextExpression($studentColumns, 'sd', ['father_name', 'last_name']);
    $nameExpression = "COALESCE(NULLIF(TRIM(CONCAT_WS(' ', NULLIF({$firstName}, ''), NULLIF({$lastName}, ''))), ''), 'Student')";
    $usernameExpression = studentPlacementTextExpression($studentColumns, 'sd', ['username']);
    $usernameExpression = "COALESCE(NULLIF({$usernameExpression}, ''), NULLIF(TRIM(CONCAT_WS(' ', NULLIF({$firstName}, ''), NULLIF({$lastName}, ''))), ''), '')";
    $fields = [
        studentPlacementColumnExpression($placementColumns, 'pr', ['id'], '0') . ' AS placement_id',
        "{$studentIdExpression} AS student_id",
        "{$idNumberExpression} AS id_number",
        "{$nameExpression} AS name",
        "{$firstName} AS first_name",
        "{$lastName} AS last_name",
        "{$usernameExpression} AS username",
        studentPlacementTextExpression($studentColumns, 'sd', ['email']) . ' AS email',
        studentPlacementColumnExpression($studentColumns, 'sd', ['gender', 'sex']) . ' AS gender',
        studentPlacementColumnExpression($studentColumns, 'sd', ['gpa', 'cgpa']) . ' AS gpa',
        studentPlacementColumnExpression($studentColumns, 'sd', ['phone', 'phone_number']) . ' AS phone',
        studentPlacementColumnExpression($studentColumns, 'sd', ['disability']) . ' AS disability',
        studentPlacementColumnExpression($studentColumns, 'sd', ['minority']) . ' AS minority',
        studentPlacementTextExpression($placementColumns, 'pr', ['dept_name', 'department_name']) . ' AS dept_name',
        studentPlacementColumnExpression($placementColumns, 'pr', ['final_score', 'cumulative_score']) . ' AS final_score',
        studentPlacementColumnExpression($placementColumns, 'pr', ['choice_rank', 'priority'], '0') . ' AS choice_rank',
        studentPlacementTextExpression($placementColumns, 'pr', ['status'], "'placed'") . ' AS status',
        studentPlacementColumnExpression($placementColumns, 'pr', ['placed_at']) . ' AS placed_at',
    ];
    $publishedFilter = in_array('is_published', $placementColumns, true)
        ? " AND pr.is_published = 1 AND LOWER(TRIM(pr.status)) IN ('placed', 'approved', 'published')"
        : " AND LOWER(TRIM(pr.status)) IN ('placed', 'approved', 'published')";
    $orderBy = in_array('placed_at', $placementColumns, true)
        ? 'pr.placed_at DESC'
        : (in_array('id', $placementColumns, true) ? 'pr.id DESC' : 'pr.status');
    $query = 'SELECT ' . implode(', ', $fields)
        . ' FROM placement_results pr LEFT JOIN student_data sd ON ' . $studentJoin
        . ' WHERE pr.`' . $placementDepartmentColumn . '` = ?' . $publishedFilter
        . ' ORDER BY ' . $orderBy;
    $statement = $db->prepare($query);
    if (!$statement) {
        throw new RuntimeException('Unable to prepare placed student query: ' . $db->error);
    }
    $statement->bind_param('i', $departmentId);
    if (!$statement->execute()) {
        throw new RuntimeException('Unable to load placed students: ' . $statement->error);
    }
    $result = $statement->get_result();
    $students = [];
    while ($student = $result->fetch_assoc()) {
        $student['student_id'] = isset($student['student_id']) ? (int) $student['student_id'] : 0;
        $student['final_score'] = isset($student['final_score']) ? (float) $student['final_score'] : 0.0;
        $student['choice_rank'] = (int) ($student['choice_rank'] ?? 0);
        $students[] = $student;
    }
    $statement->close();
    $db->close();
    $db = null;

    headPlacedStudentsRespond([
        'success' => true,
        'department_id' => $departmentId,
        'students' => $students,
        'count' => count($students),
    ]);
} catch (Throwable $error) {
    error_log('Head placed students load failed: ' . $error->getMessage());
    if ($db instanceof mysqli) {
        $db->close();
    }
    headPlacedStudentsRespond(['success' => false, 'message' => 'Unable to load placed students.'], 500);
}

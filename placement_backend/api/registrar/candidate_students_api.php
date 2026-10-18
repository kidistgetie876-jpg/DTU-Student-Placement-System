<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=UTF-8');

function candidateStudentsRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    candidateStudentsRespond(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || ($role !== 'registrar' && $role !== 'admin')) {
    candidateStudentsRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    candidateStudentsRespond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

$stream = trim((string) ($_GET['stream'] ?? ''));
$college = trim((string) ($_GET['college'] ?? ''));
$allValues = static function (string $value): bool {
    return $value === '' || strtolower($value) === 'all';
};

try {
    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    $userColumns = studentPlacementTableColumns($db, 'users');
    $choiceColumns = studentPlacementTableColumns($db, 'student_choices');
    $departmentColumns = studentPlacementTableColumns($db, 'departments');
    $mosheColumns = studentPlacementTableColumns($db, 'moshe_students');
    $simsColumns = studentPlacementTableColumns($db, 'sims_students');
    $placementColumns = studentPlacementTableColumns($db, 'placement_results');

    if (!in_array('id', $userColumns, true)) {
        throw new RuntimeException('Student profile tables are missing the required account identifier columns.');
    }

    $admissionExpression = studentPlacementTextExpression($studentColumns, 'sd', ['admission_number', 'id_number']);
    if (in_array('id_number', $userColumns, true)) {
        $admissionExpression = "COALESCE(NULLIF({$admissionExpression}, ''), NULLIF(u.id_number, ''), '')";
    }
    if (in_array('user_id', $studentColumns, true)) {
        $userIdentityMatches = ['u.id = sd.user_id'];
        if (in_array('id_number', $userColumns, true)) {
            $profileAdmissionColumn = in_array('admission_number', $studentColumns, true)
                ? 'admission_number'
                : (in_array('id_number', $studentColumns, true) ? 'id_number' : '');
            if ($profileAdmissionColumn !== '') {
                $userIdentityMatches[] = "TRIM(u.id_number) = TRIM(sd.`{$profileAdmissionColumn}`)";
            }
        }
        $userJoin = 'LEFT JOIN users u ON (' . implode(' OR ', $userIdentityMatches)
            . ") AND LOWER(TRIM(u.role)) = 'student'";
        $studentAccountId = 'COALESCE(u.id, sd.user_id)';
        $candidateIdExpression = "COALESCE(NULLIF(u.id, 0), NULLIF(sd.user_id, 0), {$admissionExpression})";
    } elseif (in_array('id_number', $studentColumns, true) && in_array('id_number', $userColumns, true)) {
        $userJoin = "LEFT JOIN users u ON TRIM(u.id_number) = TRIM(sd.id_number) AND LOWER(TRIM(u.role)) = 'student'";
        $studentAccountId = 'u.id';
        $candidateIdExpression = "COALESCE(u.id, {$admissionExpression})";
    } elseif (in_array('admission_number', $studentColumns, true) && in_array('id_number', $userColumns, true)) {
        $userJoin = "LEFT JOIN users u ON TRIM(u.id_number) = TRIM(sd.admission_number) AND LOWER(TRIM(u.role)) = 'student'";
        $studentAccountId = 'u.id';
        $candidateIdExpression = "COALESCE(u.id, {$admissionExpression})";
    } else {
        throw new RuntimeException('Student profiles cannot be matched to student accounts.');
    }
    $mosheJoin = '';
    if ($mosheColumns && in_array('admission_number', $mosheColumns, true)) {
        $mosheJoin = " LEFT JOIN moshe_students m ON TRIM(m.admission_number) = TRIM({$admissionExpression})";
        $admissionExpression = "COALESCE(NULLIF({$admissionExpression}, ''), m.admission_number, '')";
    }
    $simsJoin = '';
    if ($simsColumns && in_array('student_id', $simsColumns, true)) {
        $simsJoin = " LEFT JOIN sims_students s ON TRIM(s.student_id) = TRIM({$admissionExpression})";
    }
    $choicesJoin = '';
    $choiceConditions = [];
    if (in_array('student_id', $choiceColumns, true)) {
        $choiceConditions[] = 'sc.student_id = u.id';
        $choiceConditions[] = in_array('user_id', $studentColumns, true)
            ? 'sc.student_id = sd.user_id'
            : "TRIM(sc.student_id) = TRIM({$admissionExpression})";
        if (in_array('user_id', $studentColumns, true)
            && (in_array('admission_number', $studentColumns, true) || in_array('id_number', $studentColumns, true))) {
            $choiceConditions[] = "TRIM(sc.student_id) = TRIM({$admissionExpression})";
        }
    }
    if (in_array('user_id', $choiceColumns, true)) {
        $choiceConditions[] = "sc.user_id = {$studentAccountId}";
    }
    if (in_array('admission_number', $choiceColumns, true)) {
        $choiceConditions[] = "TRIM(sc.admission_number) = TRIM({$admissionExpression})";
    }
    if ($choiceConditions) {
        $choicesJoin = ' LEFT JOIN student_choices sc ON (' . implode(' OR ', $choiceConditions) . ')';
    }
    $departmentJoin = '';
    $choiceDepartmentIdColumn = in_array('dept_id', $choiceColumns, true)
        ? 'dept_id'
        : (in_array('department_id', $choiceColumns, true) ? 'department_id' : '');
    if ($choicesJoin !== '' && $departmentJoin === '' && $departmentColumns
        && in_array('id', $departmentColumns, true) && $choiceDepartmentIdColumn !== '') {
        $departmentJoin = " LEFT JOIN departments d ON d.id = sc.`{$choiceDepartmentIdColumn}`";
    }

    $nameParts = [];
    foreach (['given_name', 'father_name', 'grandfather_name', 'first_name', 'last_name'] as $nameColumn) {
        if (in_array($nameColumn, $studentColumns, true)) {
            $nameParts[] = "NULLIF(sd.`{$nameColumn}`, '')";
        }
    }
    if ($mosheJoin !== '') {
        foreach (['given_name', 'father_name', 'grand_father_name'] as $nameColumn) {
            if (in_array($nameColumn, $mosheColumns, true)) {
                $nameParts[] = "NULLIF(m.`{$nameColumn}`, '')";
            }
        }
    }
    if (in_array('username', $userColumns, true)) {
        $nameParts[] = "NULLIF(u.username, '')";
    }
    $nameExpression = $nameParts
        ? "COALESCE(" . implode(', ', $nameParts) . ", 'Student')"
        : "'Student'";
    $emailExpression = studentPlacementTextExpression($studentColumns, 'sd', ['email']);
    if (in_array('email', $userColumns, true)) {
        $emailExpression = "COALESCE(NULLIF({$emailExpression}, ''), u.email, '')";
    }
    $genderExpression = studentPlacementTextExpression($studentColumns, 'sd', ['sex', 'gender']);
    $regionExpression = studentPlacementTextExpression($studentColumns, 'sd', ['region']);
    $benefitExpression = studentPlacementTextExpression($studentColumns, 'sd', ['benefit_group', 'minority'], "'None'");
    $studentStreamExpression = studentPlacementTextExpression($studentColumns, 'sd', ['stream', 'field_of_study']);
    $cgpaExpression = studentPlacementColumnExpression($studentColumns, 'sd', ['cgpa', 'gpa'], '0');
    $grade12Expression = studentPlacementColumnExpression($studentColumns, 'sd', ['total_mark', 'grade_12_result'], '0');
    $cocExpression = studentPlacementColumnExpression($studentColumns, 'sd', ['coc_score', 'coc_result'], '0');
    if ($simsJoin !== '') {
        $cgpaExpression = studentPlacementColumnExpression($simsColumns, 's', ['cgpa'], $cgpaExpression);
        $cocExpression = studentPlacementColumnExpression($simsColumns, 's', ['coc_score'], $cocExpression);
        $studentStreamExpression = studentPlacementTextExpression($simsColumns, 's', ['stream'], $studentStreamExpression);
    }
    $choiceColumnsForQuery = $choicesJoin !== '' ? $choiceColumns : [];
    $choiceNameExpression = studentPlacementTextExpression($choiceColumnsForQuery, 'sc', ['dept_name', 'department_name']);
    $choiceCollegeExpression = studentPlacementTextExpression($choiceColumnsForQuery, 'sc', ['college_name']);
    $choiceStreamExpression = studentPlacementTextExpression($choiceColumnsForQuery, 'sc', ['stream']);
    $choiceDeptIdExpression = studentPlacementColumnExpression($choiceColumnsForQuery, 'sc', ['dept_id', 'department_id']);
    $choicePriorityExpression = studentPlacementColumnExpression($choiceColumnsForQuery, 'sc', ['priority'], '99');
    if ($departmentJoin !== '') {
        if (in_array('name', $departmentColumns, true)) {
            $choiceNameExpression = "COALESCE(NULLIF({$choiceNameExpression}, ''), d.name)";
        }
        if (in_array('college_name', $departmentColumns, true)) {
            $choiceCollegeExpression = "COALESCE(NULLIF({$choiceCollegeExpression}, ''), d.college_name, '')";
        }
        if (in_array('stream', $departmentColumns, true)) {
            $choiceStreamExpression = "COALESCE(NULLIF({$choiceStreamExpression}, ''), d.stream, '')";
        }
    }
    $statusExpression = studentPlacementTextExpression($studentColumns, 'sd', ['status', 'placement_status']);
    $statusCondition = $statusExpression !== "''"
        ? " AND LOWER(TRIM(COALESCE({$statusExpression}, ''))) NOT IN ('inactive', 'disabled', 'placed', 'approved')"
        : '';
    $placementConditions = [];
    if (in_array('student_id', $placementColumns, true)) {
        $placementConditions[] = "pr.student_id = {$studentAccountId}";
    }
    if (in_array('admission_number', $placementColumns, true)) {
        $placementConditions[] = "TRIM(pr.admission_number) = TRIM({$admissionExpression})";
    }
    $placementCondition = $placementConditions
        ? ' AND NOT EXISTS (SELECT 1 FROM placement_results pr WHERE ' . implode(' OR ', $placementConditions) . ')'
        : '';
    $sql = "SELECT {$candidateIdExpression} AS id, u.id AS account_id,
                   {$admissionExpression} AS id_number, {$nameExpression} AS name,
                   {$emailExpression} AS email, {$genderExpression} AS gender,
                   {$studentStreamExpression} AS student_stream, {$regionExpression} AS region,
                   {$benefitExpression} AS benefit_group, {$cgpaExpression} AS cgpa,
                   {$grade12Expression} AS grade12, {$cocExpression} AS coc,
                   {$choiceDeptIdExpression} AS dept_id, {$choiceNameExpression} AS dept_name,
                   {$choiceCollegeExpression} AS college_name, {$choiceStreamExpression} AS choice_stream,
                   {$choicePriorityExpression} AS priority
            FROM student_data sd
            {$userJoin}
            {$mosheJoin}{$simsJoin}{$choicesJoin}{$departmentJoin}
            WHERE 1 = 1{$statusCondition}{$placementCondition}";

    $types = '';
    $values = [];
    if (!$allValues($stream)) {
        $sql .= " AND LOWER(TRIM(COALESCE(NULLIF({$studentStreamExpression}, ''), ''))) = LOWER(TRIM(?))";
        $types .= 's';
        $values[] = $stream;
    }
    if (!$allValues($college)) {
        $sql .= " AND LOWER(TRIM(COALESCE(NULLIF({$choiceCollegeExpression}, ''), ''))) = LOWER(TRIM(?))";
        $types .= 's';
        $values[] = $college;
    }
    $sql .= " ORDER BY {$candidateIdExpression} ASC, {$choicePriorityExpression} ASC";

    $statement = $db->prepare($sql);
    if (!$statement) {
        throw new RuntimeException('Unable to prepare candidate student query: ' . $db->error);
    }
    if ($values && !$statement->bind_param($types, ...$values)) {
        throw new RuntimeException('Unable to bind candidate student filters: ' . $statement->error);
    }
    if (!$statement->execute()) {
        throw new RuntimeException('Unable to fetch candidate students: ' . $statement->error);
    }

    $result = $statement->get_result();
    $students = [];
    while ($row = $result->fetch_assoc()) {
        $id = trim((string) ($row['id'] ?? ''));
        if ($id === '') {
            continue;
        }
        if (!isset($students[$id])) {
            $studentStream = trim((string) ($row['student_stream'] ?? ''));
            $benefitGroup = strtolower((string) ($row['benefit_group'] ?? ''));
            $developingRegion = preg_match('/developing|emerging/', strtolower((string) ($row['region'] ?? '') . ' ' . $benefitGroup))
                || preg_match('/\b(afar|somali|gambella|benishangul[\s-]*gumuz|benishangul|harari)\b/', strtolower((string) ($row['region'] ?? '')));
            $students[$id] = [
                'id' => $row['id'],
                'account_linked' => !empty($row['account_id']),
                'id_number' => $row['id_number'] ?? '',
                'admission_number' => $row['id_number'] ?? '',
                'name' => trim((string) ($row['name'] ?? '')),
                'email' => $row['email'] ?? '',
                'gender' => $row['gender'] ?? '',
                'stream' => $studentStream !== '' ? $studentStream : trim((string) ($row['choice_stream'] ?? '')),
                'hasDisability' => (bool) preg_match('/disability|disabled/', $benefitGroup),
                'minority' => (bool) $developingRegion,
                'developingRegion' => (bool) $developingRegion,
                'region' => $row['region'] ?? '',
                'benefitGroup' => $row['benefit_group'] ?? '',
                'cgpa' => $row['cgpa'] ?? 0,
                'g12' => $row['grade12'] ?? 0,
                'coc' => $row['coc'] ?? 0,
                'status' => trim((string) ($row['student_stream'] ?? '')) === '' ? 'Eligible' : 'Pending',
                'choices' => [],
            ];
        }

        $priority = (int) ($row['priority'] ?? 0);
        if ($row['dept_name'] !== null
            && trim((string) $row['dept_name']) !== ''
            && $priority >= 1
            && $priority <= 3) {
            $students[$id]['choices'][] = [
                'dept_id' => $row['dept_id'],
                'dept_name' => $row['dept_name'],
                'department' => $row['dept_name'],
                'college_name' => $row['college_name'] ?? '',
                'stream' => $row['choice_stream'] ?? '',
                'priority' => $priority,
            ];
        }
    }
    foreach ($students as &$student) {
        usort($student['choices'], static fn (array $left, array $right): int =>
            (int) ($left['priority'] ?? 99) <=> (int) ($right['priority'] ?? 99)
        );
        $rankedChoices = [];
        foreach ($student['choices'] as $choice) {
            $priority = (int) $choice['priority'];
            if (!isset($rankedChoices[$priority])) {
                $rankedChoices[$priority] = $choice;
            }
        }
        $student['choices'] = array_values($rankedChoices);
        foreach ([1, 2, 3] as $priority) {
            $choice = $rankedChoices[$priority] ?? null;
            $student['choice_' . $priority] = $choice['dept_name'] ?? null;
        }
    }
    unset($student);
    $statement->close();
    $db->close();

    candidateStudentsRespond([
        'success' => true,
        'students' => array_values($students),
        'filters' => ['stream' => $stream, 'college' => $college],
    ]);
} catch (Throwable $error) {
    error_log('Candidate student fetch failed: ' . $error->getMessage());
    $db->close();
    candidateStudentsRespond(['success' => false, 'message' => 'Unable to load candidate students.'], 500);
}

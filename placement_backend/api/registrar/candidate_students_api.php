<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Content-Type: application/json; charset=UTF-8');

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

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
if ($userId <= 0) {
    candidateStudentsRespond(['success' => false, 'message' => 'Your session has expired. Please sign in again.'], 401);
}
if ($role !== 'registrar' && $role !== 'admin') {
    candidateStudentsRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$db = null;

$stream = trim((string) ($_GET['stream'] ?? ''));
$normalizedStream = preg_replace('/[\s_-]+/', '', strtolower($stream)) ?? strtolower($stream);
if (in_array($normalizedStream, ['natural', 'naturalscience', 'naturalsciences'], true)) {
    $normalizedStream = 'naturalscience';
} elseif (in_array($normalizedStream, ['social', 'socialscience', 'socialsciences'], true)) {
    $normalizedStream = 'socialscience';
}
$college = trim((string) ($_GET['college'] ?? ''));
$allValues = static function (string $value): bool {
    return $value === '' || strtolower($value) === 'all';
};
$normalizeStreamSql = static function (string $expression): string {
    return "LOWER(CONVERT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM({$expression}), ' ', ''), CHAR(9), ''), CHAR(10), ''), CHAR(13), ''), '_', ''), '-', '') USING utf8mb4))";
};
$normalizeCollegeSql = static function (string $expression): string {
    return "REPLACE(REPLACE(REPLACE(LOWER(TRIM(COALESCE({$expression}, ''))), 'college of ', ''), 'school of ', ''), 'sciences', 'science')";
};

try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        candidateStudentsRespond([
            'success' => false,
            'message' => 'Database connection is unavailable.',
            'error' => 'Database connection was not initialized.',
        ], 503);
    }
    $systemActiveSemester = 1;
    $settingsColumns = studentPlacementTableColumns($db, 'placement_settings');
    if (in_array('active_semester', $settingsColumns, true)) {
        $settingsResult = $db->query('SELECT active_semester FROM placement_settings WHERE id = 1 LIMIT 1');
        if (!$settingsResult) {
            throw new RuntimeException('Unable to load the active placement semester: ' . $db->error);
        }
        $systemActiveSemester = (int) ($settingsResult->fetch_assoc()['active_semester'] ?? 1);
        $settingsResult->free();
    }
    if (!in_array($systemActiveSemester, [1, 2], true)) {
        $systemActiveSemester = 1;
    }
    $activeSemester = (int) ($_GET['semester'] ?? $systemActiveSemester);
    if (!in_array($activeSemester, [1, 2], true)) {
        candidateStudentsRespond(['success' => false, 'message' => 'A valid placement semester is required.'], 400);
    }
    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    $userColumns = studentPlacementTableColumns($db, 'users');
    $choiceColumns = studentPlacementTableColumns($db, 'student_choices');
    $departmentColumns = studentPlacementTableColumns($db, 'departments');
    $mosheColumns = studentPlacementTableColumns($db, 'moshe_students');
    $simsColumns = studentPlacementTableColumns($db, 'sims_students');
    $placementColumns = studentPlacementTableColumns($db, 'placement_results');
    $unassignedColumns = studentPlacementTableColumns($db, 'unassigned_students');
    $collegeAllocationColumns = studentPlacementTableColumns($db, 'placement_college_allocations');

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
        $studentAccountId = 'u.id';
        $candidateIdExpression = "COALESCE(NULLIF(u.id, 0), {$admissionExpression})";
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
        if (
            in_array('user_id', $studentColumns, true)
            && (in_array('admission_number', $studentColumns, true) || in_array('id_number', $studentColumns, true))
        ) {
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
        $choicesJoin = ' LEFT JOIN student_choices sc ON (' . implode(' OR ', $choiceConditions) . ')'
            . (in_array('semester', $choiceColumns, true)
                ? ' AND sc.semester = ' . $activeSemester
                : '');
    }
    $departmentJoin = '';
    $choiceDepartmentIdColumn = in_array('dept_id', $choiceColumns, true)
        ? 'dept_id'
        : (in_array('department_id', $choiceColumns, true) ? 'department_id' : '');
    if (
        $choicesJoin !== '' && $departmentJoin === '' && $departmentColumns
        && in_array('id', $departmentColumns, true) && $choiceDepartmentIdColumn !== ''
    ) {
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
    $studentStreamExpression = studentPlacementTextExpression($studentColumns, 'sd', ['field_of_study', 'stream']);
    if ($mosheJoin !== '') {
        $studentStreamExpression = studentPlacementTextExpression(
            $studentColumns,
            'sd',
            ['field_of_study', 'stream'],
            studentPlacementTextExpression($mosheColumns, 'm', ['field_of_study'])
        );
    }
    $cgpaExpression = studentPlacementColumnExpression($studentColumns, 'sd', ['cgpa', 'gpa'], '0');
    $grade12Expression = studentPlacementColumnExpression($studentColumns, 'sd', ['total_mark', 'grade_12_result'], '0');
    $cocExpression = studentPlacementColumnExpression($studentColumns, 'sd', ['coc_score', 'coc_result'], '0');
    if ($simsJoin !== '') {
        $cgpaExpression = studentPlacementColumnExpression($simsColumns, 's', ['cgpa'], $cgpaExpression);
        $cocExpression = studentPlacementColumnExpression($simsColumns, 's', ['coc_score'], $cocExpression);
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
            $choiceCollegeExpression = "COALESCE(NULLIF(d.college_name, ''), {$choiceCollegeExpression}, '')";
        }
        if (in_array('stream', $departmentColumns, true)) {
            $choiceStreamExpression = "COALESCE(NULLIF(d.stream, ''), {$choiceStreamExpression}, '')";
        }
    }
    $studentPlacementStatusExpression = studentPlacementTextExpression(
        $studentColumns,
        'sd',
        ['placement_status', 'status']
    );
    
    $allocatedCollegeExpression = "''";
    $allocationCollegeColumn = in_array('college_name', $collegeAllocationColumns, true)
        ? 'college_name'
        : (in_array('allocated_college', $collegeAllocationColumns, true) ? 'allocated_college' : '');
    
    $excludedStatuses = "'inactive', 'disabled'";
    $statusConditions = [];
    foreach (['status', 'placement_status'] as $statusColumn) {
        if (in_array($statusColumn, $studentColumns, true)) {
            $statusConditions[] = "LOWER(TRIM(COALESCE(sd.`{$statusColumn}`, ''))) NOT IN ({$excludedStatuses})";
        }
    }
    $statusCondition = $statusConditions ? ' AND ' . implode(' AND ', $statusConditions) : '';
    
    $semesterChoiceMatchConditions = [];
    if (in_array('student_id', $choiceColumns, true)) {
        $semesterChoiceMatchConditions[] = "sc_match.student_id = {$studentAccountId}";
        if (in_array('user_id', $studentColumns, true)) {
            $semesterChoiceMatchConditions[] = 'sc_match.student_id = sd.user_id';
        }
        if (
            in_array('admission_number', $studentColumns, true)
            || in_array('id_number', $studentColumns, true)
        ) {
            $semesterChoiceMatchConditions[] = "TRIM(CAST(sc_match.student_id AS CHAR)) = TRIM({$admissionExpression})";
        }
    }
    if (in_array('user_id', $choiceColumns, true)) {
        $semesterChoiceMatchConditions[] = "sc_match.user_id = {$studentAccountId}";
    }
    if (in_array('admission_number', $choiceColumns, true)) {
        $semesterChoiceMatchConditions[] = "TRIM(sc_match.admission_number) = TRIM({$admissionExpression})";
    }
    $semesterTwoChoiceMatch = in_array('semester', $choiceColumns, true) && $semesterChoiceMatchConditions
        ? "EXISTS (
            SELECT 1 FROM student_choices sc_match
            WHERE (" . implode(' OR ', $semesterChoiceMatchConditions) . ")
              AND sc_match.semester = 2
        )"
        : '';
    
    $eligibleStatusConditions = [];
    if ($studentColumns) {
        $normalizedPlacementStatus = "LOWER(TRIM(COALESCE({$studentPlacementStatusExpression}, '')))";
        if ($activeSemester === 1) {
            $eligibleStatusConditions[] = "(
                {$normalizedPlacementStatus} IN ('pending', 'pending 1st semester', '', 'not assigned', 'unassigned')
                AND {$normalizedPlacementStatus} NOT LIKE '%2nd semester%'
            )";
        } else {
            $eligibleStatusConditions[] = "{$normalizedPlacementStatus} LIKE '%2nd semester%'";
        }
    }
    if ($activeSemester === 2 && $semesterTwoChoiceMatch !== '') {
        $eligibleStatusConditions[] = $semesterTwoChoiceMatch;
    }
    $eligibleStatusCondition = $eligibleStatusConditions
        ? '(' . implode(' OR ', $eligibleStatusConditions) . ')'
        : ($activeSemester === 1 ? '1 = 1' : '1 = 0');

    $maximumChoiceCount = 33;
    $choiceEligibilityConditions = [];
    if ($choicesJoin !== '') {
        $choiceEligibilityConditions[] = "NULLIF(TRIM(COALESCE({$choiceNameExpression}, '')), '') IS NOT NULL";
    }
    $choiceEligibilityCondition = $choiceEligibilityConditions
        ? '(' . implode(' AND ', $choiceEligibilityConditions) . ')'
        : '1 = 1';

    $sql = "SELECT {$candidateIdExpression} AS id, u.id AS account_id,
                {$admissionExpression} AS id_number, {$nameExpression} AS name,
                {$emailExpression} AS email, {$genderExpression} AS gender,
                {$studentStreamExpression} AS student_stream, {$regionExpression} AS region,
                {$studentPlacementStatusExpression} AS placement_status,
                {$allocatedCollegeExpression} AS allocated_college,
                {$benefitExpression} AS benefit_group, {$cgpaExpression} AS cgpa,
                {$grade12Expression} AS grade12, {$cocExpression} AS coc,
                {$choiceDeptIdExpression} AS dept_id, {$choiceNameExpression} AS dept_name,
                {$choiceCollegeExpression} AS college_name, {$choiceStreamExpression} AS choice_stream,
                {$choicePriorityExpression} AS priority,
                1 AS choice_eligible
            FROM student_data sd
            {$userJoin}
            {$mosheJoin}{$simsJoin}{$choicesJoin}{$departmentJoin}
            WHERE 1 = 1{$statusCondition} AND {$eligibleStatusCondition}";

    $types = '';
    $values = [];
    if (!$allValues($stream)) {
        $studentStreamForFilter = $normalizeStreamSql("COALESCE(NULLIF({$studentStreamExpression}, ''), '')");
        $sql .= " AND CASE
                        WHEN {$studentStreamForFilter} IN ('natural', 'naturalscience', 'naturalsciences') THEN 'naturalscience'
                        WHEN {$studentStreamForFilter} IN ('social', 'socialscience', 'socialsciences') THEN 'socialscience'
                        ELSE {$studentStreamForFilter}
                    END = ?";
        $types .= 's';
        $values[] = $normalizedStream;
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
                'status' => 'Pending',
                'placement_status' => trim((string) ($row['placement_status'] ?? '')),
                'allocated_college' => trim((string) ($row['allocated_college'] ?? '')),
                'choices' => [],
            ];
        }

        $priority = (int) ($row['priority'] ?? 0);
        if (
            $row['dept_name'] !== null
            && trim((string) $row['dept_name']) !== ''
        ) {
            $students[$id]['choices'][] = [
                'dept_id' => $row['dept_id'],
                'dept_name' => $row['dept_name'],
                'department' => $row['dept_name'],
                'college_name' => $row['college_name'] ?? '',
                'stream' => $row['choice_stream'] ?? '',
                'priority' => $priority > 0 ? $priority : count($students[$id]['choices']) + 1,
            ];
        }
    }
    foreach ($students as &$student) {
        usort(
            $student['choices'],
            static fn(array $left, array $right): int =>
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
        for ($priority = 1; $priority <= 33; $priority++) {
            $choice = $rankedChoices[$priority] ?? null;
            $student['choice_' . $priority] = $choice['dept_name'] ?? null;
        }
    }
    unset($student);
    $statement->close();
    $db->close();

    $candidateList = array_values($students);
    candidateStudentsRespond([
        'success' => true,
        'status' => 'success',
        'students' => $candidateList,
        'data' => $candidateList,
        'candidates' => $candidateList,
        'total' => count($candidateList),
        'filters' => [
            'stream' => $stream,
            'college' => $college,
            'semester' => $activeSemester,
            'active_semester' => $systemActiveSemester,
        ],
    ]);
} catch (Throwable $error) {
    error_log('Candidate student fetch failed: ' . $error->getMessage());
    if ($db instanceof mysqli) {
        $db->close();
    }
    candidateStudentsRespond([
        'success' => false,
        'message' => 'Unable to load candidate students.',
        'error' => $error->getMessage(),
    ], 500);
}
<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function choiceMatrixRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function choiceMatrixColumns(mysqli $db, string $table): array
{
    $statement = $db->prepare(
        'SELECT COUNT(*) AS table_count FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to inspect the choice matrix schema.');
    }
    $statement->bind_param('s', $table);
    if (!$statement->execute()) {
        $statement->close();
        throw new RuntimeException('Unable to inspect the choice matrix schema.');
    }
    $exists = (int) ($statement->get_result()->fetch_assoc()['table_count'] ?? 0) > 0;
    $statement->close();
    if (!$exists) {
        return [];
    }

    $result = $db->query("SHOW COLUMNS FROM `{$table}`");
    if (!$result) {
        throw new RuntimeException('Unable to inspect the choice matrix columns.');
    }
    $columns = array_column($result->fetch_all(MYSQLI_ASSOC), 'Field');
    $result->free();
    return $columns;
}

function choiceMatrixColumn(array $columns, string $alias, string $column, string $fallback = "''"): string
{
    return in_array($column, $columns, true) ? "`{$alias}`.`{$column}`" : $fallback;
}

function choiceMatrixTextExpression(array $columns, string $alias, array $names): string
{
    $expressions = [];
    foreach ($names as $name) {
        if (in_array($name, $columns, true)) {
            $expressions[] = "NULLIF(TRIM(`{$alias}`.`{$name}`), '')";
        }
    }
    return $expressions ? 'COALESCE(' . implode(', ', $expressions) . ", '')" : "''";
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    choiceMatrixRespond(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ((int) ($_SESSION['user_id'] ?? 0) <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    choiceMatrixRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    choiceMatrixRespond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

try {
    $choiceColumns = choiceMatrixColumns($db, 'student_choices');
    if (!$choiceColumns) {
        $db->close();
        choiceMatrixRespond(['success' => true, 'count' => 0, 'data' => [], 'students' => []]);
    }
    if (!in_array('priority', $choiceColumns, true)) {
        throw new RuntimeException('The student_choices table is missing priority.');
    }
    if (!in_array('student_id', $choiceColumns, true) && !in_array('admission_number', $choiceColumns, true)) {
        throw new RuntimeException('The student_choices table has no supported student identifier.');
    }

    $userColumns = choiceMatrixColumns($db, 'users');
    $profileColumns = choiceMatrixColumns($db, 'student_data');
    $departmentColumns = choiceMatrixColumns($db, 'departments');
    $placementColumns = choiceMatrixColumns($db, 'placement_results');
    $joins = '';

    $joinedUserColumns = [];
    if ($userColumns && in_array('student_id', $choiceColumns, true)
        && in_array('id', $userColumns, true)
    ) {
        $joins .= ' LEFT JOIN users u ON u.id = sc.student_id';
        $joinedUserColumns = $userColumns;
    } else {
        if ($userColumns) {
            $joins .= ' LEFT JOIN users u ON 1 = 0';
        }
    }

    $profileConditions = [];
    if ($profileColumns && in_array('user_id', $profileColumns, true) && in_array('student_id', $choiceColumns, true)) {
        $profileConditions[] = 'sd.user_id = sc.student_id';
    }
    if ($profileColumns && in_array('admission_number', $profileColumns, true)
        && in_array('admission_number', $choiceColumns, true)
    ) {
        $profileConditions[] = 'TRIM(sd.admission_number) = TRIM(sc.admission_number)';
    }
    if ($profileColumns && in_array('admission_number', $profileColumns, true)
        && in_array('id_number', $joinedUserColumns, true)
        && in_array('student_id', $choiceColumns, true)
    ) {
        $profileConditions[] = 'TRIM(sd.admission_number) = TRIM(u.id_number)';
    }
    if ($profileColumns && in_array('admission_number', $profileColumns, true)
        && in_array('student_id', $choiceColumns, true)
    ) {
        $profileConditions[] = 'TRIM(sd.admission_number) = TRIM(CAST(sc.student_id AS CHAR))';
    }
    $joinedProfileColumns = [];
    if ($profileConditions) {
        $joins .= ' LEFT JOIN student_data sd ON (' . implode(' OR ', $profileConditions) . ')';
        $joinedProfileColumns = $profileColumns;
    } elseif ($profileColumns) {
        $joins .= ' LEFT JOIN student_data sd ON 1 = 0';
    }

    $joinedDepartmentColumns = [];
    if ($departmentColumns && in_array('dept_id', $choiceColumns, true)
        && in_array('id', $departmentColumns, true)
    ) {
        $joins .= ' LEFT JOIN departments d ON d.id = sc.dept_id';
        $joinedDepartmentColumns = $departmentColumns;
    } elseif ($departmentColumns) {
        $joins .= ' LEFT JOIN departments d ON 1 = 0';
    }

    $admissionExpressions = [
        choiceMatrixTextExpression($choiceColumns, 'sc', ['admission_number']),
        choiceMatrixTextExpression($joinedProfileColumns, 'sd', ['admission_number', 'id_number']),
        choiceMatrixTextExpression($joinedUserColumns, 'u', ['id_number']),
    ];
    $studentIdExpression = in_array('student_id', $choiceColumns, true)
        ? 'CAST(sc.student_id AS CHAR)'
        : "''";
    $studentIdentifier = 'COALESCE(' . implode(', ', array_map(
        static fn($expression) => "NULLIF({$expression}, '')",
        $admissionExpressions
    )) . ", NULLIF({$studentIdExpression}, ''), '')";

    $nameParts = [];
    foreach (['given_name', 'father_name', 'grandfather_name'] as $column) {
        if (in_array($column, $joinedProfileColumns, true)) {
            $nameParts[] = "NULLIF(TRIM(sd.`{$column}`), '')";
        }
    }
    $nameExpression = $nameParts
        ? "COALESCE(NULLIF(CONCAT_WS(' ', " . implode(', ', $nameParts) . "), ''), "
            . 'NULLIF(' . choiceMatrixTextExpression($joinedUserColumns, 'u', ['username']) . ", ''), "
            . $studentIdentifier . ")"
        : 'COALESCE(NULLIF('
            . choiceMatrixTextExpression($joinedUserColumns, 'u', ['username']) . ", ''), "
            . $studentIdentifier . ')';

    $streamExpression = 'COALESCE('
        . 'NULLIF(' . choiceMatrixTextExpression($choiceColumns, 'sc', ['stream']) . ", ''), "
        . 'NULLIF(' . choiceMatrixTextExpression($joinedProfileColumns, 'sd', ['field_of_study', 'stream']) . ", ''), "
        . choiceMatrixTextExpression($joinedUserColumns, 'u', ['stream'])
        . ')';
    $statusExpression = 'COALESCE('
        . 'NULLIF(' . choiceMatrixTextExpression($joinedProfileColumns, 'sd', ['placement_status', 'status']) . ", ''), "
        . choiceMatrixTextExpression($joinedUserColumns, 'u', ['status'])
        . ')';
    $departmentExpression = 'COALESCE('
        . 'NULLIF(' . choiceMatrixTextExpression($choiceColumns, 'sc', ['dept_name', 'department_name']) . ", ''), "
        . choiceMatrixTextExpression($joinedDepartmentColumns, 'd', ['name'])
        . ')';
    $collegeExpression = 'COALESCE('
        . 'NULLIF(' . choiceMatrixTextExpression($choiceColumns, 'sc', ['college_name']) . ", ''), "
        . choiceMatrixTextExpression($joinedDepartmentColumns, 'd', ['college_name'])
        . ')';
    $storedSemesterExpression = choiceMatrixColumn($choiceColumns, 'sc', 'semester', '1');
    $semesterExpression = $storedSemesterExpression;
    if (in_array('offered_semester', $joinedDepartmentColumns, true)) {
        $stageOnePlacementIdentity = [];
        if (in_array('student_id', $choiceColumns, true)
            && in_array('student_id', $placementColumns, true)
        ) {
            $stageOnePlacementIdentity[] = 'pr.student_id = sc.student_id';
        }
        if (in_array('admission_number', $choiceColumns, true)
            && in_array('admission_number', $placementColumns, true)
        ) {
            $stageOnePlacementIdentity[] = 'TRIM(pr.admission_number) = TRIM(sc.admission_number)';
        }
        $stageOneSemesterCondition = in_array('placement_semester', $placementColumns, true)
            ? ' AND pr.placement_semester = 1'
            : '';
        $hasStageOnePlacement = $stageOnePlacementIdentity
            ? 'EXISTS (SELECT 1 FROM placement_results pr WHERE ('
                . implode(' OR ', $stageOnePlacementIdentity) . ')'
                . $stageOneSemesterCondition . ')'
            : '0 = 1';
        $semesterExpression = "(CASE
            WHEN {$storedSemesterExpression} = 2
              OR ((LOWER(TRIM({$statusExpression})) = 'pending 2nd semester'
                   OR {$hasStageOnePlacement})
                  AND d.offered_semester = 2)
            THEN 2
            ELSE 1
        END)";
    }

    $sql = "SELECT {$studentIdentifier} AS student_id,
                   {$nameExpression} AS student_name,
                   " . choiceMatrixTextExpression($joinedUserColumns, 'u', ['email']) . " AS email,
                   {$streamExpression} AS stream,
                   {$statusExpression} AS status,
                   sc.priority AS priority,
                   {$departmentExpression} AS department_name,
                   {$collegeExpression} AS college_name,
                   {$semesterExpression} AS semester,
                   " . choiceMatrixColumn($choiceColumns, 'sc', 'dept_id', 'NULL') . " AS department_id
            FROM student_choices sc{$joins}
            ORDER BY 1 ASC, sc.priority ASC";
    $result = $db->query($sql);
    if (!$result) {
        throw new RuntimeException('Unable to query submitted student preferences: ' . $db->error);
    }

    $matrix = [];
    while ($row = $result->fetch_assoc()) {
        $studentId = trim((string) ($row['student_id'] ?? ''));
        if ($studentId === '') {
            continue;
        }
        $key = strtolower($studentId);
        if (!isset($matrix[$key])) {
            $matrix[$key] = [
                'student_id' => $studentId,
                'student_name' => trim((string) ($row['student_name'] ?? '')) ?: 'Unknown Student',
                'email' => trim((string) ($row['email'] ?? '')),
                'stream' => trim((string) ($row['stream'] ?? '')),
                'status' => trim((string) ($row['status'] ?? '')),
                'choices' => [],
                'choice_1' => '',
                'choice_2' => '',
                'choice_3' => '',
                'choice_4' => '',
                'choice_5' => '',
                'sem1_choices' => [],
                'sem2_choices' => [],
            ];
        }

        $priority = (int) ($row['priority'] ?? 0);
        $departmentName = trim((string) ($row['department_name'] ?? ''));
        if ($priority < 1 || $departmentName === '') {
            continue;
        }
        $choiceKey = 'choice_' . $priority;
        if (!isset($matrix[$key][$choiceKey]) || $matrix[$key][$choiceKey] === '') {
            $matrix[$key][$choiceKey] = $departmentName;
        }
        $collegeName = trim((string) ($row['college_name'] ?? ''));
        $semester = (int) ($row['semester'] ?? 1);
        $departmentId = isset($row['department_id']) && (int) $row['department_id'] > 0
            ? (int) $row['department_id']
            : null;
        $choice = [
            'priority' => $priority,
            'dept_name' => $departmentName,
            'department' => $departmentName,
            'department_id' => $departmentId,
            'is_broad_group' => $departmentId === null,
            'college_name' => $collegeName,
            'college' => $collegeName,
            'semester' => in_array($semester, [1, 2], true) ? $semester : 1,
            'stream' => trim((string) ($row['stream'] ?? '')),
        ];
        $matrix[$key]['choices'][] = $choice;
        $semesterChoiceKey = 'choice' . $priority;
        if ($semester === 2) {
            $matrix[$key]['sem2_choices'][$semesterChoiceKey] = $choice;
        } else {
            $matrix[$key]['sem1_choices'][$semesterChoiceKey] = $choice;
        }
    }
    $result->free();
    $db->close();

    $students = array_values($matrix);
    choiceMatrixRespond([
        'success' => true,
        'count' => count($students),
        'data' => $students,
        'students' => $students,
    ]);
} catch (Throwable $error) {
    error_log('Student choice matrix failed: ' . $error->getMessage());
    $db->close();
    choiceMatrixRespond(['success' => false, 'message' => 'Unable to load student choice data.'], 500);
}

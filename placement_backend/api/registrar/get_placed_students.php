<?php
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
header('Content-Type: application/json; charset=UTF-8');

function placedStudentsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    placedStudentsResponse(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    placedStudentsResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    placedStudentsResponse(['success' => false, 'message' => 'Unable to connect to the database.'], 500);
}

try {
    $placementColumns = studentPlacementTableColumns($db, 'placement_results');
    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    $userColumns = studentPlacementTableColumns($db, 'users');
    $departmentColumns = studentPlacementTableColumns($db, 'departments');

    $placementStudentId = in_array('student_id', $placementColumns, true) ? 'pr.student_id' : 'NULL';
    $idNumberParts = [];
    foreach ([
        ['pr', $placementColumns, ['admission_number', 'id_number']],
        ['sd', $studentColumns, ['admission_number', 'id_number']],
        ['u', $userColumns, ['id_number']],
    ] as [$alias, $columns, $candidates]) {
        foreach ($candidates as $column) {
            if (in_array($column, $columns, true)) {
                $idNumberParts[] = "NULLIF(TRIM(`{$alias}`.`{$column}`), '')";
            }
        }
    }
    $idNumberExpression = $idNumberParts ? 'COALESCE(' . implode(', ', $idNumberParts) . ", '')" : "''";
    $universityStudentIdExpression = studentPlacementTextExpression(
        $studentColumns,
        'sd',
        ['student_id'],
        "''"
    );

    $studentJoinConditions = [];
    if (in_array('user_id', $studentColumns, true) && in_array('student_id', $placementColumns, true)) {
        $studentJoinConditions[] = 'sd.user_id = pr.student_id';
    }
    foreach (['admission_number', 'id_number'] as $studentIdentifier) {
        if (!in_array($studentIdentifier, $studentColumns, true)) continue;
        foreach (['admission_number', 'id_number'] as $placementIdentifier) {
            if (in_array($placementIdentifier, $placementColumns, true)) {
                $studentJoinConditions[] = "TRIM(sd.`{$studentIdentifier}`) = TRIM(pr.`{$placementIdentifier}`)";
            }
        }
    }
    $studentJoin = $studentJoinConditions ? implode(' OR ', array_unique($studentJoinConditions)) : '1 = 0';

    $userJoinConditions = [];
    if (in_array('id', $userColumns, true) && in_array('student_id', $placementColumns, true)) {
        $userJoinConditions[] = 'u.id = pr.student_id';
    }
    if (in_array('id', $userColumns, true) && in_array('user_id', $studentColumns, true)) {
        $userJoinConditions[] = 'u.id = sd.user_id';
    }
    if (in_array('id_number', $userColumns, true)) {
        foreach (['admission_number', 'id_number'] as $placementIdentifier) {
            if (in_array($placementIdentifier, $placementColumns, true)) {
                $userJoinConditions[] = "TRIM(u.id_number) = TRIM(pr.`{$placementIdentifier}`)";
            }
        }
    }
    $userJoin = $userJoinConditions ? implode(' OR ', array_unique($userJoinConditions)) : '1 = 0';
    if (in_array('role', $userColumns, true)) {
        $userJoin = "({$userJoin}) AND LOWER(TRIM(u.role)) = 'student'";
    }

    $departmentJoin = '';
    if (in_array('dept_id', $placementColumns, true) && in_array('id', $departmentColumns, true)) {
        $departmentJoin = ' LEFT JOIN departments d ON d.id = pr.dept_id';
    }
    $nameParts = [];
    foreach ([
        ['sd', $studentColumns, ['given_name', 'first_name']],
        ['sd', $studentColumns, ['father_name', 'last_name']],
        ['sd', $studentColumns, ['grandfather_name', 'grand_father_name']],
        ['u', $userColumns, ['first_name']],
        ['u', $userColumns, ['last_name']],
    ] as [$alias, $columns, $candidates]) {
        foreach ($candidates as $column) {
            if (in_array($column, $columns, true)) {
                $nameParts[] = "NULLIF(TRIM(`{$alias}`.`{$column}`), '')";
                break;
            }
        }
    }
    $nameExpression = $nameParts
        ? "COALESCE(NULLIF(TRIM(CONCAT_WS(' ', " . implode(', ', $nameParts) . ")), ''), 'Student')"
        : "'Student'";
    $emailParts = [];
    foreach ([['sd', $studentColumns], ['u', $userColumns]] as [$alias, $columns]) {
        if (in_array('email', $columns, true)) {
            $emailParts[] = "NULLIF(TRIM(`{$alias}`.email), '')";
        }
    }
    $emailExpression = $emailParts ? 'COALESCE(' . implode(', ', $emailParts) . ", '')" : "''";
    $departmentExpression = studentPlacementTextExpression($placementColumns, 'pr', ['dept_name', 'department_name']);
    if ($departmentJoin !== '' && in_array('name', $departmentColumns, true)) {
        $departmentExpression = "COALESCE(NULLIF({$departmentExpression}, ''), d.name, '')";
    }
    $streamExpression = studentPlacementTextExpression($placementColumns, 'pr', ['stream']);
    $studentStreamExpression = studentPlacementTextExpression($studentColumns, 'sd', ['stream', 'field_of_study']);
    $streamExpression = "COALESCE(NULLIF({$streamExpression}, ''), NULLIF({$studentStreamExpression}, ''), '')";
    $collegeExpression = studentPlacementTextExpression($placementColumns, 'pr', ['college_name']);
    if ($departmentJoin !== '' && in_array('college_name', $departmentColumns, true)) {
        $collegeExpression = "COALESCE(NULLIF({$collegeExpression}, ''), d.college_name, '')";
    }
    $scoreExpression = studentPlacementColumnExpression($placementColumns, 'pr', ['final_score', 'cumulative_score']);
    $choiceExpression = studentPlacementColumnExpression($placementColumns, 'pr', ['choice_rank', 'priority'], '0');
    $statusExpression = studentPlacementTextExpression($placementColumns, 'pr', ['status'], "'Placed'");
    $semesterExpression = studentPlacementColumnExpression($placementColumns, 'pr', ['placement_semester'], '1');
    $storedSemesterExpression = "CAST(
        COALESCE(NULLIF(TRIM(CAST({$semesterExpression} AS CHAR)), ''), '1')
        AS UNSIGNED
    )";
    $normalizedSemesterExpression = "CASE
        WHEN LOWER(TRIM(COALESCE({$statusExpression}, ''))) = 'pending 2nd semester' THEN 2
        ELSE {$storedSemesterExpression}
    END";
    $orderParts = [];
    if (in_array('placed_at', $placementColumns, true)) {
        $orderParts[] = 'pr.placed_at DESC';
    }
    foreach (['id', 'student_id', 'admission_number', 'id_number'] as $orderColumn) {
        if (in_array($orderColumn, $placementColumns, true)) {
            $orderParts[] = "pr.`{$orderColumn}` DESC";
            break;
        }
    }
    $placementOrder = $orderParts ? implode(', ', $orderParts) : '1';

    $result = $db->query(
        "SELECT {$placementStudentId} AS account_id,
                {$universityStudentIdExpression} AS university_student_id,
                {$idNumberExpression} AS id_number,
                {$nameExpression} AS name,
                {$emailExpression} AS email,
                {$streamExpression} AS stream,
                {$collegeExpression} AS college,
                {$departmentExpression} AS department,
                {$scoreExpression} AS final_score,
                {$choiceExpression} AS choice_rank,
                {$statusExpression} AS status,
                {$normalizedSemesterExpression} AS placement_semester
         FROM placement_results pr
         LEFT JOIN student_data sd ON {$studentJoin}
         LEFT JOIN users u ON {$userJoin}{$departmentJoin}
         WHERE NULLIF(TRIM({$departmentExpression}), '') IS NOT NULL
           AND LOWER(TRIM(COALESCE({$statusExpression}, ''))) NOT IN ('rejected', 'unassigned', 'cancelled', 'canceled')
           AND ({$normalizedSemesterExpression}) IN (1, 2)
         ORDER BY {$placementOrder}"
    );
    if (!$result) {
        throw new RuntimeException('Unable to query placed students: ' . $db->error);
    }

    $students = [];
    while ($row = $result->fetch_assoc()) {
        $universityStudentId = (string) ($row['university_student_id'] ?? '');
        $accountId = $row['account_id'] !== null ? (int) $row['account_id'] : null;
        $students[] = [
            'id' => $accountId ?? $universityStudentId,
            'account_id' => $accountId,
            'student_id' => $universityStudentId,
            'university_student_id' => $universityStudentId,
            'id_number' => $universityStudentId,
            'name' => (string) $row['name'],
            'email' => (string) ($row['email'] ?? ''),
            'status' => (string) $row['status'],
            'stream' => (string) ($row['stream'] ?? ''),
            'college' => (string) ($row['college'] ?? ''),
            'department' => (string) $row['department'],
            'final_score' => $row['final_score'] !== null ? (float) $row['final_score'] : null,
            'cumulativeScore' => $row['final_score'] !== null ? (float) $row['final_score'] : null,
            'choice_rank' => (int) ($row['choice_rank'] ?? 0),
            'placement_semester' => (int) ($row['placement_semester'] ?? 1),
        ];
    }

    $result->free();

    $allocationColumns = studentPlacementTableColumns($db, 'placement_college_allocations');
    if (in_array('target_semester', $allocationColumns, true)
        && in_array('status', $allocationColumns, true)
        && in_array('admission_number', $allocationColumns, true)) {
        $allocationStudentJoinConditions = [];
        if (in_array('student_id', $allocationColumns, true)
            && in_array('user_id', $studentColumns, true)) {
            $allocationStudentJoinConditions[] = 'sd.user_id = pca.student_id';
        }
        foreach (['admission_number', 'id_number'] as $studentIdentifier) {
            if (!in_array($studentIdentifier, $studentColumns, true)) continue;
            $allocationStudentJoinConditions[] = "TRIM(sd.`{$studentIdentifier}`) = TRIM(pca.admission_number)";
        }

        $existingResultConditions = [];
        if (in_array('student_id', $allocationColumns, true)
            && in_array('student_id', $placementColumns, true)) {
            $existingResultConditions[] = 'pr2.student_id = pca.student_id';
        }
        foreach (['admission_number', 'id_number'] as $placementIdentifier) {
            if (!in_array($placementIdentifier, $placementColumns, true)) continue;
            $existingResultConditions[] = "TRIM(pr2.`{$placementIdentifier}`) = TRIM(pca.admission_number)";
        }

        if ($allocationStudentJoinConditions && $existingResultConditions) {
            $allocationUserJoinConditions = [];
            if (in_array('id', $userColumns, true) && in_array('student_id', $allocationColumns, true)) {
                $allocationUserJoinConditions[] = 'u.id = pca.student_id';
            }
            if (in_array('id', $userColumns, true) && in_array('user_id', $studentColumns, true)) {
                $allocationUserJoinConditions[] = 'u.id = sd.user_id';
            }
            if (in_array('id_number', $userColumns, true)) {
                $allocationUserJoinConditions[] = 'TRIM(u.id_number) = TRIM(pca.admission_number)';
            }
            $allocationUserJoin = $allocationUserJoinConditions
                ? implode(' OR ', array_unique($allocationUserJoinConditions))
                : '1 = 0';
            if (in_array('role', $userColumns, true)) {
                $allocationUserJoin = "({$allocationUserJoin}) AND LOWER(TRIM(u.role)) = 'student'";
            }

            $allocationNameParts = [];
            foreach ([
                ['sd', $studentColumns, ['given_name', 'first_name']],
                ['sd', $studentColumns, ['father_name', 'last_name']],
                ['sd', $studentColumns, ['grandfather_name', 'grand_father_name']],
                ['u', $userColumns, ['first_name']],
                ['u', $userColumns, ['last_name']],
            ] as [$alias, $columns, $candidates]) {
                foreach ($candidates as $column) {
                    if (in_array($column, $columns, true)) {
                        $allocationNameParts[] = "NULLIF(TRIM(`{$alias}`.`{$column}`), '')";
                        break;
                    }
                }
            }
            $allocationNameExpression = $allocationNameParts
                ? "COALESCE(NULLIF(TRIM(CONCAT_WS(' ', " . implode(', ', $allocationNameParts) . ")), ''), 'Student')"
                : "'Student'";
            $allocationEmailParts = [];
            foreach ([['sd', $studentColumns], ['u', $userColumns]] as [$alias, $columns]) {
                if (in_array('email', $columns, true)) {
                    $allocationEmailParts[] = "NULLIF(TRIM(`{$alias}`.email), '')";
                }
            }
            $allocationEmailExpression = $allocationEmailParts
                ? 'COALESCE(' . implode(', ', $allocationEmailParts) . ", '')"
                : "''";
            $allocationStudentId = in_array('student_id', $allocationColumns, true)
                ? 'pca.student_id'
                : 'NULL';
            $allocationStream = studentPlacementTextExpression($allocationColumns, 'pca', ['stream']);
            $allocationCollege = studentPlacementTextExpression($allocationColumns, 'pca', ['college_name']);
            $allocationScore = studentPlacementColumnExpression(
                $studentColumns,
                'sd',
                ['cumulative_score', 'final_score', 'gpa'],
                'NULL'
            );
            $allocationUniversityStudentId = studentPlacementTextExpression(
                $studentColumns,
                'sd',
                ['student_id'],
                "''"
            );
            $pendingAllocationResult = $db->query(
                "SELECT {$allocationStudentId} AS account_id,
                        {$allocationUniversityStudentId} AS university_student_id,
                        {$allocationNameExpression} AS name,
                        {$allocationEmailExpression} AS email,
                        {$allocationStream} AS stream,
                        {$allocationCollege} AS college,
                        '' AS department,
                        {$allocationScore} AS final_score,
                        0 AS choice_rank,
                        'Pending 2nd Semester' AS status,
                        2 AS placement_semester
                 FROM placement_college_allocations pca
                 LEFT JOIN student_data sd ON " . implode(' OR ', array_unique($allocationStudentJoinConditions)) . "
                 LEFT JOIN users u ON {$allocationUserJoin}
                 WHERE pca.target_semester = 2
                   AND LOWER(TRIM(COALESCE(pca.status, ''))) = 'pending'
                   AND NOT EXISTS (
                       SELECT 1 FROM placement_results pr2
                       WHERE (" . implode(' OR ', array_unique($existingResultConditions)) . ")
                   )"
            );
            if (!$pendingAllocationResult) {
                throw new RuntimeException('Unable to query pending semester-two allocations: ' . $db->error);
            }
            while ($row = $pendingAllocationResult->fetch_assoc()) {
                $accountId = $row['account_id'] !== null ? (int) $row['account_id'] : null;
                $universityStudentId = (string) ($row['university_student_id'] ?? '');
                $score = $row['final_score'] !== null && is_numeric($row['final_score'])
                    ? (float) $row['final_score']
                    : null;
                $students[] = [
                    'id' => $accountId ?? $universityStudentId,
                    'account_id' => $accountId,
                    'student_id' => $universityStudentId,
                    'university_student_id' => $universityStudentId,
                    'id_number' => $universityStudentId,
                    'name' => (string) $row['name'],
                    'email' => (string) ($row['email'] ?? ''),
                    'status' => (string) $row['status'],
                    'stream' => (string) ($row['stream'] ?? ''),
                    'college' => (string) ($row['college'] ?? ''),
                    'department' => '',
                    'final_score' => $score,
                    'cumulativeScore' => $score,
                    'choice_rank' => 0,
                    'placement_semester' => 2,
                ];
            }
            $pendingAllocationResult->free();
        }
    }

    $studentsByIdentity = [];
    foreach ($students as $student) {
        $identity = trim((string) ($student['student_id'] ?? ''));
        if ($identity === '') {
            $identity = trim((string) ($student['account_id'] ?? $student['id'] ?? ''));
        }
        if ($identity === '') {
            $studentsByIdentity[] = $student;
            continue;
        }
        $identity = strtolower($identity);
        if (!isset($studentsByIdentity[$identity])
            || (
                (int) ($student['placement_semester'] ?? 1) === 2
                && (int) ($studentsByIdentity[$identity]['placement_semester'] ?? 1) !== 2
            )) {
            $studentsByIdentity[$identity] = $student;
        }
    }
    $students = array_values($studentsByIdentity);

    $db->close();
    placedStudentsResponse([
        'success' => true,
        'students' => $students,
        'count' => count($students),
    ]);
} catch (Throwable $error) {
    error_log('Placed students load failed: ' . $error->getMessage());
    $db->close();
    placedStudentsResponse(['success' => false, 'message' => 'Unable to load placed students.'], 500);
}

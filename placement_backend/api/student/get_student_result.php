<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function studentResultResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $db = getDbConnection();
} catch (Throwable $error) {
    error_log('Student result database connection failed: ' . $error->getMessage());
    studentResultResponse(['success' => false, 'message' => 'Student result is temporarily unavailable.'], 503);
}

$studentId = trim((string) ($_GET['student_id'] ?? $_POST['student_id'] ?? ''));
if ($studentId === '') {
    $db->close();
    studentResultResponse(['success' => false, 'message' => 'Student ID is required.'], 400);
}

$studentColumnsResult = $db->query('SHOW COLUMNS FROM student_data');
if (!$studentColumnsResult) {
    error_log('Unable to inspect student result columns: ' . $db->error);
    $db->close();
    studentResultResponse(['success' => false, 'message' => 'Unable to load student result.'], 500);
}
$studentColumns = array_column($studentColumnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
$studentColumnsResult->free();
$hasStudentColumn = static fn (string $name): bool => in_array($name, $studentColumns, true);
$studentField = static function (string $name) use ($hasStudentColumn): string {
    return $hasStudentColumn($name) ? "sd.`{$name}`" : 'NULL';
};
$studentCoalesce = static function (string ...$fields): string {
    $fields = array_values(array_filter($fields, static fn (string $field): bool => $field !== 'NULL'));
    if (!$fields) return 'NULL';
    return count($fields) === 1 ? $fields[0] : 'COALESCE(' . implode(', ', $fields) . ')';
};
$studentIdentifiers = array_values(array_filter(
    ['admission_number', 'id_number', 'user_id'],
    $hasStudentColumn
));
if (!$studentIdentifiers) {
    $db->close();
    studentResultResponse(['success' => false, 'message' => 'Student identifier is not available in the student table.'], 500);
}

$accountId = $studentField('user_id');
$userJoin = '1 = 0';
$usersColumnsResult = $db->query('SHOW COLUMNS FROM users');
if ($usersColumnsResult) {
    $usersColumns = array_column($usersColumnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $usersColumnsResult->free();
    if (in_array('id', $usersColumns, true)) {
        $joinConditions = [];
        if ($hasStudentColumn('user_id')) {
            $joinConditions[] = 'u.id = sd.user_id';
        }
        if ($hasStudentColumn('admission_number') && in_array('id_number', $usersColumns, true)) {
            $joinConditions[] = 'u.id_number = sd.admission_number';
        }
        if ($hasStudentColumn('id_number') && in_array('id_number', $usersColumns, true)) {
            $joinConditions[] = 'u.id_number = sd.id_number';
        }
        if ($joinConditions) {
            $userJoin = implode(' OR ', $joinConditions);
            $accountId = $studentCoalesce($accountId, 'u.id');
        }
    }
} else {
    $usersColumns = [];
}

$studentSelect = [
    $accountId . ' AS user_id',
    $studentCoalesce($studentField('admission_number'), $studentField('id_number')) . ' AS admission_number',
    $studentCoalesce($studentField('given_name'), $studentField('first_name')) . ' AS given_name',
    $studentCoalesce($studentField('father_name'), $studentField('last_name')) . ' AS father_name',
    $studentField('email') . ' AS email',
    $studentField('status') . ' AS status',
    $studentField('department') . ' AS department',
    $studentCoalesce($studentField('stream'), $studentField('field_of_study')) . ' AS stream',
    $studentCoalesce($studentField('cumulative_score'), $studentField('cumulative_avg')) . ' AS cumulative_score',
];
$whereConditions = [];
foreach ($studentIdentifiers as $identifierColumn) {
    $whereConditions[] = "sd.`{$identifierColumn}` = ?";
}
$usersHasIdNumber = in_array('id_number', $usersColumns, true);
if ($usersHasIdNumber && $userJoin !== '1 = 0') {
    $whereConditions[] = 'u.id_number = ?';
}
$studentSql = 'SELECT ' . implode(', ', $studentSelect)
    . ' FROM student_data sd LEFT JOIN users u ON ' . $userJoin
    . ' WHERE (' . implode(' OR ', $whereConditions) . ') LIMIT 1';
$studentStatement = $db->prepare($studentSql);
if (!$studentStatement) {
    error_log('Unable to prepare student result query: ' . $db->error);
    $db->close();
    studentResultResponse(['success' => false, 'message' => 'Unable to load student result.'], 500);
}
$studentParameters = array_fill(0, count($studentIdentifiers), $studentId);
if ($usersHasIdNumber && $userJoin !== '1 = 0') {
    $studentParameters[] = $studentId;
}
$studentTypes = str_repeat('s', count($studentParameters));
$studentBindArguments = [$studentTypes];
foreach ($studentParameters as $index => $value) {
    $studentBindArguments[] = &$studentParameters[$index];
}
if (!call_user_func_array([$studentStatement, 'bind_param'], $studentBindArguments) || !$studentStatement->execute()) {
    error_log('Unable to load student result: ' . $studentStatement->error);
    $studentStatement->close();
    $db->close();
    studentResultResponse(['success' => false, 'message' => 'Unable to load student result.'], 500);
}
$student = $studentStatement->get_result()->fetch_assoc();
$studentStatement->close();

if (!$student) {
    $db->close();
    studentResultResponse([
        'success' => true,
        'published' => false,
        'assigned' => false,
        'student' => null,
        'placement' => null,
        'is_placed' => false,
        'message' => 'Student not found',
    ]);
}

$admissionNumber = trim((string) ($student['admission_number'] ?? '')) ?: $studentId;
$numericId = (int) ($student['user_id'] ?? 0);
$department = trim((string) ($student['department'] ?? ''));
$isAssigned = $department !== '' && !in_array(strtolower($department), ['not assigned', 'null'], true);

$placementColumnsResult = $db->query('SHOW COLUMNS FROM placement_results');
$placement = null;
if ($placementColumnsResult) {
    $placementColumns = array_column($placementColumnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $placementColumnsResult->free();
    $placementIdentifiers = array_values(array_filter(
        ['admission_number', 'id_number', 'student_id'],
        static fn (string $column): bool => in_array($column, $placementColumns, true)
    ));
    if ($placementIdentifiers) {
        $placementWhere = implode(' OR ', array_map(
            static fn (string $column): string => "`{$column}` = ?",
            $placementIdentifiers
        ));
        $order = in_array('id', $placementColumns, true) ? ' ORDER BY `id` DESC' : '';
        $placementStatement = $db->prepare(
            "SELECT * FROM placement_results WHERE ({$placementWhere}){$order} LIMIT 1"
        );
        if ($placementStatement) {
            $placementParameters = array_map(
                static fn (string $column): string => $column === 'student_id' && $numericId > 0
                    ? (string) $numericId
                    : $admissionNumber,
                $placementIdentifiers
            );
            $placementTypes = str_repeat('s', count($placementParameters));
            $placementBindArguments = [$placementTypes];
            foreach ($placementParameters as $index => $value) {
                $placementBindArguments[] = &$placementParameters[$index];
            }
            if (call_user_func_array([$placementStatement, 'bind_param'], $placementBindArguments)
                && $placementStatement->execute()) {
                $placement = $placementStatement->get_result()->fetch_assoc() ?: null;
            } else {
                error_log('Unable to load placement result: ' . $placementStatement->error);
            }
            $placementStatement->close();
        } else {
            error_log('Unable to prepare placement result query: ' . $db->error);
        }
    }
} else {
    error_log('Unable to inspect placement result columns: ' . $db->error);
}

$effectiveDepartment = $isAssigned ? $department : trim((string) ($placement['dept_name'] ?? 'Not assigned'));
$resultStatus = strtolower(trim((string) ($placement['status'] ?? '')));
$isPublished = in_array($resultStatus, ['approved', 'published'], true);
$db->close();

studentResultResponse([
    'success' => true,
    'published' => $isPublished,
    'assigned' => $isAssigned,
    'student' => [
        'id' => $numericId,
        'id_number' => $admissionNumber,
        'name' => trim((string) ($student['given_name'] ?? '') . ' ' . (string) ($student['father_name'] ?? '')),
        'email' => $student['email'] ?? '',
        'status' => $student['status'] ?? ($isAssigned ? 'Assigned' : 'Pending'),
        'department' => $effectiveDepartment,
    ],
    'placement' => [
        'id_number' => $admissionNumber,
        'assigned_department' => $effectiveDepartment,
        'college' => $placement['college_name'] ?? '',
        'stream' => $placement['stream'] ?? $student['stream'] ?? 'N/A',
        'choice_rank' => (int) ($placement['choice_rank'] ?? 0),
        'merit_score' => (float) ($placement['final_score'] ?? $student['cumulative_score'] ?? 0),
        'placement_status' => $placement['status'] ?? ($isAssigned ? 'Assigned' : 'Pending'),
    ],
    'is_placed' => $isAssigned,
    'top_preferences' => [],
    'message' => $isAssigned ? 'Student result loaded successfully.' : 'You are currently unassigned.',
]);
?>

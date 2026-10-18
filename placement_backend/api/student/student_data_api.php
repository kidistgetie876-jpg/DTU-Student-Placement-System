<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header("Content-Type: application/json");
include __DIR__ . '/../../config/db_config.php';
try {
    $db = getDbConnection();
} catch (Throwable $error) {
    error_log('Student profile database connection failed: ' . $error->getMessage());
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'Student data is temporarily unavailable because the database connection failed.']);
    exit;
}

$studentId = trim((string) ($_GET['student_id'] ?? ''));
$email = trim((string) ($_GET['email'] ?? ''));

$studentColumnsResult = $db->query('SHOW COLUMNS FROM student_data');
$userColumnsResult = $db->query('SHOW COLUMNS FROM users');
if (!$studentColumnsResult || !$userColumnsResult) {
    error_log('Unable to inspect student profile database columns: ' . $db->error);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to load student data.']);
    $db->close();
    exit;
}

$studentColumns = array_column($studentColumnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
$userColumns = array_column($userColumnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
$studentColumnsResult->free();
$userColumnsResult->free();

$column = static function (string $table, array $availableColumns, string $name): string {
    return in_array($name, $availableColumns, true) ? "{$table}.`{$name}`" : 'NULL';
};
$coalesce = static function (string ...$expressions): string {
    $availableExpressions = array_values(array_filter($expressions, static fn (string $expression): bool => $expression !== 'NULL'));
    if (count($availableExpressions) === 0) return 'NULL';
    if (count($availableExpressions) === 1) return $availableExpressions[0];
    return 'COALESCE(' . implode(', ', $availableExpressions) . ')';
};

$studentColumn = static fn (string $name): string => $column('student_data', $studentColumns, $name);
$userColumn = static fn (string $name): string => $column('users', $userColumns, $name);
$resolvedUserId = $coalesce($studentColumn('user_id'), $userColumn('id'));
$userJoinConditions = [];
if ($studentColumn('user_id') !== 'NULL' && $userColumn('id') !== 'NULL') {
    $userJoinConditions[] = 'users.id = student_data.user_id';
}
if ($studentColumn('admission_number') !== 'NULL' && $userColumn('id_number') !== 'NULL') {
    $userJoinConditions[] = 'users.id_number = student_data.admission_number';
}
if ($studentColumn('id_number') !== 'NULL' && $userColumn('id_number') !== 'NULL') {
    $userJoinConditions[] = 'users.id_number = student_data.id_number';
}
$fields = [
    $resolvedUserId . ' AS id',
    $resolvedUserId . ' AS user_id',
    $coalesce($studentColumn('admission_number'), $studentColumn('id_number'), $userColumn('id_number')) . ' AS id_number',
    $coalesce($studentColumn('given_name'), $studentColumn('first_name'), $userColumn('first_name'), $studentColumn('username')) . ' AS first_name',
    $coalesce($studentColumn('father_name'), $studentColumn('last_name'), $userColumn('last_name')) . ' AS last_name',
    $coalesce($studentColumn('given_name'), $studentColumn('first_name'), $userColumn('first_name'), $studentColumn('username')) . ' AS given_name',
    $coalesce($studentColumn('father_name'), $studentColumn('last_name'), $userColumn('last_name')) . ' AS father_name',
    $studentColumn('grandfather_name') . ' AS grandfather_name',
    $studentColumn('region') . ' AS region',
    $coalesce($studentColumn('username'), $userColumn('username')) . ' AS username',
    $coalesce($studentColumn('email'), $userColumn('email')) . ' AS email',
    $coalesce($studentColumn('gpa'), $studentColumn('cgpa')) . ' AS gpa',
    $coalesce($studentColumn('cgpa'), $studentColumn('gpa')) . ' AS cgpa',
    $studentColumn('stream') . ' AS stream',
    $studentColumn('status') . ' AS status',
    $coalesce($studentColumn('grade_12_result'), $studentColumn('total_mark')) . ' AS grade_12_result',
    $coalesce($studentColumn('coc_result'), $studentColumn('coc_score')) . ' AS coc_result',
    $studentColumn('cumulative_avg') . ' AS cumulative_avg',
    $coalesce($studentColumn('gender'), $studentColumn('sex')) . ' AS gender',
    $coalesce($studentColumn('sex'), $studentColumn('gender')) . ' AS sex',
    $studentColumn('disability') . ' AS disability',
    $studentColumn('minority') . ' AS minority',
    $studentColumn('department') . ' AS department',
];
$select = 'SELECT ' . implode(', ', $fields)
    . ' FROM student_data LEFT JOIN users ON ' . ($userJoinConditions ? implode(' OR ', $userJoinConditions) : '1 = 0');

$statement = null;
$where = [];
$parameters = [];

if ($studentId !== '') {
    $studentIdentifiers = [
        [$studentColumn('admission_number'), 'student_data.admission_number'],
        [$studentColumn('id_number'), 'student_data.id_number'],
        [$userColumn('id_number'), 'users.id_number'],
    ];
    if (ctype_digit($studentId) && $studentColumn('user_id') !== 'NULL') {
        $studentIdentifiers[] = [$studentColumn('user_id'), 'student_data.user_id'];
    }
    if (ctype_digit($studentId)) {
        $studentIdentifiers[] = [$userColumn('id'), 'users.id'];
    }
    foreach ($studentIdentifiers as [$expression, $columnName]) {
        if ($expression !== 'NULL') {
            $where[] = "{$columnName} = ?";
            $parameters[] = $studentId;
        }
    }
} elseif ($email !== '') {
    foreach ([
        [$studentColumn('email'), 'student_data.email'],
        [$userColumn('email'), 'users.email'],
    ] as [$expression, $columnName]) {
        if ($expression !== 'NULL') {
            $where[] = "LOWER({$columnName}) = LOWER(?)";
            $parameters[] = $email;
        }
    }
}

if (($studentId !== '' || $email !== '') && count($where) === 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'No supported student identifier is available.']);
    $db->close();
    exit;
}

$sql = $select;
if ($where) {
    $sql .= ' WHERE (' . implode(' OR ', $where) . ')';
}
$orderBy = $studentColumn('user_id') !== 'NULL'
    ? 'student_data.user_id'
    : ($studentColumn('admission_number') !== 'NULL'
        ? 'student_data.admission_number'
        : ($studentColumn('id_number') !== 'NULL' ? 'student_data.id_number' : 'users.id'));
if ($orderBy !== 'users.id' || $userColumn('id') !== 'NULL') {
    $sql .= ' ORDER BY ' . $orderBy . ' ASC';
}
if ($studentId !== '' || $email !== '') {
    $sql .= ' LIMIT 1';
}
$statement = $db->prepare($sql);
if ($statement && $parameters) {
    $types = str_repeat('s', count($parameters));
    $bindArguments = [$types];
    foreach ($parameters as $index => $parameter) {
        $bindArguments[] = &$parameters[$index];
    }
    if (!call_user_func_array([$statement, 'bind_param'], $bindArguments)) {
        $statement->close();
        $statement = false;
    }
}

if (!$statement || !$statement->execute()) {
    error_log('Unable to load student data: ' . $db->error);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to load student data.']);
    $db->close();
    exit;
}

$students = [];
$result = $statement->get_result();
while ($row = $result->fetch_assoc()) {
    $students[] = $row;
}

$statement->close();
echo json_encode([
    'success' => true,
    'students' => $students,
    'student' => count($students) === 1 ? $students[0] : null,
]);
$db->close();
?>
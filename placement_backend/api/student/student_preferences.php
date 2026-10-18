<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function studentPreferencesResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'POST'], true)) {
    header('Allow: GET, POST, OPTIONS');
    studentPreferencesResponse(['success' => false, 'message' => 'Only GET and POST requests are allowed.'], 405);
}

try {
    $db = getDbConnection();
} catch (Throwable $error) {
    error_log('Student preferences database connection failed: ' . $error->getMessage());
    studentPreferencesResponse(['success' => false, 'message' => 'Student preferences are temporarily unavailable.'], 503);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $studentId = trim((string) ($_GET['student_id'] ?? $_GET['admission_number'] ?? ''));
    $admissionNumber = trim((string) ($_GET['admission_number'] ?? ''));
    if ($studentId === '') {
        $db->close();
        studentPreferencesResponse(['success' => false, 'message' => 'A student ID is required.'], 400);
    }

    $columnsResult = $db->query('SHOW COLUMNS FROM student_choices');
    if (!$columnsResult) {
        error_log('Unable to inspect student choices columns: ' . $db->error);
        $db->close();
        studentPreferencesResponse(['success' => false, 'message' => 'Unable to load student preferences.'], 500);
    }
    $columns = array_column($columnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $columnsResult->free();

    $available = static fn (string $name): bool => in_array($name, $columns, true);
    $expression = static function (string $name) use ($available): string {
        return $available($name) ? "sc.`{$name}`" : 'NULL';
    };
    $identifierColumns = array_values(array_filter(
        ['admission_number', 'student_id', 'user_id'],
        $available
    ));
    if (!$identifierColumns) {
        $db->close();
        studentPreferencesResponse(['success' => false, 'message' => 'Student identifier is not available in the preferences table.'], 500);
    }

    $departmentNameExpression = $available('dept_name')
        ? "NULLIF(sc.`dept_name`, '')"
        : ($available('department_name') ? "NULLIF(sc.`department_name`, '')" : 'NULL');
    $select = [
        $expression('dept_id') . ' AS dept_id',
        "COALESCE({$departmentNameExpression}, d.name) AS dept_name",
        $expression('college_name') . ' AS college_name',
        $expression('stream') . ' AS stream',
        $expression('priority') . ' AS priority',
    ];
    $identifiers = array_values(array_unique(array_filter([$studentId, $admissionNumber], static fn (string $value): bool => $value !== '')));
    $conditions = [];
    $parameters = [];
    foreach ($identifierColumns as $column) {
        foreach ($identifiers as $identifier) {
            $conditions[] = "sc.`{$column}` = ?";
            $parameters[] = $identifier;
        }
    }
    $where = implode(' OR ', $conditions);
    $order = $available('priority') ? ' ORDER BY sc.`priority` ASC' : '';
    $statement = $db->prepare(
        'SELECT ' . implode(', ', $select)
        . ' FROM student_choices sc LEFT JOIN departments d ON d.id = sc.dept_id'
        . " WHERE ({$where}){$order}"
    );
    if (!$statement) {
        error_log('Unable to prepare student preferences query: ' . $db->error);
        $db->close();
        studentPreferencesResponse(['success' => false, 'message' => 'Unable to load student preferences.'], 500);
    }

    $types = str_repeat('s', count($parameters));
    $bindArguments = [$types];
    foreach ($parameters as $index => $value) {
        $bindArguments[] = &$parameters[$index];
    }
    if (!call_user_func_array([$statement, 'bind_param'], $bindArguments) || !$statement->execute()) {
        error_log('Unable to load student preferences: ' . $statement->error);
        $statement->close();
        $db->close();
        studentPreferencesResponse(['success' => false, 'message' => 'Unable to load student preferences.'], 500);
    }

    $result = $statement->get_result();
    $choices = [];
    while ($row = $result->fetch_assoc()) {
        $choices[] = $row;
    }
    $statement->close();
    $db->close();

    studentPreferencesResponse([
        'success' => true,
        'choices' => $choices,
        'submissionDeadline' => '2026-10-30',
        'isDeadlineActive' => true,
        'isResultPublished' => false,
    ]);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$sessionUserId = trim((string) ($_SESSION['user_id'] ?? ''));
$sessionAdmissionNumber = trim((string) ($_SESSION['admission_number'] ?? ''));
if (strtolower((string) ($_SESSION['role'] ?? '')) !== 'student' || ($sessionUserId === '' && $sessionAdmissionNumber === '')) {
    $db->close();
    studentPreferencesResponse(['success' => false, 'message' => 'Please sign in as a student before submitting preferences.'], 403);
}

$input = json_decode((string) file_get_contents('php://input'), true);
$requestedStudentId = trim((string) ($input['student_id'] ?? ''));
$choices = $input['choices'] ?? null;
if ($requestedStudentId === '' || !is_array($choices) || count($choices) === 0) {
    $db->close();
    studentPreferencesResponse(['success' => false, 'message' => 'A student ID and at least one ranked choice are required.'], 400);
}

$userLookup = static function (mysqli $db, string $identifier, bool $preferAdmissionNumber = false): ?array {
    $lookupColumn = static function (mysqli $connection, string $column, string $value): ?array {
        $statement = $connection->prepare("SELECT id, id_number FROM users WHERE `{$column}` = ? AND LOWER(role) = 'student' LIMIT 1");
        if (!$statement) {
            throw new RuntimeException('Unable to verify the student account.');
        }
        $statement->bind_param('s', $value);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Unable to verify the student account.');
        }
        $student = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        return $student;
    };

    if ($preferAdmissionNumber || !ctype_digit($identifier)) {
        return $lookupColumn($db, 'id_number', $identifier);
    }
    return $lookupColumn($db, 'id', $identifier) ?? $lookupColumn($db, 'id_number', $identifier);
};

$transactionStarted = false;
try {
    $requestedAccount = $userLookup(
        $db,
        $requestedStudentId,
        $sessionAdmissionNumber !== '' && $requestedStudentId === $sessionAdmissionNumber
    );
    $sessionAccount = null;
    if ($sessionUserId !== '') {
        $sessionAccount = $userLookup(
            $db,
            $sessionUserId,
            $sessionAdmissionNumber !== '' && $sessionUserId === $sessionAdmissionNumber
        );
    }
    if (!$sessionAccount && $sessionAdmissionNumber !== '' && $sessionAdmissionNumber !== $sessionUserId) {
        $sessionAccount = $userLookup($db, $sessionAdmissionNumber, true);
    }
    $sameAccount = $requestedAccount && $sessionAccount
        ? (int) $requestedAccount['id'] === (int) $sessionAccount['id']
        : ($sessionAdmissionNumber !== ''
            && ($requestedStudentId === $sessionAdmissionNumber
                || ($requestedAccount && (string) $requestedAccount['id_number'] === $sessionAdmissionNumber)));
    if (!$sameAccount) {
        $db->close();
        studentPreferencesResponse(['success' => false, 'message' => 'You can only submit preferences for your own student account.'], 403);
    }

    $columnResult = $db->query('SHOW COLUMNS FROM student_choices');
    if (!$columnResult) {
        throw new RuntimeException('Unable to inspect student choice storage.');
    }
    $columns = array_column($columnResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $columnResult->free();
    $hasColumn = static fn (string $column): bool => in_array($column, $columns, true);
    $identityColumns = array_values(array_filter(['student_id', 'user_id', 'admission_number'], $hasColumn));
    if (!$identityColumns || !$hasColumn('dept_id') || !$hasColumn('priority')) {
        throw new RuntimeException('The student choice table is missing required columns.');
    }

    $accountId = (int) ($requestedAccount['id'] ?? 0);
    if ($accountId <= 0 && (in_array('student_id', $identityColumns, true) || in_array('user_id', $identityColumns, true))) {
        $db->close();
        studentPreferencesResponse(['success' => false, 'message' => 'Your account is not linked to a numeric student record. Please contact the Registrar.'], 409);
    }
    $admissionNumber = trim((string) ($requestedAccount['id_number'] ?? $sessionAdmissionNumber));
    $identityValues = [
        'student_id' => $accountId > 0 ? (string) $accountId : '',
        'user_id' => $accountId > 0 ? (string) $accountId : '',
        'admission_number' => $admissionNumber !== '' ? $admissionNumber : $requestedStudentId,
    ];

    $normalizedChoices = [];
    $seenDepartments = [];
    foreach (array_values($choices) as $index => $choice) {
        if (!is_array($choice) || !isset($choice['dept_id'], $choice['priority'])
            || !is_numeric($choice['dept_id']) || !is_numeric($choice['priority'])) {
            $db->close();
            studentPreferencesResponse(['success' => false, 'message' => 'Each choice must include a numeric department ID and priority.'], 400);
        }
        $departmentId = (int) $choice['dept_id'];
        $priority = (int) $choice['priority'];
        if ($departmentId <= 0 || $priority !== $index + 1 || isset($seenDepartments[$departmentId])) {
            $db->close();
            studentPreferencesResponse(['success' => false, 'message' => 'Choices must have unique departments and consecutive priorities starting at 1.'], 400);
        }
        $seenDepartments[$departmentId] = true;
        $departmentStatement = $db->prepare('SELECT id, name, college_name, stream, status FROM departments WHERE id = ? LIMIT 1');
        if (!$departmentStatement) {
            throw new RuntimeException('Unable to verify the selected department.');
        }
        $departmentStatement->bind_param('i', $departmentId);
        if (!$departmentStatement->execute()) {
            $departmentStatement->close();
            throw new RuntimeException('Unable to verify the selected department.');
        }
        $department = $departmentStatement->get_result()->fetch_assoc();
        $departmentStatement->close();
        if (!$department || strtolower(trim((string) ($department['status'] ?? ''))) !== 'active') {
            $db->close();
            studentPreferencesResponse(['success' => false, 'message' => 'A selected department is no longer active. Please review your choices.'], 400);
        }
        $normalizedChoices[] = [
            'dept_id' => $departmentId,
            'dept_name' => (string) $department['name'],
            'college_name' => (string) $department['college_name'],
            'stream' => (string) $department['stream'],
            'priority' => $priority,
        ];
    }

    $deleteConditions = [];
    $deleteValues = [];
    foreach ($identityColumns as $column) {
        $value = $identityValues[$column] ?? '';
        if ($value !== '') {
            $deleteConditions[] = "`{$column}` = ?";
            $deleteValues[] = $value;
        }
    }
    if (!$deleteConditions) {
        throw new RuntimeException('No supported student identifier is available in the preferences table.');
    }

    $insertColumns = array_values(array_filter(
        [...$identityColumns, 'dept_id', 'dept_name', 'department_name', 'college_name', 'stream', 'priority'],
        $hasColumn
    ));
    $insertSql = 'INSERT INTO student_choices (' . implode(', ', array_map(static fn (string $column): string => "`{$column}`", $insertColumns))
        . ') VALUES (' . implode(', ', array_fill(0, count($insertColumns), '?')) . ')';
    $insertStatement = $db->prepare($insertSql);
    $deleteStatement = $db->prepare('DELETE FROM student_choices WHERE (' . implode(' OR ', $deleteConditions) . ')');
    if (!$insertStatement || !$deleteStatement) {
        throw new RuntimeException('Unable to prepare student preference storage.');
    }

    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start the student preference update.');
    }
    $transactionStarted = true;
    $deleteTypes = str_repeat('s', count($deleteValues));
    $deleteArguments = [$deleteTypes];
    foreach ($deleteValues as $index => $value) {
        $deleteArguments[] = &$deleteValues[$index];
    }
    if (!call_user_func_array([$deleteStatement, 'bind_param'], $deleteArguments) || !$deleteStatement->execute()) {
        throw new RuntimeException('Unable to replace the existing student preferences.');
    }
    $deleteStatement->close();

    foreach ($normalizedChoices as $choice) {
        $values = [];
        foreach ($insertColumns as $column) {
            if (array_key_exists($column, $identityValues)) {
                $values[] = $identityValues[$column];
            } elseif ($column === 'dept_name' || $column === 'department_name') {
                $values[] = $choice['dept_name'];
            } else {
                $values[] = (string) $choice[$column];
            }
        }
        $types = str_repeat('s', count($values));
        $arguments = [$types];
        foreach ($values as $index => $value) {
            $arguments[] = &$values[$index];
        }
        if (!call_user_func_array([$insertStatement, 'bind_param'], $arguments) || !$insertStatement->execute()) {
            throw new RuntimeException('Unable to save all student preferences.');
        }
    }
    $insertStatement->close();
    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit student preferences.');
    }
    $transactionStarted = false;
    $db->close();
    studentPreferencesResponse([
        'success' => true,
        'message' => 'Preferences saved successfully.',
        'choices' => $normalizedChoices,
    ]);
} catch (Throwable $error) {
    if ($transactionStarted) {
        try {
            $db->rollback();
            $transactionStarted = false;
        } catch (Throwable $rollbackError) {
            error_log('Student preference rollback failed: ' . $rollbackError->getMessage());
        }
    }
    error_log('Unable to save student preferences: ' . $error->getMessage());
    $db->close();
    studentPreferencesResponse(['success' => false, 'message' => 'Unable to save student preferences.'], 500);
}
?>

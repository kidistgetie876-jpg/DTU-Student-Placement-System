<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Access-Control-Allow-Methods: DELETE, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

function deleteStudentResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function deleteStudentColumns(mysqli $db, string $table): array
{
    $statement = $db->prepare(
        'SELECT COUNT(*) AS table_count FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to inspect student-related tables.');
    }
    $statement->bind_param('s', $table);
    if (!$statement->execute()) {
        $statement->close();
        throw new RuntimeException('Unable to inspect student-related tables.');
    }
    $exists = (int) ($statement->get_result()->fetch_assoc()['table_count'] ?? 0) > 0;
    $statement->close();
    if (!$exists) {
        return [];
    }

    $result = $db->query("SHOW COLUMNS FROM `{$table}`");
    if (!$result) {
        throw new RuntimeException('Unable to inspect student-related columns.');
    }
    $columns = [];
    while ($column = $result->fetch_assoc()) {
        $columns[$column['Field']] = strtolower((string) $column['Type']);
    }
    $result->free();
    return $columns;
}

function deleteStudentBindParameters(mysqli_stmt $statement, string $types, array &$values): void
{
    $parameters = [$types];
    foreach ($values as &$value) {
        $parameters[] = &$value;
    }
    unset($value);
    if (!call_user_func_array([$statement, 'bind_param'], $parameters)) {
        throw new RuntimeException('Unable to bind student lookup parameters.');
    }
}

function deleteStudentDependentRows(
    mysqli $db,
    string $table,
    array $accountIds,
    array $profileIds,
    array $admissionNumbers
): int {
    $columns = deleteStudentColumns($db, $table);
    if (!$columns) {
        return 0;
    }

    $numericIds = $table === 'student_appeals'
        ? array_values(array_unique(array_merge($accountIds, $profileIds)))
        : $accountIds;
    $conditions = [];
    $types = '';
    $values = [];
    foreach (['student_id', 'user_id'] as $column) {
        if (!isset($columns[$column])) {
            continue;
        }
        $type = $columns[$column];
        if (preg_match('/^(tinyint|smallint|mediumint|int|bigint|decimal|numeric)/', $type) && $numericIds) {
            $conditions[] = "`{$column}` IN (" . implode(',', array_fill(0, count($numericIds), '?')) . ')';
            $types .= str_repeat('i', count($numericIds));
            array_push($values, ...$numericIds);
        } elseif ($admissionNumbers && preg_match('/(char|text|enum)/', $type)) {
            $conditions[] = "TRIM(`{$column}`) IN (" . implode(',', array_fill(0, count($admissionNumbers), '?')) . ')';
            $types .= str_repeat('s', count($admissionNumbers));
            array_push($values, ...$admissionNumbers);
        }
    }
    foreach (['admission_number', 'id_number'] as $column) {
        if (isset($columns[$column]) && $admissionNumbers) {
            $conditions[] = "TRIM(`{$column}`) IN (" . implode(',', array_fill(0, count($admissionNumbers), '?')) . ')';
            $types .= str_repeat('s', count($admissionNumbers));
            array_push($values, ...$admissionNumbers);
        }
    }
    if (!$conditions) {
        return 0;
    }

    $statement = $db->prepare("DELETE FROM `{$table}` WHERE " . implode(' OR ', $conditions));
    if (!$statement) {
        throw new RuntimeException("Unable to prepare deletion from {$table}.");
    }
    deleteStudentBindParameters($statement, $types, $values);
    if (!$statement->execute()) {
        $statement->close();
        throw new RuntimeException("Unable to delete related {$table} records.");
    }
    $deleted = $statement->affected_rows;
    $statement->close();
    return $deleted;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['admin', 'registrar'], true)) {
    deleteStudentResponse([
        'success' => false,
        'message' => 'Only administrators and registrars can delete student information.',
    ], 403);
}

$requestMethod = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($requestMethod, ['DELETE', 'POST'], true)) {
    header('Allow: DELETE, POST, OPTIONS');
    deleteStudentResponse(['success' => false, 'message' => 'Only DELETE or POST requests are allowed.'], 405);
}

$rawInput = file_get_contents('php://input');
$input = is_string($rawInput) ? json_decode($rawInput, true) : null;
if (!is_array($input)) {
    $input = $_POST;
}
$submittedIds = $input['studentIds'] ?? $input['student_ids'] ?? [];
$submittedAdmissions = $input['admissionNumbers'] ?? $input['admission_numbers'] ?? [];
if (!is_array($submittedIds)) {
    $submittedIds = [$submittedIds];
}
if (!is_array($submittedAdmissions)) {
    $submittedAdmissions = [$submittedAdmissions];
}
foreach (['student_id', 'id'] as $key) {
    if (isset($input[$key])) {
        $submittedIds[] = $input[$key];
    }
    if (isset($_GET[$key])) {
        $submittedIds[] = $_GET[$key];
    }
}
if (isset($input['admission_number'])) {
    $submittedAdmissions[] = $input['admission_number'];
}
if (isset($_GET['admission_number'])) {
    $submittedAdmissions[] = $_GET['admission_number'];
}

$studentIds = [];
foreach ($submittedIds as $value) {
    $validated = filter_var($value, FILTER_VALIDATE_INT);
    if ($validated === false || $validated === null || $validated <= 0) {
        deleteStudentResponse(['success' => false, 'message' => 'Student IDs must be positive integers.'], 400);
    }
    $studentIds[] = (int) $validated;
}
$studentIds = array_values(array_unique($studentIds));
$admissionNumbers = array_values(array_unique(array_filter(array_map(
    static fn($value) => trim((string) $value),
    $submittedAdmissions
), static fn($value) => $value !== '')));

if (!$studentIds && !$admissionNumbers) {
    deleteStudentResponse(['success' => false, 'message' => 'Provide at least one student ID or admission number.'], 400);
}
if (count($studentIds) + count($admissionNumbers) > 100) {
    deleteStudentResponse(['success' => false, 'message' => 'A maximum of 100 students can be deleted per request.'], 400);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    deleteStudentResponse(['success' => false, 'message' => 'Unable to connect to the database.'], 500);
}

$transactionStarted = false;
try {
    $userColumns = deleteStudentColumns($db, 'users');
    $profileColumns = deleteStudentColumns($db, 'student_data');
    if (!isset($userColumns['id'], $userColumns['role']) || !isset($profileColumns['id'])) {
        throw new RuntimeException('The student account schema is incomplete.');
    }

    $userConditions = [];
    $types = '';
    $values = [];
    if ($studentIds) {
        $userConditions[] = '`id` IN (' . implode(',', array_fill(0, count($studentIds), '?')) . ')';
        $types .= str_repeat('i', count($studentIds));
        array_push($values, ...$studentIds);
    }
    if ($admissionNumbers && isset($userColumns['id_number'])) {
        $userConditions[] = 'TRIM(`id_number`) IN (' . implode(',', array_fill(0, count($admissionNumbers), '?')) . ')';
        $types .= str_repeat('s', count($admissionNumbers));
        array_push($values, ...$admissionNumbers);
    }

    $db->begin_transaction();
    $transactionStarted = true;
    $userRows = [];
    if ($userConditions) {
        $selectUser = $db->prepare(
            'SELECT `id`' . (isset($userColumns['id_number']) ? ', `id_number`' : '') .
            " FROM `users` WHERE LOWER(TRIM(`role`)) = 'student' AND (" . implode(' OR ', $userConditions) . ')'
        );
        if (!$selectUser) {
            throw new RuntimeException('Unable to prepare student account lookup.');
        }
        deleteStudentBindParameters($selectUser, $types, $values);
        if (!$selectUser->execute()) {
            $selectUser->close();
            throw new RuntimeException('Unable to resolve student accounts.');
        }
        $userRows = $selectUser->get_result()->fetch_all(MYSQLI_ASSOC);
        $selectUser->close();
    }
    $accountIds = array_values(array_unique(array_map(static fn($row) => (int) $row['id'], $userRows)));
    $allAdmissions = array_values(array_unique(array_filter(array_merge(
        $admissionNumbers,
        array_map(static fn($row) => trim((string) ($row['id_number'] ?? '')), $userRows)
    ), static fn($value) => $value !== '')));

    $profileConditions = [];
    $profileTypes = '';
    $profileValues = [];
    if ($accountIds && isset($profileColumns['user_id'])) {
        $profileConditions[] = '`user_id` IN (' . implode(',', array_fill(0, count($accountIds), '?')) . ')';
        $profileTypes .= str_repeat('i', count($accountIds));
        array_push($profileValues, ...$accountIds);
    }
    foreach (['admission_number', 'id_number'] as $column) {
        if ($allAdmissions && isset($profileColumns[$column])) {
            $profileConditions[] = "TRIM(`{$column}`) IN (" . implode(',', array_fill(0, count($allAdmissions), '?')) . ')';
            $profileTypes .= str_repeat('s', count($allAdmissions));
            array_push($profileValues, ...$allAdmissions);
        }
    }
    $profileRows = [];
    if ($profileConditions) {
        $selectProfile = $db->prepare(
            'SELECT `id`' . (isset($profileColumns['user_id']) ? ', `user_id`' : '') .
            (isset($profileColumns['admission_number']) ? ', `admission_number`' : '') .
            (isset($profileColumns['id_number']) ? ', `id_number`' : '') .
            ' FROM `student_data` WHERE ' . implode(' OR ', $profileConditions)
        );
        if (!$selectProfile) {
            throw new RuntimeException('Unable to prepare student profile lookup.');
        }
        deleteStudentBindParameters($selectProfile, $profileTypes, $profileValues);
        if (!$selectProfile->execute()) {
            $selectProfile->close();
            throw new RuntimeException('Unable to resolve student profiles.');
        }
        $profileRows = $selectProfile->get_result()->fetch_all(MYSQLI_ASSOC);
        $selectProfile->close();
    }
    $profileIds = array_values(array_unique(array_map(static fn($row) => (int) $row['id'], $profileRows)));
    $profileUserIds = array_values(array_unique(array_filter(array_map(
        static fn($row) => (int) ($row['user_id'] ?? 0),
        $profileRows
    ))));
    $unresolvedProfileUserIds = array_values(array_diff($profileUserIds, $accountIds));
    if ($unresolvedProfileUserIds) {
        $verifiedAccounts = $db->prepare(
            "SELECT `id`" . (isset($userColumns['id_number']) ? ', `id_number`' : '') .
            " FROM `users` WHERE LOWER(TRIM(`role`)) = 'student' AND `id` IN (" .
            implode(',', array_fill(0, count($unresolvedProfileUserIds), '?')) . ')'
        );
        if (!$verifiedAccounts) {
            throw new RuntimeException('Unable to prepare linked student account lookup.');
        }
        deleteStudentBindParameters(
            $verifiedAccounts,
            str_repeat('i', count($unresolvedProfileUserIds)),
            $unresolvedProfileUserIds
        );
        if (!$verifiedAccounts->execute()) {
            $verifiedAccounts->close();
            throw new RuntimeException('Unable to resolve linked student accounts.');
        }
        $verifiedAccountRows = $verifiedAccounts->get_result()->fetch_all(MYSQLI_ASSOC);
        $verifiedAccounts->close();
        $userRows = array_merge($userRows, $verifiedAccountRows);
        $accountIds = array_values(array_unique(array_merge(
            $accountIds,
            array_map(static fn($row) => (int) $row['id'], $verifiedAccountRows)
        )));
    }
    $allAdmissions = array_values(array_unique(array_filter(array_merge(
        $allAdmissions,
        array_map(static fn($row) => trim((string) ($row['admission_number'] ?? '')), $profileRows),
        array_map(static fn($row) => trim((string) ($row['id_number'] ?? '')), $profileRows)
    ), static fn($value) => $value !== '')));

    if (!$accountIds && !$profileIds) {
        $db->rollback();
        $db->close();
        deleteStudentResponse(['success' => false, 'message' => 'No matching student records were found.'], 404);
    }

    $deletedByTable = [];
    foreach ([
        'student_choices',
        'placement_results',
        'student_appeals',
        'student_notifications',
        'password_reset_tokens',
        'unassigned_students',
        'placement_college_allocations',
    ] as $table) {
        $deletedByTable[$table] = deleteStudentDependentRows(
            $db,
            $table,
            $accountIds,
            $profileIds,
            $allAdmissions
        );
    }

    $deletedProfiles = 0;
    if ($profileConditions) {
        $profileDelete = $db->prepare('DELETE FROM `student_data` WHERE ' . implode(' OR ', $profileConditions));
        if (!$profileDelete) {
            throw new RuntimeException('Unable to prepare student profile deletion.');
        }
        deleteStudentBindParameters($profileDelete, $profileTypes, $profileValues);
        if (!$profileDelete->execute()) {
            $profileDelete->close();
            throw new RuntimeException('Unable to delete student profiles.');
        }
        $deletedProfiles = $profileDelete->affected_rows;
        $profileDelete->close();
    }

    $deletedAccounts = 0;
    if ($accountIds) {
        $accountDelete = $db->prepare(
            "DELETE FROM `users` WHERE LOWER(TRIM(`role`)) = 'student' AND `id` IN (" .
            implode(',', array_fill(0, count($accountIds), '?')) . ')'
        );
        if (!$accountDelete) {
            throw new RuntimeException('Unable to prepare student account deletion.');
        }
        $accountIdsForDelete = $accountIds;
        deleteStudentBindParameters($accountDelete, str_repeat('i', count($accountIdsForDelete)), $accountIdsForDelete);
        if (!$accountDelete->execute()) {
            $accountDelete->close();
            throw new RuntimeException('Unable to delete student accounts.');
        }
        $deletedAccounts = $accountDelete->affected_rows;
        $accountDelete->close();
    }

    $db->commit();
    $transactionStarted = false;
    $deletedCount = max($deletedAccounts, $deletedProfiles);
    deleteStudentResponse([
        'success' => true,
        'deleted_count' => $deletedCount,
        'deleted_accounts' => $deletedAccounts,
        'deleted_profiles' => $deletedProfiles,
        'deleted_related_records' => $deletedByTable,
        'message' => "Deleted {$deletedCount} student record(s) and their related data.",
    ]);
} catch (Throwable $error) {
    if ($transactionStarted) {
        $db->rollback();
    }
    error_log('Student deletion failed: ' . $error->getMessage());
    $db->close();
    deleteStudentResponse(['success' => false, 'message' => 'Unable to delete student records. No changes were committed.'], 500);
}

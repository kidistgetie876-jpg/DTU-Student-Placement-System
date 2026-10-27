<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

function deleteSelectedStudentChoicesRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function deleteSelectedStudentChoicesBind(mysqli_stmt $statement, string $types, array &$values): void
{
    if ($types === '') {
        return;
    }
    $arguments = [$types];
    foreach ($values as &$value) {
        $arguments[] = &$value;
    }
    call_user_func_array([$statement, 'bind_param'], $arguments);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    deleteSelectedStudentChoicesRespond(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() === PHP_SESSION_NONE) {
    session_name('DTUPLACEMENTSESSID');
}
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    deleteSelectedStudentChoicesRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$input = json_decode((string) file_get_contents('php://input'), true);
$admissionNumbers = is_array($input) ? ($input['admissionNumbers'] ?? []) : [];
$expectedSemester = is_array($input) ? ($input['expectedSemester'] ?? null) : null;
if (
    !is_array($input)
    || ($input['confirmed'] ?? false) !== true
    || !is_array($admissionNumbers)
    || !in_array($expectedSemester, [1, 2], true)
) {
    deleteSelectedStudentChoicesRespond([
        'success' => false,
        'message' => 'Confirmation, the current active semester, and selected student identifiers are required.',
    ], 400);
}

$admissionNumbers = array_values(array_unique(array_filter(
    array_map(static fn($value): string => trim((string) $value), $admissionNumbers),
    static fn(string $value): bool => $value !== ''
)));
if (!$admissionNumbers) {
    deleteSelectedStudentChoicesRespond(['success' => false, 'message' => 'Select at least one student.'], 400);
}
if (count($admissionNumbers) > 500) {
    deleteSelectedStudentChoicesRespond(['success' => false, 'message' => 'Select no more than 500 students at a time.'], 400);
}

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
$db = getDbConnection();
if (!$db instanceof mysqli) {
    deleteSelectedStudentChoicesRespond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

try {
    $settingsColumns = studentPlacementTableColumns($db, 'placement_settings');
    $choiceColumns = studentPlacementTableColumns($db, 'student_choices');
    if (!in_array('active_semester', $settingsColumns, true)) {
        deleteSelectedStudentChoicesRespond([
            'success' => false,
            'message' => 'The active placement semester setting is unavailable. No choices were changed.',
        ], 503);
    }
    $db->begin_transaction();
    $settings = $db->query(
        'SELECT active_semester FROM placement_settings WHERE id = 1 LIMIT 1 FOR UPDATE'
    );
    if (!$settings) {
        throw new RuntimeException('Unable to read the active placement semester: ' . $db->error);
    }
    $settingsRow = $settings->fetch_assoc();
    $settings->free();
    $activeSemester = (int) ($settingsRow['active_semester'] ?? 0);
    if (!in_array($activeSemester, [1, 2], true)) {
        throw new RuntimeException('The active placement semester is not configured as Semester 1 or 2.');
    }
    if ($activeSemester !== $expectedSemester) {
        $db->rollback();
        $db->close();
        deleteSelectedStudentChoicesRespond([
            'success' => false,
            'message' => 'The active semester changed. Refresh and confirm deletion again. No choices were changed.',
        ], 409);
    }

    $conditions = [];
    $values = [];
    $types = '';
    $placeholders = implode(', ', array_fill(0, count($admissionNumbers), '?'));
    if (in_array('admission_number', $choiceColumns, true)) {
        $conditions[] = "TRIM(admission_number) IN ({$placeholders})";
        foreach ($admissionNumbers as $admissionNumber) {
            $values[] = $admissionNumber;
            $types .= 's';
        }
    }

    $studentIdType = '';
    $columnsResult = $db->query('SHOW COLUMNS FROM student_choices');
    if (!$columnsResult) {
        throw new RuntimeException('Unable to inspect student choice identifiers: ' . $db->error);
    }
    while ($column = $columnsResult->fetch_assoc()) {
        if (($column['Field'] ?? '') === 'student_id') {
            $studentIdType = strtolower((string) ($column['Type'] ?? ''));
            break;
        }
    }
    $columnsResult->free();
    $studentIdIsText = preg_match('/^(?:char|varchar|tinytext|text|mediumtext|longtext)/', $studentIdType) === 1;
    if ($studentIdIsText && in_array('student_id', $choiceColumns, true)) {
        $conditions[] = "TRIM(student_id) IN ({$placeholders})";
        foreach ($admissionNumbers as $admissionNumber) {
            $values[] = $admissionNumber;
            $types .= 's';
        }
    }

    $resolvedStudentIds = [];
    $userColumns = studentPlacementTableColumns($db, 'users');
    if (in_array('id', $userColumns, true) && in_array('id_number', $userColumns, true)) {
        $statement = $db->prepare("SELECT id FROM users WHERE TRIM(id_number) IN ({$placeholders})");
        if (!$statement) {
            throw new RuntimeException('Unable to resolve selected student accounts: ' . $db->error);
        }
        $lookupValues = $admissionNumbers;
        deleteSelectedStudentChoicesBind($statement, str_repeat('s', count($lookupValues)), $lookupValues);
        if (!$statement->execute()) {
            throw new RuntimeException('Unable to resolve selected student accounts: ' . $statement->error);
        }
        $result = $statement->get_result();
        while ($row = $result->fetch_assoc()) {
            $resolvedStudentIds[] = (int) $row['id'];
        }
        $result->free();
        $statement->close();
    }

    $profileColumns = studentPlacementTableColumns($db, 'student_data');
    $admissionColumn = in_array('admission_number', $profileColumns, true)
        ? 'admission_number'
        : (in_array('id_number', $profileColumns, true) ? 'id_number' : '');
    if ($admissionColumn !== '' && in_array('user_id', $profileColumns, true)) {
        $statement = $db->prepare(
            "SELECT DISTINCT user_id FROM student_data WHERE TRIM(`{$admissionColumn}`) IN ({$placeholders}) AND user_id IS NOT NULL"
        );
        if (!$statement) {
            throw new RuntimeException('Unable to resolve selected student profiles: ' . $db->error);
        }
        $lookupValues = $admissionNumbers;
        deleteSelectedStudentChoicesBind($statement, str_repeat('s', count($lookupValues)), $lookupValues);
        if (!$statement->execute()) {
            throw new RuntimeException('Unable to resolve selected student profiles: ' . $statement->error);
        }
        $result = $statement->get_result();
        while ($row = $result->fetch_assoc()) {
            $resolvedStudentIds[] = (int) $row['user_id'];
        }
        $result->free();
        $statement->close();
    }

    $resolvedStudentIds = array_values(array_unique(array_filter($resolvedStudentIds, static fn(int $id): bool => $id > 0)));
    if (!$studentIdIsText && in_array('student_id', $choiceColumns, true) && $resolvedStudentIds) {
        $conditions[] = 'student_id IN (' . implode(', ', array_fill(0, count($resolvedStudentIds), '?')) . ')';
        foreach ($resolvedStudentIds as $id) {
            $values[] = $id;
            $types .= 'i';
        }
    }
    if (in_array('user_id', $choiceColumns, true) && $resolvedStudentIds) {
        $conditions[] = 'user_id IN (' . implode(', ', array_fill(0, count($resolvedStudentIds), '?')) . ')';
        foreach ($resolvedStudentIds as $id) {
            $values[] = $id;
            $types .= 'i';
        }
    }
    if (!$conditions) {
        throw new RuntimeException('No supported selected-student identifier column exists in student_choices.');
    }

    $profileAssignments = [];
    if ($activeSemester === 1 && in_array('placement_status', $profileColumns, true)) {
        $profileAssignments[] = "placement_status = 'Pending'";
    }
    if (in_array('is_choice_editable', $profileColumns, true)) {
        $profileAssignments[] = 'is_choice_editable = 1';
    }
    foreach (['is_locked', 'is_placement_locked'] as $lockColumn) {
        if (in_array($lockColumn, $profileColumns, true)) {
            $profileAssignments[] = "`{$lockColumn}` = 0";
        }
    }
    $profileConditions = [];
    $profileValues = [];
    $profileTypes = '';
    if ($admissionColumn !== '') {
        $profileConditions[] = "TRIM(`{$admissionColumn}`) IN ({$placeholders})";
        foreach ($admissionNumbers as $admissionNumber) {
            $profileValues[] = $admissionNumber;
            $profileTypes .= 's';
        }
    }
    if (in_array('user_id', $profileColumns, true) && $resolvedStudentIds) {
        $profileConditions[] = 'user_id IN (' . implode(', ', array_fill(0, count($resolvedStudentIds), '?')) . ')';
        foreach ($resolvedStudentIds as $id) {
            $profileValues[] = $id;
            $profileTypes .= 'i';
        }
    }
    if (!$profileAssignments || !$profileConditions) {
        throw new RuntimeException('Selected student profile lock fields or identifiers are unavailable.');
    }
    $profileUpdate = $db->prepare(
        'UPDATE student_data SET ' . implode(', ', $profileAssignments)
        . ' WHERE (' . implode(' OR ', $profileConditions) . ')'
    );
    if (!$profileUpdate) {
        throw new RuntimeException('Unable to prepare selected student preference unlock: ' . $db->error);
    }
    deleteSelectedStudentChoicesBind($profileUpdate, $profileTypes, $profileValues);
    if (!$profileUpdate->execute()) {
        $error = $profileUpdate->error;
        $profileUpdate->close();
        throw new RuntimeException('Unable to unlock selected students: ' . $error);
    }
    $profileUpdate->close();

    $statement = $db->prepare(
        'DELETE FROM student_choices WHERE (' . implode(' OR ', $conditions) . ')'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare selected choice deletion: ' . $db->error);
    }
    deleteSelectedStudentChoicesBind($statement, $types, $values);
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to delete selected student choices: ' . $error);
    }
    $deletedCount = $statement->affected_rows;
    $statement->close();
    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit selected choice deletion: ' . $db->error);
    }

    $db->close();
    deleteSelectedStudentChoicesRespond([
        'success' => true,
        'semester' => $activeSemester,
        'students_requested' => count($admissionNumbers),
        'choices_deleted' => $deletedCount,
        'message' => sprintf(
            'Deleted choice records across all semesters for %d selected student(s) (%d record(s)). Their preferences are unlocked for resubmission.',
            count($admissionNumbers),
            $deletedCount
        ),
    ]);
} catch (Throwable $error) {
    try {
        $db->rollback();
    } catch (Throwable $rollbackError) {
        error_log('Selected student choice deletion rollback failed: ' . $rollbackError->getMessage());
    }
    error_log('Selected student choice deletion failed: ' . $error->getMessage());
    $db->close();
    deleteSelectedStudentChoicesRespond([
        'success' => false,
        'message' => 'Unable to delete selected student choices. No student accounts or profiles were changed.',
    ], 500);
}

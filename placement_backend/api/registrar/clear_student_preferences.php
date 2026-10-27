<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
header('Content-Type: application/json; charset=UTF-8');

function clearStudentPreferencesRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function clearStudentPreferencesBind(mysqli_stmt $statement, string $types, array &$values): void
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
    clearStudentPreferencesRespond(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    clearStudentPreferencesRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$input = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($input)) {
    clearStudentPreferencesRespond(['success' => false, 'message' => 'The request body must be valid JSON.'], 400);
}

$admissionNumbers = $input['admissionNumbers'] ?? $input['admission_numbers'] ?? [];
$studentIds = $input['studentIds'] ?? $input['student_ids'] ?? [];
$identifiers = $input['studentIdentifiers'] ?? [];
if (!is_array($admissionNumbers) || !is_array($studentIds) || !is_array($identifiers)) {
    clearStudentPreferencesRespond(['success' => false, 'message' => 'Student identifiers must be provided as arrays.'], 400);
}

foreach ($identifiers as $identifier) {
    if (is_int($identifier) || (is_string($identifier) && ctype_digit(trim($identifier)))) {
        $studentIds[] = $identifier;
    } elseif (is_string($identifier)) {
        $admissionNumbers[] = $identifier;
    }
}

$admissionNumbers = array_values(array_unique(array_filter(
    array_map(static fn($value) => trim((string) $value), $admissionNumbers),
    static fn($value) => $value !== ''
)));
$studentIds = array_values(array_unique(array_filter(
    array_map(static fn($value) => filter_var($value, FILTER_VALIDATE_INT), $studentIds),
    static fn($value) => $value !== false && $value > 0
)));
if (count($admissionNumbers) + count($studentIds) === 0) {
    clearStudentPreferencesRespond(['success' => false, 'message' => 'Select at least one student.'], 400);
}
if (count($admissionNumbers) + count($studentIds) > 500) {
    clearStudentPreferencesRespond(['success' => false, 'message' => 'Select no more than 500 students at a time.'], 400);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    clearStudentPreferencesRespond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

try {
    $choiceColumns = studentPlacementTableColumns($db, 'student_choices');
    if (!$choiceColumns) {
        throw new RuntimeException('The student_choices table is unavailable.');
    }
    $choiceColumnTypes = [];
    $choiceColumnResult = $db->query('SHOW COLUMNS FROM student_choices');
    if (!$choiceColumnResult) {
        throw new RuntimeException('Unable to inspect student_choices identifiers: ' . $db->error);
    }
    while ($column = $choiceColumnResult->fetch_assoc()) {
        $choiceColumnTypes[$column['Field']] = strtolower((string) ($column['Type'] ?? ''));
    }
    $choiceColumnResult->free();

    $resolvedStudentIds = $studentIds;
    if ($admissionNumbers) {
        $userColumns = studentPlacementTableColumns($db, 'users');
        if (in_array('id', $userColumns, true) && in_array('id_number', $userColumns, true)) {
            $placeholders = implode(', ', array_fill(0, count($admissionNumbers), '?'));
            $statement = $db->prepare("SELECT id FROM users WHERE TRIM(id_number) IN ($placeholders)");
            $values = $admissionNumbers;
            clearStudentPreferencesBind($statement, str_repeat('s', count($values)), $values);
            $statement->execute();
            $result = $statement->get_result();
            while ($row = $result->fetch_assoc()) {
                $resolvedStudentIds[] = (int) $row['id'];
            }
            $result->free();
            $statement->close();
        }

        $studentDataColumns = studentPlacementTableColumns($db, 'student_data');
        $admissionColumn = in_array('admission_number', $studentDataColumns, true)
            ? 'admission_number'
            : (in_array('id_number', $studentDataColumns, true) ? 'id_number' : '');
        if ($admissionColumn !== '' && in_array('user_id', $studentDataColumns, true)) {
            $placeholders = implode(', ', array_fill(0, count($admissionNumbers), '?'));
            $statement = $db->prepare(
                "SELECT DISTINCT user_id FROM student_data WHERE TRIM(`$admissionColumn`) IN ($placeholders) AND user_id IS NOT NULL"
            );
            $values = $admissionNumbers;
            clearStudentPreferencesBind($statement, str_repeat('s', count($values)), $values);
            $statement->execute();
            $result = $statement->get_result();
            while ($row = $result->fetch_assoc()) {
                $resolvedStudentIds[] = (int) $row['user_id'];
            }
            $result->free();
            $statement->close();
        }
    }
    $resolvedStudentIds = array_values(array_unique(array_filter($resolvedStudentIds, static fn($id) => $id > 0)));

    $profileColumns = studentPlacementTableColumns($db, 'student_data');
    $profileAssignments = [];
    if (in_array('is_choice_editable', $profileColumns, true)) {
        $profileAssignments[] = 'is_choice_editable = 1';
    } elseif (in_array('placement_status', $profileColumns, true)) {
        $profileAssignments[] = "placement_status = 'Pending'";
    }
    foreach (['is_locked', 'is_placement_locked'] as $lockColumn) {
        if (in_array($lockColumn, $profileColumns, true)) {
            $profileAssignments[] = "`{$lockColumn}` = 0";
        }
    }
    if (!$profileAssignments) {
        throw new RuntimeException('Student preference lock fields are unavailable.');
    }
    $profileConditions = [];
    $profileValues = [];
    $profileTypes = '';
    $profileAdmissionColumn = in_array('admission_number', $profileColumns, true)
        ? 'admission_number'
        : (in_array('id_number', $profileColumns, true) ? 'id_number' : '');
    if ($admissionNumbers && $profileAdmissionColumn !== '') {
        $profileConditions[] = 'TRIM(`' . $profileAdmissionColumn . '`) IN ('
            . implode(', ', array_fill(0, count($admissionNumbers), '?')) . ')';
        foreach ($admissionNumbers as $number) {
            $profileValues[] = $number;
            $profileTypes .= 's';
        }
    }
    if ($resolvedStudentIds && in_array('user_id', $profileColumns, true)) {
        $profileConditions[] = 'user_id IN ('
            . implode(', ', array_fill(0, count($resolvedStudentIds), '?')) . ')';
        foreach ($resolvedStudentIds as $id) {
            $profileValues[] = $id;
            $profileTypes .= 'i';
        }
    }
    if (!$profileConditions) {
        throw new RuntimeException('Student profiles cannot be matched for preference reset.');
    }

    $conditions = [];
    $values = [];
    $types = '';
    if ($admissionNumbers && in_array('admission_number', $choiceColumns, true)) {
        $conditions[] = 'TRIM(admission_number) IN (' . implode(', ', array_fill(0, count($admissionNumbers), '?')) . ')';
        foreach ($admissionNumbers as $number) {
            $values[] = $number;
            $types .= 's';
        }
    }
    $studentIdType = $choiceColumnTypes['student_id'] ?? '';
    $studentIdIsText = preg_match('/^(?:char|varchar|tinytext|text|mediumtext|longtext)/', $studentIdType) === 1;
    if (
        $admissionNumbers
        && $studentIdIsText
        && in_array('student_id', $choiceColumns, true)
    ) {
        $conditions[] = 'TRIM(student_id) IN (' . implode(', ', array_fill(0, count($admissionNumbers), '?')) . ')';
        foreach ($admissionNumbers as $number) {
            $values[] = $number;
            $types .= 's';
        }
    }
    foreach (['student_id', 'user_id'] as $studentColumn) {
        if (!$resolvedStudentIds || !in_array($studentColumn, $choiceColumns, true)) {
            continue;
        }
        if ($studentColumn === 'student_id' && $studentIdIsText) {
            continue;
        }
        $conditions[] = "`$studentColumn` IN (" . implode(', ', array_fill(0, count($resolvedStudentIds), '?')) . ')';
        foreach ($resolvedStudentIds as $id) {
            $values[] = $id;
            $types .= 'i';
        }
    }
    if (!$conditions) {
        throw new RuntimeException('No supported student identifier column exists in student_choices.');
    }

    $db->begin_transaction();
    $profileUpdate = $db->prepare(
        'UPDATE student_data SET ' . implode(', ', $profileAssignments)
        . ' WHERE (' . implode(' OR ', $profileConditions) . ')'
    );
    if (!$profileUpdate) {
        throw new RuntimeException('Unable to prepare student preference unlock: ' . $db->error);
    }
    clearStudentPreferencesBind($profileUpdate, $profileTypes, $profileValues);
    if (!$profileUpdate->execute()) {
        $error = $profileUpdate->error;
        $profileUpdate->close();
        throw new RuntimeException('Unable to unlock students after clearing preferences: ' . $error);
    }
    $profileUpdate->close();

    $statement = $db->prepare('DELETE FROM student_choices WHERE ' . implode(' OR ', $conditions));
    if (!$statement) {
        throw new RuntimeException('Unable to prepare the selected preference clear: ' . $db->error);
    }
    clearStudentPreferencesBind($statement, $types, $values);
    if (!$statement->execute()) {
        throw new RuntimeException('Unable to clear the selected student preferences: ' . $statement->error);
    }
    $clearedCount = $statement->affected_rows;
    $statement->close();
    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit the preference reset: ' . $db->error);
    }
    $db->close();

    clearStudentPreferencesRespond([
        'success' => true,
        'message' => sprintf(
            'Cleared %d saved preference record(s) for %d selected student(s).',
            $clearedCount,
            count($admissionNumbers) + count($studentIds)
        ),
        'students_requested' => count($admissionNumbers) + count($studentIds),
        'preferences_cleared' => $clearedCount,
    ]);
} catch (Throwable $error) {
    if (isset($db) && $db instanceof mysqli) {
        try {
            $db->rollback();
        } catch (Throwable $rollbackError) {
            error_log('Student preference clear rollback failed: ' . $rollbackError->getMessage());
        }
        $db->close();
    }
    error_log('Registrar could not clear student preferences: ' . $error->getMessage());
    clearStudentPreferencesRespond([
        'success' => false,
        'message' => 'Unable to clear the selected student preferences.',
    ], 500);
}

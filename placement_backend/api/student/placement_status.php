<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
require_once __DIR__ . '/../common/student_placement_allocation.php';
header('Content-Type: application/json; charset=UTF-8');

function placementStatusRespond(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET, OPTIONS');
    placementStatusRespond(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

try {
    $studentId = trim((string) ($_GET['student_id'] ?? ''));
    $admissionNumber = trim((string) ($_GET['admission_number'] ?? ''));
    if ($admissionNumber === '' && $studentId !== '' && !ctype_digit($studentId)) {
        $admissionNumber = $studentId;
    }
    if ($studentId === '' && $admissionNumber === '') {
        placementStatusRespond(['success' => false, 'message' => 'A student ID or admission number is required.'], 400);
    }

    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    $statusColumns = array_values(array_intersect(['placement_status', 'status'], $studentColumns));
    $identityConditions = [];
    $identityValues = [];
    foreach (['admission_number', 'id_number'] as $column) {
        if ($admissionNumber !== '' && in_array($column, $studentColumns, true)) {
            $identityConditions[] = "TRIM(`{$column}`) = TRIM(?)";
            $identityValues[] = $admissionNumber;
        }
    }
    if (!$identityConditions && $studentId !== '') {
        foreach (['user_id', 'student_id', 'id'] as $column) {
            if (in_array($column, $studentColumns, true)) {
                $identityConditions[] = "`{$column}` = ?";
                $identityValues[] = $studentId;
                break;
            }
        }
    }

    $status = '';
    if ($statusColumns && $identityConditions) {
        $statusExpressions = array_map(static fn(string $column): string => "NULLIF(TRIM(`{$column}`), '')", $statusColumns);
        $statement = $db->prepare(
            'SELECT COALESCE(' . implode(', ', $statusExpressions) . ", '') AS placement_status
             FROM student_data WHERE (" . implode(' OR ', $identityConditions) . ') LIMIT 1'
        );
        if (!$statement) {
            throw new RuntimeException('Unable to prepare the student placement status lookup: ' . $db->error);
        }
        $bindTypes = str_repeat('s', count($identityValues));
        $bindArguments = [$bindTypes];
        foreach ($identityValues as $index => $value) {
            $bindArguments[] = &$identityValues[$index];
        }
        if ($identityValues) {
            call_user_func_array([$statement, 'bind_param'], $bindArguments);
        }
        if (!$statement->execute()) {
            $error = $statement->error;
            $statement->close();
            throw new RuntimeException('Unable to load the student placement status: ' . $error);
        }
        $row = $statement->get_result()->fetch_assoc();
        $status = trim((string) ($row['placement_status'] ?? ''));
        $statement->close();
    }

    $allocation = getStudentAllocatedPlacementGroup($db, $studentId, $admissionNumber);
    $secondSemesterPortal = getStudentSecondSemesterChoicePortalState(
        $db,
        $studentId,
        $admissionNumber
    );
    $choiceEditable = isStudentChoiceExplicitlyEditable($db, $studentId, $admissionNumber);
    $settingsColumns = studentPlacementTableColumns($db, 'placement_settings');
    $activeSemester = 1;
    if (in_array('active_semester', $settingsColumns, true)) {
        $settingsResult = $db->query('SELECT active_semester FROM placement_settings WHERE id = 1 LIMIT 1');
        if (!$settingsResult) {
            throw new RuntimeException('Unable to load the active placement semester: ' . $db->error);
        }
        $settings = $settingsResult->fetch_assoc();
        $settingsResult->free();
        $activeSemester = in_array((int) ($settings['active_semester'] ?? 1), [1, 2], true)
            ? (int) $settings['active_semester']
            : 1;
    }
    $secondSemesterStage = in_array(strtolower($status), [
        'pending 2nd semester',
        'placed in semester 1',
        'allocated',
    ], true);
    $pendingSecondSemesterEditable = $secondSemesterStage
        && trim((string) ($allocation['college'] ?? '')) !== ''
        && trim((string) ($allocation['group'] ?? '')) !== ''
        && $secondSemesterPortal['isOpen']
        && !$secondSemesterPortal['isFinalized'];
    $choiceEditable = $choiceEditable || $pendingSecondSemesterEditable;
    $secondSemesterEligible = $secondSemesterPortal['eligible'] || $pendingSecondSemesterEditable;
    $secondSemesterOpen = $secondSemesterPortal['isOpen'];
    $isLocked = $secondSemesterEligible
        ? $secondSemesterPortal['isFinalized']
        : (!$choiceEditable && isStudentChoiceEditingLocked($db, $studentId, $admissionNumber));
    $db->close();
    placementStatusRespond([
        'success' => true,
        'status' => $status,
        'isLocked' => $isLocked,
        'is_choice_editable' => $choiceEditable,
        'active_semester' => $activeSemester,
        'second_sem_choice_eligible' => $secondSemesterEligible,
        'is_second_sem_choice_open' => $secondSemesterOpen,
        'second_semester_choice_finalized' => $secondSemesterPortal['isFinalized'],
        'message' => $secondSemesterPortal['message'],
        'allocated_college' => trim((string) ($allocation['college'] ?? '')),
        'allocated_group' => (string) ($allocation['group'] ?? ''),
    ]);
} catch (Throwable $error) {
    error_log('Student placement status lookup failed: ' . $error->getMessage());
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
    placementStatusRespond(['success' => false, 'message' => 'Unable to load student placement status.'], 503);
}

<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

function resetActiveStudentChoicesRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    resetActiveStudentChoicesRespond(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
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
    resetActiveStudentChoicesRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$input = json_decode((string) file_get_contents('php://input'), true);
if (
    !is_array($input)
    || ($input['confirmed'] ?? false) !== true
    || !in_array($input['expectedSemester'] ?? null, [1, 2], true)
) {
    resetActiveStudentChoicesRespond([
        'success' => false,
        'message' => 'Confirmation and the expected active semester are required before resetting student choices.',
    ], 400);
}

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
$db = getDbConnection();
if (!$db instanceof mysqli) {
    resetActiveStudentChoicesRespond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

try {
    $settingsColumns = $db->query("SHOW COLUMNS FROM placement_settings LIKE 'active_semester'");
    if (!$settingsColumns) {
        throw new RuntimeException('Unable to inspect the active placement semester: ' . $db->error);
    }
    $hasActiveSemester = $settingsColumns->num_rows > 0;
    $settingsColumns->free();
    if (!$hasActiveSemester) {
        resetActiveStudentChoicesRespond([
            'success' => false,
            'message' => 'The active placement semester setting is unavailable. No choices were changed.',
        ], 503);
    }

    $choiceColumns = $db->query("SHOW COLUMNS FROM student_choices LIKE 'semester'");
    if (!$choiceColumns) {
        throw new RuntimeException('Unable to inspect the student choice semester: ' . $db->error);
    }
    $hasChoiceSemester = $choiceColumns->num_rows > 0;
    $choiceColumns->free();
    if (!$hasChoiceSemester) {
        resetActiveStudentChoicesRespond([
            'success' => false,
            'message' => 'Student choices are not semester-scoped in the database. No choices were changed.',
        ], 503);
    }
    $choiceSchema = studentPlacementTableColumns($db, 'student_choices');
    $profileSchema = studentPlacementTableColumns($db, 'student_data');
    $profileIdentityColumns = array_values(array_intersect(['admission_number', 'id_number'], $profileSchema));
    if (!in_array('admission_number', $choiceSchema, true) || !$profileIdentityColumns) {
        resetActiveStudentChoicesRespond([
            'success' => false,
            'message' => 'Student profile identifiers are unavailable. No choices were changed.',
        ], 503);
    }
    $profileAssignments = [];
    if ($input['expectedSemester'] === 1 && in_array('placement_status', $profileSchema, true)) {
        $profileAssignments[] = "sd.placement_status = 'Pending'";
    }
    if (in_array('is_choice_editable', $profileSchema, true)) {
        $profileAssignments[] = 'sd.is_choice_editable = 1';
    }
    foreach (['is_locked', 'is_placement_locked'] as $lockColumn) {
        if (in_array($lockColumn, $profileSchema, true)) {
            $profileAssignments[] = "sd.`{$lockColumn}` = 0";
        }
    }
    if (!$profileAssignments) {
        resetActiveStudentChoicesRespond([
            'success' => false,
            'message' => 'Student preference lock fields are unavailable. No choices were changed.',
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
    $semester = (int) ($settingsRow['active_semester'] ?? 0);
    if (!in_array($semester, [1, 2], true)) {
        throw new RuntimeException('The active placement semester is not configured as Semester 1 or 2.');
    }
    if ($semester !== $input['expectedSemester']) {
        $db->rollback();
        $db->close();
        resetActiveStudentChoicesRespond([
            'success' => false,
            'message' => 'The active semester changed. Refresh the page and confirm the reset again. No choices were changed.',
        ], 409);
    }

    $profileJoinConditions = array_map(
        static fn(string $column): string => "TRIM(sd.`{$column}`) = TRIM(sc.admission_number)",
        $profileIdentityColumns
    );
    $profileUpdate = $db->prepare(
        'UPDATE student_data sd
         INNER JOIN (
             SELECT DISTINCT TRIM(admission_number) AS admission_number
             FROM student_choices WHERE semester = ?
         ) sc ON (' . implode(' OR ', $profileJoinConditions) . ')
         SET ' . implode(', ', $profileAssignments)
    );
    if (!$profileUpdate) {
        throw new RuntimeException('Unable to prepare student preference unlock: ' . $db->error);
    }
    $profileUpdate->bind_param('i', $semester);
    if (!$profileUpdate->execute()) {
        $error = $profileUpdate->error;
        $profileUpdate->close();
        throw new RuntimeException('Unable to unlock students after resetting choices: ' . $error);
    }
    $profileUpdate->close();

    $statement = $db->prepare('DELETE FROM student_choices WHERE semester = ?');
    if (!$statement) {
        throw new RuntimeException('Unable to prepare the active-semester choice reset: ' . $db->error);
    }
    $statement->bind_param('i', $semester);
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to reset active-semester choices: ' . $error);
    }
    $clearedCount = $statement->affected_rows;
    $statement->close();
    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit the active-semester choice reset: ' . $db->error);
    }

    $db->close();
    resetActiveStudentChoicesRespond([
        'success' => true,
        'semester' => $semester,
        'choices_cleared' => $clearedCount,
        'message' => sprintf(
            'Reset %d student choice record(s) for Semester %d. Students can submit their choices again when the portal is open.',
            $clearedCount,
            $semester
        ),
    ]);
} catch (Throwable $error) {
    try {
        $db->rollback();
    } catch (Throwable $rollbackError) {
        error_log('Active-semester student choice reset rollback failed: ' . $rollbackError->getMessage());
    }
    error_log('Active-semester student choice reset failed: ' . $error->getMessage());
    $db->close();
    resetActiveStudentChoicesRespond([
        'success' => false,
        'message' => 'Unable to reset student choices. No student records or department data were changed.',
    ], 500);
}

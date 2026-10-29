<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/placement_semester.php';
header('Content-Type: application/json; charset=UTF-8');

function activateSecondSemesterResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function reallocateExhaustedLawAllocations(mysqli $db): array
{
    $departmentsResult = $db->query(
        "SELECT id, name, college_id, college_name, stream, placement_group, capacity,
                offered_semester, is_first_semester_only
         FROM departments
         WHERE LOWER(TRIM(COALESCE(status, ''))) = 'active'
         FOR UPDATE"
    );
    if (!$departmentsResult) {
        throw new RuntimeException('Unable to inspect active department capacities: ' . $db->error);
    }

    $occupancyResult = $db->query(
        "SELECT dept_id, COUNT(*) AS occupied
         FROM placement_results
         WHERE dept_id IS NOT NULL
           AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('rejected', 'cancelled')
         GROUP BY dept_id"
    );
    if (!$occupancyResult) {
        throw new RuntimeException('Unable to inspect current department occupancy: ' . $db->error);
    }
    $occupiedByDepartment = [];
    while ($row = $occupancyResult->fetch_assoc()) {
        $occupiedByDepartment[(int) $row['dept_id']] = (int) $row['occupied'];
    }
    $occupancyResult->free();

    $departments = [];
    $remainingGroupCapacity = [];
    while ($row = $departmentsResult->fetch_assoc()) {
        $department = [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'college_id' => (int) ($row['college_id'] ?? 0),
            'college_name' => (string) ($row['college_name'] ?? ''),
            'stream' => (string) ($row['stream'] ?? ''),
            'placement_group' => (string) ($row['placement_group'] ?? ''),
            'capacity' => max(0, (int) ($row['capacity'] ?? 0)),
            'offered_semester' => (int) ($row['offered_semester'] ?? 1),
            'is_first_semester_only' => (int) ($row['is_first_semester_only'] ?? 0),
        ];
        if (!placementDepartmentOfferedInSemester($department, 2)) {
            continue;
        }
        $group = placementDepartmentGroup($department);
        $remaining = max(
            0,
            $department['capacity'] - ($occupiedByDepartment[$department['id']] ?? 0)
        );
        $remainingGroupCapacity[$group] = ($remainingGroupCapacity[$group] ?? 0) + $remaining;
        $departments[] = $department;
    }
    $departmentsResult->free();

    if (
        (int) ($remainingGroupCapacity['law'] ?? 0) > 0
        || (int) ($remainingGroupCapacity['other_social_science'] ?? 0) <= 0
    ) {
        return [];
    }

    $fallbackDepartment = null;
    foreach ($departments as $department) {
        if (
            placementDepartmentGroup($department) === 'other_social_science'
            && placementNormalizeStream($department['stream']) === 'social'
            && max(0, $department['capacity'] - ($occupiedByDepartment[$department['id']] ?? 0)) > 0
        ) {
            $fallbackDepartment = $department;
            break;
        }
    }
    if ($fallbackDepartment === null) {
        return [];
    }

    $pendingAllocations = $db->query(
        "SELECT id, admission_number
         FROM placement_college_allocations
         WHERE target_semester = 2 AND LOWER(TRIM(status)) = 'pending'
           AND (LOWER(TRIM(placement_group)) = 'law'
                OR LOWER(TRIM(college_name)) LIKE '%school of law%')
           AND NOT EXISTS (
               SELECT 1
               FROM placement_results pr
               WHERE TRIM(pr.admission_number) = TRIM(placement_college_allocations.admission_number)
                 AND pr.placement_semester = 1
                 AND pr.dept_id IS NOT NULL
                 AND LOWER(TRIM(COALESCE(pr.status, ''))) NOT IN ('rejected', 'cancelled')
           )
         FOR UPDATE"
    );
    if (!$pendingAllocations) {
        throw new RuntimeException('Unable to load pending Law allocations: ' . $db->error);
    }

    $update = $db->prepare(
        "UPDATE placement_college_allocations
         SET college_id = ?, college_name = ?, stream = ?, placement_group = ?
         WHERE id = ? AND target_semester = 2 AND LOWER(TRIM(status)) = 'pending'"
    );
    if (!$update) {
        throw new RuntimeException('Unable to prepare pending Law reallocation: ' . $db->error);
    }
    $collegeId = (int) ($fallbackDepartment['college_id'] ?? 0);
    $collegeName = placementDepartmentCapacityCollegeName($fallbackDepartment);
    $stream = (string) $fallbackDepartment['stream'];
    $group = 'other_social_science';
    $reallocatedStudents = [];
    while ($allocation = $pendingAllocations->fetch_assoc()) {
        $allocationId = (int) $allocation['id'];
        $update->bind_param('isssi', $collegeId, $collegeName, $stream, $group, $allocationId);
        if (!$update->execute()) {
            $error = $update->error;
            $update->close();
            $pendingAllocations->free();
            throw new RuntimeException('Unable to reallocate a pending Law student: ' . $error);
        }
        if ($update->affected_rows > 0) {
            $reallocatedStudents[] = trim((string) $allocation['admission_number']);
        }
    }
    $update->close();
    $pendingAllocations->free();

    return $reallocatedStudents;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST, OPTIONS');
    activateSecondSemesterResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
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
    activateSecondSemesterResponse(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$requestBody = (string) file_get_contents('php://input');
$input = json_decode($requestBody, true);
if ($requestBody !== '' && !is_array($input)) {
    activateSecondSemesterResponse([
        'success' => false,
        'message' => 'The request body must be a valid JSON object.',
    ], 400);
}
$requestedSemester = is_array($input) && array_key_exists('semester', $input)
    ? filter_var($input['semester'], FILTER_VALIDATE_INT)
    : 2;
if (!in_array($requestedSemester, [1, 2], true)) {
    activateSecondSemesterResponse([
        'success' => false,
        'message' => 'Semester must be 1 or 2.',
    ], 400);
}

$db = null;
try {
    require_once __DIR__ . '/../../config/db_config.php';
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $columnResult = $db->query("SHOW COLUMNS FROM placement_settings LIKE 'active_semester'");
    if (!$columnResult) {
        throw new RuntimeException('Unable to inspect the active semester setting: ' . $db->error);
    }
    $columnExists = $columnResult->num_rows > 0;
    $columnResult->free();
    if (!$columnExists) {
        $db->close();
        activateSecondSemesterResponse([
            'success' => false,
            'message' => 'Apply the two-stage department placement database migration before changing the active placement semester.',
        ], 503);
    }

    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to begin the semester activation transaction.');
    }
    $settingsResult = $db->query('SELECT active_semester FROM placement_settings WHERE id = 1 LIMIT 1 FOR UPDATE');
    if (!$settingsResult) {
        throw new RuntimeException('Unable to read the active semester setting: ' . $db->error);
    }
    $settings = $settingsResult->fetch_assoc();
    $settingsResult->free();
    if (!$settings) {
        $db->rollback();
        $db->close();
        activateSecondSemesterResponse([
            'success' => false,
            'message' => 'Placement settings row id=1 is missing.',
        ], 503);
    }

    $activeSemester = (int) $settings['active_semester'];
    if (!in_array($activeSemester, [1, 2], true)) {
        $db->rollback();
        $db->close();
        activateSecondSemesterResponse([
            'success' => false,
            'message' => 'The configured active semester is invalid.',
        ], 409);
    }

    if ($activeSemester !== $requestedSemester) {
        $update = $db->prepare('UPDATE placement_settings SET active_semester = ? WHERE id = 1');
        if (!$update) {
            throw new RuntimeException('Unable to prepare the semester activation: ' . $db->error);
        }
        $update->bind_param('i', $requestedSemester);
        if (!$update->execute()) {
            $error = $update->error;
            $update->close();
            throw new RuntimeException('Unable to activate the selected semester: ' . $error);
        }
        $update->close();
    }

    $reallocatedStudents = $requestedSemester === 2
        ? reallocateExhaustedLawAllocations($db)
        : [];
    $reallocatedCount = count($reallocatedStudents);

    if (!$db->commit()) {
        throw new RuntimeException('Unable to save the active placement semester.');
    }
    $db->close();

    activateSecondSemesterResponse([
        'success' => true,
        'active_semester' => $requestedSemester,
        'reallocated_count' => $reallocatedCount,
        'reallocated_students' => $reallocatedStudents,
        'message' => $reallocatedCount > 0
            ? "Semester 2 is active. {$reallocatedCount} pending Law student(s) were reallocated to College of Other Social Sciences."
            : "Semester {$requestedSemester} is now active for placement.",
    ]);
} catch (Throwable $error) {
    error_log('Placement semester activation failed: ' . $error->getMessage());
    if ($db instanceof mysqli) {
        $db->rollback();
        $db->close();
    }
    activateSecondSemesterResponse([
        'success' => false,
        'message' => 'Unable to activate the selected placement semester.',
    ], 500);
}

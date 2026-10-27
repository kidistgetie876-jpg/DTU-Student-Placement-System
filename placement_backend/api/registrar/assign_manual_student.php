<?php
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/placement_semester.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
header('Content-Type: application/json; charset=UTF-8');

function manualAssignmentRespond(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function normalizeStreamKey(string $stream): string
{
    $normalized = strtolower(trim((string) $stream));
    $normalized = preg_replace('/[^a-z]/i', '', $normalized) ?? '';
    $normalized = preg_replace('/sciences$/', 'science', $normalized) ?? $normalized;
    return $normalized;
}

function getStudentStreamCategory(string $stream): ?string
{
    $normalized = normalizeStreamKey($stream);
    if (in_array($normalized, ['natural', 'naturalscience'], true)) {
        return 'natural';
    }
    if (in_array($normalized, ['social', 'socialscience'], true)) {
        return 'social';
    }
    return null;
}

function getDepartmentStreamCategory(array $department): ?string
{
    $stream = normalizeStreamKey($department['stream'] ?? '');
    if (strpos($stream, 'natural') !== false) {
        return 'natural';
    }
    if (strpos($stream, 'social') !== false || strpos($stream, 'humanit') !== false) {
        return 'social';
    }

    $name = strtolower((string) ($department['name'] ?? ''));
    $college = strtolower((string) ($department['college_name'] ?? ''));
    if (
        strpos($college, 'business') !== false ||
        strpos($college, 'economics') !== false ||
        strpos($college, 'social') !== false ||
        strpos($college, 'humanit') !== false ||
        strpos($college, 'law') !== false ||
        strpos($college, 'educ') !== false ||
        strpos($name, 'history') !== false ||
        strpos($name, 'english') !== false ||
        strpos($name, 'psychology') !== false ||
        strpos($name, 'social') !== false ||
        strpos($name, 'law') !== false ||
        strpos($name, 'education') !== false
    ) {
        return 'social';
    }
    if (
        strpos($college, 'natural') !== false ||
        strpos($college, 'computational') !== false ||
        strpos($college, 'environment') !== false ||
        strpos($college, 'agric') !== false ||
        strpos($college, 'engineer') !== false ||
        preg_match('/biology|chemistry|physics|mathematics|computer|statistics|agricultur|engineering/', $name)
    ) {
        return 'natural';
    }
    return null;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
if (!isset($_SESSION['user_id']) || !in_array(strtolower((string) ($_SESSION['role'] ?? '')), ['registrar', 'admin'], true)) {
    manualAssignmentRespond(['success' => false, 'message' => 'Registrar access is required'], 403);
}

$db = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'] ?? '';

try {
    ensureUnassignedStudentIdentitySchema($db);
    if ($method === 'GET') {
        $studentId = filter_var($_GET['student_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        $admissionNumber = trim((string) ($_GET['admission_number'] ?? ''));
        if ($studentId === false && $admissionNumber === '') {
            manualAssignmentRespond(['success' => false, 'message' => 'A valid student_id or admission_number is required'], 400);
        }

        $studentLookupColumn = $studentId !== false ? 'student_id' : 'admission_number';
        $studentLookupValue = $studentId !== false ? (string) $studentId : $admissionNumber;
        $studentQuery = $db->prepare("SELECT stream FROM unassigned_students
             WHERE `{$studentLookupColumn}` = ? AND status = 'Not assigned' LIMIT 1");
        if (!$studentQuery) {
            throw new RuntimeException('Unable to prepare unassigned student lookup: ' . $db->error);
        }
        $studentQuery->bind_param('s', $studentLookupValue);
        if (!$studentQuery->execute()) {
            throw new RuntimeException('Unable to load the selected student: ' . $studentQuery->error);
        }
        $student = $studentQuery->get_result()->fetch_assoc();
        $studentQuery->close();
        if (!$student) {
            manualAssignmentRespond(['success' => false, 'message' => 'The selected student is not currently unassigned'], 404);
        }

        $studentCategory = getStudentStreamCategory((string) $student['stream']);
        if ($studentCategory === null) {
            manualAssignmentRespond(['success' => false, 'message' => 'The student stream is missing or unsupported'], 422);
        }

        $departmentColumns = studentPlacementTableColumns($db, 'departments');
        $placementColumns = studentPlacementTableColumns($db, 'placement_results');
        $departmentStatusColumn = in_array('status', $departmentColumns, true)
            ? 'status'
            : (in_array('placement_status', $departmentColumns, true) ? 'placement_status' : '');
        $departmentPlacementMatch = in_array('dept_id', $placementColumns, true)
            ? 'pr.dept_id = d.id'
            : (in_array('dept_name', $placementColumns, true) ? 'pr.dept_name = d.name' : '');
        $placementCountColumn = in_array('id', $placementColumns, true)
            ? 'id'
            : (in_array('dept_id', $placementColumns, true) ? 'dept_id' : 'dept_name');
        if ($departmentPlacementMatch === '' || !in_array($placementCountColumn, $placementColumns, true)) {
            throw new RuntimeException('Placement results are missing department identity columns.');
        }
        $placementStatusColumn = in_array('status', $placementColumns, true)
            ? 'status'
            : (in_array('placement_status', $placementColumns, true) ? 'placement_status' : '');
        $activePlacementCondition = $placementStatusColumn !== ''
            ? " AND (pr.`{$placementStatusColumn}` IS NULL OR pr.`{$placementStatusColumn}` NOT IN ('Rejected', 'Cancelled'))"
            : '';
        $activeDepartmentCondition = $departmentStatusColumn !== ''
            ? " WHERE LOWER(TRIM(COALESCE(d.`{$departmentStatusColumn}`, ''))) = 'active'"
            : '';
        $departmentResult = $db->query(
            "SELECT d.id, d.name, d.stream, d.college_name, d.capacity, COUNT(pr.`{$placementCountColumn}`) AS assigned
             FROM departments d
             LEFT JOIN placement_results pr ON {$departmentPlacementMatch}{$activePlacementCondition}
             {$activeDepartmentCondition}
             GROUP BY d.id, d.name, d.stream, d.college_name, d.capacity
             ORDER BY d.college_name, d.name"
        );
        if (!$departmentResult) {
            throw new RuntimeException('Unable to load department capacities: ' . $db->error);
        }

        $departments = [];
        while ($department = $departmentResult->fetch_assoc()) {
            $available = max(0, (int) $department['capacity'] - (int) $department['assigned']);
            if ($available < 1 || getDepartmentStreamCategory($department) !== $studentCategory) {
                continue;
            }
            $departments[] = [
                'id' => (int) $department['id'],
                'name' => (string) $department['name'],
                'stream' => (string) $department['stream'],
                'college' => (string) $department['college_name'],
                'capacity' => (int) $department['capacity'],
                'assigned' => (int) $department['assigned'],
                'available' => $available,
            ];
        }
        manualAssignmentRespond(['success' => true, 'departments' => $departments]);
    }

    if ($method !== 'POST') {
        header('Allow: GET, POST');
        manualAssignmentRespond(['success' => false, 'message' => 'Only GET and POST requests are allowed'], 405);
    }

    $input = json_decode((string) file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($input)) {
        manualAssignmentRespond(['success' => false, 'message' => 'Request body must be valid JSON'], 400);
    }
    $studentId = filter_var($input['student_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $admissionNumber = trim((string) ($input['admission_number'] ?? ''));
    $departmentId = filter_var($input['department_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $departmentName = trim((string) ($input['department_name'] ?? ''));
    if (($studentId === false && $admissionNumber === '') || ($departmentId === false && $departmentName === '')) {
        manualAssignmentRespond(['success' => false, 'message' => 'A valid student identifier and department_id or department_name are required'], 400);
    }
    $studentId = $studentId === false ? null : (int) $studentId;

    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start manual assignment transaction: ' . $db->error);
    }

    $departmentColumns = studentPlacementTableColumns($db, 'departments');
    $departmentStatusColumn = in_array('status', $departmentColumns, true)
        ? 'status'
        : (in_array('placement_status', $departmentColumns, true) ? 'placement_status' : '');
    $departmentCollegeId = in_array('college_id', $departmentColumns, true)
        ? 'college_id'
        : 'NULL AS college_id';
    $departmentStatusCondition = $departmentStatusColumn !== ''
        ? " AND `{$departmentStatusColumn}` = 'active'"
        : '';
    $departmentSql = $departmentId !== false
        ? $db->prepare("SELECT id, name, stream, college_name, capacity, {$departmentCollegeId} FROM departments WHERE id = ?{$departmentStatusCondition} FOR UPDATE")
        : $db->prepare("SELECT id, name, stream, college_name, capacity, {$departmentCollegeId} FROM departments WHERE name = ?{$departmentStatusCondition} FOR UPDATE");
    if (!$departmentSql) {
        throw new RuntimeException('Unable to prepare department lookup: ' . $db->error);
    }
    if ($departmentId !== false) {
        $departmentSql->bind_param('i', $departmentId);
    } else {
        $departmentSql->bind_param('s', $departmentName);
    }
    if (!$departmentSql->execute()) {
        throw new RuntimeException('Unable to load the selected department: ' . $departmentSql->error);
    }
    $department = $departmentSql->get_result()->fetch_assoc();
    $departmentSql->close();
    if (!$department) {
        $db->rollback();
        manualAssignmentRespond(['success' => false, 'message' => 'The selected department is not active or does not exist'], 404);
    }

    $studentLookupColumn = $studentId !== null ? 'student_id' : 'admission_number';
    $studentLookupValue = $studentId !== null ? (string) $studentId : $admissionNumber;
    $studentSql = $db->prepare("SELECT student_id, admission_number, id_number, full_name, email, stream
         FROM unassigned_students
         WHERE `{$studentLookupColumn}` = ? AND status = 'Not assigned'
         LIMIT 1 FOR UPDATE");
    if (!$studentSql) {
        throw new RuntimeException('Unable to prepare student lookup: ' . $db->error);
    }
    $studentSql->bind_param('s', $studentLookupValue);
    if (!$studentSql->execute()) {
        throw new RuntimeException('Unable to load the selected student: ' . $studentSql->error);
    }
    $student = $studentSql->get_result()->fetch_assoc();
    $studentSql->close();
    if (!$student) {
        $db->rollback();
        manualAssignmentRespond(['success' => false, 'message' => 'The selected student is no longer unassigned'], 409);
    }
    if (getStudentStreamCategory((string) $student['stream']) !== getDepartmentStreamCategory($department)) {
        $db->rollback();
        manualAssignmentRespond(['success' => false, 'message' => 'The selected department does not match the student stream'], 422);
    }

    $placementColumns = studentPlacementTableColumns($db, 'placement_results');
    $placementStatusColumn = in_array('status', $placementColumns, true)
        ? 'status'
        : (in_array('placement_status', $placementColumns, true) ? 'placement_status' : '');
    $activePlacementCondition = $placementStatusColumn !== ''
        ? " AND (`{$placementStatusColumn}` IS NULL OR `{$placementStatusColumn}` NOT IN ('Rejected', 'Cancelled'))"
        : '';
    $existingConditions = [];
    $existingValues = [];
    if ($student['student_id'] !== null && in_array('student_id', $placementColumns, true)) {
        $existingConditions[] = 'student_id = ?';
        $existingValues[] = (string) $student['student_id'];
    }
    foreach (['admission_number' => $student['admission_number'], 'id_number' => $student['id_number']] as $column => $value) {
        if (in_array($column, $placementColumns, true) && trim((string) $value) !== '') {
            $existingConditions[] = "`{$column}` = ?";
            $existingValues[] = (string) $value;
        }
    }
    if (!$existingConditions) {
        throw new RuntimeException('Placement results do not have a supported student identifier column.');
    }
    $existingSql = $db->prepare(
        'SELECT 1 FROM placement_results WHERE (' . implode(' OR ', $existingConditions)
        . ')' . $activePlacementCondition . ' LIMIT 1 FOR UPDATE'
    );
    if (!$existingSql) {
        throw new RuntimeException('Unable to prepare existing placement check: ' . $db->error);
    }
    $existingTypes = str_repeat('s', count($existingValues));
    $existingArguments = [$existingTypes];
    foreach ($existingValues as $index => $value) {
        $existingArguments[] = &$existingValues[$index];
    }
    if (!call_user_func_array([$existingSql, 'bind_param'], $existingArguments)) {
        $bindError = $existingSql->error;
        $existingSql->close();
        throw new RuntimeException('Unable to bind existing placement check: ' . $bindError);
    }
    if (!$existingSql->execute()) {
        throw new RuntimeException('Unable to check existing placement: ' . $existingSql->error);
    }
    $existingPlacement = $existingSql->get_result()->fetch_assoc();
    $existingSql->close();
    if ($existingPlacement) {
        $db->rollback();
        manualAssignmentRespond(['success' => false, 'message' => 'The student already has an active placement'], 409);
    }

    $occupancyCondition = in_array('dept_id', $placementColumns, true)
        ? 'dept_id = ?'
        : (in_array('dept_name', $placementColumns, true) ? 'dept_name = ?' : '');
    if ($occupancyCondition === '') {
        throw new RuntimeException('Placement results do not have a supported department identifier column.');
    }
    $occupancySql = $db->prepare(
        'SELECT COUNT(*) AS assigned FROM placement_results WHERE '
        . $occupancyCondition . $activePlacementCondition
    );
    if (!$occupancySql) {
        throw new RuntimeException('Unable to prepare department capacity check: ' . $db->error);
    }
    $selectedDepartmentId = (int) $department['id'];
    $occupancyValue = $occupancyCondition === 'dept_id = ?'
        ? (string) $selectedDepartmentId
        : (string) $department['name'];
    $occupancySql->bind_param('s', $occupancyValue);
    if (!$occupancySql->execute()) {
        throw new RuntimeException('Unable to check department capacity: ' . $occupancySql->error);
    }
    $occupancy = $occupancySql->get_result()->fetch_assoc();
    $occupancySql->close();
    if ((int) ($occupancy['assigned'] ?? 0) >= (int) $department['capacity']) {
        $db->rollback();
        manualAssignmentRespond(['success' => false, 'message' => 'The selected department no longer has available seats'], 409);
    }

    $idNumber = trim((string) ($student['admission_number'] ?: $student['id_number']));
    $studentName = (string) $student['full_name'];
    $studentStream = (string) $student['stream'];
    $collegeName = (string) $department['college_name'];
    $studentDataColumns = studentPlacementTableColumns($db, 'student_data');
    $finalScore = 0.0;
    $scoreColumn = in_array('cumulative_avg', $studentDataColumns, true)
        ? 'cumulative_avg'
        : (in_array('cumulative_score', $studentDataColumns, true) ? 'cumulative_score' : '');
    $scoreIdentityColumn = $student['student_id'] !== null && in_array('user_id', $studentDataColumns, true)
        ? 'user_id'
        : (in_array('admission_number', $studentDataColumns, true) ? 'admission_number' : 'id_number');
    $scoreIdentityValue = $scoreIdentityColumn === 'user_id'
        ? (string) $student['student_id']
        : $idNumber;
    if ($scoreColumn !== '' && in_array($scoreIdentityColumn, $studentDataColumns, true)) {
        $scoreSql = $db->prepare(
            "SELECT `{$scoreColumn}` FROM student_data WHERE `{$scoreIdentityColumn}` = ? LIMIT 1"
        );
        if (!$scoreSql) {
            throw new RuntimeException('Unable to prepare student merit score lookup: ' . $db->error);
        }
        $scoreSql->bind_param('s', $scoreIdentityValue);
        if (!$scoreSql->execute()) {
            $scoreError = $scoreSql->error;
            $scoreSql->close();
            throw new RuntimeException('Unable to load student merit score: ' . $scoreError);
        }
        $scoreRow = $scoreSql->get_result()->fetch_assoc();
        $scoreSql->close();
        if (is_numeric($scoreRow[$scoreColumn] ?? null)) {
            $finalScore = (float) $scoreRow[$scoreColumn];
        }
    }
    $insertData = [
        'student_id' => $student['student_id'] !== null ? (string) $student['student_id'] : null,
        'admission_number' => $idNumber,
        'id_number' => $idNumber,
        'dept_id' => (string) $selectedDepartmentId,
        'dept_name' => (string) $department['name'],
        'stream' => (string) $department['stream'],
        'college_name' => $collegeName,
        'final_score' => (string) $finalScore,
        'choice_rank' => '0',
    ];
    $settingsColumns = studentPlacementTableColumns($db, 'placement_settings');
    $activeSemester = 1;
    if (in_array('active_semester', $settingsColumns, true)) {
        $settingsResult = $db->query('SELECT active_semester FROM placement_settings WHERE id = 1 LIMIT 1');
        if (!$settingsResult) {
            throw new RuntimeException('Unable to read the active placement semester: ' . $db->error);
        }
        $settings = $settingsResult->fetch_assoc();
        $settingsResult->free();
        $activeSemester = in_array((int) ($settings['active_semester'] ?? 1), [1, 2], true)
            ? (int) $settings['active_semester']
            : 1;
    }
    if (in_array('placement_semester', $placementColumns, true)) {
        $insertData['placement_semester'] = (string) $activeSemester;
    }
    $insertColumns = array_values(array_filter(
        array_keys($insertData),
        static fn (string $column): bool => in_array($column, $placementColumns, true)
    ));
    $manualStatusColumn = in_array('status', $placementColumns, true)
        ? 'status'
        : (in_array('placement_status', $placementColumns, true) ? 'placement_status' : '');
    if ($manualStatusColumn !== '') {
        $insertData[$manualStatusColumn] = 'Pending';
        $insertColumns[] = $manualStatusColumn;
    }
    $placementDateColumn = in_array('placed_at', $placementColumns, true)
        ? 'placed_at'
        : (in_array('created_at', $placementColumns, true) ? 'created_at' : '');
    if ($placementDateColumn !== '') {
        $insertColumns[] = $placementDateColumn;
    }
    if (!$insertColumns) {
        throw new RuntimeException('Placement results have no supported columns for a manual assignment.');
    }
    $insertExpressions = array_map(
        static fn (string $column): string => $column === $placementDateColumn ? 'NOW()' : '?',
        $insertColumns
    );
    $insert = $db->prepare(
        'INSERT INTO placement_results (`' . implode('`, `', $insertColumns) . '`) VALUES ('
        . implode(', ', $insertExpressions) . ')'
    );
    if (!$insert) {
        throw new RuntimeException('Unable to prepare manual placement: ' . $db->error);
    }
    $insertValues = array_map(
        static fn (string $column) => $insertData[$column],
        array_values(array_filter($insertColumns, static fn (string $column): bool => $column !== $placementDateColumn))
    );
    $insertArguments = [str_repeat('s', count($insertValues))];
    foreach ($insertValues as $index => $value) {
        $insertArguments[] = &$insertValues[$index];
    }
    if (!call_user_func_array([$insert, 'bind_param'], $insertArguments)) {
        $insertError = $insert->error;
        $insert->close();
        throw new RuntimeException('Unable to bind manual placement values: ' . $insertError);
    }
    if (!$insert->execute()) {
        $insertError = $insert->error;
        $insert->close();
        throw new RuntimeException('Unable to save manual placement: ' . $insertError);
    }
    $insert->close();

    $profileUpdates = [];
    if (in_array('department', $studentDataColumns, true)) {
        $profileUpdates['department'] = (string) $department['name'];
    }
    $studentStatusColumn = in_array('placement_status', $studentDataColumns, true)
        ? 'placement_status'
        : (in_array('status', $studentDataColumns, true) ? 'status' : '');
    if ($studentStatusColumn !== '') {
        $profileUpdates[$studentStatusColumn] = $activeSemester === 1 ? 'Pending 2nd Semester' : 'Placed';
    }
    if (in_array('is_choice_editable', $studentDataColumns, true)) {
        $profileUpdates['is_choice_editable'] = '0';
    }
    foreach (['is_locked', 'is_placement_locked'] as $lockColumn) {
        if (in_array($lockColumn, $studentDataColumns, true)) {
            $profileUpdates[$lockColumn] = '1';
        }
    }
    $profileIdentityColumn = $student['student_id'] !== null && in_array('user_id', $studentDataColumns, true)
        ? 'user_id'
        : (in_array('admission_number', $studentDataColumns, true) ? 'admission_number' : 'id_number');
    $profileIdentityValue = $profileIdentityColumn === 'user_id'
        ? (string) $student['student_id']
        : $idNumber;
    if ($profileUpdates && in_array($profileIdentityColumn, $studentDataColumns, true)) {
        $profileSets = array_map(static fn (string $column): string => "`{$column}` = ?", array_keys($profileUpdates));
        $profileSql = $db->prepare(
            'UPDATE student_data SET ' . implode(', ', $profileSets) . " WHERE `{$profileIdentityColumn}` = ?"
        );
        if (!$profileSql) {
            throw new RuntimeException('Unable to prepare student status update: ' . $db->error);
        }
        $profileValues = array_values($profileUpdates);
        $profileValues[] = $profileIdentityValue;
        $profileArguments = [str_repeat('s', count($profileValues))];
        foreach ($profileValues as $index => $value) {
            $profileArguments[] = &$profileValues[$index];
        }
        if (!call_user_func_array([$profileSql, 'bind_param'], $profileArguments) || !$profileSql->execute()) {
            $profileError = $profileSql->error;
            $profileSql->close();
            throw new RuntimeException('Unable to update student status: ' . $profileError);
        }
        $profileSql->close();
    }

    if ($activeSemester === 1) {
        $placementGroup = placementDepartmentGroup($department);
        $allocatedCollege = placementDepartmentCapacityCollegeName($department);
        if ($placementGroup === '' || $allocatedCollege === '') {
            throw new RuntimeException('Unable to create the second-semester allocation for the Semester 1 assignment.');
        }

        $allocationStudentId = $student['student_id'] === null ? null : (int) $student['student_id'];
        $allocationAdmissionNumber = $idNumber !== '' ? $idNumber : 'student:' . (int) ($student['student_id'] ?? 0);
        $allocationCollegeId = (int) ($department['college_id'] ?? 0);
        $allocationCollegeId = $allocationCollegeId > 0 ? $allocationCollegeId : null;
        $allocationStream = (string) $department['stream'];
        $allocationSql = $db->prepare(
            "INSERT INTO placement_college_allocations
                (student_id, admission_number, college_id, college_name, stream, placement_group, target_semester, status)
             VALUES (?, ?, ?, ?, ?, ?, 2, 'pending')
             ON DUPLICATE KEY UPDATE
                student_id = VALUES(student_id), college_id = VALUES(college_id),
                college_name = VALUES(college_name), stream = VALUES(stream),
                placement_group = VALUES(placement_group), target_semester = 2, status = 'pending'"
        );
        if (!$allocationSql) {
            throw new RuntimeException('Unable to prepare the second-semester college allocation: ' . $db->error);
        }
        $allocationSql->bind_param(
            'isisss',
            $allocationStudentId,
            $allocationAdmissionNumber,
            $allocationCollegeId,
            $allocatedCollege,
            $allocationStream,
            $placementGroup
        );
        if (!$allocationSql->execute()) {
            $allocationError = $allocationSql->error;
            $allocationSql->close();
            throw new RuntimeException('Unable to save the second-semester college allocation: ' . $allocationError);
        }
        $allocationSql->close();
    }

    $deleteColumn = $student['student_id'] !== null ? 'student_id' : 'admission_number';
    $deleteValue = $student['student_id'] !== null
        ? (string) $student['student_id']
        : (string) ($student['admission_number'] ?: $student['id_number']);
    $deleteUnassigned = $db->prepare(
        "DELETE FROM unassigned_students WHERE `{$deleteColumn}` = ? AND status = 'Not assigned'"
    );
    if (!$deleteUnassigned) {
        throw new RuntimeException('Unable to prepare unassigned roster update: ' . $db->error);
    }
    $deleteUnassigned->bind_param('s', $deleteValue);
    if (!$deleteUnassigned->execute() || $deleteUnassigned->affected_rows !== 1) {
        throw new RuntimeException('Unable to remove the student from the unassigned roster');
    }
    $deleteUnassigned->close();

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit manual assignment: ' . $db->error);
    }
    manualAssignmentRespond([
        'success' => true,
        'message' => "{$studentName} was assigned to {$department['name']} and is pending department approval.",
        'student_id' => $student['student_id'] !== null ? (int) $student['student_id'] : null,
        'admission_number' => $idNumber,
        'department_id' => $selectedDepartmentId,
        'department_name' => (string) $department['name'],
        'available' => max(0, (int) $department['capacity'] - ((int) $occupancy['assigned'] + 1)),
    ]);
} catch (Throwable $error) {
    if (isset($db) && $db instanceof mysqli && $db->connect_errno === 0) {
        $db->rollback();
    }
    error_log('Manual student assignment failed: ' . $error->getMessage());
    manualAssignmentRespond(['success' => false, 'message' => 'Unable to assign the selected student'], 500);
} finally {
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
}

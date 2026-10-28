<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
/**
 * placement_engine.php - የዲባር (DTU) የምደባ አልጎሪዝም
 * ተማሪዎችን በውጤት (Merit) አበጥሮ በዲፓርትመንት ኮታ መሰረት ይመድባል።
 */

include __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/placement_scoring.php';
require_once __DIR__ . '/../../config/placement_semester.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
header('Content-Type: application/json');

function clearPlacementUnassignedRecord(mysqli $db, ?int $studentId, string $admissionNumber): void
{
    $columns = studentPlacementTableColumns($db, 'unassigned_students');
    $conditions = [];
    $values = [];
    if ($studentId !== null && in_array('student_id', $columns, true)) {
        $conditions[] = '`student_id` = ?';
        $values[] = (string) $studentId;
    }
    if ($admissionNumber !== '' && in_array('admission_number', $columns, true)) {
        $conditions[] = '`admission_number` = ?';
        $values[] = $admissionNumber;
    }
    if (!$conditions) {
        return;
    }
    $statement = $db->prepare('DELETE FROM unassigned_students WHERE ' . implode(' OR ', $conditions));
    if (!$statement) {
        throw new RuntimeException('Unable to prepare unassigned student cleanup');
    }
    $types = str_repeat('s', count($values));
    $arguments = [$types];
    foreach ($values as $index => $value) {
        $arguments[] = &$values[$index];
    }
    if (!call_user_func_array([$statement, 'bind_param'], $arguments) || !$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to clean up unassigned student record: ' . $error);
    }
    $statement->close();
}

function resetPlacementStateForFreshRun(mysqli $db): void
{
    $db->begin_transaction();

    foreach (['placement_results', 'unassigned_students', 'placement_college_allocations'] as $table) {
        if (!studentPlacementTableExists($db, $table)) {
            continue;
        }
        if (!$db->query('DELETE FROM `' . $table . '`')) {
            throw new RuntimeException("Unable to clear {$table}: " . $db->error);
        }
    }

    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    if ($studentColumns) {
        $statusColumns = array_values(array_filter(
            ['placement_status', 'status'],
            static fn(string $column): bool => in_array($column, $studentColumns, true)
        ));
        if ($statusColumns) {
            $setClauses = array_map(static fn(string $column): string => "`{$column}` = 'Pending'", $statusColumns);
            $eligibleClauses = array_map(
                static fn(string $column): string => "LOWER(TRIM(COALESCE(`{$column}`, ''))) NOT IN ('excluded', 'inactive', 'disabled')",
                $statusColumns
            );
            if (!$db->query(
                'UPDATE `student_data` SET ' . implode(', ', $setClauses)
                . ' WHERE ' . implode(' AND ', $eligibleClauses)
            )) {
                throw new RuntimeException('Unable to reset student placement statuses: ' . $db->error);
            }
        }
    }

    $departmentColumns = studentPlacementTableColumns($db, 'departments');
    if ($departmentColumns) {
        $sourceColumn = in_array('total_capacity', $departmentColumns, true)
            ? 'total_capacity'
            : (in_array('capacity', $departmentColumns, true) ? 'capacity' : '');
        $targetColumn = in_array('available_capacity', $departmentColumns, true)
            ? 'available_capacity'
            : (in_array('remaining_capacity', $departmentColumns, true) ? 'remaining_capacity' : '');
        if ($sourceColumn !== '' && $targetColumn !== '') {
            if (!$db->query("UPDATE `departments` SET `{$targetColumn}` = `{$sourceColumn}`")) {
                throw new RuntimeException('Unable to restore department capacities: ' . $db->error);
            }
        }
    }

    $collegeColumns = studentPlacementTableColumns($db, 'colleges');
    if ($collegeColumns) {
        $sourceColumn = in_array('original_second_sem_capacity', $collegeColumns, true)
            ? 'original_second_sem_capacity'
            : (in_array('original_second_semester_capacity', $collegeColumns, true) ? 'original_second_semester_capacity' : '');
        $targetColumn = in_array('second_sem_capacity', $collegeColumns, true)
            ? 'second_sem_capacity'
            : (in_array('second_semester_capacity', $collegeColumns, true) ? 'second_semester_capacity' : '');
        if ($sourceColumn !== '' && $targetColumn !== '') {
            if (!$db->query("UPDATE `colleges` SET `{$targetColumn}` = `{$sourceColumn}`")) {
                throw new RuntimeException('Unable to restore college capacities: ' . $db->error);
            }
        }
    }

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit placement reset: ' . $db->error);
    }
}

function savePendingSemesterPlacementResult(
    mysqli $db,
    array $student,
    array $target,
    array $placementColumns,
    int $semester
): void {
    foreach (['dept_id', 'choice_rank', 'status'] as $requiredColumn) {
        if (!in_array($requiredColumn, $placementColumns, true)) {
            throw new RuntimeException(
                "Pending semester placement requires placement_results.{$requiredColumn}."
            );
        }
    }

    $data = [
        'student_id' => $student['id'],
        'admission_number' => $student['admission_number'],
        'id_number' => $student['id_number'],
        'dept_id' => null,
        'dept_name' => '',
        'stream' => $target['stream'],
        'college_name' => $target['college_name'],
        'final_score' => (float) $student['final_merit_score'],
        'choice_rank' => (int) ($target['choice_rank'] ?? 0),
        'status' => 'Pending 2nd Semester',
        'placement_semester' => $semester,
    ];
    $insertColumns = array_values(array_filter(
        array_keys($data),
        static fn(string $column): bool => in_array($column, $placementColumns, true)
    ));
    if (in_array('placed_at', $placementColumns, true)) {
        $insertColumns[] = 'placed_at';
    }

    $identityConditions = [];
    $identityValues = [];
    foreach (['student_id', 'admission_number', 'id_number'] as $identityColumn) {
        if (!in_array($identityColumn, $placementColumns, true) || empty($data[$identityColumn])) {
            continue;
        }
        $identityConditions[] = "`{$identityColumn}` = ?";
        $identityValues[] = $data[$identityColumn];
    }
    if (!$identityConditions) {
        throw new RuntimeException('Pending semester placement requires a supported student identifier.');
    }

    $values = array_map(
        static fn(string $column) => $column === 'placed_at' ? null : $data[$column],
        array_values(array_filter($insertColumns, static fn(string $column): bool => $column !== 'placed_at'))
    );
    $valueExpressions = array_map(
        static fn(string $column): string => $column === 'placed_at' ? 'NOW()' : '?',
        $insertColumns
    );
    $semesterCondition = in_array('placement_semester', $placementColumns, true)
        ? " AND placement_semester = {$semester}"
        : '';
    $statement = $db->prepare(
        'INSERT INTO placement_results (`' . implode('`, `', $insertColumns) . '`) '
        . 'SELECT ' . implode(', ', $valueExpressions)
        . ' WHERE NOT EXISTS (SELECT 1 FROM placement_results WHERE ('
        . implode(' OR ', $identityConditions) . ')' . $semesterCondition . ')'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare the pending semester placement result.');
    }

    $boundValues = array_merge($values, $identityValues);
    $types = str_repeat('s', count($boundValues));
    $arguments = [$types];
    foreach ($boundValues as $index => $value) {
        $arguments[] = &$boundValues[$index];
    }
    if (!call_user_func_array([$statement, 'bind_param'], $arguments) || !$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to save the pending semester placement result: ' . $error);
    }
    if ($statement->affected_rows !== 1) {
        $statement->close();
        throw new RuntimeException('Student already has a placement result for this semester.');
    }
    $statement->close();
}

function savePlacementCollegeAllocation(mysqli $db, array $student, array $target): void
{
    $statement = $db->prepare(
        "INSERT INTO placement_college_allocations
            (student_id, admission_number, college_id, college_name, stream, placement_group, target_semester, status)
         VALUES (?, ?, ?, ?, ?, ?, 2, 'pending')
         ON DUPLICATE KEY UPDATE
            student_id = VALUES(student_id), college_id = VALUES(college_id),
            college_name = VALUES(college_name), stream = VALUES(stream),
            placement_group = VALUES(placement_group), target_semester = 2, status = 'pending'"
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare the second-semester college allocation.');
    }
    $studentId = $student['id'] === null ? null : (int) $student['id'];
    $collegeId = (int) ($target['college_id'] ?? 0);
    $collegeId = $collegeId > 0 ? $collegeId : null;
    $admissionNumber = trim((string) $student['admission_number']);
    if ($admissionNumber === '') {
        $admissionNumber = 'student:' . (int) ($student['id'] ?? 0);
    }
    $collegeName = (string) $target['college_name'];
    $stream = (string) $target['stream'];
    $placementGroup = (string) $target['placement_group'];
    $statement->bind_param('isisss', $studentId, $admissionNumber, $collegeId, $collegeName, $stream, $placementGroup);
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to save second-semester college allocation: ' . $error);
    }
    $statement->close();
}

function updatePlacementCollegeAllocationStatus(mysqli $db, array $student, string $status): void
{
    $statement = $db->prepare(
        'UPDATE placement_college_allocations SET status = ?
         WHERE ((student_id = ? AND ? > 0) OR admission_number = ?) AND target_semester = 2'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare second-semester allocation status update.');
    }
    $studentId = $student['id'] === null ? 0 : (int) $student['id'];
    $admissionNumber = trim((string) $student['admission_number']);
    if ($admissionNumber === '') {
        $admissionNumber = 'student:' . $studentId;
    }
    $statement->bind_param('siis', $status, $studentId, $studentId, $admissionNumber);
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to update second-semester allocation status: ' . $error);
    }
    $statement->close();
}

function updatePlacementCollegeAllocationTarget(mysqli $db, array $student, array $department): void
{
    $statement = $db->prepare(
        'UPDATE placement_college_allocations
         SET college_id = ?, college_name = ?, stream = ?, placement_group = ?, status = \'placed\'
         WHERE ((student_id = ? AND ? > 0) OR TRIM(admission_number) = TRIM(?))
           AND target_semester = 2'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare the final college allocation update.');
    }
    $studentId = $student['id'] === null ? 0 : (int) $student['id'];
    $admissionNumber = trim((string) $student['admission_number']);
    if ($admissionNumber === '') {
        $admissionNumber = 'student:' . $studentId;
    }
    $collegeId = (int) ($department['college_id'] ?? 0);
    $collegeName = placementDepartmentCapacityCollegeName($department);
    $stream = (string) ($department['stream'] ?? '');
    $placementGroup = placementDepartmentGroup($department);
    $statement->bind_param(
        'isssiis',
        $collegeId,
        $collegeName,
        $stream,
        $placementGroup,
        $studentId,
        $studentId,
        $admissionNumber
    );
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to update the final college allocation: ' . $error);
    }
    $statement->close();
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ((int) ($_SESSION['user_id'] ?? 0) <= 0) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Your session has expired. Please sign in again.']);
    exit;
}
if ($role !== 'registrar' && $role !== 'admin') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Registrar access is required']);
    exit;
}

$db = null;
try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }
    $createTableSql = "CREATE TABLE IF NOT EXISTS placement_college_allocations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        student_id BIGINT NULL,
        admission_number VARCHAR(50) NOT NULL,
        college_id INT NULL,
        college_name VARCHAR(150) NOT NULL,
        stream VARCHAR(50) NOT NULL,
        placement_group VARCHAR(60) NOT NULL,
        target_semester TINYINT UNSIGNED NOT NULL DEFAULT 2,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_placement_college_allocation_admission (admission_number),
        KEY idx_placement_college_allocations_student (student_id),
        KEY idx_placement_college_allocations_group (placement_group, target_semester, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    if (!$db->query($createTableSql)) {
        throw new RuntimeException('Unable to prepare the college allocation table.');
    }
} catch (Throwable $error) {
    error_log('Placement database initialization failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Placement could not start because the database is unavailable.']);
    if ($db instanceof mysqli) {
        $db->close();
    }
    exit;
}

$rawInput = file_get_contents('php://input');
$input = [];
if (is_string($rawInput) && trim($rawInput) !== '') {
    $decodedInput = json_decode($rawInput, true);
    if (json_last_error() === JSON_ERROR_NONE && is_array($decodedInput)) {
        $input = $decodedInput;
    }
}

if (!$input || !is_array($input)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
    exit;
}

$clearPlacementsRequest = filter_var(
    $input['clear_placements'] ?? $input['clearPlacements'] ?? $input['clear_existing_placements'] ?? false,
    FILTER_VALIDATE_BOOLEAN
);
if ($clearPlacementsRequest || (($input['action'] ?? '') === 'clear_placements')) {
    try {
        resetPlacementStateForFreshRun($db);
        echo json_encode([
            'success' => true,
            'message' => 'Placement data has been cleared and capacities restored.',
        ]);
        exit;
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Unable to clear placement data: ' . $error->getMessage(),
        ]);
        exit;
    }
}

$stream = trim((string) ($input['stream'] ?? $input['selectedStream'] ?? ''));
$college = trim((string) ($input['college'] ?? $input['selectedCollege'] ?? ''));
$forceRerunValue = $input['force_rerun'] ?? $_GET['force_rerun'] ?? false;
$forceRerun = $forceRerunValue === true
    || $forceRerunValue === 1
    || (is_string($forceRerunValue) && in_array(strtolower(trim($forceRerunValue)), ['true', '1', 'yes', 'on'], true))
    || in_array(
        $input['action'] ?? $_GET['action'] ?? '',
        ['rerun_placement', 'force_rerun_placement'],
        true
    );
$rerunUnpublished = ($input['rerun_unpublished'] ?? false) === true
    || in_array(
        $input['action'] ?? $_GET['action'] ?? '',
        ['rerun_unpublished', 'rerun_placement', 'force_rerun_placement'],
        true
    )
    || $forceRerun;
$requestedSemester = null;
if (array_key_exists('semester', $input)) {
    $requestedSemester = filter_var($input['semester'], FILTER_VALIDATE_INT);
    if ($requestedSemester === false || !in_array($requestedSemester, [1, 2], true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'The requested placement semester is invalid.']);
        exit;
    }
}
$studentIds = $input['student_ids'] ?? $input['selectedStudentIds'] ?? $input['studentIds'] ?? [];
if (!is_array($studentIds)) {
    $studentIds = $studentIds !== null && $studentIds !== '' ? [$studentIds] : [];
}
$input['selectedStudentIds'] = $studentIds;
if ($college === '' && isset($input['selectedCollege'])) {
    $college = trim((string) $input['selectedCollege']);
}
if ($stream === '' && isset($input['selectedStream'])) {
    $stream = trim((string) $input['selectedStream']);
}
if (!$rerunUnpublished && empty($studentIds) && empty($input['students'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'No students selected for placement.']);
    exit;
}

function loadPlacementWeights(mysqli $db, array $inputRules): array
{
    $weights = [
        'gpaWeight' => 50.0,
        'grade12Weight' => 20.0,
        'cocWeight' => 30.0,
        'g12_total_base' => 600.0,
        'maxScoreCap' => 100.0,
        'femaleBonusPoints' => 5.0,
        'disabilityBonusPoints' => 5.0,
        'minorityBonusPoints' => 5.0,
        'generalQuotaPercent' => 80.0,
        'reservedFemaleQuotaPercent' => 20.0,
        'minGpa' => 1.75,
    ];
    $aliases = [
        'gpa' => 'gpaWeight',
        'gpaweight' => 'gpaWeight',
        'grade12' => 'grade12Weight',
        'grade12weight' => 'grade12Weight',
        'grade12result' => 'grade12Weight',
        'coc' => 'cocWeight',
        'cocweight' => 'cocWeight',
        'cocresult' => 'cocWeight',
        'maxscorecap' => 'maxScoreCap',
        'maxcumulativescore' => 'maxScoreCap',
        'femalebonuspoints' => 'femaleBonusPoints',
        'disabilitybonuspoints' => 'disabilityBonusPoints',
        'minoritybonuspoints' => 'minorityBonusPoints',
        'generalquotapercent' => 'generalQuotaPercent',
        'reservedfemalequotapercent' => 'reservedFemaleQuotaPercent',
    ];

    foreach ($inputRules as $key => $value) {
        $normalizedKey = strtolower(preg_replace('/[^a-z0-9]/', '', (string) $key));
        if (isset($aliases[$normalizedKey]) && is_numeric($value) && (float) $value >= 0 && (float) $value <= 100) {
            $weights[$aliases[$normalizedKey]] = (float) $value;
        }
    }

    $result = null;
    try {
        $result = $db->query('SELECT gpa_weight, grade_12_weight, coc_weight, g12_total_base, max_score_cap, female_bonus_points, disability_bonus_points, minority_bonus_points, minority_male_bonus_points, minority_female_bonus_points, minority_disability_bonus_points, female_disability_minority_bonus_points, general_quota_percent, reserved_female_quota_percent, min_gpa FROM placement_settings WHERE id = 1 LIMIT 1');
    } catch (Throwable $error) {
        error_log('Official placement settings unavailable; using policy defaults: ' . $error->getMessage());
    }
    if ($result) {
        $row = $result->fetch_assoc();
        $columns = [
            'gpaWeight' => 'gpa_weight',
            'grade12Weight' => 'grade_12_weight',
            'cocWeight' => 'coc_weight',
            'g12_total_base' => 'g12_total_base',
            'maxScoreCap' => 'max_score_cap',
            'femaleBonusPoints' => 'female_bonus_points',
            'disabilityBonusPoints' => 'disability_bonus_points',
            'minorityBonusPoints' => 'minority_bonus_points',
            'minorityMaleBonusPoints' => 'minority_male_bonus_points',
            'minorityFemaleBonusPoints' => 'minority_female_bonus_points',
            'minorityDisabilityBonusPoints' => 'minority_disability_bonus_points',
            'femaleDisabilityMinorityBonusPoints' => 'female_disability_minority_bonus_points',
            'generalQuotaPercent' => 'general_quota_percent',
            'reservedFemaleQuotaPercent' => 'reserved_female_quota_percent',
            'minGpa' => 'min_gpa',
        ];
        foreach ($columns as $key => $column) {
            if (isset($row[$column]) && is_numeric($row[$column]) && (float) $row[$column] >= 0) {
                $weights[$key] = (float) $row[$column];
            }
        }
    }

    if (abs($weights['generalQuotaPercent'] + $weights['reservedFemaleQuotaPercent'] - 100.0) > 0.00001) {
        $weights['generalQuotaPercent'] = 80.0;
        $weights['reservedFemaleQuotaPercent'] = 20.0;
    }
    if ($weights['minGpa'] > 4.0) {
        $weights['minGpa'] = 1.75;
    }
    return $weights;
}

try {
$rules = loadPlacementWeights($db, $input['rules'] ?? []);
$placementSettingsColumns = studentPlacementTableColumns($db, 'placement_settings');
$activeSemester = 1;
if (in_array('active_semester', $placementSettingsColumns, true)) {
    $activeSemesterResult = $db->query('SELECT active_semester FROM placement_settings WHERE id = 1 LIMIT 1');
    if ($activeSemesterResult) {
        $activeSemester = (int) ($activeSemesterResult->fetch_assoc()['active_semester'] ?? 1);
        $activeSemesterResult->free();
    }
}
if (!in_array($activeSemester, [1, 2], true)) {
    $activeSemester = 1;
}
if ($rerunUnpublished && $requestedSemester !== null && $requestedSemester !== $activeSemester) {
    throw new RuntimeException(
        "The requested Semester {$requestedSemester} does not match the active placement semester ({$activeSemester}). Refresh placement settings and try again.",
        409
    );
}

foreach ($rules as $key => $value) {
    if (!is_numeric($value) || (float) $value < 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid weight value for ' . $key]);
        exit;
    }
}

function normalizeDepartmentName($value): string
{
    return strtolower(trim((string) $value));
}

function normalizeYesNo($value): bool
{
    if (is_bool($value))
        return $value;
    if (is_numeric($value))
        return (int) $value !== 0;
    $normalized = strtolower(trim((string) $value));
    return in_array($normalized, ['yes', 'y', 'true', '1', 'on'], true);
}

function isDevelopingRegion($value): bool
{
    if (is_bool($value)) {
        return $value;
    }
    if (is_numeric($value)) {
        return (int) $value !== 0;
    }
    $normalized = strtolower(trim((string) $value));
    return in_array($normalized, ['yes', 'y', 'true', '1', 'on', 'minority', 'developing', 'developing_region', 'developingregion'], true)
        || (bool) preg_match('/\b(afar|somali|gambella|benishangul[\s-]*gumuz|benishangul|harari)\b/', $normalized);
}

function normalizeScorePercent($value, float $maximum): float
{
    if (is_bool($value)) {
        return $value ? 100.0 : 0.0;
    }
    $normalized = strtolower(trim((string) $value));
    if (in_array($normalized, ['yes', 'y', 'true', 'on'], true)) {
        return 100.0;
    }
    if (in_array($normalized, ['', 'no', 'n', 'false', 'off'], true)) {
        return 0.0;
    }

    $score = (float) $value;
    return min(100.0, max(0.0, ($score / $maximum) * 100.0));
}

function calculateOfficialPlacementScore(float $gpa, float $grade12, float $coc, string $gender, $disability, $developingRegion, array $rules): float
{
    return calculatePlacementCumulativeScore(
        $gpa,
        $grade12,
        $coc,
        $gender,
        $disability,
        $developingRegion,
        $rules
    );
}

function computeMeritScore(array $student, array $rules): float
{
    $persistedScore = (float) ($student['cumulative_score'] ?? 0);
    if ($persistedScore > 0) {
        return $persistedScore;
    }
    $gpa = (float) ($student['cgpa'] ?? $student['gpa'] ?? 0);
    $grade12 = (float) ($student['grade12'] ?? $student['grade_12_result'] ?? $student['grade_12'] ?? 0);
    $coc = (float) ($student['coc'] ?? $student['coc_result'] ?? 0);
    $gender = trim((string) ($student['gender'] ?? ''));
    $disability = $student['hasDisability'] ?? $student['disability'] ?? false;
    $developingRegion = placementScoringFlag($student['developingRegion'] ?? false)
        || placementScoringFlag($student['minority'] ?? $student['is_minority'] ?? false)
        || placementScoringFlag($student['region'] ?? false);

    return calculateOfficialPlacementScore($gpa, $grade12, $coc, $gender, $disability, $developingRegion, $rules);
}

    $placementLock = $db->query("SELECT GET_LOCK('placement_engine', 10) AS lock_acquired");
    if (!$placementLock || (int) $placementLock->fetch_assoc()['lock_acquired'] !== 1) {
        throw new Exception('Another placement run is already in progress');
    }

    ensureUnassignedStudentIdentitySchema($db);
    $db->begin_transaction();

    $departmentColumns = studentPlacementTableColumns($db, 'departments');
    $departmentStatusColumn = in_array('status', $departmentColumns, true)
        ? 'status'
        : (in_array('placement_status', $departmentColumns, true) ? 'placement_status' : '');
    $collegeAllocationColumns = studentPlacementTableColumns($db, 'placement_college_allocations');
    $studentDataColumns = studentPlacementTableColumns($db, 'student_data');
    $studentStatusColumn = in_array('placement_status', $studentDataColumns, true)
        ? 'placement_status'
        : (in_array('status', $studentDataColumns, true) ? 'status' : '');
    $studentEligibilityConditions = [];
    if (in_array('status', $studentDataColumns, true)) {
        $studentEligibilityConditions[] = "LOWER(TRIM(COALESCE(sd.`status`, ''))) NOT IN ('inactive', 'disabled')";
    }
    $placementEligibilityColumn = in_array('placement_status', $studentDataColumns, true)
        ? 'placement_status'
        : (in_array('status', $studentDataColumns, true) ? 'status' : '');
    if ($placementEligibilityColumn !== '') {
        $validPlacementStatuses = $activeSemester === 2
            ? "'pending', 'pending 1st semester', 'pending 2nd semester', 'placed in semester 1', 'allocated', 'eligible', 'unplaced'"
            : "'pending', 'pending 1st semester', 'eligible', 'unplaced', 'not assigned', 'unassigned'";
        $studentEligibilityConditions[] = "(
            sd.`{$placementEligibilityColumn}` IS NULL
            OR LOWER(TRIM(sd.`{$placementEligibilityColumn}`)) IN ({$validPlacementStatuses})
        )";
    }
    $studentEligibilityCondition = $studentEligibilityConditions
        ? ' AND ' . implode(' AND ', $studentEligibilityConditions)
        : '';
    $firstSemesterAllocationCondition = '';
    if ($activeSemester === 1 && !$rerunUnpublished) {
        $allocationIdentityConditions = [];
        if (in_array('student_id', $collegeAllocationColumns, true)) {
            $allocationIdentityConditions[] = 'pca.student_id = u.id';
        }
        if (in_array('admission_number', $collegeAllocationColumns, true)) {
            $allocationAdmission = studentPlacementTextExpression($studentDataColumns, 'sd', ['admission_number', 'id_number']);
            $allocationIdentityConditions[] = "TRIM(pca.admission_number) = TRIM({$allocationAdmission})";
        }
        if ($allocationIdentityConditions) {
            $firstSemesterAllocationCondition = ' AND NOT EXISTS (
                SELECT 1 FROM placement_college_allocations pca
                WHERE ' . implode(' OR ', $allocationIdentityConditions) . '
            )';
        }
    }
    $placementColumns = studentPlacementTableColumns($db, 'placement_results');
    $placementHas = static fn(string $column): bool => in_array($column, $placementColumns, true);
    if ($activeSemester === 2 && !$placementHas('placement_semester')) {
        throw new RuntimeException(
            'Semester-two placement requires the placement_semester column. Apply database/migrations/20261023_add_two_stage_department_placement.sql.',
            409
        );
    }
    if ($rerunUnpublished) {
        if (!$placementHas('placement_semester') && $activeSemester !== 1) {
            throw new RuntimeException(
                'Semester-two reruns require the placement_semester column. Apply database/migrations/20261023_add_two_stage_department_placement.sql.',
                409
            );
        }
        if (!$placementHas('is_published') && !$placementHas('status')) {
            throw new RuntimeException(
                'Safe reruns require a publication indicator. Apply database/migrations/20261021_add_placement_result_publish_flag.sql.',
                409
            );
        }

        if (!$forceRerun) {
            $publishedChecks = [];
            if ($placementHas('is_published')) {
                $publishedChecks[] = 'COALESCE(is_published, 0) = 1';
            }
            if ($placementHas('status')) {
                $publishedChecks[] = $placementHas('is_published')
                    ? "LOWER(TRIM(COALESCE(status, ''))) = 'published'"
                    : "LOWER(TRIM(COALESCE(status, ''))) IN ('approved', 'published')";
            }
            $publishedSemesterCondition = $placementHas('placement_semester')
                ? ' WHERE placement_semester = ?'
                : '';
            $publishedCheck = $db->prepare(
                'SELECT CASE WHEN (' . implode(' OR ', $publishedChecks) . ') THEN 1 ELSE 0 END AS is_published_result
                 FROM placement_results' . $publishedSemesterCondition . '
                 FOR UPDATE'
            );
            if (!$publishedCheck) {
                throw new Exception('Unable to verify the publication status before rerunning placement.');
            }
            if ($placementHas('placement_semester')) {
                $publishedCheck->bind_param('i', $activeSemester);
            }
            if (!$publishedCheck->execute()) {
                $publishedCheck->close();
                throw new Exception('Unable to verify the publication status before rerunning placement.');
            }
            $publishedRows = $publishedCheck->get_result();
            $hasPublishedResults = false;
            while ($publishedRow = $publishedRows->fetch_assoc()) {
                if ((int) ($publishedRow['is_published_result'] ?? 0) === 1) {
                    $hasPublishedResults = true;
                    break;
                }
            }
            $publishedCheck->close();
            if ($hasPublishedResults) {
                throw new RuntimeException('Placement results have already been published. Confirm a force rerun to replace them.', 409);
            }
        }

        if ($forceRerun) {
            $forceResetAssignments = [];
            if ($placementHas('is_published')) {
                $forceResetAssignments[] = 'is_published = 0';
            }
            if ($placementHas('status')) {
                $forceResetAssignments[] = "status = 'Pending'";
            }
            if (!$forceResetAssignments) {
                throw new RuntimeException('Published placement results cannot be safely reset with this database schema.', 409);
            }
            $forceSemesterCondition = $placementHas('placement_semester')
                ? " WHERE placement_semester = {$activeSemester}"
                : '';
            if (!$db->query(
                'UPDATE placement_results SET ' . implode(', ', $forceResetAssignments) . $forceSemesterCondition
            )) {
                throw new RuntimeException('Unable to reset published placement results: ' . $db->error);
            }
        }

        $profileIdentityConditions = [];
        foreach (['admission_number', 'id_number'] as $placementIdentity) {
            if (!$placementHas($placementIdentity)) {
                continue;
            }
            foreach (['admission_number', 'id_number'] as $profileIdentity) {
                if (in_array($profileIdentity, $studentDataColumns, true)) {
                    $profileIdentityConditions[] = "TRIM(sd.`{$profileIdentity}`) = TRIM(pr.`{$placementIdentity}`)";
                }
            }
        }
        if (!$profileIdentityConditions) {
            throw new Exception('Student profiles cannot be safely matched to placement results for reset.');
        }

        if (!in_array('placement_status', $studentDataColumns, true)) {
            throw new RuntimeException('The student_data.placement_status column is required to reset placement results.');
        }
        $profileStatus = $activeSemester === 2 ? 'Pending 2nd Semester' : 'Pending 1st Semester';
        $profileResetAssignments = ["sd.`placement_status` = '{$profileStatus}'"];
        $unpublishedResultConditions = [];
        if ($placementHas('placement_semester')) {
            $unpublishedResultConditions[] = 'pr.placement_semester = ' . $activeSemester;
        }
        if ($placementHas('is_published')) {
            $unpublishedResultConditions[] = 'COALESCE(pr.is_published, 0) = 0';
        }
        if ($placementHas('status')) {
            $unpublishedResultConditions[] = $placementHas('is_published')
                ? "LOWER(TRIM(COALESCE(pr.status, ''))) <> 'published'"
                : "LOWER(TRIM(COALESCE(pr.status, ''))) NOT IN ('approved', 'published')";
        }
        $profileResetSql = 'UPDATE student_data sd
            INNER JOIN placement_results pr ON (' . implode(' OR ', $profileIdentityConditions) . ')
            SET ' . implode(', ', $profileResetAssignments) . "
            WHERE " . implode(' AND ', $unpublishedResultConditions);
        if (!$db->query($profileResetSql)) {
            throw new Exception('Unable to reset unpublished student placement fields: ' . $db->error);
        }

        if ($activeSemester === 1) {
            $rerunProfileResetConditions = [];
            if (in_array('status', $studentDataColumns, true)) {
                $rerunProfileResetConditions[] = "LOWER(TRIM(COALESCE(sd.`status`, ''))) NOT IN ('inactive', 'disabled', 'excluded')";
            }
            $previousPlacementStatuses = [
                'assigned',
                'placed',
                'placed in semester 1',
                'allocated',
                'pending',
                'pending 1st semester',
                'pending 2nd semester',
                'not assigned',
                'unassigned',
                'eligible',
                'unplaced',
            ];
            $previousPlacementStatusList = "'" . implode("', '", $previousPlacementStatuses) . "'";
            $rerunProfileResetConditions[] = "LOWER(TRIM(COALESCE(sd.`placement_status`, ''))) IN ({$previousPlacementStatusList})";
            $rerunProfileResetAssignments = ["sd.`placement_status` = 'Pending 1st Semester'"];
            if (in_array('department', $studentDataColumns, true)) {
                $rerunProfileResetAssignments[] = "sd.`department` = 'Not assigned'";
            }
            $rerunProfileResetSql = 'UPDATE student_data sd SET '
                . implode(', ', $rerunProfileResetAssignments)
                . ' WHERE ' . implode(' AND ', $rerunProfileResetConditions);
            if (!$db->query($rerunProfileResetSql)) {
                throw new Exception('Unable to reset previous first-semester placement statuses: ' . $db->error);
            }
        }

        if (
            in_array('target_semester', $collegeAllocationColumns, true)
            && in_array('status', $collegeAllocationColumns, true)
        ) {
            $allocationProfileIdentityConditions = [];
            if (
                in_array('student_id', $collegeAllocationColumns, true)
                && in_array('user_id', $studentDataColumns, true)
            ) {
                $allocationProfileIdentityConditions[] = 'pca.student_id = sd.user_id';
            }
            if (in_array('admission_number', $collegeAllocationColumns, true)) {
                foreach (['admission_number', 'id_number'] as $profileIdentity) {
                    if (in_array($profileIdentity, $studentDataColumns, true)) {
                        $allocationProfileIdentityConditions[] = "TRIM(pca.admission_number) = TRIM(sd.`{$profileIdentity}`)";
                    }
                }
            }
            $allocationProfileResetAssignments = ["sd.`placement_status` = '{$profileStatus}'"];
            if ($allocationProfileIdentityConditions && $allocationProfileResetAssignments) {
                $allocationStatusCondition = $activeSemester === 1
                    ? " AND LOWER(TRIM(pca.status)) = 'pending'"
                    : '';
                $allocationProfileResetSql = 'UPDATE student_data sd
                    INNER JOIN placement_college_allocations pca
                        ON (' . implode(' OR ', $allocationProfileIdentityConditions) . ')
                    SET ' . implode(', ', $allocationProfileResetAssignments) . "
                    WHERE pca.target_semester = 2{$allocationStatusCondition}";
                if (!$db->query($allocationProfileResetSql)) {
                    throw new Exception('Unable to reset profiles for pending college allocations: ' . $db->error);
                }
            }

            if ($activeSemester === 2 && !$db->query(
                "UPDATE placement_college_allocations
                 SET status = 'pending'
                 WHERE target_semester = 2"
            )) {
                throw new Exception('Unable to restore pending second-semester allocations: ' . $db->error);
            }
        }

        $deleteResultConditions = [];
        if ($placementHas('placement_semester')) {
            $deleteResultConditions[] = "placement_semester = {$activeSemester}";
        }
        if ($placementHas('is_published')) {
            $deleteResultConditions[] = 'COALESCE(is_published, 0) = 0';
        }
        if ($placementHas('status')) {
            $deleteResultConditions[] = $placementHas('is_published')
                ? "LOWER(TRIM(COALESCE(status, ''))) <> 'published'"
                : "LOWER(TRIM(COALESCE(status, ''))) NOT IN ('approved', 'published')";
        }
        if (!$db->query(
            'DELETE FROM placement_results WHERE ' . implode(' AND ', $deleteResultConditions)
        )) {
            throw new Exception('Unable to clear unpublished placement results: ' . $db->error);
        }

        if (
            $activeSemester === 1
            && in_array('target_semester', $collegeAllocationColumns, true)
            && in_array('status', $collegeAllocationColumns, true)
        ) {
            if (!$db->query(
                "DELETE FROM placement_college_allocations
                 WHERE target_semester = 2 AND LOWER(TRIM(status)) = 'pending'"
            )) {
                throw new Exception('Unable to clear pending first-stage allocations: ' . $db->error);
            }
        }
    }
    $placementIdentifiers = array_values(array_filter(
        ['student_id', 'admission_number', 'id_number'],
        $placementHas
    ));
    $unassignedColumns = studentPlacementTableColumns($db, 'unassigned_students');
    $unassignedHas = static fn(string $column): bool => in_array($column, $unassignedColumns, true);

    $departmentRows = [];
    $departmentFilter = $departmentStatusColumn !== ''
        ? " WHERE LOWER(TRIM(COALESCE(`{$departmentStatusColumn}`, ''))) = 'active'"
        : '';
    $departmentSelectColumns = ['id', 'name', 'college_name', 'stream', 'capacity'];
    $departmentSelectColumns[] = in_array('college_id', $departmentColumns, true) ? 'college_id' : 'NULL AS college_id';
    $departmentSelectColumns[] = in_array('offered_semester', $departmentColumns, true)
        ? 'offered_semester'
        : '2 AS offered_semester';
    $departmentSelectColumns[] = in_array('is_first_semester_only', $departmentColumns, true)
        ? 'is_first_semester_only'
        : '0 AS is_first_semester_only';
    $deptRes = $db->query(
        'SELECT ' . implode(', ', $departmentSelectColumns)
        . " FROM departments{$departmentFilter} FOR UPDATE"
    );
    if (!$deptRes) {
        throw new Exception('Unable to load department capacities');
    }
    while ($row = $deptRes->fetch_assoc()) {
        $departmentRows[] = $row;
    }

    $selectedCollege = trim((string) ($input['selectedCollege'] ?? $college ?? ''));
    $selectedStream = trim((string) ($input['selectedStream'] ?? $stream ?? ''));
    if ($selectedStream !== '' && !empty($input['students']) && is_array($input['students'])) {
        foreach ($input['students'] as $student) {
            if (is_array($student) && ($student['stream'] ?? '') !== '') {
                $selectedStream = trim((string) ($student['stream'] ?? $selectedStream));
                break;
            }
        }
    }
    $scopedDepartments = array_values(array_filter($departmentRows, function ($department) use ($selectedCollege) {
        return $selectedCollege === '' || strtolower($selectedCollege) === 'all'
            || normalizeDepartmentName($department['college_name'] ?? '') === normalizeDepartmentName($selectedCollege);
    }));
    if (empty($scopedDepartments)) {
        throw new Exception('No active departments found for the selected college');
    }
    $departmentsWithCapacity = array_filter($scopedDepartments, function ($department) {
        return (int) ($department['capacity'] ?? 0) > 0;
    });
    if (empty($departmentsWithCapacity)) {
        throw new Exception('No active departments with capacity greater than zero were found for the selected college');
    }

    $departmentMap = [];
    foreach ($departmentRows as $department) {
        $key = normalizeDepartmentName($department['name'] ?? $department['department'] ?? $department['id'] ?? '');
        if ($key === '')
            continue;
        $departmentMap[$key] = [
            'id' => (int) ($department['id'] ?? 0),
            'name' => (string) ($department['name'] ?? $department['department'] ?? ''),
            'college_id' => (int) ($department['college_id'] ?? 0),
            'college_name' => (string) ($department['college_name'] ?? $department['college'] ?? $department['collegeName'] ?? ''),
            'stream' => (string) ($department['stream'] ?? ''),
            'capacity' => max(0, (int) ($department['capacity'] ?? 0)),
            'offered_semester' => (int) ($department['offered_semester'] ?? 1),
            'is_first_semester_only' => (int) ($department['is_first_semester_only'] ?? 0),
            'placement_group' => (string) ($department['placement_group'] ?? ''),
        ];
    }

    $userColumns = studentPlacementTableColumns($db, 'users');
    if (!$placementIdentifiers) {
        throw new Exception('Placement result table has no supported student identifier column');
    }
    if (!in_array('id', $userColumns, true)) {
        throw new Exception('Student accounts are missing the required account identifier column');
    }
    $choiceColumns = studentPlacementTableColumns($db, 'student_choices');
    $rerunAdmissionExpression = studentPlacementTextExpression($studentDataColumns, 'sd', ['admission_number', 'id_number']);
    if (in_array('id_number', $userColumns, true)) {
        $rerunAdmissionExpression = "COALESCE(NULLIF({$rerunAdmissionExpression}, ''), u.id_number, '')";
    }
    $studentEntries = $rerunUnpublished ? [] : ($input['students'] ?? []);
    if (!is_array($studentEntries) || empty($studentEntries)) {
        $rerunCandidateCondition = '';
        if ($rerunUnpublished) {
            $rerunConditions = [];
            if ($activeSemester === 2) {
                $rerunAllocationIdentities = [];
                if (in_array('student_id', $collegeAllocationColumns, true)) {
                    $rerunAllocationIdentities[] = 'pca.student_id = u.id';
                }
                if (in_array('admission_number', $collegeAllocationColumns, true)) {
                    $rerunAllocationIdentities[] = "TRIM(pca.admission_number) = TRIM({$rerunAdmissionExpression})";
                }
                if (
                    !$rerunAllocationIdentities
                    || !in_array('target_semester', $collegeAllocationColumns, true)
                    || !in_array('status', $collegeAllocationColumns, true)
                ) {
                    throw new Exception('Pending second-semester allocations cannot be matched for a full-batch rerun.');
                }
                $rerunConditions[] = "EXISTS (
                    SELECT 1 FROM placement_college_allocations pca
                    WHERE (" . implode(' OR ', $rerunAllocationIdentities) . ")
                      AND pca.target_semester = 2
                      AND LOWER(TRIM(pca.status)) = 'pending'
                )";

                $pendingSecondSemesterStatuses = [];
                foreach (['status', 'placement_status'] as $statusColumn) {
                    if (in_array($statusColumn, $studentDataColumns, true)) {
                        $pendingSecondSemesterStatuses[] = "LOWER(TRIM(COALESCE(sd.`{$statusColumn}`, ''))) = 'pending 2nd semester'";
                    }
                }
                if (!$pendingSecondSemesterStatuses) {
                    throw new Exception('Student profiles cannot be matched to the pending second-semester roster.');
                }
                $rerunConditions[] = '(' . implode(' OR ', $pendingSecondSemesterStatuses) . ')';
            }
            $rerunCandidateCondition = $rerunConditions
                ? ' AND ' . implode(' AND ', $rerunConditions)
                : '';
        }

        $profileAdmissionExpression = studentPlacementTextExpression(
            $studentDataColumns,
            'sd',
            ['admission_number', 'id_number']
        );
        $fallbackAdmission = $profileAdmissionExpression;
        if (in_array('id_number', $userColumns, true)) {
            $fallbackAdmission = "COALESCE(NULLIF({$fallbackAdmission}, ''), u.id_number, '')";
        }
        if ($rerunUnpublished) {
            $candidateUserJoinConditions = [];
            if (in_array('user_id', $studentDataColumns, true)) {
                $candidateUserJoinConditions[] = 'u.id = sd.user_id';
            }
            if (in_array('id_number', $userColumns, true) && $profileAdmissionExpression !== "''") {
                $candidateUserJoinConditions[] = "TRIM(u.id_number) = TRIM({$profileAdmissionExpression})";
            }
            $candidateUserJoin = $candidateUserJoinConditions
                ? 'LEFT JOIN users u ON (' . implode(' OR ', $candidateUserJoinConditions) . ") AND LOWER(TRIM(u.role)) = 'student'"
                : 'LEFT JOIN users u ON 1 = 0';
            $candidateSource = "FROM student_data sd {$candidateUserJoin}";
            $candidateIdExpression = "COALESCE(NULLIF(CAST(u.id AS CHAR), '0'), CONCAT('admission:', {$fallbackAdmission}))";
            $candidateRoleCondition = '';
            $candidateIdentityCondition = " AND (u.id IS NOT NULL OR NULLIF(TRIM({$profileAdmissionExpression}), '') IS NOT NULL)";
        } elseif (in_array('user_id', $studentDataColumns, true)) {
            $candidateSource = 'FROM users u INNER JOIN student_data sd ON sd.user_id = u.id';
            $candidateIdExpression = 'u.id';
            $candidateRoleCondition = " AND LOWER(TRIM(u.role)) = 'student'";
            $candidateIdentityCondition = '';
        } elseif (in_array('id_number', $studentDataColumns, true) && in_array('id_number', $userColumns, true)) {
            $candidateSource = 'FROM users u INNER JOIN student_data sd ON TRIM(sd.id_number) = TRIM(u.id_number)';
            $candidateIdExpression = 'u.id';
            $candidateRoleCondition = " AND LOWER(TRIM(u.role)) = 'student'";
            $candidateIdentityCondition = '';
        } elseif (in_array('admission_number', $studentDataColumns, true) && in_array('id_number', $userColumns, true)) {
            $candidateSource = 'FROM users u INNER JOIN student_data sd ON TRIM(sd.admission_number) = TRIM(u.id_number)';
            $candidateIdExpression = 'u.id';
            $candidateRoleCondition = " AND LOWER(TRIM(u.role)) = 'student'";
            $candidateIdentityCondition = '';
        } else {
            throw new Exception('Student profiles cannot be matched to student accounts');
        }
        $fallbackFirstName = studentPlacementTextExpression($studentDataColumns, 'sd', ['given_name', 'first_name']);
        $fallbackLastName = studentPlacementTextExpression($studentDataColumns, 'sd', ['father_name', 'last_name']);
        $fallbackName = "COALESCE(NULLIF(TRIM(CONCAT_WS(' ', {$fallbackFirstName}, {$fallbackLastName})), ''), 'Student')";
        $fallbackEmail = studentPlacementTextExpression($studentDataColumns, 'sd', ['email']);
        if (in_array('email', $userColumns, true)) {
            $fallbackEmail = "COALESCE(NULLIF({$fallbackEmail}, ''), u.email, '')";
        }
        $fallbackGender = studentPlacementTextExpression($studentDataColumns, 'sd', ['sex', 'gender']);
        $fallbackRegion = studentPlacementTextExpression($studentDataColumns, 'sd', ['region']);
        $fallbackStream = studentPlacementTextExpression($studentDataColumns, 'sd', ['field_of_study', 'stream']);
        $fallbackGpa = studentPlacementColumnExpression($studentDataColumns, 'sd', ['cgpa', 'gpa'], '0');
        $fallbackGrade12 = studentPlacementColumnExpression($studentDataColumns, 'sd', ['total_mark', 'grade_12_result'], '0');
        $fallbackCoc = studentPlacementColumnExpression($studentDataColumns, 'sd', ['coc_score', 'coc_result'], '0');
        $fallbackPlacementSemesterCondition = $placementHas('placement_semester')
            ? " AND pr.placement_semester = {$activeSemester}"
            : '';
        $fallbackPlacementIdentityConditions = [];
        foreach (['admission_number', 'id_number'] as $placementIdentity) {
            if ($placementHas($placementIdentity) && $fallbackAdmission !== "''") {
                $fallbackPlacementIdentityConditions[] = "TRIM(pr.`{$placementIdentity}`) = TRIM({$fallbackAdmission})";
            }
        }
        $fallbackPlacementNotExists = $fallbackPlacementIdentityConditions
            ? ' AND NOT EXISTS (
                    SELECT 1 FROM placement_results pr
                    WHERE (' . implode(' OR ', $fallbackPlacementIdentityConditions) . ')' . $fallbackPlacementSemesterCondition . '
                )'
            : '';
        $studentSql = "SELECT {$candidateIdExpression} AS id, {$fallbackAdmission} AS id_number, {$fallbackName} AS name,
                {$fallbackEmail} AS email, {$fallbackGender} AS gender, {$fallbackRegion} AS region, {$fallbackStream} AS stream,
                " . studentPlacementColumnExpression($studentDataColumns, 'sd', ['disability'], '0') . " AS disability,
                " . studentPlacementColumnExpression($studentDataColumns, 'sd', ['minority'], '0') . " AS minority,
                {$fallbackGpa} AS gpa, {$fallbackGrade12} AS grade12, {$fallbackCoc} AS coc,
                " . studentPlacementColumnExpression($studentDataColumns, 'sd', ['cumulative_score', 'cumulative_avg'], '0') . " AS cumulative_score
            {$candidateSource}
            WHERE 1 = 1{$candidateRoleCondition}{$candidateIdentityCondition}{$studentEligibilityCondition}{$firstSemesterAllocationCondition}{$rerunCandidateCondition}{$fallbackPlacementNotExists}
            ORDER BY {$candidateIdExpression} ASC";

        $studentRes = $db->query($studentSql);
        if (!$studentRes) {
            throw new Exception('Unable to load eligible placement students: ' . $db->error);
        }
        while ($row = $studentRes->fetch_assoc()) {
            $studentEntries[] = [
                'id' => $row['id'],
                'id_number' => $row['id_number'] ?? null,
                'name' => $row['name'] ?? '',
                'email' => $row['email'] ?? '',
                'gender' => $row['gender'] ?? '',
                'region' => $row['region'] ?? '',
                'stream' => $row['stream'] ?? '',
                'hasDisability' => $row['disability'] ?? false,
                'minority' => $row['minority'] ?? false,
                'cgpa' => $row['gpa'] ?? 0,
                'cumulative_score' => $row['cumulative_score'] ?? 0,
                'grade12' => $row['grade12'] ?? 0,
                'coc' => $row['coc'] ?? 0,
                'preferences' => [],
            ];
        }
        $studentRes->free();
    }

    $selectedStudentIds = $input['selectedStudentIds'] ?? [];
    if (!is_array($selectedStudentIds) || (empty($selectedStudentIds) && !$rerunUnpublished)) {
        throw new Exception('Select at least one candidate student before running placement');
    }
    if ($rerunUnpublished) {
        $selectedSet = array_map(
            static fn(array $student): string => (string) ($student['id'] ?? ''),
            $studentEntries
        );
    } else {
        $selectedSet = array_map('strval', $selectedStudentIds);
        $studentEntries = array_values(array_filter($studentEntries, function ($student) use ($selectedSet) {
            return in_array((string) ($student['id'] ?? ''), $selectedSet, true);
        }));
    }

    $studentValidationErrors = [];
    $studentEntries = array_values(array_filter($studentEntries, static function ($student) use (&$studentValidationErrors): bool {
        $studentIdentifier = trim((string) ($student['id'] ?? $student['student_id'] ?? ''));
        $admissionIdentifier = trim((string) ($student['admission_number'] ?? $student['id_number'] ?? ''));
        if ($studentIdentifier === '' && $admissionIdentifier === '') {
            $studentValidationErrors[] = [
                'student_id' => null,
                'admission_number' => null,
                'missing_fields' => ['student_id', 'admission_number'],
                'message' => 'Candidate record has no account identifier or admission number.',
            ];
            return false;
        }
        return true;
    }));
    if (empty($studentEntries)) {
        throw new RuntimeException('No valid student identifiers were provided for placement.', 422);
    }

    $allStudents = [];
    $mosheColumns = studentPlacementTableColumns($db, 'moshe_students');
    $simsColumns = studentPlacementTableColumns($db, 'sims_students');
    $studentDataIdentityColumn = in_array('user_id', $studentDataColumns, true)
        ? 'user_id'
        : (in_array('admission_number', $studentDataColumns, true)
            ? 'admission_number'
            : (in_array('id_number', $studentDataColumns, true) ? 'id_number' : ''));
    if ($studentDataIdentityColumn === '') {
        throw new Exception('Student profiles cannot be updated because they have no supported identifier');
    }
    $cumulativeScoreColumn = in_array('cumulative_score', $studentDataColumns, true)
        ? 'cumulative_score'
        : (in_array('cumulative_avg', $studentDataColumns, true) ? 'cumulative_avg' : '');
    $scoreIdentityColumn = in_array('admission_number', $studentDataColumns, true)
        ? 'admission_number'
        : (in_array('id_number', $studentDataColumns, true)
            ? 'id_number'
            : $studentDataIdentityColumn);
    $persistCumulativeScore = null;
    if ($cumulativeScoreColumn !== '') {
        $persistCumulativeScore = $db->prepare(
            "UPDATE student_data SET `{$cumulativeScoreColumn}` = ? WHERE `{$scoreIdentityColumn}` = ?"
        );
        if (!$persistCumulativeScore) {
            throw new RuntimeException('Unable to prepare placement score persistence: ' . $db->error);
        }
    }
    $updateStudentPlacementFields = static function (string $status, string $department, string $identityColumn, $identityValue, string $identityType) use ($db, $studentDataColumns, $studentStatusColumn): void {
        $assignments = [];
        $values = [];
        $types = '';
        if ($studentStatusColumn !== '') {
            $assignments[] = "`{$studentStatusColumn}` = ?";
            $values[] = $status;
            $types .= 's';
        }
        if (in_array('department', $studentDataColumns, true)) {
            $assignments[] = '`department` = ?';
            $values[] = $department;
            $types .= 's';
        }
        if (in_array('is_choice_editable', $studentDataColumns, true)) {
            $assignments[] = '`is_choice_editable` = 0';
        }
        foreach (['is_locked', 'is_placement_locked'] as $lockColumn) {
            if (in_array($lockColumn, $studentDataColumns, true)) {
                $assignments[] = "`{$lockColumn}` = 1";
            }
        }
        if (!$assignments) {
            return;
        }

        $statement = $db->prepare(
            'UPDATE student_data SET ' . implode(', ', $assignments) . " WHERE `{$identityColumn}` = ?"
        );
        if (!$statement) {
            throw new Exception('Unable to prepare student placement status update');
        }
        $values[] = $identityValue;
        $types .= $identityType;
        $arguments = [$types];
        foreach ($values as $index => $value) {
            $arguments[] = &$values[$index];
        }
        if (!call_user_func_array([$statement, 'bind_param'], $arguments) || !$statement->execute()) {
            $statement->close();
            throw new Exception('Unable to update student placement status');
        }
        $statement->close();
    };
    $profileAdmissionForJoin = studentPlacementTextExpression($studentDataColumns, 'sd', ['admission_number', 'id_number']);
    $userJoinConditions = [];
    if (in_array('user_id', $studentDataColumns, true) && in_array('id', $userColumns, true)) {
        $userJoinConditions[] = 'u.id = sd.user_id';
    }
    if (in_array('id_number', $userColumns, true) && $profileAdmissionForJoin !== "''") {
        $userJoinConditions[] = "TRIM(u.id_number) = TRIM({$profileAdmissionForJoin})";
    }
    $profileJoin = $userJoinConditions
        ? 'LEFT JOIN users u ON (' . implode(' OR ', $userJoinConditions) . ") AND LOWER(TRIM(u.role)) = 'student'"
        : 'LEFT JOIN users u ON 1 = 0';

    foreach ($studentEntries as $student) {
        $requestedId = trim((string) ($student['id'] ?? $student['student_id'] ?? ''));
        $requestedAdmission = trim((string) ($student['admission_number'] ?? $student['id_number'] ?? ''));
        if ($requestedAdmission === '' && $requestedId !== '' && !ctype_digit($requestedId)) {
            $requestedAdmission = $requestedId;
        }
        if ($requestedId === '' && $requestedAdmission === '') {
            continue;
        }

        $admissionExpression = studentPlacementTextExpression($studentDataColumns, 'sd', ['admission_number', 'id_number']);
        if (in_array('id_number', $userColumns, true)) {
            $admissionExpression = "COALESCE(NULLIF({$admissionExpression}, ''), NULLIF(u.id_number, ''), '')";
        }
        $mosheJoin = in_array('admission_number', $mosheColumns, true)
            ? " LEFT JOIN moshe_students m ON TRIM(m.admission_number) = TRIM({$admissionExpression})"
            : '';
        if ($mosheJoin !== '') {
            $admissionExpression = "COALESCE(NULLIF({$admissionExpression}, ''), m.admission_number, '')";
        }
        $simsJoin = in_array('student_id', $simsColumns, true)
            ? " LEFT JOIN sims_students s ON TRIM(s.student_id) = TRIM({$admissionExpression})"
            : '';
        $firstName = studentPlacementTextExpression($studentDataColumns, 'sd', ['given_name', 'first_name']);
        $fatherName = studentPlacementTextExpression($studentDataColumns, 'sd', ['father_name', 'last_name']);
        if ($mosheJoin !== '') {
            $firstName = studentPlacementTextExpression($mosheColumns, 'm', ['given_name'], $firstName);
            $fatherName = studentPlacementTextExpression($mosheColumns, 'm', ['father_name'], $fatherName);
        }
        if (in_array('first_name', $userColumns, true)) {
            $firstName = "COALESCE(NULLIF({$firstName}, ''), u.first_name, '')";
        }
        if (in_array('last_name', $userColumns, true)) {
            $fatherName = "COALESCE(NULLIF({$fatherName}, ''), u.last_name, '')";
        }
        $grandfatherName = $mosheJoin !== ''
            ? studentPlacementTextExpression($mosheColumns, 'm', ['grand_father_name'], studentPlacementTextExpression($studentDataColumns, 'sd', ['grandfather_name']))
            : studentPlacementTextExpression($studentDataColumns, 'sd', ['grandfather_name']);
        $region = studentPlacementTextExpression($studentDataColumns, 'sd', ['region']);
        $gender = studentPlacementTextExpression($studentDataColumns, 'sd', ['sex', 'gender']);
        $benefitGroup = studentPlacementTextExpression($studentDataColumns, 'sd', ['benefit_group', 'minority'], "'None'");
        $disability = studentPlacementTextExpression($studentDataColumns, 'sd', ['disability'], "'No'");
        $minority = studentPlacementTextExpression($studentDataColumns, 'sd', ['minority'], "'No'");
        $nonZeroColumnExpression = static function (array $columns, string $alias, array $candidates): string {
            $expressions = [];
            foreach ($candidates as $column) {
                if (in_array($column, $columns, true)) {
                    $expressions[] = "NULLIF(`{$alias}`.`{$column}`, 0)";
                }
            }
            return $expressions ? 'COALESCE(' . implode(', ', $expressions) . ')' : 'NULL';
        };
        $profileGrade12 = $nonZeroColumnExpression($studentDataColumns, 'sd', ['total_mark', 'grade_12_result']);
        $profileCgpa = $nonZeroColumnExpression($studentDataColumns, 'sd', ['cgpa', 'gpa']);
        $grade12 = "COALESCE(NULLIF({$profileGrade12}, 0), 0)";
        $cgpa = "COALESCE(NULLIF({$profileCgpa}, 0), 0)";
        $coc = studentPlacementColumnExpression($studentDataColumns, 'sd', ['coc_score', 'coc_result'], '0');
        $stream = studentPlacementTextExpression($studentDataColumns, 'sd', ['field_of_study', 'stream']);
        if ($mosheJoin !== '') {
            $stream = studentPlacementTextExpression(
                $studentDataColumns,
                'sd',
                ['field_of_study', 'stream'],
                studentPlacementTextExpression($mosheColumns, 'm', ['field_of_study'])
            );
        }
        if ($simsJoin !== '') {
            $simsCgpa = $nonZeroColumnExpression($simsColumns, 's', ['cgpa']);
            $cgpa = "COALESCE(NULLIF({$profileCgpa}, 0), NULLIF({$simsCgpa}, 0), 0)";
            $coc = studentPlacementColumnExpression($simsColumns, 's', ['coc_score'], $coc);
        }
        if ($mosheJoin !== '') {
            $region = studentPlacementTextExpression($mosheColumns, 'm', ['region'], $region);
            $gender = studentPlacementTextExpression($mosheColumns, 'm', ['sex'], $gender);
            $benefitGroup = studentPlacementTextExpression($mosheColumns, 'm', ['benefit_group'], $benefitGroup);
            $mosheGrade12 = $nonZeroColumnExpression($mosheColumns, 'm', ['total_mark']);
            $grade12 = "COALESCE(NULLIF({$profileGrade12}, 0), NULLIF({$mosheGrade12}, 0), 0)";
        }
        $cumulativeScore = $nonZeroColumnExpression($studentDataColumns, 'sd', ['cumulative_score', 'cumulative_avg']);
        $email = studentPlacementTextExpression($studentDataColumns, 'sd', ['email']);
        if (in_array('email', $userColumns, true)) {
            $email = "COALESCE(NULLIF({$email}, ''), u.email, '')";
        }
        $choiceEligibilityIdentities = [];
        if (in_array('student_id', $choiceColumns, true)) {
            $choiceEligibilityIdentities[] = "CAST(sc_eligible.student_id AS CHAR) = CAST(u.id AS CHAR)";
            $choiceEligibilityIdentities[] = "TRIM(CAST(sc_eligible.student_id AS CHAR)) = TRIM({$admissionExpression})";
        }
        if (in_array('user_id', $choiceColumns, true)) {
            $choiceEligibilityIdentities[] = "sc_eligible.user_id = u.id";
        }
        if (in_array('admission_number', $choiceColumns, true)) {
            $choiceEligibilityIdentities[] = "TRIM(sc_eligible.admission_number) = TRIM({$admissionExpression})";
        }
        $activeChoiceConditions = [];
        if (in_array('semester', $choiceColumns, true)) {
            $activeChoiceConditions[] = "sc_eligible.semester = {$activeSemester}";
        } elseif ($activeSemester === 2) {
            $activeChoiceConditions[] = '1 = 0';
        }
        $eligibleChoiceDepartmentColumn = in_array('dept_id', $choiceColumns, true)
            ? 'dept_id'
            : (in_array('department_id', $choiceColumns, true) ? 'department_id' : '');
        $eligibleChoiceName = studentPlacementTextExpression(
            $choiceColumns,
            'sc_eligible',
            ['dept_name', 'department_name']
        );
        $eligibleChoicePriority = studentPlacementColumnExpression(
            $choiceColumns,
            'sc_eligible',
            ['priority'],
            '99'
        );
        $eligibleChoiceJoin = '';
        if ($eligibleChoiceDepartmentColumn !== '' && in_array('id', $departmentColumns, true)) {
            $eligibleChoiceJoin = " LEFT JOIN departments d_eligible ON d_eligible.id = sc_eligible.`{$eligibleChoiceDepartmentColumn}`";
            if (in_array('name', $departmentColumns, true)) {
                $eligibleChoiceName = "COALESCE(NULLIF(d_eligible.name, ''), {$eligibleChoiceName})";
            }
            if (in_array('offered_semester', $departmentColumns, true)) {
                if ($activeSemester === 2) {
                    $firstSemesterOnlyCondition = in_array('is_first_semester_only', $departmentColumns, true)
                        ? "LOWER(TRIM(COALESCE(CAST(d_eligible.is_first_semester_only AS CHAR), '0'))) NOT IN ('1', 'true', 'yes', 'on')"
                        : '1 = 1';
                    $activeChoiceConditions[] = "(d_eligible.offered_semester = 2 OR "
                        . "(d_eligible.offered_semester = 1 AND {$firstSemesterOnlyCondition}))";
                } else {
                    $activeChoiceConditions[] = 'd_eligible.offered_semester IN (1, 2)';
                }
            }
            $departmentActiveColumn = in_array('status', $departmentColumns, true)
                ? 'status'
                : (in_array('is_active', $departmentColumns, true) ? 'is_active' : '');
            if ($departmentActiveColumn === 'status') {
                $activeChoiceConditions[] = "LOWER(TRIM(COALESCE(d_eligible.status, ''))) = 'active'";
            } elseif ($departmentActiveColumn === 'is_active') {
                $activeChoiceConditions[] = 'd_eligible.is_active = 1';
            }
        }
        $activeChoiceConditions[] = "NULLIF(TRIM(COALESCE({$eligibleChoiceName}, '')), '') IS NOT NULL";
        $activeChoiceConditions[] = "CAST(COALESCE({$eligibleChoicePriority}, 99) AS UNSIGNED) >= 1";
        $activeChoicesExist = $choiceEligibilityIdentities
            ? 'EXISTS (SELECT 1 FROM student_choices sc_eligible' . $eligibleChoiceJoin
                . ' WHERE (' . implode(' OR ', $choiceEligibilityIdentities) . ') AND '
                . implode(' AND ', $activeChoiceConditions) . ')'
            : '1 = 0';
        $eligibleProfileCondition = '1 = 1' . $studentEligibilityCondition;
        if (!$rerunUnpublished && $firstSemesterAllocationCondition !== '') {
            $eligibleProfileCondition .= $firstSemesterAllocationCondition;
        }
        $activeProfileCondition = in_array('status', $studentDataColumns, true)
            ? "LOWER(TRIM(COALESCE(sd.status, ''))) NOT IN ('inactive', 'disabled')"
            : '1 = 1';
        $activeChoiceEligibilityCondition = "({$activeProfileCondition} AND {$activeChoicesExist})";
        if (!$rerunUnpublished && $firstSemesterAllocationCondition !== '') {
            $activeChoiceEligibilityCondition .= $firstSemesterAllocationCondition;
        }
        $officialStudentEligibilityCondition = "(($eligibleProfileCondition) OR $activeChoiceEligibilityCondition)";
        if ($activeSemester === 2) {
            $secondSemesterStatusCondition = $placementEligibilityColumn !== ''
                ? "LOWER(TRIM(COALESCE(sd.`{$placementEligibilityColumn}`, ''))) = 'pending 2nd semester'"
                : '1 = 0';
            $officialStudentEligibilityCondition = "({$activeProfileCondition} AND "
                . "{$secondSemesterStatusCondition} AND {$activeChoicesExist})";
        }
        $officialStudentQuery = $db->prepare(
            "SELECT u.id AS account_id, {$admissionExpression} AS admission_number,
                    {$firstName} AS given_name, {$fatherName} AS father_name,
                    {$grandfatherName} AS grand_father_name, {$region} AS region,
                    {$gender} AS sex, {$disability} AS disability, {$minority} AS minority,
                    {$grade12} AS total_mark, {$benefitGroup} AS benefit_group, {$cgpa} AS cgpa,
                    {$coc} AS coc_score, {$stream} AS stream, {$email} AS email,
                    {$cumulativeScore} AS cumulative_score
             FROM student_data sd
             {$profileJoin}
             {$mosheJoin}{$simsJoin}
             WHERE ((u.id = ? AND ? <> '') OR TRIM({$admissionExpression}) = TRIM(?))
               AND {$officialStudentEligibilityCondition}
             LIMIT 1"
        );
        if (!$officialStudentQuery) {
            throw new Exception('Unable to prepare authoritative student lookup');
        }
        $requestedAccountId = ctype_digit($requestedId) ? $requestedId : '';
        $officialStudentQuery->bind_param('sss', $requestedAccountId, $requestedAccountId, $requestedAdmission);
        if (!$officialStudentQuery->execute()) {
            $officialStudentQuery->close();
            throw new Exception('Unable to load authoritative student data');
        }
        $officialStudent = $officialStudentQuery->get_result()->fetch_assoc();
        $officialStudentQuery->close();
        if (!$officialStudent) {
            $studentValidationErrors[] = [
                'student_id' => $requestedId,
                'admission_number' => $requestedAdmission,
                'missing_fields' => ['eligible student_data profile or active-semester student_choices'],
                'message' => 'Student is not eligible for the active semester and has no qualifying choices.',
            ];
            continue;
        }
        $benefitGroup = strtolower(trim((string) $officialStudent['benefit_group']));
        $developingRegion = isDevelopingRegion($officialStudent['region'])
            || isDevelopingRegion($benefitGroup)
            || isDevelopingRegion($officialStudent['minority'])
            || (bool) preg_match('/developing|emerging/', $benefitGroup);
        $hasDisability = normalizeYesNo($officialStudent['disability'])
            || (bool) preg_match('/disability|disabled/', $benefitGroup);
        $student['id'] = !empty($officialStudent['account_id']) ? (int) $officialStudent['account_id'] : null;
        $student['admission_number'] = (string) ($officialStudent['admission_number'] ?? $requestedAdmission);
        $student['id_number'] = $student['admission_number'];
        $student['name'] = trim(
            $officialStudent['given_name'] . ' ' . $officialStudent['father_name'] . ' ' . $officialStudent['grand_father_name']
        );
        $student['email'] = $officialStudent['email'];
        $student['gender'] = $officialStudent['sex'];
        $student['cgpa'] = (float) $officialStudent['cgpa'];
        $student['gpa'] = (float) $officialStudent['cgpa'];
        $student['cumulative_score'] = (float) ($officialStudent['cumulative_score'] ?? 0);
        if ($student['cgpa'] > 0 && $student['cgpa'] < $rules['minGpa']) {
            $studentValidationErrors[] = [
                'student_id' => $requestedId,
                'admission_number' => $requestedAdmission,
                'missing_fields' => [],
                'message' => 'Student CGPA is below the minimum placement requirement.',
            ];
            continue;
        }
        $student['grade12'] = (float) $officialStudent['total_mark'];
        $student['coc'] = (float) $officialStudent['coc_score'];
        $officialStream = trim((string) $officialStudent['stream']);
        $student['stream'] = $officialStream !== ''
            ? $officialStream
            : trim((string) ($student['stream'] ?? ''));
        $student['hasDisability'] = $hasDisability;
        $student['disability'] = $student['hasDisability'];
        $student['developingRegion'] = $developingRegion;
        $student['minority'] = $developingRegion;

        if (
            $student['cgpa'] <= 0
            && $student['grade12'] <= 0
            && $student['coc'] <= 0
            && $student['cumulative_score'] <= 0
        ) {
            $studentValidationErrors[] = [
                'student_id' => $requestedId,
                'admission_number' => $requestedAdmission,
                'missing_fields' => [
                    'student_data.cgpa',
                    'student_data.total_mark',
                    'student_data.coc_score',
                    'student_data.cumulative_score',
                ],
                'message' => 'Student has no usable CGPA, total mark, COC score, or cumulative score for placement.',
            ];
            continue;
        }

        $preferences = [];
        $firstSemesterPreferences = [];
        $studentIdentifier = $student['id'] === null ? '' : (string) $student['id'];
        $admissionIdentifier = (string) $officialStudent['admission_number'];
        $choiceIdentityConditions = [];
        if (in_array('student_id', $choiceColumns, true)) {
            if ($studentIdentifier !== '') {
                $choiceIdentityConditions[] = 'sc.student_id = ?';
            }
            if ($admissionIdentifier !== '') {
                $choiceIdentityConditions[] = 'TRIM(sc.student_id) = TRIM(?)';
            }
        }
        if (in_array('user_id', $choiceColumns, true) && $studentIdentifier !== '') {
            $choiceIdentityConditions[] = 'sc.user_id = ?';
        }
        if (in_array('admission_number', $choiceColumns, true) && $admissionIdentifier !== '') {
            $choiceIdentityConditions[] = 'TRIM(sc.admission_number) = TRIM(?)';
        }
        if (!$choiceIdentityConditions && !empty($student['preferences'])) {
            $preferences = $student['preferences'];
        }
        $choiceDepartmentIdColumn = in_array('dept_id', $choiceColumns, true)
            ? 'dept_id'
            : (in_array('department_id', $choiceColumns, true) ? 'department_id' : '');
        $choiceName = studentPlacementTextExpression($choiceColumns, 'sc', ['dept_name', 'department_name']);
        $choiceCollege = studentPlacementTextExpression($choiceColumns, 'sc', ['college_name']);
        $choiceStream = studentPlacementTextExpression($choiceColumns, 'sc', ['stream']);
        $choicePriority = studentPlacementColumnExpression($choiceColumns, 'sc', ['priority'], '99');
        $choiceDepartmentJoin = '';
        if ($choiceDepartmentIdColumn !== '' && in_array('id', $departmentColumns, true)) {
            $choiceDepartmentJoin = " LEFT JOIN departments d ON d.id = sc.`{$choiceDepartmentIdColumn}`";
        }
        $choiceDepartmentId = $choiceDepartmentIdColumn !== ''
            ? "sc.`{$choiceDepartmentIdColumn}`"
            : 'NULL';
        $choiceOfferedSemester = $choiceDepartmentJoin !== '' && in_array('offered_semester', $departmentColumns, true)
            ? 'd.offered_semester'
            : 'NULL';
        $choiceFirstSemesterOnly = $choiceDepartmentJoin !== '' && in_array('is_first_semester_only', $departmentColumns, true)
            ? 'd.is_first_semester_only'
            : 'NULL';
        $choiceCollegeId = $choiceDepartmentJoin !== '' && in_array('college_id', $departmentColumns, true)
            ? 'd.college_id'
            : 'NULL';
        if ($choiceDepartmentJoin !== '' && in_array('name', $departmentColumns, true)) {
            $choiceName = "COALESCE(NULLIF(d.name, ''), {$choiceName})";
        }
        if ($choiceDepartmentJoin !== '' && in_array('college_name', $departmentColumns, true)) {
            $choiceCollege = "COALESCE(NULLIF(d.college_name, ''), {$choiceCollege}, '')";
        }
        if ($choiceDepartmentJoin !== '' && in_array('stream', $departmentColumns, true)) {
            $choiceStream = "COALESCE(NULLIF(d.stream, ''), {$choiceStream}, '')";
        }
        if ($choiceIdentityConditions) {
            $choiceSemesterFilter = in_array('semester', $choiceColumns, true)
                ? " AND sc.semester = {$activeSemester}"
                : '';
            $choiceSql = $db->prepare(
                "SELECT {$choiceDepartmentId} AS dept_id, {$choiceName} AS dept_name,
                        {$choiceCollege} AS college_name, {$choiceStream} AS stream,
                        {$choiceOfferedSemester} AS offered_semester,
                        {$choiceFirstSemesterOnly} AS is_first_semester_only,
                        {$choiceCollegeId} AS college_id, {$choicePriority} AS priority
                 FROM student_choices sc{$choiceDepartmentJoin}
                 WHERE (" . implode(' OR ', $choiceIdentityConditions) . "){$choiceSemesterFilter}
                 ORDER BY {$choicePriority} ASC, dept_id ASC"
            );
            if (!$choiceSql) {
                throw new Exception('Unable to prepare student preference lookup');
            }
            $choiceValues = [];
            foreach ($choiceIdentityConditions as $condition) {
                $choiceValues[] = strpos($condition, 'user_id') !== false
                    || strpos($condition, 'student_id') !== false && strpos($condition, 'TRIM') === false
                    ? $studentIdentifier
                    : $admissionIdentifier;
            }
            $choiceTypes = str_repeat('s', count($choiceValues));
            $choiceBindArguments = [$choiceTypes];
            foreach ($choiceValues as $index => $choiceValue) {
                $choiceBindArguments[] = &$choiceValues[$index];
            }
            if (!call_user_func_array([$choiceSql, 'bind_param'], $choiceBindArguments)) {
                $choiceSql->close();
                throw new Exception('Unable to bind student preference lookup');
            }
            if (!$choiceSql->execute()) {
                $choiceSql->close();
                throw new Exception('Unable to load student preferences');
            }
            $choiceRows = $choiceSql->get_result();
            while ($row = $choiceRows->fetch_assoc()) {
                $preferences[] = [
                    'dept_id' => $row['dept_id'] ?? null,
                    'dept_name' => $row['dept_name'] ?? '',
                    'department' => $row['dept_name'] ?? '',
                    'college_name' => $row['college_name'] ?? '',
                    'stream' => $row['stream'] ?? '',
                    'offered_semester' => $row['offered_semester'] ?? null,
                    'is_first_semester_only' => $row['is_first_semester_only'] ?? null,
                    'college_id' => $row['college_id'] ?? null,
                    'priority' => $row['priority'] ?? 99,
                ];
            }
            $choiceSql->close();
        }
        if (
            $activeSemester === 2
            && in_array('semester', $choiceColumns, true)
            && $choiceIdentityConditions
        ) {
            $firstSemesterChoiceSql = $db->prepare(
                "SELECT {$choiceDepartmentId} AS dept_id, {$choiceName} AS dept_name,
                        {$choiceCollege} AS college_name, {$choiceStream} AS stream,
                        {$choiceOfferedSemester} AS offered_semester,
                        {$choiceFirstSemesterOnly} AS is_first_semester_only,
                        {$choiceCollegeId} AS college_id, {$choicePriority} AS priority
                 FROM student_choices sc{$choiceDepartmentJoin}
                 WHERE (" . implode(' OR ', $choiceIdentityConditions) . ")
                   AND sc.semester = 1
                 ORDER BY {$choicePriority} ASC"
            );
            if (!$firstSemesterChoiceSql) {
                throw new Exception('Unable to prepare first-semester preference lookup');
            }
            $firstSemesterChoiceValues = [];
            foreach ($choiceIdentityConditions as $condition) {
                $firstSemesterChoiceValues[] = strpos($condition, 'user_id') !== false
                    || strpos($condition, 'student_id') !== false && strpos($condition, 'TRIM') === false
                    ? $studentIdentifier
                    : $admissionIdentifier;
            }
            $firstSemesterChoiceTypes = str_repeat('s', count($firstSemesterChoiceValues));
            $firstSemesterChoiceArguments = [$firstSemesterChoiceTypes];
            foreach ($firstSemesterChoiceValues as $index => $choiceValue) {
                $firstSemesterChoiceArguments[] = &$firstSemesterChoiceValues[$index];
            }
            if (!call_user_func_array([$firstSemesterChoiceSql, 'bind_param'], $firstSemesterChoiceArguments)) {
                $firstSemesterChoiceSql->close();
                throw new Exception('Unable to bind first-semester preference lookup');
            }
            if (!$firstSemesterChoiceSql->execute()) {
                $firstSemesterChoiceSql->close();
                throw new Exception('Unable to load first-semester preferences');
            }
            $firstSemesterChoiceRows = $firstSemesterChoiceSql->get_result();
            while ($row = $firstSemesterChoiceRows->fetch_assoc()) {
                $firstSemesterPreferences[] = [
                    'dept_id' => (int) ($row['dept_id'] ?? 0),
                    'department' => trim((string) ($row['dept_name'] ?? '')),
                    'priority' => (int) ($row['priority'] ?? 99),
                    'college_name' => trim((string) ($row['college_name'] ?? '')),
                    'stream' => trim((string) ($row['stream'] ?? '')),
                    'offered_semester' => isset($row['offered_semester'])
                        ? (int) $row['offered_semester']
                        : null,
                    'is_first_semester_only' => $row['is_first_semester_only'] ?? null,
                    'college_id' => (int) ($row['college_id'] ?? 0),
                ];
            }
            $firstSemesterChoiceSql->close();
        }
        if (empty($preferences)) {
            $preferences = $student['preferences'] ?? $student['choices'] ?? [];
        }

        $normalizedPreferences = [];
        foreach ($preferences as $idx => $preference) {
            $name = trim((string) ($preference['department'] ?? $preference['name'] ?? $preference['dept_name'] ?? $preference['department_name'] ?? ''));
            if ($name === '' && (int) ($preference['dept_id'] ?? 0) <= 0) {
                $name = trim((string) ($preference['college_name'] ?? $preference['collegeName'] ?? $preference['college'] ?? ''));
            }
            if ($name === '') {
                $name = trim((string) ($preference['dept_id'] ?? ''));
            }
            if ($name === '') {
                continue;
            }
            $normalizedPreferences[] = [
                'dept_id' => (int) ($preference['dept_id'] ?? 0),
                'department' => $name,
                'priority' => (int) ($preference['priority'] ?? $preference['rank'] ?? $idx + 1),
                'college_name' => trim((string) ($preference['college_name'] ?? $preference['collegeName'] ?? $preference['college'] ?? '')),
                'stream' => trim((string) ($preference['stream'] ?? '')),
                'offered_semester' => isset($preference['offered_semester'])
                    ? (int) $preference['offered_semester']
                    : null,
                'is_first_semester_only' => $preference['is_first_semester_only'] ?? null,
                'college_id' => (int) ($preference['college_id'] ?? 0),
                'is_broad_choice' => (int) ($preference['dept_id'] ?? 0) <= 0
                    && placementBroadChoiceGroup(['department' => $name]) !== '',
                'is_fallback' => false,
            ];
        }

        usort($normalizedPreferences, function ($a, $b) {
            return ($a['priority'] ?? 99) <=> ($b['priority'] ?? 99);
        });
        if (trim((string) $student['stream']) === '') {
            foreach ($normalizedPreferences as $preference) {
                $preferenceStream = trim((string) ($preference['stream'] ?? ''));
                if ($preferenceStream !== '') {
                    $student['stream'] = $preferenceStream;
                    break;
                }
            }
        }
        if (trim((string) $student['stream']) === '') {
            $studentValidationErrors[] = [
                'student_id' => $requestedId,
                'admission_number' => $requestedAdmission,
                'missing_fields' => ['student_data.field_of_study', 'student_data.stream', 'student_choices.stream'],
                'message' => 'Student has no stream value available for placement.',
            ];
            continue;
        }
        $normalizedPreferences = placementExpandCollegePreferences(
            $normalizedPreferences,
            array_values($departmentMap),
            (string) $student['stream'],
            $activeSemester
        );
        usort($normalizedPreferences, static function (array $left, array $right): int {
            $priorityOrder = (int) ($left['priority'] ?? 99) <=> (int) ($right['priority'] ?? 99);
            if ($priorityOrder !== 0) {
                return $priorityOrder;
            }
            return (int) ($left['dept_id'] ?? 0) <=> (int) ($right['dept_id'] ?? 0);
        });

        $collegeAllocation = null;
        if ($activeSemester === 2) {
            $allocationQuery = $db->prepare(
                "SELECT college_id, college_name, stream, placement_group
                 FROM placement_college_allocations
                 WHERE ((student_id = ? AND ? > 0) OR TRIM(admission_number) = TRIM(?))
                   AND target_semester = 2 AND status = 'pending'
                 LIMIT 1 FOR UPDATE"
            );
            if (!$allocationQuery) {
                throw new Exception('Unable to prepare the allocated-college lookup');
            }
            $allocationStudentId = $student['id'] === null ? 0 : (int) $student['id'];
            $allocationQuery->bind_param('iis', $allocationStudentId, $allocationStudentId, $admissionIdentifier);
            if (!$allocationQuery->execute()) {
                $allocationQuery->close();
                throw new Exception('Unable to load the allocated college for semester-two placement');
            }
            $collegeAllocation = $allocationQuery->get_result()->fetch_assoc() ?: null;
            $allocationQuery->close();
            if (!$collegeAllocation) {
                throw new Exception('Every semester-two candidate must have a pending college allocation');
            }
            $normalizedPreferences = array_values(array_filter(
                $normalizedPreferences,
                static function (array $preference) use ($departmentMap, $collegeAllocation, $activeSemester): bool {
                    $department = $departmentMap[normalizeDepartmentName($preference['department'])] ?? null;
                    if (!$department || !placementDepartmentOfferedInSemester($department, $activeSemester)) {
                        return false;
                    }
                    return placementDepartmentMatchesAllocation($department, $collegeAllocation);
                }
            ));
            // Automatic department assignment is disabled. Only explicit student choices may place a student;
            // any unmatched or exhausted preference list must remain unassigned or pending.
            $fallbackPreferences = [];
            $normalizedPreferences = array_values($normalizedPreferences);
        }
        $meritScore = computeMeritScore($student, $rules);
        $cumulativeScore = $meritScore;
        if ($persistCumulativeScore instanceof mysqli_stmt) {
            $scoreIdentityValue = $scoreIdentityColumn === 'user_id'
                ? (int) ($student['id'] ?? 0)
                : ($scoreIdentityColumn === 'id_number'
                    ? trim((string) ($student['id_number'] ?? $admissionIdentifier))
                    : $admissionIdentifier);
            $scoreIdentityType = $scoreIdentityColumn === 'user_id' ? 'i' : 's';
            if ($scoreIdentityValue !== '' && $scoreIdentityValue !== 0) {
                $persistCumulativeScore->bind_param($scoreIdentityType === 'i' ? 'di' : 'ds', $cumulativeScore, $scoreIdentityValue);
                if (!$persistCumulativeScore->execute()) {
                    throw new RuntimeException(
                        'Unable to persist placement score for ' . $admissionIdentifier . ': ' . $persistCumulativeScore->error
                    );
                }
            }
        }
        $gpa = (float) ($student['cgpa'] ?? $student['gpa'] ?? 0);
        $grade12 = (float) ($student['grade12'] ?? $student['grade_12_result'] ?? 0);
        $coc = (float) ($student['coc'] ?? $student['coc_result'] ?? 0);

        $allStudents[] = [
            'id' => $student['id'],
            'admission_number' => $admissionIdentifier,
            'id_number' => trim((string) ($student['id_number'] ?? $student['official_id_number'] ?? '')),
            'name' => (string) ($student['name'] ?? $student['fullname'] ?? 'Student'),
            'email' => (string) ($student['email'] ?? ''),
            'gender' => (string) ($student['gender'] ?? ''),
            'stream' => trim((string) ($student['stream'] ?? '')),
            'college_name' => trim((string) ($student['college_name'] ?? $student['college'] ?? '')),
            'disability' => $student['disability'] ?? $student['hasDisability'] ?? false,
            'minority' => $student['minority'] ?? $student['is_minority'] ?? false,
            'cumulative_score' => $cumulativeScore,
            'cgpa' => $gpa,
            'gpa' => $gpa,
            'grade12' => $grade12,
            'grade_12_result' => $grade12,
            'coc' => $coc,
            'coc_result' => $coc,
            'hasDisability' => normalizeYesNo($student['hasDisability'] ?? $student['disability'] ?? false),
            'is_minority' => normalizeYesNo($student['minority'] ?? $student['is_minority'] ?? false),
            'preferences' => $normalizedPreferences,
            'college_allocation' => $collegeAllocation,
            'final_merit_score' => $meritScore,
        ];
    }

    if (empty($allStudents)) {
        $validationSummary = array_map(
            static function (array $error): string {
                $identity = trim((string) ($error['admission_number'] ?? ''));
                if ($identity === '') {
                    $identity = trim((string) ($error['student_id'] ?? 'Unknown student'));
                }
                return $identity . ': ' . (string) ($error['message'] ?? 'Student could not be processed.');
            },
            $studentValidationErrors
        );
        $message = 'No selected students met placement eligibility or had sufficient score data.';
        if ($validationSummary) {
            $message .= ' ' . implode(' ', $validationSummary);
        }
        throw new RuntimeException($message, 422);
    }

    $allStudents = sortPlacementStudentsByMerit($allStudents);

    $allDepartmentMap = $departmentMap;
    $allDepartmentMapById = [];
    foreach ($allDepartmentMap as $department) {
        if ((int) ($department['id'] ?? 0) > 0) {
            $allDepartmentMapById[(int) $department['id']] = $department;
        }
    }
    $departmentMap = array_filter($departmentMap, static fn(array $department): bool => placementDepartmentOfferedInSemester($department, $activeSemester));
    if (!$departmentMap) {
        throw new Exception('No departments are configured for the active placement semester');
    }
    $departmentMapById = [];
    foreach ($departmentMap as $department) {
        if ((int) ($department['id'] ?? 0) > 0) {
            $departmentMapById[(int) $department['id']] = $department;
        }
    }

    $capacityMap = [];
    foreach ($departmentMap as $key => $department) {
        $capacityMap[$key] = max(0, (int) $department['capacity']);
    }
    $placementStatusFilter = $placementHas('status')
        ? " WHERE (status IS NULL OR status NOT IN ('Rejected', 'Cancelled'))"
        : '';
    $occupiedSemesterFilter = $placementHas('placement_semester')
        ? ($placementStatusFilter === '' ? ' WHERE ' : ' AND ')
            . "placement_semester = {$activeSemester}"
        : '';
    $collegeKeyForDepartment = static function (array $department): string {
        return placementCollegeCapacityKey($department);
    };
    $occupiedByCollege = [];
    $occupiedBySemesterTwoCollege = [];
    $occupiedByGroup = [];
    $occupiedBySemesterTwoGroup = [];
    $occupiedSql = $db->query("SELECT dept_id, dept_name, COUNT(*) AS occupied
        FROM placement_results{$placementStatusFilter}{$occupiedSemesterFilter}
        GROUP BY dept_id, dept_name");
    if (!$occupiedSql) {
        throw new Exception('Unable to check department occupancy');
    }
    while ($occupied = $occupiedSql->fetch_assoc()) {
        $occupiedKey = '';
        foreach ($departmentMap as $key => $department) {
            if ((int) $department['id'] === (int) ($occupied['dept_id'] ?? 0)) {
                $occupiedKey = $key;
                break;
            }
        }
        if ($occupiedKey === '') {
            $occupiedKey = normalizeDepartmentName($occupied['dept_name'] ?? '');
        }
        if (isset($capacityMap[$occupiedKey])) {
            $capacityMap[$occupiedKey] = max(0, $capacityMap[$occupiedKey] - (int) $occupied['occupied']);
        }
        foreach ($allDepartmentMap as $department) {
            $matchesDepartment = (int) $department['id'] === (int) ($occupied['dept_id'] ?? 0)
                || normalizeDepartmentName($department['name']) === normalizeDepartmentName($occupied['dept_name'] ?? '');
            if ($matchesDepartment) {
                $collegeKey = $collegeKeyForDepartment($department);
                $occupiedByCollege[$collegeKey] = ($occupiedByCollege[$collegeKey] ?? 0)
                    + (int) $occupied['occupied'];
                if (placementDepartmentOfferedInSemester($department, 2)) {
                    $occupiedBySemesterTwoCollege[$collegeKey] = ($occupiedBySemesterTwoCollege[$collegeKey] ?? 0)
                        + (int) $occupied['occupied'];
                }
                $group = placementDepartmentGroup($department);
                if ($group !== '') {
                    $occupiedByGroup[$group] = ($occupiedByGroup[$group] ?? 0)
                        + (int) $occupied['occupied'];
                    if (placementDepartmentOfferedInSemester($department, 2)) {
                        $occupiedBySemesterTwoGroup[$group] = ($occupiedBySemesterTwoGroup[$group] ?? 0)
                            + (int) $occupied['occupied'];
                    }
                }
                break;
            }
        }
    }
    if ($activeSemester === 1 && $collegeAllocationColumns) {
        $pendingAllocationSql = $db->query(
            "SELECT college_id, placement_group, COUNT(*) AS occupied
             FROM placement_college_allocations
             WHERE target_semester = 2 AND LOWER(TRIM(status)) = 'pending'
             GROUP BY college_id, placement_group"
        );
        if (!$pendingAllocationSql) {
            throw new Exception('Unable to check pending second-semester college reservations: ' . $db->error);
        }
        while ($allocation = $pendingAllocationSql->fetch_assoc()) {
            $occupiedCount = (int) ($allocation['occupied'] ?? 0);
            $collegeId = (int) ($allocation['college_id'] ?? 0);
            if ($collegeId > 0) {
                $collegeKey = 'id:' . $collegeId;
                $occupiedByCollege[$collegeKey] = ($occupiedByCollege[$collegeKey] ?? 0) + $occupiedCount;
                $occupiedBySemesterTwoCollege[$collegeKey] = ($occupiedBySemesterTwoCollege[$collegeKey] ?? 0) + $occupiedCount;
            }

            $group = strtolower(trim((string) ($allocation['placement_group'] ?? '')));
            if ($group !== '') {
                $occupiedByGroup[$group] = ($occupiedByGroup[$group] ?? 0) + $occupiedCount;
                $occupiedBySemesterTwoGroup[$group] = ($occupiedBySemesterTwoGroup[$group] ?? 0) + $occupiedCount;
            }
        }
        $pendingAllocationSql->free();
    }
    $initialAvailableCapacityMap = $capacityMap;
    $collegeCapacityMap = [];
    foreach ($allDepartmentMap as $department) {
        $collegeKey = $collegeKeyForDepartment($department);
        $collegeCapacityMap[$collegeKey] = ($collegeCapacityMap[$collegeKey] ?? 0)
            + (int) ($department['capacity'] ?? 0);
    }
    foreach ($occupiedByCollege as $collegeKey => $occupiedCount) {
        $collegeCapacityMap[$collegeKey] = max(0, ($collegeCapacityMap[$collegeKey] ?? 0) - $occupiedCount);
    }
    $semesterTwoCollegeCapacityMap = [];
    foreach ($allDepartmentMap as $department) {
        if (!placementDepartmentOfferedInSemester($department, 2)) {
            continue;
        }
        $collegeKey = $collegeKeyForDepartment($department);
        if ($collegeKey === '') {
            continue;
        }
        $semesterTwoCollegeCapacityMap[$collegeKey] = ($semesterTwoCollegeCapacityMap[$collegeKey] ?? 0)
            + max(0, (int) ($department['capacity'] ?? 0));
    }
    foreach ($occupiedBySemesterTwoCollege as $collegeKey => $occupiedCount) {
        $semesterTwoCollegeCapacityMap[$collegeKey] = max(
            0,
            ($semesterTwoCollegeCapacityMap[$collegeKey] ?? 0) - $occupiedCount
        );
    }
    $groupCapacityMap = [];
    foreach ($allDepartmentMap as $department) {
        $group = placementDepartmentGroup($department);
        if ($group === '') {
            continue;
        }
        $groupCapacityMap[$group] = ($groupCapacityMap[$group] ?? 0)
            + max(0, (int) ($department['capacity'] ?? 0));
    }
    foreach ($occupiedByGroup as $group => $occupiedCount) {
        $groupCapacityMap[$group] = max(0, ($groupCapacityMap[$group] ?? 0) - $occupiedCount);
    }
    $semesterTwoGroupCapacityMap = [];
    foreach ($allDepartmentMap as $department) {
        if (!placementDepartmentOfferedInSemester($department, 2)) {
            continue;
        }
        $group = placementDepartmentGroup($department);
        if ($group === '') {
            continue;
        }
        $semesterTwoGroupCapacityMap[$group] = ($semesterTwoGroupCapacityMap[$group] ?? 0)
            + max(0, (int) ($department['capacity'] ?? 0));
    }
    foreach ($occupiedBySemesterTwoGroup as $group => $occupiedCount) {
        $semesterTwoGroupCapacityMap[$group] = max(
            0,
            ($semesterTwoGroupCapacityMap[$group] ?? 0) - $occupiedCount
        );
    }
    $semesterTwoFemaleQuotaByCollege = [];
    $semesterTwoGeneralQuotaByCollege = [];
    foreach ($semesterTwoCollegeCapacityMap as $collegeKey => $remainingCapacity) {
        $quotaPools = placementQuotaCapacityPools(
            $remainingCapacity,
            (float) $rules['reservedFemaleQuotaPercent']
        );
        $semesterTwoGeneralQuotaByCollege[$collegeKey] = $quotaPools['general'];
        $semesterTwoFemaleQuotaByCollege[$collegeKey] = $quotaPools['female_reserved'];
    }
    $semesterTwoFemaleQuotaByGroup = [];
    $semesterTwoGeneralQuotaByGroup = [];
    foreach ($semesterTwoGroupCapacityMap as $group => $remainingCapacity) {
        $quotaPools = placementQuotaCapacityPools(
            $remainingCapacity,
            (float) $rules['reservedFemaleQuotaPercent']
        );
        $semesterTwoGeneralQuotaByGroup[$group] = $quotaPools['general'];
        $semesterTwoFemaleQuotaByGroup[$group] = $quotaPools['female_reserved'];
    }
    $preferenceCapacityMaps = placementPreferenceCapacityMaps(
        array_values($departmentMap),
        $capacityMap,
        $activeSemester
    );
    $preferenceCollegeCapacityMap = $preferenceCapacityMaps['college'];
    $preferenceGroupCapacityMap = $preferenceCapacityMaps['group'];
    $quotaCapacityByScope = [];
    foreach ($departmentMap as $departmentKey => $department) {
        $quotaScope = placementQuotaScopeKey($department);
        if ($quotaScope === '') {
            continue;
        }
        $quotaCapacityByScope[$quotaScope] = ($quotaCapacityByScope[$quotaScope] ?? 0)
            + max(0, (int) ($capacityMap[$departmentKey] ?? 0));
    }
    $femaleQuotaMap = [];
    $generalQuotaMap = [];
    foreach ($quotaCapacityByScope as $quotaScope => $remainingCapacity) {
        $quotaPools = placementQuotaCapacityPools(
            $remainingCapacity,
            (float) $rules['reservedFemaleQuotaPercent']
        );
        $generalQuotaMap[$quotaScope] = $quotaPools['general'];
        $femaleQuotaMap[$quotaScope] = $quotaPools['female_reserved'];
    }

    $placements = [];
    $assignedByDepartment = [];
    $assignedCount = 0;
    $unassignedCount = 0;
    $pendingPlacementCount = 0;
    $alreadyPlacedCount = 0;
    $deferredCount = 0;
    // College-wide runs must evaluate every department in the selected college.
    // Keep the field for backwards compatibility, but never narrow a college-wide run to one department.
    $placementScope = strtolower(trim((string) ($input['placementScope'] ?? 'college-wide')));
    $selectedDepartment = $placementScope === 'college-wide' ? '' : trim((string) ($input['selectedDepartment'] ?? ''));

    if ($activeSemester === 2 && !empty($input['completeSemesterRun'])) {
        $pendingAllocations = $db->query(
            "SELECT student_id, admission_number
             FROM placement_college_allocations
             WHERE target_semester = 2 AND LOWER(TRIM(status)) = 'pending'
             FOR UPDATE"
        );
        if (!$pendingAllocations) {
            throw new RuntimeException('Unable to verify the complete second-semester candidate roster: ' . $db->error);
        }
        $selectedById = [];
        $selectedByAdmission = [];
        foreach ($allStudents as $candidate) {
            if ($candidate['id'] !== null) {
                $selectedById[(string) $candidate['id']] = true;
            }
            $candidateAdmission = trim((string) ($candidate['admission_number'] ?? ''));
            if ($candidateAdmission !== '') {
                $selectedByAdmission[$candidateAdmission] = true;
            }
        }
        $omittedAllocation = false;
        while ($allocation = $pendingAllocations->fetch_assoc()) {
            $allocationStudentId = trim((string) ($allocation['student_id'] ?? ''));
            $allocationAdmission = trim((string) ($allocation['admission_number'] ?? ''));
            if (
                ($allocationStudentId === '' || !isset($selectedById[$allocationStudentId]))
                && ($allocationAdmission === '' || !isset($selectedByAdmission[$allocationAdmission]))
            ) {
                $omittedAllocation = true;
                break;
            }
        }
        $pendingAllocations->free();
        if ($omittedAllocation) {
            throw new RuntimeException(
                'Select every pending second-semester student before completing the placement cycle.',
                409
            );
        }
    }

    foreach ($allStudents as $student) {
        // Check for duplicates within the active semester while the transaction is active.
        $existingPlacement = null;
        $existingSelectColumns = [];
        foreach (['id_number', 'admission_number', 'dept_id', 'dept_name', 'stream', 'college_name', 'final_score', 'choice_rank'] as $column) {
            $existingSelectColumns[] = $placementHas($column) ? "`{$column}`" : "NULL AS `{$column}`";
        }
        $existingConditions = [];
        $existingValues = [];
        foreach ($placementIdentifiers as $column) {
            $value = $column === 'student_id' ? $student['id'] : $student['admission_number'];
            if ($value !== null && $value !== '') {
                $existingConditions[] = "`{$column}` = ?";
                $existingValues[] = $value;
            }
        }
        if (!$existingConditions) {
            throw new Exception('Placement results need an admission_number column to place this unlinked student. Apply the placement schema migration.');
        }
        $existingSemesterCondition = $placementHas('placement_semester')
            ? " AND placement_semester = {$activeSemester}"
            : '';
        $existingSql = $db->prepare(
            'SELECT ' . implode(', ', $existingSelectColumns)
            . ' FROM placement_results WHERE (' . implode(' OR ', $existingConditions) . ')'
            . $existingSemesterCondition . ' LIMIT 1 FOR UPDATE'
        );
        if (!$existingSql) {
            throw new Exception('Unable to check existing placement result');
        }
        $existingTypes = str_repeat('s', count($existingValues));
        $existingArguments = [$existingTypes];
        foreach ($existingValues as $index => $value) {
            $existingArguments[] = &$existingValues[$index];
        }
        if (!call_user_func_array([$existingSql, 'bind_param'], $existingArguments)) {
            $existingSql->close();
            throw new Exception('Unable to bind existing placement lookup');
        }
        if (!$existingSql->execute()) {
            $existingSql->close();
            throw new Exception('Unable to check existing placement result');
        }
        $existingPlacement = $existingSql->get_result()->fetch_assoc() ?: null;
        $existingSql->close();

        if ($existingPlacement) {
            clearPlacementUnassignedRecord($db, $student['id'], (string) $student['admission_number']);

            $alreadyPlacedCount++;
            $placements[] = [
                'studentId' => $student['id'],
                'id_number' => $existingPlacement['id_number'] ?: ($existingPlacement['admission_number'] ?: $student['id_number']),
                'studentName' => $student['name'],
                'department' => $existingPlacement['dept_name'],
                'college' => $existingPlacement['college_name'],
                'stream' => $existingPlacement['stream'] ?: $student['stream'],
                'score' => $existingPlacement['final_score'],
                'choiceRank' => $existingPlacement['choice_rank'],
                'status' => 'already_placed',
            ];
            continue;
        }

        $placed = false;
        $pendingTarget = null;
        $previousPreferenceDepartment = null;
        foreach ($student['preferences'] as $priorityIndex => $preference) {
            $deptName = trim((string) $preference['department']);
            $deptKey = normalizeDepartmentName($deptName);
            $isFallbackPreference = !empty($preference['is_fallback']);
            $preferenceDepartmentId = (int) ($preference['dept_id'] ?? 0);
            if ($activeSemester === 1 && !empty($preference['is_broad_choice'])) {
                // Automatic fallback allocation is disabled. Broad-choice preferences must not
                // create a deferred or random department assignment when the student has no explicit match.
                $pendingTarget = null;
                continue;
            }
            $preferenceDepartment = $preferenceDepartmentId > 0
                ? ($allDepartmentMapById[$preferenceDepartmentId] ?? null)
                : ($allDepartmentMap[$deptKey] ?? null);
            if (!$preferenceDepartment) {
                continue;
            }

            if (!studentPlacementStreamsMatch($student['stream'] ?? '', $preferenceDepartment['stream'] ?? '')) {
                continue;
            }
            if ($activeSemester === 2 && $student['college_allocation']) {
                $allocation = $student['college_allocation'];
                if (
                    !$isFallbackPreference
                    && !placementDepartmentMatchesAllocation($preferenceDepartment, $allocation)
                ) {
                    continue;
                }
            }

            if ($selectedDepartment !== '' && $selectedDepartment !== 'all') {
                if (normalizeDepartmentName($preferenceDepartment['name']) !== normalizeDepartmentName($selectedDepartment)) {
                    continue;
                }
            }

            if ($selectedCollege !== '' && $selectedCollege !== 'all') {
                if (normalizeDepartmentName($preferenceDepartment['college_name']) !== normalizeDepartmentName($selectedCollege)) {
                    continue;
                }
            }

            if ($activeSemester === 2 && $isFallbackPreference && $student['college_allocation']) {
                $allocation = $student['college_allocation'];
                if (placementPreferenceCapacityRemaining(
                    $allocation,
                    $semesterTwoCollegeCapacityMap,
                    $semesterTwoGroupCapacityMap
                ) > 0) {
                    break;
                }
            } elseif (
                $previousPreferenceDepartment !== null
                && !placementCanAdvancePreferenceCollege(
                    $previousPreferenceDepartment,
                    $preferenceDepartment,
                    $preferenceCollegeCapacityMap,
                    $preferenceGroupCapacityMap,
                    $activeSemester === 1 ? $semesterTwoCollegeCapacityMap : [],
                    $activeSemester === 1 ? $semesterTwoGroupCapacityMap : []
                )
            ) {
                break;
            }
            $previousPreferenceDepartment = $preferenceDepartment;

            if (!placementDepartmentCanReceiveFinalAssignment($preferenceDepartment, $activeSemester)) {
                continue;
            }

            $department = $preferenceDepartmentId > 0
                ? ($departmentMapById[$preferenceDepartmentId] ?? null)
                : ($departmentMap[$deptKey] ?? null);
            if (!$department) {
                continue;
            }
            $deptKey = normalizeDepartmentName($department['name']);

            $openCapacity = (int) ($capacityMap[$deptKey] ?? 0);
            $collegeKey = $collegeKeyForDepartment($department);
            $collegeOpenCapacity = (int) ($collegeCapacityMap[$collegeKey] ?? 0);
            $departmentGroup = placementDepartmentGroup($department);
            $groupOpenCapacity = (int) ($groupCapacityMap[$departmentGroup] ?? 0);
            $quotaScope = placementQuotaScopeKey($department);
            $femaleReserve = (int) ($femaleQuotaMap[$quotaScope] ?? 0);
            $generalOpen = (int) ($generalQuotaMap[$quotaScope] ?? 0);
            $isFemaleApplicant = placementIsFemale($student['gender'] ?? '');

            if ($generalOpen > 0 && $openCapacity > 0 && $collegeOpenCapacity > 0 && $groupOpenCapacity > 0) {
                $generalQuotaMap[$quotaScope] = $generalOpen - 1;
                $capacityMap[$deptKey] = max(0, $openCapacity - 1);
                $collegeCapacityMap[$collegeKey] = max(0, $collegeOpenCapacity - 1);
                $groupCapacityMap[$departmentGroup] = max(0, $groupOpenCapacity - 1);
            } elseif ($isFemaleApplicant && $femaleReserve > 0 && $openCapacity > 0 && $collegeOpenCapacity > 0 && $groupOpenCapacity > 0) {
                $femaleQuotaMap[$quotaScope] = $femaleReserve - 1;
                $capacityMap[$deptKey] = max(0, $openCapacity - 1);
                $collegeCapacityMap[$collegeKey] = max(0, $collegeOpenCapacity - 1);
                $groupCapacityMap[$departmentGroup] = max(0, $groupOpenCapacity - 1);
            } else {
                continue;
            }
            if ($activeSemester === 2) {
                $semesterTwoCollegeCapacityMap[$collegeKey] = max(
                    0,
                    (int) ($semesterTwoCollegeCapacityMap[$collegeKey] ?? 0) - 1
                );
                if ($departmentGroup !== '') {
                    $semesterTwoGroupCapacityMap[$departmentGroup] = max(
                        0,
                        (int) ($semesterTwoGroupCapacityMap[$departmentGroup] ?? 0) - 1
                    );
                }
            }
            if (in_array($departmentGroup, ['health_science', 'git', 'law'], true)) {
                $preferenceCollegeCapacityMap[$collegeKey] = max(
                    0,
                    (int) ($preferenceCollegeCapacityMap[$collegeKey] ?? 0) - 1
                );
            } elseif ($departmentGroup !== '') {
                $preferenceGroupCapacityMap[$departmentGroup] = max(
                    0,
                    (int) ($preferenceGroupCapacityMap[$departmentGroup] ?? 0) - 1
                );
            }

            $assignedCount++;
            $assignedByDepartment[$deptKey] = ($assignedByDepartment[$deptKey] ?? 0) + 1;
            $placed = true;

            $placements[] = [
                'studentId' => $student['id'],
                'id_number' => $student['id_number'],
                'studentName' => $student['name'],
                'department' => $department['name'],
                'college' => $department['college_name'],
                'stream' => $department['stream'],
                'score' => $student['final_merit_score'],
                'choiceRank' => (int) ($preference['priority'] ?? ($priorityIndex + 1)),
                'status' => 'placed',
            ];

            clearPlacementUnassignedRecord($db, $student['id'], (string) $student['admission_number']);

            if ($db) {
                $insertData = [
                    'student_id' => $student['id'],
                    'admission_number' => $student['admission_number'],
                    'id_number' => $student['id_number'],
                    'dept_id' => (int) $department['id'],
                    'dept_name' => $department['name'],
                    'stream' => $department['stream'],
                    'college_name' => $department['college_name'],
                    'final_score' => (float) $student['final_merit_score'],
                    'choice_rank' => (int) ($preference['priority'] ?? ($priorityIndex + 1)),
                    'status' => ($semester === 2) ? 'Pending 2nd Semester' : 'Pending',
                    'placement_semester' => $activeSemester,
                ];
                $insertColumns = array_values(array_filter(
                    array_keys($insertData),
                    $placementHas
                ));
                if ($placementHas('placed_at')) {
                    $insertColumns[] = 'placed_at';
                }
                $duplicateConditions = [];
                $duplicateValues = [];
                foreach ($placementIdentifiers as $column) {
                    $value = $column === 'student_id' ? $student['id'] : $student['admission_number'];
                    if ($value !== null && $value !== '') {
                        $duplicateConditions[] = "`{$column}` = ?";
                        $duplicateValues[] = $value;
                    }
                }
                if (!$duplicateConditions) {
                    throw new Exception('Placement results need an admission_number column to place this unlinked student. Apply the placement schema migration.');
                }
                $insertValueExpressions = array_map(
                    static fn(string $column): string => $column === 'placed_at' ? 'NOW()' : '?',
                    $insertColumns
                );
                $insertSql = $db->prepare(
                    'INSERT INTO placement_results (`' . implode('`, `', $insertColumns) . '`) '
                    . 'SELECT ' . implode(', ', $insertValueExpressions)
                    . ' WHERE NOT EXISTS (SELECT 1 FROM placement_results WHERE ('
                    . implode(' OR ', $duplicateConditions) . ')'
                    . ($placementHas('placement_semester')
                        ? " AND placement_semester = {$activeSemester}"
                        : '') . ')'
                );
                if (!$insertSql) {
                    throw new Exception('Unable to prepare placement result insert');
                }

                $insertValues = array_map(
                    static fn(string $column) => $insertData[$column],
                    array_values(array_filter($insertColumns, static fn(string $column): bool => $column !== 'placed_at'))
                );
                $boundValues = array_merge($insertValues, $duplicateValues);
                $boundTypes = str_repeat('s', count($boundValues));
                $boundArguments = [$boundTypes];
                foreach ($boundValues as $index => $value) {
                    $boundArguments[] = &$boundValues[$index];
                }
                if (!call_user_func_array([$insertSql, 'bind_param'], $boundArguments)) {
                    $insertSql->close();
                    throw new Exception('Unable to bind placement result values');
                }
                if (!$insertSql->execute()) {
                    $insertSql->close();
                    throw new Exception('Unable to save placement result');
                }
                $insertedRows = $insertSql->affected_rows;
                $insertSql->close();

                if ($insertedRows !== 1) {
                    throw new Exception('Student already has a placement result');
                }

                $profileIdentityColumn = $studentDataIdentityColumn === 'user_id' && $student['id'] !== null
                    ? 'user_id'
                    : (in_array('admission_number', $studentDataColumns, true) ? 'admission_number' : 'id_number');
                $profileIdValue = $profileIdentityColumn === 'user_id'
                    ? $student['id']
                    : $student['admission_number'];
                $profileIdType = $profileIdentityColumn === 'user_id' ? 'i' : 's';
                $updateStudentPlacementFields(
                    $activeSemester === 1 ? 'Pending 2nd Semester' : 'Placed',
                    $department['name'],
                    $profileIdentityColumn,
                    $profileIdValue,
                    $profileIdType
                );
                if ($activeSemester === 1) {
                    $allocatedPlacementGroup = placementDepartmentGroup($department);
                    $allocatedCollege = placementDepartmentCapacityCollegeName($department);
                    if ($allocatedPlacementGroup === '' || $allocatedCollege === '') {
                        throw new Exception('Unable to create the second-semester allocation for the Semester 1 placement.');
                    }
                    savePlacementCollegeAllocation($db, $student, [
                        'college_id' => $department['college_id'],
                        'college_name' => $allocatedCollege,
                        'stream' => $department['stream'],
                        'placement_group' => $allocatedPlacementGroup,
                    ]);
                } else {
                    if ($isFallbackPreference) {
                        updatePlacementCollegeAllocationTarget($db, $student, $department);
                    } else {
                        updatePlacementCollegeAllocationStatus($db, $student, 'placed');
                    }
                }
            }

            break;
        }

        if (!$placed) {
            // Automatic fallback assignment is completely disabled.
            // If a student has no valid explicit choice match, they must remain unassigned or pending.
            $target = null;
            $firstPreference = $student['preferences'][0] ?? [];
            $unassignedStream = $student['stream'] !== ''
                ? $student['stream']
                : trim((string) ($firstPreference['stream'] ?? ''));
            $unassignedCollege = $student['college_name'] !== ''
                ? $student['college_name']
                : trim((string) ($firstPreference['college_name'] ?? ''));
            $matchingDepartments = [];
            $fullDepartments = [];
            foreach ($student['preferences'] as $preference) {
                $deptKey = normalizeDepartmentName($preference['department'] ?? '');
                if (!isset($departmentMap[$deptKey])) {
                    continue;
                }

                $department = $departmentMap[$deptKey];
                if (
                    $selectedDepartment !== '' && $selectedDepartment !== 'all'
                    && normalizeDepartmentName($department['name']) !== normalizeDepartmentName($selectedDepartment)
                ) {
                    continue;
                }
                if (
                    $selectedCollege !== '' && $selectedCollege !== 'all'
                    && normalizeDepartmentName($department['college_name']) !== normalizeDepartmentName($selectedCollege)
                ) {
                    continue;
                }

                $matchingDepartments[$deptKey] = $department['name'];
                if (($capacityMap[$deptKey] ?? 0) <= 0) {
                    $fullDepartments[$deptKey] = $department['name'];
                }
            }

            if (!empty($matchingDepartments) && count($matchingDepartments) === count($fullDepartments)) {
                $reasonCode = 'CAPACITY_FULL';
                $reasonDetails = ['departments' => array_values($fullDepartments)];
            } elseif (empty($student['preferences'])) {
                $reasonCode = 'NO_CHOICES';
                $reasonDetails = ['message' => 'No department choices were submitted for this placement run.'];
            } else {
                $reasonCode = 'NO_ELIGIBLE_DEPARTMENT';
                $reasonDetails = ['message' => 'No active department matching the submitted choices was available in this placement run scope.'];
            }

            if ($activeSemester === 1) {
                $pendingTarget = placementFirstSemesterAllocationTarget(
                    (string) $student['stream'],
                    $student['preferences'],
                    array_values($allDepartmentMap),
                    $semesterTwoGroupCapacityMap,
                    $groupCapacityMap,
                    $collegeCapacityMap,
                    $semesterTwoCollegeCapacityMap,
                    $preferenceCollegeCapacityMap,
                    $preferenceGroupCapacityMap,
                    true
                );
                $pendingCollege = trim((string) ($pendingTarget['college_name'] ?? ''));
                if ($pendingTarget === null || $pendingCollege === '') {
                    throw new RuntimeException(
                        'Unable to keep this student pending for semester two because no college can be resolved from their choices.',
                        422
                    );
                }
                savePlacementCollegeAllocation($db, $student, $pendingTarget);
                $pendingStatus = 'Pending 2nd Semester';
                $profileIdentityColumn = $studentDataIdentityColumn === 'user_id' && $student['id'] !== null
                    ? 'user_id'
                    : (in_array('admission_number', $studentDataColumns, true) ? 'admission_number' : 'id_number');
                $profileIdValue = $profileIdentityColumn === 'user_id'
                    ? $student['id']
                    : $student['admission_number'];
                $profileIdType = $profileIdentityColumn === 'user_id' ? 'i' : 's';
                clearPlacementUnassignedRecord($db, $student['id'], (string) $student['admission_number']);
                $updateStudentPlacementFields(
                    $pendingStatus,
                    $pendingCollege,
                    $profileIdentityColumn,
                    $profileIdValue,
                    $profileIdType
                );
                $pendingPlacementCount++;
                $placements[] = [
                    'studentId' => $student['id'],
                    'id_number' => $student['id_number'],
                    'studentName' => $student['name'],
                    'department' => null,
                    'college' => $pendingCollege,
                    'stream' => $unassignedStream,
                    'score' => $student['final_merit_score'],
                    'choiceRank' => null,
                    'status' => 'pending_second_semester',
                    'reasonCode' => $reasonCode,
                ];
                continue;
            }

            if (!placementShouldMarkStudentUnassigned(
                $activeSemester,
                !empty($input['completeSemesterRun']),
                $reasonCode,
                array_sum($capacityMap) <= 0
            )) {
                $pendingStatus = $activeSemester === 2
                    ? 'Pending 2nd Semester'
                    : 'Pending 1st Semester';
                $pendingCollege = $activeSemester === 2
                    ? trim((string) ($student['college_allocation']['college_name'] ?? $unassignedCollege))
                    : 'Not assigned';
                $profileIdentityColumn = $studentDataIdentityColumn === 'user_id' && $student['id'] !== null
                    ? 'user_id'
                    : (in_array('admission_number', $studentDataColumns, true) ? 'admission_number' : 'id_number');
                $profileIdValue = $profileIdentityColumn === 'user_id'
                    ? $student['id']
                    : $student['admission_number'];
                $profileIdType = $profileIdentityColumn === 'user_id' ? 'i' : 's';
                clearPlacementUnassignedRecord($db, $student['id'], (string) $student['admission_number']);
                $updateStudentPlacementFields(
                    $pendingStatus,
                    $pendingCollege,
                    $profileIdentityColumn,
                    $profileIdValue,
                    $profileIdType
                );
                $pendingPlacementCount++;
                $placements[] = [
                    'studentId' => $student['id'],
                    'id_number' => $student['id_number'],
                    'studentName' => $student['name'],
                    'department' => null,
                    'college' => $pendingCollege,
                    'stream' => $unassignedStream,
                    'score' => $student['final_merit_score'],
                    'choiceRank' => null,
                    'status' => 'pending',
                    'reasonCode' => $reasonCode,
                ];
                continue;
            }

            $unassignedCount++;
            $encodedReasonDetails = json_encode($reasonDetails, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $unassignedData = [
                'student_id' => $student['id'],
                'id_number' => $student['id_number'],
                'admission_number' => $student['admission_number'],
                'full_name' => $student['name'],
                'email' => $student['email'],
                'stream' => $unassignedStream,
                'college_name' => $unassignedCollege,
                'status' => 'Not assigned',
                'reason_code' => $reasonCode,
                'reason_details' => $encodedReasonDetails,
                'total_score' => $student['final_merit_score'],
            ];
            $unassignedInsertColumns = array_values(array_filter(
                array_keys($unassignedData),
                $unassignedHas
            ));
            if ($unassignedHas('placement_run_at')) {
                $unassignedInsertColumns[] = 'placement_run_at';
            }
            if (!$unassignedInsertColumns) {
                throw new Exception('Unassigned student table has no supported columns');
            }
            $unassignedValueExpressions = array_map(
                static fn(string $column): string => $column === 'placement_run_at' ? 'NOW()' : '?',
                $unassignedInsertColumns
            );
            $unassignedUpdates = array_values(array_filter(
                $unassignedInsertColumns,
                static fn(string $column): bool => !in_array($column, ['student_id', 'placement_run_at'], true)
            ));
            $unassignedUpdateExpressions = array_map(
                static fn(string $column): string => "`{$column}` = VALUES(`{$column}`)",
                $unassignedUpdates
            );
            if ($unassignedHas('student_id')) {
                $unassignedUpdateExpressions[] = '`student_id` = COALESCE(VALUES(`student_id`), `student_id`)';
            }
            if ($unassignedHas('placement_run_at')) {
                $unassignedUpdateExpressions[] = '`placement_run_at` = NOW()';
            }
            $unassignedSql = 'INSERT INTO unassigned_students (`' . implode('`, `', $unassignedInsertColumns)
                . '`) VALUES (' . implode(', ', $unassignedValueExpressions) . ')';
            if ($unassignedUpdateExpressions) {
                $unassignedSql .= ' ON DUPLICATE KEY UPDATE ' . implode(', ', $unassignedUpdateExpressions);
            }
            $saveUnassignedSql = $db->prepare($unassignedSql);
            if (!$saveUnassignedSql) {
                throw new Exception('Unable to prepare unassigned student record');
            }
            $unassignedValues = array_map(
                static fn(string $column) => $unassignedData[$column],
                array_values(array_filter(
                    $unassignedInsertColumns,
                    static fn(string $column): bool => $column !== 'placement_run_at'
                ))
            );
            $unassignedTypes = str_repeat('s', count($unassignedValues));
            $unassignedArguments = [$unassignedTypes];
            foreach ($unassignedValues as $index => $value) {
                $unassignedArguments[] = &$unassignedValues[$index];
            }
            if (!call_user_func_array([$saveUnassignedSql, 'bind_param'], $unassignedArguments)) {
                $saveUnassignedSql->close();
                throw new Exception('Unable to bind unassigned student values');
            }
            if (!$saveUnassignedSql->execute()) {
                $saveUnassignedSql->close();
                throw new Exception('Unable to save unassigned student record');
            }
            $saveUnassignedSql->close();

            $profileIdentityColumn = $studentDataIdentityColumn === 'user_id' && $student['id'] !== null
                ? 'user_id'
                : (in_array('admission_number', $studentDataColumns, true) ? 'admission_number' : 'id_number');
            $profileIdValue = $profileIdentityColumn === 'user_id'
                ? $student['id']
                : $student['admission_number'];
            $profileIdType = $profileIdentityColumn === 'user_id' ? 'i' : 's';
            $updateStudentPlacementFields(
                'Unassigned',
                'Not assigned',
                $profileIdentityColumn,
                $profileIdValue,
                $profileIdType
            );
            if ($activeSemester === 2) {
                updatePlacementCollegeAllocationStatus($db, $student, 'unassigned');
            }

            $placements[] = [
                'studentId' => $student['id'],
                'id_number' => $student['id_number'],
                'studentName' => $student['name'],
                'department' => null,
                'college' => $unassignedCollege,
                'stream' => $unassignedStream,
                'score' => $student['final_merit_score'],
                'choiceRank' => null,
                'status' => 'unassigned',
            ];
        }
    }

    $nextSemester = $activeSemester;
    if ($activeSemester === 1 && !empty($input['completeSemesterRun'])) {
        if (!in_array('admission_number', $choiceColumns, true)) {
            throw new Exception('Student choices must use admission_number to verify semester completion.');
        }
        $placementChoiceIdentity = [];
        if ($placementHas('admission_number')) {
            $placementChoiceIdentity[] = 'TRIM(pr.admission_number) = TRIM(sc.admission_number)';
        }
        if ($placementHas('id_number')) {
            $placementChoiceIdentity[] = 'TRIM(pr.id_number) = TRIM(sc.admission_number)';
        }
        if (!$placementChoiceIdentity) {
            throw new Exception('Placement results have no identifier compatible with student choices.');
        }
        $placementStatusCondition = $placementHas('status')
            ? " AND LOWER(TRIM(COALESCE(pr.status, ''))) NOT IN ('rejected', 'cancelled', 'canceled')"
            : '';
        $allocationColumns = studentPlacementTableColumns($db, 'placement_college_allocations');
        $allocationChoiceIdentity = [];
        if (in_array('admission_number', $allocationColumns, true)) {
            $allocationChoiceIdentity[] = 'TRIM(pca.admission_number) = TRIM(sc.admission_number)';
        }
        if (in_array('student_id', $choiceColumns, true) && in_array('student_id', $allocationColumns, true)) {
            $allocationChoiceIdentity[] = 'pca.student_id = sc.student_id';
        }
        if (!$allocationChoiceIdentity) {
            throw new Exception('College allocations have no identifier compatible with student choices.');
        }
        $unassignedChoiceIdentity = [];
        if ($unassignedHas('admission_number')) {
            $unassignedChoiceIdentity[] = 'TRIM(us.admission_number) = TRIM(sc.admission_number)';
        }
        if ($unassignedHas('student_id') && in_array('student_id', $choiceColumns, true)) {
            $unassignedChoiceIdentity[] = 'us.student_id = sc.student_id';
        }
        if (!$unassignedChoiceIdentity) {
            throw new Exception('Unassigned students cannot be matched to choices while verifying semester completion.');
        }
        $pendingFirstSemester = $db->query(
            "SELECT COUNT(DISTINCT TRIM(sc.admission_number)) AS pending_count
             FROM student_choices sc
             WHERE NULLIF(TRIM(COALESCE(sc.admission_number, '')), '') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM placement_results pr
                    WHERE (" . implode(' OR ', $placementChoiceIdentity) . "){$placementStatusCondition}
               )
               AND NOT EXISTS (
                    SELECT 1 FROM placement_college_allocations pca
                    WHERE (" . implode(' OR ', $allocationChoiceIdentity) . ")
                      AND pca.target_semester = 2 AND pca.status = 'pending'
               )
               AND NOT EXISTS (
                    SELECT 1 FROM unassigned_students us
                    WHERE (" . implode(' OR ', $unassignedChoiceIdentity) . ")
               )"
        );
        if (!$pendingFirstSemester) {
            throw new Exception('Unable to verify first-semester batch completion');
        }
        $pendingCount = (int) ($pendingFirstSemester->fetch_assoc()['pending_count'] ?? 0);
        $pendingFirstSemester->free();
        if ($pendingCount > 0) {
            throw new Exception('The first-semester batch still has students requiring placement or college allocation.');
        }
        $advanceSemester = $db->query('UPDATE placement_settings SET active_semester = 2 WHERE id = 1 AND active_semester = 1');
        if (!$advanceSemester) {
            throw new Exception('Unable to activate second-semester preferences');
        }
        $nextSemester = 2;
    }

    if (!$db->commit()) {
        throw new Exception('Unable to commit placement results');
    }

    $departmentCapacitySummary = [];
    foreach ($departmentMap as $key => $department) {
        $initialAvailable = (int) ($initialAvailableCapacityMap[$key] ?? 0);
        $departmentCapacitySummary[] = [
            'dept_id' => $department['id'],
            'department' => $department['name'],
            'college_name' => $department['college_name'],
            'capacity' => (int) $department['capacity'],
            'occupied_before_run' => max(0, (int) $department['capacity'] - $initialAvailable),
            'assigned_in_run' => (int) ($assignedByDepartment[$key] ?? 0),
            'remaining_capacity' => (int) ($capacityMap[$key] ?? 0),
        ];
    }

    echo json_encode([
        'success' => true,
        'message' => 'Placement completed successfully.',
        'summary' => [
            'assignedStudents' => $assignedCount,
            'unassignedStudents' => $unassignedCount,
            'pendingStudents' => $pendingPlacementCount,
            'alreadyPlacedStudents' => $alreadyPlacedCount,
            'totalStudents' => count($allStudents),
            'totalDepartments' => count($departmentMap),
            'deferredStudents' => $deferredCount,
            'semester' => $activeSemester,
            'nextSemester' => $nextSemester,
            'departmentCapacity' => $departmentCapacitySummary,
        ],
        'placements' => $placements,
        'assigned' => $assignedCount,
        'unassigned' => $unassignedCount,
        'already_placed' => $alreadyPlacedCount,
        'total_processed' => count($allStudents),
        'student_errors' => $studentValidationErrors,
    ]);
} catch (Throwable $e) {
    error_log('Placement run failed: ' . $e->getMessage());
    if ($db && $db->connect_errno === 0) {
        $db->rollback();
    }

    $statusCode = in_array((int) $e->getCode(), [409, 422], true) ? (int) $e->getCode() : 500;
    http_response_code($statusCode);
    $response = [
        'success' => false,
        'message' => 'Database/Server Error: ' . $e->getMessage(),
    ];
    if (!empty($studentValidationErrors)) {
        $response['student_errors'] = $studentValidationErrors;
    }
    echo json_encode($response);
} finally {
    if (isset($placementLock) && $placementLock instanceof mysqli_result) {
        if ($db instanceof mysqli) {
            $db->query("SELECT RELEASE_LOCK('placement_engine')");
        }
    }
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
}

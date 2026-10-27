<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Access-Control-Allow-Methods: POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

function updateStudentResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['POST', 'PUT'], true)) {
    header('Allow: POST, PUT, OPTIONS');
    updateStudentResponse(['success' => false, 'message' => 'Only POST or PUT requests are allowed.'], 405);
}

session_name('DTUPLACEMENTSESSID');
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$actorId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($actorId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    updateStudentResponse(['success' => false, 'message' => 'Only registrars and administrators can update student records.'], 403);
}

$rawInput = file_get_contents('php://input');
$input = is_string($rawInput) ? json_decode($rawInput, true) : null;
if (!is_array($input)) {
    updateStudentResponse(['success' => false, 'message' => 'A valid JSON request body is required.'], 400);
}

$allowedFields = ['student_id', 'id', 'admission_number', 'cgpa', 'gpa', 'coc_score', 'coc_result', 'field_of_study'];
if (array_diff(array_keys($input), $allowedFields)) {
    updateStudentResponse(['success' => false, 'message' => 'Only CGPA, COC score, and field of study may be updated by the registrar.'], 400);
}
$studentId = filter_var($input['student_id'] ?? $input['id'] ?? null, FILTER_VALIDATE_INT, [
    'options' => ['min_range' => 1],
]);
$admissionNumber = trim((string) ($input['admission_number'] ?? ''));
$cgpaInput = $input['cgpa'] ?? $input['gpa'] ?? null;
$cocInput = $input['coc_score'] ?? $input['coc_result'] ?? null;
$fieldOfStudy = trim((string) ($input['field_of_study'] ?? ''));

if (($studentId === false || $studentId === null) && $admissionNumber === '') {
    updateStudentResponse(['success' => false, 'message' => 'A valid student ID or admission number is required.'], 400);
}
if (!is_numeric($cgpaInput) || (float) $cgpaInput < 0 || (float) $cgpaInput > 4) {
    updateStudentResponse(['success' => false, 'message' => 'CGPA must be between 0 and 4.'], 400);
}
if (!is_numeric($cocInput) || (float) $cocInput < 0 || (float) $cocInput > 30) {
    updateStudentResponse(['success' => false, 'message' => 'COC score must be between 0 and 30.'], 400);
}
if (!in_array($fieldOfStudy, ['Natural Science', 'Social Science'], true)) {
    updateStudentResponse(['success' => false, 'message' => 'Select Natural Science or Social Science as the field of study.'], 400);
}

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/placement_scoring.php';
$db = getDbConnection();
if (!$db instanceof mysqli) {
    updateStudentResponse(['success' => false, 'message' => 'Database connection failed.'], 503);
}

$transactionStarted = false;
try {
    $columnResult = $db->query('SHOW COLUMNS FROM student_data');
    if (!$columnResult) {
        throw new RuntimeException('Unable to inspect student profile columns: ' . $db->error);
    }
    $profileColumns = array_column($columnResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $columnResult->free();
    $hasProfileColumn = static fn (string $column): bool => in_array($column, $profileColumns, true);

    $studentIdColumn = $hasProfileColumn('user_id') ? 'user_id' : null;
    $admissionColumn = $hasProfileColumn('admission_number')
        ? 'admission_number'
        : ($hasProfileColumn('id_number') ? 'id_number' : null);
    if ($studentIdColumn === null && $admissionColumn === null) {
        throw new RuntimeException('Student profile table has no supported student identifier.');
    }

    $selectColumns = [];
    foreach ([
        'first_name', 'given_name', 'last_name', 'father_name', 'total_mark', 'grade_12_result',
        'sex', 'gender', 'disability', 'minority', 'benefit_group', 'region',
    ] as $column) {
        if ($hasProfileColumn($column)) {
            $selectColumns[] = "`{$column}`";
        }
    }
    if (!$selectColumns) {
        throw new RuntimeException('Student profile table is missing required scoring data.');
    }

    $where = [];
    $parameters = [];
    $types = '';
    if ($studentIdColumn !== null && $studentId !== false && $studentId !== null) {
        $where[] = "`{$studentIdColumn}` = ?";
        $parameters[] = (int) $studentId;
        $types .= 'i';
    }
    if ($admissionColumn !== null && $admissionNumber !== '') {
        $where[] = "TRIM(`{$admissionColumn}`) = TRIM(?)";
        $parameters[] = $admissionNumber;
        $types .= 's';
    }
    $lookup = $db->prepare(
        'SELECT ' . implode(', ', $selectColumns)
        . ' FROM student_data WHERE (' . implode(' OR ', $where) . ') LIMIT 1 FOR UPDATE'
    );
    if (!$lookup) {
        throw new RuntimeException('Unable to prepare student lookup: ' . $db->error);
    }
    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start student update transaction: ' . $db->error);
    }
    $transactionStarted = true;

    $bindArguments = [$types];
    foreach ($parameters as $index => $value) {
        $bindArguments[] = &$parameters[$index];
    }
    if (!call_user_func_array([$lookup, 'bind_param'], $bindArguments) || !$lookup->execute()) {
        $error = $lookup->error;
        $lookup->close();
        throw new RuntimeException('Unable to load student profile: ' . $error);
    }
    $student = $lookup->get_result()->fetch_assoc();
    $lookup->close();
    if (!$student) {
        $db->rollback();
        $transactionStarted = false;
        $db->close();
        updateStudentResponse(['success' => false, 'message' => 'Student not found.'], 404);
    }

    $grade12Value = $student['total_mark'] ?? $student['grade_12_result'] ?? null;
    if (!is_numeric($grade12Value)) {
        throw new RuntimeException('Official Ministry Grade 12 data is required to recalculate the cumulative score.');
    }
    $grade12 = (float) $grade12Value;
    $gender = (string) ($student['sex'] ?? $student['gender'] ?? '');
    $disabilityValue = (string) ($student['disability'] ?? '');
    $benefitGroup = strtolower((string) ($student['benefit_group'] ?? ''));
    $region = strtolower((string) ($student['region'] ?? ''));
    $disability = preg_match('/disability|disabled/', $benefitGroup) || strtolower($disabilityValue) === 'yes'
        ? 'Yes'
        : 'No';
    $minority = strtolower((string) ($student['minority'] ?? '')) === 'yes'
        || (bool) preg_match('/developing|emerging/', $benefitGroup . ' ' . $region)
        ? 'Yes'
        : 'No';

    $gpa = (float) $cgpaInput;
    $coc = (float) $cocInput;
    $settings = $db->query('SELECT gpa_weight, grade_12_weight, coc_weight, g12_total_base, female_bonus_points, disability_bonus_points, minority_bonus_points, minority_male_bonus_points, minority_female_bonus_points, minority_disability_bonus_points, female_disability_minority_bonus_points FROM placement_settings WHERE id = 1 LIMIT 1');
    if (!$settings) {
        throw new RuntimeException('Unable to load placement scoring settings: ' . $db->error);
    }
    $rules = $settings->fetch_assoc() ?: [];
    $settings->free();
    $cumulativeScore = calculatePlacementCumulativeScore(
        $gpa,
        $grade12,
        $coc,
        $gender,
        $disability,
        $minority,
        [
            'gpa_weight' => (float) ($rules['gpa_weight'] ?? 50),
            'grade_12_weight' => (float) ($rules['grade_12_weight'] ?? 20),
            'coc_weight' => (float) ($rules['coc_weight'] ?? 30),
            'g12_total_base' => (float) ($rules['g12_total_base'] ?? 600),
            'femaleBonusPoints' => (float) ($rules['female_bonus_points'] ?? 5),
            'disabilityBonusPoints' => (float) ($rules['disability_bonus_points'] ?? 5),
            'minorityBonusPoints' => (float) ($rules['minority_bonus_points'] ?? 5),
            'minorityMaleBonusPoints' => (float) ($rules['minority_male_bonus_points'] ?? 5),
            'minorityFemaleBonusPoints' => (float) ($rules['minority_female_bonus_points'] ?? 10),
            'minorityDisabilityBonusPoints' => (float) ($rules['minority_disability_bonus_points'] ?? 10),
            'femaleDisabilityMinorityBonusPoints' => (float) ($rules['female_disability_minority_bonus_points'] ?? 15),
        ]
    );

    $updates = [];
    $updateValues = [];
    $updateTypes = '';
    foreach ([
        ['cgpa', 'gpa', $gpa, 'd'],
        ['coc_score', 'coc_result', $coc, 'd'],
        ['field_of_study', 'stream', $fieldOfStudy, 's'],
        ['cumulative_score', 'cumulative_avg', $cumulativeScore, 'd'],
    ] as [$primaryColumn, $fallbackColumn, $value, $type]) {
        $column = $hasProfileColumn($primaryColumn)
            ? $primaryColumn
            : ($hasProfileColumn($fallbackColumn) ? $fallbackColumn : null);
        if ($column === null) {
            if (in_array($primaryColumn, ['cgpa', 'coc_score', 'field_of_study'], true)) {
                throw new RuntimeException("Student profile is missing the {$primaryColumn} field.");
            }
            continue;
        }
        $updates[] = "`{$column}` = ?";
        $updateValues[] = $value;
        $updateTypes .= $type;
    }
    if (!$updates) {
        throw new RuntimeException('Student profile does not contain any supported fields to update.');
    }

    $whereUpdate = [];
    $whereValues = [];
    $whereTypes = '';
    if ($studentIdColumn !== null && $studentId !== false && $studentId !== null) {
        $whereUpdate[] = "`{$studentIdColumn}` = ?";
        $whereValues[] = (int) $studentId;
        $whereTypes .= 'i';
    }
    if ($admissionColumn !== null && $admissionNumber !== '') {
        $whereUpdate[] = "TRIM(`{$admissionColumn}`) = TRIM(?)";
        $whereValues[] = $admissionNumber;
        $whereTypes .= 's';
    }
    $update = $db->prepare(
        'UPDATE student_data SET ' . implode(', ', $updates)
        . ' WHERE (' . implode(' OR ', $whereUpdate) . ') LIMIT 1'
    );
    if (!$update) {
        throw new RuntimeException('Unable to prepare student update: ' . $db->error);
    }
    $allValues = array_merge($updateValues, $whereValues);
    $bindArguments = [$updateTypes . $whereTypes];
    foreach ($allValues as $index => $value) {
        $bindArguments[] = &$allValues[$index];
    }
    if (!call_user_func_array([$update, 'bind_param'], $bindArguments) || !$update->execute()) {
        $error = $update->error;
        $update->close();
        throw new RuntimeException('Unable to save student profile: ' . $error);
    }
    $update->close();

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit student update: ' . $db->error);
    }
    $transactionStarted = false;
    $db->close();

    $firstName = trim((string) ($student['given_name'] ?? $student['first_name'] ?? ''));
    $lastName = trim((string) ($student['father_name'] ?? $student['last_name'] ?? ''));
    updateStudentResponse([
        'success' => true,
        'message' => 'Student record updated successfully.',
        'student' => [
            'id' => $studentId !== false && $studentId !== null ? (int) $studentId : null,
            'admission_number' => $admissionNumber,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'gpa' => $gpa,
            'cgpa' => $gpa,
            'coc_score' => $coc,
            'field_of_study' => $fieldOfStudy,
            'stream' => $fieldOfStudy,
            'cumulative_avg' => $cumulativeScore,
            'cumulative_score' => $cumulativeScore,
            'gender' => $gender,
            'disability' => $disability,
            'minority' => $minority,
        ],
    ]);
} catch (Throwable $error) {
    if ($transactionStarted) {
        $db->rollback();
    }
    error_log('Student record update failed: ' . $error->getMessage());
    $db->close();
    updateStudentResponse(['success' => false, 'message' => 'Unable to update student record.'], 500);
}

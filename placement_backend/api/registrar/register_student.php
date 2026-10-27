<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/placement_scoring.php';

function registerStudentRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    registerStudentRespond(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$actorId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($actorId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    registerStudentRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$input = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($input)) {
    registerStudentRespond(['success' => false, 'message' => 'A valid JSON request body is required.'], 400);
}

$admissionNumber = trim((string) ($input['admission_number'] ?? ''));
$firstName = trim((string) ($input['given_name'] ?? $input['first_name'] ?? ''));
$fatherName = trim((string) ($input['father_name'] ?? ''));
$grandfatherName = trim((string) ($input['grandfather_name'] ?? ''));
$region = trim((string) ($input['region'] ?? ''));
$sex = trim((string) ($input['sex'] ?? ''));
$fieldOfStudy = trim((string) ($input['field_of_study'] ?? ''));
$disability = trim((string) ($input['disability'] ?? 'No'));
$minority = trim((string) ($input['minority'] ?? 'No'));

if ($admissionNumber === '' || $firstName === '' || $fatherName === '' || $grandfatherName === '') {
    registerStudentRespond([
        'success' => false,
        'message' => 'Admission number, first name, father name, and grandfather name are required.',
    ], 400);
}

$regions = [
    'Afar', 'Amhara', 'Benishangul-Gumuz', 'Central Ethiopia', 'Gambella',
    'Harari', 'Oromia', 'Sidama', 'Somali', 'South Ethiopia',
    "South West Ethiopia Peoples' Region", 'Tigray', 'Addis Ababa', 'Dire Dawa',
];
if ($region !== '' && !in_array($region, $regions, true)) {
    registerStudentRespond(['success' => false, 'message' => 'Select a valid Ethiopian region.'], 400);
}
if ($sex !== '' && !in_array($sex, ['Male', 'Female'], true)) {
    registerStudentRespond(['success' => false, 'message' => 'Sex must be Male or Female.'], 400);
}
if ($fieldOfStudy !== '' && !in_array($fieldOfStudy, ['Natural Science', 'Social Science'], true)) {
    registerStudentRespond(['success' => false, 'message' => 'Select a valid field of study.'], 400);
}
if (!in_array($disability, ['Yes', 'No'], true) || !in_array($minority, ['Yes', 'No'], true)) {
    registerStudentRespond(['success' => false, 'message' => 'Disability and minority status must be Yes or No.'], 400);
}

$scoreInputs = [];
foreach ([
    'total_mark' => ['Total Mark (G12)', null],
    'cgpa' => ['CGPA', 4.0],
    'coc_score' => ['COC Score', 30.0],
] as $field => [$label, $maximum]) {
    $rawValue = $input[$field] ?? null;
    if ($rawValue === null || $rawValue === '') {
        $scoreInputs[$field] = null;
        continue;
    }
    if (!is_numeric($rawValue) || (float) $rawValue < 0 || ($maximum !== null && (float) $rawValue > $maximum)) {
        $range = $maximum === null ? 'zero or greater' : "between 0 and {$maximum}";
        registerStudentRespond(['success' => false, 'message' => "{$label} must be {$range}."], 400);
    }
    $scoreInputs[$field] = (string) (float) $rawValue;
}

$db = null;
try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $duplicate = $db->prepare(
        'SELECT admission_number FROM student_data
         WHERE UPPER(TRIM(admission_number)) = UPPER(TRIM(?))
         LIMIT 1'
    );
    if (!$duplicate) {
        throw new RuntimeException('Unable to prepare duplicate student check: ' . $db->error);
    }
    $duplicate->bind_param('s', $admissionNumber);
    if (!$duplicate->execute()) {
        throw new RuntimeException('Unable to check admission number: ' . $duplicate->error);
    }
    $exists = $duplicate->get_result()->num_rows > 0;
    $duplicate->close();
    if ($exists) {
        $db->close();
        registerStudentRespond(['success' => false, 'message' => 'A student with this admission number is already registered.'], 409);
    }

    $scoreRulesResult = $db->query(
        'SELECT gpa_weight, grade_12_weight, coc_weight, g12_total_base,
                female_bonus_points, disability_bonus_points, minority_bonus_points,
                minority_male_bonus_points, minority_female_bonus_points,
                minority_disability_bonus_points, female_disability_minority_bonus_points
         FROM placement_settings WHERE id = 1 LIMIT 1'
    );
    if (!$scoreRulesResult) {
        throw new RuntimeException('Unable to load placement scoring settings: ' . $db->error);
    }
    $scoreRules = $scoreRulesResult->fetch_assoc() ?: [];
    $scoreRulesResult->free();
    $cumulativeScore = calculatePlacementCumulativeScore(
        (float) ($scoreInputs['cgpa'] ?? 0),
        (float) ($scoreInputs['total_mark'] ?? 0),
        (float) ($scoreInputs['coc_score'] ?? 0),
        $sex,
        $disability,
        $minority,
        [
            'gpa_weight' => (float) ($scoreRules['gpa_weight'] ?? 50),
            'grade_12_weight' => (float) ($scoreRules['grade_12_weight'] ?? 20),
            'coc_weight' => (float) ($scoreRules['coc_weight'] ?? 30),
            'g12_total_base' => (float) ($scoreRules['g12_total_base'] ?? 600),
            'femaleBonusPoints' => (float) ($scoreRules['female_bonus_points'] ?? 5),
            'disabilityBonusPoints' => (float) ($scoreRules['disability_bonus_points'] ?? 5),
            'minorityBonusPoints' => (float) ($scoreRules['minority_bonus_points'] ?? 5),
            'minorityMaleBonusPoints' => (float) ($scoreRules['minority_male_bonus_points'] ?? 5),
            'minorityFemaleBonusPoints' => (float) ($scoreRules['minority_female_bonus_points'] ?? 10),
            'minorityDisabilityBonusPoints' => (float) ($scoreRules['minority_disability_bonus_points'] ?? 10),
            'femaleDisabilityMinorityBonusPoints' => (float) ($scoreRules['female_disability_minority_bonus_points'] ?? 15),
        ]
    );

    $insert = $db->prepare(
        "INSERT INTO student_data
            (admission_number, region, given_name, father_name, grandfather_name, sex,
             field_of_study, total_mark, cgpa, coc_score, cumulative_score, disability, minority, placement_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')"
    );
    if (!$insert) {
        throw new RuntimeException('Unable to prepare student registration: ' . $db->error);
    }
    $totalMark = $scoreInputs['total_mark'];
    $cgpa = $scoreInputs['cgpa'];
    $cocScore = $scoreInputs['coc_score'];
    if (!$insert->bind_param(
        'ssssssssssdss',
        $admissionNumber,
        $region,
        $firstName,
        $fatherName,
        $grandfatherName,
        $sex,
        $fieldOfStudy,
        $totalMark,
        $cgpa,
        $cocScore,
        $cumulativeScore,
        $disability,
        $minority
    )) {
        throw new RuntimeException('Unable to bind student registration fields: ' . $insert->error);
    }
    if (!$insert->execute()) {
        if ($insert->errno === 1062) {
            $insert->close();
            $db->close();
            registerStudentRespond(['success' => false, 'message' => 'A student with this admission number is already registered.'], 409);
        }
        throw new RuntimeException('Unable to save student record: ' . $insert->error);
    }
    $insert->close();
    $db->close();

    registerStudentRespond([
        'success' => true,
        'message' => 'Student registered successfully.',
        'student' => [
            'admission_number' => $admissionNumber,
            'given_name' => $firstName,
            'father_name' => $fatherName,
            'grandfather_name' => $grandfatherName,
            'region' => $region,
            'sex' => $sex,
            'field_of_study' => $fieldOfStudy,
            'total_mark' => $scoreInputs['total_mark'],
            'cgpa' => $scoreInputs['cgpa'],
            'coc_score' => $scoreInputs['coc_score'],
            'cumulative_score' => $cumulativeScore,
            'disability' => $disability,
            'minority' => $minority,
            'placement_status' => 'Pending',
        ],
    ], 201);
} catch (Throwable $error) {
    error_log('Registrar student registration failed: ' . $error->getMessage());
    if ($db instanceof mysqli) {
        $db->close();
    }
    registerStudentRespond(['success' => false, 'message' => 'Unable to register student.'], 500);
}
?>

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
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/placement_scoring.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$actorId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($actorId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    updateStudentResponse(['success' => false, 'message' => 'Only registrars and administrators can update student records.'], 403);
}

if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['POST', 'PUT'], true)) {
    header('Allow: POST, PUT, OPTIONS');
    updateStudentResponse(['success' => false, 'message' => 'Only POST or PUT requests are allowed.'], 405);
}

$rawInput = file_get_contents('php://input');
$input = is_string($rawInput) ? json_decode($rawInput, true) : null;
if (!is_array($input)) {
    updateStudentResponse(['success' => false, 'message' => 'A valid JSON request body is required.'], 400);
}

$studentId = filter_var($input['student_id'] ?? $input['id'] ?? null, FILTER_VALIDATE_INT, [
    'options' => ['min_range' => 1],
]);
$allowedFields = ['student_id', 'id', 'gpa', 'cgpa', 'coc_score', 'coc_result'];
if (array_diff(array_keys($input), $allowedFields)) {
    updateStudentResponse(['success' => false, 'message' => 'Only CGPA and COC score may be updated by the registrar.'], 400);
}
$gpaInput = $input['cgpa'] ?? $input['gpa'] ?? null;
$cocInput = $input['coc_score'] ?? $input['coc_result'] ?? null;

if ($studentId === false || $studentId === null) {
    updateStudentResponse(['success' => false, 'message' => 'A valid student_id is required.'], 400);
}
if (!is_numeric($gpaInput) || (float) $gpaInput < 0 || (float) $gpaInput > 4) {
    updateStudentResponse(['success' => false, 'message' => 'GPA must be between 0 and 4.'], 400);
}
if (!is_numeric($cocInput) || (float) $cocInput < 0 || (float) $cocInput > 30) {
    updateStudentResponse(['success' => false, 'message' => 'COC score must be between 0 and 30.'], 400);
}
$gpa = (float) $gpaInput;
$coc = (float) $cocInput;
$db = getDbConnection();
if (!$db instanceof mysqli) {
    updateStudentResponse(['success' => false, 'message' => 'Database connection failed.'], 500);
}

$transactionStarted = false;
try {
    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start student update transaction: ' . $db->error);
    }
    $transactionStarted = true;

    $studentQuery = $db->prepare(
        "SELECT u.id, u.username, u.email, u.phone_number,
            u.first_name AS account_first_name, u.last_name AS account_last_name,
            sd.user_id AS profile_user_id, sd.first_name AS profile_first_name,
            sd.last_name AS profile_last_name, m.total_mark AS grade_12_result,
            m.sex AS official_gender, m.benefit_group, m.region, s.stream AS sims_stream
         FROM users u
         LEFT JOIN student_data sd ON sd.user_id = u.id
         LEFT JOIN moshe_students m ON TRIM(m.admission_number) = TRIM(COALESCE(NULLIF(sd.id_number, ''), u.id_number))
         LEFT JOIN sims_students s ON TRIM(s.student_id) = TRIM(m.admission_number)
         WHERE u.id = ? AND LOWER(u.role) = 'student'
         LIMIT 1
         FOR UPDATE"
    );
    if (!$studentQuery) {
        throw new RuntimeException('Unable to prepare student lookup: ' . $db->error);
    }
    $studentQuery->bind_param('i', $studentId);
    if (!$studentQuery->execute()) {
        throw new RuntimeException('Unable to load student record: ' . $studentQuery->error);
    }
    $student = $studentQuery->get_result()->fetch_assoc();
    $studentQuery->close();
    if (!$student) {
        $db->rollback();
        $transactionStarted = false;
        $db->close();
        updateStudentResponse(['success' => false, 'message' => 'Student not found.'], 404);
    }
    $firstName = trim((string) ($student['profile_first_name'] ?? ''));
    $lastName = trim((string) ($student['profile_last_name'] ?? ''));
    if ($firstName === '') {
        $firstName = trim((string) ($student['account_first_name'] ?? ''));
    }
    if ($lastName === '') {
        $lastName = trim((string) ($student['account_last_name'] ?? ''));
    }
    if ($student['grade_12_result'] === null) {
        throw new RuntimeException('MoSHE data is required before updating placement scores.');
    }
    $grade12 = (float) $student['grade_12_result'];
    $gender = (string) ($student['official_gender'] ?? '');
    $benefitGroup = strtolower((string) ($student['benefit_group'] ?? ''));
    $region = strtolower((string) ($student['region'] ?? ''));
    $disability = preg_match('/disability|disabled/', $benefitGroup) ? 'Yes' : 'No';
    $developingRegion = preg_match('/developing|emerging/', $benefitGroup . ' ' . $region)
        || preg_match('/\b(afar|somali|gambella|benishangul[\s-]*gumuz|benishangul|harari)\b/', $region);
    $scoreSettings = $db->query('SELECT g12_total_base FROM placement_settings WHERE id = 1 LIMIT 1');
    if (!$scoreSettings) {
        throw new RuntimeException('Unable to load Grade 12 scoring base: ' . $db->error);
    }
    $scoreRules = $scoreSettings->fetch_assoc() ?: [];
    $scoreSettings->free();
    $cumulativeAverage = calculatePlacementCumulativeScore(
        $gpa,
        $grade12,
        $coc,
        $gender,
        $disability,
        $developingRegion,
        ['g12_total_base' => (float) ($scoreRules['g12_total_base'] ?? 600)]
    );
    $stream = (string) ($student['sims_stream'] ?? '');
    $minority = $developingRegion ? 'Yes' : 'No';

    if ($student['profile_user_id'] === null) {
        $profileInsert = $db->prepare(
            'INSERT INTO student_data
                (user_id, first_name, last_name, username, email, phone, gpa, stream,
                 grade_12_result, coc_result, cumulative_avg, gender, disability, minority)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        if (!$profileInsert) {
            throw new RuntimeException('Unable to prepare student profile creation: ' . $db->error);
        }
        $username = (string) $student['username'];
        $email = (string) $student['email'];
        $phone = (string) ($student['phone_number'] ?? '');
        $profileInsert->bind_param(
            'isssssdsdddsss',
            $studentId,
            $firstName,
            $lastName,
            $username,
            $email,
            $phone,
            $gpa,
            $stream,
            $grade12,
            $coc,
            $cumulativeAverage,
            $gender,
            $disability,
            $minority
        );
        if (!$profileInsert->execute()) {
            throw new RuntimeException('Unable to create student profile: ' . $profileInsert->error);
        }
        $profileInsert->close();
    }

    $studentUpdate = $db->prepare(
        'UPDATE student_data
         SET gpa = ?, coc_result = ?, cumulative_avg = ?
         WHERE user_id = ?'
    );
    if (!$studentUpdate) {
        throw new RuntimeException('Unable to prepare student profile update: ' . $db->error);
    }
    $studentUpdate->bind_param(
        'dddi',
        $gpa,
        $coc,
        $cumulativeAverage,
        $studentId
    );
    if (!$studentUpdate->execute()) {
        throw new RuntimeException('Unable to update student profile: ' . $studentUpdate->error);
    }
    $studentUpdate->close();

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit student update: ' . $db->error);
    }
    $transactionStarted = false;
    $db->close();

    updateStudentResponse([
        'success' => true,
        'message' => 'Student record updated successfully',
        'student' => [
            'id' => (int) $studentId,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'name' => trim($firstName . ' ' . $lastName),
            'gpa' => $gpa,
            'g12_result' => $grade12,
            'grade_12_result' => $grade12,
            'coc_score' => $coc,
            'coc_result' => $coc,
            'gender' => $gender,
            'disability' => $disability,
            'minority' => $minority,
            'stream' => $stream,
            'cumulative_avg' => $cumulativeAverage,
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

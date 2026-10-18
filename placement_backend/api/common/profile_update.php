<?php
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
];
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}
header('Vary: Origin');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/placement_scoring.php';
$db = getDbConnection();

function loadPlacementWeights(mysqli $db): array
{
    $weights = ['gpa' => 30.0, 'grade12' => 20.0, 'coc' => 50.0, 'g12_total_base' => 600.0, 'gender' => 0.0, 'disability' => 0.0, 'minority' => 0.0];
    $result = $db->query('SELECT gpa_weight, grade_12_weight, coc_weight, g12_total_base, gender_weight, disability_weight, minority_weight FROM placement_settings WHERE id = 1 LIMIT 1');
    if ($result) {
        $row = $result->fetch_assoc();
        $columns = [
            'gpa' => 'gpa_weight',
            'grade12' => 'grade_12_weight',
            'coc' => 'coc_weight',
            'g12_total_base' => 'g12_total_base',
            'gender' => 'gender_weight',
            'disability' => 'disability_weight',
            'minority' => 'minority_weight',
        ];
        foreach ($columns as $key => $column) {
            if (isset($row[$column]) && is_numeric($row[$column]) && (float) $row[$column] >= 0) {
                $weights[$key] = (float) $row[$column];
            }
        }
    }
    return $weights;
}

function calculateCumulativeScore(float $gpa, float $grade12, float $coc, string $gender, string $disability, string $minority, array $weights): float
{
    return calculatePlacementCumulativeScore(
        $gpa,
        $grade12,
        $coc,
        $gender,
        $disability,
        $minority,
        $weights
    );
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

$rawBody = file_get_contents('php://input');
$data = json_decode($rawBody, true);
if (!is_array($data) && !empty($_POST)) {
    $data = $_POST;
}
if (!is_array($data)) {
    respond(['success' => false, 'message' => 'Invalid request payload. Send the profile as JSON.'], 400);
}
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
if (strtolower((string) ($_SESSION['role'] ?? '')) === 'registrar' && array_key_exists('grade_12_result', $data)) {
    respond(['success' => false, 'message' => 'Grade 12 results are Ministry-owned and cannot be changed by registrars.'], 403);
}

$userId = (int) ($data['user_id'] ?? $data['student_id'] ?? $data['id'] ?? 0);
$email = strtolower(trim((string) ($data['email'] ?? '')));
$username = trim((string) ($data['username'] ?? ''));
$firstName = trim((string) ($data['first_name'] ?? ''));
$lastName = trim((string) ($data['last_name'] ?? ''));
$phone = trim((string) ($data['phone'] ?? ''));
$genderValue = trim((string) ($data['gender'] ?? 'Not specified'));
$gender = strtolower($genderValue) === 'female'
    ? 'Female'
    : (strtolower($genderValue) === 'male' ? 'Male' : ($genderValue !== '' ? $genderValue : 'Not specified'));
$requestedStream = strtolower(trim((string) ($data['stream'] ?? '')));
$normalizedStream = preg_replace('/[^a-z]/', '', $requestedStream) ?? '';
$normalizedStream = preg_replace('/sciences$/', 'science', $normalizedStream) ?? $normalizedStream;
$stream = match ($normalizedStream) {
    'natural', 'naturalscience' => 'Natural',
    'social', 'socialscience' => 'Social',
    default => '',
};
$disability = trim((string) ($data['disability'] ?? 'No'));
$minority = trim((string) ($data['minority'] ?? 'No'));
$status = trim((string) ($data['status'] ?? 'Pending')) ?: 'Pending';
$gpa = (float) ($data['gpa'] ?? 0);
$grade12 = (float) ($data['grade_12_result'] ?? 0);
$coc = array_key_exists('coc_result', $data) && $data['coc_result'] !== '' && $data['coc_result'] !== null
    ? (float) $data['coc_result']
    : null;
if (!array_key_exists('grade_12_result', $data) && $userId > 0) {
    $grade12Lookup = $db->prepare('SELECT grade_12_result FROM student_data WHERE user_id = ? LIMIT 1');
    if (!$grade12Lookup) {
        respond(['success' => false, 'message' => 'Could not prepare the existing Grade 12 result lookup.'], 500);
    }
    $grade12Lookup->bind_param('i', $userId);
    if (!$grade12Lookup->execute()) {
        $grade12Lookup->close();
        respond(['success' => false, 'message' => 'Could not load the existing Grade 12 result.'], 500);
    }
    $currentStudent = $grade12Lookup->get_result()->fetch_assoc();
    $grade12Lookup->close();
    if ($currentStudent && is_numeric($currentStudent['grade_12_result'])) {
        $grade12 = (float) $currentStudent['grade_12_result'];
    }
}

if ($userId > 0 && ($email === '' || $username === '' || $firstName === '' || $lastName === '')) {
    $userLookup = $db->prepare('SELECT first_name, last_name, username, email FROM users WHERE id = ? LIMIT 1');
    if ($userLookup) {
        $userLookup->bind_param('i', $userId);
        $userLookup->execute();
        $user = $userLookup->get_result()->fetch_assoc();
        $userLookup->close();

        if ($user) {
            $email = $email !== '' ? $email : strtolower(trim((string) ($user['email'] ?? '')));
            $username = $username !== '' ? $username : trim((string) ($user['username'] ?? ''));
            $firstName = $firstName !== '' ? $firstName : trim((string) ($user['first_name'] ?? ''));
            $lastName = $lastName !== '' ? $lastName : trim((string) ($user['last_name'] ?? ''));
        }
    }
}

if ($userId <= 0 || $email === '' || $username === '' || $firstName === '' || $lastName === '') {
    respond(['success' => false, 'message' => 'user_id, first_name, last_name, username, and email are required.'], 400);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(['success' => false, 'message' => 'Invalid email format.'], 400);
}
if ($stream === '') {
    respond(['success' => false, 'message' => 'Select Natural Science or Social Science before saving.'], 400);
}
if ($gpa < 0 || $gpa > 4 || $grade12 < 0 || ($coc !== null && ($coc < 0 || $coc > 30))) {
    respond(['success' => false, 'message' => 'Scores are outside their allowed ranges.'], 400);
}

$userCheck = $db->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
if (!$userCheck) {
    respond(['success' => false, 'message' => 'Could not prepare user lookup.'], 500);
}
$userCheck->bind_param('i', $userId);
$userCheck->execute();
if ($userCheck->get_result()->num_rows !== 1) {
    $userCheck->close();
    respond(['success' => false, 'message' => 'User account was not found.'], 404);
}
$userCheck->close();

$weights = loadPlacementWeights($db);
if ($grade12 > $weights['g12_total_base']) {
    respond(['success' => false, 'message' => 'Grade 12 result cannot exceed the configured total base mark.'], 400);
}
$cumulativeAvg = calculateCumulativeScore($gpa, $grade12, $coc ?? 0, $gender, $disability, $minority, $weights);

$sql = 'INSERT INTO student_data
    (user_id, first_name, last_name, username, email, phone, gpa, stream,
     grade_12_result, coc_result, cumulative_avg, gender, disability, minority, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      first_name = VALUES(first_name), last_name = VALUES(last_name),
      username = VALUES(username), email = VALUES(email), phone = VALUES(phone),
      gpa = VALUES(gpa), stream = VALUES(stream),
      grade_12_result = VALUES(grade_12_result), coc_result = VALUES(coc_result),
      cumulative_avg = VALUES(cumulative_avg), gender = VALUES(gender),
      disability = VALUES(disability), minority = VALUES(minority), status = VALUES(status)';

$statement = $db->prepare($sql);
if (!$statement) {
    respond(['success' => false, 'message' => 'Could not prepare profile save: ' . $db->error], 500);
}

$statement->bind_param(
    'isssssdsdddssss',
    $userId,
    $firstName,
    $lastName,
    $username,
    $email,
    $phone,
    $gpa,
    $stream,
    $grade12,
    $coc,
    $cumulativeAvg,
    $gender,
    $disability,
    $minority,
    $status
);

if (!$statement->execute()) {
    $message = $statement->error;
    $statement->close();
    respond(['success' => false, 'message' => 'Profile save failed: ' . $message], 500);
}

$statement->close();

$studentDataUpdate = $db->prepare(
    'UPDATE student_data
     SET gender = ?, gpa = ?, grade_12_result = ?, coc_result = ?, cumulative_avg = ?, stream = ?, disability = ?, minority = ?
     WHERE user_id = ? OR LOWER(email) = ?'
);
if (!$studentDataUpdate) {
    respond(['success' => false, 'message' => 'Could not prepare student score update: ' . $db->error], 500);
}
$studentDataUpdate->bind_param(
    'sddddsssis',
    $gender,
    $gpa,
    $grade12,
    $coc,
    $cumulativeAvg,
    $stream,
    $disability,
    $minority,
    $userId,
    $email
);
if (!$studentDataUpdate->execute()) {
    $message = $studentDataUpdate->error;
    $studentDataUpdate->close();
    respond(['success' => false, 'message' => 'Student score update failed: ' . $message], 500);
}
$studentDataUpdate->close();

$genderColumn = $db->query("SHOW COLUMNS FROM users LIKE 'gender'");
if ($genderColumn && $genderColumn->num_rows > 0) {
    $usersGenderUpdate = $db->prepare('UPDATE users SET gender = ? WHERE id = ? OR LOWER(email) = ?');
    if (!$usersGenderUpdate) {
        respond(['success' => false, 'message' => 'Could not prepare user gender update: ' . $db->error], 500);
    }
    $usersGenderUpdate->bind_param('sis', $gender, $userId, $email);
    if (!$usersGenderUpdate->execute()) {
        $message = $usersGenderUpdate->error;
        $usersGenderUpdate->close();
        respond(['success' => false, 'message' => 'User gender update failed: ' . $message], 500);
    }
    $usersGenderUpdate->close();
}

$db->close();
respond([
    'success' => true,
    'message' => 'Student profile saved successfully.',
    'user_id' => $userId,
    'cumulative_score' => round($cumulativeAvg, 2),
    'cumulative_avg' => round($cumulativeAvg, 2),
]);

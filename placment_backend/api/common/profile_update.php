<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

function loadPlacementWeights(mysqli $db): array
{
    $weights = ['gpa' => 40.0, 'grade12' => 20.0, 'coc' => 30.0, 'gender' => 3.0, 'disability' => 3.0, 'minority' => 4.0];
    $result = $db->query('SELECT gpa_weight, grade_12_weight, coc_weight, gender_weight, disability_weight, minority_weight FROM placement_settings WHERE id = 1 LIMIT 1');
    if ($result) {
        $row = $result->fetch_assoc();
        $columns = [
            'gpa' => 'gpa_weight',
            'grade12' => 'grade_12_weight',
            'coc' => 'coc_weight',
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
    $scores = ['gpa' => min(100, max(0, ($gpa <= 4 ? $gpa / 4 : $gpa / 100) * 100)), 'grade12' => min(100, max(0, $grade12)), 'coc' => min(100, max(0, ($coc / 30) * 100)), 'gender' => strtolower($gender) === 'female' ? 100 : 0, 'disability' => in_array(strtolower($disability), ['yes', 'y', 'true', '1', 'on'], true) ? 100 : 0, 'minority' => in_array(strtolower($minority), ['yes', 'y', 'true', '1', 'on'], true) ? 100 : 0];
    $totalWeight = array_sum($weights);
    if ($totalWeight <= 0) return 0.0;
    $weightedTotal = 0.0;
    foreach ($scores as $key => $score) $weightedTotal += $score * (float) $weights[$key];
    return round(min(100, max(0, $weightedTotal / $totalWeight)), 2);
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
$stream = trim((string) ($data['stream'] ?? ''));
$disability = trim((string) ($data['disability'] ?? 'No'));
$minority = trim((string) ($data['minority'] ?? 'No'));
$status = trim((string) ($data['status'] ?? 'Pending')) ?: 'Pending';
$gpa = (float) ($data['gpa'] ?? 0);
$grade12 = (float) ($data['grade_12_result'] ?? 0);
$coc = array_key_exists('coc_result', $data) && $data['coc_result'] !== '' && $data['coc_result'] !== null
    ? (float) $data['coc_result']
    : null;

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
if ($gpa < 0 || $gpa > 4 || $grade12 < 0 || $grade12 > 100 || ($coc !== null && ($coc < 0 || $coc > 30))) {
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
     SET gender = ?, gpa = ?, grade_12_result = ?, coc_result = ?, cumulative_avg = ?, disability = ?, minority = ?
     WHERE user_id = ? OR LOWER(email) = ?'
);
if (!$studentDataUpdate) {
    respond(['success' => false, 'message' => 'Could not prepare student score update: ' . $db->error], 500);
}
$studentDataUpdate->bind_param(
    'sddddssis',
    $gender,
    $gpa,
    $grade12,
    $coc,
    $cumulativeAvg,
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

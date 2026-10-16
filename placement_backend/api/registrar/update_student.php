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
$firstName = trim((string) ($input['first_name'] ?? ''));
$lastName = trim((string) ($input['last_name'] ?? ''));
$gpaInput = $input['gpa'] ?? null;
$grade12Input = $input['g12_result'] ?? $input['grade_12_result'] ?? null;
$cocInput = $input['coc_score'] ?? $input['coc_result'] ?? null;
$gender = trim((string) ($input['gender'] ?? ''));
$disabilityInput = $input['disability'] ?? null;
$minorityInput = $input['minority'] ?? null;
$streamInput = strtolower(trim((string) ($input['stream'] ?? '')));

if ($studentId === false || $studentId === null) {
    updateStudentResponse(['success' => false, 'message' => 'A valid student_id is required.'], 400);
}
if ($firstName === '' || strlen($firstName) > 50 || $lastName === '' || strlen($lastName) > 50) {
    updateStudentResponse(['success' => false, 'message' => 'First and last name are required and must be no longer than 50 characters.'], 400);
}
if (!is_numeric($gpaInput) || (float) $gpaInput < 0 || (float) $gpaInput > 4) {
    updateStudentResponse(['success' => false, 'message' => 'GPA must be between 0 and 4.'], 400);
}
if (!is_numeric($grade12Input) || (float) $grade12Input < 0 || (float) $grade12Input > 100) {
    updateStudentResponse(['success' => false, 'message' => 'Grade 12 result must be between 0 and 100.'], 400);
}
if (!is_numeric($cocInput) || (float) $cocInput < 0 || (float) $cocInput > 30) {
    updateStudentResponse(['success' => false, 'message' => 'COC score must be between 0 and 30.'], 400);
}
if (!in_array($gender, ['Male', 'Female'], true)) {
    updateStudentResponse(['success' => false, 'message' => 'Gender must be Male or Female.'], 400);
}

$normalizeYesNo = static function ($value): ?string {
    if (is_bool($value)) {
        return $value ? 'Yes' : 'No';
    }
    if (is_int($value) || is_float($value)) {
        return $value === 1 ? 'Yes' : ($value === 0 ? 'No' : null);
    }
    $normalized = strtolower(trim((string) $value));
    if (in_array($normalized, ['yes', 'y', 'true', '1', 'on'], true)) {
        return 'Yes';
    }
    if (in_array($normalized, ['no', 'n', 'false', '0', 'off'], true)) {
        return 'No';
    }
    return null;
};

$disability = $normalizeYesNo($disabilityInput);
$minority = $normalizeYesNo($minorityInput);
if ($disability === null || $minority === null) {
    updateStudentResponse(['success' => false, 'message' => 'Disability and minority must each be Yes or No.'], 400);
}

$stream = match (preg_replace('/[^a-z]/', '', $streamInput)) {
    'natural', 'naturalscience', 'naturalsciences' => 'Natural',
    'social', 'socialscience', 'socialsciences' => 'Social',
    default => '',
};
if ($stream === '') {
    updateStudentResponse(['success' => false, 'message' => 'Stream must be Natural Science or Social Science.'], 400);
}

$gpa = (float) $gpaInput;
$grade12 = (float) $grade12Input;
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
                sd.user_id AS profile_user_id
         FROM users u
         LEFT JOIN student_data sd ON sd.user_id = u.id
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
    $weights = [
        'gpa' => 40.0,
        'grade12' => 20.0,
        'coc' => 30.0,
        'gender' => 3.0,
        'disability' => 3.0,
        'minority' => 4.0,
    ];
    $weightsResult = $db->query(
        'SELECT gpa_weight, grade_12_weight, coc_weight, gender_weight, disability_weight, minority_weight
         FROM placement_settings WHERE id = 1 LIMIT 1'
    );
    if (!$weightsResult) {
        throw new RuntimeException('Unable to load placement weights: ' . $db->error);
    }
    $storedWeights = $weightsResult->fetch_assoc();
    $weightsResult->free();
    if ($storedWeights) {
        foreach ([
            'gpa' => 'gpa_weight',
            'grade12' => 'grade_12_weight',
            'coc' => 'coc_weight',
            'gender' => 'gender_weight',
            'disability' => 'disability_weight',
            'minority' => 'minority_weight',
        ] as $key => $column) {
            if (isset($storedWeights[$column]) && is_numeric($storedWeights[$column]) && (float) $storedWeights[$column] >= 0) {
                $weights[$key] = (float) $storedWeights[$column];
            }
        }
    }

    $scores = [
        'gpa' => min(100, max(0, ($gpa <= 4 ? $gpa / 4 : $gpa / 100) * 100)),
        'grade12' => min(100, max(0, $grade12)),
        'coc' => min(100, max(0, ($coc / 30) * 100)),
        'gender' => $gender === 'Female' ? 100 : 0,
        'disability' => $disability === 'Yes' ? 100 : 0,
        'minority' => $minority === 'Yes' ? 100 : 0,
    ];
    $totalWeight = array_sum($weights);
    $cumulativeAverage = 0.0;
    if ($totalWeight > 0) {
        foreach ($scores as $key => $score) {
            $cumulativeAverage += $score * $weights[$key];
        }
        $cumulativeAverage = round(min(100, max(0, $cumulativeAverage / $totalWeight)), 2);
    }

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
         SET first_name = ?, last_name = ?, gpa = ?, stream = ?, grade_12_result = ?,
             coc_result = ?, cumulative_avg = ?, gender = ?, disability = ?, minority = ?
         WHERE user_id = ?'
    );
    if (!$studentUpdate) {
        throw new RuntimeException('Unable to prepare student profile update: ' . $db->error);
    }
    $studentUpdate->bind_param(
        'ssdsdddsssi',
        $firstName,
        $lastName,
        $gpa,
        $stream,
        $grade12,
        $coc,
        $cumulativeAverage,
        $gender,
        $disability,
        $minority,
        $studentId
    );
    if (!$studentUpdate->execute()) {
        throw new RuntimeException('Unable to update student profile: ' . $studentUpdate->error);
    }
    $studentUpdate->close();

    $userUpdate = $db->prepare('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?');
    if (!$userUpdate) {
        throw new RuntimeException('Unable to prepare account name update: ' . $db->error);
    }
    $userUpdate->bind_param('ssi', $firstName, $lastName, $studentId);
    if (!$userUpdate->execute()) {
        throw new RuntimeException('Unable to update student account name: ' . $userUpdate->error);
    }
    $userUpdate->close();

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

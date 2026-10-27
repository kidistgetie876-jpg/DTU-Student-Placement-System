<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

function studentAttributesResponse(array $payload, int $status = 200): void
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
header('Access-Control-Allow-Methods: POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    studentAttributesResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$actorId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($actorId <= 0 || !in_array($role, ['student', 'registrar', 'admin'], true)) {
    studentAttributesResponse(['success' => false, 'message' => 'Authentication is required.'], 401);
}

$rawInput = file_get_contents('php://input');
$input = is_string($rawInput) ? json_decode($rawInput, true) : null;
if (!is_array($input)) {
    studentAttributesResponse(['success' => false, 'message' => 'A JSON request body is required.'], 400);
}

$studentId = $role === 'student'
    ? $actorId
    : filter_var($input['student_id'] ?? $input['id'] ?? null, FILTER_VALIDATE_INT);
if ($studentId === false || $studentId === null || $studentId <= 0) {
    studentAttributesResponse(['success' => false, 'message' => 'A valid student ID is required.'], 400);
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

$disability = $normalizeYesNo($input['disability'] ?? null);
$minority = $normalizeYesNo($input['minority'] ?? null);
if ($disability === null || $minority === null) {
    studentAttributesResponse(['success' => false, 'message' => 'Disability and minority must each be Yes or No.'], 400);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    studentAttributesResponse(['success' => false, 'message' => 'Database connection failed.'], 500);
}

try {
    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start student attribute update transaction: ' . $db->error);
    }

    $profileQuery = $db->prepare(
        "SELECT sd.user_id AS profile_user_id, sd.gpa, sd.grade_12_result, sd.coc_result, sd.gender,
                u.first_name AS user_first_name, u.last_name AS user_last_name,
                u.username AS user_username, u.email AS user_email
         FROM users u
         LEFT JOIN student_data sd ON sd.user_id = u.id
         WHERE u.id = ? AND LOWER(u.role) = 'student'
         LIMIT 1"
    );
    if (!$profileQuery) {
        throw new RuntimeException('Unable to prepare student profile lookup: ' . $db->error);
    }
    $profileQuery->bind_param('i', $studentId);
    if (!$profileQuery->execute()) {
        throw new RuntimeException('Unable to load student profile: ' . $profileQuery->error);
    }
    $profile = $profileQuery->get_result()->fetch_assoc();
    $profileQuery->close();
    if (!$profile) {
        $db->rollback();
        $db->close();
        studentAttributesResponse(['success' => false, 'message' => 'Student profile not found.'], 404);
    }
    if ($profile['profile_user_id'] === null) {
        $createProfile = $db->prepare(
            "INSERT INTO student_data
                (user_id, first_name, last_name, username, email, gpa, stream, disability, minority)
             VALUES (?, ?, ?, ?, ?, 0, 'Natural', ?, ?)"
        );
        if (!$createProfile) {
            throw new RuntimeException('Unable to prepare student profile creation: ' . $db->error);
        }
        $firstName = (string) ($profile['user_first_name'] ?? '');
        $lastName = (string) ($profile['user_last_name'] ?? '');
        $username = (string) ($profile['user_username'] ?? '');
        $email = (string) ($profile['user_email'] ?? '');
        $createProfile->bind_param(
            'issssss',
            $studentId,
            $firstName,
            $lastName,
            $username,
            $email,
            $disability,
            $minority
        );
        if (!$createProfile->execute()) {
            $error = $createProfile->error;
            $createProfile->close();
            throw new RuntimeException('Unable to create student profile: ' . $error);
        }
        $createProfile->close();
    }

    $gpa = (float) ($profile['gpa'] ?? 0);
    $grade12 = (float) ($profile['grade_12_result'] ?? 0);
    $coc = (float) ($profile['coc_result'] ?? 0);
    $gender = trim((string) ($profile['gender'] ?? ''));

    $scoreSettings = $db->query('SELECT gpa_weight, grade_12_weight, coc_weight, g12_total_base, female_bonus_points, disability_bonus_points, minority_bonus_points, minority_male_bonus_points, minority_female_bonus_points, minority_disability_bonus_points, female_disability_minority_bonus_points FROM placement_settings WHERE id = 1 LIMIT 1');
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

    $update = $db->prepare(
        'UPDATE student_data
         SET disability = ?, minority = ?, cumulative_avg = ?
         WHERE user_id = ?'
    );
    if (!$update) {
        throw new RuntimeException('Unable to prepare student attribute update: ' . $db->error);
    }
    $update->bind_param('ssdi', $disability, $minority, $cumulativeAverage, $studentId);
    if (!$update->execute()) {
        throw new RuntimeException('Unable to save student attributes: ' . $update->error);
    }
    $update->close();
    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit student attribute update: ' . $db->error);
    }
    $db->close();

    studentAttributesResponse([
        'success' => true,
        'message' => 'Student details updated successfully.',
        'student' => [
            'id' => $studentId,
            'disability' => $disability,
            'minority' => $minority,
            'cumulative_avg' => $cumulativeAverage,
        ],
    ]);
} catch (Throwable $error) {
    error_log('Student attribute update failed: ' . $error->getMessage());
    $db->rollback();
    $db->close();
    studentAttributesResponse(['success' => false, 'message' => 'Unable to update student details.'], 500);
}

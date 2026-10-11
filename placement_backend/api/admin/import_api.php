<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';
require_once __DIR__ . '/../../config/id_number.php';

function importResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function calculateImportedCumulativeScore(
    float $gpa,
    float $grade12,
    float $coc,
    string $gender,
    string $disability,
    string $minority,
    array $weights
): float {
    $scores = [
        'gpa' => min(100, max(0, ($gpa <= 4 ? $gpa / 4 : $gpa / 100) * 100)),
        'grade12' => min(100, max(0, $grade12)),
        'coc' => min(100, max(0, ($coc / 30) * 100)),
        'gender' => strtolower($gender) === 'female' ? 100 : 0,
        'disability' => in_array(strtolower($disability), ['yes', 'y', 'true', '1', 'on'], true) ? 100 : 0,
        'minority' => in_array(strtolower($minority), ['yes', 'y', 'true', '1', 'on'], true) ? 100 : 0,
    ];
    $totalWeight = array_sum($weights);
    if ($totalWeight <= 0) {
        throw new RuntimeException('Placement score weights must total more than zero.');
    }

    $weightedTotal = 0.0;
    foreach ($scores as $key => $score) {
        $weightedTotal += $score * (float) $weights[$key];
    }

    return round(min(100, max(0, $weightedTotal / $totalWeight)), 2);
}

function normalizeImportedStream(string $stream): ?string
{
    $normalized = strtolower(trim($stream));
    if ($normalized === '') {
        return '';
    }

    $normalized = preg_replace('/[^a-z]/', '', $normalized) ?? '';
    $normalized = preg_replace('/sciences$/', 'science', $normalized) ?? $normalized;
    if (in_array($normalized, ['natural', 'naturalscience'], true)) {
        return 'Natural';
    }
    if (in_array($normalized, ['social', 'socialscience'], true)) {
        return 'Social';
    }

    return null;
}

function normalizeImportKey(string $key): string
{
    return strtolower((string) preg_replace('/[^a-z0-9]/i', '', $key));
}

function getImportField(array $row, array $aliases): ?string
{
    $normalizedAliases = array_map('normalizeImportKey', $aliases);
    foreach ($row as $key => $value) {
        if (in_array(normalizeImportKey((string) $key), $normalizedAliases, true)) {
            return $value === null ? '' : trim((string) $value);
        }
    }

    return null;
}

function parseImportNumber(?string $value, string $field, int $row): ?float
{
    if ($value === null || $value === '') {
        return null;
    }

    $normalized = str_replace(',', '', $value);
    if (!is_numeric($normalized)) {
        throw new InvalidArgumentException("Row {$row} has an invalid {$field} value.");
    }

    return (float) $normalized;
}

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower((string) ($_SESSION['role'] ?? ''));
if ($userId <= 0 || !in_array($role, ['admin', 'registrar'], true)) {
    importResponse(['success' => false, 'message' => 'Only administrators and registrars can import student data.'], 403);
}

$data = json_decode(file_get_contents('php://input'), true);
if (!isset($data['students']) || !is_array($data['students'])) {
    importResponse(['success' => false, 'message' => 'No student data was received.'], 400);
}

$db = getDbConnection();
$inserted = 0;
$updated = 0;
$skipped = [];
$defaultPassword = password_hash('123456', PASSWORD_DEFAULT);

try {
    $db->begin_transaction();

    $weightsResult = $db->query(
        'SELECT gpa_weight, grade_12_weight, coc_weight, gender_weight, disability_weight, minority_weight
         FROM placement_settings WHERE id = 1 LIMIT 1'
    );
    if (!$weightsResult) {
        throw new RuntimeException('Unable to load placement score weights: ' . $db->error);
    }
    $weightRow = $weightsResult->fetch_assoc();
    if (!$weightRow) {
        throw new RuntimeException('Placement score weights are not configured.');
    }
    $weights = [
        'gpa' => (float) $weightRow['gpa_weight'],
        'grade12' => (float) $weightRow['grade_12_weight'],
        'coc' => (float) $weightRow['coc_weight'],
        'gender' => (float) $weightRow['gender_weight'],
        'disability' => (float) $weightRow['disability_weight'],
        'minority' => (float) $weightRow['minority_weight'],
    ];

    $findUser = $db->prepare(
        'SELECT u.id, u.role, COALESCE(NULLIF(u.id_number, \'\'), NULLIF(sd.id_number, \'\')) AS id_number, u.username, u.email,
                sd.stream, sd.gpa, sd.grade_12_result, sd.coc_result, sd.cumulative_avg,
                sd.first_name, sd.last_name, sd.phone, sd.gender, sd.disability, sd.minority
         FROM users u
         LEFT JOIN student_data sd ON sd.user_id = u.id
         WHERE LOWER(u.email) = LOWER(?)
         LIMIT 1'
    );
    $findUserByIdNumber = $db->prepare(
        'SELECT u.id, u.role, COALESCE(NULLIF(u.id_number, \'\'), NULLIF(sd.id_number, \'\')) AS id_number, u.username, u.email,
                sd.stream, sd.gpa, sd.grade_12_result, sd.coc_result, sd.cumulative_avg,
                sd.first_name, sd.last_name, sd.phone, sd.gender, sd.disability, sd.minority
         FROM users u
         LEFT JOIN student_data sd ON sd.user_id = u.id
         WHERE LOWER(TRIM(u.id_number)) = LOWER(TRIM(?))
            OR LOWER(TRIM(sd.id_number)) = LOWER(TRIM(?))
         LIMIT 2'
    );
    $findUserByUsername = $db->prepare(
        'SELECT u.id, u.role, COALESCE(NULLIF(u.id_number, \'\'), NULLIF(sd.id_number, \'\')) AS id_number, u.username, u.email,
                sd.stream, sd.gpa, sd.grade_12_result, sd.coc_result, sd.cumulative_avg,
                sd.first_name, sd.last_name, sd.phone, sd.gender, sd.disability, sd.minority
         FROM users u
         LEFT JOIN student_data sd ON sd.user_id = u.id
         WHERE LOWER(u.username) = LOWER(?) OR LOWER(sd.username) = LOWER(?)
         LIMIT 2'
    );
    $findUsernameOwner = $db->prepare(
        'SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1'
    );
    $insertUser = $db->prepare('INSERT INTO users (id_number, username, email, password, role, phone_number) VALUES (?, ?, ?, ?, \'student\', ?)');
    $updateUser = $db->prepare('UPDATE users SET id_number = ?, username = ?, phone_number = ? WHERE id = ? AND role = \'student\'');
    $findStudent = $db->prepare('SELECT user_id FROM student_data WHERE user_id = ? LIMIT 1');
    $insertStudent = $db->prepare(
        'INSERT INTO student_data
         (user_id, id_number, first_name, last_name, username, email, phone, gpa, stream, grade_12_result, coc_result, cumulative_avg, gender, disability, minority, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'Pending\')'
    );
    $updateStudent = $db->prepare(
        'UPDATE student_data SET id_number = ?, first_name = ?, last_name = ?, username = ?, email = ?, phone = ?,
         gpa = ?, stream = ?, grade_12_result = ?, coc_result = ?, cumulative_avg = ?, gender = ?, disability = ?, minority = ?
         WHERE user_id = ?'
    );

    if (!$findUser || !$findUserByIdNumber || !$findUserByUsername || !$findUsernameOwner || !$insertUser || !$updateUser || !$findStudent || !$insertStudent || !$updateStudent) {
        throw new Exception('Unable to prepare student import statements.');
    }

    foreach ($data['students'] as $index => $student) {
        if (!is_array($student)) {
            $skipped[] = ['row' => $index + 2, 'reason' => 'Student row is invalid.'];
            continue;
        }
        $rowNumber = $index + 2;
        $email = trim((string) (getImportField($student, ['email', 'email_address', 'student_email']) ?? ''));
        $username = trim((string) (getImportField($student, ['username', 'login_name']) ?? ''));
        $requestedIdNumber = trim((string) (getImportField($student, ['id_number', 'student_id', 'student_number']) ?? ''));
        $firstName = trim((string) (getImportField($student, ['first_name', 'given_name']) ?? ''));
        $lastName = trim((string) (getImportField($student, ['last_name', 'surname', 'family_name']) ?? ''));
        $phone = trim((string) (getImportField($student, ['phone', 'phone_number', 'mobile']) ?? ''));
        $emailValid = $email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL);

        if ($firstName === '' && $lastName === '' && $username === '' && $requestedIdNumber === '') {
            $skipped[] = ['row' => $index + 2, 'reason' => 'Missing student name, username, or ID number.'];
            continue;
        }

        $existingUser = null;
        if ($requestedIdNumber !== '') {
            $findUserByIdNumber->bind_param('ss', $requestedIdNumber, $requestedIdNumber);
            $findUserByIdNumber->execute();
            $matches = $findUserByIdNumber->get_result();
            if ($matches->num_rows > 1) {
                $skipped[] = ['row' => $index + 2, 'id_number' => $requestedIdNumber, 'reason' => 'Student ID matches multiple accounts.'];
                continue;
            }
            $existingUser = $matches->fetch_assoc() ?: null;
        }

        if (!$existingUser && $username !== '') {
            $findUserByUsername->bind_param('ss', $username, $username);
            $findUserByUsername->execute();
            $matches = $findUserByUsername->get_result();
            if ($matches->num_rows > 1) {
                $skipped[] = ['row' => $index + 2, 'username' => $username, 'reason' => 'Username matches multiple student accounts.'];
                continue;
            }
            $existingUser = $matches->fetch_assoc() ?: null;
        }

        if (!$existingUser && $emailValid) {
            $findUser->bind_param('s', $email);
            $findUser->execute();
            $existingUser = $findUser->get_result()->fetch_assoc() ?: null;
        }

        if ($existingUser && strtolower((string) $existingUser['role']) !== 'student') {
            $skipped[] = [
                'row' => $index + 2,
                'email' => $email,
                'reason' => 'The supplied student ID, username, or email belongs to a non-student account.',
            ];
            continue;
        }
        if (!$existingUser && !$emailValid) {
            $skipped[] = ['row' => $index + 2, 'reason' => 'A valid email is required to create a new student account.'];
            continue;
        }

        if (!$emailValid && $existingUser) {
            $email = trim((string) $existingUser['email']);
        }
        $username = $username !== ''
            ? $username
            : ($existingUser
                ? trim((string) $existingUser['username'])
                : strstr($email, '@', true));
        $findUsernameOwner->bind_param('s', $username);
        $findUsernameOwner->execute();
        $usernameOwner = $findUsernameOwner->get_result()->fetch_assoc();
        if ($usernameOwner && (!$existingUser || (int) $usernameOwner['id'] !== (int) $existingUser['id'])) {
            $skipped[] = [
                'row' => $index + 2,
                'username' => $username,
                'reason' => 'Username is already assigned to a different account.',
            ];
            continue;
        }
        try {
            $gpaValue = parseImportNumber(getImportField($student, ['gpa', 'cgpa', 'cumulative_gpa', 'gpa_4_0']), 'GPA', $rowNumber);
            $grade12Value = parseImportNumber(getImportField($student, ['grade_12_result', 'g12_result', 'grade_12', 'grade12', 'g12']), 'Grade 12 result', $rowNumber);
            $cocValue = parseImportNumber(getImportField($student, ['coc_result', 'coc', 'coc_score']), 'COC result', $rowNumber);
        } catch (InvalidArgumentException $error) {
            $skipped[] = ['row' => $rowNumber, 'reason' => $error->getMessage()];
            continue;
        }
        $gpa = $gpaValue ?? (float) ($existingUser['gpa'] ?? 0);
        $grade12 = $grade12Value ?? (float) ($existingUser['grade_12_result'] ?? 0);
        $coc = $cocValue ?? (float) ($existingUser['coc_result'] ?? 0);
        if ($gpa < 0 || $gpa > 4 || $grade12 < 0 || $grade12 > 100 || $coc < 0 || $coc > 30) {
            $skipped[] = ['row' => $rowNumber, 'reason' => 'Scores are outside their allowed ranges (GPA 0-4, Grade 12 0-100, COC 0-30).'];
            continue;
        }
        $requestedStream = normalizeImportedStream(trim((string) (getImportField($student, ['stream', 'student_stream']) ?? '')));
        if ($requestedStream === null) {
            $skipped[] = [
                'row' => $rowNumber,
                'stream' => trim((string) ($student['stream'] ?? '')),
                'reason' => 'Stream must be Natural Science or Social Science.',
            ];
            continue;
        }
        if ($requestedStream === '' && !$existingUser) {
            $skipped[] = [
                'row' => $rowNumber,
                'reason' => 'A stream is required to create a new student record.',
            ];
            continue;
        }
        $stream = $requestedStream !== ''
            ? $requestedStream
            : trim((string) ($existingUser['stream'] ?? ''));
        $genderInput = getImportField($student, ['gender']);
        $disabilityInput = getImportField($student, ['disability', 'has_disability']);
        $minorityInput = getImportField($student, ['minority', 'is_minority']);
        $gender = trim((string) $genderInput) ?: 'Not specified';
        $disability = trim((string) $disabilityInput) ?: 'No';
        $minority = trim((string) $minorityInput) ?: 'No';
        if ($existingUser) {
            $firstName = $firstName !== '' ? $firstName : trim((string) ($existingUser['first_name'] ?? ''));
            $lastName = $lastName !== '' ? $lastName : trim((string) ($existingUser['last_name'] ?? ''));
            $phone = $phone !== '' ? $phone : trim((string) ($existingUser['phone'] ?? ''));
            $gender = $gender !== 'Not specified' ? $gender : (trim((string) ($existingUser['gender'] ?? '')) ?: 'Not specified');
            $disability = trim((string) $disabilityInput) !== ''
                ? $disability
                : (trim((string) ($existingUser['disability'] ?? '')) ?: 'No');
            $minority = trim((string) $minorityInput) !== ''
                ? $minority
                : (trim((string) ($existingUser['minority'] ?? '')) ?: 'No');
        }
        $cumulativeAvg = calculateImportedCumulativeScore(
            $gpa,
            $grade12,
            $coc,
            $gender,
            $disability,
            $minority,
            $weights
        );

        $idNumber = $existingUser
            ? trim((string) ($existingUser['id_number'] ?? ''))
            : $requestedIdNumber;
        if ($idNumber === '') {
            $idNumber = getNextRoleIdNumber($db, 'student');
        }

        if ($existingUser) {
            $userId = (int) $existingUser['id'];
            $updateUser->bind_param('sssi', $idNumber, $username, $phone, $userId);
            if (!$updateUser->execute()) throw new Exception('Unable to update existing student account.');
        } else {
            $insertUser->bind_param('sssss', $idNumber, $username, $email, $defaultPassword, $phone);
            if (!$insertUser->execute()) throw new Exception('Unable to create student account.');
            $userId = $db->insert_id;
        }

        $findStudent->bind_param('i', $userId);
        $findStudent->execute();
        $studentExists = $findStudent->get_result()->fetch_assoc();

        if ($studentExists) {
            $updateTypes = 'ssssssd' . 's' . 'ddd' . 'sss' . 'i';
            $updateStudent->bind_param($updateTypes, $idNumber, $firstName, $lastName, $username, $email, $phone, $gpa, $stream, $grade12, $coc, $cumulativeAvg, $gender, $disability, $minority, $userId);
            if (!$updateStudent->execute()) throw new Exception('Unable to update existing student data.');
            $updated++;
        } else {
            $insertStudent->bind_param('issssssdsdddsss', $userId, $idNumber, $firstName, $lastName, $username, $email, $phone, $gpa, $stream, $grade12, $coc, $cumulativeAvg, $gender, $disability, $minority);
            if (!$insertStudent->execute()) throw new Exception('Unable to insert student data.');
            $inserted++;
        }
    }

    $db->commit();
    $total = $inserted + $updated;
    $message = "Import complete: {$inserted} new, {$updated} updated, " . count($skipped) . ' skipped.';
    importResponse([
        'success' => true,
        'message' => $message,
        'count' => $total,
        'imported_count' => $total,
        'inserted_count' => $inserted,
        'updated_count' => $updated,
        'skipped_count' => count($skipped),
        'skipped' => $skipped,
    ]);
} catch (Throwable $error) {
    $db->rollback();
    error_log('Student import failed: ' . $error->getMessage());
    importResponse(['success' => false, 'message' => 'Student import failed. No changes were saved.'], 500);
} finally {
    $db->close();
}
?>

<?php
require_once __DIR__ . '/../../config/db_config.php';
setCorsHeaders();
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

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
$adminId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower((string) ($_SESSION['role'] ?? ''));
if ($adminId <= 0 || $role !== 'admin') {
    importResponse(['success' => false, 'message' => 'Only administrators can import student data.'], 403);
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

    $findUser = $db->prepare('SELECT id, role, id_number FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1');
    $insertUser = $db->prepare('INSERT INTO users (id_number, username, email, password, role, phone_number) VALUES (?, ?, ?, ?, \'student\', ?)');
    $updateUser = $db->prepare('UPDATE users SET id_number = ?, username = ?, phone_number = ? WHERE id = ? AND role = \'student\'');
    $findStudent = $db->prepare('SELECT user_id FROM student_data WHERE user_id = ? LIMIT 1');
    $insertStudent = $db->prepare(
        'INSERT INTO student_data
         (user_id, id_number, first_name, last_name, username, email, phone, gpa, stream, grade_12_result, coc_result, gender, disability, minority, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'Pending\')'
    );
    $updateStudent = $db->prepare(
        'UPDATE student_data SET id_number = ?, first_name = ?, last_name = ?, username = ?, email = ?, phone = ?,
         gpa = ?, stream = ?, grade_12_result = ?, coc_result = ?, gender = ?, disability = ?, minority = ?
         WHERE user_id = ?'
    );

    if (!$findUser || !$insertUser || !$updateUser || !$findStudent || !$insertStudent || !$updateStudent) {
        throw new Exception('Unable to prepare student import statements.');
    }

    foreach ($data['students'] as $index => $student) {
        $email = trim((string) ($student['email'] ?? ''));
        $username = trim((string) ($student['username'] ?? ''));
        $firstName = trim((string) ($student['first_name'] ?? ''));
        $lastName = trim((string) ($student['last_name'] ?? ''));
        $phone = trim((string) ($student['phone'] ?? ''));
        $emailValid = filter_var($email, FILTER_VALIDATE_EMAIL);

        if (!$emailValid || ($firstName === '' && $lastName === '' && $username === '')) {
            $skipped[] = ['row' => $index + 2, 'reason' => 'Missing valid email or student name.'];
            continue;
        }

        $username = $username !== '' ? $username : strstr($email, '@', true);
        $gpa = (float) ($student['gpa'] ?? 0);
        $grade12 = (float) ($student['grade_12_result'] ?? 0);
        $coc = (float) ($student['coc_result'] ?? 0);
        $stream = trim((string) ($student['stream'] ?? ''));
        $gender = trim((string) ($student['gender'] ?? 'Not specified')) ?: 'Not specified';
        $disability = trim((string) ($student['disability'] ?? 'No')) ?: 'No';
        $minority = trim((string) ($student['minority'] ?? 'No')) ?: 'No';

        $findUser->bind_param('s', $email);
        $findUser->execute();
        $existingUser = $findUser->get_result()->fetch_assoc();

        if ($existingUser && strtolower((string) $existingUser['role']) !== 'student') {
            $skipped[] = ['row' => $index + 2, 'email' => $email, 'reason' => 'Email belongs to a non-student account.'];
            continue;
        }

        $idNumber = trim((string) ($student['id_number'] ?? ($existingUser['id_number'] ?? '')));
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
            $updateTypes = 'ssssssd' . 's' . 'dd' . 'sss' . 'i';
            $updateStudent->bind_param($updateTypes, $idNumber, $firstName, $lastName, $username, $email, $phone, $gpa, $stream, $grade12, $coc, $gender, $disability, $minority, $userId);
            if (!$updateStudent->execute()) throw new Exception('Unable to update existing student data.');
            $updated++;
        } else {
            $insertStudent->bind_param('issssssdsddsss', $userId, $idNumber, $firstName, $lastName, $username, $email, $phone, $gpa, $stream, $grade12, $coc, $gender, $disability, $minority);
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

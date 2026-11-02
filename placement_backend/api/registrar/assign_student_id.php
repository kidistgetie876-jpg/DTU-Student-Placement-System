<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/id_number.php';

function assignStudentIdRespond(array $payload, int $status = 200): void
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
    assignStudentIdRespond(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$actorId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($actorId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    assignStudentIdRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$input = json_decode((string) file_get_contents('php://input'), true);
$studentDataId = filter_var(
    is_array($input) ? ($input['student_data_id'] ?? null) : null,
    FILTER_VALIDATE_INT,
    ['options' => ['min_range' => 1]]
);
$studentId = trim((string) (is_array($input) ? ($input['student_id'] ?? '') : ''));
if ($studentDataId === false || $studentDataId === null) {
    assignStudentIdRespond(['success' => false, 'message' => 'A valid student record is required.'], 400);
}
if (strlen($studentId) > 50) {
    assignStudentIdRespond(['success' => false, 'message' => 'University Student ID must be 50 characters or fewer.'], 400);
}

$db = null;
try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $current = $db->prepare(
        'SELECT student_id, moe_admission_number, admission_number
         FROM student_data WHERE id = ? LIMIT 1'
    );
    if (!$current) {
        throw new RuntimeException('Unable to prepare student record lookup: ' . $db->error);
    }
    $current->bind_param('i', $studentDataId);
    if (!$current->execute()) {
        throw new RuntimeException('Unable to load student record: ' . $current->error);
    }
    $record = $current->get_result()->fetch_assoc();
    $current->close();
    if (!$record) {
        $db->close();
        assignStudentIdRespond(['success' => false, 'message' => 'Student record was not found.'], 404);
    }

    if ($studentId === '') {
        $studentId = getNextUniversityStudentIdNumber($db);
    }
    if (
        strcasecmp($studentId, (string) ($record['moe_admission_number'] ?? '')) === 0
        || strcasecmp($studentId, (string) ($record['admission_number'] ?? '')) === 0
    ) {
        $db->close();
        assignStudentIdRespond([
            'success' => false,
            'message' => 'University Student ID must differ from the Ministry admission number.',
        ], 400);
    }

    $duplicate = $db->prepare(
        'SELECT id FROM student_data
         WHERE id <> ?
           AND (
                UPPER(TRIM(student_id)) = UPPER(TRIM(?))
                OR UPPER(TRIM(moe_admission_number)) = UPPER(TRIM(?))
                OR UPPER(TRIM(admission_number)) = UPPER(TRIM(?))
           )
         LIMIT 1'
    );
    if (!$duplicate) {
        throw new RuntimeException('Unable to prepare duplicate ID check: ' . $db->error);
    }
    $duplicate->bind_param('isss', $studentDataId, $studentId, $studentId, $studentId);
    if (!$duplicate->execute()) {
        throw new RuntimeException('Unable to check University Student ID: ' . $duplicate->error);
    }
    $duplicateFound = $duplicate->get_result()->num_rows > 0;
    $duplicate->close();
    if ($duplicateFound) {
        $db->close();
        assignStudentIdRespond(['success' => false, 'message' => 'This identifier is already assigned to another student.'], 409);
    }

    $update = $db->prepare('UPDATE student_data SET student_id = ? WHERE id = ? LIMIT 1');
    if (!$update) {
        throw new RuntimeException('Unable to prepare University Student ID assignment: ' . $db->error);
    }
    $update->bind_param('si', $studentId, $studentDataId);
    if (!$update->execute()) {
        if ($update->errno === 1062) {
            $update->close();
            $db->close();
            assignStudentIdRespond(['success' => false, 'message' => 'This University Student ID is already assigned.'], 409);
        }
        throw new RuntimeException('Unable to assign University Student ID: ' . $update->error);
    }
    $update->close();
    $db->close();

    assignStudentIdRespond([
        'success' => true,
        'message' => 'University Student ID assigned successfully.',
        'student_id' => $studentId,
    ]);
} catch (Throwable $error) {
    error_log('University Student ID assignment failed: ' . $error->getMessage());
    if ($db instanceof mysqli) {
        $db->close();
    }
    assignStudentIdRespond(['success' => false, 'message' => 'Unable to assign University Student ID.'], 500);
}

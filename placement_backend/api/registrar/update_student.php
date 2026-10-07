<?php
/**
 * update_student.php
 * Updates a student record in student_data and recalculates the cumulative score.
 */

header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only POST requests are allowed.']);
    $db->close();
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON payload.']);
    $db->close();
    exit;
}

$studentId = isset($data['student_id']) ? (int) $data['student_id'] : (isset($data['id']) ? (int) $data['id'] : 0);

if ($studentId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'student_id is required.']);
    $db->close();
    exit;
}

$email = trim((string) ($data['email'] ?? ''));
if ($email === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email is required.']);
    $db->close();
    exit;
}

$gpa = (float) ($data['gpa'] ?? 0);
$g12Result = (float) ($data['grade_12_result'] ?? 0);
$cocResult = (float) ($data['coc_result'] ?? 0);

$cumulativeScore = ($gpa * 25) + ($g12Result * 0.5) + ($cocResult * 0.25);

$username = $db->real_escape_string((string) ($data['username'] ?? ''));
$firstName = $db->real_escape_string((string) ($data['first_name'] ?? ''));
$lastName = $db->real_escape_string((string) ($data['last_name'] ?? ''));
$phone = $db->real_escape_string((string) ($data['phone'] ?? ''));
$stream = $db->real_escape_string((string) ($data['stream'] ?? ''));
$gender = $db->real_escape_string((string) ($data['gender'] ?? 'Not specified'));
$disability = $db->real_escape_string((string) ($data['disability'] ?? 'No'));
$minority = $db->real_escape_string((string) ($data['minority'] ?? 'No'));
$department = $db->real_escape_string((string) ($data['department'] ?? 'Not assigned'));
$status = $db->real_escape_string((string) ($data['status'] ?? 'Pending'));

$sql = "UPDATE student_data SET
            username = ?,
            email = ?,
            first_name = ?,
            last_name = ?,
            phone = ?,
            gpa = ?,
            stream = ?,
            grade_12_result = ?,
            coc_result = ?,
            cumulative_score = ?,
            gender = ?,
            disability = ?,
            minority = ?,
            department = ?,
            status = ?
        WHERE id = ? LIMIT 1";

$stmt = $db->prepare($sql);

if (!$stmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to prepare update query: ' . $db->error]);
    $db->close();
    exit;
}

$stmt->bind_param(
    'sssssdssssssssi',
    $username,
    $email,
    $firstName,
    $lastName,
    $phone,
    $gpa,
    $stream,
    $g12Result,
    $cocResult,
    $cumulativeScore,
    $gender,
    $disability,
    $minority,
    $department,
    $status,
    $studentId
);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Update failed: ' . $stmt->error]);
    $stmt->close();
    $db->close();
    exit;
}

$stmt->close();
$db->close();

echo json_encode([
    'success' => true,
    'message' => 'Student updated successfully.',
    'student_id' => $studentId,
    'cumulative_score' => round($cumulativeScore, 4)
]);

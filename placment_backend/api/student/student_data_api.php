<?php
// CORS Header
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Allow-Credentials: true");
}
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

include __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

// Return one student for the dashboard when an ID or email is provided.
$studentId = (int) ($_GET['student_id'] ?? 0);
$email = trim((string) ($_GET['email'] ?? ''));
$select = "SELECT student_data.user_id AS id, student_data.user_id, users.id_number, users.first_name, users.last_name, student_data.username, student_data.email, student_data.gpa, student_data.stream, student_data.status, student_data.grade_12_result, student_data.coc_result, student_data.cumulative_avg, student_data.gender, student_data.disability, student_data.minority, student_data.department FROM student_data INNER JOIN users ON users.id = student_data.user_id AND LOWER(users.role) = 'student'";

if ($studentId > 0) {
    $statement = $db->prepare($select . ' WHERE user_id = ? LIMIT 1');
    $statement->bind_param('i', $studentId);
} elseif ($email !== '') {
    $statement = $db->prepare($select . ' WHERE LOWER(email) = LOWER(?) LIMIT 1');
    $statement->bind_param('s', $email);
} else {
    $statement = $db->prepare($select . ' ORDER BY user_id ASC');
}

if (!$statement || !$statement->execute()) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to load student data.']);
    $db->close();
    exit;
}

$students = [];
$result = $statement->get_result();
while ($row = $result->fetch_assoc()) {
    $students[] = $row;
}

$statement->close();
echo json_encode([
    'success' => true,
    'students' => $students,
    'student' => count($students) === 1 ? $students[0] : null,
]);
$db->close();
?>
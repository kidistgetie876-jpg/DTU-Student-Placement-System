<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function notificationResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    notificationResponse(['success' => true]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    notificationResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

$senderId = (int) ($_SESSION['user_id'] ?? 0);
$senderRole = strtolower((string) ($_SESSION['role'] ?? ''));
if ($senderId <= 0 || !in_array($senderRole, ['head', 'hod', 'coordinator'], true)) {
    notificationResponse(['success' => false, 'message' => 'Only department heads can send messages.'], 403);
}

$message = trim((string) ($_POST['message'] ?? ''));
$studentId = isset($_POST['student_id']) && is_numeric($_POST['student_id']) ? (int) $_POST['student_id'] : 0;

if ($studentId <= 0) {
    notificationResponse(['success' => false, 'message' => 'Select a student recipient.'], 400);
}
if ($message === '') {
    notificationResponse(['success' => false, 'message' => 'Enter a message before sending.'], 400);
}
if (strlen($message) > 10000) {
    notificationResponse(['success' => false, 'message' => 'The message is too long.'], 400);
}

$db = getDbConnection();
try {
    $departmentStatement = $db->prepare("SELECT id FROM departments WHERE head_id = ? AND status = 'active' LIMIT 1");
    if (!$departmentStatement) throw new Exception('Unable to load the assigned department.');
    $departmentStatement->bind_param('i', $senderId);
    $departmentStatement->execute();
    $department = $departmentStatement->get_result()->fetch_assoc();
    $departmentStatement->close();

    if (!$department) {
        notificationResponse(['success' => false, 'message' => 'No active department is assigned to this head.'], 403);
    }
    $departmentId = (int) $department['id'];

    $studentStatement = $db->prepare(
        'SELECT pr.student_id
         FROM placement_results pr
         WHERE pr.student_id = ? AND pr.dept_id = ?
         LIMIT 1'
    );
    if (!$studentStatement) throw new Exception('Unable to validate the student recipient.');
    $studentStatement->bind_param('ii', $studentId, $departmentId);
    $studentStatement->execute();
    $student = $studentStatement->get_result()->fetch_assoc();
    $studentStatement->close();

    if (!$student) {
        notificationResponse(['success' => false, 'message' => 'The selected student is not assigned to your department.'], 403);
    }

    $title = 'Message from Department Head';
    $recipientRole = 'student';
    $statement = $db->prepare(
        'INSERT INTO notifications
            (sender_id, sender_role, recipient_id, recipient_role, department_id, title, message)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    if (!$statement) throw new Exception('Unable to prepare the notification.');
    $statement->bind_param('isisiss', $senderId, $senderRole, $studentId, $recipientRole, $departmentId, $title, $message);
    if (!$statement->execute()) throw new Exception('Unable to send the message.');
    $statement->close();

    notificationResponse(['success' => true, 'message' => 'Message sent successfully.']);
} catch (Throwable $error) {
    notificationResponse(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    $db->close();
}
?>
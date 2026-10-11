<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/student_notification_reads.php';

function markAllStudentNotificationsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') markAllStudentNotificationsResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    markAllStudentNotificationsResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$studentId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower((string) ($_SESSION['role'] ?? ''));
if ($studentId <= 0 || $role !== 'student') {
    markAllStudentNotificationsResponse(['success' => false, 'message' => 'Only students can mark their notifications as read.'], 403);
}

$db = getDbConnection();
try {
    ensureStudentNotificationReadsTable($db);
    $statement = $db->prepare(
        "INSERT INTO student_notification_reads (student_id, notification_id)
         SELECT ?, id
         FROM notifications
         WHERE (recipient_id = ? AND recipient_role = 'student')
            OR (recipient_role = 'student' AND recipient_id IS NULL)
         ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP"
    );
    if (!$statement) {
        throw new Exception('Unable to prepare the notification update.');
    }
    $statement->bind_param('ii', $studentId, $studentId);
    if (!$statement->execute()) {
        throw new Exception('Unable to mark notifications as read.');
    }
    $markedRead = $statement->affected_rows;
    $statement->close();

    markAllStudentNotificationsResponse([
        'success' => true,
        'message' => 'All notifications marked as read.',
        'marked_read' => $markedRead,
    ]);
} catch (Throwable $error) {
    error_log('Student mark all notifications read failed: ' . $error->getMessage());
    markAllStudentNotificationsResponse(['success' => false, 'message' => 'Unable to mark notifications as read.'], 500);
} finally {
    $db->close();
}
?>

<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/student_notification_reads.php';

function markStudentNotificationResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') markStudentNotificationResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    markStudentNotificationResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$studentId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower((string) ($_SESSION['role'] ?? ''));
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$notificationId = (int) ($input['notification_id'] ?? 0);
$notificationType = (string) ($input['notification_type'] ?? 'general');
if ($studentId <= 0 || $role !== 'student') {
    markStudentNotificationResponse(['success' => false, 'message' => 'Only students can mark their notifications as read.'], 403);
}
if ($notificationId <= 0 || !in_array($notificationType, ['general', 'meeting'], true)) {
    markStudentNotificationResponse(['success' => false, 'message' => 'A valid notification is required.'], 400);
}

$db = getDbConnection();
try {
    if ($notificationType === 'meeting') {
        $statement = $db->prepare(
            'UPDATE student_notifications SET is_read = 1 WHERE id = ? AND student_id = ?'
        );
        if (!$statement) {
            throw new Exception('Unable to prepare the meeting notification update.');
        }
        $statement->bind_param('ii', $notificationId, $studentId);
        if (!$statement->execute()) {
            throw new Exception('Unable to mark meeting notification as read.');
        }
        $matchedRows = $statement->affected_rows;
        if ($matchedRows === 0) {
            $statement->close();
            $check = $db->prepare('SELECT id FROM student_notifications WHERE id = ? AND student_id = ?');
            if (!$check) {
                throw new Exception('Unable to verify the meeting notification.');
            }
            $check->bind_param('ii', $notificationId, $studentId);
            $check->execute();
            $exists = $check->get_result()->num_rows > 0;
            $check->close();
            if (!$exists) {
                markStudentNotificationResponse(['success' => false, 'message' => 'Notification not found for this student.'], 404);
            }
        }
        $statement->close();
    } else {
        ensureStudentNotificationReadsTable($db);
        $statement = $db->prepare(
            "INSERT INTO student_notification_reads (student_id, notification_id)
             SELECT ?, n.id
             FROM notifications n
             WHERE n.id = ?
               AND ((n.recipient_id = ? AND n.recipient_role = 'student')
                    OR (n.recipient_role = 'student' AND n.recipient_id IS NULL))
             ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP"
        );
        if (!$statement) {
            throw new Exception('Unable to prepare the notification update.');
        }
        $statement->bind_param('iii', $studentId, $notificationId, $studentId);
        if (!$statement->execute()) {
            throw new Exception('Unable to mark notification as read.');
        }
        $matchedRows = $statement->affected_rows;
        $statement->close();

        if ($matchedRows === 0) {
            markStudentNotificationResponse(['success' => false, 'message' => 'Notification not found for this student.'], 404);
        }
    }
    markStudentNotificationResponse(['success' => true, 'message' => 'Notification marked as read.']);
} catch (Throwable $error) {
    error_log('Student mark notification read failed: ' . $error->getMessage());
    markStudentNotificationResponse(['success' => false, 'message' => 'Unable to mark notification as read.'], 500);
} finally {
    $db->close();
}
?>

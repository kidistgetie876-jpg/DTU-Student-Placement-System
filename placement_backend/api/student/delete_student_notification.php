<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
require_once __DIR__ . '/../common/student_placement_notifications.php';
require_once __DIR__ . '/student_notification_reads.php';

function studentDeleteResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function studentDeleteBind(mysqli_stmt $statement, string $types, array &$values): void
{
    $arguments = [$types];
    foreach ($values as &$value) {
        $arguments[] = &$value;
    }
    if (!call_user_func_array([$statement, 'bind_param'], $arguments)) {
        throw new RuntimeException('Unable to bind the notification delete request.');
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') studentDeleteResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') studentDeleteResponse(['success' => false, 'message' => 'Only DELETE requests are allowed.'], 405);
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$studentId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower((string) ($_SESSION['role'] ?? ''));
$notificationId = (int) ($_GET['notification_id'] ?? 0);
$notificationType = strtolower(trim((string) ($_GET['notification_type'] ?? 'general')));
$supportedNotificationTypes = [
    'general',
    'meeting',
    'placement_run',
    'placement_assigned',
    'placement_approved',
    'placement_published',
];

if ($role !== 'student') studentDeleteResponse(['success' => false, 'message' => 'Only students can delete notifications.'], 403);
if ($notificationId <= 0 || !in_array($notificationType, $supportedNotificationTypes, true)) {
    studentDeleteResponse(['success' => false, 'message' => 'A valid notification is required.'], 400);
}

$db = getDbConnection();
try {
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }
    $studentSession = $_SESSION;
    $studentId = resolveStudentSessionUserId($db, $studentSession);
    $admissionNumber = trim((string) ($studentSession['admission_number'] ?? ''));
    if ($studentId > 0 && $admissionNumber === '') {
        $identity = $db->prepare("SELECT id_number FROM users WHERE id = ? AND LOWER(TRIM(role)) = 'student' LIMIT 1");
        if (!$identity) {
            throw new RuntimeException('Unable to prepare student notification identity lookup.');
        }
        $identity->bind_param('i', $studentId);
        if (!$identity->execute()) {
            $identity->close();
            throw new RuntimeException('Unable to resolve student notification identity.');
        }
        $admissionNumber = trim((string) ($identity->get_result()->fetch_assoc()['id_number'] ?? ''));
        $identity->close();
    }
    if (!isStudentNotificationSession($db, $studentSession) || ($studentId <= 0 && $admissionNumber === '')) {
        $db->close();
        studentDeleteResponse(['success' => false, 'message' => 'Student identification is missing. Please log in again.'], 403);
    }

    if ($notificationType === 'general') {
        if ($studentId > 0) {
            $statement = $db->prepare(
                "DELETE FROM notifications
                 WHERE id = ? AND recipient_id = ? AND recipient_role = 'student'"
            );
            if (!$statement) {
                throw new RuntimeException('Unable to prepare the notification delete request.');
            }
            $statement->bind_param('ii', $notificationId, $studentId);
            if (!$statement->execute()) {
                $error = $statement->error;
                $statement->close();
                throw new RuntimeException('Unable to delete notification: ' . $error);
            }
            $deleted = $statement->affected_rows === 1;
            $statement->close();
            if ($deleted) {
                $db->close();
                studentDeleteResponse(['success' => true, 'message' => 'Notification deleted.']);
            }
        }

        $broadcastCheck = $db->prepare(
            "SELECT id FROM notifications
             WHERE id = ? AND recipient_role = 'student' AND recipient_id IS NULL
             LIMIT 1"
        );
        if (!$broadcastCheck) {
            throw new RuntimeException('Unable to verify the notification recipient.');
        }
        $broadcastCheck->bind_param('i', $notificationId);
        if (!$broadcastCheck->execute()) {
            $broadcastCheck->close();
            throw new RuntimeException('Unable to verify the notification recipient.');
        }
        $isBroadcast = $broadcastCheck->get_result()->num_rows === 1;
        $broadcastCheck->close();
        if (!$isBroadcast) {
            $db->close();
            studentDeleteResponse(['success' => false, 'message' => 'Notification not found or it does not belong to this student.'], 404);
        }

        ensureStudentNotificationDismissalsTable($db);
        $dismissal = $db->prepare(
            'INSERT INTO student_notification_dismissals (student_id, admission_number, notification_id)
             VALUES (NULLIF(?, 0), NULLIF(?, \'\'), ?)
             ON DUPLICATE KEY UPDATE dismissed_at = CURRENT_TIMESTAMP'
        );
        if (!$dismissal) {
            throw new RuntimeException('Unable to prepare notification dismissal.');
        }
        $dismissal->bind_param('isi', $studentId, $admissionNumber, $notificationId);
        if (!$dismissal->execute()) {
            $error = $dismissal->error;
            $dismissal->close();
            throw new RuntimeException('Unable to dismiss notification: ' . $error);
        }
        $dismissal->close();
        $db->close();
        studentDeleteResponse(['success' => true, 'message' => 'Notification dismissed.']);
    }

    ensureStudentPlacementNotificationSchema($db);
    $notificationColumns = studentPlacementTableColumns($db, 'student_notifications');
    $ownerConditions = [];
    $values = [$notificationId, $notificationType];
    $types = 'is';
    if ($studentId > 0 && in_array('student_id', $notificationColumns, true)) {
        $ownerConditions[] = 'student_id = ?';
        $values[] = $studentId;
        $types .= 'i';
    }
    if ($admissionNumber !== '' && in_array('admission_number', $notificationColumns, true)) {
        $ownerConditions[] = 'TRIM(admission_number) = TRIM(?)';
        $values[] = $admissionNumber;
        $types .= 's';
    }
    if (!$ownerConditions) {
        $db->close();
        studentDeleteResponse(['success' => false, 'message' => 'Student identification is missing. Please log in again.'], 403);
    }
    $statement = $db->prepare(
        'DELETE FROM student_notifications
         WHERE id = ? AND notification_type = ? AND (' . implode(' OR ', $ownerConditions) . ')'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare the student notification delete request.');
    }
    studentDeleteBind($statement, $types, $values);
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to delete student notification: ' . $error);
    }
    $deleted = $statement->affected_rows === 1;
    $statement->close();
    if (!$deleted) {
        $db->close();
        studentDeleteResponse(['success' => false, 'message' => 'Notification not found or it does not belong to this student.'], 404);
    }
    $db->close();
    studentDeleteResponse(['success' => true, 'message' => 'Notification deleted.']);
} catch (Throwable $error) {
    if ($db instanceof mysqli) {
        $db->close();
    }
    error_log('Student notification delete failed: ' . $error->getMessage());
    studentDeleteResponse(['success' => false, 'message' => 'Unable to delete notification.'], 500);
}
?>
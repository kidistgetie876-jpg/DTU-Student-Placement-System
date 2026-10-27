<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/student_notification_reads.php';

function markStudentNotificationResponse(array $payload, int $status = 200): void
{
    http_response_code(200);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') markStudentNotificationResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    markStudentNotificationResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$notificationId = (int) ($input['notification_id'] ?? 0);
$notificationType = (string) ($input['notification_type'] ?? 'general');
if ($notificationId <= 0 || !in_array($notificationType, ['general', 'meeting'], true)) {
    markStudentNotificationResponse(['success' => false, 'message' => 'A valid notification is required.'], 400);
}

$db = null;
try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }
    $studentSession = $_SESSION;
    $requestStudentId = trim((string) ($input['student_id'] ?? ''));
    $requestAdmissionNumber = trim((string) ($input['admission_number'] ?? ''));
    if (trim((string) ($studentSession['user_id'] ?? '')) === '' && $requestStudentId !== '') {
        $studentSession['user_id'] = $requestStudentId;
    }
    if (trim((string) ($studentSession['admission_number'] ?? '')) === '' && $requestAdmissionNumber !== '') {
        $studentSession['admission_number'] = $requestAdmissionNumber;
    }
    if (trim((string) ($studentSession['admission_number'] ?? '')) === '' && !ctype_digit((string) ($studentSession['user_id'] ?? ''))) {
        $studentSession['admission_number'] = (string) ($studentSession['user_id'] ?? '');
    }
    $studentId = resolveStudentSessionUserId($db, $studentSession);
    $admissionNumber = trim((string) ($studentSession['admission_number'] ?? ''));
    if ($studentId > 0 && $admissionNumber === '') {
        $identity = $db->prepare("SELECT id_number FROM users WHERE id = ? AND LOWER(TRIM(role)) = 'student' LIMIT 1");
        if (!$identity) {
            throw new RuntimeException('Unable to prepare student admission-number lookup.');
        }
        $identity->bind_param('i', $studentId);
        if (!$identity->execute()) {
            $identity->close();
            throw new RuntimeException('Unable to load student admission number.');
        }
        $admissionNumber = trim((string) ($identity->get_result()->fetch_assoc()['id_number'] ?? ''));
        $identity->close();
    }
    $isStudentSession = isStudentNotificationSession($db, $studentSession);
    if (($studentId <= 0 && $admissionNumber === '') || !$isStudentSession
        || ($requestStudentId !== '' && $studentId > 0 && ctype_digit($requestStudentId) && (int) $requestStudentId !== $studentId)
        || ($requestAdmissionNumber !== '' && $admissionNumber !== '' && strcasecmp($requestAdmissionNumber, $admissionNumber) !== 0)) {
        markStudentNotificationResponse(['success' => false, 'message' => 'Only students can mark their notifications as read.'], 403);
    }

    if ($studentId <= 0) {
        if ($notificationType === 'meeting') {
            if (!studentNotificationTableExists($db, 'student_notifications')) {
                markStudentNotificationResponse(['success' => false, 'message' => 'Meeting notifications are unavailable.']);
            }
            ensureStudentMeetingNotificationSchema($db);
            $statement = $db->prepare(
                'UPDATE student_notifications SET is_read = 1 WHERE id = ? AND admission_number = ?'
            );
            if (!$statement) {
                throw new Exception('Unable to prepare the meeting notification update.');
            }
            $statement->bind_param('is', $notificationId, $admissionNumber);
            if (!$statement->execute()) {
                throw new Exception('Unable to mark meeting notification as read.');
            }
            if ($statement->affected_rows === 0) {
                $statement->close();
                $check = $db->prepare(
                    'SELECT id FROM student_notifications WHERE id = ? AND admission_number = ?'
                );
                if (!$check) {
                    throw new Exception('Unable to verify the meeting notification.');
                }
                $check->bind_param('is', $notificationId, $admissionNumber);
                if (!$check->execute()) {
                    $check->close();
                    throw new Exception('Unable to verify the meeting notification.');
                }
                $exists = $check->get_result()->num_rows > 0;
                $check->close();
                if (!$exists) {
                    markStudentNotificationResponse(['success' => false, 'message' => 'Notification not found for this student.'], 404);
                }
            } else {
                $statement->close();
            }
            markStudentNotificationResponse(['success' => true, 'message' => 'Notification marked as read.']);
        }

        if ($notificationType !== 'general') {
            markStudentNotificationResponse(['success' => false, 'message' => 'This notification cannot be marked as read for the current student account.'], 403);
        }
        ensureStudentAdmissionNotificationReadsTable($db);
        $statement = $db->prepare(
            "INSERT INTO student_admission_notification_reads (admission_number, notification_id)
             SELECT ?, n.id
             FROM notifications n
             WHERE n.id = ?
               AND n.recipient_role = 'student'
               AND n.recipient_id IS NULL
             ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP"
        );
        if (!$statement) {
            throw new Exception('Unable to prepare the admission-based notification update.');
        }
        $statement->bind_param('si', $admissionNumber, $notificationId);
        if (!$statement->execute()) {
            throw new Exception('Unable to mark notification as read.');
        }
        $affected = $statement->affected_rows;
        $statement->close();
        if ($affected === 0) {
            markStudentNotificationResponse(['success' => false, 'message' => 'Notification not found for this student.'], 404);
        }
        markStudentNotificationResponse(['success' => true, 'message' => 'Notification marked as read.']);
    }

    if ($notificationType === 'meeting') {
        if (!studentNotificationTableExists($db, 'student_notifications')) {
            markStudentNotificationResponse(['success' => false, 'message' => 'Meeting notifications are unavailable.']);
        }
        ensureStudentMeetingNotificationSchema($db);
        $statement = $db->prepare(
            'UPDATE student_notifications SET is_read = 1 WHERE id = ? AND (student_id = ? OR admission_number = ?)'
        );
        if (!$statement) {
            throw new Exception('Unable to prepare the meeting notification update.');
        }
        $statement->bind_param('iis', $notificationId, $studentId, $admissionNumber);
        if (!$statement->execute()) {
            throw new Exception('Unable to mark meeting notification as read.');
        }
        $matchedRows = $statement->affected_rows;
        if ($matchedRows === 0) {
            $statement->close();
            $check = $db->prepare('SELECT id FROM student_notifications WHERE id = ? AND (student_id = ? OR admission_number = ?)');
            if (!$check) {
                throw new Exception('Unable to verify the meeting notification.');
            }
            $check->bind_param('iis', $notificationId, $studentId, $admissionNumber);
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
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>

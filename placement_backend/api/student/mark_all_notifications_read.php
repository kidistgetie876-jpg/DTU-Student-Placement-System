<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/student_notification_reads.php';

function markAllStudentNotificationsResponse(array $payload, int $status = 200): void
{
    http_response_code(200);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') markAllStudentNotificationsResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    markAllStudentNotificationsResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = [];
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
    $isStudentSession = isStudentNotificationSession($db, $studentSession);
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
    if (!$isStudentSession || ($studentId <= 0 && $admissionNumber === '')
        || ($requestStudentId !== '' && $studentId > 0 && ctype_digit($requestStudentId) && (int) $requestStudentId !== $studentId)
        || ($requestAdmissionNumber !== '' && $admissionNumber !== '' && strcasecmp($requestAdmissionNumber, $admissionNumber) !== 0)) {
        markAllStudentNotificationsResponse(['success' => false, 'message' => 'Only students can mark their notifications as read.'], 403);
    }

    if ($studentId <= 0) {
        ensureStudentAdmissionNotificationReadsTable($db);
        $statement = $db->prepare(
            "INSERT INTO student_admission_notification_reads (admission_number, notification_id)
             SELECT ?, id
             FROM notifications
             WHERE recipient_role = 'student' AND recipient_id IS NULL
             ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP"
        );
        if (!$statement) {
            throw new Exception('Unable to prepare the admission-based notification update.');
        }
        $statement->bind_param('s', $admissionNumber);
        if (!$statement->execute()) {
            throw new Exception('Unable to mark notifications as read.');
        }
        $markedRead = $statement->affected_rows;
        $statement->close();

        if (studentNotificationTableExists($db, 'student_notifications')) {
            ensureStudentMeetingNotificationSchema($db);
            $meetingStatement = $db->prepare(
                'UPDATE student_notifications SET is_read = 1 WHERE admission_number = ? AND is_read = 0'
            );
            if (!$meetingStatement) {
                throw new RuntimeException('Unable to prepare meeting notification read updates.');
            }
            $meetingStatement->bind_param('s', $admissionNumber);
            if (!$meetingStatement->execute()) {
                throw new RuntimeException('Unable to mark meeting notifications as read.');
            }
            $markedRead += $meetingStatement->affected_rows;
            $meetingStatement->close();
        }

        markAllStudentNotificationsResponse([
            'success' => true,
            'message' => 'All notifications marked as read.',
            'marked_read' => $markedRead,
        ]);
    }

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

    if (studentNotificationTableExists($db, 'student_notifications')) {
        ensureStudentMeetingNotificationSchema($db);
        $meetingStatement = $db->prepare(
            'UPDATE student_notifications SET is_read = 1 WHERE (student_id = ? OR admission_number = ?) AND is_read = 0'
        );
        if (!$meetingStatement) {
            throw new Exception('Unable to prepare meeting notification read updates.');
        }
        $meetingStatement->bind_param('is', $studentId, $admissionNumber);
        if (!$meetingStatement->execute()) {
            throw new Exception('Unable to mark meeting notifications as read.');
        }
        $markedRead += $meetingStatement->affected_rows;
        $meetingStatement->close();
    }

    markAllStudentNotificationsResponse([
        'success' => true,
        'message' => 'All notifications marked as read.',
        'marked_read' => $markedRead,
    ]);
} catch (Throwable $error) {
    error_log('Student mark all notifications read failed: ' . $error->getMessage());
    markAllStudentNotificationsResponse(['success' => false, 'message' => 'Unable to mark notifications as read.']);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>

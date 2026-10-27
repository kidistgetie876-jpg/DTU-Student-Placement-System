<?php
header("Access-Control-Allow-Origin: http://localhost:3001");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/student_notification_reads.php';

function studentNotificationsResponse(array $payload, int $status = 200): void
{
    http_response_code(200);
    echo json_encode($payload, JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    studentNotificationsResponse(['success' => true]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET, OPTIONS');
    studentNotificationsResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$db = null;
try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
    $studentSession = $_SESSION;
    $requestStudentId = trim((string) ($_GET['student_id'] ?? ''));
    $requestAdmissionNumber = trim((string) ($_GET['admission_number'] ?? ''));
    if (trim((string) ($studentSession['user_id'] ?? '')) === '' && $requestStudentId !== '') {
        $studentSession['user_id'] = $requestStudentId;
    }
    if (trim((string) ($studentSession['admission_number'] ?? '')) === '' && $requestAdmissionNumber !== '') {
        $studentSession['admission_number'] = $requestAdmissionNumber;
    }
    if ($role === 'student' && trim((string) ($studentSession['admission_number'] ?? '')) === '' && !ctype_digit((string) ($studentSession['user_id'] ?? ''))) {
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

    if (!isStudentNotificationSession($db, $studentSession) || ($studentId <= 0 && $admissionNumber === '')) {
        $db->close();
        studentNotificationsResponse(['success' => false, 'message' => 'Student identification missing. Please login again.'], 401);
    }
    if (($requestStudentId !== '' && $studentId > 0 && ctype_digit($requestStudentId) && (int) $requestStudentId !== $studentId)
        || ($requestAdmissionNumber !== '' && $admissionNumber !== '' && strcasecmp($requestAdmissionNumber, $admissionNumber) !== 0)) {
        $db->close();
        studentNotificationsResponse(['success' => false, 'message' => 'You can only view your own notifications.'], 403);
    }

    $notifications = [];

    if ($studentId > 0) {
        ensureStudentNotificationReadsTable($db);

        $stmt = $db->prepare(
            "SELECT n.id, n.sender_role, n.title, n.message, n.file_path,
                    CASE WHEN notification_reads.notification_id IS NOT NULL THEN 1 ELSE n.is_read END AS is_read,
                    n.created_at
             FROM notifications n
             LEFT JOIN student_notification_reads notification_reads
               ON notification_reads.notification_id = n.id AND notification_reads.student_id = ?
             WHERE (n.recipient_id = ? AND n.recipient_role = 'student')
                OR (n.recipient_role = 'student' AND n.recipient_id IS NULL)
             ORDER BY n.created_at DESC"
        );
        if (!$stmt) {
            throw new RuntimeException('Unable to prepare student notification query.');
        }
        if (!$stmt->bind_param('ii', $studentId, $studentId) || !$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('Unable to load student notifications.');
        }
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $row['notification_type'] = 'general';
            $row['meeting_date'] = null;
            $row['meeting_time'] = null;
            $row['location'] = null;
            $notifications[] = $row;
        }
        $stmt->close();
    } else {
        ensureStudentAdmissionNotificationReadsTable($db);

        $stmt = $db->prepare(
            "SELECT n.id, n.sender_role, n.title, n.message, n.file_path,
                    CASE WHEN admission_reads.notification_id IS NOT NULL THEN 1 ELSE n.is_read END AS is_read,
                    n.created_at
             FROM notifications n
             LEFT JOIN student_admission_notification_reads AS admission_reads
               ON admission_reads.notification_id = n.id AND admission_reads.admission_number = ?
             WHERE n.recipient_role = 'student' AND n.recipient_id IS NULL
             ORDER BY n.created_at DESC"
        );
        if (!$stmt) {
            throw new RuntimeException('Unable to prepare admission-based student notification query.');
        }
        if (!$stmt->bind_param('s', $admissionNumber) || !$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('Unable to load admission-based student notifications.');
        }
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $row['notification_type'] = 'general';
            $row['meeting_date'] = null;
            $row['meeting_time'] = null;
            $row['location'] = null;
            $notifications[] = $row;
        }
        $stmt->close();
    }

    if (($studentId > 0 || $admissionNumber !== '') && studentNotificationTableExists($db, 'student_notifications')) {
        ensureStudentMeetingNotificationSchema($db);

        $meetingStatement = $db->prepare(
            "SELECT id, 'registrar' AS sender_role, title, message, is_read, created_at,
                    meeting_date, meeting_time, location
             FROM student_notifications
             WHERE student_id = ? OR admission_number = ?
             ORDER BY created_at DESC"
        );
        if (!$meetingStatement) {
            throw new RuntimeException('Unable to prepare meeting notification query.');
        }
        $meetingStatement->bind_param('is', $studentId, $admissionNumber);
        if (!$meetingStatement->execute()) {
            $meetingStatement->close();
            throw new RuntimeException('Unable to load meeting notifications.');
        }
        $meetingResult = $meetingStatement->get_result();
        while ($row = $meetingResult->fetch_assoc()) {
            $row['notification_type'] = 'meeting';
            $row['file_path'] = null;
            $notifications[] = $row;
        }
        $meetingStatement->close();
    }

    usort($notifications, static function (array $left, array $right): int {
        return strcmp((string) ($right['created_at'] ?? ''), (string) ($left['created_at'] ?? ''));
    });

    $db->close();
    $db = null;

    studentNotificationsResponse([
        'success' => true,
        'notifications' => $notifications
    ]);

} catch (Throwable $e) {
    error_log('Student notifications request failed: ' . $e->getMessage());
    if ($db instanceof mysqli) {
        $db->close();
    }
    studentNotificationsResponse(['success' => false, 'message' => 'Unable to load student notifications.']);
}
?>
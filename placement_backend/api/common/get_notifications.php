<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../student/student_notification_reads.php';

function notificationsResponse(array $payload, int $status = 200): void
{
    http_response_code(200);
    echo json_encode($payload, JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    notificationsResponse(['success' => true]);
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    notificationsResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$sessionUserId = (string) ($_SESSION['user_id'] ?? '');
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$admissionNumber = trim((string) ($_SESSION['admission_number'] ?? ''));
if ($admissionNumber === '' && $role === 'student' && $sessionUserId !== '' && !ctype_digit($sessionUserId)) {
    $admissionNumber = $sessionUserId;
}

$db = null;
try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $studentSession = $_SESSION;
    if ($role === 'student') {
        $requestStudentId = trim((string) ($_GET['student_id'] ?? ''));
        $requestAdmissionNumber = trim((string) ($_GET['admission_number'] ?? ''));
        if (trim((string) ($studentSession['user_id'] ?? '')) === '' && $requestStudentId !== '') {
            $studentSession['user_id'] = $requestStudentId;
        }
        if (trim((string) ($studentSession['admission_number'] ?? '')) === '' && $requestAdmissionNumber !== '') {
            $studentSession['admission_number'] = $requestAdmissionNumber;
        }
        if (trim((string) ($studentSession['admission_number'] ?? '')) === '' && !ctype_digit((string) ($studentSession['user_id'] ?? ''))) {
            $studentSession['admission_number'] = (string) ($studentSession['user_id'] ?? '');
        }
        $userId = resolveStudentSessionUserId($db, $studentSession);
        $admissionNumber = trim((string) ($studentSession['admission_number'] ?? ''));
        if ($userId > 0 && $admissionNumber === '') {
            $identity = $db->prepare("SELECT id_number FROM users WHERE id = ? AND LOWER(TRIM(role)) = 'student' LIMIT 1");
            if (!$identity) {
                throw new RuntimeException('Unable to prepare student admission-number lookup: ' . $db->error);
            }
            $identity->bind_param('i', $userId);
            if (!$identity->execute()) {
                $identity->close();
                throw new RuntimeException('Unable to load student admission number: ' . $db->error);
            }
            $admissionNumber = trim((string) ($identity->get_result()->fetch_assoc()['id_number'] ?? ''));
            $identity->close();
        }
        if (!isStudentNotificationSession($db, $studentSession)) {
            $db->close();
            $db = null;
            notificationsResponse(['success' => false, 'message' => 'Authentication is required.']);
        }
        if ($requestStudentId !== '' && $userId > 0 && ctype_digit($requestStudentId)
            && (int) $requestStudentId !== $userId) {
            $db->close();
            $db = null;
            notificationsResponse(['success' => false, 'message' => 'You can only view your own notifications.']);
        }
        if ($requestAdmissionNumber !== '' && $admissionNumber !== ''
            && strcasecmp($requestAdmissionNumber, $admissionNumber) !== 0) {
            $db->close();
            $db = null;
            notificationsResponse(['success' => false, 'message' => 'You can only view your own notifications.']);
        }
    } else {
        $userId = ctype_digit($sessionUserId) ? (int) $sessionUserId : 0;
    }
    $hasStudentSession = $role === 'student' && ($userId > 0 || $admissionNumber !== '');
    if (($userId <= 0 && !$hasStudentSession) || !in_array($role, ['admin', 'registrar', 'head', 'hod', 'coordinator', 'student'], true)) {
        $db->close();
        $db = null;
        notificationsResponse(['success' => false, 'message' => 'Authentication is required.']);
    }

    $departmentId = 0;
    if (in_array($role, ['head', 'hod', 'coordinator'], true)) {
        $departmentQuery = $db->prepare("SELECT id FROM departments WHERE head_id = ? AND status = 'active' LIMIT 1");
        if (!$departmentQuery) {
            throw new RuntimeException('Unable to prepare department lookup: ' . $db->error);
        }
        $departmentQuery->bind_param('i', $userId);
        if (!$departmentQuery->execute()) {
            throw new RuntimeException('Unable to find the assigned department: ' . $departmentQuery->error);
        }
        $department = $departmentQuery->get_result()->fetch_assoc();
        $departmentQuery->close();
        $departmentId = (int) ($department['id'] ?? 0);
    }

    $notifications = [];
    if ($role === 'student') {
        if ($userId > 0) {
            ensureStudentNotificationReadsTable($db);
            $query = $db->prepare(
                "SELECT n.id, n.sender_role, n.title, n.message, n.file_path, n.created_at,
                         CASE WHEN notification_reads.notification_id IS NOT NULL THEN 1 ELSE n.is_read END AS is_read,
                         'general' AS notification_type
                 FROM notifications n
                 LEFT JOIN student_notification_reads notification_reads
                    ON notification_reads.notification_id = n.id AND notification_reads.student_id = ?
                 WHERE (n.recipient_id = ? AND n.recipient_role = 'student')
                    OR (n.recipient_role = 'student' AND n.recipient_id IS NULL)
                 ORDER BY created_at DESC, id DESC"
            );
        } else {
            $query = $db->prepare(
                "SELECT id, sender_role, title, message, file_path, created_at, is_read,
                        'general' AS notification_type
                 FROM notifications
                 WHERE recipient_role = 'student' AND recipient_id IS NULL
                 ORDER BY created_at DESC, id DESC"
            );
        }
        if (!$query) {
            throw new RuntimeException('Unable to prepare student notification query: ' . $db->error);
        }
        if ($userId > 0) {
            $query->bind_param('ii', $userId, $userId);
        }
    } elseif (in_array($role, ['head', 'hod', 'coordinator'], true)) {
        $query = $db->prepare(
            "SELECT id, sender_role, title, message, file_path, created_at, is_read, 'general' AS notification_type
             FROM notifications
             WHERE recipient_role = 'head'
               AND (recipient_id = ? OR (department_id = ? OR department_id IS NULL))
             ORDER BY created_at DESC, id DESC"
        );
        if (!$query) {
            throw new RuntimeException('Unable to prepare department head notification query: ' . $db->error);
        }
        $query->bind_param('ii', $userId, $departmentId);
    } else {
        $query = $db->prepare(
            'SELECT id, sender_role, title, message, file_path, created_at, is_read, "general" AS notification_type
             FROM notifications
             WHERE recipient_role = ?
               AND (recipient_id = ? OR recipient_id IS NULL)
             ORDER BY created_at DESC, id DESC'
        );
        if (!$query) {
            throw new RuntimeException('Unable to prepare notification query: ' . $db->error);
        }
        $query->bind_param('si', $role, $userId);
    }

    if (!$query->execute()) {
        throw new RuntimeException('Unable to load notifications: ' . $query->error);
    }
    $result = $query->get_result();
    while ($row = $result->fetch_assoc()) {
        $row['is_read'] = (int) $row['is_read'];
        $notifications[] = $row;
    }
    $query->close();
    if ($role === 'student' && ($userId > 0 || $admissionNumber !== '')
        && studentNotificationTableExists($db, 'student_notifications')) {
        ensureStudentMeetingNotificationSchema($db);
        $meetings = $db->prepare(
            "SELECT id, 'registrar' AS sender_role, title, message, created_at, is_read,
                    'meeting' AS notification_type
             FROM student_notifications
             WHERE student_id = ? OR admission_number = ?
             ORDER BY created_at DESC, id DESC"
        );
        if ($meetings) {
            $meetings->bind_param('is', $userId, $admissionNumber);
            if ($meetings->execute()) {
                $meetingResult = $meetings->get_result();
                while ($row = $meetingResult->fetch_assoc()) {
                    $row['is_read'] = (int) $row['is_read'];
                    $notifications[] = $row;
                }
            }
            $meetings->close();
        }
        usort($notifications, static function (array $left, array $right): int {
            return strcmp((string) $right['created_at'], (string) $left['created_at']);
        });
    }
    $unreadCount = count(array_filter($notifications, static function (array $notification): bool {
        return (int) $notification['is_read'] === 0;
    }));
    $db->close();
    $db = null;
    notificationsResponse([
        'success' => true,
        'notifications' => $notifications,
        'unread_count' => $unreadCount,
    ]);
} catch (Throwable $error) {
    error_log('Dashboard notifications load failed: ' . $error->getMessage());
    if ($db instanceof mysqli) {
        $db->close();
    }
    notificationsResponse(['success' => false, 'message' => 'Unable to load notifications.']);
}

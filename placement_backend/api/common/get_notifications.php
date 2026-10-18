<?php
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../student/student_notification_reads.php';
header('Content-Type: application/json; charset=UTF-8');

function notificationsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    notificationsResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$sessionUserId = (string) ($_SESSION['user_id'] ?? '');
$userId = ctype_digit($sessionUserId) ? (int) $sessionUserId : 0;
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$admissionNumber = trim((string) ($_SESSION['admission_number'] ?? ($role === 'student' ? $sessionUserId : '')));
$hasStudentSession = $role === 'student' && $admissionNumber !== '';
if (($userId <= 0 && !$hasStudentSession) || !in_array($role, ['admin', 'registrar', 'head', 'hod', 'coordinator', 'student'], true)) {
    notificationsResponse(['success' => false, 'message' => 'Authentication is required.'], 401);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    notificationsResponse(['success' => false, 'message' => 'Database connection failed.'], 500);
}

try {
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
                "SELECT n.id, n.sender_role, n.title, n.message, n.created_at,
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
                "SELECT id, sender_role, title, message, created_at, is_read,
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
            "SELECT id, sender_role, title, message, created_at, is_read, 'general' AS notification_type
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
            'SELECT id, sender_role, title, message, created_at, is_read, "general" AS notification_type
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
    if ($role === 'student' && $userId > 0) {
        $meetings = $db->prepare(
            "SELECT id, 'registrar' AS sender_role, title, message, created_at, is_read,
                    'meeting' AS notification_type
             FROM student_notifications
             WHERE student_id = ?
             ORDER BY created_at DESC, id DESC"
        );
        if (!$meetings) {
            throw new RuntimeException('Unable to prepare meeting notification query: ' . $db->error);
        }
        $meetings->bind_param('i', $userId);
        if (!$meetings->execute()) {
            throw new RuntimeException('Unable to load meeting notifications: ' . $meetings->error);
        }
        $meetingResult = $meetings->get_result();
        while ($row = $meetingResult->fetch_assoc()) {
            $row['is_read'] = (int) $row['is_read'];
            $notifications[] = $row;
        }
        $meetings->close();
        usort($notifications, static function (array $left, array $right): int {
            return strcmp((string) $right['created_at'], (string) $left['created_at']);
        });
    }
    $unreadCount = count(array_filter($notifications, static function (array $notification): bool {
        return (int) $notification['is_read'] === 0;
    }));
    $db->close();
    notificationsResponse([
        'success' => true,
        'notifications' => $notifications,
        'unread_count' => $unreadCount,
    ]);
} catch (Throwable $error) {
    error_log('Dashboard notifications load failed: ' . $error->getMessage());
    $db->close();
    notificationsResponse(['success' => false, 'message' => 'Unable to load notifications.'], 500);
}

<?php
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../student/student_notification_reads.php';
header('Content-Type: application/json; charset=UTF-8');

function markNotificationsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    markNotificationsResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['admin', 'registrar', 'head', 'hod', 'coordinator', 'student'], true)) {
    markNotificationsResponse(['success' => false, 'message' => 'Authentication is required.'], 401);
}
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    markNotificationsResponse(['success' => false, 'message' => 'Invalid request payload.'], 400);
}
$markAll = ($input['mark_all'] ?? false) === true;
$notificationId = (int) ($input['notification_id'] ?? 0);
$notificationType = (string) ($input['notification_type'] ?? 'general');
if (!$markAll && ($notificationId <= 0 || !in_array($notificationType, ['general', 'meeting'], true))) {
    markNotificationsResponse(['success' => false, 'message' => 'A valid notification is required.'], 400);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    markNotificationsResponse(['success' => false, 'message' => 'Database connection failed.'], 500);
}

try {
    $headRole = in_array($role, ['head', 'hod', 'coordinator'], true);
    if ($role === 'student') {
        ensureStudentNotificationReadsTable($db);
        if ($markAll || $notificationType === 'general') {
            if ($markAll) {
                $statement = $db->prepare(
                    "INSERT INTO student_notification_reads (student_id, notification_id)
                     SELECT ?, id FROM notifications
                     WHERE (recipient_id = ? AND recipient_role = 'student')
                        OR (recipient_role = 'student' AND recipient_id IS NULL)
                     ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP"
                );
                if (!$statement) {
                    throw new RuntimeException('Unable to prepare student notifications read update: ' . $db->error);
                }
                $statement->bind_param('ii', $userId, $userId);
            } else {
                $statement = $db->prepare(
                    "INSERT INTO student_notification_reads (student_id, notification_id)
                     SELECT ?, id FROM notifications WHERE id = ?
                       AND ((recipient_id = ? AND recipient_role = 'student')
                            OR (recipient_role = 'student' AND recipient_id IS NULL))
                     ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP"
                );
                if (!$statement) {
                    throw new RuntimeException('Unable to prepare student notification read update: ' . $db->error);
                }
                $statement->bind_param('iii', $userId, $notificationId, $userId);
            }
            if (!$statement->execute()) {
                throw new RuntimeException('Unable to mark student notification as read: ' . $statement->error);
            }
            $affected = $statement->affected_rows;
            $statement->close();
            if (!$markAll && $affected === 0) {
                $check = $db->prepare(
                    "SELECT id FROM notifications WHERE id = ?
                       AND ((recipient_id = ? AND recipient_role = 'student')
                            OR (recipient_role = 'student' AND recipient_id IS NULL))"
                );
                if (!$check) {
                    throw new RuntimeException('Unable to verify student notification: ' . $db->error);
                }
                $check->bind_param('ii', $notificationId, $userId);
                $check->execute();
                $exists = $check->get_result()->num_rows > 0;
                $check->close();
                if (!$exists) {
                    $db->close();
                    markNotificationsResponse(['success' => false, 'message' => 'Notification not found.'], 404);
                }
            }
        }

        if ($markAll || $notificationType === 'meeting') {
            if ($markAll) {
                $meeting = $db->prepare('UPDATE student_notifications SET is_read = 1 WHERE student_id = ? AND is_read = 0');
                if (!$meeting) {
                    throw new RuntimeException('Unable to prepare meeting notification update: ' . $db->error);
                }
                $meeting->bind_param('i', $userId);
            } else {
                $meeting = $db->prepare('UPDATE student_notifications SET is_read = 1 WHERE id = ? AND student_id = ?');
                if (!$meeting) {
                    throw new RuntimeException('Unable to prepare meeting notification update: ' . $db->error);
                }
                $meeting->bind_param('ii', $notificationId, $userId);
            }
            if (!$meeting->execute()) {
                throw new RuntimeException('Unable to mark meeting notification as read: ' . $meeting->error);
            }
            $affected = $meeting->affected_rows;
            $meeting->close();
            if (!$markAll && $affected === 0) {
                $check = $db->prepare('SELECT id FROM student_notifications WHERE id = ? AND student_id = ?');
                if (!$check) {
                    throw new RuntimeException('Unable to verify meeting notification: ' . $db->error);
                }
                $check->bind_param('ii', $notificationId, $userId);
                $check->execute();
                $exists = $check->get_result()->num_rows > 0;
                $check->close();
                if (!$exists) {
                    $db->close();
                    markNotificationsResponse(['success' => false, 'message' => 'Notification not found.'], 404);
                }
            }
        }
    } else {
        $departmentId = 0;
        if ($headRole) {
            $department = $db->prepare("SELECT id FROM departments WHERE head_id = ? AND status = 'active' LIMIT 1");
            if (!$department) {
                throw new RuntimeException('Unable to prepare department lookup: ' . $db->error);
            }
            $department->bind_param('i', $userId);
            if (!$department->execute()) {
                throw new RuntimeException('Unable to load assigned department: ' . $department->error);
            }
            $departmentId = (int) ($department->get_result()->fetch_assoc()['id'] ?? 0);
            $department->close();
        }

        if ($markAll) {
            if ($headRole) {
                $statement = $db->prepare(
                    "UPDATE notifications SET is_read = 1
                     WHERE is_read = 0 AND recipient_role = 'head'
                       AND (recipient_id = ? OR department_id = ? OR department_id IS NULL)"
                );
                if (!$statement) {
                    throw new RuntimeException('Unable to prepare head notification read update: ' . $db->error);
                }
                $statement->bind_param('ii', $userId, $departmentId);
            } else {
                $statement = $db->prepare(
                    'UPDATE notifications SET is_read = 1
                     WHERE is_read = 0 AND recipient_role = ? AND (recipient_id = ? OR recipient_id IS NULL)'
                );
                if (!$statement) {
                    throw new RuntimeException('Unable to prepare notification read update: ' . $db->error);
                }
                $statement->bind_param('si', $role, $userId);
            }
        } elseif ($headRole) {
            $statement = $db->prepare(
                "UPDATE notifications SET is_read = 1
                 WHERE id = ? AND recipient_role = 'head'
                   AND (recipient_id = ? OR department_id = ? OR department_id IS NULL)"
            );
            if (!$statement) {
                throw new RuntimeException('Unable to prepare head notification read update: ' . $db->error);
            }
            $statement->bind_param('iii', $notificationId, $userId, $departmentId);
        } else {
            $statement = $db->prepare(
                'UPDATE notifications SET is_read = 1
                 WHERE id = ? AND recipient_role = ? AND (recipient_id = ? OR recipient_id IS NULL)'
            );
            if (!$statement) {
                throw new RuntimeException('Unable to prepare notification read update: ' . $db->error);
            }
            $statement->bind_param('isi', $notificationId, $role, $userId);
        }

        if (!$statement->execute()) {
            throw new RuntimeException('Unable to mark notification as read: ' . $statement->error);
        }
        $affected = $statement->affected_rows;
        $statement->close();
        if (!$markAll && $affected === 0) {
            $db->close();
            markNotificationsResponse(['success' => false, 'message' => 'Notification not found.'], 404);
        }
    }

    $db->close();
    markNotificationsResponse([
        'success' => true,
        'message' => $markAll ? 'All notifications marked as read.' : 'Notification marked as read.',
    ]);
} catch (Throwable $error) {
    error_log('Notification read update failed: ' . $error->getMessage());
    $db->close();
    markNotificationsResponse(['success' => false, 'message' => 'Unable to update notification status.'], 500);
}

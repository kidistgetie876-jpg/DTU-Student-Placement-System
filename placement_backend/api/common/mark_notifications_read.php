<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../student/student_notification_reads.php';
header('Content-Type: application/json; charset=UTF-8');

function markNotificationsResponse(array $payload, int $status = 200): void
{
    http_response_code(200);
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

$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    markNotificationsResponse(['success' => false, 'message' => 'Invalid request payload.'], 400);
}
$db = null;
try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }
    $sessionUser = $_SESSION;
    if ($role === 'student') {
        $requestStudentId = trim((string) ($input['student_id'] ?? ''));
        $requestAdmissionNumber = trim((string) ($input['admission_number'] ?? ''));
        if (trim((string) ($sessionUser['user_id'] ?? '')) === '' && $requestStudentId !== '') {
            $sessionUser['user_id'] = $requestStudentId;
        }
        if (trim((string) ($sessionUser['admission_number'] ?? '')) === '' && $requestAdmissionNumber !== '') {
            $sessionUser['admission_number'] = $requestAdmissionNumber;
        }
        if (trim((string) ($sessionUser['admission_number'] ?? '')) === '' && !ctype_digit((string) ($sessionUser['user_id'] ?? ''))) {
            $sessionUser['admission_number'] = (string) ($sessionUser['user_id'] ?? '');
        }
        $userId = resolveStudentSessionUserId($db, $sessionUser);
        $admissionNumber = trim((string) ($sessionUser['admission_number'] ?? ''));
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
        if (!isStudentNotificationSession($db, $sessionUser)
            || ($userId <= 0 && $admissionNumber === '')
            || ($requestStudentId !== '' && $userId > 0 && ctype_digit($requestStudentId) && (int) $requestStudentId !== $userId)
            || ($requestAdmissionNumber !== '' && $admissionNumber !== '' && strcasecmp($requestAdmissionNumber, $admissionNumber) !== 0)) {
            $db->close();
            $db = null;
            markNotificationsResponse(['success' => false, 'message' => 'Authentication is required.']);
        }
    } else {
        $userId = ctype_digit((string) ($_SESSION['user_id'] ?? '')) ? (int) $_SESSION['user_id'] : 0;
        if ($userId <= 0 || !in_array($role, ['admin', 'registrar', 'head', 'hod', 'coordinator'], true)) {
            $db->close();
            $db = null;
            markNotificationsResponse(['success' => false, 'message' => 'Authentication is required.']);
        }
        $admissionNumber = '';
    }
} catch (Throwable $error) {
    error_log('Dashboard notification identity resolution failed: ' . $error->getMessage());
    if ($db instanceof mysqli) {
        $db->close();
    }
    markNotificationsResponse(['success' => false, 'message' => 'Unable to verify notification access.']);
}
$markAll = ($input['mark_all'] ?? false) === true;
$notificationId = (int) ($input['notification_id'] ?? 0);
$notificationType = (string) ($input['notification_type'] ?? 'general');
if (!$markAll && ($notificationId <= 0 || !in_array($notificationType, ['general', 'meeting'], true))) {
    markNotificationsResponse(['success' => false, 'message' => 'A valid notification is required.'], 400);
}

try {
    $headRole = in_array($role, ['head', 'hod', 'coordinator'], true);
    if ($role === 'student') {
        if ($userId <= 0) {
            if (!$markAll && $notificationType === 'meeting'
                && studentNotificationTableExists($db, 'student_notifications')) {
                ensureStudentMeetingNotificationSchema($db);
                $meeting = $db->prepare(
                    'UPDATE student_notifications SET is_read = 1 WHERE id = ? AND admission_number = ?'
                );
                if (!$meeting) {
                    throw new RuntimeException('Unable to prepare admission-based meeting notification read update: ' . $db->error);
                }
                $meeting->bind_param('is', $notificationId, $admissionNumber);
                if (!$meeting->execute()) {
                    throw new RuntimeException('Unable to mark admission-based meeting notification as read: ' . $meeting->error);
                }
                $affected = $meeting->affected_rows;
                if (!$markAll && $affected === 0) {
                    $meeting->close();
                    $check = $db->prepare(
                        'SELECT id FROM student_notifications WHERE id = ? AND admission_number = ?'
                    );
                    if (!$check) {
                        throw new RuntimeException('Unable to verify admission-based meeting notification: ' . $db->error);
                    }
                    $check->bind_param('is', $notificationId, $admissionNumber);
                    if (!$check->execute()) {
                        $check->close();
                        throw new RuntimeException('Unable to verify admission-based meeting notification: ' . $db->error);
                    }
                    $exists = $check->get_result()->num_rows > 0;
                    $check->close();
                    if (!$exists) {
                        $db->close();
                        markNotificationsResponse(['success' => false, 'message' => 'Notification not found.'], 404);
                    }
                    $meeting->close();
                } else {
                    $meeting->close();
                }
                $db->close();
                markNotificationsResponse([
                    'success' => true,
                    'message' => 'Notification marked as read.',
                    'marked_read' => $affected,
                ]);
            }
            if ($notificationType !== 'general' && !$markAll) {
                $db->close();
                markNotificationsResponse(['success' => false, 'message' => 'This notification cannot be marked as read for the current student account.'], 403);
            }
            ensureStudentAdmissionNotificationReadsTable($db);
            if ($markAll) {
                $statement = $db->prepare(
                    "INSERT INTO student_admission_notification_reads (admission_number, notification_id)
                     SELECT ?, id FROM notifications
                     WHERE recipient_role = 'student' AND recipient_id IS NULL
                     ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP"
                );
                if (!$statement) {
                    throw new RuntimeException('Unable to prepare admission-based notification read update: ' . $db->error);
                }
                $statement->bind_param('s', $admissionNumber);
            } else {
                $statement = $db->prepare(
                    "INSERT INTO student_admission_notification_reads (admission_number, notification_id)
                     SELECT ?, id FROM notifications WHERE id = ?
                       AND recipient_role = 'student' AND recipient_id IS NULL
                     ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP"
                );
                if (!$statement) {
                    throw new RuntimeException('Unable to prepare admission-based notification read update: ' . $db->error);
                }
                $statement->bind_param('si', $admissionNumber, $notificationId);
            }
            if (!$statement->execute()) {
                throw new RuntimeException('Unable to mark admission-based notification as read: ' . $statement->error);
            }
            $affected = $statement->affected_rows;
            $statement->close();
            if ($markAll && studentNotificationTableExists($db, 'student_notifications')) {
                ensureStudentMeetingNotificationSchema($db);
                $meeting = $db->prepare(
                    'UPDATE student_notifications SET is_read = 1 WHERE admission_number = ? AND is_read = 0'
                );
                if (!$meeting) {
                    throw new RuntimeException('Unable to prepare admission-based meeting notification read update: ' . $db->error);
                }
                $meeting->bind_param('s', $admissionNumber);
                if (!$meeting->execute()) {
                    throw new RuntimeException('Unable to mark admission-based meeting notifications as read: ' . $meeting->error);
                }
                $affected += $meeting->affected_rows;
                $meeting->close();
            }
            if (!$markAll && $affected === 0) {
                $db->close();
                markNotificationsResponse(['success' => false, 'message' => 'Notification not found.'], 404);
            }
            $db->close();
            markNotificationsResponse([
                'success' => true,
                'message' => $markAll ? 'All notifications marked as read.' : 'Notification marked as read.',
            ]);
        }
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

        if (($markAll || $notificationType === 'meeting') && studentNotificationTableExists($db, 'student_notifications')) {
            ensureStudentMeetingNotificationSchema($db);
            if ($markAll) {
                $meeting = $db->prepare('UPDATE student_notifications SET is_read = 1 WHERE (student_id = ? OR admission_number = ?) AND is_read = 0');
                if (!$meeting) {
                    throw new RuntimeException('Unable to prepare meeting notification update: ' . $db->error);
                }
                $meeting->bind_param('is', $userId, $admissionNumber);
            } else {
                $meeting = $db->prepare('UPDATE student_notifications SET is_read = 1 WHERE id = ? AND (student_id = ? OR admission_number = ?)');
                if (!$meeting) {
                    throw new RuntimeException('Unable to prepare meeting notification update: ' . $db->error);
                }
                $meeting->bind_param('iis', $notificationId, $userId, $admissionNumber);
            }
            if (!$meeting->execute()) {
                throw new RuntimeException('Unable to mark meeting notification as read: ' . $meeting->error);
            }
            $affected = $meeting->affected_rows;
            $meeting->close();
            if (!$markAll && $affected === 0) {
                $check = $db->prepare('SELECT id FROM student_notifications WHERE id = ? AND (student_id = ? OR admission_number = ?)');
                if (!$check) {
                    throw new RuntimeException('Unable to verify meeting notification: ' . $db->error);
                }
                $check->bind_param('iis', $notificationId, $userId, $admissionNumber);
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
    if ($db instanceof mysqli) {
        $db->close();
    }
    markNotificationsResponse(['success' => false, 'message' => 'Unable to update notification status.']);
}

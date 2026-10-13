<?php
header('Content-Type: application/json');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/student_notification_reads.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only GET requests are allowed.']);
    exit;
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$studentId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower((string) ($_SESSION['role'] ?? ''));
if ($studentId <= 0 || $role !== 'student') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Only students can view their notifications.']);
    exit;
}
if (isset($_GET['student_id']) && (int) $_GET['student_id'] !== $studentId) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'You can only view your own notifications.']);
    exit;
}

$db = getDbConnection();
try {
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
        throw new Exception('Unable to prepare student notifications query.');
    }
    $stmt->bind_param("ii", $studentId, $studentId);
    if (!$stmt->execute()) {
        throw new Exception('Unable to retrieve student notifications.');
    }
    $result = $stmt->get_result();
    
    $notifications = [];
    while ($row = $result->fetch_assoc()) {
        $row['notification_type'] = 'general';
        $row['meeting_date'] = null;
        $row['meeting_time'] = null;
        $row['location'] = null;
        $notifications[] = $row;
    }
    $stmt->close();

    $meetingStatement = $db->prepare(
        "SELECT id, 'registrar' AS sender_role, title, message, is_read, created_at,
                meeting_date, meeting_time, location
         FROM student_notifications
         WHERE student_id = ?
         ORDER BY created_at DESC"
    );
    if (!$meetingStatement) {
        throw new Exception('Unable to prepare meeting notifications query.');
    }
    $meetingStatement->bind_param('i', $studentId);
    if (!$meetingStatement->execute()) {
        throw new Exception('Unable to retrieve meeting notifications.');
    }
    $meetingResult = $meetingStatement->get_result();
    while ($row = $meetingResult->fetch_assoc()) {
        $row['notification_type'] = 'meeting';
        $row['file_path'] = null;
        $notifications[] = $row;
    }
    $meetingStatement->close();
    usort($notifications, static function (array $left, array $right): int {
        return strcmp((string) $right['created_at'], (string) $left['created_at']);
    });

    echo json_encode([
        'success' => true,
        'notifications' => $notifications
    ]);

} catch (Throwable $e) {
    error_log('Student notifications request failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to load student notifications.']);
}

$db->close();
?>
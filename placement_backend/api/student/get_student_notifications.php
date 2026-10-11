<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/student_notification_reads.php';
$db = getDbConnection();

// Get the recipient user ID from the request
$student_id = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;

if ($student_id <= 0) {
    echo json_encode(['success' => false, 'message' => 'Invalid Student ID']);
    exit;
}

try {
    ensureStudentNotificationReadsTable($db);

    // 1. Fetch notifications for this specific student
    // 2. Join with any other relevant info if needed
    // 3. Order by newest first
    $query = "SELECT n.id, n.sender_role, n.title, n.message, n.file_path,
                     CASE WHEN notification_reads.notification_id IS NOT NULL THEN 1 ELSE n.is_read END AS is_read,
                     n.created_at
              FROM notifications n
              LEFT JOIN student_notification_reads notification_reads
                ON notification_reads.notification_id = n.id AND notification_reads.student_id = ?
              WHERE (n.recipient_id = ? AND n.recipient_role = 'student')
                 OR (n.recipient_role = 'student' AND n.recipient_id IS NULL)
              ORDER BY created_at DESC";
              
    $stmt = $db->prepare($query);
    if (!$stmt) {
        throw new Exception('Unable to prepare student notifications query.');
    }
    $stmt->bind_param("ii", $student_id, $student_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $notifications = [];
    while ($row = $result->fetch_assoc()) {
        // Construct a full URL for the file so React can open it
        if (!empty($row['file_path'])) {
            $docRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '';
            $relative = ltrim($row['file_path'], '/');
            $c1 = $docRoot . DIRECTORY_SEPARATOR . 'placment_backend' . DIRECTORY_SEPARATOR . $relative;
            $c2 = $docRoot . DIRECTORY_SEPARATOR . 'placment_backend' . DIRECTORY_SEPARATOR . 'placment_backend' . DIRECTORY_SEPARATOR . $relative;
            if ($docRoot && file_exists($c1)) {
                $row['file_url'] = "http://localhost/placment_backend/" . $relative;
            } elseif ($docRoot && file_exists($c2)) {
                $row['file_url'] = "http://localhost/placment_backend/placment_backend/" . $relative;
            } else {
                $row['file_url'] = "http://localhost/placment_backend/" . $relative;
            }
        }
        $notifications[] = $row;
    }

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
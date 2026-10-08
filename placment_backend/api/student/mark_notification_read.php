<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

$data = json_decode(file_get_contents('php://input'), true);

$notificationId = $data['notification_id'] ?? $data['id'] ?? null;
$studentId      = $data['student_id'] ?? null;
$markAll        = !empty($data['mark_all']) || $notificationId === 'all';

try {
    // 1. "Mark All as Read" ከሆነ የዚህን ተማሪ ኖቲፊኬሽኖች በሙሉ ወደ is_read = 1 መቀየር
    if ($markAll && $studentId) {
        $stmt = $db->prepare("
            UPDATE notifications 
            SET is_read = 1 
            WHERE (recipient_id = ? OR recipient_role = 'student')
        ");
        $stmt->bind_param("i", $studentId);
        $stmt->execute();
        
        echo json_encode(['success' => true, 'message' => 'All notifications marked as read.']);
    } 
    // 2. ነጠላ ኖቲፊኬሽን ከሆነ በ IDው ማደስ
    elseif ($notificationId && is_numeric($notificationId)) {
        $stmt = $db->prepare("UPDATE notifications SET is_read = 1 WHERE id = ?");
        $stmt->bind_param("i", $notificationId);
        $stmt->execute();

        echo json_encode(['success' => true, 'message' => 'Notification marked as read.']);
    } 
    // 3. Fallback: ሁሉንም የተማሪ ኖቲፊኬሽኖች ማደስ
    else {
        $db->query("UPDATE notifications SET is_read = 1 WHERE recipient_role = 'student'");
        echo json_encode(['success' => true, 'message' => 'Notifications updated.']);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database Error: ' . $e->getMessage()]);
} finally {
    $db->close();
}
?>
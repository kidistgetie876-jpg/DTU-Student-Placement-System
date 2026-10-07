<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

require_once __DIR__ . '/db_config.php';
$db = getDbConnection();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $sender_role = $_POST['sender_role'] ?? 'Head';
    $recipient_role = $_POST['recipient_role'] ?? '';
    $message = $_POST['message'] ?? '';
    $dept_id = isset($_POST['dept_id']) ? intval($_POST['dept_id']) : null;
    $student_id = isset($_POST['student_id']) ? intval($_POST['student_id']) : null;
    
    $file_path = null;

    // ፋይል ካለ አፕሎድ ማድረግ
    if (isset($_FILES['report_file'])) {
        $target_dir = "uploads/reports/";
        if (!is_dir($target_dir)) mkdir($target_dir, 0777, true);
        
        $file_name = time() . "_" . basename($_FILES["report_file"]["name"]);
        $target_file = $target_dir . $file_name;
        
        if (move_uploaded_file($_FILES["report_file"]["tmp_name"], $target_file)) {
            $file_path = $target_file;
        }
    }

    $query = "INSERT INTO notifications (student_id, recipient_role, dept_id, sender_role, message, file_path) 
              VALUES (?, ?, ?, ?, ?, ?)";
    
    $stmt = $db->prepare($query);
    $stmt->bind_param("isisss", $student_id, $recipient_role, $dept_id, $sender_role, $message, $file_path);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Message sent successfully!']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to send message: ' . $db->error]);
    }
}
$db->close();
?>
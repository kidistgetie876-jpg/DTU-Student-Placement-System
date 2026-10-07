<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

require_once __DIR__ . '/db_config.php';
$db = getDbConnection();

$dept_id = isset($_GET['dept_id']) ? intval($_GET['dept_id']) : 0;

// ለኃላፊው የመጡ (ከሬጅስትራር) ወይም ለዲፓርትመንቱ የተላኩ መልዕክቶችን መፈለግ
$query = "SELECT * FROM notifications 
          WHERE (recipient_role = 'Head' AND (dept_id = ? OR dept_id IS NULL)) 
          OR (sender_role = 'Head' AND dept_id = ?)
          ORDER BY created_at DESC";

$stmt = $db->prepare($query);
$stmt->bind_param("ii", $dept_id, $dept_id);
$stmt->execute();
$result = $stmt->get_result();

$notifications = [];
while ($row = $result->fetch_assoc()) {
    if ($row['file_path']) {
        $row['file_url'] = "http://localhost/placment_backend/" . $row['file_path'];
    }
    $notifications[] = $row;
}

echo json_encode(['success' => true, 'notifications' => $notifications]);
$db->close();
?>
<?php
// ማንኛውንም የሪአክት ፖርት (3000, 3001...) ይፈቅዳል
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Allow-Credentials: true");
}
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

$input = file_get_contents("php://input");
$data = json_decode($input, true);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $student_id = $data['student_id'] ?? 0;
    $choices = $data['choices'] ?? [];

    if ($student_id == 0 || empty($choices)) {
        echo json_encode(["success" => false, "message" => "Data incomplete."]);
        exit;
    }

    $db->query("DELETE FROM student_choices WHERE student_id = $student_id");

    $successCount = 0;
    foreach ($choices as $choice) {
        $dept_id = (int)$choice['dept_id'];
        $priority = (int)$choice['priority'];
        if ($dept_id > 0) {
            $sql = "INSERT INTO student_choices (student_id, dept_id, priority) VALUES ($student_id, $dept_id, $priority)";
            if ($db->query($sql)) $successCount++;
        }
    }
    echo json_encode(["success" => true, "message" => "Choices saved to database!"]);
    exit;
}
?>
<?php
include __DIR__ . '/../../config/db_config.php'; // ይህ ፋይል የ CORS Header-ን ይይዛል
$db = getDbConnection();

header("Content-Type: application/json");

// የተማሪውን መረጃ በኢሜይል መፈለግ
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['email'])) {
    $email = $db->real_escape_string($_GET['email']);
    
    $sql = "SELECT sd.*, pr.dept_name AS placement_result_department,
                   pr.status AS placement_result_status,
                   pr.final_score AS placement_result_score,
                   pr.choice_rank AS placement_result_choice_rank
            FROM student_data sd
            LEFT JOIN placement_results pr ON pr.student_id = sd.user_id
            WHERE sd.email = '$email'
            ORDER BY pr.placed_at DESC, pr.id DESC
            LIMIT 1";
    $result = $db->query($sql);
    
    if ($result->num_rows > 0) {
        echo json_encode(["success" => true, "student" => $result->fetch_assoc()]);
    } else {
        echo json_encode(["success" => false, "message" => "Student not found"]);
    }
}
$db->close();
?>
<?php
include __DIR__ . '/../../config/db_config.php'; // ይህ ፋይል የ CORS Header-ን ይይዛል
$db = getDbConnection();

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $studentId = (int) ($_GET['student_id'] ?? $_GET['user_id'] ?? 0);
    $email = trim((string) ($_GET['email'] ?? ''));
    $sql = "SELECT sd.*, pr.dept_name AS placement_result_department,
                   pr.status AS placement_result_status,
                   pr.final_score AS placement_result_score,
                   pr.choice_rank AS placement_result_choice_rank
            FROM student_data sd
            LEFT JOIN placement_results pr ON pr.student_id = sd.user_id";

    if ($studentId > 0) {
        $statement = $db->prepare($sql . ' WHERE sd.user_id = ? ORDER BY pr.placed_at DESC, pr.id DESC LIMIT 1');
        if ($statement) {
            $statement->bind_param('i', $studentId);
        }
    } elseif ($email !== '') {
        $statement = $db->prepare($sql . ' WHERE LOWER(sd.email) = LOWER(?) ORDER BY pr.placed_at DESC, pr.id DESC LIMIT 1');
        if ($statement) {
            $statement->bind_param('s', $email);
        }
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'A student_id or email is required.']);
        $db->close();
        exit;
    }

    if (!$statement || !$statement->execute()) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Unable to load student profile.']);
        $db->close();
        exit;
    }

    $student = $statement->get_result()->fetch_assoc();
    $statement->close();
    if ($student) {
        echo json_encode(['success' => true, 'student' => $student]);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Student not found']);
    }
}
$db->close();
?>
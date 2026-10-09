<?php
include __DIR__ . '/../../config/db_config.php'; // ይህ ፋይል የ CORS Header-ን ይይዛል
$db = getDbConnection();

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'GET' && (isset($_GET['email']) || isset($_GET['student_id']))) {
    $studentId = (int) ($_GET['student_id'] ?? 0);
    $email = trim((string) ($_GET['email'] ?? ''));
    if ($studentId > 0) {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $sessionUserId = (int) ($_SESSION['user_id'] ?? 0);
        $sessionRole = strtolower((string) ($_SESSION['role'] ?? ''));
        if (
            $sessionUserId <= 0
            || (!in_array($sessionRole, ['admin', 'registrar'], true)
                && !($sessionRole === 'student' && $sessionUserId === $studentId))
        ) {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "You are not authorized to view this student profile."]);
            $db->close();
            exit;
        }
    }
    $query = "SELECT sd.*, pr.dept_name AS placement_result_department,
                     pr.status AS placement_result_status,
                     pr.final_score AS placement_result_score,
                     pr.choice_rank AS placement_result_choice_rank
              FROM student_data sd
              LEFT JOIN placement_results pr ON pr.student_id = sd.user_id
              WHERE " . ($studentId > 0 ? 'sd.user_id = ?' : 'LOWER(sd.email) = LOWER(?)') . "
              ORDER BY pr.placed_at DESC, pr.id DESC
              LIMIT 1";
    $statement = $db->prepare($query);
    if (!$statement) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Unable to prepare student profile query."]);
        $db->close();
        exit;
    }

    if ($studentId > 0) {
        $statement->bind_param('i', $studentId);
    } else {
        $statement->bind_param('s', $email);
    }
    if (!$statement->execute()) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Unable to load student profile."]);
        $statement->close();
        $db->close();
        exit;
    }
    $result = $statement->get_result();
    if ($result && $result->num_rows > 0) {
        echo json_encode(["success" => true, "student" => $result->fetch_assoc()]);
    } else {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Student not found"]);
    }
    $statement->close();
}
$db->close();
?>
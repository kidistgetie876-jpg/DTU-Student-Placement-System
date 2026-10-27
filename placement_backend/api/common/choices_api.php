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
    $semester = (int) ($data['semester'] ?? 1);
    if (!in_array($semester, [1, 2], true)) {
        $semester = 1;
    }

    if ($student_id == 0 || empty($choices)) {
        echo json_encode(["success" => false, "message" => "Data incomplete."]);
        exit;
    }

    $semesterColumns = $db->query("SHOW COLUMNS FROM student_choices LIKE 'semester'");
    $hasSemesterColumn = $semesterColumns && $semesterColumns->num_rows > 0;
    if ($hasSemesterColumn) {
        $deleteSql = "DELETE FROM student_choices WHERE student_id = ? AND semester = ?";
        $deleteStmt = $db->prepare($deleteSql);
        $deleteStmt->bind_param('ii', $student_id, $semester);
        $deleteStmt->execute();
        $deleteStmt->close();
    } else {
        $db->query("DELETE FROM student_choices WHERE student_id = $student_id");
    }

    $successCount = 0;
    $insertSql = $hasSemesterColumn
        ? "INSERT INTO student_choices (student_id, dept_id, priority, semester) VALUES (?, ?, ?, ?)"
        : "INSERT INTO student_choices (student_id, dept_id, priority) VALUES (?, ?, ?)";
    $insertStmt = $db->prepare($insertSql);

    foreach ($choices as $choice) {
        $dept_id = (int)$choice['dept_id'];
        $priority = (int)$choice['priority'];
        if ($dept_id > 0) {
            if ($hasSemesterColumn) {
                $insertStmt->bind_param('iiii', $student_id, $dept_id, $priority, $semester);
            } else {
                $insertStmt->bind_param('iii', $student_id, $dept_id, $priority);
            }
            if ($insertStmt->execute()) $successCount++;
        }
    }
    $insertStmt->close();
    echo json_encode(["success" => true, "message" => "Choices saved to database!"]);
    exit;
}
?>
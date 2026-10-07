<?php
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Allow-Credentials: true");
}
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

include __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

$input = file_get_contents("php://input");
$data = json_decode($input, true);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $student_id = $data['student_id'] ?? 0;
    $choices = $data['choices'] ?? [];

    if ($student_id == 0 || empty($choices)) {
        echo json_encode(["success" => false, "message" => "ያልተሟላ መረጃ ተልኳል።"]);
        exit;
    }

    $db->query("DELETE FROM student_choices WHERE student_id = $student_id");

    $successCount = 0;
    foreach ($choices as $choice) {
        $dept_id = (int)$choice['dept_id'];
        $priority = (int)$choice['priority'];
        if ($dept_id > 0) {
            // Determine department hierarchy: prefer provided values, otherwise lookup from departments
            $dept_name = '';
            $college_name = '';
            $stream = '';

            if (!empty($choice['dept_name'])) {
                $dept_name = $db->real_escape_string($choice['dept_name']);
            }
            if (!empty($choice['college_name'])) {
                $college_name = $db->real_escape_string($choice['college_name']);
            }
            if (!empty($choice['stream'])) {
                $stream = $db->real_escape_string($choice['stream']);
            }

            if ($dept_name === '' || $college_name === '' || $stream === '') {
                $dq = $db->query("SELECT name, college_name, stream FROM departments WHERE id = $dept_id");
                if ($dq && $dq->num_rows > 0) {
                    $dn = $dq->fetch_assoc();
                    if ($dept_name === '') $dept_name = $db->real_escape_string($dn['name'] ?? '');
                    if ($college_name === '') $college_name = $db->real_escape_string($dn['college_name'] ?? '');
                    if ($stream === '') $stream = $db->real_escape_string($dn['stream'] ?? '');
                }
            }

            $sql = "INSERT INTO student_choices (student_id, dept_id, dept_name, college_name, stream, priority) VALUES ($student_id, $dept_id, '$dept_name', '$college_name', '$stream', $priority)";
            if ($db->query($sql)) $successCount++;
        }
    }
    echo json_encode(["success" => true, "message" => "ምርጫዎችህ በዳታቤዝ ተቀምጠዋል!"]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $sid = (int)$_GET['student_id'];
            $sql = "SELECT sc.dept_id, sc.dept_name, sc.college_name, sc.stream, sc.priority 
                FROM student_choices sc 
                WHERE sc.student_id = $sid ORDER BY priority ASC";
    $result = $db->query($sql);
    $res = [];
    while($row = $result->fetch_assoc()) { $res[] = $row; }
    echo json_encode(["success" => true, "choices" => $res]);
}
?>
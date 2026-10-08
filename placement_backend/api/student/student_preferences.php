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
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Invalid preference data."]);
        exit;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $authenticatedStudentId = (int) ($_SESSION['user_id'] ?? 0);
    $student_id = filter_var($data['student_id'] ?? null, FILTER_VALIDATE_INT);
    $choices = $data['choices'] ?? [];

    if ($authenticatedStudentId <= 0 || (int) $student_id !== $authenticatedStudentId) {
        http_response_code($authenticatedStudentId > 0 ? 403 : 401);
        echo json_encode(["success" => false, "message" => "Please sign in with your student account to submit preferences."]);
        exit;
    }

    if ($student_id === false || $student_id <= 0 || !is_array($choices) || empty($choices)) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "ያልተሟላ መረጃ ተልኳል።"]);
        exit;
    }

    $studentRoleStatement = $db->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
    if (!$studentRoleStatement) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Unable to verify the student account."]);
        exit;
    }
    $studentRoleStatement->bind_param('i', $authenticatedStudentId);
    if (!$studentRoleStatement->execute()) {
        $studentRoleStatement->close();
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Unable to verify the student account."]);
        exit;
    }
    $studentRole = strtolower((string) ($studentRoleStatement->get_result()->fetch_assoc()['role'] ?? ''));
    $studentRoleStatement->close();
    if ($studentRole !== 'student') {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Only student accounts can submit placement preferences."]);
        exit;
    }

    $settingsTable = $db->query(
        "CREATE TABLE IF NOT EXISTS system_settings (
            setting_key VARCHAR(100) PRIMARY KEY,
            setting_value LONGTEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    if (!$settingsTable) {
        http_response_code(503);
        echo json_encode(["success" => false, "message" => "Placement schedule is unavailable. Please contact the Registrar Office."]);
        exit;
    }

    $settingsStatement = $db->prepare('SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1');
    if (!$settingsStatement) {
        http_response_code(503);
        echo json_encode(["success" => false, "message" => "Placement schedule is unavailable. Please contact the Registrar Office."]);
        exit;
    }
    $settingsKey = 'public_portal';
    $settingsStatement->bind_param('s', $settingsKey);
    if (!$settingsStatement->execute()) {
        $settingsStatement->close();
        http_response_code(503);
        echo json_encode(["success" => false, "message" => "Placement schedule is unavailable. Please contact the Registrar Office."]);
        exit;
    }
    $storedSettings = $settingsStatement->get_result()->fetch_assoc();
    $settingsStatement->close();
    $systemSettings = json_decode((string) ($storedSettings['setting_value'] ?? ''), true);
    $schedule = array_merge([
        'submissionStart' => '2026-10-01',
        'submissionDeadline' => '2026-10-11',
    ], is_array($systemSettings['placement'] ?? null) ? $systemSettings['placement'] : []);
    $submissionStart = (string) ($schedule['submissionStart'] ?? '');
    $submissionDeadline = (string) ($schedule['submissionDeadline'] ?? '');
    $validDate = static function (string $value): bool {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return false;
        }
        $date = DateTime::createFromFormat('!Y-m-d', $value);
        $errors = DateTime::getLastErrors();
        return $date !== false
            && (!$errors || ($errors['warning_count'] === 0 && $errors['error_count'] === 0))
            && $date->format('Y-m-d') === $value;
    };
    if (!$validDate($submissionStart) || !$validDate($submissionDeadline) || $submissionStart > $submissionDeadline) {
        http_response_code(503);
        echo json_encode(["success" => false, "message" => "Placement submission dates are not configured correctly. Please contact the Registrar Office."]);
        exit;
    }

    $universityToday = (new DateTimeImmutable('now', new DateTimeZone('Africa/Addis_Ababa')))->format('Y-m-d');
    if ($universityToday < $submissionStart || $universityToday > $submissionDeadline) {
        http_response_code(403);
        $message = $universityToday < $submissionStart
            ? "Preference submission opens on {$submissionStart}."
            : "The preference submission deadline closed on {$submissionDeadline}. New submissions are no longer accepted.";
        echo json_encode(["success" => false, "message" => $message]);
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
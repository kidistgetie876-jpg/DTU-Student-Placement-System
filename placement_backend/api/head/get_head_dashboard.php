<?php
include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only GET requests are allowed']);
    exit;
}

$db = getDbConnection();
$headId = (int) ($_SESSION['user_id'] ?? 0);

if ($headId <= 0) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'You must be logged in as a department head']);
    exit;
}

$sessionRole = strtolower((string) ($_SESSION['role'] ?? ''));
if (!in_array($sessionRole, ['head', 'hod', 'coordinator'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Only department heads can access this dashboard data']);
    exit;
}

try {
    $departmentSql = $db->prepare("SELECT d.id, d.name, d.stream, d.college_name, d.capacity, d.status, d.description, d.head_id, u.username AS head_name FROM departments d LEFT JOIN users u ON u.id = d.head_id WHERE d.head_id = ? AND d.status = 'active' LIMIT 1");
    if (!$departmentSql) throw new Exception('Unable to load assigned department');
    $departmentSql->bind_param('i', $headId);
    $departmentSql->execute();
    $department = $departmentSql->get_result()->fetch_assoc();
    $departmentSql->close();

    if (!$department) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'No active department is assigned to this head']);
        exit;
    }

    $departmentId = (int) $department['id'];
    $assignedSql = $db->prepare("SELECT COUNT(*) AS assigned_students FROM placement_results WHERE dept_id = ? AND status IN ('Pending', 'Approved', 'Published')");
    $pendingSql = $db->prepare("SELECT COUNT(*) AS pending_approvals FROM placement_results WHERE dept_id = ? AND LOWER(status) = 'pending' AND approved_at IS NULL");
    $studentFieldsSql = "SELECT pr.id AS placement_id, pr.student_id, COALESCE(NULLIF(u.id_number, ''), NULLIF(sd.id_number, '')) AS id_number, COALESCE(NULLIF(sd.first_name, ''), u.first_name) AS first_name, COALESCE(NULLIF(sd.last_name, ''), u.last_name) AS last_name, COALESCE(sd.username, u.username) AS username, COALESCE(sd.email, u.email) AS email, sd.gender, sd.gpa, sd.phone, sd.disability, sd.minority, pr.dept_name, pr.final_score, pr.choice_rank, pr.status, pr.placed_at FROM placement_results pr INNER JOIN users u ON u.id = pr.student_id LEFT JOIN student_data sd ON sd.user_id = pr.student_id WHERE pr.dept_id = ?";
    $studentsSql = $db->prepare($studentFieldsSql . " AND LOWER(pr.status) IN ('approved', 'published') ORDER BY pr.final_score DESC, pr.placed_at DESC");
    $pendingStudentsSql = $db->prepare($studentFieldsSql . " AND LOWER(pr.status) = 'pending' AND pr.approved_at IS NULL ORDER BY pr.final_score DESC, pr.placed_at DESC");

    if (!$assignedSql || !$pendingSql || !$studentsSql || !$pendingStudentsSql) throw new Exception('Unable to load department placement data');

    $assignedSql->bind_param('i', $departmentId);
    $assignedSql->execute();
    $assigned = $assignedSql->get_result()->fetch_assoc();
    $assignedSql->close();

    $pendingSql->bind_param('i', $departmentId);
    $pendingSql->execute();
    $pending = $pendingSql->get_result()->fetch_assoc();
    $pendingSql->close();

    $studentsSql->bind_param('i', $departmentId);
    $studentsSql->execute();
    $studentsResult = $studentsSql->get_result();
    $students = [];
    while ($student = $studentsResult->fetch_assoc()) {
        $student['student_id'] = (int) $student['student_id'];
        $student['final_score'] = (float) $student['final_score'];
        $student['choice_rank'] = (int) $student['choice_rank'];
        $students[] = $student;
    }
    $studentsSql->close();

    $pendingStudentsSql->bind_param('i', $departmentId);
    $pendingStudentsSql->execute();
    $pendingStudentsResult = $pendingStudentsSql->get_result();
    $pendingStudents = [];
    while ($student = $pendingStudentsResult->fetch_assoc()) {
        $student['student_id'] = (int) $student['student_id'];
        $student['final_score'] = (float) $student['final_score'];
        $student['choice_rank'] = (int) $student['choice_rank'];
        $pendingStudents[] = $student;
    }
    $pendingStudentsSql->close();

    $department['id'] = $departmentId;
    $department['capacity'] = (int) $department['capacity'];
    $department['assigned'] = (int) ($assigned['assigned_students'] ?? 0);
    $department['available'] = max(0, $department['capacity'] - $department['assigned']);

    echo json_encode([
        'success' => true,
        'department' => $department,
        'students' => $students,
        'pendingStudents' => $pendingStudents,
        'stats' => [
            'totalStudents' => $department['assigned'],
            'placedStudents' => count($students),
            'approvalRequests' => (int) ($pending['pending_approvals'] ?? 0),
            'capacityUsed' => $department['capacity'] > 0 ? round(($department['assigned'] / $department['capacity']) * 100, 1) : 0,
        ],
    ]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $error->getMessage()]);
} finally {
    $db->close();
}
?>

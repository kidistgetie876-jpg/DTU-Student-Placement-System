<?php
include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only GET requests are allowed']);
    exit;
}

$db = getDbConnection();

try {
    $capacityResult = $db->query("SELECT COALESCE(SUM(capacity), 0) AS total_capacity FROM departments WHERE status = 'active'");
    $capacity = $capacityResult->fetch_assoc();

    $usedResult = $db->query("SELECT COUNT(*) AS used_seats FROM placement_results WHERE status IN ('Pending', 'Approved', 'Published')");
    $used = $usedResult->fetch_assoc();

    $approvalResult = $db->query("SELECT AVG(TIMESTAMPDIFF(SECOND, placed_at, approved_at)) / 3600 AS average_approval_hours FROM placement_results WHERE approved_at IS NOT NULL");
    $approval = $approvalResult->fetch_assoc();

    $monthResult = $db->query("SELECT COUNT(*) AS monthly_requests FROM student_appeals WHERE created_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')");
    $month = $monthResult->fetch_assoc();

    $studentsResult = $db->query("SELECT COUNT(*) AS total_students FROM users WHERE role = 'student'");
    $students = $studentsResult->fetch_assoc();

    $pendingResult = $db->query("SELECT COUNT(*) AS pending_appeals FROM student_appeals WHERE status IN ('Received', 'Under Review')");
    $pending = $pendingResult->fetch_assoc();

    $totalCapacity = (int) ($capacity['total_capacity'] ?? 0);
    $usedSeats = (int) ($used['used_seats'] ?? 0);
    $utilization = $totalCapacity > 0 ? round(($usedSeats / $totalCapacity) * 100, 1) : 0;
    $averageApproval = $approval['average_approval_hours'] !== null ? round((float) $approval['average_approval_hours'], 1) : null;

    echo json_encode([
        'success' => true,
        'stats' => [
            'utilization' => $utilization,
            'usedSeats' => $usedSeats,
            'totalCapacity' => $totalCapacity,
            'averageApprovalHours' => $averageApproval,
            'monthlyRequests' => (int) ($month['monthly_requests'] ?? 0),
            'totalStudents' => (int) ($students['total_students'] ?? 0),
            'pendingAppeals' => (int) ($pending['pending_appeals'] ?? 0),
        ],
    ]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $error->getMessage()]);
} finally {
    $db->close();
}
?>

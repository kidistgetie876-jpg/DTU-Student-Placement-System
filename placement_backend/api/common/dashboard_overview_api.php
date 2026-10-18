<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');

/**
 * Dashboard Overview API - Registrar Dashboard Statistics
 * Fetches dynamic data for Overview cards using MySQLi
 * 
 * Returns JSON with:
 * - Total departments count
 * - Registered student accounts count
 * - Placements completed count
 * - Pending approvals count
 */

header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only GET requests are allowed.']);
    exit;
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function countQuery(mysqli $db, string $sql): int
{
    $result = $db->query($sql);
    if (!$result) {
        throw new RuntimeException($db->error);
    }

    $row = $result->fetch_assoc();
    return (int) ($row['total'] ?? 0);
}

try {
    require_once __DIR__ . '/../../config/db_config.php';
    $db = getDbConnection();

    // 1. Count total departments
    $departments = countQuery($db, 'SELECT COUNT(*) AS total FROM departments');

    // 2. Count registered student accounts
    $activeStudents = countQuery($db, "SELECT COUNT(*) AS total FROM users WHERE LOWER(role) = 'student'");

    // 3. Count the student records shown in the Registrar's placed-students modal.
    $placementsCompleted = countQuery($db, "
        SELECT COUNT(*) AS total
        FROM student_data sd
        INNER JOIN users u ON u.id = sd.user_id AND LOWER(u.role) = 'student'
        WHERE LOWER(TRIM(sd.status)) IN ('placed', 'approved', 'published')
    ");

    // 4. Count pending approvals (placement results awaiting approval)
    $pendingApprovals = countQuery($db, "SELECT COUNT(DISTINCT student_id) AS total FROM placement_results WHERE LOWER(status) IN ('pending', 'pending_approval')");

    // 5. Count registered students without an assigned or pending placement
    $unplacedStudents = countQuery($db, "
        SELECT COUNT(*) AS total
        FROM users u
        WHERE LOWER(u.role) = 'student'
          AND NOT EXISTS (
              SELECT 1
              FROM placement_results pr
              WHERE pr.student_id = u.id
                AND LOWER(pr.status) IN ('approved', 'placed', 'published', 'pending', 'pending_approval')
          )
    ");

    // Return successful response
    $db->close();
    respond([
        'success' => true,
        'data' => [
            'departments' => $departments,
            'activeStudents' => $activeStudents,
            'placementsCompleted' => $placementsCompleted,
            'unplacedStudents' => $unplacedStudents,
            'pendingApprovals' => $pendingApprovals,
            'timestamp' => date('c'),
        ],
        'message' => 'Dashboard overview data retrieved successfully.',
    ]);

} catch (Throwable $error) {
    error_log('Dashboard Overview API Error: ' . $error->getMessage());
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
    respond([
        'success' => false,
        'message' => 'Unable to retrieve dashboard overview data.',
        'error' => $error->getMessage(),
    ], 500);
}
?>

<?php
/**
 * Dashboard Overview API - Registrar Dashboard Statistics
 * Fetches dynamic data for Overview cards using PDO
 * 
 * Returns JSON with:
 * - Total departments count
 * - Active verified students count  
 * - Placements completed count
 * - Pending approvals count
 */

 header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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

    // 2. Count active verified students (students with verified profiles)
     $activeStudents = countQuery($db, "SELECT COUNT(*) AS total FROM users WHERE LOWER(role) = 'student'");

    // 3. Count placements completed (approved placements)
     $placementsCompleted = countQuery($db, "SELECT COUNT(DISTINCT student_id) AS total FROM placement_results WHERE LOWER(status) IN ('approved', 'published', 'placed')");

    // 4. Count pending approvals (placement results awaiting approval)
     $pendingApprovals = countQuery($db, "SELECT COUNT(DISTINCT student_id) AS total FROM placement_results WHERE LOWER(status) IN ('pending', 'pending_approval')");

        // 5. Count registered students without an assigned or pending placement
        $unplacedStudents = countQuery($db, "
                SELECT COUNT(DISTINCT u.id) AS total
                FROM users u
                LEFT JOIN placement_results pr ON u.id = pr.student_id
                WHERE LOWER(u.role) = 'student'
                    AND (pr.id IS NULL OR LOWER(pr.status) NOT IN ('approved', 'placed', 'published', 'pending', 'pending_approval'))
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
     ], 500);
}
?>

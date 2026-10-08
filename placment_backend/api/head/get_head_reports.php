<?php
// 1. Error Reporting ማብራት (ስህተቱን ለማየት)
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

try {
    require_once __DIR__ . '/../../config/db_config.php';

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    $headId = (int) ($_SESSION['user_id'] ?? 0);
    $role = strtolower((string) ($_SESSION['role'] ?? ''));
    if ($headId <= 0 || !in_array($role, ['head', 'hod', 'coordinator'], true)) {
        throw new Exception('Only department heads can access reports.');
    }
    
    $db = getDbConnection();
    if (!$db) {
        throw new Exception("Database connection failed.");
    }

    $departmentStatement = $db->prepare("SELECT id FROM departments WHERE head_id = ? AND status = 'active' LIMIT 1");
    if (!$departmentStatement) {
        throw new Exception('Unable to load the assigned department.');
    }
    $departmentStatement->bind_param('i', $headId);
    $departmentStatement->execute();
    $department = $departmentStatement->get_result()->fetch_assoc();
    $departmentStatement->close();

    $departmentId = (int) ($department['id'] ?? 0);
    if ($departmentId <= 0) {
        $assignedDepartmentStatement = $db->prepare(
            "SELECT assigned_dept_id
             FROM users
             WHERE id = ? AND LOWER(role) IN ('head', 'hod', 'coordinator')
             LIMIT 1"
        );
        if (!$assignedDepartmentStatement) {
            throw new Exception('Unable to load the assigned department.');
        }
        $assignedDepartmentStatement->bind_param('i', $headId);
        $assignedDepartmentStatement->execute();
        $assignedDepartment = $assignedDepartmentStatement->get_result()->fetch_assoc();
        $assignedDepartmentStatement->close();
        $departmentId = (int) ($assignedDepartment['assigned_dept_id'] ?? 0);
    }

    $query = "SELECT id, title, message, sender_role, recipient_role, file_path, is_read, created_at,
                     CASE WHEN sender_id = ? AND sender_role IN ('head', 'hod', 'coordinator') THEN 'sent' ELSE 'received' END AS direction
              FROM notifications 
              WHERE (recipient_role = 'head'
                     AND (recipient_id = ? OR department_id = ? OR department_id IS NULL))
                 OR (sender_id = ? AND sender_role IN ('head', 'hod', 'coordinator'))
              ORDER BY created_at DESC, id DESC";
              
    $stmt = $db->prepare($query);
    if (!$stmt) {
        throw new Exception("Prepare failed: " . $db->error);
    }

    $stmt->bind_param("iiii", $headId, $headId, $departmentId, $headId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $reports = [];
    while ($row = $result->fetch_assoc()) {
        if (!empty($row['file_path'])) {
            $row['file_url'] = "http://localhost/placment_backend/" . $row['file_path'];
        }
        $reports[] = $row;
    }

    echo json_encode([
        'success' => true,
        'reports' => $reports
    ]);

} catch (Exception $e) {
    // ስህተት ካለ እዚህ ጋር በJSON ይነግረናል
    http_response_code(500);
    echo json_encode([
        'success' => false, 
        'message' => $e->getMessage()
    ]);
}
?>
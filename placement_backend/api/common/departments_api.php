<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function sendDepartmentsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET, OPTIONS');
    sendDepartmentsResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $columnsResult = $db->query('SHOW COLUMNS FROM departments');
    if (!$columnsResult) {
        throw new RuntimeException($db->error ?: 'Unable to inspect the departments table.');
    }
    $columns = [];
    while ($column = $columnsResult->fetch_assoc()) {
        $columns[(string) $column['Field']] = true;
    }
    $columnsResult->free();

    $firstSemesterOnly = isset($columns['is_first_semester_only'])
        ? 'is_first_semester_only'
        : '0 AS is_first_semester_only';
    $capacity = isset($columns['capacity']) ? 'capacity' : '0 AS capacity';
    $capacityApproved = isset($columns['capacity_approved'])
        ? 'capacity_approved'
        : '0 AS capacity_approved';
    $approvalStatus = isset($columns['approval_status'])
        ? 'approval_status'
        : (isset($columns['capacity_approved'])
            ? "CASE WHEN capacity_approved = 1 THEN 'approved' ELSE 'pending' END AS approval_status"
            : "'pending' AS approval_status");
    $isLocked = isset($columns['is_locked'])
        ? 'is_locked'
        : (isset($columns['capacity_approved'])
            ? 'capacity_approved AS is_locked'
            : '0 AS is_locked');
    $college = trim((string) ($_GET['preference_college'] ?? ''));
    $statusFilter = strtolower(trim((string) ($_GET['status'] ?? ($_GET['active_only'] ?? 'active'))));
    $showAll = in_array($statusFilter, ['all', 'all_status', 'all-status', 'both', 'false', '0'], true);
    $sql = "SELECT id, name, college_name, stream, status, offered_semester,
                   $capacity, $capacityApproved, $approvalStatus, $isLocked, $firstSemesterOnly
            FROM departments";
    if (!$showAll) {
        $sql .= " WHERE LOWER(TRIM(status)) = 'active'";
    }
    if ($college !== '') {
        $sql .= $showAll ? ' WHERE LOWER(TRIM(college_name)) LIKE LOWER(?)' : ' AND LOWER(TRIM(college_name)) LIKE LOWER(?)';
    }
    $sql .= ' ORDER BY name ASC';

    $statement = $db->prepare($sql);
    if (!$statement) {
        throw new RuntimeException('Unable to prepare the department query.');
    }
    if ($college !== '') {
        $collegePattern = '%' . $college . '%';
        $statement->bind_param('s', $collegePattern);
    }
    if (!$statement->execute()) {
        throw new RuntimeException('Unable to fetch active departments.');
    }

    $result = $statement->get_result();
    $departments = [];
    while ($row = $result->fetch_assoc()) {
        $departments[] = $row;
    }

    $result->free();
    $statement->close();
    $db->close();
    sendDepartmentsResponse(['success' => true, 'departments' => $departments]);
} catch (Throwable $error) {
    error_log('Department preference lookup failed: ' . $error->getMessage());
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
    sendDepartmentsResponse([
        'success' => false,
        'message' => 'Unable to load active departments. Please try again.',
    ], 503);
}

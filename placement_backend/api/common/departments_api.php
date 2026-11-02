<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';
require_once __DIR__ . '/../../config/placement_semester.php';
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

function departmentApiColumns(mysqli $database): array
{
    $result = $database->query('SHOW COLUMNS FROM departments');
    if (!$result) {
        throw new RuntimeException($database->error ?: 'Unable to inspect department columns.');
    }

    $columns = [];
    while ($column = $result->fetch_assoc()) {
        $columns[(string) $column['Field']] = true;
    }
    $result->free();
    return $columns;
}

function departmentApiRequireAdmin(mysqli $database): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    $userId = (int) ($_SESSION['user_id'] ?? 0);
    if ($userId <= 0) {
        sendDepartmentsResponse(['success' => false, 'message' => 'Authentication required.'], 401);
    }

    $statement = $database->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
    if (!$statement) {
        throw new RuntimeException($database->error);
    }
    $statement->bind_param('i', $userId);
    if (!$statement->execute()) {
        throw new RuntimeException($statement->error);
    }
    $result = $statement->get_result();
    $actor = $result ? $result->fetch_assoc() : null;
    $statement->close();
    if (strtolower(trim((string) ($actor['role'] ?? ''))) !== 'admin') {
        sendDepartmentsResponse(['success' => false, 'message' => 'Only administrators may manage departments.'], 403);
    }
}

function departmentApiBindValues(mysqli_stmt $statement, string $types, array $values): void
{
    $parameters = [$types];
    foreach ($values as $index => $value) {
        $parameters[] = &$values[$index];
    }
    if (!call_user_func_array([$statement, 'bind_param'], $parameters)) {
        throw new RuntimeException($statement->error ?: 'Unable to bind department values.');
    }
}

function departmentApiNormalizeInput(array $input): array
{
    $name = trim((string) ($input['name'] ?? ''));
    $streamInput = strtolower(trim((string) ($input['stream'] ?? '')));
    if (str_contains($streamInput, 'social')) {
        $stream = 'Social';
    } elseif (str_contains($streamInput, 'natural')) {
        $stream = 'Natural';
    } else {
        sendDepartmentsResponse(['success' => false, 'message' => 'Select a valid department stream.'], 400);
    }
    $collegeInput = strtolower(trim((string) ($input['college_name'] ?? '')));
    $collegeInput = preg_replace('/^(college|school) of\s+/i', '', $collegeInput);
    $collegeInput = preg_replace('/\s+/', ' ', $collegeInput);

    if ($stream === 'Natural') {
        if (in_array($collegeInput, [
            'technology',
            'gafat tech',
            'gafat institute of technology',
            'gefat institute of technology',
            'gafat institute of technology (git)',
        ], true)) {
            $college = 'Gafat Institute of Technology (GIT)';
        } elseif ($collegeInput === 'health science') {
            $college = 'Health Science';
        } elseif (in_array($collegeInput, [
            'other natural science',
            'natural and computational sciences',
            'agriculture and environmental sciences',
            'freshman faculty',
        ], true)) {
            $college = 'Other Natural Science';
        } else {
            sendDepartmentsResponse(['success' => false, 'message' => 'Select a valid Natural Science college.'], 400);
        }
    } else {
        if ($collegeInput === 'law') {
            $college = 'School of Law';
        } elseif (in_array($collegeInput, [
            'other social science',
            'social sciences and humanities',
            'business and economics',
        ], true)) {
            $college = 'Other Social Science';
        } else {
            sendDepartmentsResponse(['success' => false, 'message' => 'Select a valid Social Science college.'], 400);
        }
    }

    if ($name === '' || strlen($name) > 100) {
        sendDepartmentsResponse(['success' => false, 'message' => 'Department name must be between 1 and 100 characters.'], 400);
    }

    $availability = placementDepartmentAvailability([
        'name' => $name,
        'college_name' => $college,
        'stream' => $stream,
    ]);

    return [
        'name' => $name,
        'description' => trim((string) ($input['description'] ?? '')),
        'stream' => $stream,
        'college_name' => $college,
        'college_id' => isset($input['college_id']) && is_numeric($input['college_id'])
            ? (int) $input['college_id']
            : null,
        'placement_group' => $availability['placement_group'],
        'offered_semester' => $availability['offered_semester'],
        'is_first_semester_only' => $availability['is_first_semester_only'],
        'status' => strtolower(trim((string) ($input['status'] ?? 'active'))) === 'inactive' ? 'inactive' : 'active',
    ];
}

try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'POST', 'PUT', 'DELETE'], true)) {
        header('Allow: GET, POST, PUT, DELETE, OPTIONS');
        sendDepartmentsResponse(['success' => false, 'message' => 'Method not allowed.'], 405);
    }
    $columns = departmentApiColumns($db);

    if (in_array($method, ['POST', 'PUT', 'DELETE'], true)) {
        departmentApiRequireAdmin($db);
        $auditActor = getAuditActor($db);
    }

    if ($method === 'DELETE') {
        $rawInput = file_get_contents('php://input');
        $input = is_string($rawInput) ? json_decode($rawInput, true) : null;
        $id = filter_var($_GET['id'] ?? (is_array($input) ? ($input['id'] ?? null) : null), FILTER_VALIDATE_INT);
        if ($id === false || $id === null || $id <= 0) {
            sendDepartmentsResponse(['success' => false, 'message' => 'A valid department ID is required.'], 400);
        }

        $find = $db->prepare('SELECT name FROM departments WHERE id = ? LIMIT 1');
        if (!$find) {
            throw new RuntimeException($db->error);
        }
        $find->bind_param('i', $id);
        if (!$find->execute()) {
            throw new RuntimeException($find->error);
        }
        $department = $find->get_result()->fetch_assoc();
        $find->close();
        if (!$department) {
            sendDepartmentsResponse(['success' => false, 'message' => 'Department not found.'], 404);
        }

        $delete = $db->prepare('DELETE FROM departments WHERE id = ? LIMIT 1');
        if (!$delete) {
            throw new RuntimeException($db->error);
        }
        $delete->bind_param('i', $id);
        if (!$delete->execute()) {
            throw new RuntimeException($delete->error);
        }
        $delete->close();
        logActivity(
            $db,
            $auditActor['id'],
            $auditActor['name'],
            'department.delete',
            'Deleted department ' . (string) $department['name'] . '.'
        );
        sendDepartmentsResponse(['success' => true, 'message' => 'Department deleted successfully.']);
    }

    if ($method === 'POST' || $method === 'PUT') {
        $rawInput = file_get_contents('php://input');
        $input = is_string($rawInput) ? json_decode($rawInput, true) : null;
        if (!is_array($input)) {
            sendDepartmentsResponse(['success' => false, 'message' => 'A valid JSON request body is required.'], 400);
        }
        $department = departmentApiNormalizeInput($input);
        $writableFields = [
            'name',
            'description',
            'stream',
            'college_name',
            'college_id',
            'placement_group',
            'offered_semester',
            'is_first_semester_only',
            'status',
        ];
        $fields = array_values(array_filter($writableFields, static fn ($field) => isset($columns[$field])));
        foreach (['name', 'stream', 'college_name'] as $requiredField) {
            if (!isset($columns[$requiredField])) {
                throw new RuntimeException("The departments table is missing required column {$requiredField}.");
            }
        }

        if ($method === 'POST') {
            $values = array_map(static fn ($field) => $department[$field], $fields);
            $fieldList = implode(', ', $fields);
            $placeholders = implode(', ', array_fill(0, count($fields), '?'));
            $statement = $db->prepare("INSERT INTO departments ({$fieldList}) VALUES ({$placeholders})");
            if (!$statement) {
                throw new RuntimeException($db->error);
            }
            $types = implode('', array_map(static fn ($field) => $field === 'college_id' ? 'i'
                : (in_array($field, ['offered_semester', 'is_first_semester_only'], true) ? 'i' : 's'), $fields));
            departmentApiBindValues($statement, $types, $values);
            if (!$statement->execute()) {
                throw new RuntimeException($statement->error);
            }
            $id = (int) $db->insert_id;
            $statement->close();
            logActivity(
                $db,
                $auditActor['id'],
                $auditActor['name'],
                'department.create',
                "Created department {$department['name']} in {$department['college_name']} ({$department['stream']} stream)."
            );
            sendDepartmentsResponse(['success' => true, 'message' => 'Department created successfully.', 'id' => $id], 201);
        }

        $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
        if ($id === false || $id === null || $id <= 0) {
            sendDepartmentsResponse(['success' => false, 'message' => 'A valid department ID is required.'], 400);
        }
        $find = $db->prepare('SELECT name FROM departments WHERE id = ? LIMIT 1');
        if (!$find) {
            throw new RuntimeException($db->error);
        }
        $find->bind_param('i', $id);
        if (!$find->execute()) {
            throw new RuntimeException($find->error);
        }
        $existingDepartment = $find->get_result()->fetch_assoc();
        $find->close();
        if (!$existingDepartment) {
            sendDepartmentsResponse(['success' => false, 'message' => 'Department not found.'], 404);
        }
        $assignments = implode(', ', array_map(static fn ($field) => "{$field} = ?", $fields));
        $values = array_map(static fn ($field) => $department[$field], $fields);
        $values[] = $id;
        $types = implode('', array_map(static fn ($field) => $field === 'college_id' ? 'i'
            : (in_array($field, ['offered_semester', 'is_first_semester_only'], true) ? 'i' : 's'), $fields)) . 'i';
        $statement = $db->prepare("UPDATE departments SET {$assignments} WHERE id = ? LIMIT 1");
        if (!$statement) {
            throw new RuntimeException($db->error);
        }
        departmentApiBindValues($statement, $types, $values);
        if (!$statement->execute()) {
            throw new RuntimeException($statement->error);
        }
        $affectedRows = $statement->affected_rows;
        $statement->close();
        if ($affectedRows > 0) {
            logActivity(
                $db,
                $auditActor['id'],
                $auditActor['name'],
                'department.update',
                "Updated department {$existingDepartment['name']} to {$department['name']} in {$department['college_name']} ({$department['stream']} stream)."
            );
        }
        sendDepartmentsResponse(['success' => true, 'message' => 'Department updated successfully.']);
    }

    $countResult = $db->query('SELECT COUNT(*) AS total FROM departments');
    if (!$countResult) {
        throw new RuntimeException('Unable to count departments: ' . $db->error);
    }
    $totalDepartments = (int) ($countResult->fetch_assoc()['total'] ?? 0);
    $countResult->free();

    $firstSemesterOnly = isset($columns['is_first_semester_only'])
        ? 'd.is_first_semester_only'
        : '0 AS is_first_semester_only';
    $offeredSemester = isset($columns['offered_semester']) ? 'd.offered_semester' : '2 AS offered_semester';
    $placementGroup = isset($columns['placement_group']) ? 'd.placement_group' : "'' AS placement_group";
    $description = isset($columns['description']) ? 'd.description' : "'' AS description";
    $collegeId = isset($columns['college_id']) ? 'd.college_id' : 'NULL AS college_id';
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
    $hasHeadIdColumn = isset($columns['head_id']);
    $headIdSelect = $hasHeadIdColumn ? 'd.head_id' : 'NULL AS head_id';
    $headNameSelect = $hasHeadIdColumn ? "TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS head_name" : 'NULL AS head_name';
    $headJoin = $hasHeadIdColumn ? ' LEFT JOIN users u ON u.id = d.head_id' : '';
    $college = trim((string) ($_GET['preference_college'] ?? ''));
    $statusFilter = strtolower(trim((string) ($_GET['status'] ?? ($_GET['active_only'] ?? 'active'))));
    $showAll = in_array($statusFilter, ['all', 'all_status', 'all-status', 'both', 'false', '0'], true);
    $sql = "SELECT d.id, d.name, $description, $collegeId, d.college_name, d.stream, d.status, $offeredSemester,
                   $placementGroup,
                   $headIdSelect, $capacity, $capacityApproved, $approvalStatus, $isLocked, $firstSemesterOnly,
                   $headNameSelect
            FROM departments d$headJoin";
    if (!$showAll) {
        $sql .= " WHERE LOWER(TRIM(d.status)) = 'active'";
    }
    if ($college !== '') {
        $sql .= $showAll
            ? ' WHERE LOWER(TRIM(d.college_name)) LIKE LOWER(?)'
            : ' AND LOWER(TRIM(d.college_name)) LIKE LOWER(?)';
    }
    $sql .= ' ORDER BY d.name ASC';

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
    sendDepartmentsResponse([
        'success' => true,
        'departments' => $departments,
        'total_departments' => $totalDepartments,
    ]);
} catch (Throwable $error) {
    error_log('Department API request failed: ' . $error->getMessage());
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
    sendDepartmentsResponse([
        'success' => false,
        'message' => 'Unable to process the department request. Please try again.',
    ], 503);
}

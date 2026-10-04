<?php
header("Access-Control-Allow-Origin: http://localhost:3000");
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

function sendJson(array $payload, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function getDepartmentColumns(mysqli $db): array
{
    $columns = [];
    $result = $db->query('SHOW COLUMNS FROM departments');
    if (!$result) return $columns;
    while ($row = $result->fetch_assoc()) { $columns[] = $row['Field']; }
    return $columns;
}

function normalizeDepartmentField(string $field): ?string
{
    $field = strtolower(trim($field));
    $aliases = [
        'name' => 'name', 'department_name' => 'name', 'dept_name' => 'name',
        'capacity' => 'capacity', 'stream' => 'stream',
        'college_name' => 'college_name', 'college' => 'college_name',
        'description' => 'description', 'status' => 'status', 'head_id' => 'head_id'
    ];
    return $aliases[$field] ?? null;
}

// አዲሱ የስትሪም ማስተካከያ ፋንክሽን (ይህ ነው ቁልፉ)
function fixStreamValue($value) {
    $val = strtolower(trim((string)$value));
    if (strpos($val, 'natural') !== false) return 'Natural';
    if (strpos($val, 'social') !== false) return 'Social';
    return trim((string)$value) !== '' ? trim((string)$value) : $value;
}

function sanitizeDepartmentQueryValue(string $column, $value): array
{
    $value = trim((string) $value);
    if ($value === '') {
        return ['where' => null, 'value' => null, 'type' => null];
    }

    if ($column === 'stream') {
        $value = fixStreamValue($value);
    }

    if (in_array($column, ['capacity', 'head_id'], true) && is_numeric($value)) {
        return ['where' => '=', 'value' => (int) $value, 'type' => 'i'];
    }

    return ['where' => 'LIKE', 'value' => '%' . $value . '%', 'type' => 's'];
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int) $_GET['id'] : null;
        if ($id !== null) {
            $stmt = $db->prepare('SELECT d.id, d.name, d.stream, d.college_name, d.capacity, COALESCE(d.capacity_approved, 1) AS capacity_approved, d.status, d.description, d.head_id, d.created_at, u.username AS head_name FROM departments d LEFT JOIN users u ON d.head_id = u.id WHERE d.id = ? LIMIT 1');
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $result = $stmt->get_result();
            if ($result && $result->num_rows === 1) {
                $department = $result->fetch_assoc();
                if (isset($department['stream'])) {
                    $department['stream'] = fixStreamValue($department['stream']);
                }
                sendJson(['success' => true, 'department' => $department]);
            }
            sendJson(['success' => false, 'message' => 'Department not found.'], 404);
        }

        $filters = [];
        $types = '';
        $values = [];

        foreach ($_GET as $key => $value) {
            if ($key === 'id' || $key === 'limit' || $key === 'offset') {
                continue;
            }

            $column = normalizeDepartmentField($key);
            if ($column === null || $value === '' || $value === null) {
                continue;
            }

            $sanitized = sanitizeDepartmentQueryValue($column, $value);
            if ($sanitized['where'] === null || $sanitized['value'] === null) {
                continue;
            }

            $filters[] = "d.$column " . $sanitized['where'] . " ?";
            $types .= $sanitized['type'];
            $values[] = $sanitized['value'];
        }

        $sql = 'SELECT d.id, d.name, d.stream, d.college_name, d.capacity, COALESCE(d.capacity_approved, 1) AS capacity_approved, d.status, d.description, d.head_id, d.created_at, u.username AS head_name FROM departments d LEFT JOIN users u ON d.head_id = u.id';
        if (!empty($filters)) {
            $sql .= ' WHERE ' . implode(' AND ', $filters);
        }
        $sql .= ' ORDER BY d.college_name ASC, d.name ASC';

        $stmt = $db->prepare($sql);
        if ($stmt && !empty($values)) {
            $stmt->bind_param($types, ...$values);
        }

        $result = $stmt ? $stmt->execute() ? $stmt->get_result() : false : false;
        if ($result === false) {
            sendJson(['success' => false, 'message' => 'Unable to fetch departments.'], 500);
        }

        $departments = [];
        while ($row = $result->fetch_assoc()) {
            if (isset($row['stream'])) {
                $row['stream'] = fixStreamValue($row['stream']);
            }
            $departments[] = $row;
        }
        sendJson(['success' => true, 'departments' => $departments]);
    }

    if ($method === 'POST' || $method === 'PUT' || $method === 'PATCH') {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        $data = is_array($data) ? $data : [];
        
        $id = ($method !== 'POST') ? (isset($_GET['id']) ? (int)$_GET['id'] : (int)($data['id'] ?? 0)) : null;
        if ($method !== 'POST' && $id <= 0) sendJson(['success' => false, 'message' => 'ID is required.'], 400);

        $columns = getDepartmentColumns($db);
        $updates = []; $insertCols = []; $placeholders = []; $types = ''; $values = [];

        foreach ($data as $key => $val) {
            $col = normalizeDepartmentField($key);
            if ($col && in_array($col, $columns) && $col !== 'id') {
                // እዚህ ጋር ስትሪሙን እናስተካክላለን
                if ($col === 'stream') $val = fixStreamValue($val);
                
                if ($method === 'POST') {
                    $insertCols[] = $col; $placeholders[] = '?';
                } else {
                    $updates[] = "$col = ?";
                }
                $types .= (is_numeric($val) && $col !== 'phone') ? 'i' : 's';
                $values[] = $val;
            }
        }

        if ($method === 'POST') {
            $sql = "INSERT INTO departments (" . implode(',', $insertCols) . ") VALUES (" . implode(',', $placeholders) . ")";
        } else {
            $sql = "UPDATE departments SET " . implode(',', $updates) . " WHERE id = ?";
            $types .= 'i'; $values[] = $id;
        }

        $stmt = $db->prepare($sql);
        $stmt->bind_param($types, ...$values);

        if ($stmt->execute()) {
            sendJson(['success' => true, 'message' => 'Success', 'id' => $id ?? $db->insert_id]);
        }
        sendJson(['success' => false, 'message' => $db->error], 500);
    }

    if ($method === 'DELETE') {
        $id = (int)$_GET['id'];
        $stmt = $db->prepare('DELETE FROM departments WHERE id = ? LIMIT 1');
        $stmt->bind_param('i', $id);
        if ($stmt->execute()) sendJson(['success' => true]);
        sendJson(['success' => false, 'message' => 'Failed'], 500);
    }

} catch (Exception $e) {
    sendJson(['success' => false, 'message' => $e->getMessage()], 500);
}
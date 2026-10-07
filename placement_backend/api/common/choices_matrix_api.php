<?php
declare(strict_types=1);

/**
 * choices_matrix_api.php
 *
 * Professional API for managing a student's department choice matrix.
 * It keeps compatibility with the existing project structure and the
 * student_choices table already used by the placement workflow.
 *
 * Supported methods:
 *   - GET     /choices_matrix_api.php?student_id=123
 *   - POST    /choices_matrix_api.php
 *   - PUT     /choices_matrix_api.php
 *   - PATCH   /choices_matrix_api.php
 *   - DELETE  /choices_matrix_api.php?id=12
 *
 * Example payload:
 * {
 *   "student_id": 12,
 *   "choices": [
 *     {"dept_id": 3, "priority": 1},
 *     {"dept_id": 7, "priority": 2}
 *   ]
 * }
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (isset($_SERVER['HTTP_ORIGIN'])) {
    $origin = $_SERVER['HTTP_ORIGIN'];
    $allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    ];

    if (in_array($origin, $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';

$db = getDbConnection();

function sendJson(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function readJsonBody(): array
{
    $rawInput = file_get_contents('php://input');
    if ($rawInput === false || trim($rawInput) === '') {
        return [];
    }

    $decoded = json_decode($rawInput, true);
    return is_array($decoded) ? $decoded : [];
}

function tableExists(mysqli $db, string $tableName): bool
{
    $stmt = $db->prepare('SHOW TABLES LIKE ?');
    $stmt->bind_param('s', $tableName);
    $stmt->execute();
    $result = $stmt->get_result();
    return $result && $result->num_rows > 0;
}

function getDepartmentInfo(mysqli $db, int $deptId): array
{
    $stmt = $db->prepare('SELECT id, name, college_name, stream, capacity, status FROM departments WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $deptId);
    $stmt->execute();
    $result = $stmt->get_result();
    return $result && $result->num_rows > 0 ? $result->fetch_assoc() : [];
}

function normalizeChoiceRow(array $row): array
{
    $studentId = isset($row['student_id']) && is_numeric($row['student_id']) ? (int) $row['student_id'] : 0;
    $deptId = isset($row['dept_id']) && is_numeric($row['dept_id']) ? (int) $row['dept_id'] : 0;
    $priority = isset($row['priority']) && is_numeric($row['priority']) ? (int) $row['priority'] : 0;

    return [
        'id' => isset($row['id']) && is_numeric($row['id']) ? (int) $row['id'] : null,
        'student_id' => $studentId,
        'dept_id' => $deptId,
        'priority' => $priority,
        'dept_name' => trim((string) ($row['dept_name'] ?? $row['department_name'] ?? '')),
        'college_name' => trim((string) ($row['college_name'] ?? '')),
        'stream' => trim((string) ($row['stream'] ?? '')),
        'status' => $row['status'] ?? null,
    ];
}

function fetchChoiceMatrix(mysqli $db, ?int $studentId = null): array
{
    $sql = "SELECT sc.id, sc.student_id, sc.dept_id, sc.priority, sc.dept_name, sc.college_name, sc.stream,
                   d.name AS department_name, d.capacity, d.status
            FROM student_choices sc
            LEFT JOIN departments d ON d.id = sc.dept_id";

    $params = [];
    $types = '';

    if ($studentId !== null) {
        $sql .= ' WHERE sc.student_id = ?';
        $params[] = $studentId;
        $types .= 'i';
    }

    $sql .= ' ORDER BY sc.student_id ASC, sc.priority ASC';

    $stmt = $db->prepare($sql);
    if ($studentId !== null) {
        $stmt->bind_param($types, ...$params);
    }

    $stmt->execute();
    $result = $stmt->get_result();

    $matrix = [];
    while ($row = $result->fetch_assoc()) {
        $matrix[] = normalizeChoiceRow($row);
    }

    return $matrix;
}

function validateChoicePayload(array $choice): array
{
    $clean = [];

    if (isset($choice['id']) && is_numeric($choice['id'])) {
        $clean['id'] = (int) $choice['id'];
    }

    if (isset($choice['student_id']) && is_numeric($choice['student_id'])) {
        $clean['student_id'] = (int) $choice['student_id'];
    }

    if (isset($choice['dept_id']) && is_numeric($choice['dept_id'])) {
        $clean['dept_id'] = (int) $choice['dept_id'];
    } elseif (isset($choice['department_id']) && is_numeric($choice['department_id'])) {
        $clean['dept_id'] = (int) $choice['department_id'];
    }

    if (isset($choice['priority']) && is_numeric($choice['priority'])) {
        $clean['priority'] = (int) $choice['priority'];
    }

    if (isset($choice['dept_name'])) {
        $clean['dept_name'] = trim((string) $choice['dept_name']);
    }

    if (isset($choice['department_name'])) {
        $clean['dept_name'] = trim((string) $choice['department_name']);
    }

    if (isset($choice['college_name'])) {
        $clean['college_name'] = trim((string) $choice['college_name']);
    }

    if (isset($choice['stream'])) {
        $clean['stream'] = trim((string) $choice['stream']);
    }

    return $clean;
}

function saveStudentChoiceMatrix(mysqli $db, int $studentId, array $choices): array
{
    if ($studentId <= 0) {
        throw new InvalidArgumentException('A valid student_id is required.');
    }

    if (!is_array($choices) || count($choices) === 0) {
        throw new InvalidArgumentException('At least one choice is required.');
    }

    $db->begin_transaction();

    try {
        $deleteStmt = $db->prepare('DELETE FROM student_choices WHERE student_id = ?');
        $deleteStmt->bind_param('i', $studentId);
        $deleteStmt->execute();

        $insertSql = 'INSERT INTO student_choices (student_id, dept_id, dept_name, college_name, stream, priority) VALUES (?, ?, ?, ?, ?, ?)';
        $insertStmt = $db->prepare($insertSql);

        $inserted = [];
        foreach ($choices as $index => $choice) {
            $normalized = validateChoicePayload(is_array($choice) ? $choice : []);
            $deptId = $normalized['dept_id'] ?? 0;

            if ($deptId <= 0) {
                throw new InvalidArgumentException('Each choice must include a valid dept_id.');
            }

            $priority = $normalized['priority'] ?? ($index + 1);
            $deptInfo = getDepartmentInfo($db, $deptId);
            $deptName = trim((string) ($normalized['dept_name'] ?? $deptInfo['name'] ?? ''));
            $collegeName = trim((string) ($normalized['college_name'] ?? $deptInfo['college_name'] ?? ''));
            $stream = trim((string) ($normalized['stream'] ?? $deptInfo['stream'] ?? ''));

            $insertStmt->bind_param('iisssi', $studentId, $deptId, $deptName, $collegeName, $stream, $priority);
            $insertStmt->execute();

            $inserted[] = [
                'student_id' => $studentId,
                'dept_id' => $deptId,
                'priority' => $priority,
                'dept_name' => $deptName,
                'college_name' => $collegeName,
                'stream' => $stream,
            ];
        }

        $db->commit();
        return $inserted;
    } catch (Throwable $e) {
        $db->rollback();
        throw $e;
    }
}

try {
    if (!tableExists($db, 'student_choices')) {
        sendJson([
            'success' => false,
            'message' => 'The student_choices table does not exist in the database.',
        ], 500);
    }

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $studentId = isset($_GET['student_id']) && is_numeric($_GET['student_id']) ? (int) $_GET['student_id'] : null;
        $matrix = fetchChoiceMatrix($db, $studentId);

        sendJson([
            'success' => true,
            'count' => count($matrix),
            'student_id' => $studentId,
            'choices' => $matrix,
        ]);
    }

    if ($method === 'POST') {
        $payload = readJsonBody();
        $studentId = isset($payload['student_id']) && is_numeric($payload['student_id']) ? (int) $payload['student_id'] : 0;
        $choices = $payload['choices'] ?? $payload;

        if ($studentId <= 0) {
            sendJson(['success' => false, 'message' => 'student_id is required.'], 400);
        }

        if (!is_array($choices) || count($choices) === 0) {
            sendJson(['success' => false, 'message' => 'A valid choices array is required.'], 400);
        }

        $saved = saveStudentChoiceMatrix($db, $studentId, $choices);

        sendJson([
            'success' => true,
            'message' => 'Choice matrix saved successfully.',
            'student_id' => $studentId,
            'saved' => $saved,
        ], 201);
    }

    if ($method === 'PUT' || $method === 'PATCH') {
        $payload = readJsonBody();
        $id = isset($payload['id']) && is_numeric($payload['id']) ? (int) $payload['id'] : 0;
        $studentId = isset($payload['student_id']) && is_numeric($payload['student_id']) ? (int) $payload['student_id'] : 0;

        if ($id <= 0 && $studentId <= 0) {
            sendJson(['success' => false, 'message' => 'Either id or student_id is required.'], 400);
        }

        $choice = validateChoicePayload($payload);
        if (($choice['dept_id'] ?? 0) <= 0) {
            sendJson(['success' => false, 'message' => 'A valid dept_id is required.'], 400);
        }

        if (!isset($choice['priority']) && !isset($payload['priority'])) {
            $choice['priority'] = 1;
        }

        $updateColumns = [];
        $types = '';
        $values = [];

        foreach ($choice as $column => $value) {
            if ($column === 'id' || $column === 'student_id') {
                continue;
            }

            $updateColumns[] = $column . ' = ?';
            $values[] = $value;
            $types .= is_int($value) ? 'i' : 's';
        }

        if (count($updateColumns) === 0) {
            sendJson(['success' => false, 'message' => 'No fields were provided to update.'], 400);
        }

        if ($id > 0) {
            $values[] = $id;
            $types .= 'i';
            $sql = 'UPDATE student_choices SET ' . implode(', ', $updateColumns) . ' WHERE id = ? LIMIT 1';
        } else {
            $values[] = $studentId;
            $types .= 'i';
            $sql = 'UPDATE student_choices SET ' . implode(', ', $updateColumns) . ' WHERE student_id = ? LIMIT 1';
        }

        $stmt = $db->prepare($sql);
        $bindParams = [&$types];
        foreach ($values as $index => $value) {
            $bindParams[] = &$values[$index];
        }
        call_user_func_array([$stmt, 'bind_param'], $bindParams);

        if ($stmt->execute()) {
            $affectedRows = $stmt->affected_rows;
            if ($affectedRows > 0) {
                sendJson(['success' => true, 'message' => 'Choice updated successfully.']);
            }

            sendJson(['success' => false, 'message' => 'No matching choice was found to update.'], 404);
        }

        sendJson(['success' => false, 'message' => $db->error], 500);
    }

    if ($method === 'DELETE') {
        $id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int) $_GET['id'] : 0;
        $studentId = isset($_GET['student_id']) && is_numeric($_GET['student_id']) ? (int) $_GET['student_id'] : 0;

        if ($id <= 0 && $studentId <= 0) {
            sendJson(['success' => false, 'message' => 'Either id or student_id is required for deletion.'], 400);
        }

        if ($id > 0) {
            $stmt = $db->prepare('DELETE FROM student_choices WHERE id = ? LIMIT 1');
            $stmt->bind_param('i', $id);
        } else {
            $stmt = $db->prepare('DELETE FROM student_choices WHERE student_id = ?');
            $stmt->bind_param('i', $studentId);
        }

        if ($stmt->execute()) {
            if ($stmt->affected_rows > 0) {
                sendJson(['success' => true, 'message' => 'Choice(s) deleted successfully.']);
            }

            sendJson(['success' => false, 'message' => 'No matching choice(s) were found.'], 404);
        }

        sendJson(['success' => false, 'message' => $db->error], 500);
    }

    sendJson(['success' => false, 'message' => 'Method not allowed.'], 405);
} catch (Throwable $e) {
    $message = $e->getMessage();
    sendJson([
        'success' => false,
        'message' => $message,
    ], 500);
}

<?php
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function manualAssignmentRespond(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function normalizeStreamKey(string $stream): string
{
    $normalized = strtolower(trim((string) $stream));
    $normalized = preg_replace('/[^a-z]/i', '', $normalized) ?? '';
    $normalized = preg_replace('/sciences$/', 'science', $normalized) ?? $normalized;
    return $normalized;
}

function getStudentStreamCategory(string $stream): ?string
{
    $normalized = normalizeStreamKey($stream);
    if (in_array($normalized, ['natural', 'naturalscience'], true)) {
        return 'natural';
    }
    if (in_array($normalized, ['social', 'socialscience'], true)) {
        return 'social';
    }
    return null;
}

function getDepartmentStreamCategory(array $department): ?string
{
    $stream = normalizeStreamKey($department['stream'] ?? '');
    if (strpos($stream, 'natural') !== false) {
        return 'natural';
    }
    if (strpos($stream, 'social') !== false || strpos($stream, 'humanit') !== false) {
        return 'social';
    }

    $name = strtolower((string) ($department['name'] ?? ''));
    $college = strtolower((string) ($department['college_name'] ?? ''));
    if (
        strpos($college, 'business') !== false ||
        strpos($college, 'economics') !== false ||
        strpos($college, 'social') !== false ||
        strpos($college, 'humanit') !== false ||
        strpos($college, 'law') !== false ||
        strpos($college, 'educ') !== false ||
        strpos($name, 'history') !== false ||
        strpos($name, 'english') !== false ||
        strpos($name, 'psychology') !== false ||
        strpos($name, 'social') !== false ||
        strpos($name, 'law') !== false ||
        strpos($name, 'education') !== false
    ) {
        return 'social';
    }
    if (
        strpos($college, 'natural') !== false ||
        strpos($college, 'computational') !== false ||
        strpos($college, 'environment') !== false ||
        strpos($college, 'agric') !== false ||
        strpos($college, 'engineer') !== false ||
        preg_match('/biology|chemistry|physics|mathematics|computer|statistics|agricultur|engineering/', $name)
    ) {
        return 'natural';
    }
    return null;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
if (!isset($_SESSION['user_id']) || !in_array(strtolower((string) ($_SESSION['role'] ?? '')), ['registrar', 'admin'], true)) {
    manualAssignmentRespond(['success' => false, 'message' => 'Registrar access is required'], 403);
}

$db = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'] ?? '';

try {
    if ($method === 'GET') {
        $studentId = filter_var($_GET['student_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($studentId === false) {
            manualAssignmentRespond(['success' => false, 'message' => 'A valid student_id is required'], 400);
        }

        $studentQuery = $db->prepare(
            "SELECT stream FROM unassigned_students
             WHERE student_id = ? AND status = 'Not assigned'
             LIMIT 1"
        );
        if (!$studentQuery) {
            throw new RuntimeException('Unable to prepare unassigned student lookup: ' . $db->error);
        }
        $studentQuery->bind_param('i', $studentId);
        if (!$studentQuery->execute()) {
            throw new RuntimeException('Unable to load the selected student: ' . $studentQuery->error);
        }
        $student = $studentQuery->get_result()->fetch_assoc();
        $studentQuery->close();
        if (!$student) {
            manualAssignmentRespond(['success' => false, 'message' => 'The selected student is not currently unassigned'], 404);
        }

        $studentCategory = getStudentStreamCategory((string) $student['stream']);
        if ($studentCategory === null) {
            manualAssignmentRespond(['success' => false, 'message' => 'The student stream is missing or unsupported'], 422);
        }

        $departmentResult = $db->query(
            "SELECT d.id, d.name, d.stream, d.college_name, d.capacity,
                    COUNT(pr.id) AS assigned
             FROM departments d
             LEFT JOIN placement_results pr
               ON pr.dept_id = d.id
              AND (pr.status IS NULL OR pr.status NOT IN ('Rejected', 'Cancelled'))
             WHERE d.status = 'active'
             GROUP BY d.id, d.name, d.stream, d.college_name, d.capacity
             ORDER BY d.college_name, d.name"
        );
        if (!$departmentResult) {
            throw new RuntimeException('Unable to load department capacities: ' . $db->error);
        }

        $departments = [];
        while ($department = $departmentResult->fetch_assoc()) {
            $available = max(0, (int) $department['capacity'] - (int) $department['assigned']);
            if ($available < 1 || getDepartmentStreamCategory($department) !== $studentCategory) {
                continue;
            }
            $departments[] = [
                'id' => (int) $department['id'],
                'name' => (string) $department['name'],
                'stream' => (string) $department['stream'],
                'college' => (string) $department['college_name'],
                'capacity' => (int) $department['capacity'],
                'assigned' => (int) $department['assigned'],
                'available' => $available,
            ];
        }
        manualAssignmentRespond(['success' => true, 'departments' => $departments]);
    }

    if ($method !== 'POST') {
        header('Allow: GET, POST');
        manualAssignmentRespond(['success' => false, 'message' => 'Only GET and POST requests are allowed'], 405);
    }

    $input = json_decode((string) file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($input)) {
        manualAssignmentRespond(['success' => false, 'message' => 'Request body must be valid JSON'], 400);
    }
    $studentId = filter_var($input['student_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $departmentId = filter_var($input['department_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $departmentName = trim((string) ($input['department_name'] ?? ''));
    if ($studentId === false || ($departmentId === false && $departmentName === '')) {
        manualAssignmentRespond(['success' => false, 'message' => 'A valid student_id and department_id or department_name are required'], 400);
    }

    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start manual assignment transaction: ' . $db->error);
    }

    $departmentSql = $departmentId !== false
        ? $db->prepare("SELECT id, name, stream, college_name, capacity FROM departments WHERE id = ? AND status = 'active' FOR UPDATE")
        : $db->prepare("SELECT id, name, stream, college_name, capacity FROM departments WHERE name = ? AND status = 'active' FOR UPDATE");
    if (!$departmentSql) {
        throw new RuntimeException('Unable to prepare department lookup: ' . $db->error);
    }
    if ($departmentId !== false) {
        $departmentSql->bind_param('i', $departmentId);
    } else {
        $departmentSql->bind_param('s', $departmentName);
    }
    if (!$departmentSql->execute()) {
        throw new RuntimeException('Unable to load the selected department: ' . $departmentSql->error);
    }
    $department = $departmentSql->get_result()->fetch_assoc();
    $departmentSql->close();
    if (!$department) {
        $db->rollback();
        manualAssignmentRespond(['success' => false, 'message' => 'The selected department is not active or does not exist'], 404);
    }

    $studentSql = $db->prepare(
        "SELECT u.student_id, u.id_number, u.full_name, u.email, u.stream,
                sd.gender, sd.cumulative_avg
         FROM unassigned_students u
         INNER JOIN student_data sd ON sd.user_id = u.student_id
         WHERE u.student_id = ? AND u.status = 'Not assigned'
         LIMIT 1 FOR UPDATE"
    );
    if (!$studentSql) {
        throw new RuntimeException('Unable to prepare student lookup: ' . $db->error);
    }
    $studentSql->bind_param('i', $studentId);
    if (!$studentSql->execute()) {
        throw new RuntimeException('Unable to load the selected student: ' . $studentSql->error);
    }
    $student = $studentSql->get_result()->fetch_assoc();
    $studentSql->close();
    if (!$student) {
        $db->rollback();
        manualAssignmentRespond(['success' => false, 'message' => 'The selected student is no longer unassigned'], 409);
    }
    if (getStudentStreamCategory((string) $student['stream']) !== getDepartmentStreamCategory($department)) {
        $db->rollback();
        manualAssignmentRespond(['success' => false, 'message' => 'The selected department does not match the student stream'], 422);
    }

    $existingSql = $db->prepare(
        "SELECT id FROM placement_results
         WHERE student_id = ? AND (status IS NULL OR status NOT IN ('Rejected', 'Cancelled'))
         LIMIT 1 FOR UPDATE"
    );
    if (!$existingSql) {
        throw new RuntimeException('Unable to prepare existing placement check: ' . $db->error);
    }
    $existingSql->bind_param('i', $studentId);
    if (!$existingSql->execute()) {
        throw new RuntimeException('Unable to check existing placement: ' . $existingSql->error);
    }
    $existingPlacement = $existingSql->get_result()->fetch_assoc();
    $existingSql->close();
    if ($existingPlacement) {
        $db->rollback();
        manualAssignmentRespond(['success' => false, 'message' => 'The student already has an active placement'], 409);
    }

    $occupancySql = $db->prepare(
        "SELECT COUNT(*) AS assigned
         FROM placement_results
         WHERE dept_id = ? AND (status IS NULL OR status NOT IN ('Rejected', 'Cancelled'))"
    );
    if (!$occupancySql) {
        throw new RuntimeException('Unable to prepare department capacity check: ' . $db->error);
    }
    $selectedDepartmentId = (int) $department['id'];
    $occupancySql->bind_param('i', $selectedDepartmentId);
    if (!$occupancySql->execute()) {
        throw new RuntimeException('Unable to check department capacity: ' . $occupancySql->error);
    }
    $occupancy = $occupancySql->get_result()->fetch_assoc();
    $occupancySql->close();
    if ((int) ($occupancy['assigned'] ?? 0) >= (int) $department['capacity']) {
        $db->rollback();
        manualAssignmentRespond(['success' => false, 'message' => 'The selected department no longer has available seats'], 409);
    }

    $idNumber = (string) $student['id_number'];
    $studentName = (string) $student['full_name'];
    $studentStream = (string) $student['stream'];
    $collegeName = (string) $department['college_name'];
    $finalScore = is_numeric($student['cumulative_avg'] ?? null) ? (float) $student['cumulative_avg'] : 0.0;
    $choiceRank = 0;
    $insert = $db->prepare(
        "INSERT INTO placement_results
            (student_id, id_number, dept_id, dept_name, stream, college_name, final_score, choice_rank, status, placed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', NOW())"
    );
    if (!$insert) {
        throw new RuntimeException('Unable to prepare manual placement: ' . $db->error);
    }
    $insert->bind_param(
        'isisssdi',
        $studentId,
        $idNumber,
        $selectedDepartmentId,
        $department['name'],
        $department['stream'],
        $collegeName,
        $finalScore,
        $choiceRank
    );
    if (!$insert->execute()) {
        throw new RuntimeException('Unable to save manual placement: ' . $insert->error);
    }
    $insert->close();

    $updateStudent = $db->prepare("UPDATE student_data SET department = ?, status = 'Placed' WHERE user_id = ?");
    if (!$updateStudent) {
        throw new RuntimeException('Unable to prepare student status update: ' . $db->error);
    }
    $updateStudent->bind_param('si', $department['name'], $studentId);
    if (!$updateStudent->execute()) {
        throw new RuntimeException('Unable to update student status: ' . $updateStudent->error);
    }
    $updateStudent->close();

    $deleteUnassigned = $db->prepare("DELETE FROM unassigned_students WHERE student_id = ? AND status = 'Not assigned'");
    if (!$deleteUnassigned) {
        throw new RuntimeException('Unable to prepare unassigned roster update: ' . $db->error);
    }
    $deleteUnassigned->bind_param('i', $studentId);
    if (!$deleteUnassigned->execute() || $deleteUnassigned->affected_rows !== 1) {
        throw new RuntimeException('Unable to remove the student from the unassigned roster');
    }
    $deleteUnassigned->close();

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit manual assignment: ' . $db->error);
    }
    manualAssignmentRespond([
        'success' => true,
        'message' => "{$studentName} was assigned to {$department['name']} and is pending department approval.",
        'student_id' => (int) $studentId,
        'department_id' => $selectedDepartmentId,
        'department_name' => (string) $department['name'],
        'available' => max(0, (int) $department['capacity'] - ((int) $occupancy['assigned'] + 1)),
    ]);
} catch (Throwable $error) {
    if (isset($db) && $db instanceof mysqli && $db->connect_errno === 0) {
        $db->rollback();
    }
    error_log('Manual student assignment failed: ' . $error->getMessage());
    manualAssignmentRespond(['success' => false, 'message' => 'Unable to assign the selected student'], 500);
} finally {
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
}

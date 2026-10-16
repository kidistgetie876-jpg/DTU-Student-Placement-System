<?php
require_once __DIR__ . '/../../config/db_config.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

function candidateStudentsRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    candidateStudentsRespond(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    candidateStudentsRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    candidateStudentsRespond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

$stream = trim((string) ($_GET['stream'] ?? ''));
$college = trim((string) ($_GET['college'] ?? ''));
$allValues = static function (string $value): bool {
    return $value === '' || strtolower($value) === 'all';
};

try {
    $sql = "SELECT u.id, COALESCE(NULLIF(sd.id_number, ''), u.id_number) AS id_number,
                   COALESCE(NULLIF(CONCAT_WS(' ', NULLIF(sd.first_name, ''), NULLIF(sd.last_name, '')), ''), u.username) AS name,
                   COALESCE(NULLIF(sd.email, ''), u.email) AS email,
                   sd.gender, sd.stream AS student_stream, sd.disability, sd.minority,
                   sd.gpa, sd.grade_12_result AS grade12, sd.coc_result AS coc,
                   sc.dept_id, sc.dept_name, sc.college_name, sc.stream AS choice_stream, sc.priority
            FROM users u
            INNER JOIN student_data sd ON sd.user_id = u.id
            LEFT JOIN student_choices sc ON sc.student_id = u.id
            LEFT JOIN departments d ON d.id = sc.dept_id
            WHERE LOWER(TRIM(u.role)) = 'student'
              AND LOWER(TRIM(COALESCE(sd.status, ''))) NOT IN ('inactive', 'disabled', 'placed', 'approved')
              AND NOT EXISTS (
                  SELECT 1 FROM placement_results pr WHERE pr.student_id = u.id
              )";

    $types = '';
    $values = [];
    if (!$allValues($stream)) {
        $sql .= " AND LOWER(TRIM(COALESCE(NULLIF(sc.stream, ''), NULLIF(d.stream, ''), sd.stream, ''))) = LOWER(TRIM(?))";
        $types .= 's';
        $values[] = $stream;
    }
    if (!$allValues($college)) {
        $sql .= " AND LOWER(TRIM(COALESCE(NULLIF(sc.college_name, ''), d.college_name, ''))) = LOWER(TRIM(?))";
        $types .= 's';
        $values[] = $college;
    }
    $sql .= ' ORDER BY u.id ASC, sc.priority ASC';

    $statement = $db->prepare($sql);
    if (!$statement) {
        throw new RuntimeException('Unable to prepare candidate student query: ' . $db->error);
    }
    if ($values && !$statement->bind_param($types, ...$values)) {
        throw new RuntimeException('Unable to bind candidate student filters: ' . $statement->error);
    }
    if (!$statement->execute()) {
        throw new RuntimeException('Unable to fetch candidate students: ' . $statement->error);
    }

    $result = $statement->get_result();
    $students = [];
    while ($row = $result->fetch_assoc()) {
        $id = (int) $row['id'];
        if (!isset($students[$id])) {
            $studentStream = trim((string) ($row['student_stream'] ?? ''));
            $students[$id] = [
                'id' => $id,
                'id_number' => $row['id_number'] ?? '',
                'name' => trim((string) ($row['name'] ?? '')),
                'email' => $row['email'] ?? '',
                'gender' => $row['gender'] ?? '',
                'stream' => $studentStream !== '' ? $studentStream : trim((string) ($row['choice_stream'] ?? '')),
                'hasDisability' => $row['disability'] ?? false,
                'minority' => $row['minority'] ?? false,
                'cgpa' => $row['gpa'] ?? 0,
                'g12' => $row['grade12'] ?? 0,
                'coc' => $row['coc'] ?? 0,
                'status' => trim((string) ($row['student_stream'] ?? '')) === '' ? 'Eligible' : 'Pending',
                'choices' => [],
            ];
        }

        if ($row['dept_name'] !== null && trim((string) $row['dept_name']) !== '') {
            $students[$id]['choices'][] = [
                'dept_id' => $row['dept_id'],
                'department' => $row['dept_name'],
                'college_name' => $row['college_name'] ?? '',
                'stream' => $row['choice_stream'] ?? '',
                'priority' => (int) ($row['priority'] ?? 99),
            ];
        }
    }
    $statement->close();
    $db->close();

    candidateStudentsRespond([
        'success' => true,
        'students' => array_values($students),
        'filters' => ['stream' => $stream, 'college' => $college],
    ]);
} catch (Throwable $error) {
    error_log('Candidate student fetch failed: ' . $error->getMessage());
    $db->close();
    candidateStudentsRespond(['success' => false, 'message' => 'Unable to load candidate students.'], 500);
}

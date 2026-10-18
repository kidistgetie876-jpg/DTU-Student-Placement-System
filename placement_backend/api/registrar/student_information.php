<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function studentInformationRespond(array $payload, int $status = 200): void
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
    studentInformationRespond(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    studentInformationRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    studentInformationRespond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

try {
    $result = $db->query(
        "SELECT admission_number AS admission_number,
                given_name AS given_name,
                father_name AS father_name,
                grandfather_name AS grandfather_name,
                region AS region,
                sex AS sex,
                COALESCE(NULLIF(TRIM(field_of_study), ''), '') AS field_of_study,
                total_mark AS total_mark,
                cgpa AS cgpa,
                coc_score AS coc_score,
                cumulative_score AS cumulative_score,
                disability AS disability,
                minority AS minority,
                placement_status AS placement_status
         FROM student_data
         WHERE admission_number IS NOT NULL AND admission_number <> ''
         ORDER BY admission_number"
    );
    if (!$result) {
        throw new RuntimeException('Unable to query official student records: ' . $db->error);
    }
    $students = [];
    while ($student = $result->fetch_assoc()) {
        $students[] = $student;
    }
    $result->free();
    $db->close();
    studentInformationRespond(['success' => true, 'students' => $students]);
} catch (Throwable $error) {
    error_log('Registrar student information failed: ' . $error->getMessage());
    $db->close();
    studentInformationRespond(['success' => false, 'message' => 'Unable to load student records.'], 500);
}
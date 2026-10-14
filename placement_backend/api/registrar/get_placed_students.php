<?php
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function placedStudentsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    placedStudentsResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    placedStudentsResponse(['success' => false, 'message' => 'Unable to connect to the database.'], 500);
}

try {
    $result = $db->query(
        "SELECT sd.user_id AS id,
                COALESCE(NULLIF(TRIM(sd.id_number), ''), NULLIF(TRIM(u.id_number), '')) AS id_number,
                TRIM(CONCAT(
                    COALESCE(NULLIF(TRIM(sd.first_name), ''), u.first_name, ''),
                    ' ',
                    COALESCE(NULLIF(TRIM(sd.last_name), ''), u.last_name, '')
                )) AS name,
                COALESCE(NULLIF(TRIM(sd.email), ''), u.email) AS email,
                sd.status,
                COALESCE(NULLIF(TRIM(sd.department), ''), pr.dept_name, '') AS department,
                COALESCE(pr.final_score, sd.cumulative_avg) AS cumulativeScore
         FROM student_data sd
         INNER JOIN users u ON u.id = sd.user_id AND LOWER(u.role) = 'student'
         LEFT JOIN placement_results pr ON pr.id = (
             SELECT latest.id
             FROM placement_results latest
             WHERE latest.student_id = sd.user_id
             ORDER BY latest.placed_at DESC, latest.id DESC
             LIMIT 1
         )
         WHERE LOWER(TRIM(sd.status)) IN ('placed', 'approved', 'published')
         ORDER BY name ASC, sd.user_id ASC"
    );
    if (!$result) {
        throw new RuntimeException('Unable to query placed students: ' . $db->error);
    }

    $students = [];
    while ($row = $result->fetch_assoc()) {
        $students[] = [
            'id' => (int) $row['id'],
            'id_number' => $row['id_number'],
            'name' => (string) $row['name'],
            'email' => (string) ($row['email'] ?? ''),
            'status' => (string) $row['status'],
            'department' => (string) $row['department'],
            'cumulativeScore' => $row['cumulativeScore'] !== null ? (float) $row['cumulativeScore'] : null,
        ];
    }

    $result->free();
    $db->close();
    placedStudentsResponse([
        'success' => true,
        'students' => $students,
        'count' => count($students),
    ]);
} catch (Throwable $error) {
    error_log('Placed students load failed: ' . $error->getMessage());
    $db->close();
    placedStudentsResponse(['success' => false, 'message' => 'Unable to load placed students.'], 500);
}

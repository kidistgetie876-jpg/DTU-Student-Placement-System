<?php
include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only GET requests are allowed']);
    exit;
}

$db = getDbConnection();

try {
    $result = $db->query(
        "SELECT pr.*,
            COALESCE(NULLIF(pr.id_number, ''), NULLIF(sd.id_number, ''), u.id_number) AS official_id_number,
            COALESCE(NULLIF(sd.first_name, ''), u.first_name) AS first_name,
                COALESCE(NULLIF(sd.last_name, ''), u.last_name) AS last_name,
            pr.dept_name,
            pr.final_score,
            pr.choice_rank,
            pr.status
         FROM placement_results pr
         LEFT JOIN student_data sd ON sd.user_id = pr.student_id
         LEFT JOIN users u ON u.id = pr.student_id AND LOWER(u.role) = 'student'
         WHERE pr.status = 'Pending'
         ORDER BY pr.final_score DESC, pr.choice_rank ASC, pr.student_id ASC"
    );

    if (!$result) {
        throw new Exception('Unable to load pending placement results');
    }

    $placements = [];
    while ($row = $result->fetch_assoc()) {
        $placements[] = [
            'student_id' => (int) $row['student_id'],
            'id_number' => $row['id_number'] ?? null,
            'official_id_number' => $row['official_id_number'] ?? $row['id_number'] ?? null,
            'first_name' => (string) ($row['first_name'] ?? ''),
            'last_name' => (string) ($row['last_name'] ?? ''),
            'dept_name' => $row['dept_name'],
            'final_score' => (float) $row['final_score'],
            'choice_rank' => (int) $row['choice_rank'],
            'status' => $row['status'],
        ];
    }

    echo json_encode([
        'success' => true,
        'results' => $placements,
        'count' => count($placements),
    ]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $error->getMessage()]);
} finally {
    $db->close();
}
?>

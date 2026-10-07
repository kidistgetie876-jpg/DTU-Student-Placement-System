<?php
include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only POST requests are allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$placements = $input['placements'] ?? [];

if (!is_array($placements) || empty($placements)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'No placement assignments were provided']);
    exit;
}

$db = getDbConnection();
$updated = 0;

try {
    $db->begin_transaction();

    $placementSql = $db->prepare('UPDATE placement_results SET status = ?, approved_at = NOW() WHERE student_id = ? AND dept_name = ?');
    $studentSql = $db->prepare('UPDATE student_data SET status = "Approved", department = ? WHERE user_id = ?');

    if (!$placementSql || !$studentSql) {
        throw new Exception('Unable to prepare placement approval update');
    }

    foreach ($placements as $placement) {
        $studentId = (int) ($placement['studentId'] ?? $placement['student_id'] ?? 0);
        $department = trim((string) ($placement['department'] ?? $placement['dept_name'] ?? ''));

        if ($studentId <= 0 || $department === '') {
            continue;
        }

        $status = 'Approved';
        $placementSql->bind_param('sis', $status, $studentId, $department);
        if (!$placementSql->execute()) {
            throw new Exception('Unable to approve placement result');
        }

        $studentSql->bind_param('si', $department, $studentId);
        if (!$studentSql->execute()) {
            throw new Exception('Unable to save approved department');
        }

        if ($studentSql->affected_rows > 0 || $placementSql->affected_rows > 0) {
            $updated++;
        }
    }

    if ($updated === 0) {
        throw new Exception('No matching placement records were found');
    }

    $placementSql->close();
    $studentSql->close();
    $db->commit();

    echo json_encode(['success' => true, 'message' => 'Placement results published successfully', 'updated' => $updated]);
} catch (Throwable $error) {
    $db->rollback();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $error->getMessage()]);
}
?>

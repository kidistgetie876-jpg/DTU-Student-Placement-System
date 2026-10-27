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
    $columnsResult = $db->query('SHOW COLUMNS FROM placement_results');
    if (!$columnsResult) {
        throw new RuntimeException('Unable to inspect placement result schema: ' . $db->error);
    }
    $placementColumns = array_column($columnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $columnsResult->free();
    if (!in_array('student_id', $placementColumns, true)
        || !in_array('dept_name', $placementColumns, true)
        || !in_array('status', $placementColumns, true)) {
        throw new RuntimeException('Placement results are missing required columns.');
    }

    $updates = ["status = 'Published'"];
    if (in_array('approved_at', $placementColumns, true)) {
        $updates[] = 'approved_at = COALESCE(approved_at, NOW())';
    }
    if (in_array('is_published', $placementColumns, true)) {
        $updates[] = 'is_published = 1';
    }

    $db->begin_transaction();

    $placementSql = $db->prepare(
        'UPDATE placement_results SET ' . implode(', ', $updates)
        . " WHERE student_id = ? AND dept_name = ?
             AND LOWER(TRIM(status)) IN ('pending', 'approved')
             AND NULLIF(TRIM(COALESCE(dept_name, '')), '') IS NOT NULL
             AND LOWER(TRIM(dept_name)) NOT IN ('not assigned', 'unassigned')"
    );
    if (!$placementSql) {
        throw new Exception('Unable to prepare placement approval update');
    }

    foreach ($placements as $placement) {
        $studentId = (int) ($placement['studentId'] ?? $placement['student_id'] ?? 0);
        $department = trim((string) ($placement['department'] ?? $placement['dept_name'] ?? ''));

        if ($studentId <= 0 || $department === ''
            || in_array(strtolower($department), ['not assigned', 'unassigned'], true)) {
            continue;
        }

        $placementSql->bind_param('is', $studentId, $department);
        if (!$placementSql->execute()) {
            throw new Exception('Unable to publish placement result: ' . $placementSql->error);
        }

        $updated += $placementSql->affected_rows;
    }

    $placementSql->close();
    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit published placement results: ' . $db->error);
    }

    echo json_encode([
        'success' => true,
        'message' => $updated > 0 ? 'Placement results published successfully' : 'No matching unpublished placements found',
        'updated' => $updated,
    ]);
} catch (Throwable $error) {
    $db->rollback();
    error_log('Publish placement results failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to publish placement results.']);
} finally {
    $db->close();
}
?>

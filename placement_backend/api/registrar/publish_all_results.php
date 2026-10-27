<?php
include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only POST requests are allowed']);
    exit;
}

$db = getDbConnection();

try {
    $columnsResult = $db->query('SHOW COLUMNS FROM placement_results');
    if (!$columnsResult) {
        throw new RuntimeException('Unable to inspect placement result schema: ' . $db->error);
    }
    $placementColumns = array_column($columnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $columnsResult->free();
    if (!in_array('status', $placementColumns, true) || !in_array('dept_name', $placementColumns, true)) {
        throw new RuntimeException('Placement results are missing required status or department columns.');
    }

    $updates = ["status = 'Published'"];
    if (in_array('approved_at', $placementColumns, true)) {
        $updates[] = 'approved_at = COALESCE(approved_at, NOW())';
    }
    if (in_array('is_published', $placementColumns, true)) {
        $updates[] = 'is_published = 1';
    }

    $db->begin_transaction();

    $statement = $db->prepare(
        'UPDATE placement_results SET ' . implode(', ', $updates) . "
         WHERE LOWER(TRIM(status)) IN ('pending', 'approved')
           AND NULLIF(TRIM(COALESCE(dept_name, '')), '') IS NOT NULL
           AND LOWER(TRIM(dept_name)) NOT IN ('not assigned', 'unassigned')"
    );

    if (!$statement || !$statement->execute()) {
        throw new RuntimeException('Unable to publish placement results: ' . ($statement ? $statement->error : $db->error));
    }

    $updated = $statement->affected_rows;
    $statement->close();
    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit published placement results: ' . $db->error);
    }

    echo json_encode([
        'success' => true,
        'message' => $updated > 0 ? 'Placement results published successfully' : 'No pending assigned placement results found',
        'updated' => $updated,
    ]);
} catch (Throwable $error) {
    if ($db->connect_errno === 0) {
        $db->rollback();
    }

    error_log('Publish all placement results failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to publish placement results.']);
} finally {
    $db->close();
}
?>

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
    $db->begin_transaction();

    $statement = $db->prepare(
        "UPDATE placement_results
         SET status = 'Approved', approved_at = NOW()
         WHERE status = 'Pending'"
    );

    if (!$statement || !$statement->execute()) {
        throw new Exception('Unable to publish placement results');
    }

    $updated = $statement->affected_rows;
    $statement->close();
    $db->commit();

    echo json_encode([
        'success' => true,
        'message' => $updated > 0 ? 'Placement results published successfully' : 'No pending placement results found',
        'updated' => $updated,
    ]);
} catch (Throwable $error) {
    if ($db->connect_errno === 0) {
        $db->rollback();
    }

    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $error->getMessage()]);
} finally {
    $db->close();
}
?>

<?php
include __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_notifications.php';
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
    if (!in_array('dept_name', $placementColumns, true)
        || !in_array('status', $placementColumns, true)) {
        throw new RuntimeException('Placement results are missing required columns.');
    }
    if (!in_array('student_id', $placementColumns, true)) {
        throw new RuntimeException('Placement results are missing student identifiers.');
    }
    $hasAdmissionNumber = in_array('admission_number', $placementColumns, true);
    $hasIdNumber = in_array('id_number', $placementColumns, true);
    $admissionNumberExpression = $hasAdmissionNumber && $hasIdNumber
        ? "COALESCE(NULLIF(TRIM(admission_number), ''), NULLIF(TRIM(id_number), ''), '')"
        : ($hasAdmissionNumber
            ? "COALESCE(NULLIF(TRIM(admission_number), ''), '')"
            : ($hasIdNumber ? "COALESCE(NULLIF(TRIM(id_number), ''), '')" : "''"));
    $semesterExpression = in_array('placement_semester', $placementColumns, true)
        ? 'placement_semester'
        : '1';

    $updates = ["status = 'Published'"];
    if (in_array('approved_at', $placementColumns, true)) {
        $updates[] = 'approved_at = COALESCE(approved_at, NOW())';
    }
    if (in_array('is_published', $placementColumns, true)) {
        $updates[] = 'is_published = 1';
    }

    ensureStudentPlacementNotificationSchema($db);
    $db->begin_transaction();

    $placementSql = $db->prepare(
        'UPDATE placement_results SET ' . implode(', ', $updates)
        . " WHERE student_id = ? AND dept_name = ?
                  AND LOWER(TRIM(REPLACE(REPLACE(COALESCE(status, ''), '_', ' '), '-', ' ')))
                      IN ('pending', 'approved', 'assigned', 'pending approval')
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

        $candidateSql = $db->prepare(
            "SELECT id, {$admissionNumberExpression} AS admission_number,
                    {$semesterExpression} AS placement_semester
             FROM placement_results
             WHERE student_id = ? AND dept_name = ?
            AND LOWER(TRIM(REPLACE(REPLACE(COALESCE(status, ''), '_', ' '), '-', ' ')))
                IN ('pending', 'approved', 'assigned', 'pending approval')
               AND NULLIF(TRIM(COALESCE(dept_name, '')), '') IS NOT NULL
               AND LOWER(TRIM(dept_name)) NOT IN ('not assigned', 'unassigned')"
        );
        if (!$candidateSql) {
            throw new RuntimeException('Unable to load placement records to publish: ' . $db->error);
        }
        $candidateSql->bind_param('is', $studentId, $department);
        if (!$candidateSql->execute()) {
            $error = $candidateSql->error;
            $candidateSql->close();
            throw new RuntimeException('Unable to load placement records to publish: ' . $error);
        }
        $candidateResults = $candidateSql->get_result()->fetch_all(MYSQLI_ASSOC);
        $candidateSql->close();

        $placementSql->bind_param('is', $studentId, $department);
        if (!$placementSql->execute()) {
            throw new Exception('Unable to publish placement result: ' . $placementSql->error);
        }

        $affected = $placementSql->affected_rows;
        $updated += $affected;
        if ($affected > 0) {
            foreach ($candidateResults as $candidate) {
                $semester = in_array((int) $candidate['placement_semester'], [1, 2], true)
                    ? (int) $candidate['placement_semester']
                    : 1;
                createStudentPlacementNotification(
                    $db,
                    $studentId,
                    (string) $candidate['admission_number'],
                    $semester,
                    'placement_published',
                    "Your Semester {$semester} placement in {$department} has been published. Your placement is complete.",
                    (int) $candidate['id']
                );
            }
        }
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

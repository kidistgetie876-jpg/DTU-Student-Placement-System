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

    $placementSql = $db->prepare("UPDATE placement_results SET status = ?, approved_at = NOW() WHERE student_id = ? AND dept_name = ? AND status = 'Pending'");
    $studentSql = $db->prepare('UPDATE student_data SET status = "Approved", department = ? WHERE user_id = ?');
    $studentDetailsSql = $db->prepare(
        'SELECT pr.dept_name, u.id AS user_id, u.username, sd.first_name, sd.last_name
         FROM placement_results pr
         INNER JOIN users u ON u.id = pr.student_id
         LEFT JOIN student_data sd ON sd.user_id = u.id
         WHERE pr.student_id = ? AND pr.dept_name = ? AND pr.status = "Pending"
         LIMIT 1'
    );
    $notificationSql = $db->prepare(
        "INSERT INTO notifications
            (sender_role, recipient_role, recipient_id, title, message, is_read, created_at)
         VALUES ('Registrar', 'student', ?, ?, ?, 0, NOW())"
    );

    if (!$placementSql || !$studentSql || !$studentDetailsSql || !$notificationSql) {
        throw new Exception('Unable to prepare placement approval update');
    }

    foreach ($placements as $placement) {
        $studentId = (int) ($placement['studentId'] ?? $placement['student_id'] ?? 0);
        $department = trim((string) ($placement['department'] ?? $placement['dept_name'] ?? ''));

        if ($studentId <= 0 || $department === '') {
            continue;
        }

        $studentDetailsSql->bind_param('is', $studentId, $department);
        if (!$studentDetailsSql->execute()) {
            throw new Exception('Unable to retrieve student placement details');
        }
        $studentDetails = $studentDetailsSql->get_result()->fetch_assoc();
        if (!$studentDetails) {
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

        if ($placementSql->affected_rows > 0) {
            $studentUserId = (int) $studentDetails['user_id'];
            $studentName = trim((string) ($studentDetails['first_name'] ?? '') . ' ' . (string) ($studentDetails['last_name'] ?? ''));
            if ($studentName === '') {
                $studentName = trim((string) ($studentDetails['username'] ?? 'Student'));
            }
            $departmentName = trim((string) $studentDetails['dept_name']);
            $title = 'Official Department Placement Result Published';
            $message = 'Congratulations ' . $studentName
                . '! The Office of the University Registrar has finalized and published the placement results. '
                . 'You have been officially assigned to the Department of ' . $departmentName
                . ". Please open the 'Placement Result' tab to view your official score and print your confirmation slip.";

            $notificationSql->bind_param('iss', $studentUserId, $title, $message);
            if (!$notificationSql->execute()) {
                throw new Exception('Unable to save student placement notification');
            }
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
    $studentDetailsSql->close();
    $notificationSql->close();
    $db->commit();

    echo json_encode(['success' => true, 'message' => 'Placement results published successfully', 'updated' => $updated]);
} catch (Throwable $error) {
    $db->rollback();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $error->getMessage()]);
}
?>

<?php
include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only POST requests are allowed']);
    exit;
}

$db = getDbConnection();
$transactionStarted = false;

try {
    $db->begin_transaction();
    $transactionStarted = true;

    $pendingStatement = $db->prepare(
        "SELECT pr.student_id, pr.dept_id, pr.dept_name, pr.final_score,
                u.id AS user_id, u.username, u.id_number AS user_id_number,
                sd.first_name, sd.last_name,
                COALESCE(NULLIF(pr.id_number, ''), NULLIF(sd.id_number, ''), u.id_number) AS id_number,
                COALESCE(
                    NULLIF(TRIM(CONCAT(COALESCE(sd.first_name, ''), ' ', COALESCE(sd.last_name, ''))), ''),
                    NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
                    NULLIF(u.username, ''),
                    CONCAT('Student ', pr.student_id)
                ) AS student_name
         FROM placement_results pr
         LEFT JOIN student_data sd ON sd.user_id = pr.student_id
         INNER JOIN users u ON pr.student_id = u.id
         WHERE pr.status = 'Pending'
         ORDER BY pr.dept_id, pr.student_id
         FOR UPDATE"
    );
    if (!$pendingStatement || !$pendingStatement->execute()) {
        throw new Exception('Unable to load pending placement results');
    }

    $pendingStudents = [];
    $pendingResult = $pendingStatement->get_result();
    while ($row = $pendingResult->fetch_assoc()) {
        $pendingStudents[] = $row;
    }
    $pendingStatement->close();

    $departmentsById = [];
    $departmentsByName = [];
    if ($pendingStudents) {
        $departmentResult = $db->query('SELECT id, name, head_id FROM departments');
        if (!$departmentResult) {
            throw new Exception('Unable to load department assignments');
        }
        while ($department = $departmentResult->fetch_assoc()) {
            $departmentId = (int) $department['id'];
            $departmentsById[$departmentId] = $department;
            $departmentName = strtolower(trim((string) $department['name']));
            if ($departmentName !== '') {
                $departmentsByName[$departmentName] = $department;
            }
        }
    }

    $placementsByDepartment = [];
    foreach ($pendingStudents as $student) {
        $departmentId = (int) ($student['dept_id'] ?? 0);
        $department = $departmentsById[$departmentId] ?? null;
        if (!$department) {
            $departmentName = strtolower(trim((string) ($student['dept_name'] ?? '')));
            $department = $departmentsByName[$departmentName] ?? null;
        }
        if (!$department) {
            throw new Exception('Unable to match a pending placement to its department');
        }

        $departmentId = (int) $department['id'];
        if (!isset($placementsByDepartment[$departmentId])) {
            $placementsByDepartment[$departmentId] = [
                'department' => $department,
                'students' => [],
            ];
        }

        $studentIdNumber = trim((string) ($student['id_number'] ?? ''));
        $placementsByDepartment[$departmentId]['students'][] = sprintf(
            '%s (%s)',
            trim((string) $student['student_name']),
            $studentIdNumber !== '' ? $studentIdNumber : 'ID unavailable'
        );
    }

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

    if ($pendingStudents) {
        $studentNotificationInsert = $db->prepare(
            "INSERT INTO notifications
                (sender_role, recipient_role, recipient_id, title, message, is_read, created_at)
             VALUES ('Registrar', 'student', ?, ?, ?, 0, NOW())"
        );
        if (!$studentNotificationInsert) {
            throw new Exception('Unable to prepare student placement notifications');
        }

        $studentNotificationTitle = 'Official Department Placement Result Published';
        foreach ($pendingStudents as $student) {
            $studentUserId = (int) $student['user_id'];
            $studentName = trim((string) ($student['student_name'] ?? ''));
            $departmentName = trim((string) ($student['dept_name'] ?? ''));
            $message = 'Congratulations ' . $studentName
                . '! The Office of the University Registrar has finalized and published the placement results. '
                . 'You have been officially assigned to the Department of ' . $departmentName
                . ". Please open the 'Placement Result' tab to view your official score and print your confirmation slip.";

            $studentNotificationInsert->bind_param('iss', $studentUserId, $studentNotificationTitle, $message);
            if (!$studentNotificationInsert->execute()) {
                throw new Exception('Unable to save a student placement notification');
            }
        }
        $studentNotificationInsert->close();
    }

    if ($placementsByDepartment) {
        $headLookup = $db->prepare(
            "SELECT id
             FROM users
             WHERE assigned_dept_id = ?
               AND LOWER(role) IN ('head', 'hod', 'coordinator')
             ORDER BY (LOWER(role) = 'head') DESC, id ASC
             LIMIT 1"
        );
        $notificationInsert = $db->prepare(
            "INSERT INTO notifications
                (sender_role, recipient_role, recipient_id, department_id, title, message, created_at)
             VALUES ('Registrar', 'head', ?, ?, ?, ?, NOW())"
        );
        if (!$headLookup || !$notificationInsert) {
            throw new Exception('Unable to prepare department placement notifications');
        }

        $title = 'Official Placement Approved: New Students Assigned';
        foreach ($placementsByDepartment as $departmentId => $placement) {
            $headUserId = (int) ($placement['department']['head_id'] ?? 0);
            if ($headUserId <= 0) {
                $headLookup->bind_param('i', $departmentId);
                if (!$headLookup->execute()) {
                    throw new Exception('Unable to find the department head for a placement notification');
                }
                $head = $headLookup->get_result()->fetch_assoc();
                $headUserId = (int) ($head['id'] ?? 0);
            }
            if ($headUserId <= 0) {
                throw new Exception('No department head is assigned to ' . (string) $placement['department']['name']);
            }

            $studentCount = count($placement['students']);
            $studentList = implode(', ', $placement['students']);
            $message = 'The Office of the University Registrar has approved the placement batch. '
                . $studentCount
                . ' new students have been officially assigned to your department: '
                . $studentList
                . '. Please review your placed students roster.';

            $notificationInsert->bind_param('iiss', $headUserId, $departmentId, $title, $message);
            if (!$notificationInsert->execute()) {
                throw new Exception('Unable to save a department placement notification');
            }
        }
        $headLookup->close();
        $notificationInsert->close();
    }

    $db->commit();
    $transactionStarted = false;

    echo json_encode([
        'success' => true,
        'message' => $updated > 0 ? 'Placement results published successfully' : 'No pending placement results found',
        'updated' => $updated,
    ]);
} catch (Throwable $error) {
    if ($transactionStarted) {
        $db->rollback();
    }

    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $error->getMessage()]);
} finally {
    $db->close();
}
?>

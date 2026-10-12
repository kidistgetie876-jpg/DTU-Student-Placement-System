<?php
/**
 * get_student_result.php - Retrieve student placement result
 * Returns placement assignment details for a specific student
 */

include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json');

$db = getDbConnection();

try {
    // Get student ID from query parameter or POST data
    $studentId = $_GET['student_id'] ?? $_POST['student_id'] ?? null;
    
    if (!$studentId) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Student ID is required'
        ]);
        exit;
    }

    // Validate student ID is numeric
    $studentId = intval($studentId);
    if ($studentId <= 0) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Invalid student ID'
        ]);
        exit;
    }

    // Fetch student details from student_data
    $studentStmt = $db->prepare("
         SELECT student_data.user_id, users.id_number,
             CONCAT_WS(' ', student_data.first_name, student_data.last_name) AS name,
             student_data.email, student_data.status, student_data.department
         FROM student_data
         INNER JOIN users ON users.id = student_data.user_id AND users.role = 'student'
         WHERE student_data.user_id = ?
    ");

    if (!$studentStmt) {
        throw new Exception("Prepare statement failed: " . $db->error);
    }

    $studentStmt->bind_param("i", $studentId);
    $studentStmt->execute();
    $studentResult = $studentStmt->get_result();
    
    if ($studentResult->num_rows === 0) {
        $studentStmt->close();

        $userStmt = $db->prepare("SELECT id AS user_id, id_number, username AS name, email FROM users WHERE id = ? AND role = 'student'");
        if (!$userStmt) {
            throw new Exception("Prepare statement failed: " . $db->error);
        }

        $userStmt->bind_param("i", $studentId);
        $userStmt->execute();
        $userResult = $userStmt->get_result();

        if ($userResult->num_rows === 0) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'message' => 'Student not found'
            ]);
            $userStmt->close();
            exit;
        }

        $student = $userResult->fetch_assoc();
        $userStmt->close();
    } else {
        $student = $studentResult->fetch_assoc();
        $studentStmt->close();
    }

    // Use the latest student_data assignment state as the source of truth so manual registrar changes
    // are reflected immediately when the student logs in or refreshes the portal.
    $rawStudentStatus = trim((string)($student['status'] ?? ''));
    $rawDepartment = trim((string)($student['department'] ?? ''));
    $normalizedStudentStatus = strtolower($rawStudentStatus);
    $normalizedDepartment = strtolower($rawDepartment);
    $studentIsUnassigned = ($rawStudentStatus === '' || in_array($normalizedStudentStatus, ['not assigned', 'notassigned', 'unassigned', 'null'], true))
        || ($rawDepartment === '' || in_array($normalizedDepartment, ['not assigned', 'notassigned', 'unassigned', 'null'], true));

    $effectiveStatus = 'Not assigned';

    // Fetch placement result by either the internal ID or official student number.
    $placementStmt = $db->prepare("
        SELECT *
        FROM placement_results
        WHERE student_id = ? OR id_number = ?
        ORDER BY placed_at DESC, id DESC
        LIMIT 1
    ");

    if (!$placementStmt) {
        throw new Exception("Prepare statement failed: " . $db->error);
    }

    $studentNumber = (string)($student['id_number'] ?? '');
    $placementStmt->bind_param("is", $studentId, $studentNumber);
    $placementStmt->execute();
    $placementResult = $placementStmt->get_result();

    $placement = $placementResult->fetch_assoc() ?: null;
    $placementStmt->close();

    if ($studentIsUnassigned) {
        echo json_encode([
            'success' => true,
            'published' => false,
            'assigned' => false,
            'student' => [
                'id' => (int)($student['user_id'] ?? $studentId),
                'id_number' => $student['id_number'] ?? null,
                'name' => $student['name'],
                'email' => $student['email'],
                'status' => $rawStudentStatus ?: 'Not assigned',
                'department' => $rawDepartment ?: 'Not assigned'
            ],
            'placement' => null,
            'is_placed' => false,
            'message' => 'You are currently unassigned. Please report to the Registrar office in person for remediation and manual assignment.'
        ]);
        return;
    }

    $placementStatus = strtolower(trim((string)($placement['status'] ?? '')));
    if (in_array($normalizedStudentStatus, ['approved', 'published'], true)
        || in_array($placementStatus, ['approved', 'published'], true)) {
        $effectiveStatus = 'Approved';
    } elseif (in_array($normalizedStudentStatus, ['assigned', 'placed'], true)
        || in_array($placementStatus, ['assigned', 'placed'], true)) {
        $effectiveStatus = 'Assigned';
    } elseif (in_array($normalizedStudentStatus, ['pending', 'under review', 'in review'], true)
        || in_array($placementStatus, ['pending', 'under review', 'in review'], true)) {
        $effectiveStatus = 'Pending';
    } elseif ($rawDepartment !== '') {
        $effectiveStatus = 'Assigned';
    }

    if (!$placement && $effectiveStatus === 'Not assigned') {
        echo json_encode([
            'success' => true,
            'published' => false,
            'assigned' => false,
            'student' => [
                'id' => (int)($student['user_id'] ?? $studentId),
                'id_number' => $student['id_number'] ?? null,
                'name' => $student['name'],
                'email' => $student['email'],
                'status' => $rawStudentStatus ?: 'Not assigned',
                'department' => $rawDepartment ?: 'Not assigned'
            ],
            'placement' => null,
            'is_placed' => false,
            'message' => 'You are currently unassigned. Please report to the Registrar office in person for remediation and manual assignment.'
        ]);
        return;
    }

    // Fetch student's top 3 preferences for context
    $preferencesStmt = $db->prepare("
        SELECT 
            dept_id,
            dept_name,
            college_name,
            stream,
            priority
        FROM student_choices 
        WHERE student_id = ?
        ORDER BY priority ASC
        LIMIT 3
    ");

    if (!$preferencesStmt) {
        throw new Exception("Prepare statement failed: " . $db->error);
    }

    $preferencesStmt->bind_param("i", $studentId);
    $preferencesStmt->execute();
    $preferencesResult = $preferencesStmt->get_result();

    $preferences = [];
    while ($pref = $preferencesResult->fetch_assoc()) {
        $preferences[] = [
            'department_id' => $pref['dept_id'],
            'department' => $pref['dept_name'],
            'college' => $pref['college_name'],
            'stream' => $pref['stream'],
            'priority' => $pref['priority']
        ];
    }

    $preferencesStmt->close();

    $effectiveDepartment = $rawDepartment !== ''
        ? $rawDepartment
        : trim((string)($placement['dept_name'] ?? ''));
    if ($effectiveDepartment === '') {
        $effectiveDepartment = 'N/A';
    }

    // Build response
    $response = [
        'success' => true,
        'published' => in_array($effectiveStatus, ['Assigned', 'Approved'], true),
        'assigned' => in_array($effectiveStatus, ['Assigned', 'Approved'], true),
        'student' => [
            'id' => (int)($student['user_id'] ?? $studentId),
            'id_number' => $student['id_number'] ?? null,
            'name' => $student['name'],
            'email' => $student['email'],
            'status' => $effectiveStatus,
            'department' => $rawDepartment ?: $effectiveDepartment
        ],
        'placement' => [
            'id_number' => $placement['id_number'] ?? ($student['id_number'] ?? null),
            'assigned_department' => $effectiveDepartment,
            'college' => $placement['college_name'] ?? '',
            'stream' => $placement['stream'] ?? $student['stream'] ?? 'N/A',
            'choice_rank' => (int)($placement['choice_rank'] ?? 0),
            'merit_score' => (float)($placement['final_score'] ?? $student['cumulative_score'] ?? 0),
            'placement_status' => $effectiveStatus,
            'placement_date' => $placement['placed_at'] ?? null
        ],
        'is_placed' => true,
        'top_preferences' => $preferences
    ];

    $response['message'] = $effectiveStatus === 'Approved'
        ? 'Congratulations! Your placement has been approved in ' . $effectiveDepartment
        : 'Congratulations! You have been assigned to ' . $effectiveDepartment;

    echo json_encode($response);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error: ' . $e->getMessage()
    ]);

} finally {
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
}
?>

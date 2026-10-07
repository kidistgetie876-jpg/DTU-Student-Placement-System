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

    // Fetch placement result by either the internal ID or official student number.
    $placementStmt = $db->prepare("
        SELECT *
        FROM placement_results
        WHERE student_id = ? OR id_number = ?
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

    $placementStatus = strtolower(trim((string)($placement['status'] ?? '')));
    if (!$placement || !in_array($placementStatus, ['approved', 'published'], true)) {
        echo json_encode([
            'success' => false,
            'published' => false,
            'message' => 'Your placement result is currently under review by the Registrar and has not been officially published yet. Please check back later.'
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

    // Build response
    $response = [
        'success' => true,
        'published' => true,
        'student' => [
            'id' => (int)$student['user_id'],
            'id_number' => $student['id_number'] ?? null,
            'name' => $student['name'],
            'email' => $student['email'],
            'status' => $student['status'] ?? 'Not Placed'
        ],
        'placement' => $placement ? [
            'id_number' => $placement['id_number'] ?: ($student['id_number'] ?? null),
            'assigned_department' => $placement['dept_name'],
            'college' => $placement['college_name'],
            'stream' => $placement['stream'] ?? 'N/A',
            'choice_rank' => (int)$placement['choice_rank'],
            'merit_score' => (float)$placement['final_score'],
            'placement_status' => $placement['status'],
            'placement_date' => $placement['placed_at'] ?? null
        ] : null,
        'is_placed' => true,
        'top_preferences' => $preferences
    ];

    // Add message based on placement status
    $response['message'] = "Congratulations! You have been placed in " . $placement['dept_name'];

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

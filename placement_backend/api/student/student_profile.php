<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

include __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // የተማሪውን መታወቂያ (Admission Number) መቀበል
    $admissionNumber = trim((string) ($_GET['admission_number'] ?? $_GET['student_id'] ?? ''));
    
    if ($admissionNumber === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Admission number is required.']);
        $db->close();
        exit;
    }

    // ከ student_data ቴብል ቀጥታ መረጃውን መጥራት
    $sql = "SELECT * FROM student_data WHERE admission_number = ?";
    $statement = $db->prepare($sql);
    
    if (!$statement) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database prepare error: ' . $db->error]);
        $db->close();
        exit;
    }

    $statement->bind_param('s', $admissionNumber);
    $statement->execute();
    $result = $statement->get_result();
    $student = $result->fetch_assoc();
    $statement->close();

    if ($student) {
        echo json_encode(['success' => true, 'student' => $student]);
    } else {
        http_response_code(200);
        echo json_encode(['success' => false, 'message' => 'Student not found', 'student' => null]);
    }
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
}

$db->close();
?>
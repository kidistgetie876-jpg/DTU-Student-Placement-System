<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Access-Control-Allow-Methods: DELETE, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

function deleteStudentResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';
header('Access-Control-Allow-Methods: DELETE, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    deleteStudentResponse([
        'success' => false,
        'message' => 'Only registrars and administrators can delete student information.',
    ], 403);
}

$requestMethod = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($requestMethod, ['DELETE', 'POST'], true)) {
    header('Allow: DELETE, POST, OPTIONS');
    deleteStudentResponse(['success' => false, 'message' => 'Only DELETE or POST requests are allowed.'], 405);
}

$rawInput = file_get_contents('php://input');
$input = is_string($rawInput) ? json_decode($rawInput, true) : null;
$studentIdValue = $_GET['student_id']
    ?? $_GET['id']
    ?? (is_array($input) ? ($input['student_id'] ?? $input['id'] ?? null) : null)
    ?? $_POST['student_id']
    ?? $_POST['id']
    ?? null;
$studentId = filter_var($studentIdValue, FILTER_VALIDATE_INT);
if ($studentId === false || $studentId === null || $studentId <= 0) {
    deleteStudentResponse(['success' => false, 'message' => 'Student ID is required'], 400);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    deleteStudentResponse(['success' => false, 'message' => 'Database error occurred'], 500);
}

$transactionStarted = false;
try {
    $db->begin_transaction();
    $transactionStarted = true;

    $studentQuery = $db->prepare("SELECT id FROM users WHERE id = ? AND LOWER(role) = 'student' LIMIT 1");
    if (!$studentQuery) {
        throw new RuntimeException('Unable to prepare student lookup: ' . $db->error);
    }
    $studentQuery->bind_param('i', $studentId);
    if (!$studentQuery->execute()) {
        throw new RuntimeException('Unable to find student: ' . $studentQuery->error);
    }
    $studentExists = $studentQuery->get_result()->num_rows === 1;
    $studentQuery->close();

    if (!$studentExists) {
        $db->rollback();
        $db->close();
        deleteStudentResponse(['success' => false, 'message' => 'Student not found.'], 404);
    }

    foreach ([
        'student_choices' => 'DELETE FROM student_choices WHERE student_id = ?',
        'placement_results' => 'DELETE FROM placement_results WHERE student_id = ?',
        'student_appeals' => 'DELETE FROM student_appeals WHERE student_id = ?',
    ] as $table => $sql) {
        $dependentDelete = $db->prepare($sql);
        if (!$dependentDelete) {
            throw new RuntimeException('Unable to prepare deletion from ' . $table . ': ' . $db->error);
        }
        $dependentDelete->bind_param('i', $studentId);
        if (!$dependentDelete->execute()) {
            $error = $dependentDelete->error;
            $dependentDelete->close();
            throw new RuntimeException('Unable to delete student data from ' . $table . ': ' . $error);
        }
        $dependentDelete->close();
    }

    $profileDelete = $db->prepare('DELETE FROM student_data WHERE user_id = ?');
    if (!$profileDelete) {
        throw new RuntimeException('Unable to prepare student profile deletion: ' . $db->error);
    }
    $profileDelete->bind_param('i', $studentId);
    if (!$profileDelete->execute()) {
        $error = $profileDelete->error;
        $profileDelete->close();
        throw new RuntimeException('Unable to delete student profile: ' . $error);
    }
    $profileDelete->close();

    $studentDelete = $db->prepare("DELETE FROM users WHERE id = ? AND LOWER(role) = 'student' LIMIT 1");
    if (!$studentDelete) {
        throw new RuntimeException('Unable to prepare student account deletion: ' . $db->error);
    }
    $studentDelete->bind_param('i', $studentId);
    if (!$studentDelete->execute()) {
        throw new RuntimeException('Unable to delete student account: ' . $studentDelete->error);
    }
    if ($studentDelete->affected_rows !== 1) {
        $studentDelete->close();
        throw new RuntimeException('Student account was not deleted.');
    }
    $studentDelete->close();

    $db->commit();
    $db->close();
    deleteStudentResponse(['success' => true, 'message' => 'Student deleted successfully']);
} catch (Throwable $error) {
    if ($transactionStarted) {
        $db->rollback();
    }
    error_log('Student deletion failed: ' . $error->getMessage());
    $db->close();
    deleteStudentResponse(['success' => false, 'message' => 'Database error occurred'], 500);
}

<?php
include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$db = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    exit;
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

try {
    if ($method === 'GET') {
        $studentId = (int) ($_GET['student_id'] ?? 0);
        if ($studentId > 0) {
            $statement = $db->prepare('SELECT sa.id, sa.student_id, u.username, u.email, sa.subject, sa.message, sa.status, sa.response, sa.created_at FROM student_appeals sa INNER JOIN users u ON u.id = sa.student_id WHERE sa.student_id = ? ORDER BY sa.created_at DESC, sa.id DESC');
        } else {
            $statement = $db->prepare('SELECT sa.id, sa.student_id, u.username, u.email, sa.subject, sa.message, sa.status, sa.response, sa.created_at FROM student_appeals sa INNER JOIN users u ON u.id = sa.student_id ORDER BY sa.created_at DESC, sa.id DESC');
        }
        if (!$statement) {
            throw new Exception('Unable to prepare appeal history query.');
        }
        if ($studentId > 0) {
            $statement->bind_param('i', $studentId);
        }
        $statement->execute();
        $result = $statement->get_result();
        $appeals = [];
        while ($appeal = $result->fetch_assoc()) {
            $appeals[] = $appeal;
        }
        $statement->close();
        respond(['success' => true, 'appeals' => $appeals]);
    }

    if ($method !== 'POST') {
        respond(['success' => false, 'message' => 'Only GET and POST requests are allowed.'], 405);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    if (isset($input['action']) && $input['action'] === 'update') {
        $appealId = (int) ($input['appeal_id'] ?? 0);
        $status = trim((string) ($input['status'] ?? ''));
        $responseText = trim((string) ($input['response'] ?? ''));
        $allowedStatuses = ['Received', 'Under Review', 'Resolved'];

        if ($appealId <= 0 || !in_array($status, $allowedStatuses, true)) {
            respond(['success' => false, 'message' => 'A valid appeal ID and status are required.'], 400);
        }

        $statement = $db->prepare('UPDATE student_appeals SET status = ?, response = ? WHERE id = ?');
        if (!$statement) {
            throw new Exception('Unable to prepare appeal update.');
        }
        $statement->bind_param('ssi', $status, $responseText, $appealId);
        if (!$statement->execute()) {
            $statement->close();
            throw new Exception('Unable to update appeal.');
        }
        $updated = $statement->affected_rows;
        $statement->close();
        respond(['success' => true, 'message' => 'Appeal updated successfully.', 'updated' => $updated]);
    }

    if (isset($input['action']) && $input['action'] === 'delete') {
        $registrarId = (int) ($_SESSION['user_id'] ?? 0);
        $registrarRole = strtolower((string) ($_SESSION['role'] ?? ''));
        if ($registrarId <= 0 || $registrarRole !== 'registrar') {
            respond(['success' => false, 'message' => 'Only registrars can delete appeals.'], 403);
        }

        $appealId = (int) ($input['appeal_id'] ?? 0);
        if ($appealId <= 0) {
            respond(['success' => false, 'message' => 'A valid appeal ID is required.'], 400);
        }

        $statement = $db->prepare('DELETE FROM student_appeals WHERE id = ?');
        if (!$statement) {
            throw new Exception('Unable to prepare appeal deletion.');
        }
        $statement->bind_param('i', $appealId);
        if (!$statement->execute()) {
            $statement->close();
            throw new Exception('Unable to delete appeal.');
        }
        $deleted = $statement->affected_rows;
        $statement->close();

        if ($deleted === 0) {
            respond(['success' => false, 'message' => 'Appeal not found.'], 404);
        }

        respond(['success' => true, 'message' => 'Appeal deleted successfully.', 'deleted' => $deleted]);
    }

    $studentId = (int) ($input['student_id'] ?? 0);
    $subject = trim((string) ($input['subject'] ?? ''));
    $message = trim((string) ($input['message'] ?? ''));

    if ($studentId <= 0 || $subject === '' || $message === '') {
        respond(['success' => false, 'message' => 'Student ID, subject, and message are required.'], 400);
    }

    if (mb_strlen($subject) > 255) {
        respond(['success' => false, 'message' => 'Subject must be 255 characters or fewer.'], 400);
    }

    $studentCheck = $db->prepare("SELECT id FROM users WHERE id = ? AND role = 'student' LIMIT 1");
    if (!$studentCheck) {
        throw new Exception('Unable to validate student account.');
    }
    $studentCheck->bind_param('i', $studentId);
    $studentCheck->execute();
    if ($studentCheck->get_result()->num_rows === 0) {
        $studentCheck->close();
        respond(['success' => false, 'message' => 'Student account was not found.'], 404);
    }
    $studentCheck->close();

    $statement = $db->prepare("INSERT INTO student_appeals (student_id, subject, message, status) VALUES (?, ?, ?, 'Received')");
    if (!$statement) {
        throw new Exception('Unable to prepare appeal submission.');
    }
    $statement->bind_param('iss', $studentId, $subject, $message);
    if (!$statement->execute()) {
        $statement->close();
        throw new Exception('Unable to save appeal.');
    }

    $appealId = $statement->insert_id;
    $statement->close();
    respond(['success' => true, 'message' => 'Your appeal was submitted to the Registrar.', 'appeal_id' => $appealId]);
} catch (Throwable $error) {
    respond(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>

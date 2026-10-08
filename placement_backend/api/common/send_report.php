<?php
require_once __DIR__ . '/../../config/db_config.php';
setCorsHeaders();
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function sendReportResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    sendReportResponse(['success' => true]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendReportResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

$senderId = (int) ($_SESSION['user_id'] ?? 0);
if ($senderId <= 0) {
    sendReportResponse(['success' => false, 'message' => 'You must be logged in to send a report.'], 401);
}

$db = getDbConnection();

try {
    $senderStatement = $db->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
    if (!$senderStatement) throw new Exception('Unable to validate sender.');
    $senderStatement->bind_param('i', $senderId);
    $senderStatement->execute();
    $sender = $senderStatement->get_result()->fetch_assoc();
    $senderStatement->close();

    $senderRole = strtolower((string) ($sender['role'] ?? ''));
    if (!in_array($senderRole, ['registrar', 'admin', 'head', 'hod', 'coordinator'], true)) {
        sendReportResponse(['success' => false, 'message' => 'You are not allowed to distribute reports.'], 403);
    }

    $recipient = strtolower(trim((string) ($_POST['recipient'] ?? '')));
    $message = trim((string) ($_POST['message'] ?? ''));
    $targetId = trim((string) ($_POST['target_id'] ?? $_POST['recipient_id'] ?? 'all'));
    $departmentIdInput = trim((string) ($_POST['dept_id'] ?? $_POST['department_id'] ?? 'all'));

    if (!in_array($recipient, ['student', 'head', 'admin'], true)) {
        sendReportResponse(['success' => false, 'message' => 'Choose a valid report recipient.'], 400);
    }
    if ($message === '') {
        sendReportResponse(['success' => false, 'message' => 'Write a message before sending.'], 400);
    }
    if (strlen($message) > 10000) {
        sendReportResponse(['success' => false, 'message' => 'The message is too long.'], 400);
    }

    if ($targetId !== 'all' && (!ctype_digit($targetId) || (int) $targetId <= 0)) {
        sendReportResponse(['success' => false, 'message' => 'Choose a valid individual recipient.'], 400);
    }
    if ($departmentIdInput !== 'all' && (!ctype_digit($departmentIdInput) || (int) $departmentIdInput <= 0)) {
        sendReportResponse(['success' => false, 'message' => 'Choose a valid department.'], 400);
    }

    $recipientId = $targetId === 'all' ? null : (int) $targetId;
    $departmentId = $departmentIdInput === 'all' ? null : (int) $departmentIdInput;

    if ($recipient === 'student' && $recipientId !== null) {
        $studentStatement = $db->prepare("SELECT id FROM users WHERE id = ? AND LOWER(role) = 'student' LIMIT 1");
        if (!$studentStatement) {
            throw new Exception('Unable to validate the selected student.');
        }
        $studentStatement->bind_param('i', $recipientId);
        $studentStatement->execute();
        $studentExists = $studentStatement->get_result()->fetch_assoc();
        $studentStatement->close();
        if (!$studentExists) {
            sendReportResponse(['success' => false, 'message' => 'The selected student could not be found.'], 400);
        }
    }

    if ($recipient === 'head' && $departmentId !== null) {
        $headDepartmentStatement = $db->prepare("SELECT id FROM departments WHERE id = ? AND status = 'active' LIMIT 1");
        if (!$headDepartmentStatement) {
            throw new Exception('Unable to validate the selected department.');
        }
        $headDepartmentStatement->bind_param('i', $departmentId);
        $headDepartmentStatement->execute();
        $headDepartmentExists = $headDepartmentStatement->get_result()->fetch_assoc();
        $headDepartmentStatement->close();
        if (!$headDepartmentExists) {
            sendReportResponse(['success' => false, 'message' => 'The selected active department could not be found.'], 400);
        }
    }

    if (in_array($senderRole, ['head', 'hod', 'coordinator'], true)) {
        if ($recipient !== 'student' || $recipientId === null || $recipientId <= 0) {
            sendReportResponse(['success' => false, 'message' => 'Heads can send messages only to a specific student.'], 400);
        }

        $departmentStatement = $db->prepare("SELECT id FROM departments WHERE head_id = ? AND status = 'active' LIMIT 1");
        if (!$departmentStatement) {
            throw new Exception('Unable to load the head department.');
        }
        $departmentStatement->bind_param('i', $senderId);
        $departmentStatement->execute();
        $department = $departmentStatement->get_result()->fetch_assoc();
        $departmentStatement->close();

        if (!$department) {
            sendReportResponse(['success' => false, 'message' => 'No active department is assigned to this head.'], 403);
        }

        $assignedDepartmentId = (int) $department['id'];
        if ($departmentId !== null && $departmentId !== $assignedDepartmentId) {
            sendReportResponse(['success' => false, 'message' => 'You can only send messages from your assigned department.'], 403);
        }
        $departmentId = $assignedDepartmentId;
    }

    $filePath = null;
    if (isset($_FILES['report_file']) && $_FILES['report_file']['error'] !== UPLOAD_ERR_NO_FILE) {
        $file = $_FILES['report_file'];
        $allowedExtensions = ['pdf', 'xls', 'xlsx', 'doc', 'docx'];
        $extension = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
        if ($file['error'] !== UPLOAD_ERR_OK || !in_array($extension, $allowedExtensions, true)) {
            sendReportResponse(['success' => false, 'message' => 'Only PDF, Excel, or Word report files are allowed.'], 400);
        }
        if ((int) $file['size'] > 10 * 1024 * 1024) {
            sendReportResponse(['success' => false, 'message' => 'Report files must be 10 MB or smaller.'], 400);
        }

        $uploadDirectory = __DIR__ . '/../../uploads/reports';
        if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0750, true)) {
            sendReportResponse(['success' => false, 'message' => 'Unable to prepare report storage.'], 500);
        }
        $storedName = bin2hex(random_bytes(16)) . '.' . $extension;
        if (!move_uploaded_file($file['tmp_name'], $uploadDirectory . '/' . $storedName)) {
            sendReportResponse(['success' => false, 'message' => 'Unable to save the report file.'], 500);
        }
        $filePath = 'uploads/reports/' . $storedName;
    }

    $recipientRoleValue = $recipient;
    $recipientIdValue = $recipientId;
    $departmentIdValue = $departmentId;
    $title = 'Report from ' . ucfirst($senderRole);

    $statement = $db->prepare(
        'INSERT INTO notifications (sender_id, sender_role, recipient_id, recipient_role, department_id, title, message, file_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    if (!$statement) throw new Exception('Unable to prepare report notification.');
    $statement->bind_param('isisisss', $senderId, $senderRole, $recipientIdValue, $recipientRoleValue, $departmentIdValue, $title, $message, $filePath);
    if (!$statement->execute()) throw new Exception('Unable to save report notification.');
    $statement->close();

    sendReportResponse(['success' => true, 'message' => 'Report distributed successfully.']);
} catch (Throwable $error) {
    sendReportResponse(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    $db->close();
}
?>
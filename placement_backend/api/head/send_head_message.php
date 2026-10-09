<?php
<<<<<<< HEAD:placement_backend/api/head/send_head_message.php
require_once __DIR__ . '/../../config/db_config.php';
setCorsHeaders();
header('Access-Control-Allow-Credentials: true');
=======
header('Access-Control-Allow-Origin: http://localhost:3000');
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:placment_backend/api/head/send_head_message.php
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

<<<<<<< HEAD:placement_backend/api/head/send_head_message.php
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') headSendResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') headSendResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$senderId = (int) ($_SESSION['user_id'] ?? 0);
$senderRole = strtolower((string) ($_SESSION['role'] ?? ''));
$recipientType = strtolower(trim((string) ($_POST['recipient_type'] ?? '')));
$recipientId = $_POST['recipient_id'] ?? $_POST['student_id'] ?? null;
$studentId = is_numeric($recipientId) ? (int) $recipientId : 0;
$message = trim((string) ($_POST['message'] ?? ''));

if ($senderId <= 0 || !in_array($senderRole, ['head', 'hod', 'coordinator'], true)) headSendResponse(['success' => false, 'message' => 'Only department heads can send messages.'], 403);
if (!in_array($recipientType, ['student', 'all_students', 'registrar'], true)) headSendResponse(['success' => false, 'message' => 'Choose a valid recipient.'], 400);
if ($message === '') headSendResponse(['success' => false, 'message' => 'Enter a message before sending.'], 400);
if (strlen($message) > 10000) headSendResponse(['success' => false, 'message' => 'The message is too long.'], 400);

$db = getDbConnection();
$absoluteFilePath = null;
$transactionStarted = false;
try {
    $departmentStatement = $db->prepare("SELECT id FROM departments WHERE head_id = ? AND status = 'active' LIMIT 1");
    if (!$departmentStatement) throw new Exception('Unable to load the assigned department.');
    $departmentStatement->bind_param('i', $senderId);
    $departmentStatement->execute();
    $department = $departmentStatement->get_result()->fetch_assoc();
    $departmentStatement->close();
    if (!$department) headSendResponse(['success' => false, 'message' => 'No active department is assigned to this head.'], 403);
    $departmentId = (int) $department['id'];
=======
require_once __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:placment_backend/api/head/send_head_message.php

$jsonData = [];
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') === 0) {
    $decodedJson = json_decode(file_get_contents('php://input'), true);
    if (is_array($decodedJson)) {
        $jsonData = $decodedJson;
    }
<<<<<<< HEAD:placement_backend/api/head/send_head_message.php

    $filePath = null;
    if (isset($_FILES['report_file']) && $_FILES['report_file']['error'] !== UPLOAD_ERR_NO_FILE) {
        $file = $_FILES['report_file'];
        $allowedExtensions = ['pdf', 'xls', 'xlsx', 'doc', 'docx'];
        $extension = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
        if ($file['error'] !== UPLOAD_ERR_OK || !in_array($extension, $allowedExtensions, true)) {
            headSendResponse(['success' => false, 'message' => 'Only PDF, Excel, or Word files are allowed.'], 400);
        }
        if ((int) $file['size'] > 10 * 1024 * 1024) {
            headSendResponse(['success' => false, 'message' => 'Attachments must be 10 MB or smaller.'], 400);
        }

        $uploadDirectory = __DIR__ . '/../../uploads/reports';
        if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0750, true)) {
            throw new Exception('Unable to prepare report storage.');
        }
        $storedName = bin2hex(random_bytes(16)) . '.' . $extension;
        $absoluteFilePath = $uploadDirectory . '/' . $storedName;
        if (!move_uploaded_file($file['tmp_name'], $absoluteFilePath)) {
            $absoluteFilePath = null;
            throw new Exception('Unable to save the attachment.');
        }
        $filePath = 'uploads/reports/' . $storedName;
    }

    $db->begin_transaction();
    $transactionStarted = true;
    $statement = $db->prepare('INSERT INTO notifications (sender_id, sender_role, recipient_id, recipient_role, department_id, title, message, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    if (!$statement) throw new Exception('Unable to prepare the message.');
    $title = 'Message from Department Head';
    foreach ($recipientIds as $recipientId) {
        $statement->bind_param('isisisss', $senderId, $senderRole, $recipientId, $recipientRole, $departmentId, $title, $message, $filePath);
        if (!$statement->execute()) throw new Exception('Unable to save the message.');
    }
    $statement->close();
    $db->commit();
    $transactionStarted = false;
    $label = $recipientType === 'registrar' ? 'Registrar' : ($recipientType === 'all_students' ? 'all students' : 'student');
    headSendResponse(['success' => true, 'message' => "Message sent to {$label}."]);
} catch (Throwable $error) {
    if ($transactionStarted) $db->rollback();
    if ($absoluteFilePath !== null && is_file($absoluteFilePath)) unlink($absoluteFilePath);
    error_log('Head send message failed: ' . $error->getMessage());
    headSendResponse(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    $db->close();
=======
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:placment_backend/api/head/send_head_message.php
}

$senderId = (int)($_POST['sender_id'] ?? $jsonData['sender_id'] ?? 0);
$senderRole = 'head';
$rawDeptId = $_POST['dept_id'] ?? $jsonData['dept_id'] ?? null;
$deptId = is_numeric($rawDeptId) && (int)$rawDeptId > 0 ? (int)$rawDeptId : null;
$message = trim((string)($_POST['message'] ?? $jsonData['message'] ?? ''));
$rawTarget = strtolower(trim((string)(
    $_POST['recipient_type']
    ?? $jsonData['recipient_type']
    ?? $_POST['send_to']
    ?? $jsonData['send_to']
    ?? $_POST['recipient_role']
    ?? $jsonData['recipient_role']
    ?? ''
)));

$recipientRole = 'student';
$recipientId = null;
if (in_array($rawTarget, ['registrar', 'registrar office'], true)) {
    $recipientRole = 'registrar';
} elseif (
    in_array($rawTarget, ['all', 'all_students', 'all students', 'all students in department'], true)
    || !empty($_POST['target_all'] ?? $jsonData['target_all'] ?? null)
) {
    if ($deptId === null) {
        echo json_encode(['success' => false, 'message' => 'A department is required to message all students.']);
        $db->close();
        exit;
    }
} elseif (in_array($rawTarget, ['student', 'individual', 'individual student'], true)) {
    $rawRecipientId = $_POST['recipient_id'] ?? $jsonData['recipient_id'] ?? null;
    if (!is_numeric($rawRecipientId) || (int)$rawRecipientId <= 0) {
        echo json_encode(['success' => false, 'message' => 'Select a valid student recipient.']);
        $db->close();
        exit;
    }
    $recipientId = (int)$rawRecipientId;
} else {
    echo json_encode(['success' => false, 'message' => 'Choose a valid recipient.']);
    $db->close();
    exit;
}

$upload = $_FILES['report_file'] ?? null;
if ($message === '' && (!$upload || $upload['error'] === UPLOAD_ERR_NO_FILE)) {
    echo json_encode(['success' => false, 'message' => 'Please enter a message or attach a file.']);
    $db->close();
    exit;
}

$filePath = null;
$absoluteFilePath = null;
if ($upload && $upload['error'] !== UPLOAD_ERR_NO_FILE) {
    if ($upload['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'message' => 'Unable to upload the attachment.']);
        $db->close();
        exit;
    }
    if ((int)$upload['size'] > 10 * 1024 * 1024) {
        echo json_encode(['success' => false, 'message' => 'Attachments must be 10 MB or smaller.']);
        $db->close();
        exit;
    }

    $extension = strtolower(pathinfo((string)$upload['name'], PATHINFO_EXTENSION));
    if (!in_array($extension, ['pdf', 'xls', 'xlsx', 'doc', 'docx'], true)) {
        echo json_encode(['success' => false, 'message' => 'Only PDF, Excel, or Word files are allowed.']);
        $db->close();
        exit;
    }

    $uploadDirectory = __DIR__ . '/../../uploads/reports/';
    if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0750, true)) {
        echo json_encode(['success' => false, 'message' => 'Unable to prepare report storage.']);
        $db->close();
        exit;
    }

    $fileName = bin2hex(random_bytes(16)) . '.' . $extension;
    $absoluteFilePath = $uploadDirectory . $fileName;
    if (!move_uploaded_file($upload['tmp_name'], $absoluteFilePath)) {
        echo json_encode(['success' => false, 'message' => 'Unable to save the attachment.']);
        $db->close();
        exit;
    }
    $filePath = 'uploads/reports/' . $fileName;
}

$title = $recipientRole === 'registrar' ? 'Report from Department Head' : 'Department Notice from Head';
$statement = $db->prepare(
    'INSERT INTO notifications (sender_id, sender_role, recipient_role, recipient_id, department_id, title, message, file_path, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())'
);

if (!$statement) {
    if ($absoluteFilePath !== null && is_file($absoluteFilePath)) {
        unlink($absoluteFilePath);
    }
    echo json_encode(['success' => false, 'message' => 'Unable to prepare the message.']);
    $db->close();
    exit;
}

$statement->bind_param('issiisss', $senderId, $senderRole, $recipientRole, $recipientId, $deptId, $title, $message, $filePath);
if ($statement->execute()) {
    echo json_encode(['success' => true, 'message' => 'Message successfully sent!']);
} else {
    if ($absoluteFilePath !== null && is_file($absoluteFilePath)) {
        unlink($absoluteFilePath);
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $db->error]);
}

$statement->close();
$db->close();
?>
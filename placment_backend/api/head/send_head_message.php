<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

$jsonData = [];
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') === 0) {
    $decodedJson = json_decode(file_get_contents('php://input'), true);
    if (is_array($decodedJson)) {
        $jsonData = $decodedJson;
    }
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
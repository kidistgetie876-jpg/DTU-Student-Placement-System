<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';

function adminMessageResponse(array $payload, int $status = 200): void
{
	http_response_code($status);
	echo json_encode($payload);
	exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') adminMessageResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') adminMessageResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
$adminId = (int) ($_SESSION['user_id'] ?? 0);
$input = $_POST;
if ($input === []) $input = json_decode(file_get_contents('php://input'), true) ?? [];
$subject = trim((string) ($input['subject'] ?? ''));
$message = trim((string) ($input['message'] ?? ''));
$senderRole = strtolower(trim((string) ($input['sender_role'] ?? 'admin')));
$recipientRole = strtolower(trim((string) ($input['recipient_role'] ?? 'registrar')));

if ($adminId <= 0) adminMessageResponse(['success' => false, 'message' => 'You must be logged in as an administrator.'], 401);
if ($message === '') adminMessageResponse(['success' => false, 'message' => 'Write a message before sending.'], 400);
if (mb_strlen($subject) > 180) adminMessageResponse(['success' => false, 'message' => 'The subject must be 180 characters or fewer.'], 400);
if (mb_strlen($message) > 10000) adminMessageResponse(['success' => false, 'message' => 'The message must be 10,000 characters or fewer.'], 400);
if ($senderRole !== 'admin' || $recipientRole !== 'registrar') adminMessageResponse(['success' => false, 'message' => 'Invalid message roles.'], 400);

$absoluteFilePath = null;
try {
	$pdo = getAuditPdo();
	$actor = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
	$actor->execute([':id' => $adminId]);
	$role = strtolower((string) ($actor->fetchColumn() ?: ''));
	if ($role !== 'admin') adminMessageResponse(['success' => false, 'message' => 'Only administrators can send these messages.'], 403);

	$filePath = null;
	if (isset($_FILES['file']) && $_FILES['file']['error'] !== UPLOAD_ERR_NO_FILE) {
		$file = $_FILES['file'];
		$allowedExtensions = ['pdf', 'xls', 'xlsx', 'doc', 'docx'];
		$extension = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
		if ($file['error'] !== UPLOAD_ERR_OK || !in_array($extension, $allowedExtensions, true)) {
			adminMessageResponse(['success' => false, 'message' => 'Only PDF, Excel, or Word files are allowed.'], 400);
		}
		if ((int) $file['size'] > 10 * 1024 * 1024) {
			adminMessageResponse(['success' => false, 'message' => 'Attachments must be 10 MB or smaller.'], 400);
		}

		$uploadDirectory = __DIR__ . '/../../uploads/reports';
		if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0750, true)) {
			adminMessageResponse(['success' => false, 'message' => 'Unable to prepare report storage.'], 500);
		}
		$storedName = bin2hex(random_bytes(16)) . '.' . $extension;
		$absoluteFilePath = $uploadDirectory . '/' . $storedName;
		if (!move_uploaded_file($file['tmp_name'], $absoluteFilePath)) {
			$absoluteFilePath = null;
			adminMessageResponse(['success' => false, 'message' => 'Unable to save the attachment.'], 500);
		}
		$filePath = 'uploads/reports/' . $storedName;
	}

	$title = $subject !== '' ? $subject : 'Message from Admin';
	$statement = $pdo->prepare(
		'INSERT INTO notifications (sender_id, sender_role, recipient_id, recipient_role, title, message, file_path)
		 VALUES (:sender_id, :sender_role, NULL, :recipient_role, :title, :message, :file_path)'
	);
	$statement->execute([
		':sender_id' => $adminId,
		':sender_role' => 'admin',
		':recipient_role' => 'registrar',
		':title' => $title,
		':message' => $message,
		':file_path' => $filePath,
	]);
	adminMessageResponse(['success' => true, 'message' => 'Message sent to the Registrar.']);
} catch (Throwable $error) {
	if ($absoluteFilePath !== null && is_file($absoluteFilePath)) unlink($absoluteFilePath);
	error_log('Admin send message failed: ' . $error->getMessage());
	adminMessageResponse(['success' => false, 'message' => 'Unable to send the message.'], 500);
}
?>

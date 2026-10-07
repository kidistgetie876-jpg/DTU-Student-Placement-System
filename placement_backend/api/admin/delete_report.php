<?php
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';

function deleteAdminReportResponse(array $payload, int $status = 200): void
{
	http_response_code($status);
	echo json_encode($payload);
	exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') deleteAdminReportResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') deleteAdminReportResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
$adminId = (int) ($_SESSION['user_id'] ?? 0);
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$reportId = (int) ($input['report_id'] ?? 0);
if ($adminId <= 0) deleteAdminReportResponse(['success' => false, 'message' => 'You must be logged in as an administrator.'], 401);
if ($reportId <= 0) deleteAdminReportResponse(['success' => false, 'message' => 'A valid message is required.'], 400);

try {
	$pdo = getAuditPdo();
	$actor = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
	$actor->execute([':id' => $adminId]);
	if (strtolower((string) ($actor->fetchColumn() ?: '')) !== 'admin') {
		deleteAdminReportResponse(['success' => false, 'message' => 'Only administrators can delete these messages.'], 403);
	}

	$statement = $pdo->prepare(
		'DELETE FROM notifications
		 WHERE id = :report_id AND (
		   (sender_id = :sender_id AND sender_role = "admin" AND recipient_role = "registrar")
		   OR (recipient_role = "admin" AND (recipient_id = :recipient_id OR recipient_id IS NULL))
		 )'
	);
	$statement->execute([':report_id' => $reportId, ':sender_id' => $adminId, ':recipient_id' => $adminId]);
	if ($statement->rowCount() !== 1) deleteAdminReportResponse(['success' => false, 'message' => 'Message not found or not available to this administrator.'], 404);
	deleteAdminReportResponse(['success' => true, 'message' => 'Message deleted.']);
} catch (Throwable $error) {
	error_log('Admin report delete failed: ' . $error->getMessage());
	deleteAdminReportResponse(['success' => false, 'message' => 'Unable to delete the message.'], 500);
}
?>

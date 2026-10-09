<?php
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';

function adminReportsResponse(array $payload, int $status = 200): void
{
	http_response_code($status);
	echo json_encode($payload);
	exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') adminReportsResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') adminReportsResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
$adminId = (int) ($_SESSION['user_id'] ?? 0);
if ($adminId <= 0) adminReportsResponse(['success' => false, 'message' => 'You must be logged in as an administrator.'], 401);

try {
	$pdo = getAuditPdo();
	$actor = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
	$actor->execute([':id' => $adminId]);
	if (strtolower((string) ($actor->fetchColumn() ?: '')) !== 'admin') {
		adminReportsResponse(['success' => false, 'message' => 'Only administrators can access these messages.'], 403);
	}

	$statement = $pdo->prepare(
		' SELECT id, title, message, sender_role, recipient_role, file_path, is_read, created_at,
				CASE WHEN sender_id = :sent_admin_id AND recipient_role = "registrar" THEN "sent" ELSE "received" END AS direction
			 FROM notifications
		 WHERE (sender_id = :sender_admin_id AND sender_role = "admin" AND recipient_role = "registrar")
			OR (recipient_role = "admin" AND (recipient_id = :recipient_admin_id OR recipient_id IS NULL))
		 ORDER BY created_at DESC, id DESC'
	);
	$statement->execute([
		':sent_admin_id' => $adminId,
		':sender_admin_id' => $adminId,
		':recipient_admin_id' => $adminId,
	]);
	$reports = $statement->fetchAll();
	foreach ($reports as &$report) {
		if (!empty($report['file_path'])) {
			$docRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '';
			$relative = ltrim($report['file_path'], '/');
			$c1 = $docRoot . DIRECTORY_SEPARATOR . 'student-placement' . DIRECTORY_SEPARATOR . 'placement_backend' . DIRECTORY_SEPARATOR . $relative;
			$c2 = $docRoot . DIRECTORY_SEPARATOR . 'placement_backend' . DIRECTORY_SEPARATOR . $relative;
			if ($docRoot && file_exists($c1)) {
				$report['file_url'] = 'http://localhost/student-placement/placement_backend/' . $relative;
			} elseif ($docRoot && file_exists($c2)) {
				$report['file_url'] = 'http://localhost/placement_backend/' . $relative;
			} else {
				$report['file_url'] = 'http://localhost/student-placement/placement_backend/' . $relative;
			}
		}
	}
	adminReportsResponse(['success' => true, 'reports' => $reports]);
} catch (Throwable $error) {
	error_log('Admin reports load failed: ' . $error->getMessage());
	adminReportsResponse(['success' => false, 'message' => 'Unable to load messages.'], 500);
}
?>

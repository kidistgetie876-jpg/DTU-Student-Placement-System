<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';

function markAdminReportResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') markAdminReportResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') markAdminReportResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$adminId = (int) ($_SESSION['user_id'] ?? 0);
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$reportId = (int) ($input['report_id'] ?? 0);
if ($adminId <= 0 || $reportId <= 0) markAdminReportResponse(['success' => false, 'message' => 'A valid administrator and message are required.'], 400);

try {
    $pdo = getAuditPdo();
    $statement = $pdo->prepare(
        'UPDATE notifications SET is_read = 1, read_at = NOW()
         WHERE id = :report_id AND recipient_role = "admin" AND (recipient_id = :admin_id OR recipient_id IS NULL)'
    );
    $statement->execute([':report_id' => $reportId, ':admin_id' => $adminId]);
    if ($statement->rowCount() === 0) markAdminReportResponse(['success' => false, 'message' => 'Message not found.'], 404);
    markAdminReportResponse(['success' => true, 'message' => 'Notification marked as read.']);
} catch (Throwable $error) {
    error_log('Admin report read update failed: ' . $error->getMessage());
    markAdminReportResponse(['success' => false, 'message' => 'Unable to update message status.'], 500);
}
?>
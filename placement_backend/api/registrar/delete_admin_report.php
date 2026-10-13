<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';

function deleteRegistrarAdminReportResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    deleteRegistrarAdminReportResponse(['success' => true]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    deleteRegistrarAdminReportResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$registrarId = (int) ($_SESSION['user_id'] ?? 0);
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$reportId = (int) ($input['report_id'] ?? 0);
if ($registrarId <= 0) {
    deleteRegistrarAdminReportResponse(['success' => false, 'message' => 'You must be logged in as a Registrar.'], 401);
}
if ($reportId <= 0) {
    deleteRegistrarAdminReportResponse(['success' => false, 'message' => 'A valid message is required.'], 400);
}

try {
    $pdo = getAuditPdo();
    $actor = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
    $actor->execute([':id' => $registrarId]);
    if (strtolower((string) ($actor->fetchColumn() ?: '')) !== 'registrar') {
        deleteRegistrarAdminReportResponse(['success' => false, 'message' => 'Only Registrars can delete Admin messages.'], 403);
    }

    $statement = $pdo->prepare(
        'DELETE FROM notifications
         WHERE id = :report_id
           AND sender_role = "admin"
           AND recipient_role = "registrar"
           AND (recipient_id = :registrar_id OR recipient_id IS NULL)'
    );
    $statement->execute([':report_id' => $reportId, ':registrar_id' => $registrarId]);
    if ($statement->rowCount() !== 1) {
        deleteRegistrarAdminReportResponse(['success' => false, 'message' => 'Admin message not found.'], 404);
    }

    deleteRegistrarAdminReportResponse(['success' => true, 'message' => 'Admin message deleted.']);
} catch (Throwable $error) {
    error_log('Registrar Admin message deletion failed: ' . $error->getMessage());
    deleteRegistrarAdminReportResponse(['success' => false, 'message' => 'Unable to delete Admin message.'], 500);
}
?>

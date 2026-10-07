<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';

function deleteRegistrarReportResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') deleteRegistrarReportResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') deleteRegistrarReportResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$registrarId = (int) ($_SESSION['user_id'] ?? 0);
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$reportId = (int) ($input['report_id'] ?? 0);
if ($registrarId <= 0) deleteRegistrarReportResponse(['success' => false, 'message' => 'You must be logged in as a Registrar.'], 401);
if ($reportId <= 0) deleteRegistrarReportResponse(['success' => false, 'message' => 'A valid report is required.'], 400);

try {
    $pdo = getAuditPdo();
    $actor = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
    $actor->execute([':id' => $registrarId]);
    if (strtolower((string) ($actor->fetchColumn() ?: '')) !== 'registrar') {
        deleteRegistrarReportResponse(['success' => false, 'message' => 'Only Registrars can delete sent reports.'], 403);
    }

    $statement = $pdo->prepare(
        'DELETE FROM notifications
         WHERE id = :report_id AND sender_id = :registrar_id AND sender_role = "registrar"'
    );
    $statement->execute([':report_id' => $reportId, ':registrar_id' => $registrarId]);
    if ($statement->rowCount() !== 1) {
        deleteRegistrarReportResponse(['success' => false, 'message' => 'Sent report not found or not owned by this Registrar.'], 404);
    }
    deleteRegistrarReportResponse(['success' => true, 'message' => 'Sent report deleted.']);
} catch (Throwable $error) {
    error_log('Registrar sent report delete failed: ' . $error->getMessage());
    deleteRegistrarReportResponse(['success' => false, 'message' => 'Unable to delete the sent report.'], 500);
}
?>
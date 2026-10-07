<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';

function registrarReportsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') registrarReportsResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') registrarReportsResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$registrarId = (int) ($_SESSION['user_id'] ?? 0);
if ($registrarId <= 0) registrarReportsResponse(['success' => false, 'message' => 'You must be logged in as a Registrar.'], 401);

try {
    $pdo = getAuditPdo();
    $actor = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
    $actor->execute([':id' => $registrarId]);
    if (strtolower((string) ($actor->fetchColumn() ?: '')) !== 'registrar') {
        registrarReportsResponse(['success' => false, 'message' => 'Only Registrars can access these messages.'], 403);
    }

    $statement = $pdo->prepare(
        'SELECT id, title, message, sender_role, is_read, file_path, created_at
         FROM notifications
         WHERE recipient_role = "registrar"
           AND (recipient_id = :registrar_id OR recipient_id IS NULL)
         ORDER BY created_at DESC, id DESC'
    );
    $statement->execute([':registrar_id' => $registrarId]);
    $reports = $statement->fetchAll();
    foreach ($reports as &$report) {
        if (!empty($report['file_path'])) {
            $docRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '';
            $relative = ltrim($report['file_path'], '/');
            $c1 = $docRoot . DIRECTORY_SEPARATOR . 'placment_backend' . DIRECTORY_SEPARATOR . $relative;
            $c2 = $docRoot . DIRECTORY_SEPARATOR . 'placment_backend' . DIRECTORY_SEPARATOR . 'placment_backend' . DIRECTORY_SEPARATOR . $relative;
            if ($docRoot && file_exists($c1)) {
                $report['file_url'] = 'http://localhost/placment_backend/' . $relative;
            } elseif ($docRoot && file_exists($c2)) {
                $report['file_url'] = 'http://localhost/placment_backend/placment_backend/' . $relative;
            } else {
                $report['file_url'] = 'http://localhost/placment_backend/' . $relative;
            }
        }
    }
    unset($report);
    registrarReportsResponse(['success' => true, 'reports' => $reports]);
} catch (Throwable $error) {
    error_log('Registrar reports load failed: ' . $error->getMessage());
    registrarReportsResponse(['success' => false, 'message' => 'Unable to load Admin messages.'], 500);
}
?>
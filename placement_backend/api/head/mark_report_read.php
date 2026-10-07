<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

function markReadResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') markReadResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') markReadResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);

$headId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower((string) ($_SESSION['role'] ?? ''));
if ($headId <= 0 || !in_array($role, ['head', 'hod', 'coordinator'], true)) {
    markReadResponse(['success' => false, 'message' => 'Only department heads can update reports.'], 403);
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$notificationId = (int) ($input['notification_id'] ?? 0);
if ($notificationId <= 0) markReadResponse(['success' => false, 'message' => 'A valid notification is required.'], 400);

$db = getDbConnection();
try {
    $statement = $db->prepare(
        'UPDATE notifications
         SET is_read = 1, read_at = CURRENT_TIMESTAMP
         WHERE id = ? AND (
             recipient_id = ?
             OR (recipient_role = ? AND department_id IS NULL)
             OR (recipient_role = ? AND department_id IN (SELECT id FROM departments WHERE head_id = ?))
         )'
    );
    if (!$statement) throw new Exception('Unable to update report status.');
    $recipientRole = 'head';
    $statement->bind_param('iissi', $notificationId, $headId, $recipientRole, $recipientRole, $headId);
    $statement->execute();
    if ($statement->affected_rows === 0) {
        $statement->close();
        markReadResponse(['success' => false, 'message' => 'Report not found or not addressed to you.'], 404);
    }
    $statement->close();
    markReadResponse(['success' => true]);
} catch (Throwable $error) {
    markReadResponse(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    $db->close();
}
?>
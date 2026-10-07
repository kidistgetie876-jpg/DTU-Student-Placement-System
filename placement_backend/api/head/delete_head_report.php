<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';

function headDeleteResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') headDeleteResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') headDeleteResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$headId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower((string) ($_SESSION['role'] ?? ''));
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$notificationId = (int) ($input['notification_id'] ?? 0);
if ($headId <= 0 || !in_array($role, ['head', 'hod', 'coordinator'], true)) headDeleteResponse(['success' => false, 'message' => 'Only department heads can delete messages.'], 403);
if ($notificationId <= 0) headDeleteResponse(['success' => false, 'message' => 'A valid message is required.'], 400);

$db = getDbConnection();
try {
    $statement = $db->prepare("DELETE FROM notifications WHERE id = ? AND sender_id = ? AND sender_role IN ('head', 'hod', 'coordinator')");
    if (!$statement) throw new Exception('Unable to prepare the delete request.');
    $statement->bind_param('ii', $notificationId, $headId);
    $statement->execute();
    if ($statement->affected_rows !== 1) headDeleteResponse(['success' => false, 'message' => 'Message not found or not sent by this head.'], 404);
    $statement->close();
    headDeleteResponse(['success' => true, 'message' => 'Message deleted.']);
} catch (Throwable $error) {
    headDeleteResponse(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    $db->close();
}
?>
<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';

function studentDeleteResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') studentDeleteResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') studentDeleteResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$studentId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower((string) ($_SESSION['role'] ?? ''));
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$notificationId = (int) ($input['notification_id'] ?? 0);

if ($studentId <= 0 || $role !== 'student') studentDeleteResponse(['success' => false, 'message' => 'Only students can delete notifications.'], 403);
if ($notificationId <= 0) studentDeleteResponse(['success' => false, 'message' => 'A valid notification is required.'], 400);

$db = getDbConnection();
try {
    $statement = $db->prepare(
        "DELETE FROM notifications
         WHERE id = ? AND recipient_id = ? AND recipient_role = 'student'"
    );
    if (!$statement) throw new Exception('Unable to prepare the delete request.');
    $statement->bind_param('ii', $notificationId, $studentId);
    $statement->execute();
    if ($statement->affected_rows !== 1) {
        studentDeleteResponse(['success' => false, 'message' => 'Notification not found or it does not belong to this student.'], 404);
    }
    $statement->close();
    studentDeleteResponse(['success' => true, 'message' => 'Notification deleted.']);
} catch (Throwable $error) {
    studentDeleteResponse(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    $db->close();
}
?>
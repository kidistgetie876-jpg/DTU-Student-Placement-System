<?php
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function profileResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    profileResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    profileResponse(['success' => false, 'message' => 'Authentication is required.'], 401);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    profileResponse(['success' => false, 'message' => 'Database connection failed.'], 500);
}

$statement = $db->prepare(
    "SELECT u.id,
            COALESCE(NULLIF(sd.first_name, ''), u.first_name, '') AS first_name,
            COALESCE(NULLIF(sd.last_name, ''), u.last_name, '') AS last_name,
            u.username, u.email, u.role, u.profile_photo
     FROM users u
     LEFT JOIN student_data sd ON sd.user_id = u.id
     WHERE u.id = ?
     LIMIT 1"
);
if (!$statement) {
    error_log('Unable to prepare current profile query: ' . $db->error);
    profileResponse(['success' => false, 'message' => 'Unable to load profile.'], 500);
}

$statement->bind_param('i', $userId);
if (!$statement->execute()) {
    error_log('Unable to load current profile: ' . $statement->error);
    $statement->close();
    profileResponse(['success' => false, 'message' => 'Unable to load profile.'], 500);
}

$user = $statement->get_result()->fetch_assoc();
$statement->close();
$db->close();

if (!$user) {
    profileResponse(['success' => false, 'message' => 'User account was not found.'], 404);
}

$user['full_name'] = trim((string) $user['first_name'] . ' ' . (string) $user['last_name']);
profileResponse(['success' => true, 'profile' => $user]);

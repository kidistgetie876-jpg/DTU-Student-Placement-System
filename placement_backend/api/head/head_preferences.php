<?php
include __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';
header('Content-Type: application/json; charset=UTF-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    respond(['success' => true]);
}

$db = getDbConnection();
$userId = (int) ($_SESSION['user_id'] ?? 0);

try {
    if ($userId <= 0) {
        respond(['success' => false, 'message' => 'You must be logged in to manage preferences.'], 401);
    }

    $userSql = $db->prepare("SELECT username, role FROM users WHERE id = ? LIMIT 1");
    if (!$userSql) throw new Exception('Unable to validate user account.');
    $userSql->bind_param('i', $userId);
    $userSql->execute();
    $user = $userSql->get_result()->fetch_assoc();
    $userSql->close();

    if (!$user || !in_array(strtolower((string) $user['role']), ['head', 'hod', 'coordinator'], true)) {
        respond(['success' => false, 'message' => 'Only department heads can manage these preferences.'], 403);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $statement = $db->prepare('SELECT notifications, reporting FROM head_preferences WHERE user_id = ? LIMIT 1');
        if (!$statement) throw new Exception('Unable to load preferences.');
        $statement->bind_param('i', $userId);
        $statement->execute();
        $preferences = $statement->get_result()->fetch_assoc() ?: ['notifications' => 1, 'reporting' => 1];
        $statement->close();

        respond([
            'success' => true,
            'preferences' => [
                'notifications' => (bool) $preferences['notifications'],
                'reporting' => (bool) $preferences['reporting'],
            ],
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(['success' => false, 'message' => 'Only GET and POST requests are allowed.'], 405);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $notifications = !empty($input['notifications']) ? 1 : 0;
    $reporting = !empty($input['reporting']) ? 1 : 0;

    $statement = $db->prepare('INSERT INTO head_preferences (user_id, notifications, reporting) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE notifications = VALUES(notifications), reporting = VALUES(reporting)');
    if (!$statement) throw new Exception('Unable to prepare preferences update.');
    $statement->bind_param('iii', $userId, $notifications, $reporting);
    if (!$statement->execute()) {
        $statement->close();
        throw new Exception('Unable to save preferences.');
    }
    $statement->close();

    logActivity($db, $userId, $user['username'], 'head.preferences_update', json_encode([
        'notifications' => (bool) $notifications,
        'reporting' => (bool) $reporting,
    ]));

    respond([
        'success' => true,
        'message' => 'Preferences saved successfully.',
        'preferences' => ['notifications' => (bool) $notifications, 'reporting' => (bool) $reporting],
    ]);
} catch (Throwable $error) {
    respond(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    $db->close();
}
?>

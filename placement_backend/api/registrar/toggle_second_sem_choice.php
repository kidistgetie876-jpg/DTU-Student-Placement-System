<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

function secondSemesterChoiceToggleResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    secondSemesterChoiceToggleResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() === PHP_SESSION_NONE) {
    session_name('DTUPLACEMENTSESSID');
}
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    secondSemesterChoiceToggleResponse(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

try {
    $input = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($input) || !array_key_exists('isOpen', $input) || !is_bool($input['isOpen'])) {
        secondSemesterChoiceToggleResponse([
            'success' => false,
            'message' => 'The request must include a boolean isOpen value.',
        ], 400);
    }

    require_once __DIR__ . '/../../config/db_config.php';
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $columnResult = $db->query("SHOW COLUMNS FROM placement_settings LIKE 'is_second_sem_choice_open'");
    if (!$columnResult) {
        throw new RuntimeException('Unable to inspect the choice portal setting: ' . $db->error);
    }
    $columnExists = $columnResult->num_rows > 0;
    $columnResult->free();
    if (!$columnExists) {
        secondSemesterChoiceToggleResponse([
            'success' => false,
            'message' => 'Apply the second-semester choice portal database migration before changing this setting.',
        ], 503);
    }

    $isOpen = $input['isOpen'] ? 1 : 0;
    $statement = $db->prepare(
        'UPDATE placement_settings SET is_second_sem_choice_open = ? WHERE id = 1'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare the choice portal update: ' . $db->error);
    }
    $statement->bind_param('i', $isOpen);
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to update the choice portal state: ' . $error);
    }
    $statement->close();

    $result = $db->query(
        'SELECT is_second_sem_choice_open FROM placement_settings WHERE id = 1 LIMIT 1'
    );
    if (!$result) {
        throw new RuntimeException('Unable to verify the choice portal state: ' . $db->error);
    }
    $settings = $result->fetch_assoc();
    $result->free();
    if (!$settings) {
        secondSemesterChoiceToggleResponse([
            'success' => false,
            'message' => 'Placement settings row id=1 is missing.',
        ], 503);
    }

    secondSemesterChoiceToggleResponse([
        'success' => true,
        'isOpen' => (bool) $settings['is_second_sem_choice_open'],
        'message' => (bool) $settings['is_second_sem_choice_open']
            ? 'The second-semester choice portal is now open.'
            : 'The second-semester choice portal is now closed.',
    ]);
} catch (Throwable $error) {
    error_log('Second-semester choice portal toggle failed: ' . $error->getMessage());
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
    secondSemesterChoiceToggleResponse([
        'success' => false,
        'message' => 'Unable to update the second-semester choice portal.',
    ], 500);
}

if (isset($db) && $db instanceof mysqli) {
    $db->close();
}
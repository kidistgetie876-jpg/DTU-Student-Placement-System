<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

function activateSecondSemesterResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST, OPTIONS');
    activateSecondSemesterResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
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
    activateSecondSemesterResponse(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$requestBody = (string) file_get_contents('php://input');
$input = json_decode($requestBody, true);
if ($requestBody !== '' && !is_array($input)) {
    activateSecondSemesterResponse([
        'success' => false,
        'message' => 'The request body must be a valid JSON object.',
    ], 400);
}
$requestedSemester = is_array($input) && array_key_exists('semester', $input)
    ? filter_var($input['semester'], FILTER_VALIDATE_INT)
    : 2;
if (!in_array($requestedSemester, [1, 2], true)) {
    activateSecondSemesterResponse([
        'success' => false,
        'message' => 'Semester must be 1 or 2.',
    ], 400);
}

$db = null;
try {
    require_once __DIR__ . '/../../config/db_config.php';
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $columnResult = $db->query("SHOW COLUMNS FROM placement_settings LIKE 'active_semester'");
    if (!$columnResult) {
        throw new RuntimeException('Unable to inspect the active semester setting: ' . $db->error);
    }
    $columnExists = $columnResult->num_rows > 0;
    $columnResult->free();
    if (!$columnExists) {
        $db->close();
        activateSecondSemesterResponse([
            'success' => false,
            'message' => 'Apply the two-stage department placement database migration before changing the active placement semester.',
        ], 503);
    }

    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to begin the semester activation transaction.');
    }
    $settingsResult = $db->query('SELECT active_semester FROM placement_settings WHERE id = 1 LIMIT 1 FOR UPDATE');
    if (!$settingsResult) {
        throw new RuntimeException('Unable to read the active semester setting: ' . $db->error);
    }
    $settings = $settingsResult->fetch_assoc();
    $settingsResult->free();
    if (!$settings) {
        $db->rollback();
        $db->close();
        activateSecondSemesterResponse([
            'success' => false,
            'message' => 'Placement settings row id=1 is missing.',
        ], 503);
    }

    $activeSemester = (int) $settings['active_semester'];
    if (!in_array($activeSemester, [1, 2], true)) {
        $db->rollback();
        $db->close();
        activateSecondSemesterResponse([
            'success' => false,
            'message' => 'The configured active semester is invalid.',
        ], 409);
    }

    if ($activeSemester !== $requestedSemester) {
        $update = $db->prepare('UPDATE placement_settings SET active_semester = ? WHERE id = 1');
        if (!$update) {
            throw new RuntimeException('Unable to prepare the semester activation: ' . $db->error);
        }
        $update->bind_param('i', $requestedSemester);
        if (!$update->execute()) {
            $error = $update->error;
            $update->close();
            throw new RuntimeException('Unable to activate the selected semester: ' . $error);
        }
        $update->close();
    }

    if (!$db->commit()) {
        throw new RuntimeException('Unable to save the active placement semester.');
    }
    $db->close();

    activateSecondSemesterResponse([
        'success' => true,
        'active_semester' => $requestedSemester,
        'message' => "Semester {$requestedSemester} is now active for placement.",
    ]);
} catch (Throwable $error) {
    error_log('Placement semester activation failed: ' . $error->getMessage());
    if ($db instanceof mysqli) {
        $db->rollback();
        $db->close();
    }
    activateSecondSemesterResponse([
        'success' => false,
        'message' => 'Unable to activate the selected placement semester.',
    ], 500);
}

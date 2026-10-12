<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

function placementSettingsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'GET') {
    header('Allow: GET, OPTIONS');
    placementSettingsResponse(['success' => false, 'message' => 'Method not allowed.'], 405);
}

require_once __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

if (!$db instanceof mysqli) {
    placementSettingsResponse(['success' => false, 'message' => 'Placement settings are temporarily unavailable.'], 503);
}

try {
    $result = $db->query('SELECT * FROM placement_settings WHERE id = 1');
    if (!$result) {
        throw new RuntimeException('Unable to load placement settings: ' . $db->error);
    }

    $settings = $result->fetch_assoc() ?: [
        'id' => 1,
        'gpa_weight' => 40,
        'grade_12_weight' => 20,
        'coc_weight' => 30,
        'gender_weight' => 3,
        'disability_weight' => 3,
        'minority_weight' => 4,
        'min_gpa' => 1.75,
    ];
    $settings['min_gpa'] = (float) ($settings['min_gpa'] ?? 1.75);
    $settings['success'] = true;

    $db->close();
    placementSettingsResponse($settings);
} catch (Throwable $error) {
    error_log('Placement settings API error: ' . $error->getMessage());
    $db->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to load placement settings.'], 500);
}
?>

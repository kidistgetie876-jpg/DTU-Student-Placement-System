<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

function placementSettingsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function defaultPlacementSettings(): array
{
    return [
        'gpa_weight' => 40,
        'grade_12_weight' => 20,
        'coc_weight' => 30,
        'gender_weight' => 3,
        'disability_weight' => 3,
        'minority_weight' => 4,
        'min_gpa' => 1.75,
    ];
}

function placementSettingsFallback(string $message): array
{
    $settings = defaultPlacementSettings();
    return [
        'success' => false,
        'fallback' => true,
        'message' => $message,
        'data' => $settings,
    ] + $settings;
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

$db = null;
try {
    require_once __DIR__ . '/../../config/db_config.php';
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection unavailable.');
    }

    $result = $db->query('SELECT * FROM placement_settings WHERE id = 1');
    if (!$result) {
        throw new RuntimeException('Unable to load placement settings: ' . $db->error);
    }

    $settings = $result->fetch_assoc();
    $fallback = $settings === null;
    $settings = $settings ?: defaultPlacementSettings();
    $settings['min_gpa'] = (float) ($settings['min_gpa'] ?? 1.75);

    placementSettingsResponse([
        'success' => true,
        'fallback' => $fallback,
        'data' => $settings,
    ] + $settings);
} catch (Throwable $error) {
    error_log('Placement settings API error: ' . $error->getMessage());
    placementSettingsResponse(placementSettingsFallback('Database connection error. Default placement settings are being used.'));
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>

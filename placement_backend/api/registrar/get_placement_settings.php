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
        'gpa_weight' => 30,
        'grade_12_weight' => 20,
        'g12_total_base' => 600,
        'coc_weight' => 50,
        'gender_weight' => 0,
        'disability_weight' => 0,
        'minority_weight' => 0,
        'max_score_cap' => 100,
        'female_bonus_points' => 5,
        'disability_bonus_points' => 5,
        'developing_region_female_bonus_points' => 10,
        'developing_region_disability_bonus_points' => 10,
        'general_quota_percent' => 80,
        'reserved_female_quota_percent' => 20,
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
    $hasOfficialRules = is_array($settings) && array_key_exists('max_score_cap', $settings);
    $settings = array_merge(defaultPlacementSettings(), $settings ?: []);
    if (!$hasOfficialRules) {
        $settings['gpa_weight'] = 30;
        $settings['grade_12_weight'] = 20;
        $settings['coc_weight'] = 50;
    }
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

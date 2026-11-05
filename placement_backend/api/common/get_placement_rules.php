<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

function placementRulesResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'GET') {
    header('Allow: GET, OPTIONS');
    placementRulesResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

$rules = [];
$db = null;

try {
    require_once __DIR__ . '/../../config/db_config.php';
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection unavailable.');
    }

    $settingsResult = $db->query('SELECT * FROM placement_settings WHERE id = 1 LIMIT 1');
    if (!$settingsResult) {
        throw new RuntimeException('Unable to read placement scoring settings: ' . $db->error);
    }
    $settings = $settingsResult->fetch_assoc();
    $settingsResult->free();
    if (!$settings) {
        throw new RuntimeException('Placement settings have not been configured.');
    }

    $rules = json_decode((string) ($settings['public_rules_json'] ?? ''), true);
    if (!is_array($rules)) {
        throw new RuntimeException('Public placement policies are not configured. Apply the dynamic placement rules migration.');
    }
    foreach ([
        'overview',
        'formula',
        'affirmative_action',
        'choice_preference',
        'capacity_quota',
        'tie_breaking',
        'appeals',
        'publishing',
    ] as $section) {
        if (!isset($rules[$section]) || !is_array($rules[$section])) {
            throw new RuntimeException('Public placement policies are incomplete.');
        }
    }
    if (
        !isset($rules['formula']['components'], $rules['affirmative_action']['bonus_points'])
        || !is_array($rules['formula']['components'])
        || !is_array($rules['affirmative_action']['bonus_points'])
    ) {
        throw new RuntimeException('Public placement policies are incomplete.');
    }
    $weightColumns = [
        'gpa_weight' => 'gpa_weight',
        'grade_12_weight' => 'grade_12_weight',
        'coc_weight' => 'coc_weight',
    ];
    foreach ($rules['formula']['components'] as &$component) {
        $weightKey = is_array($component) ? (string) ($component['weight_key'] ?? '') : '';
        if (!isset($weightColumns[$weightKey]) || !isset($settings[$weightColumns[$weightKey]]) || !is_numeric($settings[$weightColumns[$weightKey]])) {
            throw new RuntimeException('A placement formula component has no configured weight.');
        }
        $component['weight'] = (float) $settings[$weightColumns[$weightKey]];
        if (isset($component['denominator_key'])) {
            $denominatorKey = (string) $component['denominator_key'];
            if ($denominatorKey !== 'g12_total_base' || !isset($settings[$denominatorKey]) || !is_numeric($settings[$denominatorKey])) {
                throw new RuntimeException('A placement formula component has no configured denominator.');
            }
            $component['denominator'] = (float) $settings[$denominatorKey];
        }
    }
    unset($component);
    $bonusColumns = [
        'female_bonus_points',
        'disability_bonus_points',
        'minority_male_bonus_points',
        'minority_female_bonus_points',
        'minority_disability_bonus_points',
        'female_disability_minority_bonus_points',
    ];
    foreach ($rules['affirmative_action']['bonus_points'] as &$bonus) {
        $valueKey = is_array($bonus) ? (string) ($bonus['value_key'] ?? '') : '';
        if (!in_array($valueKey, $bonusColumns, true) || !isset($settings[$valueKey]) || !is_numeric($settings[$valueKey])) {
            throw new RuntimeException('An affirmative-action bonus has no configured point value.');
        }
        $bonus['points'] = (float) $settings[$valueKey];
    }
    unset($bonus);
    $rules['capacity_quota']['general_quota_percent'] = (float) ($settings['general_quota_percent'] ?? 0);
    $rules['capacity_quota']['reserved_female_quota_percent'] = (float) ($settings['reserved_female_quota_percent'] ?? 0);
    $rules['schedule'] = [];
    $rules['appeals']['deadline_start'] = '';
    $rules['appeals']['deadline_end'] = '';

    $portalSettings = $db->query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'public_portal' LIMIT 1"
    );
    if ($portalSettings) {
        $portalRow = $portalSettings->fetch_assoc();
        $portalSettings->free();
        $stored = json_decode((string) ($portalRow['setting_value'] ?? ''), true);
        if (is_array($stored) && isset($stored['placement']) && is_array($stored['placement'])) {
            $rules['schedule'] = $stored['placement'];
            $rules['appeals']['deadline_start'] = (string) ($rules['schedule']['appealStart'] ?? '');
            $rules['appeals']['deadline_end'] = (string) ($rules['schedule']['appealEnd'] ?? '');
        }
    } else {
        error_log('Public placement rules: unable to read portal schedule: ' . $db->error);
    }

    $departmentsResult = $db->query(
        "SELECT id, name, college_name, stream, capacity
         FROM departments
         WHERE status = 'active'
         ORDER BY stream ASC, college_name ASC, name ASC"
    );
    if (!$departmentsResult) {
        throw new RuntimeException('Unable to read public department capacities: ' . $db->error);
    }
    $departments = [];
    while ($department = $departmentsResult->fetch_assoc()) {
        $departments[] = [
            'id' => (int) $department['id'],
            'name' => (string) $department['name'],
            'college_name' => (string) ($department['college_name'] ?? ''),
            'stream' => (string) ($department['stream'] ?? ''),
            'capacity' => (int) $department['capacity'],
        ];
    }
    $departmentsResult->free();
    $rules['capacity_quota']['departments'] = $departments;

    $db->close();
    $db = null;
    placementRulesResponse(['success' => true, 'fallback' => false, 'data' => $rules]);
} catch (Throwable $error) {
    error_log('Public placement rules API error: ' . $error->getMessage());
    if ($db instanceof mysqli) {
        $db->close();
        $db = null;
    }
    placementRulesResponse([
        'success' => false,
        'fallback' => false,
        'message' => 'Live placement rules are temporarily unavailable.',
    ], 503);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>
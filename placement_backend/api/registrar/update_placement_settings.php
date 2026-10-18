<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

function placementSettingsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (!$db instanceof mysqli) {
    placementSettingsResponse(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    placementSettingsResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    placementSettingsResponse(['success' => false, 'message' => 'A valid JSON settings object is required.'], 400);
}

$settingsColumns = [
    'min_gpa' => 'DECIMAL(4,2) NOT NULL DEFAULT 1.75',
    'g12_total_base' => 'DECIMAL(10,2) NOT NULL DEFAULT 600',
    'max_score_cap' => 'DECIMAL(5,2) NOT NULL DEFAULT 100',
    'female_bonus_points' => 'DECIMAL(5,2) NOT NULL DEFAULT 5',
    'disability_bonus_points' => 'DECIMAL(5,2) NOT NULL DEFAULT 5',
    'developing_region_female_bonus_points' => 'DECIMAL(5,2) NOT NULL DEFAULT 10',
    'developing_region_disability_bonus_points' => 'DECIMAL(5,2) NOT NULL DEFAULT 10',
    'general_quota_percent' => 'DECIMAL(5,2) NOT NULL DEFAULT 80',
    'reserved_female_quota_percent' => 'DECIMAL(5,2) NOT NULL DEFAULT 20',
];
foreach ($settingsColumns as $column => $definition) {
    $columnResult = $db->query("SHOW COLUMNS FROM placement_settings LIKE '{$column}'");
    if (!$columnResult || ($columnResult->num_rows === 0 && !$db->query("ALTER TABLE placement_settings ADD COLUMN {$column} {$definition}"))) {
        placementSettingsResponse(['success' => false, 'message' => 'Unable to prepare placement settings schema.'], 500);
    }
}

$weightFields = ['gpa_weight', 'grade_12_weight', 'coc_weight'];
$weights = [];
foreach ($weightFields as $field) {
    $value = $data[$field] ?? null;
    if (!is_numeric($value) || (float) $value < 0 || (float) $value > 100) {
        placementSettingsResponse(['success' => false, 'message' => 'Base placement weights must be numbers between 0 and 100.'], 400);
    }
    $weights[$field] = (float) $value;
}
if (abs(array_sum($weights) - 100.0) > 0.00001) {
    placementSettingsResponse(['success' => false, 'message' => 'Grade 12, CGPA, and COC weights must total 100%.'], 400);
}

$numericFields = [
    'g12_total_base' => 600,
    'max_score_cap' => 100,
    'female_bonus_points' => 5,
    'disability_bonus_points' => 5,
    'developing_region_female_bonus_points' => 10,
    'developing_region_disability_bonus_points' => 10,
    'general_quota_percent' => 80,
    'reserved_female_quota_percent' => 20,
];
$settings = [];
foreach ($numericFields as $field => $defaultValue) {
    $value = $data[$field] ?? $defaultValue;
    $maximum = $field === 'g12_total_base' ? 9999.99 : 100;
    $minimum = $field === 'g12_total_base' ? 0.01 : 0;
    if (!is_numeric($value) || (float) $value < $minimum || (float) $value > $maximum) {
        placementSettingsResponse(['success' => false, 'message' => $field === 'g12_total_base'
            ? 'Grade 12 total base mark must be greater than 0 and no more than 9,999.99.'
            : 'Bonuses, score cap, and quotas must be numbers between 0 and 100.'], 400);
    }
    $settings[$field] = (float) $value;
}
if (abs($settings['general_quota_percent'] + $settings['reserved_female_quota_percent'] - 100.0) > 0.00001) {
    placementSettingsResponse(['success' => false, 'message' => 'General and reserved female quotas must total 100%.'], 400);
}

$scoreColumn = $db->query("SHOW COLUMNS FROM student_data LIKE 'cumulative_score'");
if (!$scoreColumn) {
    error_log('Unable to inspect student_data cumulative_score schema: ' . $db->error);
    $db->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to prepare student score storage.'], 500);
}
if ($scoreColumn->num_rows === 0 && !$db->query(
    'ALTER TABLE student_data ADD COLUMN cumulative_score DECIMAL(6,2) NOT NULL DEFAULT 0'
)) {
    error_log('Unable to add student_data.cumulative_score: ' . $db->error);
    $scoreColumn->free();
    $db->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to prepare student score storage.'], 500);
}
$scoreColumn->free();

if (array_key_exists('min_gpa', $data)) {
    if (!is_numeric($data['min_gpa']) || (float) $data['min_gpa'] < 0 || (float) $data['min_gpa'] > 4) {
        placementSettingsResponse(['success' => false, 'message' => 'Minimum GPA must be between 0 and 4.'], 400);
    }
    $minGpa = (float) $data['min_gpa'];
} else {
    $currentSettings = $db->query('SELECT min_gpa FROM placement_settings WHERE id = 1');
    $currentRow = $currentSettings ? $currentSettings->fetch_assoc() : null;
    $minGpa = (float) ($currentRow['min_gpa'] ?? 1.75);
}

$statement = $db->prepare(
    'UPDATE placement_settings
     SET gpa_weight = ?, grade_12_weight = ?, coc_weight = ?, g12_total_base = ?, gender_weight = 0, disability_weight = 0, minority_weight = 0,
         min_gpa = ?, max_score_cap = ?, female_bonus_points = ?, disability_bonus_points = ?,
         developing_region_female_bonus_points = ?, developing_region_disability_bonus_points = ?,
         general_quota_percent = ?, reserved_female_quota_percent = ?
     WHERE id = 1'
);
if (!$statement) {
    placementSettingsResponse(['success' => false, 'message' => 'Unable to prepare placement settings update.'], 500);
}
if (!$db->begin_transaction()) {
    $statement->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to begin placement settings update.'], 500);
}
$statement->bind_param(
    'dddddddddddd',
    $weights['gpa_weight'],
    $weights['grade_12_weight'],
    $weights['coc_weight'],
    $settings['g12_total_base'],
    $minGpa,
    $settings['max_score_cap'],
    $settings['female_bonus_points'],
    $settings['disability_bonus_points'],
    $settings['developing_region_female_bonus_points'],
    $settings['developing_region_disability_bonus_points'],
    $settings['general_quota_percent'],
    $settings['reserved_female_quota_percent'],
);
if (!$statement->execute()) {
    $error = $statement->error;
    $statement->close();
    $db->rollback();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to save placement settings: ' . $error], 500);
}
$statement->close();

$updateScoresQuery = "
    UPDATE student_data s
    CROSS JOIN placement_settings p
    SET s.cumulative_score = ROUND(LEAST(p.max_score_cap, GREATEST(0,
        (COALESCE(s.total_mark, 0) / p.g12_total_base * p.grade_12_weight) + 
        (COALESCE(s.cgpa, 0) / 4.0 * p.gpa_weight) + 
        (COALESCE(s.coc_score, 0) / 30 * p.coc_weight) +
        (CASE WHEN s.sex = 'Female' THEN p.female_bonus_points ELSE 0 END) +
        (CASE WHEN s.disability = 'Yes' THEN p.disability_bonus_points ELSE 0 END)),
    2)
    WHERE p.id = 1;
";
if (!$db->query($updateScoresQuery)) {
    error_log('Unable to recalculate cumulative student scores: ' . $db->error);
    $db->rollback();
    $db->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to save placement rules and recalculate cumulative scores.'], 500);
}
if (!$db->commit()) {
    error_log('Unable to commit placement settings and cumulative scores: ' . $db->error);
    $db->rollback();
    $db->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to commit placement settings and cumulative scores.'], 500);
}

$updatedSettings = [
    'gpa_weight' => $weights['gpa_weight'],
    'grade_12_weight' => $weights['grade_12_weight'],
    'coc_weight' => $weights['coc_weight'],
    'g12_total_base' => $settings['g12_total_base'],
    'gender_weight' => 0,
    'disability_weight' => 0,
    'minority_weight' => 0,
    'min_gpa' => $minGpa,
    ...$settings,
];
$db->close();
placementSettingsResponse(array_merge(
    ['success' => true, 'message' => 'Rules updated successfully'],
    $updatedSettings,
    ['settings' => $updatedSettings]
));
?>
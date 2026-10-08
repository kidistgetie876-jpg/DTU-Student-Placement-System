<?php
require_once __DIR__ . '/../../config/db_config.php';
setCorsHeaders();
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

require_once __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

function placementSettingsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    $db->close();
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    placementSettingsResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    placementSettingsResponse(['success' => false, 'message' => 'A valid JSON settings object is required.'], 400);
}

$minGpaColumn = $db->query("SHOW COLUMNS FROM placement_settings LIKE 'min_gpa'");
if (!$minGpaColumn) {
    placementSettingsResponse(['success' => false, 'message' => 'Unable to inspect placement settings schema.'], 500);
}
if ($minGpaColumn->num_rows === 0 && !$db->query('ALTER TABLE placement_settings ADD COLUMN min_gpa DECIMAL(4,2) NOT NULL DEFAULT 1.75')) {
    placementSettingsResponse(['success' => false, 'message' => 'Unable to add the minimum GPA placement setting.'], 500);
}

$weightFields = [
    'gpa_weight' => 40,
    'grade_12_weight' => 20,
    'coc_weight' => 30,
    'gender_weight' => 3,
    'disability_weight' => 3,
    'minority_weight' => 4,
];
$weights = [];
foreach ($weightFields as $field => $defaultValue) {
    $value = $data[$field] ?? $defaultValue;
    if (!is_numeric($value) || (float) $value < 0 || (float) $value > 100) {
        placementSettingsResponse(['success' => false, 'message' => 'Placement weights must be numbers between 0 and 100.'], 400);
    }
    $weights[$field] = (float) $value;
}

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
     SET gpa_weight = ?, grade_12_weight = ?, coc_weight = ?, gender_weight = ?, disability_weight = ?, minority_weight = ?, min_gpa = ?
     WHERE id = 1'
);
if (!$statement) {
    placementSettingsResponse(['success' => false, 'message' => 'Unable to prepare placement settings update.'], 500);
}
$statement->bind_param(
    'ddddddd',
    $weights['gpa_weight'],
    $weights['grade_12_weight'],
    $weights['coc_weight'],
    $weights['gender_weight'],
    $weights['disability_weight'],
    $weights['minority_weight'],
    $minGpa
);
if (!$statement->execute()) {
    $error = $statement->error;
    $statement->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to save placement settings: ' . $error], 500);
}
$statement->close();

$updatedSettings = [
    'gpa_weight' => $weights['gpa_weight'],
    'grade_12_weight' => $weights['grade_12_weight'],
    'coc_weight' => $weights['coc_weight'],
    'gender_weight' => $weights['gender_weight'],
    'disability_weight' => $weights['disability_weight'],
    'minority_weight' => $weights['minority_weight'],
    'min_gpa' => $minGpa,
];
$db->close();
placementSettingsResponse(array_merge(
    ['success' => true, 'message' => 'Rules updated successfully'],
    $updatedSettings,
    ['settings' => $updatedSettings]
));
?>
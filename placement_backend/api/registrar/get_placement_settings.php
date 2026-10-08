<?php
require_once __DIR__ . '/../../config/db_config.php';
setCorsHeaders();
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");
require_once __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
	http_response_code(204);
	$db->close();
	exit;
}

$result = $db->query("SELECT * FROM placement_settings WHERE id = 1");
if (!$result) {
	http_response_code(500);
	echo json_encode(['success' => false, 'message' => 'Unable to load placement settings.']);
	$db->close();
	exit;
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

echo json_encode($settings);
$db->close();
?>
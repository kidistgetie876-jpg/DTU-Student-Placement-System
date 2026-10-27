<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

function placementSettingsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST, OPTIONS');
    placementSettingsResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

try {
    require_once __DIR__ . '/../../config/db_config.php';
    $db = getDbConnection();
} catch (Throwable $error) {
    error_log('Placement settings database connection failed: ' . $error->getMessage());
    placementSettingsResponse(['success' => false, 'message' => 'Placement settings are temporarily unavailable. Check the database connection and try again.'], 503);
}

if (!$db instanceof mysqli) {
    error_log('Placement settings database connection returned an invalid handle.');
    placementSettingsResponse(['success' => false, 'message' => 'Placement settings are temporarily unavailable.'], 503);
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
    'minority_bonus_points' => 'DECIMAL(5,2) NOT NULL DEFAULT 5',
    'minority_male_bonus_points' => 'DECIMAL(5,2) NOT NULL DEFAULT 5',
    'minority_female_bonus_points' => 'DECIMAL(5,2) NOT NULL DEFAULT 10',
    'minority_disability_bonus_points' => 'DECIMAL(5,2) NOT NULL DEFAULT 10',
    'female_disability_minority_bonus_points' => 'DECIMAL(5,2) NOT NULL DEFAULT 15',
    'general_quota_percent' => 'DECIMAL(5,2) NOT NULL DEFAULT 80',
    'reserved_female_quota_percent' => 'DECIMAL(5,2) NOT NULL DEFAULT 20',
];
foreach ($settingsColumns as $column => $definition) {
    try {
        $columnResult = $db->query("SHOW COLUMNS FROM placement_settings LIKE '{$column}'");
    } catch (Throwable $error) {
        error_log("Unable to inspect placement_settings.{$column}: " . $error->getMessage());
        placementSettingsResponse(['success' => false, 'message' => 'Unable to inspect the placement settings database schema.'], 503);
    }
    if (!$columnResult) {
        error_log("Unable to inspect placement_settings.{$column}: " . $db->error);
        placementSettingsResponse(['success' => false, 'message' => 'Unable to inspect the placement settings database schema.'], 503);
    }
    if ($columnResult->num_rows === 0) {
        $columnResult->free();
        try {
            $columnAdded = $db->query("ALTER TABLE placement_settings ADD COLUMN {$column} {$definition}");
        } catch (Throwable $error) {
            error_log("Unable to add placement_settings.{$column}: " . $error->getMessage());
            placementSettingsResponse(['success' => false, 'message' => 'Unable to prepare placement settings schema.'], 503);
        }
        if (!$columnAdded) {
            error_log("Unable to add placement_settings.{$column}: " . $db->error);
            placementSettingsResponse(['success' => false, 'message' => 'Unable to prepare placement settings schema.'], 503);
        }
        continue;
    }
    $columnResult->free();
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
    'minority_bonus_points' => 5,
    'minority_male_bonus_points' => 5,
    'minority_female_bonus_points' => 10,
    'minority_disability_bonus_points' => 10,
    'female_disability_minority_bonus_points' => 15,
    'general_quota_percent' => 80,
    'reserved_female_quota_percent' => 20,
];
$settings = [];
foreach ($numericFields as $field => $defaultValue) {
    $value = $field === 'max_score_cap'
        ? ($data['max_cumulative_score'] ?? $data[$field] ?? $defaultValue)
        : ($data[$field] ?? $defaultValue);
    $maximum = $field === 'g12_total_base' ? 9999.99 : 100;
    $minimum = $field === 'g12_total_base' ? 0.01 : 0;
    if (!is_numeric($value) || (float) $value < $minimum || (float) $value > $maximum) {
        placementSettingsResponse([
            'success' => false,
            'message' => $field === 'g12_total_base'
                ? 'Grade 12 total base mark must be greater than 0 and no more than 9,999.99.'
                : 'Maximum cumulative score, bonuses, and quotas must be numbers between 0 and 100.'
        ], 400);
    }
    $settings[$field] = (float) $value;
}
if (abs($settings['general_quota_percent'] + $settings['reserved_female_quota_percent'] - 100.0) > 0.00001) {
    placementSettingsResponse(['success' => false, 'message' => 'General and reserved female quotas must total 100%.'], 400);
}

$scoreColumn = null;
try {
    $scoreColumn = $db->query("SHOW COLUMNS FROM student_data LIKE 'cumulative_score'");
} catch (Throwable $error) {
    error_log('Unable to inspect student_data.cumulative_score schema: ' . $error->getMessage());
    placementSettingsResponse(['success' => false, 'message' => 'Unable to inspect student score storage.'], 503);
}
if (!$scoreColumn) {
    error_log('Unable to inspect student_data cumulative_score schema: ' . $db->error);
    $db->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to prepare student score storage.'], 500);
}
if ($scoreColumn->num_rows === 0) {
    $scoreColumn->free();
    try {
        $scoreAdded = $db->query(
            'ALTER TABLE student_data ADD COLUMN cumulative_score DECIMAL(6,2) NOT NULL DEFAULT 0'
        );
    } catch (Throwable $error) {
        error_log('Unable to add student_data.cumulative_score: ' . $error->getMessage());
        $db->close();
        placementSettingsResponse(['success' => false, 'message' => 'Unable to prepare student score storage.'], 503);
    }
    if (!$scoreAdded) {
        error_log('Unable to add student_data.cumulative_score: ' . $db->error);
        $db->close();
        placementSettingsResponse(['success' => false, 'message' => 'Unable to prepare student score storage.'], 503);
    }
} else {
    $scoreColumn->free();
}

if (array_key_exists('min_gpa', $data)) {
    if (!is_numeric($data['min_gpa']) || (float) $data['min_gpa'] < 0 || (float) $data['min_gpa'] > 4) {
        placementSettingsResponse(['success' => false, 'message' => 'Minimum GPA must be between 0 and 4.'], 400);
    }
    $minGpa = (float) $data['min_gpa'];
} else {
    try {
        $currentSettings = $db->query('SELECT min_gpa FROM placement_settings WHERE id = 1');
    } catch (Throwable $error) {
        error_log('Unable to load current minimum GPA setting: ' . $error->getMessage());
        placementSettingsResponse(['success' => false, 'message' => 'Unable to load the current placement settings.'], 503);
    }
    $currentRow = $currentSettings ? $currentSettings->fetch_assoc() : null;
    $minGpa = (float) ($currentRow['min_gpa'] ?? 1.75);
}

$statement = null;
try {
    $statement = $db->prepare(
        'UPDATE placement_settings
         SET gpa_weight = ?, grade_12_weight = ?, coc_weight = ?, g12_total_base = ?, gender_weight = 0, disability_weight = 0, minority_weight = 0,
             min_gpa = ?, max_score_cap = ?, female_bonus_points = ?, disability_bonus_points = ?,
             minority_bonus_points = ?, minority_male_bonus_points = ?, minority_female_bonus_points = ?,
             minority_disability_bonus_points = ?, female_disability_minority_bonus_points = ?,
             general_quota_percent = ?, reserved_female_quota_percent = ?
         WHERE id = 1'
    );
} catch (Throwable $error) {
    error_log('Unable to prepare placement settings update: ' . $error->getMessage());
    placementSettingsResponse(['success' => false, 'message' => 'Unable to prepare placement settings update.'], 503);
}
if (!$statement) {
    error_log('Unable to prepare placement settings update: ' . $db->error);
    placementSettingsResponse(['success' => false, 'message' => 'Unable to prepare placement settings update.'], 500);
}
try {
    $transactionStarted = $db->begin_transaction();
} catch (Throwable $error) {
    error_log('Unable to begin placement settings update: ' . $error->getMessage());
    $statement->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to begin placement settings update.'], 503);
}
if (!$transactionStarted) {
    error_log('Unable to begin placement settings update: ' . $db->error);
    $statement->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to begin placement settings update.'], 500);
}
$statement->bind_param(
    'ddddddddddddddd',
    $weights['gpa_weight'],
    $weights['grade_12_weight'],
    $weights['coc_weight'],
    $settings['g12_total_base'],
    $minGpa,
    $settings['max_score_cap'],
    $settings['female_bonus_points'],
    $settings['disability_bonus_points'],
    $settings['minority_bonus_points'],
    $settings['minority_male_bonus_points'],
    $settings['minority_female_bonus_points'],
    $settings['minority_disability_bonus_points'],
    $settings['female_disability_minority_bonus_points'],
    $settings['general_quota_percent'],
    $settings['reserved_female_quota_percent'],
);
try {
    $statementExecuted = $statement->execute();
} catch (Throwable $error) {
    $errorMessage = $error->getMessage();
    $statement->close();
    $db->rollback();
    error_log('Unable to save placement settings: ' . $errorMessage);
    placementSettingsResponse(['success' => false, 'message' => 'Unable to save placement settings.'], 503);
}
if (!$statementExecuted) {
    error_log('Unable to save placement settings: ' . $statement->error);
    $statement->close();
    $db->rollback();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to save placement settings.'], 500);
}
$statement->close();

$updateScoresQuery = "
    UPDATE student_data s
    CROSS JOIN placement_settings p
    SET s.cumulative_score = ROUND(LEAST(100.0, GREATEST(0.0, COALESCE(p.max_score_cap, 100.0)), GREATEST(0,
        (LEAST(4.0, GREATEST(0, COALESCE(s.cgpa, 0))) / 4.0 * p.gpa_weight) +
        (LEAST(p.g12_total_base, GREATEST(0, COALESCE(s.total_mark, 0))) / p.g12_total_base * p.grade_12_weight) +
        (LEAST(30.0, GREATEST(0, COALESCE(s.coc_score, 0))) / 30 * p.coc_weight) +
        (CASE
            WHEN (LOWER(TRIM(COALESCE(s.minority, ''))) = 'yes'
                  OR LOWER(COALESCE(s.region, '')) REGEXP '(developing|emerging|afar|somali|gambella|benishangul|harari)')
                 AND LOWER(TRIM(COALESCE(s.sex, ''))) = 'female'
                 AND LOWER(TRIM(COALESCE(s.disability, ''))) = 'yes'
                THEN p.female_disability_minority_bonus_points
            WHEN (LOWER(TRIM(COALESCE(s.minority, ''))) = 'yes'
                  OR LOWER(COALESCE(s.region, '')) REGEXP '(developing|emerging|afar|somali|gambella|benishangul|harari)')
                 AND LOWER(TRIM(COALESCE(s.sex, ''))) = 'female'
                THEN p.minority_female_bonus_points
            WHEN (LOWER(TRIM(COALESCE(s.minority, ''))) = 'yes'
                  OR LOWER(COALESCE(s.region, '')) REGEXP '(developing|emerging|afar|somali|gambella|benishangul|harari)')
                 AND LOWER(TRIM(COALESCE(s.disability, ''))) = 'yes'
                THEN p.minority_disability_bonus_points
            WHEN LOWER(TRIM(COALESCE(s.minority, ''))) = 'yes'
                 OR LOWER(COALESCE(s.region, '')) REGEXP '(developing|emerging|afar|somali|gambella|benishangul|harari)'
                THEN p.minority_male_bonus_points
            ELSE
                (CASE WHEN LOWER(TRIM(COALESCE(s.sex, ''))) = 'female' THEN p.female_bonus_points ELSE 0 END) +
                (CASE WHEN LOWER(TRIM(COALESCE(s.disability, ''))) = 'yes' THEN p.disability_bonus_points ELSE 0 END)
         END))),
    2)
    WHERE p.id = 1;
";
try {
    $scoresUpdated = $db->query($updateScoresQuery);
} catch (Throwable $error) {
    error_log('Unable to recalculate cumulative student scores: ' . $error->getMessage());
    $db->rollback();
    $db->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to recalculate cumulative student scores. Check the student data schema and try again.'], 503);
}
if (!$scoresUpdated) {
    error_log('Unable to recalculate cumulative student scores: ' . $db->error);
    $db->rollback();
    $db->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to recalculate cumulative student scores. Check the student data schema and try again.'], 503);
}
try {
    $transactionCommitted = $db->commit();
} catch (Throwable $error) {
    error_log('Unable to commit placement settings and cumulative scores: ' . $error->getMessage());
    $db->rollback();
    $db->close();
    placementSettingsResponse(['success' => false, 'message' => 'Unable to commit placement settings and cumulative scores.'], 503);
}
if (!$transactionCommitted) {
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
    'max_cumulative_score' => $settings['max_score_cap'],
];
$db->close();
placementSettingsResponse(array_merge(
    ['success' => true, 'message' => 'Rules updated successfully'],
    $updatedSettings,
    ['settings' => $updatedSettings]
));
?>
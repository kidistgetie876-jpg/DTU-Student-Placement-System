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
        'gpa_weight' => 50,
        'grade_12_weight' => 20,
        'g12_total_base' => 600,
        'coc_weight' => 30,
        'gender_weight' => 0,
        'disability_weight' => 0,
        'minority_weight' => 0,
        'max_score_cap' => 100,
        'max_cumulative_score' => 100,
        'female_bonus_points' => 5,
        'disability_bonus_points' => 5,
        'minority_bonus_points' => 5,
        'minority_male_bonus_points' => 5,
        'minority_female_bonus_points' => 10,
        'minority_disability_bonus_points' => 10,
        'female_disability_minority_bonus_points' => 15,
        'general_quota_percent' => 80,
        'reserved_female_quota_percent' => 20,
        'min_gpa' => 1.75,
        'active_semester' => 1,
        'is_second_sem_choice_open' => 0,
        'has_published_results' => false,
        'has_unpublished_results' => false,
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
    $settings = array_merge(defaultPlacementSettings(), $settings ?: []);
    $settings['gpa_weight'] = (float) ($settings['gpa_weight'] ?? 50);
    $settings['grade_12_weight'] = (float) ($settings['grade_12_weight'] ?? 20);
    $settings['coc_weight'] = (float) ($settings['coc_weight'] ?? 30);
    $settings['min_gpa'] = (float) ($settings['min_gpa'] ?? 1.75);
    $settings['max_cumulative_score'] = (float) ($settings['max_score_cap'] ?? 100);
    $settings['active_semester'] = (int) ($settings['active_semester'] ?? 1);
    $settings['is_second_sem_choice_open'] = (int) ($settings['is_second_sem_choice_open'] ?? 0) === 1 ? 1 : 0;
    $settings['has_published_results'] = false;
    $settings['has_unpublished_results'] = false;

    $placementColumnsResult = $db->query('SHOW COLUMNS FROM placement_results');
    if (!$placementColumnsResult) {
        throw new RuntimeException('Unable to inspect placement results: ' . $db->error);
    }
    $placementColumns = array_column($placementColumnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $placementColumnsResult->free();
    if (in_array('is_published', $placementColumns, true)) {
        $semesterCondition = in_array('placement_semester', $placementColumns, true)
            ? ' WHERE placement_semester = ' . (int) $settings['active_semester']
            : '';
        $statusExpression = in_array('status', $placementColumns, true)
            ? "LOWER(TRIM(COALESCE(status, ''))) = 'published'"
            : '0 = 1';
        $publicationResult = $db->query(
            'SELECT '
            . "MAX(CASE WHEN COALESCE(is_published, 0) = 1 OR {$statusExpression} THEN 1 ELSE 0 END) AS has_published, "
            . "MAX(CASE WHEN COALESCE(is_published, 0) = 0 AND NOT ({$statusExpression}) THEN 1 ELSE 0 END) AS has_unpublished "
            . "FROM placement_results{$semesterCondition}"
        );
        if (!$publicationResult) {
            throw new RuntimeException('Unable to load placement publication status: ' . $db->error);
        }
        $publicationState = $publicationResult->fetch_assoc() ?: [];
        $publicationResult->free();
        $settings['has_published_results'] = (bool) ($publicationState['has_published'] ?? false);
        $settings['has_unpublished_results'] = (bool) ($publicationState['has_unpublished'] ?? false);
    }
    $allocationTableResult = $db->query("SHOW TABLES LIKE 'placement_college_allocations'");
    if (!$allocationTableResult) {
        throw new RuntimeException('Unable to inspect pending placement allocations: ' . $db->error);
    }
    $hasAllocationTable = $allocationTableResult->num_rows > 0;
    $allocationTableResult->free();
    if ($hasAllocationTable) {
        $allocationColumnsResult = $db->query('SHOW COLUMNS FROM placement_college_allocations');
        if (!$allocationColumnsResult) {
            throw new RuntimeException('Unable to inspect pending placement allocations: ' . $db->error);
        }
        $allocationColumns = array_column($allocationColumnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
        $allocationColumnsResult->free();
        if (
            in_array('target_semester', $allocationColumns, true)
            && in_array('status', $allocationColumns, true)
        ) {
            $allocationStatusCondition = $settings['active_semester'] === 1
                ? "LOWER(TRIM(status)) = 'pending'"
                : "LOWER(TRIM(status)) IN ('placed', 'unassigned')";
            $allocationRerunResult = $db->query(
                "SELECT COUNT(*) AS rerun_count FROM placement_college_allocations
                 WHERE target_semester = 2 AND {$allocationStatusCondition}"
            );
            if (!$allocationRerunResult) {
                throw new RuntimeException('Unable to load placement allocation status: ' . $db->error);
            }
            $settings['has_unpublished_results'] = $settings['has_unpublished_results']
                || (int) ($allocationRerunResult->fetch_assoc()['rerun_count'] ?? 0) > 0;
            $allocationRerunResult->free();
        }
    }

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
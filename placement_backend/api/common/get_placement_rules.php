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

function defaultPublicPlacementRules(): array
{
    return [
        'formula' => [
            'gpa_weight' => 50,
            'grade_12_weight' => 20,
            'coc_weight' => 30,
            'g12_total_base' => 600,
            'max_cumulative_score' => 100,
        ],
        'affirmative_action' => [
            'female_bonus_points' => 5,
            'disability_bonus_points' => 5,
            'minority_male_bonus_points' => 5,
            'minority_female_bonus_points' => 10,
            'minority_disability_bonus_points' => 10,
            'female_disability_minority_bonus_points' => 15,
            'description' => 'Without minority or emerging-region status, eligible female and disability bonuses are added together. For students with minority or emerging-region status, the applicable combined scenario amount is used instead of stacking separate bonuses.',
        ],
        'choice_preference' => [
            'title' => 'Department Choice Preference Order Policy',
            'details' => [
                'Eligible students are considered in descending order of total merit score.',
                'For each student, the system checks the submitted department choices in preference order: 1st, then 2nd, then 3rd.',
                'The student is assigned to the highest-ranked choice with an eligible stream, matching scope, and available quota/capacity.',
                'If all listed choices are full or ineligible, the student remains unassigned for review.',
            ],
        ],
        'capacity_quota' => [
            'title' => 'Department Intake Capacity and Quota Management',
            'general_quota_percent' => 80,
            'reserved_female_quota_percent' => 20,
            'details' => [
                'Department capacity is the maximum number of students assigned to that department.',
                'The configured general quota is open to eligible students; the reserved female quota is held for female students.',
                'The reserved quota is rounded up to a whole seat and cannot exceed the department capacity.',
                'Placements stop when the applicable quota or the department’s remaining capacity is exhausted.',
                'Existing placements count against capacity; capacities and quota percentages are managed by the university.',
            ],
            'departments' => [],
        ],
        'tie_breaking' => [
            'title' => 'Tie-Breaking Policy',
            'criteria' => [
                'Higher CGPA',
                'Higher Grade 12 examination result',
                'Higher COC / relevant specific-subject score',
            ],
            'details' => 'If these measures are also equal, the placement system applies its additional affirmative-action priority rules.',
        ],
        'appeals' => [
            'title' => 'Appeals Policy and Criteria',
            'criteria' => [
                'A suspected error in the placement score or its underlying academic records.',
                'Missing or incorrect eligibility, affirmative-action, or student profile information.',
                'A concern that submitted department choices or capacity rules were not applied correctly.',
            ],
            'submission' => 'Sign in to the student portal and submit an appeal to the Registrar with a clear explanation and supporting evidence.',
            'deadline_start' => '2026-08-27',
            'deadline_end' => '2026-08-30',
            'deadline_note' => 'Appeals must be submitted within the published appeal window. Check the dates below and university announcements for any approved changes.',
        ],
        'publishing' => [
            'title' => 'Provisional and Official Result Publishing',
            'provisional' => 'Placement outcomes produced during processing are provisional and remain subject to verification and Registrar review.',
            'official' => 'Results become official only after the Registrar publishes them in the system. Students should rely on the published result in their portal.',
            'appeal' => 'Use the appeal process during the published appeal window if you identify a result or record issue.',
        ],
        'schedule' => [
            'submissionStart' => '2026-10-01',
            'submissionDeadline' => '2026-10-11',
            'processingStart' => '2026-08-16',
            'processingEnd' => '2026-08-24',
            'resultsDate' => '2026-08-27',
            'appealStart' => '2026-08-27',
            'appealEnd' => '2026-08-30',
        ],
    ];
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

$rules = defaultPublicPlacementRules();
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
    $settings = $settingsResult->fetch_assoc() ?: [];
    foreach ([
        'gpa_weight',
        'grade_12_weight',
        'coc_weight',
        'g12_total_base',
        'max_score_cap',
        'female_bonus_points',
        'disability_bonus_points',
        'minority_male_bonus_points',
        'minority_female_bonus_points',
        'minority_disability_bonus_points',
        'female_disability_minority_bonus_points',
        'general_quota_percent',
        'reserved_female_quota_percent',
    ] as $key) {
        if (isset($settings[$key]) && is_numeric($settings[$key])) {
            if ($key === 'max_score_cap') {
                $rules['formula']['max_cumulative_score'] = min(100, max(0, (float) $settings[$key]));
            } elseif (isset($rules['formula'][$key])) {
                $rules['formula'][$key] = (float) $settings[$key];
            } elseif (isset($rules['affirmative_action'][$key])) {
                $rules['affirmative_action'][$key] = (float) $settings[$key];
            } elseif (isset($rules['capacity_quota'][$key])) {
                $rules['capacity_quota'][$key] = (float) $settings[$key];
            }
        }
    }
    if (isset($settings['minority_bonus_points']) && is_numeric($settings['minority_bonus_points'])) {
        $rules['affirmative_action']['minority_male_bonus_points'] = (float) $settings['minority_bonus_points'];
    }
    $settingsResult->free();

    $portalSettings = $db->query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'public_portal' LIMIT 1"
    );
    if ($portalSettings) {
        $portalRow = $portalSettings->fetch_assoc();
        $portalSettings->free();
        $stored = json_decode((string) ($portalRow['setting_value'] ?? ''), true);
        if (is_array($stored) && isset($stored['placement']) && is_array($stored['placement'])) {
            $rules['schedule'] = array_merge($rules['schedule'], $stored['placement']);
            $rules['appeals']['deadline_start'] = $rules['schedule']['appealStart'];
            $rules['appeals']['deadline_end'] = $rules['schedule']['appealEnd'];
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
        'fallback' => true,
        'message' => 'Live placement rules are temporarily unavailable. Default rules are provided.',
        'data' => $rules,
    ], 503);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>
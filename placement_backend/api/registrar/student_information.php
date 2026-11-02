<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/placement_scoring.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
header('Content-Type: application/json; charset=UTF-8');

function studentInformationRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    studentInformationRespond(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    studentInformationRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    studentInformationRespond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

try {
    $settingsResult = $db->query(
        'SELECT gpa_weight, grade_12_weight, coc_weight, g12_total_base, max_score_cap, female_bonus_points, disability_bonus_points, minority_bonus_points,
                minority_male_bonus_points, minority_female_bonus_points, minority_disability_bonus_points,
                female_disability_minority_bonus_points
         FROM placement_settings WHERE id = 1 LIMIT 1'
    );
    if (!$settingsResult) {
        throw new RuntimeException('Unable to load placement scoring rules: ' . $db->error);
    }
    $settings = $settingsResult->fetch_assoc() ?: [];
    $settingsResult->free();
    $scoreRules = [
        'gpa_weight' => (float) ($settings['gpa_weight'] ?? 50),
        'grade_12_weight' => (float) ($settings['grade_12_weight'] ?? 20),
        'coc_weight' => (float) ($settings['coc_weight'] ?? 30),
        'g12_total_base' => (float) ($settings['g12_total_base'] ?? 600),
        'max_score_cap' => (float) ($settings['max_score_cap'] ?? 100),
        'female_bonus_points' => (float) ($settings['female_bonus_points'] ?? 5),
        'disability_bonus_points' => (float) ($settings['disability_bonus_points'] ?? 5),
        'minority_bonus_points' => (float) ($settings['minority_bonus_points'] ?? 5),
        'minority_male_bonus_points' => (float) ($settings['minority_male_bonus_points'] ?? 5),
        'minority_female_bonus_points' => (float) ($settings['minority_female_bonus_points'] ?? 10),
        'minority_disability_bonus_points' => (float) ($settings['minority_disability_bonus_points'] ?? 10),
        'female_disability_minority_bonus_points' => (float) ($settings['female_disability_minority_bonus_points'] ?? 15),
    ];

    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    $placementColumns = studentPlacementTableColumns($db, 'placement_results');
    $placementIdentityConditions = [];
    if (in_array('user_id', $studentColumns, true) && in_array('student_id', $placementColumns, true)) {
        $placementIdentityConditions[] = 'pr.student_id = sd.user_id';
    }
    foreach (['admission_number', 'id_number'] as $studentIdentity) {
        if (!in_array($studentIdentity, $studentColumns, true)) {
            continue;
        }
        foreach (['admission_number', 'id_number'] as $placementIdentity) {
            if (in_array($placementIdentity, $placementColumns, true)) {
                $placementIdentityConditions[] = "TRIM(pr.`{$placementIdentity}`) = TRIM(sd.`{$studentIdentity}`)";
            }
        }
    }
    $assignedDepartmentConditions = [];
    foreach (['dept_id', 'department_id'] as $departmentIdColumn) {
        if (in_array($departmentIdColumn, $placementColumns, true)) {
            $assignedDepartmentConditions[] = "COALESCE(pr.`{$departmentIdColumn}`, 0) > 0";
        }
    }
    foreach (['dept_name', 'department_name'] as $departmentNameColumn) {
        if (in_array($departmentNameColumn, $placementColumns, true)) {
            $assignedDepartmentConditions[] = "NULLIF(TRIM(COALESCE(pr.`{$departmentNameColumn}`, '')), '') IS NOT NULL";
        }
    }
    if (in_array('placement_status', $studentColumns, true)
        && $placementIdentityConditions
        && $assignedDepartmentConditions) {
        $validPlacementConditions = [
            '(' . implode(' OR ', $placementIdentityConditions) . ')',
            '(' . implode(' OR ', $assignedDepartmentConditions) . ')',
        ];
        if (in_array('status', $placementColumns, true)) {
            $validPlacementConditions[] = "LOWER(TRIM(COALESCE(pr.status, ''))) NOT IN ('rejected', 'cancelled', 'canceled')";
        }
        $placementResultMatch = 'EXISTS (
            SELECT 1 FROM placement_results pr
            WHERE ' . implode(' AND ', $validPlacementConditions) . '
        )';
        $approvedPlacementResultMatch = in_array('status', $placementColumns, true)
            ? 'EXISTS (
                SELECT 1 FROM placement_results pr
                WHERE ' . implode(' AND ', $validPlacementConditions) . "
                  AND LOWER(TRIM(COALESCE(pr.status, ''))) IN ('approved', 'published')
            )"
            : '0 = 1';
        $studentStatusSql = "LOWER(TRIM(REPLACE(REPLACE(COALESCE(sd.placement_status, ''), '_', ' '), '-', ' ')))";
        if (!$db->query(
            "UPDATE student_data sd
             SET sd.placement_status = CASE WHEN {$approvedPlacementResultMatch}
                 THEN 'Approved' ELSE 'Pending Approval' END
             WHERE {$studentStatusSql} IN ('pending 2nd semester', 'pending second semester')
               AND {$placementResultMatch}"
        )) {
            throw new RuntimeException('Unable to synchronize placed student statuses: ' . $db->error);
        }
    }

    $universityIdExpression = in_array('student_id', $studentColumns, true) ? 'student_id' : 'NULL';
    $moeAdmissionExpression = in_array('moe_admission_number', $studentColumns, true)
        ? 'moe_admission_number'
        : (in_array('admission_number', $studentColumns, true) ? 'admission_number' : 'NULL');
    $admissionExpression = in_array('admission_number', $studentColumns, true) ? 'admission_number' : 'NULL';
    $availableIdentityExpressions = array_values(array_filter([
        $admissionExpression !== 'NULL' ? "({$admissionExpression} IS NOT NULL AND {$admissionExpression} <> '')" : null,
        $moeAdmissionExpression !== 'NULL' ? "({$moeAdmissionExpression} IS NOT NULL AND {$moeAdmissionExpression} <> '')" : null,
        $universityIdExpression !== 'NULL' ? "({$universityIdExpression} IS NOT NULL AND {$universityIdExpression} <> '')" : null,
    ]));
    $identityFilter = $availableIdentityExpressions ? implode(' OR ', $availableIdentityExpressions) : '1 = 0';
    $searchTerm = trim((string) ($_GET['search'] ?? ''));
    $searchExpressions = array_values(array_filter([
        $universityIdExpression !== 'NULL' ? $universityIdExpression : null,
        $moeAdmissionExpression !== 'NULL' ? $moeAdmissionExpression : null,
        $admissionExpression !== 'NULL' ? $admissionExpression : null,
    ]));
    $searchCondition = '';
    $searchValues = [];
    if ($searchTerm !== '' && $searchExpressions) {
        $searchCondition = ' AND (' . implode(
            ' OR ',
            array_map(
                static fn(string $expression): string => "LOWER(COALESCE(NULLIF(TRIM({$expression}), ''), '')) LIKE ?",
                $searchExpressions
            )
        ) . ')';
        $searchValues = array_fill(
            0,
            count($searchExpressions),
            '%' . strtolower($searchTerm) . '%'
        );
    }

    $studentQuery = "SELECT id AS student_data_id,
                {$universityIdExpression} AS student_id,
                {$universityIdExpression} AS university_student_id,
                {$moeAdmissionExpression} AS moe_admission_number,
                {$admissionExpression} AS admission_number,
                given_name AS given_name,
                father_name AS father_name,
                grandfather_name AS grandfather_name,
                region AS region,
                sex AS sex,
                COALESCE(NULLIF(TRIM(field_of_study), ''), '') AS field_of_study,
                total_mark AS total_mark,
                cgpa AS cgpa,
                coc_score AS coc_score,
                cumulative_score AS cumulative_score,
                disability AS disability,
                minority AS minority,
                placement_status AS placement_status
         FROM student_data
         WHERE ({$identityFilter}){$searchCondition}
         ORDER BY COALESCE(NULLIF({$universityIdExpression}, ''), {$admissionExpression})";
    if ($searchValues) {
        $searchStatement = $db->prepare($studentQuery);
        if (!$searchStatement) {
            throw new RuntimeException('Unable to prepare student search query: ' . $db->error);
        }
        $bindings = [str_repeat('s', count($searchValues))];
        foreach (array_keys($searchValues) as $index) {
            $bindings[] = &$searchValues[$index];
        }
        if (!call_user_func_array([$searchStatement, 'bind_param'], $bindings)) {
            throw new RuntimeException('Unable to bind student search parameters.');
        }
        if (!$searchStatement->execute()) {
            throw new RuntimeException('Unable to search student records: ' . $searchStatement->error);
        }
        $result = $searchStatement->get_result();
    } else {
        $result = $db->query($studentQuery);
    }
    if (!$result) {
        throw new RuntimeException('Unable to query official student records: ' . $db->error);
    }
    $persistScore = $db->prepare(
        'UPDATE student_data SET cumulative_score = ? WHERE id = ?'
    );
    if (!$persistScore) {
        throw new RuntimeException('Unable to prepare cumulative score persistence: ' . $db->error);
    }
    $students = [];
    while ($student = $result->fetch_assoc()) {
        foreach (['cgpa', 'coc_score', 'total_mark', 'cumulative_score'] as $scoreColumn) {
            $student[$scoreColumn] = is_numeric($student[$scoreColumn] ?? null)
                ? (float) $student[$scoreColumn]
                : null;
        }
        $student['female_flag'] = strtolower(trim((string) $student['sex'])) === 'female';
        $student['disability_flag'] = placementScoringFlag($student['disability']);
        $student['minority_flag'] = placementScoringFlag($student['minority'])
            || placementScoringFlag($student['region']);
        $hasScores = is_numeric($student['cgpa'])
            && is_numeric($student['total_mark'])
            && is_numeric($student['coc_score']);
        $student['score_breakdown'] = $hasScores
            ? calculatePlacementScoreBreakdown(
                (float) $student['cgpa'],
                (float) $student['total_mark'],
                (float) $student['coc_score'],
                (string) $student['sex'],
                $student['disability_flag'],
                $student['minority_flag'],
                $scoreRules
            )
            : null;
        if ($student['score_breakdown'] !== null) {
            $student['cumulative_score'] = $student['score_breakdown']['cumulative_score'];
            $persistedScore = (float) $student['cumulative_score'];
            $studentDataId = (int) $student['student_data_id'];
            $persistScore->bind_param('di', $persistedScore, $studentDataId);
            if (!$persistScore->execute()) {
                throw new RuntimeException(
                    'Unable to persist cumulative score for student_data row ' . $studentDataId . ': ' . $persistScore->error
                );
            }
        }
        $students[] = $student;
    }
    $result->free();
    if (isset($searchStatement)) {
        $searchStatement->close();
    }
    $persistScore->close();
    $db->close();
    studentInformationRespond(['success' => true, 'students' => $students]);
} catch (Throwable $error) {
    error_log('Registrar student information failed: ' . $error->getMessage());
    $db->close();
    studentInformationRespond(['success' => false, 'message' => 'Unable to load student records.'], 500);
}
<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
header('Content-Type: application/json; charset=UTF-8');

function placementPreviewRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

$requestMethod = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if (!in_array($requestMethod, ['GET', 'POST'], true)) {
    header('Allow: GET, POST, OPTIONS');
    placementPreviewRespond(['success' => false, 'message' => 'Only GET and POST requests are allowed.'], 405);
}
$requestData = $_GET;
if ($requestMethod === 'POST') {
    $requestBody = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($requestBody)) {
        placementPreviewRespond(['success' => false, 'message' => 'The candidate preview request is invalid.'], 400);
    }
    $requestData = array_merge($requestData, $requestBody);
}
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ((int) ($_SESSION['user_id'] ?? 0) <= 0) {
    placementPreviewRespond(['success' => false, 'message' => 'Your session has expired. Please sign in again.'], 401);
}
if ($role !== 'registrar' && $role !== 'admin') {
    placementPreviewRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

require_once __DIR__ . '/../../config/placement_scoring.php';
$db = null;
try {
    $db = getDbConnection();
} catch (Throwable $error) {
    error_log('Placement preview database connection failed: ' . $error->getMessage());
}
if (!$db instanceof mysqli) {
    placementPreviewRespond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

$isDevelopingRegion = static function (string $region, string $benefitGroup): bool {
    $source = strtolower($region . ' ' . $benefitGroup);
    if (preg_match('/developing|emerging|\byes\b|minority/', $source)) {
        return true;
    }
    return (bool) preg_match('/\b(afar|somali|gambella|benishangul[\s-]*gumuz|benishangul|harari)\b/', $region);
};
$containsBenefit = static function (string $benefitGroup, array $terms): bool {
    $value = strtolower($benefitGroup);
    foreach ($terms as $term) {
        if (strpos($value, $term) !== false) {
            return true;
        }
    }
    return false;
};

try {
    $settings = [];
    try {
        $settingsResult = $db->query(
            'SELECT gpa_weight, grade_12_weight, coc_weight, g12_total_base, max_score_cap, female_bonus_points, disability_bonus_points, minority_bonus_points,
                    minority_male_bonus_points, minority_female_bonus_points, minority_disability_bonus_points,
                    female_disability_minority_bonus_points
             FROM placement_settings WHERE id = 1 LIMIT 1'
        );
        if ($settingsResult) {
            $settings = $settingsResult->fetch_assoc() ?: [];
            $settingsResult->free();
        }
    } catch (Throwable $error) {
        error_log('Placement preview scoring settings unavailable; using placement policy defaults: ' . $error->getMessage());
    }
    $g12TotalBase = max(0.01, (float) ($settings['g12_total_base'] ?? 600));
    $gpaWeight = (float) ($settings['gpa_weight'] ?? 50);
    $grade12Weight = (float) ($settings['grade_12_weight'] ?? 20);
    $cocWeight = (float) ($settings['coc_weight'] ?? 30);
    $maxScoreCap = (float) ($settings['max_score_cap'] ?? 100);
    $femaleBonusPoints = (float) ($settings['female_bonus_points'] ?? 5);
    $disabilityBonusPoints = (float) ($settings['disability_bonus_points'] ?? 5);
    $minorityBonusPoints = (float) ($settings['minority_bonus_points'] ?? 5);
    $minorityMaleBonusPoints = (float) ($settings['minority_male_bonus_points'] ?? 5);
    $minorityFemaleBonusPoints = (float) ($settings['minority_female_bonus_points'] ?? 10);
    $minorityDisabilityBonusPoints = (float) ($settings['minority_disability_bonus_points'] ?? 10);
    $femaleDisabilityMinorityBonusPoints = (float) ($settings['female_disability_minority_bonus_points'] ?? 15);

    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    $userColumns = studentPlacementTableColumns($db, 'users');
    $mosheColumns = studentPlacementTableColumns($db, 'moshe_students');
    $simsColumns = studentPlacementTableColumns($db, 'sims_students');
    $placementColumns = studentPlacementTableColumns($db, 'placement_results');
    if (!in_array('id', $userColumns, true)) {
        throw new RuntimeException('Student profile tables are missing the required account identifier columns.');
    }

    $admissionExpression = studentPlacementTextExpression($studentColumns, 'sd', ['moe_admission_number', 'admission_number', 'id_number']);
    $universityStudentIdExpression = studentPlacementTextExpression($studentColumns, 'sd', ['student_id']);
    if (in_array('id_number', $userColumns, true)) {
        $admissionExpression = "COALESCE(NULLIF({$admissionExpression}, ''), NULLIF(u.id_number, ''), '')";
    }
    if (in_array('user_id', $studentColumns, true)) {
        $userIdentityMatches = ['u.id = sd.user_id'];
        if (in_array('id_number', $userColumns, true)) {
            foreach (['student_id', 'moe_admission_number', 'admission_number', 'id_number'] as $profileIdentifierColumn) {
                if (in_array($profileIdentifierColumn, $studentColumns, true)) {
                    $userIdentityMatches[] = "TRIM(u.id_number) = TRIM(sd.`{$profileIdentifierColumn}`)";
                }
            }
        }
        $userJoin = 'LEFT JOIN users u ON (' . implode(' OR ', $userIdentityMatches)
            . ") AND LOWER(TRIM(u.role)) = 'student'";
        $studentAccountId = 'COALESCE(u.id, sd.user_id)';
    } elseif (in_array('id_number', $studentColumns, true) && in_array('id_number', $userColumns, true)) {
        $userJoin = "LEFT JOIN users u ON TRIM(u.id_number) = TRIM(sd.id_number) AND LOWER(TRIM(u.role)) = 'student'";
        $studentAccountId = 'u.id';
    } elseif (in_array('admission_number', $studentColumns, true) && in_array('id_number', $userColumns, true)) {
        $userJoin = "LEFT JOIN users u ON TRIM(u.id_number) = TRIM(sd.admission_number) AND LOWER(TRIM(u.role)) = 'student'";
        $studentAccountId = 'u.id';
    } else {
        throw new RuntimeException('Student profiles cannot be matched to student accounts.');
    }
    $mosheJoin = '';
    if (in_array('admission_number', $mosheColumns, true)) {
        $mosheJoin = " LEFT JOIN moshe_students m ON TRIM(m.admission_number) = TRIM({$admissionExpression})";
        $admissionExpression = "COALESCE(NULLIF({$admissionExpression}, ''), m.admission_number, '')";
    }
    $simsJoin = '';
    if (in_array('student_id', $simsColumns, true)) {
        $simsJoin = " LEFT JOIN sims_students s ON TRIM(s.student_id) = TRIM({$admissionExpression})"
            . ($universityStudentIdExpression !== 'NULL'
                ? " OR TRIM(s.student_id) = TRIM({$universityStudentIdExpression})"
                : '');
    }
    $officialName = [];
    foreach (['given_name', 'father_name', 'grandfather_name', 'first_name', 'last_name'] as $column) {
        if (in_array($column, $studentColumns, true)) {
            $officialName[] = "NULLIF(sd.`{$column}`, '')";
        }
    }
    if ($mosheJoin !== '') {
        foreach (['given_name', 'father_name', 'grand_father_name'] as $column) {
            if (in_array($column, $mosheColumns, true)) {
                $officialName[] = "NULLIF(m.`{$column}`, '')";
            }
        }
    }
    if (in_array('first_name', $userColumns, true)) {
        $officialName[] = "NULLIF(u.first_name, '')";
    }
    $nameExpression = $officialName
        ? "CONCAT_WS(' ', " . implode(', ', $officialName) . ')'
        : "COALESCE(u.username, 'Student')";
    $regionExpression = studentPlacementTextExpression($studentColumns, 'sd', ['region']);
    $genderExpression = studentPlacementTextExpression($studentColumns, 'sd', ['sex', 'gender']);
    $disabilityExpression = studentPlacementTextExpression($studentColumns, 'sd', ['disability'], "'No'");
    $minorityExpression = studentPlacementTextExpression($studentColumns, 'sd', ['minority'], "'No'");
    $benefitExpression = studentPlacementTextExpression($studentColumns, 'sd', ['benefit_group', 'minority'], "'None'");
    $fieldExpression = studentPlacementTextExpression($studentColumns, 'sd', ['field_of_study', 'stream']);
    $grade12Expression = studentPlacementColumnExpression($studentColumns, 'sd', ['total_mark', 'grade_12_result']);
    $cgpaExpression = studentPlacementColumnExpression($studentColumns, 'sd', ['cgpa', 'gpa']);
    $cocExpression = studentPlacementColumnExpression($studentColumns, 'sd', ['coc_score', 'coc_result']);
    $streamExpression = studentPlacementTextExpression($studentColumns, 'sd', ['stream']);
    $programExpression = 'NULL';
    $yearExpression = 'NULL';
    $registrationExpression = 'NULL';
    $studentIdExpression = 'NULL';
    if ($simsJoin !== '') {
        $cgpaExpression = studentPlacementColumnExpression($simsColumns, 's', ['cgpa'], $cgpaExpression);
        $cocExpression = studentPlacementColumnExpression($simsColumns, 's', ['coc_score'], $cocExpression);
        $streamExpression = studentPlacementTextExpression($simsColumns, 's', ['stream'], $streamExpression);
        $studentIdExpression = studentPlacementColumnExpression($simsColumns, 's', ['student_id']);
        $programExpression = studentPlacementColumnExpression($simsColumns, 's', ['program']);
        $yearExpression = studentPlacementColumnExpression($simsColumns, 's', ['year']);
        $registrationExpression = studentPlacementColumnExpression($simsColumns, 's', ['registration_type']);
    }
    $primaryStudentIdExpression = "COALESCE(NULLIF({$universityStudentIdExpression}, ''), NULLIF({$studentIdExpression}, ''), '')";
    if ($mosheJoin !== '') {
        $regionExpression = studentPlacementTextExpression($mosheColumns, 'm', ['region'], $regionExpression);
        $genderExpression = studentPlacementTextExpression($mosheColumns, 'm', ['sex'], $genderExpression);
        $benefitExpression = studentPlacementTextExpression($mosheColumns, 'm', ['benefit_group'], $benefitExpression);
        $grade12Expression = studentPlacementColumnExpression($mosheColumns, 'm', ['total_mark'], $grade12Expression);
        $fieldExpression = studentPlacementTextExpression($mosheColumns, 'm', ['field_of_study'], $fieldExpression);
    }
    if (in_array('status', $studentColumns, true)) {
        $statusCondition = " AND LOWER(TRIM(COALESCE(sd.status, ''))) NOT IN ('inactive', 'disabled', 'placed', 'approved')";
    } else {
        $statusCondition = '';
    }
    $placementCondition = in_array('student_id', $placementColumns, true)
        ? " AND NOT EXISTS (SELECT 1 FROM placement_results pr WHERE pr.student_id = {$studentAccountId})"
        : '';
    $readRequestedIdentifiers = static function ($value): array {
        if (!is_array($value)) {
            $value = $value === null ? [] : [$value];
        }
        $identifiers = [];
        foreach ($value as $item) {
            if (!is_scalar($item)) {
                continue;
            }
            $identifier = trim((string) $item);
            if ($identifier !== '') {
                $identifiers[$identifier] = $identifier;
            }
        }
        return array_values($identifiers);
    };
    $requestedStudentIds = $readRequestedIdentifiers($requestData['student_ids'] ?? []);
    $requestedAdmissionNumbers = $readRequestedIdentifiers($requestData['admission_numbers'] ?? []);
    $hasCandidateFilter = $requestedStudentIds || $requestedAdmissionNumbers;
    $candidateConditions = [];
    $filterTypes = '';
    $filterValues = [];
    foreach (
        [
            [$primaryStudentIdExpression, $requestedStudentIds],
            [$admissionExpression, $requestedAdmissionNumbers],
        ] as [$identifierExpression, $identifiers]
    ) {
        if (!$identifiers) {
            continue;
        }
        $candidateConditions[] = $identifierExpression . ' IN (' . implode(', ', array_fill(0, count($identifiers), '?')) . ')';
        $filterTypes .= str_repeat('s', count($identifiers));
        array_push($filterValues, ...$identifiers);
    }
    $candidateCondition = $candidateConditions
        ? ' AND (' . implode(' OR ', $candidateConditions) . ')'
        : '';
    $defaultCandidateConditions = $hasCandidateFilter
        ? ''
        : $statusCondition . $placementCondition;
    $statement = $db->prepare(
        "SELECT {$studentAccountId} AS user_id, {$admissionExpression} AS admission_number,
                {$admissionExpression} AS moe_admission_number,
                {$primaryStudentIdExpression} AS student_id,
                {$primaryStudentIdExpression} AS university_student_id,
                {$regionExpression} AS region, {$nameExpression} AS full_name,
                {$genderExpression} AS sex, {$disabilityExpression} AS disability,
                {$minorityExpression} AS minority, {$grade12Expression} AS total_mark,
                {$benefitExpression} AS benefit_group, {$fieldExpression} AS field_of_study,
                {$cgpaExpression} AS cgpa,
                {$cocExpression} AS coc_score, {$programExpression} AS program,
                {$streamExpression} AS stream, {$yearExpression} AS year,
                {$registrationExpression} AS registration_type
         FROM student_data sd
         {$userJoin}
         {$mosheJoin}{$simsJoin}
         WHERE 1 = 1{$defaultCandidateConditions}{$candidateCondition}
         ORDER BY admission_number"
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare joined import records: ' . $db->error);
    }
    if ($filterValues && !$statement->bind_param($filterTypes, ...$filterValues)) {
        throw new RuntimeException('Unable to bind candidate identifiers: ' . $statement->error);
    }
    if (!$statement->execute()) {
        throw new RuntimeException('Unable to load joined import records: ' . $statement->error);
    }
    $result = $statement->get_result();

    $students = [];
    while ($row = $result->fetch_assoc()) {
        $hasScores = $row['cgpa'] !== null && $row['coc_score'] !== null && $row['total_mark'] !== null;
        $cgpa = $row['cgpa'] !== null ? (float) $row['cgpa'] : null;
        $coc = $row['coc_score'] !== null ? (float) $row['coc_score'] : null;
        $grade12 = $row['total_mark'] !== null ? (float) $row['total_mark'] : null;
        $benefits = (string) $row['benefit_group'];
        $isFemale = strtolower(trim((string) $row['sex'])) === 'female';
        $hasDisability = placementScoringFlag($row['disability'])
            || $containsBenefit($benefits, ['disability', 'disabled']);
        $isDeveloping = placementScoringFlag($row['minority'])
            || $isDevelopingRegion((string) $row['region'], $benefits);
        $scoreRules = [
            'gpa_weight' => $gpaWeight,
            'grade_12_weight' => $grade12Weight,
            'coc_weight' => $cocWeight,
            'g12_total_base' => $g12TotalBase,
            'max_score_cap' => $maxScoreCap,
            'femaleBonusPoints' => $femaleBonusPoints,
            'disabilityBonusPoints' => $disabilityBonusPoints,
            'minorityBonusPoints' => $minorityBonusPoints,
            'minorityMaleBonusPoints' => $minorityMaleBonusPoints,
            'minorityFemaleBonusPoints' => $minorityFemaleBonusPoints,
            'minorityDisabilityBonusPoints' => $minorityDisabilityBonusPoints,
            'femaleDisabilityMinorityBonusPoints' => $femaleDisabilityMinorityBonusPoints,
        ];
        $bonusBreakdown = getPlacementAffirmativeActionBonusBreakdown(
            (string) $row['sex'],
            $hasDisability,
            $isDeveloping,
            $scoreRules
        );
        $score = null;
        if ($hasScores) {
            $score = calculatePlacementCumulativeScore(
                (float) $cgpa,
                (float) $grade12,
                (float) $coc,
                $isFemale ? 'Female' : (string) $row['sex'],
                $hasDisability,
                $isDeveloping,
                $scoreRules
            );
        }
        $students[] = [
            'admissionNumber' => $row['admission_number'],
            'student_id' => $row['student_id'],
            'universityStudentId' => $row['university_student_id'],
            'userId' => $row['user_id'],
            'name' => trim((string) $row['full_name']),
            'region' => $row['region'],
            'sex' => $row['sex'],
            'totalMark' => $grade12,
            'benefitGroup' => $benefits,
            'fieldOfStudy' => $row['field_of_study'],
            'studentId' => $row['student_id'],
            'cgpa' => $cgpa,
            'cocScore' => $coc,
            'program' => $row['program'],
            'stream' => $row['stream'],
            'year' => $row['year'],
            'registrationType' => $row['registration_type'],
            'femaleBonus' => $bonusBreakdown['female_bonus'],
            'disabilityBonus' => $bonusBreakdown['disability_bonus'],
            'minorityBonus' => $bonusBreakdown['minority_bonus'],
            'scenarioBonus' => $bonusBreakdown['scenario_bonus'],
            'appliedScenario' => $bonusBreakdown['applied_scenario'],
            'cumulativeScore' => $score,
            'ready' => $hasScores,
        ];
    }
    $result->free();
    $statement->close();
    $db->close();
    placementPreviewRespond(['success' => true, 'students' => $students]);
} catch (Throwable $error) {
    error_log('Placement preview failed: ' . $error->getMessage());
    $db->close();
    placementPreviewRespond(['success' => false, 'message' => 'Unable to load the pre-placement score preview.'], 500);
}

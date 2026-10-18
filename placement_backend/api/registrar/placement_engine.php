<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
/**
 * placement_engine.php - የዲባር (DTU) የምደባ አልጎሪዝም
 * ተማሪዎችን በውጤት (Merit) አበጥሮ በዲፓርትመንት ኮታ መሰረት ይመድባል።
 */

include __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/placement_scoring.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
header('Content-Type: application/json');

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ((int) ($_SESSION['user_id'] ?? 0) <= 0 || ($role !== 'registrar' && $role !== 'admin')) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Registrar access is required']);
    exit;
}

$db = getDbConnection();
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !is_array($input)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
    exit;
}

function loadPlacementWeights(mysqli $db, array $inputRules): array
{
    $weights = [
        'gpaWeight' => 30.0,
        'grade12Weight' => 20.0,
        'cocWeight' => 50.0,
        'g12_total_base' => 600.0,
        'maxScoreCap' => 100.0,
        'femaleBonusPoints' => 5.0,
        'disabilityBonusPoints' => 5.0,
        'developingRegionFemaleBonusPoints' => 10.0,
        'developingRegionDisabilityBonusPoints' => 10.0,
        'generalQuotaPercent' => 80.0,
        'reservedFemaleQuotaPercent' => 20.0,
        'minGpa' => 1.75,
    ];
    $aliases = [
        'gpa' => 'gpaWeight', 'gpaweight' => 'gpaWeight',
        'grade12' => 'grade12Weight', 'grade12weight' => 'grade12Weight', 'grade12result' => 'grade12Weight',
        'coc' => 'cocWeight', 'cocweight' => 'cocWeight', 'cocresult' => 'cocWeight',
        'maxscorecap' => 'maxScoreCap', 'maxscorecaplimit' => 'maxScoreCap',
        'femalebonuspoints' => 'femaleBonusPoints',
        'disabilitybonuspoints' => 'disabilityBonusPoints',
        'developingregionfemalebonuspoints' => 'developingRegionFemaleBonusPoints',
        'developingregiondisabilitybonuspoints' => 'developingRegionDisabilityBonusPoints',
        'generalquotapercent' => 'generalQuotaPercent',
        'reservedfemalequotapercent' => 'reservedFemaleQuotaPercent',
    ];

    foreach ($inputRules as $key => $value) {
        $normalizedKey = strtolower(preg_replace('/[^a-z0-9]/', '', (string) $key));
        if (isset($aliases[$normalizedKey]) && is_numeric($value) && (float) $value >= 0 && (float) $value <= 100) {
            $weights[$aliases[$normalizedKey]] = (float) $value;
        }
    }

    $result = null;
    try {
        $result = $db->query('SELECT gpa_weight, grade_12_weight, coc_weight, g12_total_base, max_score_cap, female_bonus_points, disability_bonus_points, developing_region_female_bonus_points, developing_region_disability_bonus_points, general_quota_percent, reserved_female_quota_percent, min_gpa FROM placement_settings WHERE id = 1 LIMIT 1');
    } catch (Throwable $error) {
        error_log('Official placement settings unavailable; using policy defaults: ' . $error->getMessage());
    }
    if ($result) {
        $row = $result->fetch_assoc();
        $columns = [
            'gpaWeight' => 'gpa_weight',
            'grade12Weight' => 'grade_12_weight',
            'cocWeight' => 'coc_weight',
            'g12_total_base' => 'g12_total_base',
            'maxScoreCap' => 'max_score_cap',
            'femaleBonusPoints' => 'female_bonus_points',
            'disabilityBonusPoints' => 'disability_bonus_points',
            'developingRegionFemaleBonusPoints' => 'developing_region_female_bonus_points',
            'developingRegionDisabilityBonusPoints' => 'developing_region_disability_bonus_points',
            'generalQuotaPercent' => 'general_quota_percent',
            'reservedFemaleQuotaPercent' => 'reserved_female_quota_percent',
            'minGpa' => 'min_gpa',
        ];
        foreach ($columns as $key => $column) {
            if (isset($row[$column]) && is_numeric($row[$column]) && (float) $row[$column] >= 0) {
                $weights[$key] = (float) $row[$column];
            }
        }
    }

    if (abs($weights['gpaWeight'] + $weights['grade12Weight'] + $weights['cocWeight'] - 100.0) > 0.00001) {
        $weights['gpaWeight'] = 30.0;
        $weights['grade12Weight'] = 20.0;
        $weights['cocWeight'] = 50.0;
    }
    if ($weights['maxScoreCap'] > 100.0) {
        $weights['maxScoreCap'] = 100.0;
    }
    if (abs($weights['generalQuotaPercent'] + $weights['reservedFemaleQuotaPercent'] - 100.0) > 0.00001) {
        $weights['generalQuotaPercent'] = 80.0;
        $weights['reservedFemaleQuotaPercent'] = 20.0;
    }
    if ($weights['minGpa'] > 4.0) {
        $weights['minGpa'] = 1.75;
    }
    return $weights;
}

$rules = loadPlacementWeights($db, $input['rules'] ?? []);

foreach ($rules as $key => $value) {
    if (!is_numeric($value) || (float)$value < 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid weight value for ' . $key]);
        exit;
    }
}

function normalizeDepartmentName($value): string
{
    return strtolower(trim((string) $value));
}

function normalizeYesNo($value): bool
{
    if (is_bool($value)) return $value;
    if (is_numeric($value)) return (int) $value !== 0;
    $normalized = strtolower(trim((string) $value));
    return in_array($normalized, ['yes', 'y', 'true', '1', 'on'], true);
}

function isDevelopingRegion($value): bool
{
    if (is_bool($value)) {
        return $value;
    }
    if (is_numeric($value)) {
        return (int) $value !== 0;
    }
    $normalized = strtolower(trim((string) $value));
    return in_array($normalized, ['yes', 'y', 'true', '1', 'on', 'minority', 'developing', 'developing_region', 'developingregion'], true)
        || (bool) preg_match('/\b(afar|somali|gambella|benishangul[\s-]*gumuz|benishangul|harari)\b/', $normalized);
}

function normalizeScorePercent($value, float $maximum): float
{
    if (is_bool($value)) {
        return $value ? 100.0 : 0.0;
    }
    $normalized = strtolower(trim((string) $value));
    if (in_array($normalized, ['yes', 'y', 'true', 'on'], true)) {
        return 100.0;
    }
    if (in_array($normalized, ['', 'no', 'n', 'false', 'off'], true)) {
        return 0.0;
    }

    $score = (float) $value;
    return min(100.0, max(0.0, ($score / $maximum) * 100.0));
}

function calculateOfficialPlacementScore(float $gpa, float $grade12, float $coc, string $gender, $disability, $developingRegion, array $rules): float
{
    return calculatePlacementCumulativeScore(
        $gpa,
        $grade12,
        $coc,
        $gender,
        $disability,
        $developingRegion,
        $rules
    );
}

function computeMeritScore(array $student, array $rules): float
{
    $gpa = (float) ($student['cgpa'] ?? $student['gpa'] ?? 0);
    $grade12 = (float) ($student['grade12'] ?? $student['grade_12_result'] ?? $student['grade_12'] ?? 0);
    $coc = (float) ($student['coc'] ?? $student['coc_result'] ?? 0);
    $gender = trim((string) ($student['gender'] ?? ''));
    $disability = $student['hasDisability'] ?? $student['disability'] ?? false;
    $developingRegion = $student['developingRegion'] ?? $student['minority'] ?? $student['is_minority'] ?? false;

    return calculateOfficialPlacementScore($gpa, $grade12, $coc, $gender, $disability, $developingRegion, $rules);
}

try {
    $placementLock = $db->query("SELECT GET_LOCK('placement_engine', 10) AS lock_acquired");
    if (!$placementLock || (int) $placementLock->fetch_assoc()['lock_acquired'] !== 1) {
        throw new Exception('Another placement run is already in progress');
    }

    $db->begin_transaction();

    $departmentRows = [];
    $deptRes = $db->query("SELECT id, name, college_name, stream, capacity FROM departments WHERE status = 'active' FOR UPDATE");
    if (!$deptRes) {
        throw new Exception('Unable to load department capacities');
    }
    while ($row = $deptRes->fetch_assoc()) {
        $departmentRows[] = $row;
    }

    $selectedCollege = trim((string) ($input['selectedCollege'] ?? ''));
    $scopedDepartments = array_values(array_filter($departmentRows, function ($department) use ($selectedCollege) {
        return $selectedCollege === '' || strtolower($selectedCollege) === 'all'
            || normalizeDepartmentName($department['college_name'] ?? '') === normalizeDepartmentName($selectedCollege);
    }));
    if (empty($scopedDepartments)) {
        throw new Exception('No active departments found for the selected college');
    }
    $departmentsWithCapacity = array_filter($scopedDepartments, function ($department) {
        return (int) ($department['capacity'] ?? 0) > 0;
    });
    if (empty($departmentsWithCapacity)) {
        throw new Exception('No active departments with capacity greater than zero were found for the selected college');
    }

    $departmentMap = [];
    foreach ($departmentRows as $department) {
        $key = normalizeDepartmentName($department['name'] ?? $department['department'] ?? $department['id'] ?? '');
        if ($key === '') continue;
        $departmentMap[$key] = [
            'id' => (int) ($department['id'] ?? 0),
            'name' => (string) ($department['name'] ?? $department['department'] ?? ''),
            'college_name' => (string) ($department['college_name'] ?? $department['college'] ?? $department['collegeName'] ?? ''),
            'stream' => (string) ($department['stream'] ?? ''),
            'capacity' => max(0, (int) ($department['capacity'] ?? 0)),
        ];
    }

    $studentEntries = $input['students'] ?? [];
    if (!is_array($studentEntries) || empty($studentEntries)) {
        $studentDataColumns = studentPlacementTableColumns($db, 'student_data');
        $userColumns = studentPlacementTableColumns($db, 'users');
        if (in_array('user_id', $studentDataColumns, true)) {
            $profileJoin = 'INNER JOIN student_data sd ON sd.user_id = u.id';
        } elseif (in_array('id_number', $studentDataColumns, true) && in_array('id_number', $userColumns, true)) {
            $profileJoin = 'INNER JOIN student_data sd ON TRIM(sd.id_number) = TRIM(u.id_number)';
        } elseif (in_array('admission_number', $studentDataColumns, true) && in_array('id_number', $userColumns, true)) {
            $profileJoin = 'INNER JOIN student_data sd ON TRIM(sd.admission_number) = TRIM(u.id_number)';
        } else {
            throw new Exception('Student profiles cannot be matched to student accounts');
        }
        $fallbackAdmission = studentPlacementTextExpression($studentDataColumns, 'sd', ['admission_number', 'id_number']);
        if (in_array('id_number', $userColumns, true)) {
            $fallbackAdmission = "COALESCE(NULLIF({$fallbackAdmission}, ''), u.id_number, '')";
        }
        $fallbackFirstName = studentPlacementTextExpression($studentDataColumns, 'sd', ['given_name', 'first_name']);
        $fallbackLastName = studentPlacementTextExpression($studentDataColumns, 'sd', ['father_name', 'last_name']);
        $fallbackName = "COALESCE(NULLIF(TRIM(CONCAT_WS(' ', {$fallbackFirstName}, {$fallbackLastName})), ''), 'Student')";
        $fallbackEmail = studentPlacementTextExpression($studentDataColumns, 'sd', ['email']);
        if (in_array('email', $userColumns, true)) {
            $fallbackEmail = "COALESCE(NULLIF({$fallbackEmail}, ''), u.email, '')";
        }
        $fallbackGender = studentPlacementTextExpression($studentDataColumns, 'sd', ['sex', 'gender']);
        $fallbackStream = studentPlacementTextExpression($studentDataColumns, 'sd', ['stream', 'field_of_study']);
        $fallbackGpa = studentPlacementColumnExpression($studentDataColumns, 'sd', ['cgpa', 'gpa'], '0');
        $fallbackGrade12 = studentPlacementColumnExpression($studentDataColumns, 'sd', ['total_mark', 'grade_12_result'], '0');
        $fallbackCoc = studentPlacementColumnExpression($studentDataColumns, 'sd', ['coc_score', 'coc_result'], '0');
        $fallbackStatus = in_array('status', $studentDataColumns, true)
            ? " AND LOWER(TRIM(COALESCE(sd.status, ''))) NOT IN ('inactive', 'disabled', 'placed', 'approved')"
            : '';
        $studentSql = "SELECT u.id AS id, {$fallbackAdmission} AS id_number, {$fallbackName} AS name,
                {$fallbackEmail} AS email, {$fallbackGender} AS gender, {$fallbackStream} AS stream,
                " . studentPlacementColumnExpression($studentDataColumns, 'sd', ['disability'], '0') . " AS disability,
                " . studentPlacementColumnExpression($studentDataColumns, 'sd', ['minority'], '0') . " AS minority,
                {$fallbackGpa} AS gpa, {$fallbackGrade12} AS grade12, {$fallbackCoc} AS coc,
                " . studentPlacementColumnExpression($studentDataColumns, 'sd', ['cumulative_avg', 'cumulative_score'], '0') . " AS cumulative_score
            FROM users u
            {$profileJoin}
            WHERE LOWER(TRIM(u.role)) = 'student'{$fallbackStatus}
              AND NOT EXISTS (SELECT 1 FROM placement_results pr WHERE pr.student_id = u.id)
            ORDER BY u.id ASC";

        $studentRes = $db->query($studentSql);
        if ($studentRes && $studentRes->num_rows > 0) {
            while ($row = $studentRes->fetch_assoc()) {
                $studentEntries[] = [
                    'id' => $row['id'],
                    'id_number' => $row['id_number'] ?? null,
                    'name' => $row['name'] ?? '',
                    'email' => $row['email'] ?? '',
                    'gender' => $row['gender'] ?? '',
                    'stream' => $row['stream'] ?? '',
                    'hasDisability' => $row['disability'] ?? false,
                    'minority' => $row['minority'] ?? false,
                    'cgpa' => $row['gpa'] ?? 0,
                    'cumulative_score' => $row['cumulative_score'] ?? 0,
                    'grade12' => $row['grade12'] ?? 0,
                    'coc' => $row['coc'] ?? 0,
                    'preferences' => [],
                ];
            }
        }
    }

    $selectedStudentIds = $input['selectedStudentIds'] ?? [];
    if (!is_array($selectedStudentIds) || empty($selectedStudentIds)) {
        throw new Exception('Select at least one candidate student before running placement');
    }
    $selectedSet = array_map('strval', $selectedStudentIds);
    $studentEntries = array_values(array_filter($studentEntries, function ($student) use ($selectedSet) {
        return in_array((string) ($student['id'] ?? ''), $selectedSet, true);
    }));

    if (empty($studentEntries)) {
        throw new Exception('No eligible students found for placement');
    }

    $studentAccountCheck = $db->prepare(
        "SELECT id FROM users WHERE id = ? AND LOWER(TRIM(role)) = 'student' LIMIT 1"
    );
    if (!$studentAccountCheck) {
        throw new Exception('Unable to validate student accounts for placement');
    }
    foreach ($studentEntries as $student) {
        $studentId = trim((string) ($student['id'] ?? $student['student_id'] ?? ''));
        if ($studentId === '' || !ctype_digit($studentId)) {
            $studentAccountCheck->close();
            throw new Exception('Selected student records must be linked to a student account before placement');
        }
        $studentAccountCheck->bind_param('s', $studentId);
        if (!$studentAccountCheck->execute() || !$studentAccountCheck->get_result()->fetch_assoc()) {
            $studentAccountCheck->close();
            throw new Exception('A selected student account could not be verified; no placement was run');
        }
    }
    $studentAccountCheck->close();

    $allStudents = [];
    $mosheColumns = studentPlacementTableColumns($db, 'moshe_students');
    $simsColumns = studentPlacementTableColumns($db, 'sims_students');
    $choiceColumns = studentPlacementTableColumns($db, 'student_choices');
    $departmentColumns = studentPlacementTableColumns($db, 'departments');
    $studentDataIdentityColumn = in_array('user_id', $studentDataColumns, true)
        ? 'user_id'
        : (in_array('admission_number', $studentDataColumns, true)
            ? 'admission_number'
            : (in_array('id_number', $studentDataColumns, true) ? 'id_number' : ''));
    if ($studentDataIdentityColumn === '') {
        throw new Exception('Student profiles cannot be updated because they have no supported identifier');
    }
    if (!in_array('id', $userColumns, true)) {
        throw new Exception('Student accounts are missing the required account identifier column');
    }
    if (in_array('user_id', $studentDataColumns, true)) {
        $profileJoin = 'INNER JOIN student_data sd ON sd.user_id = u.id';
    } elseif (in_array('id_number', $studentDataColumns, true) && in_array('id_number', $userColumns, true)) {
        $profileJoin = 'INNER JOIN student_data sd ON TRIM(sd.id_number) = TRIM(u.id_number)';
    } elseif (in_array('admission_number', $studentDataColumns, true) && in_array('id_number', $userColumns, true)) {
        $profileJoin = 'INNER JOIN student_data sd ON TRIM(sd.admission_number) = TRIM(u.id_number)';
    } else {
        throw new Exception('Student profiles cannot be matched to student accounts');
    }

    foreach ($studentEntries as $student) {
        $id = $student['id'] ?? $student['student_id'] ?? null;
        if ($id === null || $id === '') {
            continue;
        }

        $admissionExpression = studentPlacementTextExpression($studentDataColumns, 'sd', ['admission_number', 'id_number']);
        if (in_array('id_number', $userColumns, true)) {
            $admissionExpression = "COALESCE(NULLIF({$admissionExpression}, ''), NULLIF(u.id_number, ''), '')";
        }
        $mosheJoin = in_array('admission_number', $mosheColumns, true)
            ? " LEFT JOIN moshe_students m ON TRIM(m.admission_number) = TRIM({$admissionExpression})"
            : '';
        if ($mosheJoin !== '') {
            $admissionExpression = "COALESCE(NULLIF({$admissionExpression}, ''), m.admission_number, '')";
        }
        $simsJoin = in_array('student_id', $simsColumns, true)
            ? " LEFT JOIN sims_students s ON TRIM(s.student_id) = TRIM({$admissionExpression})"
            : '';
        $firstName = studentPlacementTextExpression($studentDataColumns, 'sd', ['given_name', 'first_name']);
        $fatherName = studentPlacementTextExpression($studentDataColumns, 'sd', ['father_name', 'last_name']);
        if ($mosheJoin !== '') {
            $firstName = studentPlacementTextExpression($mosheColumns, 'm', ['given_name'], $firstName);
            $fatherName = studentPlacementTextExpression($mosheColumns, 'm', ['father_name'], $fatherName);
        }
        if (in_array('first_name', $userColumns, true)) {
            $firstName = "COALESCE(NULLIF({$firstName}, ''), u.first_name, '')";
        }
        if (in_array('last_name', $userColumns, true)) {
            $fatherName = "COALESCE(NULLIF({$fatherName}, ''), u.last_name, '')";
        }
        $grandfatherName = $mosheJoin !== ''
            ? studentPlacementTextExpression($mosheColumns, 'm', ['grand_father_name'], studentPlacementTextExpression($studentDataColumns, 'sd', ['grandfather_name']))
            : studentPlacementTextExpression($studentDataColumns, 'sd', ['grandfather_name']);
        $region = studentPlacementTextExpression($studentDataColumns, 'sd', ['region']);
        $gender = studentPlacementTextExpression($studentDataColumns, 'sd', ['sex', 'gender']);
        $benefitGroup = studentPlacementTextExpression($studentDataColumns, 'sd', ['benefit_group', 'minority'], "'None'");
        $grade12 = studentPlacementColumnExpression($studentDataColumns, 'sd', ['total_mark', 'grade_12_result'], '0');
        $cgpa = studentPlacementColumnExpression($studentDataColumns, 'sd', ['cgpa', 'gpa'], '0');
        $coc = studentPlacementColumnExpression($studentDataColumns, 'sd', ['coc_score', 'coc_result'], '0');
        $stream = studentPlacementTextExpression($studentDataColumns, 'sd', ['stream', 'field_of_study']);
        if ($simsJoin !== '') {
            $cgpa = studentPlacementColumnExpression($simsColumns, 's', ['cgpa'], $cgpa);
            $coc = studentPlacementColumnExpression($simsColumns, 's', ['coc_score'], $coc);
            $stream = studentPlacementTextExpression($simsColumns, 's', ['stream'], $stream);
        }
        if ($mosheJoin !== '') {
            $region = studentPlacementTextExpression($mosheColumns, 'm', ['region'], $region);
            $gender = studentPlacementTextExpression($mosheColumns, 'm', ['sex'], $gender);
            $benefitGroup = studentPlacementTextExpression($mosheColumns, 'm', ['benefit_group'], $benefitGroup);
            $grade12 = studentPlacementColumnExpression($mosheColumns, 'm', ['total_mark'], $grade12);
            $stream = studentPlacementTextExpression($mosheColumns, 'm', ['field_of_study'], $stream);
        }
        $email = studentPlacementTextExpression($studentDataColumns, 'sd', ['email']);
        if (in_array('email', $userColumns, true)) {
            $email = "COALESCE(NULLIF({$email}, ''), u.email, '')";
        }
        $officialStudentQuery = $db->prepare(
            "SELECT u.id, {$admissionExpression} AS admission_number,
                    {$firstName} AS given_name, {$fatherName} AS father_name,
                    {$grandfatherName} AS grand_father_name, {$region} AS region,
                    {$gender} AS sex, {$grade12} AS total_mark,
                    {$benefitGroup} AS benefit_group, {$cgpa} AS cgpa,
                    {$coc} AS coc_score, {$stream} AS stream, {$email} AS email
             FROM users u
             {$profileJoin}
             {$mosheJoin}{$simsJoin}
             WHERE u.id = ? AND LOWER(TRIM(u.role)) = 'student'
             LIMIT 1"
        );
        if (!$officialStudentQuery) {
            throw new Exception('Unable to prepare authoritative student lookup');
        }
        $officialStudentQuery->bind_param('i', $id);
        if (!$officialStudentQuery->execute()) {
            $officialStudentQuery->close();
            throw new Exception('Unable to load authoritative student data');
        }
        $officialStudent = $officialStudentQuery->get_result()->fetch_assoc();
        $officialStudentQuery->close();
        if (!$officialStudent) {
            throw new Exception('Every selected student must have matching MoSHE and SIMS records');
        }
        $benefitGroup = strtolower(trim((string) $officialStudent['benefit_group']));
        $developingRegion = isDevelopingRegion($officialStudent['region'])
            || isDevelopingRegion($benefitGroup)
            || (bool) preg_match('/developing|emerging/', $benefitGroup);
        $student['id_number'] = $officialStudent['admission_number'];
        $student['name'] = trim(
            $officialStudent['given_name'] . ' ' . $officialStudent['father_name'] . ' ' . $officialStudent['grand_father_name']
        );
        $student['email'] = $officialStudent['email'];
        $student['gender'] = $officialStudent['sex'];
        $student['cgpa'] = (float) $officialStudent['cgpa'];
        $student['gpa'] = (float) $officialStudent['cgpa'];
        if ($student['cgpa'] < $rules['minGpa']) {
            continue;
        }
        $student['grade12'] = (float) $officialStudent['total_mark'];
        $student['coc'] = (float) $officialStudent['coc_score'];
        $student['stream'] = (string) $officialStudent['stream'];
        $student['hasDisability'] = (bool) preg_match('/disability|disabled/', $benefitGroup);
        $student['disability'] = $student['hasDisability'];
        $student['developingRegion'] = $developingRegion;
        $student['minority'] = $developingRegion;

        $preferences = [];
        $studentIdentifier = (string) $id;
        $admissionIdentifier = (string) $officialStudent['admission_number'];
        $choiceIdentityConditions = [];
        if (in_array('student_id', $choiceColumns, true)) {
            $choiceIdentityConditions[] = 'sc.student_id = ?';
            if ($admissionIdentifier !== '' && $admissionIdentifier !== $studentIdentifier) {
                $choiceIdentityConditions[] = 'TRIM(sc.student_id) = TRIM(?)';
            }
        }
        if (in_array('user_id', $choiceColumns, true)) {
            $choiceIdentityConditions[] = 'sc.user_id = ?';
        }
        if (in_array('admission_number', $choiceColumns, true)) {
            $choiceIdentityConditions[] = 'TRIM(sc.admission_number) = TRIM(?)';
        }
        if (!$choiceIdentityConditions) {
            throw new Exception('Student preferences have no supported student identifier');
        }
        $choiceDepartmentIdColumn = in_array('dept_id', $choiceColumns, true)
            ? 'dept_id'
            : (in_array('department_id', $choiceColumns, true) ? 'department_id' : '');
        $choiceName = studentPlacementTextExpression($choiceColumns, 'sc', ['dept_name', 'department_name']);
        $choiceCollege = studentPlacementTextExpression($choiceColumns, 'sc', ['college_name']);
        $choiceStream = studentPlacementTextExpression($choiceColumns, 'sc', ['stream']);
        $choicePriority = studentPlacementColumnExpression($choiceColumns, 'sc', ['priority'], '99');
        $choiceDepartmentJoin = '';
        if ($choiceDepartmentIdColumn !== '' && in_array('id', $departmentColumns, true)) {
            $choiceDepartmentJoin = " LEFT JOIN departments d ON d.id = sc.`{$choiceDepartmentIdColumn}`";
        }
        $choiceDepartmentId = $choiceDepartmentIdColumn !== ''
            ? "sc.`{$choiceDepartmentIdColumn}`"
            : 'NULL';
        if ($choiceDepartmentJoin !== '' && in_array('name', $departmentColumns, true)) {
            $choiceName = "COALESCE(NULLIF({$choiceName}, ''), d.name)";
        }
        if ($choiceDepartmentJoin !== '' && in_array('college_name', $departmentColumns, true)) {
            $choiceCollege = "COALESCE(NULLIF({$choiceCollege}, ''), d.college_name, '')";
        }
        if ($choiceDepartmentJoin !== '' && in_array('stream', $departmentColumns, true)) {
            $choiceStream = "COALESCE(NULLIF({$choiceStream}, ''), d.stream, '')";
        }
        $choiceSql = $db->prepare(
            "SELECT {$choiceDepartmentId} AS dept_id, {$choiceName} AS dept_name,
                    {$choiceCollege} AS college_name, {$choiceStream} AS stream,
                    {$choicePriority} AS priority
             FROM student_choices sc{$choiceDepartmentJoin}
             WHERE (" . implode(' OR ', $choiceIdentityConditions) . ")
             ORDER BY {$choicePriority} ASC"
        );
        if (!$choiceSql) {
            throw new Exception('Unable to prepare student preference lookup');
        }
        $choiceValues = [];
        foreach ($choiceIdentityConditions as $condition) {
            $choiceValues[] = strpos($condition, 'user_id') !== false ? $studentIdentifier : (
                strpos($condition, 'student_id') !== false && strpos($condition, 'TRIM') === false
                    ? $studentIdentifier
                    : $admissionIdentifier
            );
        }
        $choiceTypes = str_repeat('s', count($choiceValues));
        $choiceBindArguments = [$choiceTypes];
        foreach ($choiceValues as $index => $choiceValue) {
            $choiceBindArguments[] = &$choiceValues[$index];
        }
        if (!call_user_func_array([$choiceSql, 'bind_param'], $choiceBindArguments)) {
            $choiceSql->close();
            throw new Exception('Unable to bind student preference lookup');
        }
        if (!$choiceSql->execute()) {
            $choiceSql->close();
            throw new Exception('Unable to load student preferences');
        }
        $choiceRows = $choiceSql->get_result();
        while ($row = $choiceRows->fetch_assoc()) {
            $preferences[] = [
                'dept_id' => $row['dept_id'] ?? null,
                'dept_name' => $row['dept_name'] ?? '',
                'department' => $row['dept_name'] ?? '',
                'college_name' => $row['college_name'] ?? '',
                'stream' => $row['stream'] ?? '',
                'priority' => $row['priority'] ?? 99,
            ];
        }
        $choiceSql->close();
        if (empty($preferences)) {
            $preferences = $student['preferences'] ?? $student['choices'] ?? [];
        }

        $normalizedPreferences = [];
        foreach ($preferences as $idx => $preference) {
            $name = trim((string) ($preference['department'] ?? $preference['name'] ?? $preference['dept_name'] ?? $preference['department_name'] ?? ''));
            if ($name === '') {
                $name = trim((string) ($preference['dept_id'] ?? ''));
            }
            if ($name === '') {
                continue;
            }
            $normalizedPreferences[] = [
                'department' => $name,
                'priority' => (int) ($preference['priority'] ?? $preference['rank'] ?? $idx + 1),
                'college_name' => trim((string) ($preference['college_name'] ?? $preference['collegeName'] ?? $preference['college'] ?? '')),
                'stream' => trim((string) ($preference['stream'] ?? '')),
            ];
        }

        usort($normalizedPreferences, function ($a, $b) {
            return ($a['priority'] ?? 99) <=> ($b['priority'] ?? 99);
        });

        $meritScore = computeMeritScore($student, $rules);
        $cumulativeScore = $meritScore;
        $gpa = (float) ($student['cgpa'] ?? $student['gpa'] ?? 0);
        $grade12 = (float) ($student['grade12'] ?? $student['grade_12_result'] ?? 0);
        $coc = (float) ($student['coc'] ?? $student['coc_result'] ?? 0);

        $allStudents[] = [
            'id' => (int) $id,
            'id_number' => trim((string) ($student['id_number'] ?? $student['official_id_number'] ?? '')),
            'name' => (string) ($student['name'] ?? $student['fullname'] ?? 'Student'),
            'email' => (string) ($student['email'] ?? ''),
            'gender' => (string) ($student['gender'] ?? ''),
            'stream' => trim((string) ($student['stream'] ?? '')),
            'college_name' => trim((string) ($student['college_name'] ?? $student['college'] ?? '')),
            'disability' => $student['disability'] ?? $student['hasDisability'] ?? false,
            'minority' => $student['minority'] ?? $student['is_minority'] ?? false,
            'cumulative_score' => $cumulativeScore,
            'cgpa' => $gpa,
            'gpa' => $gpa,
            'grade12' => $grade12,
            'grade_12_result' => $grade12,
            'coc' => $coc,
            'coc_result' => $coc,
            'hasDisability' => normalizeYesNo($student['hasDisability'] ?? $student['disability'] ?? false),
            'is_minority' => normalizeYesNo($student['minority'] ?? $student['is_minority'] ?? false),
            'preferences' => $normalizedPreferences,
            'final_merit_score' => $meritScore,
        ];
    }

    if (empty($allStudents)) {
        throw new Exception('No eligible students found for placement');
    }

    usort($allStudents, function ($a, $b) {
        $scoreA = (float) ($a['cumulative_score'] ?? $a['score'] ?? 0);
        $scoreB = (float) ($b['cumulative_score'] ?? $b['score'] ?? 0);
        if (abs($scoreB - $scoreA) > 0.0001) {
            return $scoreB <=> $scoreA;
        }

        $gpaA = (float) ($a['cgpa'] ?? $a['gpa'] ?? 0);
        $gpaB = (float) ($b['cgpa'] ?? $b['gpa'] ?? 0);
        if (abs($gpaB - $gpaA) > 0.0001) {
            return $gpaB <=> $gpaA;
        }

        $g12A = (float) ($a['grade12'] ?? $a['grade_12_result'] ?? 0);
        $g12B = (float) ($b['grade12'] ?? $b['grade_12_result'] ?? 0);
        if (abs($g12B - $g12A) > 0.0001) {
            return $g12B <=> $g12A;
        }

        $cocA = (float) ($a['coc'] ?? $a['coc_result'] ?? 0);
        $cocB = (float) ($b['coc'] ?? $b['coc_result'] ?? 0);
        if (abs($cocB - $cocA) > 0.0001) {
            return $cocB <=> $cocA;
        }

        $isFemaleA = strtolower(trim((string) ($a['gender'] ?? ''))) === 'female' ? 1 : 0;
        $isFemaleB = strtolower(trim((string) ($b['gender'] ?? ''))) === 'female' ? 1 : 0;
        if ($isFemaleB !== $isFemaleA) {
            return $isFemaleB <=> $isFemaleA;
        }

        $supportA = normalizeYesNo($a['hasDisability'] ?? $a['disability'] ?? false)
            || normalizeYesNo($a['is_minority'] ?? $a['minority'] ?? false) ? 1 : 0;
        $supportB = normalizeYesNo($b['hasDisability'] ?? $b['disability'] ?? false)
            || normalizeYesNo($b['is_minority'] ?? $b['minority'] ?? false) ? 1 : 0;
        if ($supportB !== $supportA) {
            return $supportB <=> $supportA;
        }

        return 0;
    });

    $capacityMap = [];
    foreach ($departmentMap as $key => $department) {
        $capacityMap[$key] = max(0, (int) $department['capacity']);
    }

    $femaleQuotaMap = [];
    $generalQuotaMap = [];
    foreach ($departmentMap as $key => $department) {
        $capacity = max(0, (int) $department['capacity']);
        $femaleReserve = min($capacity, max(0, (int) ceil($capacity * $rules['reservedFemaleQuotaPercent'] / 100.0)));
        $generalOpen = min($capacity - $femaleReserve, max(0, (int) round($capacity * $rules['generalQuotaPercent'] / 100.0)));
        $generalQuotaMap[$key] = $generalOpen + ($capacity - $femaleReserve - $generalOpen);
        $femaleQuotaMap[$key] = $femaleReserve;
    }

    $occupiedSql = $db->query("SELECT dept_id, dept_name, COUNT(*) AS occupied
        FROM placement_results
        WHERE status IS NULL OR status NOT IN ('Rejected', 'Cancelled')
        GROUP BY dept_id, dept_name");
    if (!$occupiedSql) {
        throw new Exception('Unable to check department occupancy');
    }
    while ($occupied = $occupiedSql->fetch_assoc()) {
        $occupiedKey = '';
        foreach ($departmentMap as $key => $department) {
            if ((int) $department['id'] === (int) ($occupied['dept_id'] ?? 0)) {
                $occupiedKey = $key;
                break;
            }
        }
        if ($occupiedKey === '') {
            $occupiedKey = normalizeDepartmentName($occupied['dept_name'] ?? '');
        }
        if (isset($capacityMap[$occupiedKey])) {
            $capacityMap[$occupiedKey] = max(0, $capacityMap[$occupiedKey] - (int) $occupied['occupied']);
        }
    }
    $initialAvailableCapacityMap = $capacityMap;

    $placements = [];
    $assignedByDepartment = [];
    $assignedCount = 0;
    $unassignedCount = 0;
    $alreadyPlacedCount = 0;
    // College-wide runs must evaluate every department in the selected college.
    // Keep the field for backwards compatibility, but never narrow a college-wide run to one department.
    $placementScope = strtolower(trim((string) ($input['placementScope'] ?? 'college-wide')));
    $selectedDepartment = $placementScope === 'college-wide' ? '' : trim((string) ($input['selectedDepartment'] ?? ''));

    foreach ($allStudents as $student) {
        // A student may have only one placement result. Check while the transaction is active
        // so rerunning the engine cannot consume capacity or create another result row.
        $existingPlacement = null;
        $existingSql = $db->prepare('SELECT id_number, dept_id, dept_name, stream, college_name, final_score, choice_rank FROM placement_results WHERE student_id = ? LIMIT 1 FOR UPDATE');
        if (!$existingSql) {
            throw new Exception('Unable to check existing placement result');
        }

        $existingSql->bind_param('i', $student['id']);
        if (!$existingSql->execute()) {
            $existingSql->close();
            throw new Exception('Unable to check existing placement result');
        }
        $existingPlacement = $existingSql->get_result()->fetch_assoc() ?: null;
        $existingSql->close();

        if ($existingPlacement) {
            $clearUnassignedSql = $db->prepare('DELETE FROM unassigned_students WHERE student_id = ?');
            if (!$clearUnassignedSql) {
                throw new Exception('Unable to prepare unassigned student cleanup');
            }
            $clearUnassignedSql->bind_param('i', $student['id']);
            if (!$clearUnassignedSql->execute()) {
                $clearUnassignedSql->close();
                throw new Exception('Unable to clean up assigned student record');
            }
            $clearUnassignedSql->close();

            $alreadyPlacedCount++;
            $placements[] = [
                'studentId' => (int) $student['id'],
                'id_number' => $existingPlacement['id_number'] ?: $student['id_number'],
                'studentName' => $student['name'],
                'department' => $existingPlacement['dept_name'],
                'college' => $existingPlacement['college_name'],
                'stream' => $existingPlacement['stream'] ?: $student['stream'],
                'score' => $existingPlacement['final_score'],
                'choiceRank' => $existingPlacement['choice_rank'],
                'status' => 'already_placed',
            ];
            continue;
        }

        $placed = false;
        foreach ($student['preferences'] as $priorityIndex => $preference) {
            $deptName = trim((string) $preference['department']);
            if ($deptName === '') continue;

            $deptKey = normalizeDepartmentName($deptName);
            if (!isset($departmentMap[$deptKey])) {
                continue;
            }

            $department = $departmentMap[$deptKey];
            if ($selectedDepartment !== '' && $selectedDepartment !== 'all') {
                if (normalizeDepartmentName($department['name']) !== normalizeDepartmentName($selectedDepartment)) {
                    continue;
                }
            }

            if ($selectedCollege !== '' && $selectedCollege !== 'all') {
                if (normalizeDepartmentName($department['college_name']) !== normalizeDepartmentName($selectedCollege)) {
                    continue;
                }
            }

            $openCapacity = (int) ($capacityMap[$deptKey] ?? 0);
            $femaleReserve = (int) ($femaleQuotaMap[$deptKey] ?? 0);
            $generalOpen = (int) ($generalQuotaMap[$deptKey] ?? 0);
            $isFemaleApplicant = strtolower(trim((string) ($student['gender'] ?? ''))) === 'female';

            if ($generalOpen > 0 && $openCapacity > 0) {
                $generalQuotaMap[$deptKey] = $generalOpen - 1;
                $capacityMap[$deptKey] = max(0, $openCapacity - 1);
            } elseif ($isFemaleApplicant && $femaleReserve > 0 && $openCapacity > 0) {
                $femaleQuotaMap[$deptKey] = $femaleReserve - 1;
                $capacityMap[$deptKey] = max(0, $openCapacity - 1);
            } else {
                continue;
            }

            $assignedCount++;
            $assignedByDepartment[$deptKey] = ($assignedByDepartment[$deptKey] ?? 0) + 1;
            $placed = true;

            $placements[] = [
                'studentId' => (int) $student['id'],
                'id_number' => $student['id_number'],
                'studentName' => $student['name'],
                'department' => $department['name'],
                'college' => $department['college_name'],
                'stream' => $department['stream'],
                'score' => $student['final_merit_score'],
                'choiceRank' => (int) ($preference['priority'] ?? ($priorityIndex + 1)),
                'status' => 'placed',
            ];

            $clearUnassignedSql = $db->prepare('DELETE FROM unassigned_students WHERE student_id = ?');
            if (!$clearUnassignedSql) {
                throw new Exception('Unable to prepare unassigned student cleanup');
            }
            $clearUnassignedSql->bind_param('i', $student['id']);
            if (!$clearUnassignedSql->execute()) {
                $clearUnassignedSql->close();
                throw new Exception('Unable to clean up assigned student record');
            }
            $clearUnassignedSql->close();

            if ($db) {
                $insertSql = $db->prepare('INSERT INTO placement_results (student_id, id_number, dept_id, dept_name, stream, college_name, final_score, choice_rank, status, placed_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, "Pending", NOW() WHERE NOT EXISTS (SELECT 1 FROM placement_results WHERE student_id = ?)');
                if (!$insertSql) {
                    throw new Exception('Unable to prepare placement result insert');
                }

                $deptId = (int) $department['id'];
                $finalScore = (float) $student['final_merit_score'];
                $choiceRank = (int) ($preference['priority'] ?? ($priorityIndex + 1));
                $insertSql->bind_param('isisssdii', $student['id'], $student['id_number'], $deptId, $department['name'], $department['stream'], $department['college_name'], $finalScore, $choiceRank, $student['id']);
                if (!$insertSql->execute()) {
                    $insertSql->close();
                    throw new Exception('Unable to save placement result');
                }
                $insertedRows = $insertSql->affected_rows;
                $insertSql->close();

                if ($insertedRows !== 1) {
                    throw new Exception('Student already has a placement result');
                }

                $profileIdValue = $studentDataIdentityColumn === 'user_id'
                    ? $student['id']
                    : $student['id_number'];
                $profileIdType = $studentDataIdentityColumn === 'user_id' ? 'i' : 's';
                $markSql = $db->prepare(
                    "UPDATE student_data SET status = 'Placed', department = ? WHERE `{$studentDataIdentityColumn}` = ?"
                );
                if (!$markSql) {
                    throw new Exception('Unable to prepare student assignment update');
                }

                $markSql->bind_param('s' . $profileIdType, $department['name'], $profileIdValue);
                if (!$markSql->execute()) {
                    $markSql->close();
                    throw new Exception('Unable to save assigned department');
                }
                $markSql->close();
            }

            break;
        }

        if (!$placed) {
            $unassignedCount++;
            $firstPreference = $student['preferences'][0] ?? [];
            $unassignedStream = $student['stream'] !== ''
                ? $student['stream']
                : trim((string) ($firstPreference['stream'] ?? ''));
            $unassignedCollege = $student['college_name'] !== ''
                ? $student['college_name']
                : trim((string) ($firstPreference['college_name'] ?? ''));
            $matchingDepartments = [];
            $fullDepartments = [];
            foreach ($student['preferences'] as $preference) {
                $deptKey = normalizeDepartmentName($preference['department'] ?? '');
                if (!isset($departmentMap[$deptKey])) {
                    continue;
                }

                $department = $departmentMap[$deptKey];
                if ($selectedDepartment !== '' && $selectedDepartment !== 'all'
                    && normalizeDepartmentName($department['name']) !== normalizeDepartmentName($selectedDepartment)) {
                    continue;
                }
                if ($selectedCollege !== '' && $selectedCollege !== 'all'
                    && normalizeDepartmentName($department['college_name']) !== normalizeDepartmentName($selectedCollege)) {
                    continue;
                }

                $matchingDepartments[$deptKey] = $department['name'];
                if (($capacityMap[$deptKey] ?? 0) <= 0) {
                    $fullDepartments[$deptKey] = $department['name'];
                }
            }

            if (!empty($matchingDepartments) && count($matchingDepartments) === count($fullDepartments)) {
                $reasonCode = 'CAPACITY_FULL';
                $reasonDetails = ['departments' => array_values($fullDepartments)];
            } elseif (empty($student['preferences'])) {
                $reasonCode = 'NO_CHOICES';
                $reasonDetails = ['message' => 'No department choices were submitted for this placement run.'];
            } else {
                $reasonCode = 'NO_ELIGIBLE_DEPARTMENT';
                $reasonDetails = ['message' => 'No active department matching the submitted choices was available in this placement run scope.'];
            }

            $encodedReasonDetails = json_encode($reasonDetails, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $saveUnassignedSql = $db->prepare(
                "INSERT INTO unassigned_students
                    (student_id, id_number, full_name, email, stream, college_name, status, reason_code, reason_details, total_score, placement_run_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'Not assigned', ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE id_number = VALUES(id_number), full_name = VALUES(full_name),
                    email = VALUES(email), stream = VALUES(stream), college_name = VALUES(college_name),
                    status = 'Not assigned', reason_code = VALUES(reason_code),
                    reason_details = VALUES(reason_details), total_score = VALUES(total_score), placement_run_at = NOW()"
            );
            if (!$saveUnassignedSql) {
                throw new Exception('Unable to prepare unassigned student record');
            }
            $saveUnassignedSql->bind_param(
                'isssssssd',
                $student['id'],
                $student['id_number'],
                $student['name'],
                $student['email'],
                $unassignedStream,
                $unassignedCollege,
                $reasonCode,
                $encodedReasonDetails,
                $student['final_merit_score']
            );
            if (!$saveUnassignedSql->execute()) {
                $saveUnassignedSql->close();
                throw new Exception('Unable to save unassigned student record');
            }
            $saveUnassignedSql->close();

            $profileIdValue = $studentDataIdentityColumn === 'user_id'
                ? $student['id']
                : $student['id_number'];
            $profileIdType = $studentDataIdentityColumn === 'user_id' ? 'i' : 's';
            $markUnassignedSql = $db->prepare(
                "UPDATE student_data SET status = 'Not assigned', department = 'Not assigned' WHERE `{$studentDataIdentityColumn}` = ?"
            );
            if (!$markUnassignedSql) {
                throw new Exception('Unable to prepare unassigned student status update');
            }
            $markUnassignedSql->bind_param($profileIdType, $profileIdValue);
            if (!$markUnassignedSql->execute()) {
                $markUnassignedSql->close();
                throw new Exception('Unable to update unassigned student status');
            }
            $markUnassignedSql->close();

            $placements[] = [
                'studentId' => (int) $student['id'],
                'id_number' => $student['id_number'],
                'studentName' => $student['name'],
                'department' => null,
                'college' => $unassignedCollege,
                'stream' => $unassignedStream,
                'score' => $student['final_merit_score'],
                'choiceRank' => null,
                'status' => 'unassigned',
            ];
        }
    }

    if (!$db->commit()) {
        throw new Exception('Unable to commit placement results');
    }

    $departmentCapacitySummary = [];
    foreach ($departmentMap as $key => $department) {
        $initialAvailable = (int) ($initialAvailableCapacityMap[$key] ?? 0);
        $departmentCapacitySummary[] = [
            'dept_id' => $department['id'],
            'department' => $department['name'],
            'college_name' => $department['college_name'],
            'capacity' => (int) $department['capacity'],
            'occupied_before_run' => max(0, (int) $department['capacity'] - $initialAvailable),
            'assigned_in_run' => (int) ($assignedByDepartment[$key] ?? 0),
            'remaining_capacity' => (int) ($capacityMap[$key] ?? 0),
        ];
    }

    echo json_encode([
        'success' => true,
        'message' => 'Placement completed successfully.',
        'summary' => [
            'assignedStudents' => $assignedCount,
            'unassignedStudents' => $unassignedCount,
            'alreadyPlacedStudents' => $alreadyPlacedCount,
            'totalStudents' => count($allStudents),
            'totalDepartments' => count($departmentMap),
            'departmentCapacity' => $departmentCapacitySummary,
        ],
        'placements' => $placements,
        'assigned' => $assignedCount,
        'unassigned' => $unassignedCount,
        'already_placed' => $alreadyPlacedCount,
        'total_processed' => count($allStudents),
    ]);
} catch (Exception $e) {
    if ($db && $db->connect_errno === 0) {
        $db->rollback();
    }

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Placement error: ' . $e->getMessage(),
    ]);
} finally {
    if (isset($placementLock) && $placementLock instanceof mysqli_result) {
        $db->query("SELECT RELEASE_LOCK('placement_engine')");
    }
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
}
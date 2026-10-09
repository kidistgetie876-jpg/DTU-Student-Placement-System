<?php
/**
 * placement_engine.php - የዲባር (DTU) የምደባ አልጎሪዝም
 * ተማሪዎችን በውጤት (Merit) አበጥሮ በዲፓርትመንት ኮታ መሰረት ይመድባል።
 */

include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json');

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
        'gpaWeight' => 40.0,
        'grade12Weight' => 20.0,
        'cocWeight' => 30.0,
        'genderWeight' => 3.0,
        'disabilityWeight' => 3.0,
        'minorityWeight' => 4.0,
    ];
    $aliases = [
        'gpa' => 'gpaWeight', 'gpaweight' => 'gpaWeight',
        'grade12' => 'grade12Weight', 'grade12weight' => 'grade12Weight', 'grade12result' => 'grade12Weight',
        'coc' => 'cocWeight', 'cocweight' => 'cocWeight', 'cocresult' => 'cocWeight',
        'gender' => 'genderWeight', 'genderweight' => 'genderWeight',
        'disability' => 'disabilityWeight', 'disabilityweight' => 'disabilityWeight',
        'minority' => 'minorityWeight', 'minorityweight' => 'minorityWeight',
    ];

    foreach ($inputRules as $key => $value) {
        $normalizedKey = strtolower(preg_replace('/[^a-z0-9]/', '', (string) $key));
        if (isset($aliases[$normalizedKey]) && is_numeric($value) && (float) $value >= 0) {
            $weights[$aliases[$normalizedKey]] = (float) $value;
        }
    }

    $result = $db->query('SELECT gpa_weight, grade_12_weight, coc_weight, gender_weight, disability_weight, minority_weight FROM placement_settings WHERE id = 1 LIMIT 1');
    if ($result) {
        $row = $result->fetch_assoc();
        $columns = [
            'gpaWeight' => 'gpa_weight',
            'grade12Weight' => 'grade_12_weight',
            'cocWeight' => 'coc_weight',
            'genderWeight' => 'gender_weight',
            'disabilityWeight' => 'disability_weight',
            'minorityWeight' => 'minority_weight',
        ];
        foreach ($columns as $key => $column) {
            if (isset($row[$column]) && is_numeric($row[$column]) && (float) $row[$column] >= 0) {
                $weights[$key] = (float) $row[$column];
            }
        }
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

class PlacementRequestException extends Exception
{
    public int $statusCode;

    public function __construct(string $message, int $statusCode)
    {
        parent::__construct($message);
        $this->statusCode = $statusCode;
    }
}

function normalizeYesNo($value): bool
{
    if (is_bool($value)) return $value;
    if (is_numeric($value)) return (int) $value !== 0;
    $normalized = strtolower(trim((string) $value));
    return in_array($normalized, ['yes', 'y', 'true', '1', 'on'], true);
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

function computeMeritScore(array $student, array $rules): float
{
    $gpa = (float) ($student['cgpa'] ?? $student['gpa'] ?? 0);
    $grade12 = (float) ($student['grade12'] ?? $student['grade_12_result'] ?? $student['grade_12'] ?? 0);
    $coc = (float) ($student['coc'] ?? $student['coc_result'] ?? 0);
    $gender = strtolower(trim((string) ($student['gender'] ?? '')));
    $disability = normalizeYesNo($student['hasDisability'] ?? $student['disability'] ?? false) ? 100.0 : 0.0;
    $minority = normalizeYesNo($student['minority'] ?? $student['is_minority'] ?? false) ? 100.0 : 0.0;
    $normalizedScores = [
        'gpaWeight' => normalizeScorePercent($gpa, $gpa <= 4 ? 4.0 : 100.0),
        'grade12Weight' => normalizeScorePercent($grade12, 100.0),
        'cocWeight' => normalizeScorePercent($coc, 30.0),
        'genderWeight' => $gender === 'female' ? 100.0 : 0.0,
        'disabilityWeight' => $disability,
        'minorityWeight' => $minority,
    ];
    $totalWeight = array_sum($rules);
    if ($totalWeight <= 0) {
        return 0.0;
    }

    $weightedScore = 0.0;
    foreach ($normalizedScores as $weightKey => $normalizedScore) {
        $weightedScore += $normalizedScore * (float) $rules[$weightKey];
    }

    return round(min(100.0, max(0.0, $weightedScore / $totalWeight)), 2);
}

try {
    $placementLock = $db->query("SELECT GET_LOCK('placement_engine', 10) AS lock_acquired");
    if (!$placementLock || (int) $placementLock->fetch_assoc()['lock_acquired'] !== 1) {
        throw new PlacementRequestException('Another placement run is already in progress', 409);
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
<<<<<<< HEAD:placement_backend/api/registrar/placement_engine.php
        throw new PlacementRequestException('No active departments found for the selected college', 422);
    }
    $availableCapacity = array_sum(array_map(function ($department) {
        return max(0, (int) ($department['capacity'] ?? 0));
    }, $scopedDepartments));
    if ($availableCapacity <= 0) {
        throw new PlacementRequestException('No placement capacity is available in the selected college', 409);
=======
        throw new Exception('No active departments found for the selected college');
    }
    foreach ($scopedDepartments as $department) {
        if ((int) ($department['capacity'] ?? 0) <= 0) {
            throw new Exception('Every active department in the selected college must have capacity greater than zero');
        }
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:placment_backend/api/registrar/placement_engine.php
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
        // STRICT REQUIREMENT: Only students who have submitted choices in student_choices table
        $studentSql = "SELECT DISTINCT sd.user_id AS id, COALESCE(NULLIF(sd.id_number, ''), u.id_number) AS id_number, CONCAT(sd.first_name, ' ', sd.last_name) AS name, sd.email, sd.gender, sd.disability, sd.minority, sd.gpa, sd.grade_12_result AS grade12, sd.coc_result AS coc, sd.cumulative_avg AS cumulative_score
            FROM student_data sd
            INNER JOIN student_choices sc ON sc.student_id = sd.user_id
            LEFT JOIN users u ON u.id = sd.user_id AND LOWER(u.role) = 'student'
            WHERE (sd.status != 'Placed' OR sd.status IS NULL)
            ORDER BY sd.user_id ASC";

        $studentRes = $db->query($studentSql);
        if ($studentRes && $studentRes->num_rows > 0) {
            while ($row = $studentRes->fetch_assoc()) {
                $studentEntries[] = [
                    'id' => $row['id'],
                    'id_number' => $row['id_number'] ?? null,
                    'name' => $row['name'] ?? '',
                    'email' => $row['email'] ?? '',
                    'gender' => $row['gender'] ?? '',
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
    if (is_array($selectedStudentIds) && !empty($selectedStudentIds)) {
        $selectedSet = array_map('strval', $selectedStudentIds);
        $studentEntries = array_values(array_filter($studentEntries, function ($student) use ($selectedSet) {
            return in_array((string) ($student['id'] ?? ''), $selectedSet, true);
        }));
    }

    if (empty($studentEntries)) {
        throw new PlacementRequestException('No eligible students found for placement', 422);
    }

    $allStudents = [];
    foreach ($studentEntries as $student) {
        $id = $student['id'] ?? $student['student_id'] ?? null;
        if ($id === null || $id === '') {
            continue;
        }

        $preferences = $student['preferences'] ?? [];
        if (empty($preferences) && !empty($student['choices'])) {
            $preferences = $student['choices'];
        }

        if (empty($preferences)) {
            $choiceSql = $db->prepare('SELECT dept_name, college_name, stream, priority FROM student_choices WHERE student_id = ? ORDER BY priority ASC');
            if ($choiceSql) {
                $choiceSql->bind_param('i', $id);
                $choiceSql->execute();
                $choiceRows = $choiceSql->get_result();
                while ($row = $choiceRows->fetch_assoc()) {
                    $preferences[] = [
                        'department' => $row['dept_name'] ?? '',
                        'college_name' => $row['college_name'] ?? '',
                        'stream' => $row['stream'] ?? '',
                        'priority' => $row['priority'] ?? 99,
                    ];
                }
                $choiceSql->close();
            }
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
        throw new PlacementRequestException('No eligible students found for placement', 422);
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

    $placements = [];
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
            $alreadyPlacedCount++;
            $placements[] = [
                'studentId' => (int) $student['id'],
                'id_number' => $existingPlacement['id_number'] ?: $student['id_number'],
                'studentName' => $student['name'],
                'department' => $existingPlacement['dept_name'],
                'college' => $existingPlacement['college_name'],
                'stream' => $existingPlacement['stream'],
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

            if (($capacityMap[$deptKey] ?? 0) <= 0) {
                continue;
            }

            $capacityMap[$deptKey]--;
            $assignedCount++;
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
                    throw new PlacementRequestException('Student already has a placement result', 409);
                }

                $markSql = $db->prepare('UPDATE student_data SET status = "Placed", department = ? WHERE user_id = ?');
                if (!$markSql) {
                    throw new Exception('Unable to prepare student assignment update');
                }

                $markSql->bind_param('si', $department['name'], $student['id']);
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
            $placements[] = [
                'studentId' => (int) $student['id'],
                'id_number' => $student['id_number'],
                'studentName' => $student['name'],
                'department' => null,
                'college' => null,
                'stream' => null,
                'score' => $student['final_merit_score'],
                'choiceRank' => null,
                'status' => 'unassigned',
            ];
        }
    }

    $db->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Placement completed successfully.',
        'summary' => [
            'assignedStudents' => $assignedCount,
            'unassignedStudents' => $unassignedCount,
            'alreadyPlacedStudents' => $alreadyPlacedCount,
            'totalStudents' => count($allStudents),
            'totalDepartments' => count($departmentMap),
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

    http_response_code($e instanceof PlacementRequestException ? $e->statusCode : 500);
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
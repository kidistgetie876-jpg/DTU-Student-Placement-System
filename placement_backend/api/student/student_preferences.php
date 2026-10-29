<?php
error_reporting(E_ALL);
ini_set('display_errors', '0');

require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/placement_semester.php';
require_once __DIR__ . '/../common/student_placement_allocation.php';
header('Content-Type: application/json; charset=UTF-8');

function sendJsonResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function getTableColumns(mysqli $db, string $table): array
{
    $columns = [];
    $result = $db->query('SHOW COLUMNS FROM `' . str_replace('`', '``', $table) . '`');
    while ($row = $result->fetch_assoc()) {
        $columns[] = $row['Field'];
    }
    $result->free();
    return $columns;
}

function getActivePlacementSemester(mysqli $db): int
{
    $settingsColumns = getTableColumns($db, 'placement_settings');
    if (!in_array('active_semester', $settingsColumns, true)) {
        return 1;
    }

    $result = $db->query('SELECT active_semester FROM placement_settings WHERE id = 1 LIMIT 1');
    if (!$result) {
        throw new RuntimeException('Unable to read the active placement semester: ' . $db->error);
    }
    $settings = $result->fetch_assoc();
    $result->free();
    $semester = (int) ($settings['active_semester'] ?? 1);

    return in_array($semester, [1, 2], true) ? $semester : 1;
}

function bindStatementValues(mysqli_stmt $statement, string $types, array &$values): void
{
    if ($types === '') {
        return;
    }

    $arguments = [$types];
    foreach ($values as &$value) {
        $arguments[] = &$value;
    }
    call_user_func_array([$statement, 'bind_param'], $arguments);
}

function getActiveDepartments(mysqli $db, int $semester = 1): array
{
    $columns = getTableColumns($db, 'departments');
    foreach (['id', 'name'] as $requiredColumn) {
        if (!in_array($requiredColumn, $columns, true)) {
            error_log('Student preferences: departments table is missing required column ' . $requiredColumn);
            return [];
        }
    }
    $activeConditions = [];
    if (in_array('status', $columns, true)) {
        $activeConditions[] = "LOWER(TRIM(COALESCE(status, ''))) = 'active'";
    }
    if (in_array('is_active', $columns, true)) {
        $activeConditions[] = 'is_active = 1';
    }
    if (!$activeConditions) {
        error_log('Student preferences: departments table is missing a supported active-status column');
        return [];
    }

    $college = in_array('college_name', $columns, true) ? 'college_name' : "'' AS college_name";
    $stream = in_array('stream', $columns, true) ? 'stream' : "'' AS stream";
    $offeredSemester = in_array('offered_semester', $columns, true)
        ? 'offered_semester'
        : ($semester === 2 ? '2 AS offered_semester' : 'NULL AS offered_semester');
    $placementGroup = in_array('placement_group', $columns, true)
        ? 'placement_group'
        : "'' AS placement_group";
    $firstSemesterOnly = in_array('is_first_semester_only', $columns, true)
        ? 'is_first_semester_only'
        : '0 AS is_first_semester_only';
    $sql = "SELECT id, name, $college, $stream, $offeredSemester, $placementGroup, $firstSemesterOnly
            FROM departments
            WHERE (" . implode(' OR ', $activeConditions) . ")
            ORDER BY college_name ASC, name ASC";
    $result = $db->query($sql);
    $departments = [];
    while ($row = $result->fetch_assoc()) {
        $collegeName = trim((string) ($row['college_name'] ?? ''));
        if (strcasecmp($collegeName, 'Law') === 0) {
            $collegeName = 'School of Law';
        }
        $departments[] = [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'college_name' => $collegeName,
            'stream' => (string) ($row['stream'] ?? ''),
            'placement_group' => (string) ($row['placement_group'] ?? ''),
            'offered_semester' => isset($row['offered_semester']) ? (int) $row['offered_semester'] : null,
            'is_first_semester_only' => (int) ($row['is_first_semester_only'] ?? 0),
        ];
    }
    $result->free();
    return $departments;
}

function studentIdentityFilter(array $columns, string $studentId, string $admissionNumber): array
{
    $conditions = [];
    $values = [];
    $types = '';
    if (in_array('admission_number', $columns, true) && $admissionNumber !== '') {
        $conditions[] = 'admission_number = ?';
        $values[] = $admissionNumber;
        $types .= 's';
    }
    if (in_array('student_id', $columns, true) && $studentId !== '') {
        $conditions[] = 'student_id = ?';
        $values[] = $studentId;
        $types .= 's';
    }
    return [$conditions, $values, $types];
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST, OPTIONS');
    sendJsonResponse(['success' => false, 'message' => 'Only GET and POST requests are allowed.'], 405);
}

try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    if ($method === 'GET') {
        $studentId = trim((string) ($_GET['student_id'] ?? ''));
        $admissionNumber = trim((string) ($_GET['admission_number'] ?? ''));
        if ($admissionNumber === '' && $studentId !== '' && !ctype_digit($studentId)) {
            $admissionNumber = $studentId;
        }
        if ($studentId === '' && $admissionNumber === '') {
            sendJsonResponse(['success' => false, 'message' => 'A student ID or admission number is required.'], 400);
        }

        $activeSemester = getActivePlacementSemester($db);

        $allocation = getStudentAllocatedPlacementGroup($db, $studentId, $admissionNumber);
        $assignedStream = getStudentAssignedPlacementStream($db, $studentId, $admissionNumber);
        $secondSemesterPortal = getStudentSecondSemesterChoicePortalState(
            $db,
            $studentId,
            $admissionNumber
        );
        $storedStatus = strtolower(getStudentStoredPlacementStatus($db, $studentId, $admissionNumber));
        $secondSemesterStage = in_array($storedStatus, [
            'pending 2nd semester',
            'placed in semester 1',
            'allocated',
        ], true);
        $pendingSecondSemesterEditable = $secondSemesterStage
            && trim((string) ($allocation['college'] ?? '')) !== ''
            && trim((string) ($allocation['group'] ?? '')) !== ''
            && $secondSemesterPortal['isOpen']
            && !$secondSemesterPortal['isFinalized'];
        $secondSemesterEligible = $secondSemesterPortal['eligible'] || $pendingSecondSemesterEditable;
        $secondSemesterOpen = $secondSemesterPortal['isOpen'];
        $semester = $secondSemesterEligible
            && ($activeSemester === 2
                || $secondSemesterOpen
                || $secondSemesterPortal['isFinalized']
                || $secondSemesterStage)
            ? 2
            : 1;
        $choiceEditable = isStudentChoiceExplicitlyEditable($db, $studentId, $admissionNumber)
            || $pendingSecondSemesterEditable;
        $placementExecuted = !$choiceEditable
            && hasStudentPlacementForSemester($db, $studentId, $admissionNumber, $semester);
        $isLocked = $semester === 2 && $secondSemesterEligible
            ? $secondSemesterPortal['isFinalized']
            : (!$choiceEditable && isStudentChoiceEditingLocked($db, $studentId, $admissionNumber));
        $departments = getActiveDepartments($db, $semester);
        $choices = [];
        $choiceColumns = getTableColumns($db, 'student_choices');
        if (in_array('dept_id', $choiceColumns, true) && in_array('priority', $choiceColumns, true)) {
            [$conditions, $values, $types] = studentIdentityFilter($choiceColumns, $studentId, $admissionNumber);
            if ($conditions) {
                $departmentColumns = getTableColumns($db, 'departments');
                $departmentJoin = in_array('id', $departmentColumns, true)
                    ? ' LEFT JOIN departments d ON d.id = sc.dept_id'
                    : '';
                $departmentName = $departmentJoin !== '' && in_array('name', $departmentColumns, true)
                    ? "COALESCE(NULLIF(d.name, ''), sc.dept_name, '')"
                    : "COALESCE(sc.dept_name, '')";
                $departmentCollege = $departmentJoin !== '' && in_array('college_name', $departmentColumns, true)
                    ? "COALESCE(NULLIF(d.college_name, ''), sc.college_name, '')"
                    : "COALESCE(sc.college_name, '')";
                $departmentStream = $departmentJoin !== '' && in_array('stream', $departmentColumns, true)
                    ? "COALESCE(NULLIF(d.stream, ''), sc.stream, '')"
                    : "COALESCE(sc.stream, '')";
                $departmentOfferedSemester = $departmentJoin !== '' && in_array('offered_semester', $departmentColumns, true)
                    ? 'd.offered_semester'
                    : 'NULL';
                $choiceSemester = in_array('semester', $choiceColumns, true) ? 'sc.semester' : '1';
                $sql = "SELECT sc.dept_id, {$departmentName} AS dept_name,
                               {$departmentCollege} AS college_name, {$departmentStream} AS stream,
                               {$departmentOfferedSemester} AS offered_semester, sc.priority,
                               {$choiceSemester} AS semester
                        FROM student_choices sc{$departmentJoin} WHERE ("
                    . implode(' OR ', $conditions) . ')';
                if (in_array('semester', $choiceColumns, true)) {
                    $sql .= ' AND sc.semester = ?';
                    $values[] = (string) $semester;
                    $types .= 's';
                }
                $sql .= ' ORDER BY sc.priority ASC, semester ASC, sc.dept_id ASC';
                $statement = $db->prepare($sql);
                bindStatementValues($statement, $types, $values);
                $statement->execute();
                $result = $statement->get_result();
                while ($row = $result->fetch_assoc()) {
                    $choiceDepartmentId = isset($row['dept_id']) && (int) $row['dept_id'] > 0
                        ? (int) $row['dept_id']
                        : null;
                    $choiceDepartmentName = (string) ($row['dept_name'] ?? '');
                    $choiceCollegeName = trim((string) ($row['college_name'] ?? ''));
                    if (strcasecmp($choiceCollegeName, 'Law') === 0) {
                        $choiceCollegeName = 'School of Law';
                    }
                    $choices[] = [
                        'dept_id' => $choiceDepartmentId,
                        'dept_name' => $choiceDepartmentName,
                        'department_name' => $choiceDepartmentName,
                        'type' => $choiceDepartmentId === null
                            ? ($choiceDepartmentName === 'Broad Group / Semester 2 Queue'
                                ? 'college_queue'
                                : 'broad_group')
                            : 'department',
                        'college_name' => $choiceCollegeName,
                        'stream' => (string) ($row['stream'] ?? ''),
                        'semester' => in_array((int) ($row['semester'] ?? 1), [1, 2], true)
                            ? (int) $row['semester']
                            : 1,
                        'offered_semester' => isset($row['offered_semester'])
                            ? (int) $row['offered_semester']
                            : null,
                        'priority' => (int) $row['priority'],
                    ];
                }
                $result->free();
                $statement->close();
            }
        }

        $availableDepartments = array_values(array_filter($departments, static function (array $department) use ($semester, $assignedStream): bool {
            if ($semester === 1) {
                return placementDepartmentOfferedInSemester($department, 1);
            }
            return placementDepartmentOfferedInSemester($department, 2)
                && placementNormalizeStream((string) ($department['stream'] ?? ''))
                    === placementNormalizeStream($assignedStream);
        }));

        $db->close();
        $choiceMessage = $secondSemesterPortal['message'];
        if ($semester !== 2) {
            $choiceMessage = '';
        }
        sendJsonResponse([
            'success' => true,
            'choices' => $choices,
            'is_submitted' => !empty($choices),
            'semester' => $semester,
            'activeSemester' => $activeSemester,
            'assignedStream' => $assignedStream,
            'assignedCollege' => $allocation['college'],
            'placementGroup' => $allocation['group'],
            'placementExecuted' => $placementExecuted,
            'is_placed' => $placementExecuted,
            'isLocked' => $isLocked,
            'is_choice_editable' => $choiceEditable,
            'secondSemesterChoiceEligible' => $secondSemesterEligible,
            'isSecondSemesterChoiceOpen' => $secondSemesterOpen,
            'secondSemesterChoiceFinalized' => $secondSemesterPortal['isFinalized'],
            'message' => $choiceMessage,
            'allowedDepartments' => $availableDepartments,
            'minimumChoices' => count($availableDepartments),
        ]);
    }

    $input = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($input)) {
        sendJsonResponse(['success' => false, 'message' => 'The request body must be valid JSON.'], 400);
    }
    $studentId = trim((string) ($input['student_id'] ?? ''));
    $admissionNumber = trim((string) ($input['admission_number'] ?? ''));
    if ($admissionNumber === '' && $studentId !== '' && !ctype_digit($studentId)) {
        $admissionNumber = $studentId;
    }
    $choices = $input['choices'] ?? [];
    if ($admissionNumber === '' || !is_array($choices) || !$choices) {
        sendJsonResponse(['success' => false, 'message' => 'Admission number and choices are required.'], 400);
    }
    $requestedSemester = $input['semester'] ?? null;
    if (!in_array($requestedSemester, [1, 2, '1', '2'], true)) {
        sendJsonResponse(['success' => false, 'message' => 'A valid placement semester is required.'], 400);
    }
    $semester = (int) $requestedSemester;
    $activeSemester = getActivePlacementSemester($db);
    $storedPlacementStatus = strtolower(trim(
        getStudentStoredPlacementStatus($db, $studentId, $admissionNumber)
    ));
    $choiceEditable = isStudentChoiceExplicitlyEditable($db, $studentId, $admissionNumber);
    $studentAllocation = getStudentAllocatedPlacementGroup($db, $studentId, $admissionNumber);
    $secondSemesterPortal = getStudentSecondSemesterChoicePortalState(
        $db,
        $studentId,
        $admissionNumber
    );
    $secondSemesterStage = in_array($storedPlacementStatus, [
        'pending 2nd semester',
        'placed in semester 1',
        'allocated',
    ], true);
    $pendingSecondSemesterEditable = $semester === 2
        && $secondSemesterStage
        && trim((string) ($studentAllocation['college'] ?? '')) !== ''
        && trim((string) ($studentAllocation['group'] ?? '')) !== ''
        && $secondSemesterPortal['isOpen']
        && !$secondSemesterPortal['isFinalized'];
    $choiceEditable = $choiceEditable || $pendingSecondSemesterEditable;
    $canCompleteFirstSemester = $semester === 1
        && $activeSemester === 2
        && in_array($storedPlacementStatus, ['pending', 'pending 1st semester'], true)
        && !hasStudentPlacementForSemester($db, $studentId, $admissionNumber, 1);
    $canSubmitOpenSecondSemester = $semester === 2
        && $secondSemesterPortal['eligible']
        && $secondSemesterPortal['isOpen'];
    if ($semester !== $activeSemester && !$canCompleteFirstSemester && !$canSubmitOpenSecondSemester) {
        sendJsonResponse([
            'success' => false,
            'message' => "Semester {$semester} preferences cannot be submitted while Semester {$activeSemester} is active.",
        ], 409);
    }
    $secondSemesterEligible = $secondSemesterPortal['eligible'] || $pendingSecondSemesterEditable;
    $secondSemesterOpen = $secondSemesterPortal['isOpen'];
    if ($semester === 2 && !$secondSemesterEligible) {
        sendJsonResponse([
            'success' => false,
            'message' => 'Semester 2 preferences are available only after Semester 1 placement and college allocation are complete.',
        ], 403);
    }
    if ($semester === 2 && !$secondSemesterOpen && !$choiceEditable) {
        sendJsonResponse([
            'success' => false,
            'isLocked' => true,
            'message' => $secondSemesterPortal['message'],
        ], 403);
    }
    if (
        !($semester === 2 && $secondSemesterEligible && $secondSemesterOpen)
        && !$choiceEditable
        && isStudentChoiceEditingLocked($db, $studentId, $admissionNumber)
    ) {
        sendJsonResponse([
            'success' => false,
            'message' => 'Cannot modify choices after placement run.',
        ], 409);
    }
    $allocation = $semester === 2
        ? $studentAllocation
        : ['group' => '', 'college' => ''];
    if ($semester === 2 && ($allocation['group'] === '' || trim((string) $allocation['college']) === '')) {
        sendJsonResponse([
            'success' => false,
            'message' => 'Semester 2 preferences are only available after your placement group has been assigned.',
        ], 403);
    }
    $choiceColumns = getTableColumns($db, 'student_choices');
    foreach (['admission_number', 'dept_id', 'dept_name', 'stream', 'college_name', 'priority', 'semester'] as $requiredColumn) {
        if (!in_array($requiredColumn, $choiceColumns, true)) {
            throw new RuntimeException('The student_choices table is missing required column ' . $requiredColumn);
        }
    }
    $identityConditions = ['TRIM(admission_number) = TRIM(?)'];
    $identityValues = [$admissionNumber];
    $identityTypes = 's';

    $assignedStream = $semester === 2
        ? getStudentAssignedPlacementStream($db, $studentId, $admissionNumber)
        : '';
    $normalizedAssignedStream = placementNormalizeStream($assignedStream);
    if ($semester === 2 && $normalizedAssignedStream === '') {
        sendJsonResponse([
            'success' => false,
            'message' => 'Unable to verify your assigned stream. Please contact the Registrar Office.',
        ], 400);
    }
    $activeDepartments = getActiveDepartments($db, $semester);
    if ($semester === 2) {
        $activeDepartments = array_values(array_filter(
            $activeDepartments,
            static fn(array $department): bool => placementDepartmentOfferedInSemester($department, 2)
                && placementNormalizeStream((string) ($department['stream'] ?? ''))
                    === $normalizedAssignedStream
        ));
    } else {
        $assignedStream = getStudentAssignedPlacementStream($db, $studentId, $admissionNumber);
        $normalizedAssignedStream = strtolower(preg_replace('/[^a-z]/i', '', $assignedStream) ?? '');
        if (!str_contains($normalizedAssignedStream, 'natural') && !str_contains($normalizedAssignedStream, 'social')) {
            sendJsonResponse([
                'success' => false,
                'message' => 'Unable to verify your assigned stream. Please contact the Registrar Office.',
            ], 400);
        }
    }
    $departmentById = [];
    foreach ($activeDepartments as $department) {
        $departmentById[$department['id']] = $department;
    }
    $activeColleges = [];
    foreach ($activeDepartments as $department) {
        $collegeName = trim((string) ($department['college_name'] ?? ''));
        if ($collegeName !== '') {
            if ($semester !== 2 || !placementDepartmentOfferedInSemester($department, 2)) {
                continue;
            }
            $activeColleges[strtolower($collegeName)] ??= $department;
        }
    }
    $validatedChoices = [];
    $seenDepartments = [];
    $seenBroadColleges = [];
    $seenPriorities = [];
    $selectedPlacementGroups = [];
    foreach ($choices as $index => $choice) {
        if (!is_array($choice)) {
            sendJsonResponse(['success' => false, 'message' => 'Each preference must be a department or college choice.'], 400);
        }
        $departmentIdValue = $choice['dept_id'] ?? $choice['department_id'] ?? null;
        if ($departmentIdValue === '' || $departmentIdValue === 0 || $departmentIdValue === '0') {
            $departmentIdValue = null;
        }
        $collegeInput = trim((string) ($choice['college_name'] ?? $choice['college'] ?? ''));
        $choiceType = strtolower(trim((string) ($choice['type'] ?? '')));
        $broadNameInput = trim((string) (
            $choice['dept_name']
            ?? $choice['department_name']
            ?? $choice['group_name']
            ?? $choice['label']
            ?? ''
        ));
        $isBroadGroup = $choiceType === 'broad_group'
            || (!empty($choice['broad_group']) && $choiceType !== 'college_queue')
            || (
                $departmentIdValue === null
                && $broadNameInput !== ''
                && $broadNameInput !== 'Broad Group / Semester 2 Queue'
                && $choiceType !== 'college_queue'
            );
        $isBroadCollegeQueue = !$isBroadGroup && ($choiceType === 'college_queue'
            || !empty($choice['broad_group'])
            || ($departmentIdValue === null && $collegeInput !== ''));
        if ($isBroadGroup) {
            if ($semester === 2) {
                sendJsonResponse([
                    'success' => false,
                    'message' => 'Broad placement groups cannot be selected as Semester 2 department preferences.',
                ], 400);
            }
            $departmentName = $broadNameInput;
            if ($departmentName === '') {
                sendJsonResponse(['success' => false, 'message' => 'A broad preference must include its group or stream name.'], 400);
            }
            $broadGroupKey = strtolower($departmentName);
            if (isset($seenBroadColleges[$broadGroupKey])) {
                sendJsonResponse(['success' => false, 'message' => 'Each broad group can only be selected once.'], 400);
            }
            $departmentId = null;
            $collegeName = $collegeInput;
            $stream = $semester === 1
                ? $assignedStream
                : trim((string) ($choice['stream'] ?? ''));
            $placementGroup = normalizeStudentPlacementGroup('', $departmentName);
            $seenBroadColleges[$broadGroupKey] = true;
        } elseif ($isBroadCollegeQueue) {
            if ($semester === 2) {
                sendJsonResponse([
                    'success' => false,
                    'message' => 'Semester 2 preferences must select departments within your allocated group.',
                ], 400);
            }
            $collegeKey = strtolower($collegeInput);
            if ($semester !== 2 || $collegeInput === '' || !isset($activeColleges[$collegeKey])) {
                sendJsonResponse(['success' => false, 'message' => 'A Semester 2 queue must reference an active college.'], 400);
            }
            if (isset($seenBroadColleges[$collegeKey])) {
                sendJsonResponse(['success' => false, 'message' => 'Each college queue can only be selected once.'], 400);
            }
            $departmentId = null;
            $departmentName = 'Broad Group / Semester 2 Queue';
            $collegeName = trim((string) $activeColleges[$collegeKey]['college_name']);
            $stream = (string) ($activeColleges[$collegeKey]['stream'] ?? '');
            $placementGroup = normalizeStudentPlacementGroup(
                (string) ($activeColleges[$collegeKey]['placement_group'] ?? ''),
                $collegeName,
                $stream
            );
            $seenBroadColleges[$collegeKey] = true;
        } else {
            $departmentId = (int) $departmentIdValue;
            if ($departmentId <= 0 || !isset($departmentById[$departmentId])) {
                sendJsonResponse([
                    'success' => false,
                    'message' => 'A selected department is no longer active. Refresh and try again.',
                ], 400);
            }
            $department = $departmentById[$departmentId];
            if ($semester === 1) {
                $departmentStream = strtolower(preg_replace(
                    '/[^a-z]/i',
                    '',
                    (string) ($department['stream'] ?? '')
                ) ?? '');
                $isWrongStream = $departmentStream !== ''
                    && (
                        (str_contains($normalizedAssignedStream, 'natural')
                            && !str_contains($departmentStream, 'natural'))
                        || (str_contains($normalizedAssignedStream, 'social')
                            && !str_contains($departmentStream, 'social'))
                    );
                if ($isWrongStream) {
                    sendJsonResponse([
                        'success' => false,
                        'message' => 'Selected departments must belong to your assigned stream.',
                    ], 400);
                }
            }
            $available = placementDepartmentOfferedInSemester($department, $semester);
            if (!$available) {
                sendJsonResponse(['success' => false, 'message' => 'A selected department is not available in this semester.'], 400);
            }
            if ($semester === 2) {
                if (placementNormalizeStream((string) ($department['stream'] ?? ''))
                    !== $normalizedAssignedStream) {
                    sendJsonResponse([
                        'success' => false,
                        'message' => 'Selected departments must belong to your assigned stream.',
                    ], 400);
                }
            }
            if (isset($seenDepartments[$departmentId])) {
                sendJsonResponse(['success' => false, 'message' => 'Each department can only be selected once.'], 400);
            }
            $departmentName = (string) $department['name'];
            $collegeName = trim((string) $department['college_name']);
            $placementGroup = normalizeStudentPlacementGroup(
                (string) ($department['placement_group'] ?? ''),
                $collegeName,
                (string) ($department['stream'] ?? '')
            );
            if (strcasecmp($collegeName, 'Law') === 0) {
                $collegeName = 'School of Law';
            }
            $stream = (string) $department['stream'];
            $seenDepartments[$departmentId] = true;
        }
        if ($semester === 1 && $placementGroup !== '') {
            $selectedPlacementGroups[$placementGroup] = true;
        }
        $priority = isset($choice['priority']) ? (int) $choice['priority'] : $index + 1;
        if ($priority < 1) {
            sendJsonResponse(['success' => false, 'message' => 'Each preference must have a valid priority number.'], 400);
        }
        if (isset($seenPriorities[$priority])) {
            sendJsonResponse(['success' => false, 'message' => 'Each choice priority must be unique.'], 400);
        }
        $seenPriorities[$priority] = true;
        $validatedChoices[] = [
            'dept_id' => $departmentId,
            'dept_name' => $departmentName,
            'college_name' => $collegeName,
            'stream' => $stream,
            'priority' => $priority,
        ];
    }
    usort($validatedChoices, static fn (array $left, array $right): int => $left['priority'] <=> $right['priority']);
    foreach ($validatedChoices as $index => $choice) {
        if ($choice['priority'] !== $index + 1) {
            sendJsonResponse([
                'success' => false,
                'message' => 'Choice priorities must be sequential, starting at 1.',
            ], 400);
        }
    }
    if ($semester === 1) {
        $requiredPlacementGroups = str_contains($normalizedAssignedStream, 'natural')
            ? ['health_science', 'git', 'other_natural_science']
            : ['law', 'other_social_science'];
        foreach ($requiredPlacementGroups as $requiredGroup) {
            if (!isset($selectedPlacementGroups[$requiredGroup])) {
                sendJsonResponse([
                    'success' => false,
                    'message' => 'Select a preference for every available college or placement group in your assigned stream.',
                ], 400);
            }
        }

        foreach ($activeDepartments as $department) {
            $departmentStream = strtolower(preg_replace(
                '/[^a-z]/i',
                '',
                (string) ($department['stream'] ?? '')
            ) ?? '');
            $matchesAssignedStream = str_contains($normalizedAssignedStream, 'natural')
                ? str_contains($departmentStream, 'natural')
                : str_contains($departmentStream, 'social');
            $group = normalizeStudentPlacementGroup(
                (string) ($department['placement_group'] ?? ''),
                (string) ($department['college_name'] ?? ''),
                (string) ($department['stream'] ?? '')
            );
            if (
                (int) ($department['offered_semester'] ?? 0) === 1
                && $matchesAssignedStream
                && in_array($group, ['health_science', 'git'], true)
                && !isset($seenDepartments[(int) $department['id']])
            ) {
                sendJsonResponse([
                    'success' => false,
                    'message' => 'Rank every active department in each selected college before submitting.',
                ], 400);
            }
        }
    }

    $insertColumns = ['admission_number', 'dept_id', 'dept_name', 'stream', 'college_name', 'priority', 'semester'];

    $db->begin_transaction();
    try {
        $deleteConditions = ['(' . implode(' OR ', $identityConditions) . ')'];
        $deleteValues = $identityValues;
        $deleteTypes = $identityTypes;
        $deleteConditions[] = 'semester = ?';
        $deleteValues[] = (string) $semester;
        $deleteTypes .= 's';
        $delete = $db->prepare(
            'DELETE FROM student_choices WHERE ' . implode(' AND ', $deleteConditions)
        );
        bindStatementValues($delete, $deleteTypes, $deleteValues);
        $delete->execute();
        $delete->close();

        $placeholders = implode(', ', array_fill(0, count($insertColumns), '?'));
        $insert = $db->prepare(
            'INSERT INTO student_choices (`' . implode('`, `', $insertColumns) . '`) VALUES (' . $placeholders . ')'
        );
        foreach ($validatedChoices as $choice) {
            $values = [];
            $types = '';
            foreach ($insertColumns as $column) {
                switch ($column) {
                    case 'admission_number':
                        $values[] = $admissionNumber;
                        $types .= 's';
                        break;
                    case 'dept_id':
                        $values[] = $choice['dept_id'];
                        $types .= 'i';
                        break;
                    case 'dept_name':
                        $values[] = $choice['dept_name'];
                        $types .= 's';
                        break;
                    case 'college_name':
                        $values[] = $choice['college_name'];
                        $types .= 's';
                        break;
                    case 'stream':
                        $values[] = $choice['stream'];
                        $types .= 's';
                        break;
                    case 'priority':
                        $values[] = $choice['priority'];
                        $types .= 'i';
                        break;
                    case 'semester':
                        $values[] = $semester;
                        $types .= 'i';
                        break;
                }
            }
            bindStatementValues($insert, $types, $values);
            $insert->execute();
        }
        $verification = $db->prepare(
            'SELECT COUNT(*) AS saved_count,
                    COUNT(DISTINCT priority) AS distinct_priorities,
                    SUM(CASE
                        WHEN dept_id IS NULL OR dept_id <= 0
                          OR dept_name IS NULL OR TRIM(dept_name) = \'\'
                        THEN 1 ELSE 0
                    END) AS incomplete_department_count
             FROM student_choices
             WHERE TRIM(admission_number) = TRIM(?) AND semester = ?'
        );
        $verification->bind_param('si', $admissionNumber, $semester);
        $verification->execute();
        $savedChoices = $verification->get_result()->fetch_assoc();
        $verification->close();
        $savedCount = (int) ($savedChoices['saved_count'] ?? 0);
        $distinctPriorityCount = (int) ($savedChoices['distinct_priorities'] ?? 0);
        $incompleteDepartmentCount = (int) ($savedChoices['incomplete_department_count'] ?? 0);
        if (
            $savedCount !== count($validatedChoices)
            || $distinctPriorityCount !== $savedCount
            || ($semester === 2 && $incompleteDepartmentCount !== 0)
        ) {
            throw new RuntimeException('Saved preferences did not match the submitted semester, departments, and ranks.');
        }
        $insert->close();
        $db->commit();
        $db->close();
        sendJsonResponse([
            'success' => true,
            'message' => 'Preferences saved and verified successfully.',
            'semester' => $semester,
            'saved_count' => $savedCount,
        ]);
    } catch (Throwable $error) {
        $db->rollback();
        throw $error;
    }
} catch (Throwable $error) {
    error_log('Student preferences request failed: ' . $error->getMessage());
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
    sendJsonResponse([
        'success' => false,
        'message' => 'Student preferences are temporarily unavailable. Please contact the Registrar if the problem continues.',
    ], 503);
}

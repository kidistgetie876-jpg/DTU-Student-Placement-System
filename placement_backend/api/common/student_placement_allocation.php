<?php
require_once __DIR__ . '/student_placement_schema.php';

function normalizeStudentPlacementGroup(string $group, string $collegeName = '', string $stream = ''): string
{
    $normalized = strtolower(trim($group));
    $normalized = preg_replace('/[^a-z0-9]+/', '_', $normalized) ?? '';
    $normalized = trim($normalized, '_');
    $aliases = [
        'health_science' => 'health_science',
        'health_sciences' => 'health_science',
        'git' => 'git',
        'gafat_institute_of_technology' => 'git',
        'other_natural_science' => 'other_natural_science',
        'other_natural_sciences' => 'other_natural_science',
        'law' => 'law',
        'school_of_law' => 'law',
        'other_social_science' => 'other_social_science',
        'other_social_sciences' => 'other_social_science',
    ];
    if (isset($aliases[$normalized])) {
        return $aliases[$normalized];
    }

    $college = strtolower(trim($collegeName));
    if (str_contains($college, 'health')) {
        return 'health_science';
    }
    if (str_contains($college, 'gafat') || str_contains($college, 'technology')) {
        return 'git';
    }
    if (str_contains($college, 'law')) {
        return 'law';
    }
    if (str_contains($college, 'other social')) {
        return 'other_social_science';
    }
    if (in_array(trim(preg_replace('/\s+/', ' ', $college) ?? $college), ['social science', 'social sciences'], true)) {
        return 'other_social_science';
    }
    if (str_contains($college, 'other natural')) {
        return 'other_natural_science';
    }

    $normalizedStream = strtolower(trim($stream));
    if (str_contains($normalizedStream, 'social')) {
        return 'other_social_science';
    }
    if (str_contains($normalizedStream, 'natural')) {
        return 'other_natural_science';
    }
    return '';
}

function normalizeStudentPlacementCollegeName(string $collegeName): string
{
    $normalized = strtolower(trim(preg_replace('/\s+/', ' ', $collegeName) ?? $collegeName));
    $normalized = preg_replace('/^(college|school) of /', '', $normalized) ?? $normalized;
    $normalized = preg_replace('/sciences\b/', 'science', $normalized) ?? $normalized;
    if (str_contains($normalized, 'health science')) {
        return 'health science';
    }
    if (str_contains($normalized, 'gafat') || str_contains($normalized, 'technology')) {
        return 'gafat institute of technology';
    }
    if (str_contains($normalized, 'law')) {
        return 'law';
    }
    if (str_contains($normalized, 'other social science')) {
        return 'other social science';
    }
    if (str_contains($normalized, 'other natural science')) {
        return 'other natural science';
    }
    if (in_array($normalized, ['social science', 'social sciences'], true)) {
        return 'other social science';
    }
    return trim($normalized);
}

function studentPlacementAllocationIdentity(array $columns, string $studentId, string $admissionNumber, string $alias = ''): array
{
    $prefix = $alias !== '' ? $alias . '.' : '';
    $conditions = [];
    $values = [];
    if ($studentId !== '' && in_array('student_id', $columns, true)) {
        $conditions[] = $prefix . 'student_id = ?';
        $values[] = $studentId;
    }
    if ($admissionNumber !== '' && in_array('admission_number', $columns, true)) {
        $conditions[] = 'TRIM(' . $prefix . 'admission_number) = TRIM(?)';
        $values[] = $admissionNumber;
    }
    if ($admissionNumber !== '' && in_array('id_number', $columns, true)) {
        $conditions[] = 'TRIM(' . $prefix . 'id_number) = TRIM(?)';
        $values[] = $admissionNumber;
    }
    return [$conditions, $values];
}

function studentPlacementAllocationBind(mysqli_stmt $statement, array &$values): void
{
    if (!$values) {
        return;
    }
    $arguments = [str_repeat('s', count($values))];
    foreach ($values as &$value) {
        $arguments[] = &$value;
    }
    call_user_func_array([$statement, 'bind_param'], $arguments);
}

function getStudentAssignedPlacementStream(mysqli $db, string $studentId, string $admissionNumber): string
{
    $columns = studentPlacementTableColumns($db, 'student_data');
    $streamColumns = array_values(array_filter(
        ['field_of_study', 'stream'],
        static fn(string $column): bool => in_array($column, $columns, true)
    ));
    if (!$streamColumns) {
        return '';
    }

    $identitySets = [];
    if ($admissionNumber !== '') {
        $conditions = [];
        $values = [];
        foreach (['admission_number', 'id_number'] as $column) {
            if (in_array($column, $columns, true)) {
                $conditions[] = 'TRIM(sd.`' . $column . '`) = TRIM(?)';
                $values[] = $admissionNumber;
            }
        }
        if ($conditions) {
            $identitySets[] = [$conditions, $values];
        }
    }
    if ($studentId !== '') {
        $conditions = [];
        $values = [];
        foreach (['user_id', 'id', 'student_id'] as $column) {
            if (in_array($column, $columns, true)) {
                $conditions[] = 'sd.`' . $column . '` = ?';
                $values[] = $studentId;
            }
        }
        if ($conditions) {
            $identitySets[] = [$conditions, $values];
        }
    }
    if (!$identitySets) {
        return '';
    }

    $streamExpressions = array_map(
        static fn(string $column): string => "NULLIF(TRIM(sd.`{$column}`), '')",
        $streamColumns
    );
    foreach ($identitySets as [$conditions, $values]) {
        $statement = $db->prepare(
            'SELECT COALESCE(' . implode(', ', $streamExpressions) . ") AS assigned_stream
             FROM student_data sd WHERE (" . implode(' OR ', $conditions) . ') LIMIT 1'
        );
        if (!$statement) {
            throw new RuntimeException('Unable to prepare the student stream lookup: ' . $db->error);
        }
        studentPlacementAllocationBind($statement, $values);
        if (!$statement->execute()) {
            $error = $statement->error;
            $statement->close();
            throw new RuntimeException('Unable to load the student stream: ' . $error);
        }
        $result = $statement->get_result();
        $row = $result ? $result->fetch_assoc() : null;
        $statement->close();
        $stream = studentPlacementNormalizeStream((string) ($row['assigned_stream'] ?? ''));
        if ($stream !== '') {
            return $stream;
        }
    }
    return '';
}

function getStudentAllocatedPlacementGroup(mysqli $db, string $studentId, string $admissionNumber): array
{
    $allocationColumns = studentPlacementTableColumns($db, 'placement_college_allocations');
    if ($allocationColumns) {
        [$conditions, $values] = studentPlacementAllocationIdentity(
            $allocationColumns,
            $studentId,
            $admissionNumber
        );
        if ($conditions && in_array('placement_group', $allocationColumns, true)) {
            $where = ['(' . implode(' OR ', $conditions) . ')'];
            if (in_array('target_semester', $allocationColumns, true)) {
                $where[] = 'target_semester = 2';
            }
            $collegeColumn = in_array('college_name', $allocationColumns, true) ? 'college_name' : "''";
            $statement = $db->prepare(
                'SELECT placement_group, ' . $collegeColumn . ' AS college_name
                 FROM placement_college_allocations WHERE ' . implode(' AND ', $where)
                 . (in_array('id', $allocationColumns, true) ? ' ORDER BY id DESC' : '')
                 . ' LIMIT 1'
            );
            if ($statement) {
                studentPlacementAllocationBind($statement, $values);
                if ($statement->execute()) {
                    $result = $statement->get_result();
                    $row = $result ? $result->fetch_assoc() : null;
                    if ($row) {
                        $collegeName = trim((string) ($row['college_name'] ?? ''));
                        $group = normalizeStudentPlacementGroup(
                            (string) ($row['placement_group'] ?? ''),
                            $collegeName
                        );
                        if ($group !== '') {
                            $statement->close();
                            return ['group' => $group, 'college' => $collegeName];
                        }
                    }
                }
                $statement->close();
            }
        }
    }

    $resultColumns = studentPlacementTableColumns($db, 'placement_results');
    $departmentColumns = studentPlacementTableColumns($db, 'departments');
    $departmentIdColumn = in_array('dept_id', $resultColumns, true)
        ? 'dept_id'
        : (in_array('department_id', $resultColumns, true) ? 'department_id' : '');
    if (
        !$departmentIdColumn || !in_array('id', $departmentColumns, true)
        || !in_array('placement_group', $departmentColumns, true)
    ) {
        return ['group' => '', 'college' => ''];
    }

    [$conditions, $values] = studentPlacementAllocationIdentity(
        $resultColumns,
        $studentId,
        $admissionNumber,
        'pr'
    );
    if (!$conditions) {
        return ['group' => '', 'college' => ''];
    }
    $semesterCondition = in_array('placement_semester', $resultColumns, true)
        ? ' AND pr.placement_semester = 1'
        : '';
    $collegeColumn = in_array('college_name', $departmentColumns) ? 'd.college_name' : "''";
    $streamColumn = in_array('stream', $departmentColumns) ? 'd.stream' : "''";
    $statement = $db->prepare(
        'SELECT d.placement_group, ' . $collegeColumn . ' AS college_name, ' . $streamColumn . ' AS stream
         FROM placement_results pr
         INNER JOIN departments d ON d.id = pr.`' . $departmentIdColumn . '`
         WHERE (' . implode(' OR ', $conditions) . ')' . $semesterCondition . '
         ' . (in_array('id', $resultColumns, true) ? 'ORDER BY pr.id DESC ' : '') . 'LIMIT 1'
    );
    if (!$statement) {
        return ['group' => '', 'college' => ''];
    }
    studentPlacementAllocationBind($statement, $values);
    $allocation = ['group' => '', 'college' => ''];
    if ($statement->execute()) {
        $result = $statement->get_result();
        $row = $result ? $result->fetch_assoc() : null;
        if ($row) {
            $collegeName = trim((string) ($row['college_name'] ?? ''));
            $allocation = [
                'group' => normalizeStudentPlacementGroup(
                    (string) ($row['placement_group'] ?? ''),
                    $collegeName,
                    (string) ($row['stream'] ?? '')
                ),
                'college' => $collegeName,
            ];
        }
    }
    $statement->close();
    return $allocation;
}

function hasStudentPlacementForSemester(mysqli $db, string $studentId, string $admissionNumber, int $semester): bool
{
    $columns = studentPlacementTableColumns($db, 'placement_results');
    if (!$columns) {
        return false;
    }
    [$conditions, $values] = studentPlacementAllocationIdentity(
        $columns,
        $studentId,
        $admissionNumber,
        'pr'
    );
    if (!$conditions) {
        return false;
    }
    $semesterCondition = in_array('placement_semester', $columns, true)
        ? ' AND pr.placement_semester = ?'
        : ($semester === 1 ? '' : ' AND 1 = 0');
    if (in_array('placement_semester', $columns, true)) {
        $values[] = (string) $semester;
    }
    $statement = $db->prepare(
        'SELECT 1 FROM placement_results pr WHERE (' . implode(' OR ', $conditions) . ')'
        . $semesterCondition . ' LIMIT 1'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to verify whether placement has been executed.');
    }
    studentPlacementAllocationBind($statement, $values);
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to verify whether placement has been executed: ' . $error);
    }
    $result = $statement->get_result();
    $exists = $result && $result->num_rows > 0;
    $statement->close();
    if ($exists || $semester !== 1) {
        return $exists;
    }

    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    $statusColumns = array_values(array_filter(
        ['is_placed', 'placement_status', 'status'],
        static fn(string $column): bool => in_array($column, $studentColumns, true)
    ));
    if (!$statusColumns) {
        return false;
    }
    $conditions = [];
    $values = [];
    if ($studentId !== '' && in_array('user_id', $studentColumns, true)) {
        $conditions[] = 'user_id = ?';
        $values[] = $studentId;
    }
    foreach (['admission_number', 'id_number'] as $identityColumn) {
        if ($admissionNumber !== '' && in_array($identityColumn, $studentColumns, true)) {
            $conditions[] = 'TRIM(`' . $identityColumn . '`) = TRIM(?)';
            $values[] = $admissionNumber;
        }
    }
    if (!$conditions) {
        return false;
    }
    $selectColumns = array_map(static fn(string $column): string => '`' . $column . '`', $statusColumns);
    $studentStatement = $db->prepare(
        'SELECT ' . implode(', ', $selectColumns) . ' FROM student_data
         WHERE (' . implode(' OR ', $conditions) . ') LIMIT 1'
    );
    if (!$studentStatement) {
        throw new RuntimeException('Unable to verify the student placement status.');
    }
    studentPlacementAllocationBind($studentStatement, $values);
    if (!$studentStatement->execute()) {
        $error = $studentStatement->error;
        $studentStatement->close();
        throw new RuntimeException('Unable to verify the student placement status: ' . $error);
    }
    $studentResult = $studentStatement->get_result();
    $student = $studentResult ? $studentResult->fetch_assoc() : null;
    $studentStatement->close();
    if (!$student) {
        return false;
    }
    if (in_array(
        strtolower(trim((string) ($student['is_placed'] ?? ''))),
        ['1', 'true', 'yes', 'on', 'placed'],
        true
    )) {
        return true;
    }
    foreach (['placement_status', 'status'] as $statusColumn) {
        if (in_array(strtolower(trim((string) ($student[$statusColumn] ?? ''))), ['placed', 'approved', 'assigned', 'completed'], true)) {
            return true;
        }
    }
    return false;
}

function hasApprovedStudentPlacementForSemester(mysqli $db, string $studentId, string $admissionNumber, int $semester): bool
{
    $columns = studentPlacementTableColumns($db, 'placement_results');
    $semesterColumn = in_array('placement_semester', $columns, true)
        ? 'placement_semester'
        : (in_array('semester', $columns, true) ? 'semester' : '');
    $departmentColumn = in_array('dept_name', $columns, true)
        ? 'dept_name'
        : (in_array('assigned_department', $columns, true) ? 'assigned_department' : '');
    if ($semesterColumn === '' || $departmentColumn === '') {
        return false;
    }

    $approvalConditions = [];
    if (in_array('status', $columns, true)) {
        $approvalConditions[] = "LOWER(TRIM(COALESCE(pr.status, ''))) IN ('published', 'finalized')";
    }
    if (in_array('is_published', $columns, true)) {
        $approvalConditions[] = 'pr.is_published = 1';
    }
    if (!$approvalConditions) {
        return false;
    }

    [$conditions, $values] = studentPlacementAllocationIdentity(
        $columns,
        $studentId,
        $admissionNumber,
        'pr'
    );
    if (!$conditions) {
        return false;
    }
    $values[] = (string) $semester;
    $statement = $db->prepare(
        'SELECT 1 FROM placement_results pr
         WHERE (' . implode(' OR ', $conditions) . ")
           AND pr.`{$semesterColumn}` = ?
           AND NULLIF(TRIM(COALESCE(pr.`{$departmentColumn}`, '')), '') IS NOT NULL
           AND LOWER(TRIM(pr.`{$departmentColumn}`)) NOT IN ('not assigned', 'unassigned')
           AND (" . implode(' OR ', $approvalConditions) . ')
         LIMIT 1'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to verify whether placement has been approved: ' . $db->error);
    }
    studentPlacementAllocationBind($statement, $values);
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to verify placement approval: ' . $error);
    }
    $result = $statement->get_result();
    $exists = $result && $result->num_rows > 0;
    $statement->close();
    return $exists;
}

function getStudentStoredPlacementStatus(mysqli $db, string $studentId, string $admissionNumber): string
{
    $columns = studentPlacementTableColumns($db, 'student_data');
    $statusColumns = array_values(array_intersect(['placement_status', 'status'], $columns));
    if (!$statusColumns) {
        return '';
    }

    $conditions = [];
    $values = [];
    foreach (['admission_number', 'id_number'] as $column) {
        if ($admissionNumber !== '' && in_array($column, $columns, true)) {
            $conditions[] = "TRIM(`{$column}`) = TRIM(?)";
            $values[] = $admissionNumber;
        }
    }
    if (!$conditions && $studentId !== '') {
        foreach (['user_id', 'student_id', 'id'] as $column) {
            if (in_array($column, $columns, true)) {
                $conditions[] = "`{$column}` = ?";
                $values[] = $studentId;
                break;
            }
        }
    }
    if (!$conditions) {
        return '';
    }

    $statusExpressions = array_map(
        static fn(string $column): string => "NULLIF(TRIM(`{$column}`), '')",
        $statusColumns
    );
    $statement = $db->prepare(
        'SELECT COALESCE(' . implode(', ', $statusExpressions) . ", '') AS placement_status
         FROM student_data WHERE (" . implode(' OR ', $conditions) . ') LIMIT 1'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare the student placement status lookup: ' . $db->error);
    }
    studentPlacementAllocationBind($statement, $values);
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to read student placement status: ' . $error);
    }
    $result = $statement->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $status = trim((string) ($row['placement_status'] ?? ''));
    $statement->close();

    return $status;
}

function isStudentChoiceExplicitlyEditable(mysqli $db, string $studentId, string $admissionNumber): bool
{
    if (hasApprovedStudentPlacementForSemester($db, $studentId, $admissionNumber, 2)) {
        return false;
    }

    $status = strtolower(trim(getStudentStoredPlacementStatus($db, $studentId, $admissionNumber)));
    $allocation = getStudentAllocatedPlacementGroup($db, $studentId, $admissionNumber);
    $hasAllocation = trim((string) ($allocation['group'] ?? '')) !== ''
        && trim((string) ($allocation['college'] ?? '')) !== '';
    $secondSemesterStage = in_array(
        $status,
        ['pending 2nd semester', 'placed in semester 1', 'allocated'],
        true
    );
    if (
        $hasAllocation
        && ($secondSemesterStage || hasStudentPlacementForSemester($db, $studentId, $admissionNumber, 1))) {
        return isSecondSemesterChoicePortalOpen($db);
    }
    if ($secondSemesterStage) {
        return false;
    }
    if (in_array($status, ['pending', 'pending 1st semester'], true)) {
        return true;
    }

    $columns = studentPlacementTableColumns($db, 'student_data');
    if (!in_array('is_choice_editable', $columns, true)) {
        return false;
    }

    $conditions = [];
    $values = [];
    foreach (['user_id', 'id', 'student_id'] as $column) {
        if ($studentId !== '' && in_array($column, $columns, true)) {
            $conditions[] = "`{$column}` = ?";
            $values[] = $studentId;
        }
    }
    foreach (['admission_number', 'id_number'] as $column) {
        if ($admissionNumber !== '' && in_array($column, $columns, true)) {
            $conditions[] = "TRIM(`{$column}`) = TRIM(?)";
            $values[] = $admissionNumber;
        }
    }
    if (!$conditions) {
        return false;
    }

    $statement = $db->prepare(
        'SELECT COALESCE(is_choice_editable, 0) AS is_choice_editable
         FROM student_data WHERE (' . implode(' OR ', $conditions) . ') LIMIT 1'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare the student preference editability lookup: ' . $db->error);
    }
    studentPlacementAllocationBind($statement, $values);
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to read student preference editability: ' . $error);
    }
    $result = $statement->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $statement->close();

    return in_array(
        strtolower(trim((string) ($row['is_choice_editable'] ?? ''))),
        ['1', 'true', 'yes', 'on'],
        true
    );
}

function isSecondSemesterChoicePortalOpen(mysqli $db): bool
{
    $columns = studentPlacementTableColumns($db, 'placement_settings');
    if (!in_array('active_semester', $columns, true)
        || !in_array('is_second_sem_choice_open', $columns, true)) {
        return false;
    }

    $result = $db->query(
        'SELECT active_semester, is_second_sem_choice_open FROM placement_settings WHERE id = 1 LIMIT 1'
    );
    if (!$result) {
        throw new RuntimeException('Unable to load the second-semester choice portal state: ' . $db->error);
    }
    $settings = $result->fetch_assoc();
    $result->free();

    return (int) ($settings['is_second_sem_choice_open'] ?? 0) === 1;
}

function studentSecondSemesterChoicePortalState(
    string $studentStatus,
    array $allocation,
    bool $hasFirstSemesterPlacement,
    bool $portalOpen,
    bool $hasApprovedSecondSemesterPlacement = false
): array {
    $normalizedStatus = strtolower(trim($studentStatus));
    $hasAllocatedCollege = trim((string) ($allocation['group'] ?? '')) !== ''
        && trim((string) ($allocation['college'] ?? '')) !== '';
    $isEligibleStatus = in_array(
        $normalizedStatus,
        ['pending', 'pending 2nd semester', 'placed', 'placed in semester 1', 'allocated'],
        true
    );
    $hasCompletedFirstStageStatus = in_array(
        $normalizedStatus,
        ['pending 2nd semester', 'placed in semester 1', 'allocated'],
        true
    );
    $isEligible = $isEligibleStatus
        && $hasAllocatedCollege
        && ($hasFirstSemesterPlacement || $hasCompletedFirstStageStatus);
    $isOpen = $isEligible
        && $portalOpen
        && !$hasApprovedSecondSemesterPlacement;

    return [
        'eligible' => $isEligible,
        'isOpen' => $isOpen,
        'isLocked' => $isEligible ? $hasApprovedSecondSemesterPlacement : null,
        'isFinalized' => $hasApprovedSecondSemesterPlacement,
        'message' => !$isEligible
            ? ''
            : ($isOpen
                ? '2nd Semester Department Choice Portal is OPEN. Please rank your preferences.'
                : '2nd Semester choice portal is currently closed. Please wait for official registrar announcement.'),
    ];
}

function getStudentSecondSemesterChoicePortalState(
    mysqli $db,
    string $studentId,
    string $admissionNumber
): array {
    $allocation = getStudentAllocatedPlacementGroup($db, $studentId, $admissionNumber);
    $status = getStudentStoredPlacementStatus($db, $studentId, $admissionNumber);
    return studentSecondSemesterChoicePortalState(
        $status,
        $allocation,
        hasStudentPlacementForSemester($db, $studentId, $admissionNumber, 1),
        isSecondSemesterChoicePortalOpen($db),
        hasApprovedStudentPlacementForSemester($db, $studentId, $admissionNumber, 2)
    ) + ['allocation' => $allocation];
}

function isStudentChoiceEditingLocked(mysqli $db, string $studentId, string $admissionNumber): bool
{
    $settingsColumns = studentPlacementTableColumns($db, 'placement_settings');
    $lockColumns = array_values(array_intersect(
        ['is_locked', 'isLocked', 'placement_locked', 'is_placement_locked'],
        $settingsColumns
    ));
    if ($lockColumns) {
        $selectColumns = array_map(static fn(string $column): string => '`' . $column . '`', $lockColumns);
        $settingsResult = $db->query(
            'SELECT ' . implode(', ', $selectColumns) . ' FROM placement_settings WHERE id = 1 LIMIT 1'
        );
        if (!$settingsResult) {
            throw new RuntimeException('Unable to verify the global placement lock: ' . $db->error);
        }
        $settings = $settingsResult->fetch_assoc() ?: [];
        $settingsResult->free();
        foreach ($lockColumns as $column) {
            if (in_array(strtolower(trim((string) ($settings[$column] ?? ''))), ['1', 'true', 'yes', 'on'], true)) {
                return true;
            }
        }
    }

    return hasStudentPlacementForSemester($db, $studentId, $admissionNumber, 1)
        || hasStudentPlacementForSemester($db, $studentId, $admissionNumber, 2);
}

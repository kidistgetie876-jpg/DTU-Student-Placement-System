<?php

function placementPreferenceWindowIsActive(
    string $submissionStart,
    string $submissionDeadline,
    ?DateTimeImmutable $today = null
): bool {
    $start = DateTimeImmutable::createFromFormat('!Y-m-d', $submissionStart);
    $deadline = DateTimeImmutable::createFromFormat('!Y-m-d', $submissionDeadline);
    if (!$start || !$deadline
        || $start->format('Y-m-d') !== $submissionStart
        || $deadline->format('Y-m-d') !== $submissionDeadline
        || $start > $deadline) {
        return false;
    }

    $today = $today ?? new DateTimeImmutable('today', new DateTimeZone('Africa/Addis_Ababa'));
    $today = $today->setTime(0, 0);
    return $today >= $start && $today <= $deadline;
}

function placementDepartmentGroup(array $department): string
{
    $configuredGroup = trim((string) ($department['placement_group'] ?? ''));
    if ($configuredGroup !== '') {
        return trim(
            strtolower(preg_replace('/[^a-z0-9]+/i', '_', $configuredGroup) ?? ''),
            '_'
        );
    }

    $name = trim((string) ($department['name'] ?? ''));
    $collegeName = trim((string) ($department['college_name'] ?? ''));
    $normalizedStream = preg_replace('/[^a-z]/', '', strtolower((string) ($department['stream'] ?? '')));
    $naturalStream = in_array($normalizedStream, ['natural', 'naturalscience', 'naturalsciences'], true);
    $socialStream = in_array($normalizedStream, ['social', 'socialscience', 'socialsciences'], true);

    if ($naturalStream && stripos($collegeName, 'health science') !== false) {
        return 'health_science';
    }
    if ($naturalStream && (stripos($collegeName, 'gafat institute of technology') !== false
        || preg_match('/\b(?:g?it)\b/i', $collegeName))) {
        return 'git';
    }
    if ($socialStream && (strcasecmp($name, 'Law') === 0 || stripos($collegeName, 'law') !== false)) {
        return 'law';
    }
    if ($naturalStream) {
        return 'other_natural_science';
    }
    if ($socialStream) {
        return 'other_social_science';
    }
    return '';
}

function placementNormalizeStream(string $stream): string
{
    $normalized = strtolower(preg_replace('/[^a-z]/i', '', $stream));
    if (in_array($normalized, ['natural', 'naturalscience', 'naturalsciences'], true)) {
        return 'natural';
    }
    if (in_array($normalized, ['social', 'socialscience', 'socialsciences'], true)) {
        return 'social';
    }
    return $normalized;
}

function placementDepartmentStream(array $department): string
{
    $rawStream = strtolower(preg_replace(
        '/[^a-z]/i',
        '',
        (string) ($department['stream'] ?? '')
    ));
    if (str_contains($rawStream, 'natural')) {
        return 'natural';
    }
    if (str_contains($rawStream, 'social')) {
        return 'social';
    }
    $stream = placementNormalizeStream($rawStream);
    if (in_array($stream, ['natural', 'social'], true)) {
        return $stream;
    }
    if ($stream !== '') {
        return $stream;
    }

    $group = strtolower(preg_replace(
        '/[^a-z]/i',
        '',
        (string) ($department['placement_group'] ?? '')
    ));
    $college = strtolower(preg_replace(
        '/[^a-z]/i',
        '',
        (string) ($department['college_name'] ?? $department['college'] ?? '')
    ));
    if (str_contains($group, 'natural') || str_contains($college, 'natural')
        || str_contains($college, 'health') || str_contains($college, 'gafat')
        || str_contains($college, 'technology')) {
        return 'natural';
    }
    if (str_contains($group, 'social') || str_contains($group, 'law')
        || str_contains($college, 'social') || str_contains($college, 'law')) {
        return 'social';
    }

    return '';
}

function placementResolveAllocatedCollegeName(
    string $pendingAllocationCollege,
    string $firstSemesterPlacementCollege
): string {
    $firstSemesterPlacementCollege = trim($firstSemesterPlacementCollege);
    if ($firstSemesterPlacementCollege !== '') {
        return $firstSemesterPlacementCollege;
    }

    return trim($pendingAllocationCollege);
}

function placementNormalizeStudentStatus(string $status): string
{
    $normalizedStatus = strtolower(trim(str_replace(['_', '-'], ' ', $status)));
    $normalizedStatus = preg_replace('/\s+/', ' ', $normalizedStatus) ?? $normalizedStatus;

    switch ($normalizedStatus) {
        case 'pending second semester':
        case 'pending 2 semester':
            return 'pending 2nd semester';
        case 'pending first semester':
        case 'pending 1 semester':
            return 'pending 1st semester';
        default:
            return $normalizedStatus;
    }
}

function placementStudentStatusLabel(string $status): string
{
    switch (placementNormalizeStudentStatus($status)) {
        case 'pending':
            return 'Pending';
        case 'pending 1st semester':
            return 'Pending 1st Semester';
        case 'pending 2nd semester':
            return 'Pending 2nd Semester';
        default:
            return trim($status);
    }
}

function placementNormalizeStudentStatusSql(string $expression): string
{
    $normalized = "LOWER(TRIM(REPLACE(REPLACE(COALESCE({$expression}, ''), '_', ' '), '-', ' ')))";

    return "CASE
        WHEN {$normalized} IN ('pending second semester', 'pending 2 semester') THEN 'pending 2nd semester'
        WHEN {$normalized} IN ('pending first semester', 'pending 1 semester') THEN 'pending 1st semester'
        ELSE {$normalized}
    END";
}

function placementDepartmentCapacityCollegeName(array $department): string
{
    return trim((string) ($department['college_name'] ?? $department['college'] ?? ''));
}

function placementDepartmentAvailability(array $department): array
{
    $group = placementDepartmentGroup($department);
    if (in_array($group, ['health_science', 'git', 'law'], true)) {
        $inferredSemester = 1;
    } elseif (in_array($group, ['other_natural_science', 'other_social_science'], true)) {
        $inferredSemester = 2;
    } else {
        $inferredSemester = null;
    }
    $explicitSemester = isset($department['offered_semester'])
        && in_array((int) $department['offered_semester'], [1, 2], true)
        ? (int) $department['offered_semester']
        : null;
    $firstSemesterOnly = array_key_exists('is_first_semester_only', $department)
        ? in_array(
            strtolower(trim((string) $department['is_first_semester_only'])),
            ['1', 'true', 'yes', 'on'],
            true
        )
        : $inferredSemester === 1;

    return [
        'placement_group' => $group !== '' ? $group : (string) ($department['placement_group'] ?? ''),
        'offered_semester' => $explicitSemester ?? $inferredSemester ?? 1,
        'is_first_semester_only' => (int) $firstSemesterOnly,
    ];
}

function placementFirstSemesterCandidateStatusEligible(string $status): bool
{
    $normalizedStatus = placementNormalizeStudentStatus($status);
    if ($normalizedStatus === 'pending 2nd semester') {
        return false;
    }

    return in_array(
        $normalizedStatus,
        ['', 'pending', 'pending 1st semester', 'not assigned', 'unassigned'],
        true
    );
}

function placementDepartmentMapKey(array $department): string
{
    $departmentId = (int) ($department['id'] ?? 0);
    if ($departmentId > 0) {
        return 'id:' . $departmentId;
    }

    $name = strtolower(trim((string) ($department['name'] ?? '')));
    return $name === '' ? '' : 'name:' . $name;
}

function placementResolveDepartmentPreference(array $preference, array $departments): ?array
{
    $departmentId = (int) ($preference['dept_id'] ?? 0);
    if ($departmentId > 0) {
        foreach ($departments as $department) {
            if ((int) ($department['id'] ?? 0) === $departmentId) {
                return $department;
            }
        }
        return null;
    }

    $name = strtolower(trim((string) (
        $preference['department'] ?? $preference['dept_name'] ?? $preference['name'] ?? ''
    )));
    if ($name === '') {
        return null;
    }

    $collegeId = (int) ($preference['college_id'] ?? 0);
    $collegeName = strtolower(trim((string) (
        $preference['college_name'] ?? $preference['college'] ?? ''
    )));
    $stream = strtolower(trim((string) ($preference['stream'] ?? '')));
    $matches = [];
    foreach ($departments as $department) {
        if (strtolower(trim((string) ($department['name'] ?? ''))) !== $name) {
            continue;
        }
        if ($collegeId > 0 && (int) ($department['college_id'] ?? 0) !== $collegeId) {
            continue;
        }
        if ($collegeName !== '' && strtolower(trim((string) ($department['college_name'] ?? ''))) !== $collegeName) {
            continue;
        }
        if ($stream !== '' && strtolower(trim((string) ($department['stream'] ?? ''))) !== $stream) {
            continue;
        }
        $matches[] = $department;
    }

    return count($matches) === 1 ? $matches[0] : null;
}

function placementFirstChoiceCollegeAllocationTarget(
    array $preferences,
    array $departments,
    string $stream
): ?array {
    if (!$preferences) {
        return null;
    }
    usort($preferences, static function (array $left, array $right): int {
        return (int) ($left['priority'] ?? 99) <=> (int) ($right['priority'] ?? 99);
    });

    $firstPreference = $preferences[0];
    $department = placementResolveDepartmentPreference($firstPreference, $departments);
    if ($department === null) {
        $preferredCollegeId = (int) ($firstPreference['college_id'] ?? 0);
        $preferredCollegeName = normalizeStudentPlacementCollegeName((string) (
            $firstPreference['college_name']
            ?? $firstPreference['college']
            ?? ''
        ));
        if ($preferredCollegeName === '') {
            $preferredCollegeName = normalizeStudentPlacementCollegeName((string) (
                $firstPreference['department']
                ?? $firstPreference['dept_name']
                ?? ''
            ));
        }
        foreach ($departments as $candidate) {
            $candidateCollegeName = normalizeStudentPlacementCollegeName(
                placementDepartmentCapacityCollegeName($candidate)
            );
            $matchesCollege = $preferredCollegeId > 0
                ? (int) ($candidate['college_id'] ?? 0) === $preferredCollegeId
                : ($preferredCollegeName !== '' && $candidateCollegeName === $preferredCollegeName);
            if (
                $matchesCollege
                && placementDepartmentStream($candidate) === placementNormalizeStream($stream)
            ) {
                $department = $candidate;
                break;
            }
        }
    }

    if ($department === null) {
        $broadTarget = placementFirstSemesterAllocationTarget(
            $stream,
            [$firstPreference],
            $departments,
            [],
            [],
            [],
            [],
            [],
            [],
            true
        );
        if ($broadTarget === null) {
            return null;
        }
        $collegeId = (int) ($broadTarget['college_id'] ?? 0);
        $collegeName = trim((string) ($broadTarget['college_name'] ?? ''));
        $collegeKey = placementCollegeCapacityKey([
            'college_id' => $collegeId,
            'college_name' => $collegeName,
        ]);
        if ($collegeKey === '' || $collegeName === '') {
            return null;
        }
        return [
            'college_id' => $collegeId > 0 ? $collegeId : null,
            'college_name' => $collegeName,
            'stream' => trim((string) ($broadTarget['stream'] ?? $stream)) ?: $stream,
            'placement_group' => trim((string) ($broadTarget['placement_group'] ?? ''))
                ?: 'college_' . substr(hash('sha256', $collegeKey), 0, 40),
            'choice_rank' => (int) ($firstPreference['priority'] ?? 0),
        ];
    }

    $collegeId = (int) ($department['college_id'] ?? 0);
    $collegeName = placementDepartmentCapacityCollegeName($department);
    $collegeKey = placementCollegeCapacityKey($department);
    if ($collegeKey === '' || $collegeName === '') {
        return null;
    }
    $group = placementDepartmentGroup($department);
    if ($group === '') {
        $group = 'college_' . substr(hash('sha256', $collegeKey), 0, 40);
    }

    return [
        'college_id' => $collegeId > 0 ? $collegeId : null,
        'college_name' => $collegeName,
        'stream' => trim((string) ($department['stream'] ?? $stream)) ?: $stream,
        'placement_group' => $group,
        'choice_rank' => (int) ($firstPreference['priority'] ?? 0),
    ];
}

function placementDepartmentOfferedInSemester(array $department, int $semester): bool
{
    $availability = placementDepartmentAvailability($department);
    $offeredSemester = $availability['offered_semester'];
    $firstSemesterOnly = in_array(
        strtolower(trim((string) $availability['is_first_semester_only'])),
        ['1', 'true', 'yes', 'on'],
        true
    );

    if ($semester === 1) {
        return $offeredSemester === 1;
    }

    return $semester === 2
        && ($offeredSemester === 2 || ($offeredSemester === 1 && !$firstSemesterOnly));
}

function placementDepartmentMatchesAllocation(array $department, array $allocation): bool
{
    $allocationCollegeId = (int) ($allocation['college_id'] ?? 0);
    $departmentCollegeId = (int) ($department['college_id'] ?? 0);
    $allocationCollege = (string) (
        $allocation['college_name']
        ?? $allocation['college']
        ?? $allocation['allocated_college']
        ?? ''
    );
    $departmentCollege = (string) (
        $department['college_name']
        ?? $department['college']
        ?? $department['collegeName']
        ?? ''
    );
    if ($allocationCollegeId > 0 && $departmentCollegeId > 0) {
        $normalizeCatalogCollegeName = static function (string $name): string {
            $normalized = strtolower(trim(preg_replace('/\s+/', ' ', $name) ?? $name));
            $normalized = preg_replace('/^(college|school) of /', '', $normalized) ?? $normalized;
            $normalized = preg_replace('/sciences\b/', 'science', $normalized) ?? $normalized;
            return $normalized;
        };
        return $allocationCollegeId === $departmentCollegeId
            || $normalizeCatalogCollegeName($allocationCollege) === $normalizeCatalogCollegeName($departmentCollege);
    }

    $allocationCollegeName = normalizeStudentPlacementCollegeName($allocationCollege);
    $departmentCollegeName = normalizeStudentPlacementCollegeName($departmentCollege);
    if (
        $allocationCollegeName !== ''
        && $departmentCollegeName !== ''
        && $allocationCollegeName === $departmentCollegeName
    ) {
        return true;
    }
    $allocationStream = (string) ($allocation['stream'] ?? '');
    $departmentStream = (string) ($department['stream'] ?? '');
    $allocationGroup = normalizeStudentPlacementGroup(
        (string) ($allocation['placement_group'] ?? $allocation['group'] ?? ''),
        $allocationCollege,
        $allocationStream
    );
    $departmentGroup = normalizeStudentPlacementGroup(
        (string) ($department['placement_group'] ?? ''),
        $departmentCollege,
        $departmentStream
    );
    if ($allocationGroup !== '' && $departmentGroup === $allocationGroup) {
        return true;
    }

    return false;
}

function placementDepartmentMatchesStudentPlacementScope(
    array $department,
    int $semester,
    string $stream,
    ?array $allocation = null
): bool {
    if (
        !placementDepartmentCanBePreferred($department, $stream, $semester)
        || placementDepartmentStream($department) !== placementNormalizeStream($stream)
    ) {
        return false;
    }

    if ($semester !== 2) {
        return true;
    }

    return $allocation !== null
        && (
            trim((string) ($allocation['stream'] ?? '')) === ''
            || placementNormalizeStream((string) $allocation['stream']) === placementNormalizeStream($stream)
        )
        && placementDepartmentMatchesAllocation($department, $allocation);
}

function placementSecondSemesterChoiceAllocation(
    array $preferences,
    array $departments,
    string $stream
): ?array {
    usort($preferences, static function (array $left, array $right): int {
        return (int) ($left['priority'] ?? 99) <=> (int) ($right['priority'] ?? 99);
    });

    foreach ($preferences as $preference) {
        $department = placementResolveDepartmentPreference($preference, $departments);
        if (
            $department === null
            || !placementDepartmentCanBePreferred($department, $stream, 2)
            || placementDepartmentStream($department) !== placementNormalizeStream($stream)
        ) {
            continue;
        }

        $collegeName = placementDepartmentCapacityCollegeName($department);
        $placementGroup = placementDepartmentGroup($department);
        if ($collegeName === '' || $placementGroup === '') {
            continue;
        }

        $collegeId = (int) ($department['college_id'] ?? 0);
        return [
            'college_id' => $collegeId > 0 ? $collegeId : null,
            'college_name' => $collegeName,
            'stream' => trim((string) ($department['stream'] ?? '')) ?: $stream,
            'placement_group' => $placementGroup,
            'choice_rank' => (int) ($preference['priority'] ?? $preference['rank'] ?? 0),
        ];
    }

    return null;
}

function placementCollegeCapacityTotals(array $departments): array
{
    $totals = [];
    foreach ($departments as $department) {
        $collegeId = (int) ($department['college_id'] ?? 0);
        $collegeKey = $collegeId > 0
            ? (string) $collegeId
            : strtolower(preg_replace('/[^a-z0-9]/i', '', (string) ($department['college_name'] ?? '')));
        if ($collegeKey === '') {
            continue;
        }
        $totals[$collegeKey] = ($totals[$collegeKey] ?? 0)
            + max(0, (int) ($department['capacity'] ?? 0));
    }
    return $totals;
}

function placementQuotaCapacityPools(int $capacity, float $reservedFemaleQuotaPercent): array
{
    $capacity = max(0, $capacity);
    $reservedFemaleQuotaPercent = min(100.0, max(0.0, $reservedFemaleQuotaPercent));
    $femaleReserved = min(
        $capacity,
        (int) ceil($capacity * $reservedFemaleQuotaPercent / 100.0)
    );

    return [
        'general' => $capacity - $femaleReserved,
        'female_reserved' => $femaleReserved,
    ];
}

function placementDepartmentQuotaScopeKey(array $department): string
{
    $departmentId = (int) ($department['id'] ?? $department['department_id'] ?? 0);
    if ($departmentId > 0) {
        return 'department:id:' . $departmentId;
    }

    $departmentName = strtolower(preg_replace(
        '/[^a-z0-9]/i',
        '',
        (string) ($department['name'] ?? $department['dept_name'] ?? '')
    ));
    return $departmentName !== '' ? 'department:name:' . $departmentName : '';
}

function placementQuotaCategory(bool $isFemaleApplicant, int $generalOpen, int $femaleReservedOpen): ?string
{
    if ($generalOpen > 0) {
        return 'Merit';
    }
    if ($isFemaleApplicant && $femaleReservedOpen > 0) {
        return 'Affirmative Action';
    }
    return null;
}

function placementQuotaScopeKey(array $department): string
{
    $group = placementDepartmentGroup($department);
    if (in_array($group, ['other_natural_science', 'other_social_science'], true)) {
        return 'group:' . $group;
    }
    if (in_array($group, ['health_science', 'git', 'law'], true)) {
        $collegeKey = placementCollegeCapacityKey($department);
        if ($collegeKey !== '') {
            return 'college:' . $collegeKey;
        }
    }

    $departmentName = strtolower(preg_replace(
        '/[^a-z0-9]/i',
        '',
        (string) ($department['name'] ?? '')
    ));
    return $departmentName !== '' ? 'department:' . $departmentName : '';
}

function placementCollegeCapacityKey(array $department): string
{
    $collegeId = (int) ($department['college_id'] ?? 0);
    if ($collegeId > 0) {
        return 'id:' . $collegeId;
    }

    $collegeName = strtolower(preg_replace(
        '/[^a-z0-9]/i',
        '',
        (string) ($department['college_name'] ?? '')
    ));
    return $collegeName !== '' ? 'name:' . $collegeName : '';
}

function placementPreferenceCollegeKey(array $department): string
{
    $group = placementDepartmentGroup($department);
    if (in_array($group, ['health_science', 'git', 'law'], true)) {
        return 'college:' . placementCollegeCapacityKey($department);
    }
    return $group !== '' ? 'group:' . $group : 'college:' . placementCollegeCapacityKey($department);
}

function placementPreferenceCapacityRemaining(
    array $department,
    array $collegeCapacityMap,
    array $groupCapacityMap
): int {
    $group = placementDepartmentGroup($department);
    if (in_array($group, ['health_science', 'git', 'law'], true)) {
        return (int) ($collegeCapacityMap[placementCollegeCapacityKey($department)] ?? 0);
    }
    return (int) ($groupCapacityMap[$group] ?? 0);
}

function placementPreferenceCapacityMaps(
    array $departments,
    array $remainingDepartmentCapacity,
    int $semester
): array {
    $collegeCapacityMap = [];
    $groupCapacityMap = [];

    foreach ($departments as $department) {
        if (!placementDepartmentCanReceiveFinalAssignment($department, $semester)) {
            continue;
        }
        $departmentKey = placementDepartmentMapKey($department);
        $legacyNameKey = strtolower(trim((string) ($department['name'] ?? '')));
        $remainingCapacity = max(0, (int) (
            $remainingDepartmentCapacity[$departmentKey]
            ?? $remainingDepartmentCapacity[$legacyNameKey]
            ?? 0
        ));
        $group = placementDepartmentGroup($department);
        if (in_array($group, ['health_science', 'git', 'law'], true)) {
            $collegeKey = placementCollegeCapacityKey($department);
            if ($collegeKey !== '') {
                $collegeCapacityMap[$collegeKey] = ($collegeCapacityMap[$collegeKey] ?? 0) + $remainingCapacity;
            }
        } elseif ($group !== '') {
            $groupCapacityMap[$group] = ($groupCapacityMap[$group] ?? 0) + $remainingCapacity;
        }
    }

    return [
        'college' => $collegeCapacityMap,
        'group' => $groupCapacityMap,
    ];
}

function placementSecondSemesterFallbackPreferences(
    array $firstSemesterPreferences,
    array $departments,
    array $allocation
): array {
    $allocatedPreferenceKey = placementPreferenceCollegeKey($allocation);
    if ($allocatedPreferenceKey === '') {
        return [];
    }

    $resolveDepartment = static function (array $preference) use ($departments): ?array {
        $departmentId = (int) ($preference['dept_id'] ?? 0);
        $departmentName = strtolower(trim((string) (
            $preference['department'] ?? $preference['dept_name'] ?? $preference['name'] ?? ''
        )));
        $collegeId = (int) ($preference['college_id'] ?? 0);

        foreach ($departments as $department) {
            if ($departmentId > 0 && (int) ($department['id'] ?? 0) === $departmentId) {
                return $department;
            }
            if (
                $departmentId <= 0
                && $departmentName !== ''
                && strtolower(trim((string) ($department['name'] ?? ''))) === $departmentName
                && (
                    $collegeId <= 0
                    || (int) ($department['college_id'] ?? 0) === $collegeId
                )
            ) {
                return $department;
            }
        }

        return null;
    };

    $secondaryPreferenceKey = '';
    foreach ($firstSemesterPreferences as $preference) {
        if (!is_array($preference)) {
            continue;
        }
        $department = $resolveDepartment($preference);
        if (!$department) {
            continue;
        }
        $preferenceKey = placementPreferenceCollegeKey($department);
        if ($preferenceKey !== '' && $preferenceKey !== $allocatedPreferenceKey) {
            $secondaryPreferenceKey = $preferenceKey;
            break;
        }
    }
    if ($secondaryPreferenceKey === '') {
        return [];
    }

    $fallbackPreferences = [];
    $seenDepartmentIds = [];
    foreach ($firstSemesterPreferences as $preference) {
        if (!is_array($preference)) {
            continue;
        }
        $department = $resolveDepartment($preference);
        if (
            !$department
            || placementPreferenceCollegeKey($department) !== $secondaryPreferenceKey
            || !placementDepartmentOfferedInSemester($department, 2)
        ) {
            continue;
        }

        $departmentId = (int) ($department['id'] ?? 0);
        if ($departmentId > 0 && isset($seenDepartmentIds[$departmentId])) {
            continue;
        }
        if ($departmentId > 0) {
            $seenDepartmentIds[$departmentId] = true;
        }
        $fallbackPreferences[] = [
            'dept_id' => $departmentId,
            'department' => (string) ($department['name'] ?? ''),
            'priority' => (int) ($preference['priority'] ?? 99),
            'college_name' => (string) ($department['college_name'] ?? ''),
            'stream' => (string) ($department['stream'] ?? ''),
            'offered_semester' => (int) ($department['offered_semester'] ?? 2),
            'is_first_semester_only' => $department['is_first_semester_only'] ?? 0,
            'college_id' => (int) ($department['college_id'] ?? 0),
            'is_fallback' => true,
        ];
    }

    return $fallbackPreferences;
}

function placementCanAdvancePreferenceCollege(
    array $currentDepartment,
    array $nextDepartment,
    array $collegeCapacityMap,
    array $groupCapacityMap,
    array $semesterTwoCollegeCapacityMap = [],
    array $semesterTwoGroupCapacityMap = []
): bool {
    if (placementPreferenceCollegeKey($currentDepartment) === placementPreferenceCollegeKey($nextDepartment)) {
        return true;
    }
    if (placementPreferenceCapacityRemaining($currentDepartment, $collegeCapacityMap, $groupCapacityMap) > 0) {
        return false;
    }
    if (
        ($semesterTwoCollegeCapacityMap || $semesterTwoGroupCapacityMap)
        && placementPreferenceCapacityRemaining(
            $currentDepartment,
            $semesterTwoCollegeCapacityMap,
            $semesterTwoGroupCapacityMap
        ) > 0
    ) {
        return false;
    }
    return true;
}

function placementMinimumPreferenceCount(
    string $stream,
    string $collegeName,
    int $availableDepartments,
    string $placementGroup = ''
): int
{
    $normalizedStream = placementNormalizeStream($stream);
    $normalizedCollege = preg_replace('/[^a-z]/', '', strtolower($collegeName));
    $normalizedGroup = strtolower(trim($placementGroup));
    if ($normalizedStream === 'natural'
        && ($normalizedGroup === 'other_natural_science' || str_contains($normalizedCollege, 'othernaturalscience'))
        && $availableDepartments > 15) {
        return 15;
    }
    return max(0, $availableDepartments);
}

function placementDepartmentCanReceiveFinalAssignment(array $department, int $semester): bool
{
    return placementDepartmentOfferedInSemester($department, $semester);
}

function placementShouldMarkStudentUnassigned(
    int $semester,
    bool $completeSemesterRun,
    string $reasonCode,
    bool $institutionCapacityExhausted = false
): bool
{
    return $semester === 2
        && $completeSemesterRun
        && $institutionCapacityExhausted
        && $reasonCode === 'CAPACITY_FULL';
}

function placementDepartmentCanBePreferred(array $department, string $stream, int $semester): bool
{
    return placementDepartmentOfferedInSemester($department, $semester)
        && placementDepartmentStream($department) === placementNormalizeStream($stream);
}

function placementBroadChoiceGroup(array $preference): string
{
    $groupNames = [
        'othernaturalscience' => 'other_natural_science',
        'othernaturalsciences' => 'other_natural_science',
        'collegeofothernaturalsciences' => 'other_natural_science',
        'othersocialscience' => 'other_social_science',
        'othersocialsciences' => 'other_social_science',
        'collegeofothersocialsciences' => 'other_social_science',
    ];
    $name = strtolower(preg_replace(
        '/[^a-z]/i',
        '',
        (string) ($preference['department'] ?? $preference['dept_name'] ?? '')
    ));

    return $groupNames[$name] ?? '';
}

function placementIsFirstSemesterBroadChoice(array $preference, int $semester): bool
{
    return $semester === 1 && placementBroadChoiceGroup($preference) !== '';
}

function placementExpandCollegePreferences(array $preferences, array $departments, string $stream, int $semester): array
{
    $expanded = [];

    foreach ($preferences as $preference) {
        if (!is_array($preference)) {
            continue;
        }
        if (!empty($preference['is_broad_choice'])) {
            $expanded[] = $preference;
            continue;
        }
        $preferenceName = strtolower(preg_replace(
            '/[^a-z]/i',
            '',
            (string) ($preference['department'] ?? $preference['dept_name'] ?? '')
        ));
        $group = placementBroadChoiceGroup($preference);
        $namedGroupChoice = $group !== '';
        $preferredDepartmentId = (int) ($preference['dept_id'] ?? 0);
        $preferredDepartment = null;
        foreach ($departments as $department) {
            $departmentName = strtolower(preg_replace('/[^a-z]/i', '', (string) ($department['name'] ?? '')));
            $matchesId = $preferredDepartmentId > 0
                && (int) ($department['id'] ?? 0) === $preferredDepartmentId;
            $matchesName = !$namedGroupChoice
                && $preferenceName !== ''
                && $preferenceName === $departmentName;
            if ($matchesId || $matchesName) {
                $preferredDepartment = $department;
                break;
            }
        }
        if ($group === '' && $preferredDepartment !== null) {
            $expanded[] = $preference;
            continue;
        }
        if ($group === '' && $preferredDepartment === null) {
            $preferredGroup = strtolower(trim((string) ($preference['placement_group'] ?? '')));
            if (in_array($preferredGroup, ['other_natural_science', 'other_social_science'], true)) {
                $group = $preferredGroup;
            }
        }
        if ($group === '' && $preferredDepartment === null) {
            $preferredCollegeId = (int) ($preference['college_id'] ?? 0);
            if ($preferredCollegeId > 0) {
                foreach ($departments as $department) {
                    if ((int) ($department['college_id'] ?? 0) === $preferredCollegeId) {
                        $preferredDepartment = $department;
                        break;
                    }
                }
            }
        }

        $preferenceCollegeKey = $group !== ''
            ? 'group:' . $group
            : ($preferredDepartment ? placementPreferenceCollegeKey($preferredDepartment) : '');
        if ($preferenceCollegeKey === '') {
            $expanded[] = $preference;
            continue;
        }

        $expandedDepartments = [];
        $normalizedStream = placementNormalizeStream($stream);
        foreach ($departments as $department) {
            $departmentStream = placementDepartmentStream($department);
            if (
                placementPreferenceCollegeKey($department) !== $preferenceCollegeKey
                || $departmentStream !== $normalizedStream
                || $group !== '' && placementDepartmentGroup($department) !== $group
                || !placementDepartmentCanBePreferred($department, $stream, $semester)
            ) {
                continue;
            }
            $expandedDepartments[] = [
                'dept_id' => (int) ($department['id'] ?? 0),
                'department' => (string) ($department['name'] ?? ''),
                'priority' => (int) ($preference['priority'] ?? $preference['rank'] ?? 99),
                'college_name' => (string) ($department['college_name'] ?? ''),
                'stream' => (string) ($department['stream'] ?? $stream),
                'offered_semester' => (int) ($department['offered_semester'] ?? $semester),
                'is_first_semester_only' => $department['is_first_semester_only'] ?? 0,
                'college_id' => (int) ($department['college_id'] ?? 0),
                'is_fallback' => !empty($preference['is_fallback']),
            ];
        }
        $expanded = array_merge($expanded, $expandedDepartments ?: [$preference]);
    }

    return $expanded;
}

function placementTargetMatchesStudentChoice(
    string $stream,
    array $preferences,
    array $departments,
    array $target
): bool {
    $targetGroup = strtolower(trim((string) ($target['placement_group'] ?? '')));
    $targetCollege = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) ($target['college_name'] ?? '')));
    if ($targetGroup === '' && $targetCollege === '') {
        return false;
    }

    foreach ($preferences as $preference) {
        if (!is_array($preference)) {
            continue;
        }

        $preferenceGroup = placementBroadChoiceGroup($preference);
        if ($preferenceGroup !== '' && $targetGroup !== '' && $preferenceGroup === $targetGroup) {
            return true;
        }

        $departmentName = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) (
            $preference['department'] ?? $preference['dept_name'] ?? $preference['name'] ?? ''
        )));
        $preferenceCollegeName = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) (
            $preference['college_name'] ?? $preference['collegeName'] ?? $preference['college'] ?? ''
        )));
        if ($targetCollege !== '' && $preferenceCollegeName !== '' && $preferenceCollegeName === $targetCollege) {
            return true;
        }

        if ($departmentName === '') {
            continue;
        }
        foreach ($departments as $department) {
            $departmentNameNormalized = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) ($department['name'] ?? '')));
            $departmentCollegeName = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) ($department['college_name'] ?? '')));
            if ($departmentNameNormalized !== $departmentName) {
                continue;
            }
            if ($targetGroup !== '' && placementDepartmentGroup($department) === $targetGroup) {
                return true;
            }
            if ($targetCollege !== '' && $departmentCollegeName === $targetCollege) {
                return true;
            }
        }
    }

    return false;
}

function placementBroadChoiceAllocationTarget(
    string $stream,
    array $preference,
    array $departments,
    array $availableSemesterTwoGroupCapacity
): ?array {
    $group = placementBroadChoiceGroup($preference);
    if ($group === '' || (int) ($availableSemesterTwoGroupCapacity[$group] ?? 0) <= 0) {
        return null;
    }

    $normalizedStream = placementNormalizeStream($stream);
    foreach ($departments as $department) {
        if (placementDepartmentGroup($department) !== $group
            || placementDepartmentStream($department) !== $normalizedStream) {
            continue;
        }

        $target = [
            'college_id' => null,
            'college_name' => placementDepartmentCapacityCollegeName($department),
            'college_capacity_key' => null,
            'stream' => (string) ($department['stream'] ?? $stream),
            'placement_group' => $group,
            'choice_rank' => (int) ($preference['priority'] ?? $preference['rank'] ?? 0),
        ];

        return $target;
    }

    return null;
}

function placementDeferredGroup(string $stream, string $preferenceGroup): ?string
{
    $normalizedStream = placementNormalizeStream($stream);
    $normalizedGroup = strtolower(trim($preferenceGroup));
    if ($normalizedStream === 'natural') {
        return in_array($normalizedGroup, ['health_science', 'git'], true)
            ? $normalizedGroup
            : 'other_natural_science';
    }
    if ($normalizedStream === 'social') {
        return $normalizedGroup === 'law' ? 'law' : 'other_social_science';
    }
    return null;
}

function placementFirstSemesterAllocationTarget(
    string $stream,
    array $preferences,
    array $departments,
    array $availableGroupCapacity = [],
    array $remainingGroupCapacity = [],
    array $remainingCollegeCapacity = [],
    array $availableCollegeSemesterTwoCapacity = [],
    array $remainingFirstSemesterCollegeCapacity = [],
    array $remainingFirstSemesterGroupCapacity = [],
    bool $allowExhaustedCapacity = false
): ?array
{
    $normalizedStream = placementNormalizeStream($stream);
    $seenPreferenceColleges = [];
    foreach ($preferences as $preference) {
        $broadChoiceGroup = placementBroadChoiceGroup($preference);
        if ($broadChoiceGroup !== '') {
            $targetGroup = placementDeferredGroup($stream, $broadChoiceGroup);
            $groupCapacityAvailable = (int) ($availableGroupCapacity[$targetGroup] ?? 0) > 0;
            if (
                $targetGroup === $broadChoiceGroup
                && ($availableGroupCapacity === [] || $groupCapacityAvailable || $allowExhaustedCapacity)
            ) {
                foreach ($departments as $department) {
                    if (
                        placementDepartmentGroup($department) !== $targetGroup
                        || placementDepartmentStream($department) !== $normalizedStream
                    ) {
                        continue;
                    }
                    return [
                        'college_id' => null,
                        'college_name' => placementDepartmentCapacityCollegeName($department),
                        'college_capacity_key' => null,
                        'stream' => (string) ($department['stream'] ?? $stream),
                        'placement_group' => $targetGroup,
                        'choice_rank' => (int) ($preference['priority'] ?? $preference['rank'] ?? 0),
                    ];
                }
            }
            continue;
        }

        $preferredDepartmentId = (int) ($preference['dept_id'] ?? 0);
        $preferredCollegeId = (int) ($preference['college_id'] ?? 0);
        $name = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) ($preference['department'] ?? '')));
        $preferredCollege = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) ($preference['college_name'] ?? '')));
        foreach ($departments as $department) {
            if ($preferredDepartmentId > 0 && (int) ($department['id'] ?? 0) !== $preferredDepartmentId) {
                continue;
            }
            $departmentName = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) ($department['name'] ?? '')));
            $departmentCollege = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) ($department['college_name'] ?? '')));
            $departmentGroupCollege = strtolower(preg_replace(
                '/[^a-z0-9]/i',
                '',
                placementDepartmentCapacityCollegeName($department)
            ));
            $group = placementDepartmentGroup($department);
            $allowedGroups = $normalizedStream === 'natural'
                ? ['health_science', 'git', 'other_natural_science']
                : ($normalizedStream === 'social' ? ['law', 'other_social_science'] : []);
            if ($name !== '' && $name === $departmentName
                && ($preferredCollegeId <= 0 || (int) ($department['college_id'] ?? 0) === $preferredCollegeId)
                && ($preferredCollege === '' || $preferredCollege === $departmentCollege
                    || $preferredCollege === $departmentGroupCollege)
                && in_array($group, $allowedGroups, true)
                && ($group !== 'law' || strcasecmp(trim((string) ($department['name'] ?? '')), 'Law') === 0)) {
                $targetGroup = placementDeferredGroup($stream, $group);
                $preferenceCollegeKey = placementPreferenceCollegeKey($department);
                if ($targetGroup === null || isset($seenPreferenceColleges[$preferenceCollegeKey])) {
                    break;
                }
                $seenPreferenceColleges[$preferenceCollegeKey] = true;
                $collegeCapacityKey = placementCollegeCapacityKey($department);
                $isCollegeSpecificGroup = in_array($targetGroup, ['health_science', 'git', 'law'], true);
                $hasFirstSemesterCapacityData = $remainingFirstSemesterCollegeCapacity !== []
                    || $remainingFirstSemesterGroupCapacity !== [];
                if (
                    !$allowExhaustedCapacity
                    && $hasFirstSemesterCapacityData
                    && placementPreferenceCapacityRemaining(
                        $department,
                        $remainingFirstSemesterCollegeCapacity,
                        $remainingFirstSemesterGroupCapacity
                    ) > 0
                ) {
                    return null;
                }
                $hasCollegeCapacityData = $isCollegeSpecificGroup && $remainingCollegeCapacity !== [];
                $hasGroupCapacityData = $remainingGroupCapacity !== [];
                $remainingCapacity = $hasCollegeCapacityData
                    ? (int) ($remainingCollegeCapacity[$collegeCapacityKey] ?? 0)
                    : (int) ($remainingGroupCapacity[$targetGroup] ?? 0);
                if (
                    !$allowExhaustedCapacity
                    && ($hasCollegeCapacityData || $hasGroupCapacityData)
                    && $remainingCapacity <= 0
                ) {
                    break;
                }
                $hasCollegeSemesterTwoData = $isCollegeSpecificGroup
                    && $availableCollegeSemesterTwoCapacity !== [];
                $hasGroupSemesterTwoData = $availableGroupCapacity !== [];
                $semesterTwoCapacity = $hasCollegeSemesterTwoData
                    ? (int) ($availableCollegeSemesterTwoCapacity[$collegeCapacityKey] ?? 0)
                    : (int) ($availableGroupCapacity[$targetGroup] ?? 0);
                if (
                    !$allowExhaustedCapacity
                    && ($hasCollegeSemesterTwoData || $hasGroupSemesterTwoData)
                    && $semesterTwoCapacity <= 0
                ) {
                    break;
                }
                if (
                    $allowExhaustedCapacity
                    && $targetGroup === 'law'
                    && ($hasCollegeSemesterTwoData || $hasGroupSemesterTwoData)
                    && $semesterTwoCapacity <= 0
                    && (int) ($availableGroupCapacity['other_social_science'] ?? 0) > 0
                ) {
                    foreach ($departments as $targetDepartment) {
                        if (
                            placementDepartmentGroup($targetDepartment) !== 'other_social_science'
                            || placementNormalizeStream((string) ($targetDepartment['stream'] ?? '')) !== $normalizedStream
                            || !placementDepartmentOfferedInSemester($targetDepartment, 2)
                        ) {
                            continue;
                        }
                        return [
                            'college_id' => null,
                            'college_name' => placementDepartmentCapacityCollegeName($targetDepartment),
                            'college_capacity_key' => null,
                            'stream' => (string) ($targetDepartment['stream'] ?? $stream),
                            'placement_group' => 'other_social_science',
                            'choice_rank' => (int) ($preference['priority'] ?? $preference['rank'] ?? 0),
                        ];
                    }
                }
                $targetCollegeName = trim((string) ($department['college_name'] ?? ''));
                if ($targetCollegeName === '') {
                    $targetCollegeName = placementDepartmentCapacityCollegeName($department);
                }
                $targetCollegeId = (int) ($department['college_id'] ?? 0);
                return [
                    'college_id' => $targetCollegeId > 0 ? $targetCollegeId : null,
                    'college_name' => $targetCollegeName,
                    'college_capacity_key' => $collegeCapacityKey,
                    'stream' => (string) ($department['stream'] ?? $stream),
                    'placement_group' => $targetGroup,
                    'choice_rank' => (int) ($preference['priority'] ?? 0),
                ];
            }
        }
    }

    return null;
}
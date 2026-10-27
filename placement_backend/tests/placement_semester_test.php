<?php
require_once __DIR__ . '/../config/placement_semester.php';
require_once __DIR__ . '/../api/common/student_placement_allocation.php';

function assertSemesterRule(bool $expected, bool $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message);
    }
}

function assertSemesterValue(string $expected, string $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message);
    }
}

assertSemesterValue(
    'other social science',
    normalizeStudentPlacementCollegeName('Social Science'),
    'The Social Science department naming variant maps to the allocated Other Social Science college.'
);
assertSemesterValue(
    'other_social_science',
    normalizeStudentPlacementGroup('', 'Social Science'),
    'The Social Science college naming variant maps to the allocated placement group.'
);

$departments = [
    ['college_id' => 10, 'capacity' => 12, 'offered_semester' => 1, 'is_first_semester_only' => 1],
    ['college_id' => 10, 'capacity' => 8, 'offered_semester' => 2, 'is_first_semester_only' => 0],
    ['college_id' => 20, 'capacity' => 5, 'offered_semester' => 1, 'is_first_semester_only' => 0],
];

assertSemesterRule(true, placementDepartmentOfferedInSemester($departments[0], 1), 'First-semester-only departments are offered in semester one.');
assertSemesterRule(false, placementDepartmentOfferedInSemester($departments[0], 2), 'First-semester-only departments are excluded from semester two.');
assertSemesterRule(
    true,
    studentSecondSemesterChoicePortalState(
        'Pending',
        ['group' => 'other_social_science', 'college' => 'Other Social Science'],
        true,
        true
    )['eligible'],
    'A reset student with a completed first-stage placement and allocation can resume the second stage.'
);
assertSemesterRule(
    true,
    studentSecondSemesterChoicePortalState(
        'Placed in Semester 1',
        ['group' => 'other_social_science', 'college' => 'Other Social Science'],
        false,
        true
    )['eligible'],
    'A student placed in Semester 1 with an allocation remains eligible when the first-stage result row is unavailable.'
);
assertSemesterRule(
    false,
    studentSecondSemesterChoicePortalState(
        'Pending 1st Semester',
        ['group' => 'other_social_science', 'college' => 'Other Social Science'],
        true,
        true
    )['eligible'],
    'A student still marked pending Semester 1 remains in the first stage.'
);
assertSemesterRule(
    false,
    studentSecondSemesterChoicePortalState(
        'Pending 2nd Semester',
        ['group' => '', 'college' => ''],
        true,
        true
    )['eligible'],
    'A pending second-semester status without an allocation cannot access stage two.'
);
assertSemesterRule(
    true,
    studentSecondSemesterChoicePortalState(
        'Pending 2nd Semester',
        ['group' => 'other_social_science', 'college' => 'Other Social Science'],
        true,
        false
    )['eligible'],
    'Stage-two eligibility requires a completed stage one and a college allocation.'
);
assertSemesterRule(
    false,
    studentSecondSemesterChoicePortalState(
        'Pending 2nd Semester',
        ['group' => 'other_social_science', 'college' => 'Other Social Science'],
        false,
        false
    )['isOpen'],
    'The second-semester choice portal remains closed until the Registrar opens it.'
);
assertSemesterRule(
    false,
    studentSecondSemesterChoicePortalState(
        'Pending 2nd Semester',
        ['group' => 'other_social_science', 'college' => 'Other Social Science'],
        true,
        false
    )['isOpen'],
    'An allocated second-semester student remains unable to submit while the Registrar portal toggle is closed.'
);
assertSemesterRule(
    false,
    studentSecondSemesterChoicePortalState(
        'Pending 2nd Semester',
        ['group' => 'other_social_science', 'college' => 'Other Social Science'],
        true,
        false
    )['isLocked'],
    'A closed portal does not mark placement as finalized or lock choices as processed.'
);
assertSemesterRule(
    true,
    studentSecondSemesterChoicePortalState(
        'Placed in Semester 1',
        ['group' => 'other_social_science', 'college' => 'Other Social Science'],
        true,
        true
    )['isOpen'],
    'The Registrar portal toggle opens Semester 2 preferences without being blocked by Semester 1 placement history.'
);
assertSemesterRule(
    false,
    studentSecondSemesterChoicePortalState(
        'Pending 2nd Semester',
        ['group' => 'other_social_science', 'college' => 'Other Social Science'],
        true,
        true,
        true
    )['isOpen'],
    'A finalized and Registrar-published Semester 2 placement closes preference editing.'
);
assertSemesterRule(
    true,
    studentSecondSemesterChoicePortalState(
        'Pending 2nd Semester',
        ['group' => 'other_social_science', 'college' => 'Other Social Science'],
        true,
        true,
        true
    )['isLocked'],
    'A published Semester 2 placement is the final lock even while the Registrar toggle is open.'
);
assertSemesterRule(
    true,
    studentSecondSemesterChoicePortalState(
        'Pending 2nd Semester',
        ['group' => 'other_social_science', 'college' => 'Other Social Science'],
        false,
        true
    )['eligible'],
    'Pending second-semester status with an allocation remains eligible when the stage-one result row is unavailable.'
);
assertSemesterRule(true, placementDepartmentOfferedInSemester($departments[1], 2), 'Semester-two departments are offered in semester two.');
assertSemesterRule(
    true,
    placementDepartmentOfferedInSemester([
        'offered_semester' => 1,
        'is_first_semester_only' => 0,
    ], 2),
    'Departments not designated first-semester-only remain eligible for second-semester allocation.'
);
assertSemesterRule(
    true,
    placementDepartmentCanReceiveFinalAssignment([
        'name' => 'Law',
        'college_name' => 'School of Law',
        'stream' => 'Social',
        'offered_semester' => 1,
    ], 1),
    'Law can receive first-semester final assignments.'
);
assertSemesterRule(
    true,
    placementDepartmentCanReceiveFinalAssignment([
        'name' => 'Economics',
        'college_name' => 'Business and Economics',
        'stream' => 'Social',
        'offered_semester' => 1,
    ], 1),
    'Other Social Science can receive first-semester assignments when capacity is available.'
);
assertSemesterRule(
    true,
    placementDepartmentCanReceiveFinalAssignment([
        'name' => 'Agriculture',
        'college_name' => 'Agriculture',
        'stream' => 'Natural',
        'offered_semester' => 1,
    ], 1),
    'Other Natural Science can receive first-semester assignments when capacity is available.'
);
assertSemesterRule(
    true,
    placementDepartmentCanReceiveFinalAssignment([
        'name' => 'Sociology',
        'college_name' => 'Social Sciences and Humanities',
        'stream' => 'Social',
        'offered_semester' => 1,
    ], 1),
    'Other Social Science departments can receive first-semester assignments.'
);
assertSemesterRule(
    false,
    placementDepartmentCanReceiveFinalAssignment([
        'name' => 'Political Science',
        'college_name' => 'School of Law',
        'stream' => 'Social',
    ], 1),
    'Only the Law department can receive a first-semester Law placement.'
);
assertSemesterRule(
    false,
    placementDepartmentCanReceiveFinalAssignment([
        'name' => 'Law',
        'college_name' => 'School of Law',
        'stream' => 'Social',
        'offered_semester' => 2,
    ], 1),
    'Law respects the configured offered semester.'
);
assertSemesterRule(
    false,
    placementDepartmentCanReceiveFinalAssignment(['offered_semester' => 1, 'is_first_semester_only' => 1], 2),
    'First-semester-only departments cannot receive second-semester assignments.'
);
assertSemesterRule(
    true,
    placementDepartmentCanBePreferred([
        'name' => 'Biology',
        'college_name' => 'Natural and Computational Sciences',
        'stream' => 'Natural',
        'offered_semester' => 1,
    ], 'Natural Science', 1),
    'First-semester Natural Science preferences allow Other Natural Science.'
);
assertSemesterRule(
    true,
    placementDepartmentCanBePreferred([
        'name' => 'Economics',
        'college_name' => 'Business and Economics',
        'stream' => 'Social',
        'offered_semester' => 1,
    ], 'Social Science', 1),
    'First-semester Social Science preferences allow Other Social Science.'
);
assertSemesterRule(
    true,
    placementDepartmentCanBePreferred([
        'name' => 'Economics',
        'college_name' => 'Business and Economics',
        'stream' => 'Social',
        'offered_semester' => 1,
    ], 'Social', 1),
    'The abbreviated Social stream must allow first-semester Other Social Science choices.'
);
assertSemesterRule(
    true,
    placementDepartmentCanBePreferred([
        'name' => 'Agriculture',
        'college_name' => 'Agriculture',
        'stream' => 'Natural',
        'offered_semester' => 1,
    ], 'Natural', 1),
    'The abbreviated Natural stream must allow first-semester Other Natural Science choices.'
);
$expandedGroupPreferences = placementExpandCollegePreferences(
    [['department' => 'Other Natural Science', 'priority' => 1]],
    [
        ['id' => 31, 'name' => 'Agriculture', 'college_name' => 'Agriculture', 'stream' => 'Natural', 'offered_semester' => 1],
        ['id' => 32, 'name' => 'Biology', 'college_name' => 'Natural and Computational Sciences', 'stream' => 'Natural', 'offered_semester' => 1],
        ['id' => 33, 'name' => 'Economics', 'college_name' => 'Business and Economics', 'stream' => 'Social', 'offered_semester' => 1],
    ],
    'Natural Science',
    1
);
if (array_column($expandedGroupPreferences, 'department') !== ['Agriculture', 'Biology']
    || array_column($expandedGroupPreferences, 'priority') !== [1, 1]) {
    throw new RuntimeException('An Other Natural Science choice must preserve rank and include eligible departments in that group.');
}
$broadSocialChoice = [
    'dept_id' => 0,
    'department' => 'Other Social Science',
    'priority' => 1,
    'is_broad_choice' => true,
];
if (placementBroadChoiceGroup(['college_name' => 'Other Social Science']) !== ''
    || placementBroadChoiceGroup(['department' => 'Other Social Science']) !== 'other_social_science') {
    throw new RuntimeException('Broad choice recognition must use the persisted department/choice label, not the college metadata field.');
}
$unexpandedBroadSocialChoice = placementExpandCollegePreferences(
    [$broadSocialChoice],
    [
        ['id' => 34, 'name' => 'Economics', 'college_name' => 'Business and Economics', 'stream' => 'Social', 'offered_semester' => 1],
        ['id' => 35, 'name' => 'Sociology', 'college_name' => 'Social Sciences and Humanities', 'stream' => 'Social', 'offered_semester' => 1],
    ],
    'Social',
    1
);
if ($unexpandedBroadSocialChoice !== [$broadSocialChoice]) {
    throw new RuntimeException('A null-department broad choice must not be expanded into specific first-semester departments.');
}
$broadSocialTarget = placementBroadChoiceAllocationTarget(
    'Social',
    $broadSocialChoice,
    [
        ['id' => 34, 'name' => 'Economics', 'college_name' => 'Business and Economics', 'stream' => 'Social', 'offered_semester' => 1],
    ],
    ['other_social_science' => 3]
);
if (($broadSocialTarget['placement_group'] ?? '') !== 'other_social_science'
    || ($broadSocialTarget['choice_rank'] ?? 0) !== 1
    || ($broadSocialTarget['college_name'] ?? '') !== 'College of Other Social Sciences'
    || placementBroadChoiceAllocationTarget(
        'Social',
        $broadSocialChoice,
        [
            ['id' => 34, 'name' => 'Economics', 'college_name' => 'Business and Economics', 'stream' => 'Social', 'offered_semester' => 1],
        ],
        ['other_social_science' => 0]
    ) !== null) {
    throw new RuntimeException('A broad Choice 1 must reserve available second-semester group capacity with its original rank.');
}
$expandedCollegePreferences = placementExpandCollegePreferences(
    [['dept_id' => 41, 'department' => 'Medicine', 'priority' => 2]],
    [
        ['id' => 41, 'name' => 'Medicine', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'offered_semester' => 1],
        ['id' => 42, 'name' => 'Pharmacy', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'offered_semester' => 1],
        ['id' => 43, 'name' => 'Computer Science', 'college_id' => 20, 'college_name' => 'Gafat Institute of Technology', 'stream' => 'Natural', 'offered_semester' => 1],
    ],
    'Natural Science',
    1
);
if (array_column($expandedCollegePreferences, 'department') !== ['Medicine', 'Pharmacy']
    || array_column($expandedCollegePreferences, 'priority') !== [2, 2]) {
    throw new RuntimeException('A ranked college choice must compete across all eligible first-semester departments in that college.');
}
$expandedSocialPreferences = placementExpandCollegePreferences(
    [
        ['department' => 'Other Social Science', 'priority' => 1],
        ['dept_id' => 53, 'department' => 'Law', 'priority' => 2],
    ],
    [
        ['id' => 51, 'name' => 'Economics', 'college_name' => 'Business and Economics', 'stream' => 'Social', 'offered_semester' => 1],
        ['id' => 52, 'name' => 'Sociology', 'college_name' => 'Social Sciences and Humanities', 'stream' => 'Social', 'offered_semester' => 1],
        ['id' => 53, 'name' => 'Law', 'college_name' => 'School of Law', 'stream' => 'Social', 'offered_semester' => 1],
    ],
    'Social',
    1
);
if (array_column($expandedSocialPreferences, 'department') !== ['Economics', 'Sociology', 'Law']
    || array_column($expandedSocialPreferences, 'priority') !== [1, 1, 2]) {
    throw new RuntimeException('A Rank 1 Other Social Science choice must expand for Social stream students and stay ahead of Law.');
}
assertSemesterValue(
    'health_science',
    placementDepartmentGroup([
        'name' => 'Medicine',
        'college_name' => 'College of Health Science',
        'stream' => 'Natural',
    ]),
    'Health Science groups are derived from college names.'
);
assertSemesterValue(
    'git',
    placementDepartmentGroup([
        'name' => 'Information Technology',
        'college_name' => 'Gafat Institute of Technology',
        'stream' => 'Natural',
    ]),
    'Gafat Institute groups are derived from college names.'
);
assertSemesterValue(
    'other_natural_science',
    placementDepartmentGroup([
        'name' => 'Agriculture',
        'college_name' => 'Agriculture',
        'stream' => 'Natural',
    ]),
    'Other Natural Science includes natural departments outside Health and GIT.'
);
assertSemesterValue(
    'law',
    placementDepartmentGroup([
        'name' => 'Political Science',
        'college_name' => 'School of Law and Governance',
        'stream' => 'Social',
    ]),
    'Law groups are derived from department or college names.'
);
assertSemesterValue(
    'other_social_science',
    placementDepartmentGroup([
        'name' => 'Sociology',
        'college_name' => 'Social Sciences and Humanities',
        'stream' => 'Social',
    ]),
    'Other Social Science excludes dynamically identified Law departments.'
);
assertSemesterRule(
    true,
    placementDepartmentMatchesAllocation(
        [
            'name' => 'Agriculture',
            'college_name' => 'Agriculture',
            'stream' => 'Natural',
        ],
        [
            'name' => 'Other Natural Science',
            'college_name' => 'College of Other Natural Sciences',
            'stream' => 'Natural',
            'placement_group' => 'other_natural_science',
        ]
    ),
    'Saved standardized group labels match their dynamically derived departments.'
);
assertSemesterValue(
    'College of Other Natural Sciences',
    placementDepartmentCapacityCollegeName([
        'name' => 'Agriculture',
        'college_name' => 'Agriculture',
        'stream' => 'Natural',
    ]),
    'Unmatched Natural Science departments use the standardized capacity college name.'
);
assertSemesterValue(
    'School of Law',
    placementDepartmentCapacityCollegeName([
        'name' => 'Law',
        'college_name' => 'Faculty of Social Sciences',
        'stream' => 'Social',
    ]),
    'Law departments use the standardized capacity college name.'
);
assertSemesterRule(
    false,
    placementDepartmentOfferedInSemester([
        'name' => 'Medicine',
        'college_name' => 'Health Science',
        'stream' => 'Natural',
        'offered_semester' => 2,
    ], 1),
    'Health Science departments respect the configured offered semester.'
);
assertSemesterRule(
    true,
    placementDepartmentOfferedInSemester([
        'name' => 'Public Health',
        'college_name' => 'Health Science',
        'stream' => 'Natural',
        'offered_semester' => 1,
    ], 1),
    'Any active Health Science department offered in semester one is available.'
);
assertSemesterRule(
    true,
    placementDepartmentOfferedInSemester([
        'name' => 'Public Health',
        'college_name' => 'Health Science',
        'stream' => 'Natural',
        'offered_semester' => 1,
    ], 2),
    'Other Health Science departments are available in semester two.'
);
assertSemesterRule(
    false,
    placementDepartmentCanBePreferred([
        'name' => 'Agriculture',
        'college_name' => 'Agriculture',
        'stream' => 'Natural',
        'offered_semester' => 2,
    ], 'Natural Science', 1),
    'Other Natural Science departments respect the configured offered semester.'
);
assertSemesterRule(
    false,
    placementDepartmentCanBePreferred([
        'name' => 'Sociology',
        'college_name' => 'Social Sciences and Humanities',
        'stream' => 'Social',
        'offered_semester' => 2,
    ], 'Social Science', 1),
    'Other Social Science departments respect the configured offered semester.'
);
assertSemesterRule(
    false,
    placementDepartmentOfferedInSemester([
        'name' => 'Computer Science',
        'college_name' => 'Gafat Institute of Technology',
        'stream' => 'Natural',
        'offered_semester' => 2,
        'placement_group' => 'legacy_group',
    ], 1),
    'GIT departments respect the configured offered semester.'
);
assertSemesterRule(
    true,
    placementDepartmentOfferedInSemester([
        'name' => 'Civil Engineering',
        'college_name' => 'Gafat Institute of Technology',
        'stream' => 'Natural',
        'offered_semester' => 1,
    ], 1),
    'Any GIT department offered in semester one is eligible.'
);
assertSemesterRule(
    false,
    placementDepartmentMatchesAllocation(
        [
            'college_id' => 31,
                'name' => 'Agriculture',
                'college_name' => 'Agriculture',
                'stream' => 'Natural',
                'placement_group' => 'legacy_group',
            ],
            [
                'college_id' => 32,
                'name' => 'Biology',
                'college_name' => 'Natural and Computational Sciences',
                'stream' => 'Natural',
                'placement_group' => 'old_group',
            ]
    ),
    'Second-semester allocation cannot cross college IDs just because departments share a placement group.'
);
assertSemesterRule(
    true,
    placementPreferenceWindowIsActive(
        '2026-10-01',
        '2026-10-30',
        new DateTimeImmutable('2026-10-21')
    ),
    'The preference window is active between configured dates.'
);
assertSemesterRule(
    false,
    placementPreferenceWindowIsActive(
        '2026-10-01',
        '2026-10-30',
        new DateTimeImmutable('2026-10-31')
    ),
    'The preference window closes after its configured deadline.'
);
assertSemesterRule(
    false,
    placementPreferenceWindowIsActive('2026-11-01', '2026-10-30', new DateTimeImmutable('2026-10-21')),
    'An invalid preference window is not active.'
);
assertSemesterRule(
    true,
    placementDepartmentMatchesAllocation(
        ['college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'placement_group' => 'health_science'],
        ['college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'placement_group' => 'health_science']
    ),
    'Semester-two choices can match the assigned college and placement group.'
);
assertSemesterRule(
    false,
    placementDepartmentMatchesAllocation(
        ['college_id' => 20, 'college_name' => 'Gafat Institute of Technology', 'stream' => 'Natural', 'placement_group' => 'git'],
        ['college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'placement_group' => 'health_science']
    ),
    'Semester-two choices from another placement group are rejected.'
);
assertSemesterRule(
    false,
    placementDepartmentMatchesAllocation(
        ['college_id' => 20, 'name' => 'Information Technology', 'college_name' => 'Gafat Institute of Technology', 'stream' => 'Natural', 'placement_group' => 'health_science'],
        ['college_id' => 10, 'name' => 'Medicine', 'college_name' => 'Health Science', 'stream' => 'Natural', 'placement_group' => 'health_science']
    ),
    'Semester-two choices from another college are rejected regardless of stored group values.'
);
assertSemesterRule(
    false,
    placementDepartmentMatchesAllocation(
        ['college_id' => 20, 'name' => 'Biology', 'college_name' => 'Agriculture', 'stream' => 'Natural'],
        ['college_id' => 10, 'college_name' => 'College of Health Science', 'stream' => 'Natural', 'placement_group' => 'health_science']
    ),
    'A shared stream cannot permit semester-two placement in another college.'
);
assertSemesterRule(
    false,
    placementDepartmentMatchesAllocation(
        ['college_id' => 20, 'name' => 'Nursing', 'college_name' => 'Health Science Annex', 'stream' => 'Natural'],
        ['college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'placement_group' => 'health_science']
    ),
    'A matching placement group cannot override a different assigned college ID.'
);
assertSemesterRule(
    true,
    placementDepartmentMatchesAllocation(
        ['college_id' => 0, 'college_name' => 'Health Science', 'stream' => 'Natural', 'placement_group' => 'health_science'],
        ['college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'placement_group' => 'health_science']
    ),
    'Semester-two college names are used when an allocation is missing a catalog ID.'
);

$capacityTotals = placementCollegeCapacityTotals($departments);
if (($capacityTotals[10] ?? 0) !== 20 || ($capacityTotals[20] ?? 0) !== 5) {
    throw new RuntimeException('College capacity should sum all child departments across semesters.');
}

$fallbackDepartments = [
    ['id' => 101, 'name' => 'Medicine', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'offered_semester' => 1, 'is_first_semester_only' => 1],
    ['id' => 202, 'name' => 'Computer Science', 'college_id' => 20, 'college_name' => 'Gafat Institute of Technology', 'stream' => 'Natural', 'offered_semester' => 2],
    ['id' => 203, 'name' => 'Information Technology', 'college_id' => 20, 'college_name' => 'Gafat Institute of Technology', 'stream' => 'Natural', 'offered_semester' => 2],
    ['id' => 303, 'name' => 'Agriculture', 'college_id' => 30, 'college_name' => 'Agriculture', 'stream' => 'Natural', 'offered_semester' => 2],
];
$fallbackPreferences = placementSecondSemesterFallbackPreferences(
    [
        ['dept_id' => 101, 'department' => 'Medicine', 'priority' => 1],
        ['dept_id' => 202, 'department' => 'Computer Science', 'priority' => 2],
        ['dept_id' => 203, 'department' => 'Information Technology', 'priority' => 3],
        ['dept_id' => 303, 'department' => 'Agriculture', 'priority' => 4],
    ],
    $fallbackDepartments,
    [
        'college_id' => 10,
        'college_name' => 'Health Science',
        'stream' => 'Natural',
        'placement_group' => 'health_science',
    ]
);
if (count($fallbackPreferences) !== 2
    || ($fallbackPreferences[0]['department'] ?? '') !== 'Computer Science'
    || ($fallbackPreferences[1]['department'] ?? '') !== 'Information Technology'
    || empty($fallbackPreferences[0]['is_fallback'])) {
    throw new RuntimeException('Semester-two fallback must use only the next Stage 1 preference college and its eligible ranked departments.');
}

$healthPreferenceDepartment = [
    'college_id' => 10,
    'college_name' => 'Health Science',
    'stream' => 'Natural',
];
$gitPreferenceDepartment = [
    'college_id' => 20,
    'college_name' => 'Gafat Institute of Technology',
    'stream' => 'Natural',
];
assertSemesterRule(
    false,
    placementCanAdvancePreferenceCollege(
        $healthPreferenceDepartment,
        $gitPreferenceDepartment,
        ['id:10' => 4, 'id:20' => 4],
        ['health_science' => 4, 'git' => 4]
    ),
    'A student cannot move to a later college while the current college still has capacity.'
);
assertSemesterRule(
    true,
    placementCanAdvancePreferenceCollege(
        $healthPreferenceDepartment,
        $gitPreferenceDepartment,
        ['id:10' => 0, 'id:20' => 4],
        ['health_science' => 0, 'git' => 4]
    ),
    'College preference fallback is allowed after the current college is exhausted.'
);
assertSemesterRule(
    false,
    placementCanAdvancePreferenceCollege(
        $healthPreferenceDepartment,
        $gitPreferenceDepartment,
        ['id:10' => 0, 'id:20' => 4],
        ['health_science' => 0, 'git' => 4],
        ['id:10' => 2, 'id:20' => 4],
        ['health_science' => 2, 'git' => 4]
    ),
    'A student must remain reserved in the first-choice college while it has second-semester capacity.'
);
assertSemesterRule(
    true,
    placementCanAdvancePreferenceCollege(
        $healthPreferenceDepartment,
        $gitPreferenceDepartment,
        ['id:10' => 0, 'id:20' => 4],
        ['health_science' => 0, 'git' => 4],
        ['id:10' => 0, 'id:20' => 4],
        ['health_science' => 0, 'git' => 4]
    ),
    'College preference fallback is allowed after both semester capacities are exhausted.'
);
$semesterOnePreferenceCapacity = placementPreferenceCapacityMaps(
    [
        ['id' => 1, 'name' => 'Medicine', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'capacity' => 4, 'offered_semester' => 1],
        ['id' => 2, 'name' => 'Pharmacy', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'capacity' => 4, 'offered_semester' => 1],
        ['id' => 3, 'name' => 'Public Health', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'capacity' => 8, 'offered_semester' => 2],
        ['id' => 4, 'name' => 'Computer Science', 'college_id' => 20, 'college_name' => 'Gafat Institute of Technology', 'stream' => 'Natural', 'capacity' => 5, 'offered_semester' => 1],
    ],
    ['medicine' => 0, 'pharmacy' => 0, 'public health' => 8, 'computer science' => 5],
    1
);
assertSemesterRule(
    false,
    placementCanAdvancePreferenceCollege(
        $healthPreferenceDepartment,
        $gitPreferenceDepartment,
        $semesterOnePreferenceCapacity['college'],
        $semesterOnePreferenceCapacity['group'],
        ['id:10' => 8, 'id:20' => 0],
        ['health_science' => 8, 'git' => 0]
    ),
    'Semester-two Health Science capacity must reserve the first-choice college after its semester-one capacity is full.'
);
if (($semesterOnePreferenceCapacity['college']['id:10'] ?? null) !== 0) {
    throw new RuntimeException('Semester-one college capacity must exclude departments offered only in semester two.');
}

$quotaPools = placementQuotaCapacityPools(10, 20.0);
if ($quotaPools !== ['general' => 8, 'female_reserved' => 2]) {
    throw new RuntimeException('College reservation capacity must preserve the configured 80/20 merit and female pools.');
}
$smallQuotaPools = placementQuotaCapacityPools(1, 20.0);
if ($smallQuotaPools !== ['general' => 0, 'female_reserved' => 1]) {
    throw new RuntimeException('A one-seat reservation must remain available only through the reserved female quota.');
}
$otherSocialDepartments = [
    ['name' => 'Economics', 'college_name' => 'Business and Economics', 'stream' => 'Social', 'capacity' => 1],
    ['name' => 'Sociology', 'college_name' => 'Social Sciences and Humanities', 'stream' => 'Social', 'capacity' => 1],
    ['name' => 'Psychology', 'college_name' => 'Education', 'stream' => 'Social', 'capacity' => 1],
];
$otherSocialCapacityByScope = [];
foreach ($otherSocialDepartments as $department) {
    $scope = placementQuotaScopeKey($department);
    $otherSocialCapacityByScope[$scope] = ($otherSocialCapacityByScope[$scope] ?? 0) + $department['capacity'];
}
if (count($otherSocialCapacityByScope) !== 1
    || placementQuotaCapacityPools(reset($otherSocialCapacityByScope), 20.0) !== ['general' => 2, 'female_reserved' => 1]) {
    throw new RuntimeException('Other Social Science quota must be calculated over combined group capacity, not rounded separately per department.');
}

if (placementMinimumPreferenceCount('Natural Science', 'Other Natural Science', 18) !== 15
    || placementMinimumPreferenceCount('Natural Science', 'Other Natural Science', 12) !== 12) {
    throw new RuntimeException('Other Natural Science must require 15 choices only when more than 15 are available.');
}

if (placementDeferredGroup('Natural Science', 'health_science') !== 'health_science'
    || placementDeferredGroup('Natural Science', 'other_natural_science') !== 'other_natural_science'
    || placementDeferredGroup('Social Science', 'law') !== 'law'
    || placementDeferredGroup('Social', 'other_social_science') !== 'other_social_science') {
    throw new RuntimeException('Deferred students must route to the configured second-semester group.');
}

$target = placementFirstSemesterAllocationTarget(
    'Natural Science',
    [['department' => 'Medicine', 'priority' => 1]],
    [
        ['name' => 'Medicine', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'placement_group' => 'health_science'],
        ['name' => 'Biology', 'college_id' => 30, 'college_name' => 'Other Natural Science', 'stream' => 'Natural', 'placement_group' => 'other_natural_science'],
    ]
);
if (($target['college_id'] ?? null) !== 10
    || ($target['college_name'] ?? '') !== 'Health Science'
    || ($target['placement_group'] ?? '') !== 'health_science'
    || ($target['choice_rank'] ?? null) !== 1) {
    throw new RuntimeException('Health Science preference overflow must retain its exact college allocation.');
}

$target = placementFirstSemesterAllocationTarget(
    'Natural Science',
    [['department' => 'Biology']],
    [
        ['name' => 'Medicine', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural', 'placement_group' => 'health_science'],
        ['name' => 'Biology', 'college_id' => 30, 'college_name' => 'Other Natural Science', 'stream' => 'Natural', 'placement_group' => 'other_natural_science'],
    ]
);
if (($target['college_id'] ?? null) !== null
    || ($target['college_name'] ?? '') !== 'College of Other Natural Sciences'
    || ($target['placement_group'] ?? '') !== 'other_natural_science') {
    throw new RuntimeException('Other Natural Science preferences must be allocated to their own college group.');
}

$target = placementFirstSemesterAllocationTarget(
    'Natural Science',
    [['department' => 'Biology', 'college_name' => 'Agriculture']],
    [
        ['name' => 'Physics', 'college_id' => 21, 'college_name' => 'Natural and Computational Sciences', 'stream' => 'Natural'],
        ['name' => 'Biology', 'college_id' => 32, 'college_name' => 'Agriculture', 'stream' => 'Natural'],
    ]
);
if (($target['college_id'] ?? null) !== null
    || ($target['placement_group'] ?? '') !== 'other_natural_science') {
    throw new RuntimeException('Other Natural Science preferences should allocate across the dynamic group.');
}

$target = placementFirstSemesterAllocationTarget(
    'Social Science',
    [['department' => 'Law']],
    [
        ['name' => 'Law', 'college_name' => 'School of Law', 'stream' => 'Social', 'placement_group' => 'law'],
        ['name' => 'Economics', 'college_name' => 'Other Social Science', 'stream' => 'Social', 'placement_group' => 'other_social_science'],
    ]
);
if (($target['placement_group'] ?? '') !== 'law') {
    throw new RuntimeException('Law pending allocations must remain in the selected Law college.');
}

$target = placementFirstSemesterAllocationTarget(
    'Natural Science',
    [
        ['department' => 'Medicine', 'college_name' => 'College of Health Science'],
        ['department' => 'Computer Science', 'college_name' => 'Gafat Institute of Technology'],
    ],
    [
        ['name' => 'Medicine', 'college_name' => 'Health Science', 'stream' => 'Natural'],
        ['name' => 'Computer Science', 'college_name' => 'Gafat Institute of Technology', 'stream' => 'Natural'],
    ],
    ['health_science' => 0, 'git' => 4]
);
if (($target['placement_group'] ?? '') !== 'git') {
    throw new RuntimeException('Pending allocations must fall through to the next ranked group with remaining capacity.');
}

$target = placementFirstSemesterAllocationTarget(
    'Natural Science',
    [
        ['department' => 'Medicine', 'college_name' => 'College of Health Science'],
        ['department' => 'Computer Science', 'college_name' => 'Gafat Institute of Technology'],
    ],
    [
        ['name' => 'Medicine', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural'],
        ['name' => 'Computer Science', 'college_id' => 20, 'college_name' => 'Gafat Institute of Technology', 'stream' => 'Natural'],
    ],
    ['health_science' => 0, 'git' => 4],
    ['health_science' => 3, 'git' => 4],
    ['id:10' => 3, 'id:20' => 4],
    ['id:10' => 2, 'id:20' => 4],
    ['id:10' => 0, 'id:20' => 4],
    ['health_science' => 0, 'git' => 4]
);
if (($target['college_id'] ?? null) !== 10) {
    throw new RuntimeException('A student must reserve the first-choice college when its first-semester capacity is exhausted and second-semester capacity remains.');
}

$target = placementFirstSemesterAllocationTarget(
    'Natural Science',
    [
        ['dept_id' => 101, 'department' => 'Medicine', 'college_id' => 10, 'college_name' => 'College of Health Science'],
        ['dept_id' => 202, 'department' => 'Computer Science', 'college_id' => 20, 'college_name' => 'Gafat Institute of Technology'],
    ],
    [
        ['id' => 101, 'name' => 'Medicine', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural'],
        ['id' => 202, 'name' => 'Computer Science', 'college_id' => 20, 'college_name' => 'Gafat Institute of Technology', 'stream' => 'Natural'],
    ],
    ['health_science' => 0, 'git' => 4],
    ['health_science' => 3, 'git' => 4],
    ['id:10' => 3, 'id:20' => 4],
    ['id:10' => 2, 'id:20' => 4],
    ['id:10' => 2, 'id:20' => 4],
    ['health_science' => 2, 'git' => 4]
);
if ($target !== null) {
    throw new RuntimeException('A second-semester reservation must not replace an available first-semester seat in the preferred college.');
}

$target = placementFirstSemesterAllocationTarget(
    'Natural Science',
    [
        ['dept_id' => 101, 'department' => 'Medicine', 'college_id' => 10, 'college_name' => 'College of Health Science'],
        ['dept_id' => 202, 'department' => 'Computer Science', 'college_id' => 20, 'college_name' => 'Gafat Institute of Technology'],
    ],
    [
        ['id' => 101, 'name' => 'Medicine', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural'],
        ['id' => 102, 'name' => 'Nursing', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural'],
        ['id' => 202, 'name' => 'Computer Science', 'college_id' => 20, 'college_name' => 'Gafat Institute of Technology', 'stream' => 'Natural'],
    ],
    ['health_science' => 0, 'git' => 4],
    ['health_science' => 3, 'git' => 4],
    ['id:10' => 3, 'id:20' => 4],
    ['id:10' => 0, 'id:20' => 4]
);
if (($target['college_id'] ?? null) !== 20
    || ($target['placement_group'] ?? '') !== 'git') {
    throw new RuntimeException('Second-semester allocation may move to the next college only after the first college has no second-semester capacity.');
}

$target = placementFirstSemesterAllocationTarget(
    'Natural Science',
    [
        ['department' => 'Medicine', 'college_name' => 'College of Health Science'],
        ['department' => 'Computer Science', 'college_name' => 'Gafat Institute of Technology'],
    ],
    [
        ['name' => 'Medicine', 'college_id' => 10, 'college_name' => 'Health Science', 'stream' => 'Natural'],
        ['name' => 'Computer Science', 'college_id' => 20, 'college_name' => 'Gafat Institute of Technology', 'stream' => 'Natural'],
    ],
    ['health_science' => 0, 'git' => 4],
    ['health_science' => 0, 'git' => 4],
    ['id:10' => 0, 'id:20' => 4],
    ['id:10' => 0, 'id:20' => 4],
    ['id:10' => 0, 'id:20' => 0],
    ['health_science' => 0, 'git' => 4]
);
if (($target['placement_group'] ?? '') !== 'git') {
    throw new RuntimeException('When the first-choice college is exhausted, pending allocation may use the next ranked college.');
}

$target = placementFirstSemesterAllocationTarget(
    'Natural Science',
    [
        ['department' => 'Medicine', 'college_name' => 'College of Health Science'],
        ['department' => 'Computer Science', 'college_name' => 'Gafat Institute of Technology'],
    ],
    [
        ['name' => 'Medicine', 'college_name' => 'Health Science', 'stream' => 'Natural'],
        ['name' => 'Computer Science', 'college_name' => 'Gafat Institute of Technology', 'stream' => 'Natural'],
        ['name' => 'Biology', 'college_name' => 'Other Natural Science', 'stream' => 'Natural'],
    ],
    ['health_science' => 0, 'git' => 0, 'other_natural_science' => 3],
    ['health_science' => 0, 'git' => 0, 'other_natural_science' => 3]
);
if ($target !== null) {
    throw new RuntimeException('Students must not be allocated to an unranked Other Natural Science fallback pool.');
}

$target = placementFirstSemesterAllocationTarget(
    'Social',
    [['department' => 'Economics', 'college_name' => 'Business and Economics']],
    [
        ['name' => 'Law', 'college_name' => 'School of Law', 'stream' => 'Social'],
        ['name' => 'Economics', 'college_name' => 'Business and Economics', 'stream' => 'Social'],
        ['name' => 'Sociology', 'college_name' => 'Social Sciences and Humanities', 'stream' => 'Social'],
    ]
);
if (($target['placement_group'] ?? '') !== 'other_social_science'
    || ($target['college_name'] ?? '') !== 'College of Other Social Sciences') {
    throw new RuntimeException('Other Social Science preferences should unlock the entire dynamic group in semester two.');
}

$target = placementFirstSemesterAllocationTarget(
    'Social Science',
    [['department' => 'Law', 'college_name' => 'School of Law']],
    [
        ['name' => 'Law', 'college_id' => 41, 'college_name' => 'School of Law', 'stream' => 'Social'],
        ['name' => 'Economics', 'college_id' => 42, 'college_name' => 'Business and Economics', 'stream' => 'Social'],
    ]
);
if (($target['college_id'] ?? null) !== 41 || ($target['placement_group'] ?? '') !== 'law') {
    throw new RuntimeException('Law pending allocations must remain within the originally selected college.');
}

if (placementFirstSemesterAllocationTarget('Social Science', [], [
    ['name' => 'Economics', 'college_name' => 'Business and Economics', 'stream' => 'Social'],
]) !== null) {
    throw new RuntimeException('Students without a first-semester group preference must not receive a semester-two allocation.');
}

echo "Placement semester checks passed.\n";
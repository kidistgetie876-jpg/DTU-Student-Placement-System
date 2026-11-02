<?php
require_once __DIR__ . '/../api/common/student_placement_schema.php';
require_once __DIR__ . '/../config/placement_semester.php';

function assertPlacementStreamMatch(bool $expected, bool $actual, string $scenario): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($scenario . ': expected ' . ($expected ? 'match' : 'mismatch'));
    }
}

assertPlacementStreamMatch(
    true,
    studentPlacementStreamsMatch('Social Science', 'Social'),
    'Equivalent Social Science labels match'
);
assertPlacementStreamMatch(
    true,
    placementNormalizeStream('Social Science') === placementDepartmentStream(['stream' => 'Social']),
    'Backend preference validation accepts the Social label for Social Science students'
);
assertPlacementStreamMatch(
    true,
    studentPlacementStreamsMatch('Natural Sciences', 'Natural Science'),
    'Singular and plural Natural Science labels match'
);
assertPlacementStreamMatch(
    false,
    studentPlacementStreamsMatch('Social Science', 'Natural Science'),
    'Social Science cannot match a Natural Science department'
);
assertPlacementStreamMatch(
    false,
    studentPlacementStreamsMatch('Natural', 'Social'),
    'Natural cannot match a Social department'
);
assertPlacementStreamMatch(
    false,
    studentPlacementStreamsMatch('', 'Natural'),
    'An unknown student stream cannot match a department'
);

echo "Placement stream checks passed.\n";

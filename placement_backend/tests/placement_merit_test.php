<?php
require_once __DIR__ . '/../config/placement_scoring.php';

$students = sortPlacementStudentsByMerit([
    ['id' => 'lower', 'final_merit_score' => 99.99998, 'cgpa' => 4.0],
    ['id' => 'highest', 'final_merit_score' => 100.0, 'cgpa' => 3.5],
    ['id' => 'middle', 'final_merit_score' => 99.99999, 'cgpa' => 3.0],
]);

if (array_column($students, 'id') !== ['highest', 'middle', 'lower']) {
    throw new RuntimeException('Placement candidates must be sorted by exact descending merit score.');
}

$meritExample = sortPlacementStudentsByMerit([
    ['id' => 'fatima', 'final_merit_score' => 70.98, 'gender' => 'Female', 'priority' => 1, 'cgpa' => 4.0],
    ['id' => 'yonas', 'final_merit_score' => 72.16, 'gender' => 'Male', 'priority' => 2, 'cgpa' => 3.0],
]);
if (array_column($meritExample, 'id') !== ['yonas', 'fatima']) {
    throw new RuntimeException('Higher final merit must be processed first regardless of gender, choice priority, or GPA.');
}

$equalMeritStudents = sortPlacementStudentsByMerit([
    ['id' => 'first', 'final_merit_score' => 80.0, 'cgpa' => 2.0],
    ['id' => 'second', 'final_merit_score' => 80.0, 'cgpa' => 4.0],
]);
if (array_column($equalMeritStudents, 'id') !== ['first', 'second']) {
    throw new RuntimeException('Equal final merit scores must retain their original evaluation order.');
}

if (!placementIsFemale('Female') || !placementIsFemale('F') || placementIsFemale('Male')) {
    throw new RuntimeException('Female quota eligibility must recognize common female gender labels.');
}

echo "Placement merit checks passed.\n";

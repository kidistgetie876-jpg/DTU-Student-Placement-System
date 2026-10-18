<?php
require_once __DIR__ . '/../config/placement_scoring.php';

function assertPlacementScore(float $expected, float $actual, string $scenario): void
{
    if (abs($expected - $actual) > 0.00001) {
        throw new RuntimeException(
            $scenario . ': expected ' . $expected . ', got ' . $actual
        );
    }
}

$defaultRules = [
    'grade12Weight' => 20,
    'gpaWeight' => 50,
    'cocWeight' => 30,
    'maxScoreCap' => 100,
];

assertPlacementScore(
    100.0,
    calculatePlacementCumulativeScore(4.0, 100.0, 30.0, 'Male', false, false, $defaultRules),
    'Maximum source scores produce a 100-point base score'
);
assertPlacementScore(
    50.0,
    calculatePlacementCumulativeScore(2.0, 50.0, 15.0, 'Male', false, false, $defaultRules),
    'Half-scale source scores contribute 50 points'
);
assertPlacementScore(
    50.0,
    calculatePlacementCumulativeScore(0.0, 0.0, 30.0, 'Male', false, false, $defaultRules),
    'COC score out of 30 contributes the full 50-point weight'
);
assertPlacementScore(
    10.0,
    calculatePlacementCumulativeScore(0.0, 300.0, 0.0, 'Male', false, false, [
        ...$defaultRules,
        'g12_total_base' => 600,
    ]),
    'Grade 12 marks are normalized against the configured 600-point base'
);
assertPlacementScore(
    20.0,
    calculatePlacementCumulativeScore(0.0, 600.0, 0.0, 'Male', false, false, [
        ...$defaultRules,
        'g12_total_base' => 600,
    ]),
    'Grade 12 marks at the configured base receive the full weight'
);
assertPlacementScore(
    20.0,
    calculatePlacementCumulativeScore(0.0, 0.0, 0.0, 'Female', true, 'Developing Region', $defaultRules),
    'Affirmative action bonuses are included'
);
assertPlacementScore(
    80.0,
    calculatePlacementCumulativeScore(4.0, 100.0, 30.0, 'Male', false, false, [
        ...$defaultRules,
        'maxScoreCap' => 80,
    ]),
    'Configured score caps are enforced below 100'
);

echo "Placement scoring checks passed.\n";

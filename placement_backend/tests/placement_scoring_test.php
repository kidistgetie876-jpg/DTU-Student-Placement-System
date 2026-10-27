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
];

assertPlacementScore(
    100.0,
    calculatePlacementCumulativeScore(4.0, 600.0, 30.0, 'Male', false, false, $defaultRules),
    'Maximum source scores produce a 100-point base score'
);
assertPlacementScore(
    70.0,
    calculatePlacementCumulativeScore(4.0, 300.0, 15.0, 'Male', false, false, [
        'gpa_weight' => 50,
        'grade_12_weight' => 20,
        'coc_weight' => 30,
        'g12_total_base' => 600,
    ]),
    'Custom academic weights are used by the shared score calculation'
);
assertPlacementScore(
    50.0,
    calculatePlacementCumulativeScore(2.0, 300.0, 15.0, 'Male', false, false, $defaultRules),
    'Half-scale source scores contribute 50 points'
);
assertPlacementScore(
    30.0,
    calculatePlacementCumulativeScore(0.0, 0.0, 30.0, 'Male', false, false, $defaultRules),
    'COC score out of 30 contributes the full 30-point weight'
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
    5.0,
    calculatePlacementAffirmativeActionBonus('Male', false, 'Yes', $defaultRules),
    'A male student from a minority region receives the minority bonus'
);
assertPlacementScore(
    10.0,
    calculatePlacementAffirmativeActionBonus('Female', false, 'Yes', $defaultRules),
    'A female student from a minority region receives female and minority bonuses'
);
assertPlacementScore(
    10.0,
    calculatePlacementAffirmativeActionBonus('Male', 'Yes', 'Yes', $defaultRules),
    'A male student from a minority region with disability receives both bonuses'
);
assertPlacementScore(
    15.0,
    calculatePlacementAffirmativeActionBonus('Female', 'Yes', 'Yes', $defaultRules),
    'Female, minority, and disability bonuses are all summed'
);
$scenarioRules = [
    ...$defaultRules,
    'minority_male_bonus_points' => 6,
    'minority_female_bonus_points' => 12,
    'minority_disability_bonus_points' => 13,
    'female_disability_minority_bonus_points' => 18,
];
assertPlacementScore(
    6.0,
    calculatePlacementAffirmativeActionBonus('Male', false, true, $scenarioRules),
    'Minority male uses its configured scenario total'
);
assertPlacementScore(
    12.0,
    calculatePlacementAffirmativeActionBonus('Female', false, true, $scenarioRules),
    'Minority female uses its configured scenario total instead of summing base rules'
);
assertPlacementScore(
    13.0,
    calculatePlacementAffirmativeActionBonus('Male', true, true, $scenarioRules),
    'Minority disability uses its configured scenario total'
);
assertPlacementScore(
    18.0,
    calculatePlacementAffirmativeActionBonus('Female', true, true, $scenarioRules),
    'Female disability minority uses its configured scenario total'
);
$customScenarioBreakdown = getPlacementAffirmativeActionBonusBreakdown(
    'Female',
    true,
    true,
    $scenarioRules
);
assertPlacementScore(
    18.0,
    $customScenarioBreakdown['scenario_bonus'],
    'Score breakdown identifies the configured total for the applied scenario'
);
if ($customScenarioBreakdown['applied_scenario'] !== 'female_disability_minority') {
    throw new RuntimeException('Score breakdown should identify the matching affirmative-action scenario.');
}
assertPlacementScore(
    10.0,
    calculatePlacementAffirmativeActionBonus('Female', true, false, $defaultRules),
    'Female and disability without minority continue to sum base rules'
);
assertPlacementScore(
    10.0,
    calculatePlacementCumulativeScore(0.0, 0.0, 0.0, 'Female', false, 'Afar', $defaultRules),
    'Developing-region names activate the minority bonus in the cumulative score'
);
assertPlacementScore(
    14.0,
    calculatePlacementAffirmativeActionBonus('Female', true, 'Minority', [
        ...$defaultRules,
        'female_bonus_points' => 6,
        'disability_bonus_points' => 3,
        'minority_bonus_points' => 5,
    ]),
    'Active rule bonus values are fetched and summed independently'
);
assertPlacementScore(
    100.0,
    calculatePlacementCumulativeScore(4.0, 600.0, 30.0, 'Female', true, true, $defaultRules),
    'Affirmative-action bonuses cannot push the final score above 100'
);
$scoreCapRules = [...$defaultRules, 'max_score_cap' => 90];
assertPlacementScore(
    90.0,
    calculatePlacementCumulativeScore(4.0, 600.0, 30.0, 'Male', false, false, $scoreCapRules),
    'A configured score cap below 100 is respected'
);
assertPlacementScore(
    85.0,
    calculatePlacementCumulativeScore(4.0, 600.0, 30.0, 'Male', false, false, [
        ...$defaultRules,
        'max_cumulative_score' => 85,
    ]),
    'The max_cumulative_score rule alias caps the calculated score'
);
assertPlacementScore(
    100.0,
    calculatePlacementCumulativeScore(4.0, 600.0, 30.0, 'Male', false, false, [
        ...$defaultRules,
        'max_score_cap' => 120,
    ]),
    'A configured score cap cannot exceed the absolute maximum of 100'
);
assertPlacementScore(
    0.0,
    calculatePlacementCumulativeScore(0.0, 0.0, 0.0, 'Male', false, false, $defaultRules),
    'The minimum GPA is an eligibility threshold, not a minimum score floor'
);
$scoreBreakdown = calculatePlacementScoreBreakdown(3.75, 450.0, 27.0, 'Female', false, true, $defaultRules);
assertPlacementScore(88.88, $scoreBreakdown['base_score'], 'Score breakdown includes the weighted base score');
assertPlacementScore(10.0, $scoreBreakdown['affirmative_action_bonus'], 'Score breakdown exposes the combined bonus');
assertPlacementScore(98.88, $scoreBreakdown['cumulative_score'], 'Score breakdown final equals base plus bonuses');

echo "Placement scoring checks passed.\n";

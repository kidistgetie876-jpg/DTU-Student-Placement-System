<?php

function placementScoringValue(array $rules, array $keys, float $default): float
{
    foreach ($keys as $key) {
        if (isset($rules[$key]) && is_numeric($rules[$key])) {
            return (float) $rules[$key];
        }
    }
    return $default;
}

function placementScoringFlag($value): bool
{
    if (is_bool($value)) {
        return $value;
    }
    if (is_numeric($value)) {
        return (float) $value !== 0.0;
    }

    $normalized = strtolower(trim((string) $value));
    return in_array($normalized, [
        'yes',
        'y',
        'true',
        '1',
        'on',
        'minority',
        'developing',
        'developing region',
        'developing-region',
        'developing_region',
        'developingregion',
        'emerging',
    ], true) || (bool) preg_match(
            '/\b(afar|somali|gambella|benishangul[\s-]*gumuz|benishangul|harari)\b/',
            $normalized
        );
}

function placementIsFemale($gender): bool
{
        return in_array(strtolower(trim((string) $gender)), ['female', 'f', 'woman'], true);
}

function getPlacementAffirmativeActionBonusBreakdown(
    string $gender,
    $disability,
    $minorityOrDevelopingRegion,
    array $rules = []
): array {
    $isFemale = placementIsFemale($gender);
    $hasDisability = placementScoringFlag($disability);
    $hasMinority = placementScoringFlag($minorityOrDevelopingRegion);
    $femaleRule = placementScoringValue($rules, ['femaleBonusPoints', 'female_bonus_points'], 5.0);
    $disabilityRule = placementScoringValue($rules, ['disabilityBonusPoints', 'disability_bonus_points'], 5.0);
    $minorityMaleRule = placementScoringValue(
        $rules,
        ['minorityMaleBonusPoints', 'minority_male_bonus_points'],
        placementScoringValue($rules, ['minorityBonusPoints', 'minority_bonus_points'], 5.0)
    );
    $minorityFemaleRule = placementScoringValue(
        $rules,
        ['minorityFemaleBonusPoints', 'minority_female_bonus_points'],
        $femaleRule + $minorityMaleRule
    );
    $minorityDisabilityRule = placementScoringValue(
        $rules,
        ['minorityDisabilityBonusPoints', 'minority_disability_bonus_points'],
        $disabilityRule + $minorityMaleRule
    );
    $femaleDisabilityMinorityRule = placementScoringValue(
        $rules,
        ['femaleDisabilityMinorityBonusPoints', 'female_disability_minority_bonus_points'],
        $femaleRule + $disabilityRule + $minorityMaleRule
    );

    $appliedScenario = '';
    $scenarioBonus = 0.0;
    $femaleBonus = $isFemale ? $femaleRule : 0.0;
    $disabilityBonus = $hasDisability ? $disabilityRule : 0.0;
    $minorityBonus = $hasMinority ? $minorityMaleRule : 0.0;
    if ($hasMinority) {
        if ($isFemale && $hasDisability) {
            $appliedScenario = 'female_disability_minority';
            $scenarioBonus = $femaleDisabilityMinorityRule;
        } elseif ($isFemale) {
            $appliedScenario = 'minority_female';
            $scenarioBonus = $minorityFemaleRule;
        } elseif ($hasDisability) {
            $appliedScenario = 'minority_disability';
            $scenarioBonus = $minorityDisabilityRule;
        } else {
            $appliedScenario = 'minority_male';
            $scenarioBonus = $minorityMaleRule;
        }
        $femaleBonus = 0.0;
        $disabilityBonus = 0.0;
        $minorityBonus = 0.0;
    }
    $totalBonus = $hasMinority
        ? $scenarioBonus
        : $femaleBonus + $disabilityBonus;

    return [
        'female_bonus' => round($femaleBonus, 2),
        'disability_bonus' => round($disabilityBonus, 2),
        'minority_bonus' => round($minorityBonus, 2),
        'scenario_bonus' => round($scenarioBonus, 2),
        'applied_scenario' => $appliedScenario,
        'affirmative_action_bonus' => round($totalBonus, 2),
    ];
}

function calculatePlacementAffirmativeActionBonus(
    string $gender,
    $disability,
    $minorityOrDevelopingRegion,
    array $rules = []
): float {
    $breakdown = getPlacementAffirmativeActionBonusBreakdown(
        $gender,
        $disability,
        $minorityOrDevelopingRegion,
        $rules
    );

    return $breakdown['affirmative_action_bonus'];
}

function calculatePlacementScoreBreakdown(
    float $cgpa,
    float $grade12,
    float $coc,
    string $gender,
    $disability,
    $developingRegion,
    array $rules = []
): array {
    $grade12Weight = max(0.0, placementScoringValue($rules, ['grade12Weight', 'grade_12_weight'], 20.0));
    $cgpaWeight = max(0.0, placementScoringValue($rules, ['gpaWeight', 'gpa_weight'], 50.0));
    $cocWeight = max(0.0, placementScoringValue($rules, ['cocWeight', 'coc_weight'], 30.0));
    $scoreCap = min(100.0, max(0.0, placementScoringValue(
        $rules,
        ['maxCumulativeScore', 'max_cumulative_score', 'maxScoreCap', 'max_score_cap'],
        100.0
    )));
    $grade12TotalBase = max(0.01, placementScoringValue($rules, ['g12_total_base', 'g12TotalBase', 'grade12TotalBase'], 600.0));

    $grade12Contribution = min($grade12TotalBase, max(0.0, $grade12)) / $grade12TotalBase * $grade12Weight;
    $cgpaContribution = min(4.0, max(0.0, $cgpa)) / 4.0 * $cgpaWeight;
    $cocContribution = min(30.0, max(0.0, $coc)) / 30.0 * $cocWeight;
    $bonusBreakdown = getPlacementAffirmativeActionBonusBreakdown(
        $gender,
        $disability,
        $developingRegion,
        $rules
    );
    $affirmativeActionBonus = $bonusBreakdown['affirmative_action_bonus'];
    $baseScore = $grade12Contribution + $cgpaContribution + $cocContribution;

    return array_merge([
        'cgpa_contribution' => round($cgpaContribution, 2),
        'grade12_contribution' => round($grade12Contribution, 2),
        'coc_contribution' => round($cocContribution, 2),
        'base_score' => round($baseScore, 2),
        'score_cap' => $scoreCap,
        'cumulative_score' => round(min($scoreCap, max(0.0, $baseScore + $affirmativeActionBonus)), 2),
    ], $bonusBreakdown);
}

function calculatePlacementCumulativeScore(
    float $cgpa,
    float $grade12,
    float $coc,
    string $gender,
    $disability,
    $developingRegion,
    array $rules = []
): float {
    $breakdown = calculatePlacementScoreBreakdown(
        $cgpa,
        $grade12,
        $coc,
        $gender,
        $disability,
        $developingRegion,
        $rules
    );

    return $breakdown['cumulative_score'];
}

function sortPlacementStudentsByMerit(array $students): array
{
    $rankedStudents = [];
    foreach (array_values($students) as $index => $student) {
        $score = $student['final_merit_score']
            ?? $student['final_score']
            ?? $student['cumulative_score']
            ?? $student['score']
            ?? 0;
        $rankedStudents[] = [
            'student' => $student,
            'score' => is_numeric($score) ? (float) $score : 0.0,
            'index' => $index,
        ];
    }

    usort($rankedStudents, static function (array $left, array $right): int {
        $scoreOrder = $right['score'] <=> $left['score'];
        return $scoreOrder !== 0 ? $scoreOrder : $left['index'] <=> $right['index'];
    });

    return array_column($rankedStudents, 'student');
}

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
        'yes', 'y', 'true', '1', 'on', 'minority', 'developing',
        'developing region', 'developing-region', 'developing_region',
        'developingregion', 'emerging',
    ], true) || (bool) preg_match(
        '/\b(afar|somali|gambella|benishangul[\s-]*gumuz|benishangul|harari)\b/',
        $normalized
    );
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
    $grade12Weight = placementScoringValue($rules, ['grade12Weight', 'grade12', 'grade_12_weight'], 20.0);
    $cgpaWeight = placementScoringValue($rules, ['gpaWeight', 'gpa', 'gpa_weight'], 30.0);
    $cocWeight = placementScoringValue($rules, ['cocWeight', 'coc', 'coc_weight'], 50.0);
    $grade12TotalBase = max(0.01, placementScoringValue($rules, ['g12_total_base', 'g12TotalBase', 'grade12TotalBase'], 600.0));
    $scoreCap = min(100.0, max(0.0, placementScoringValue($rules, ['maxScoreCap', 'max_score_cap'], 100.0)));

    $grade12Contribution = min($grade12TotalBase, max(0.0, $grade12)) / $grade12TotalBase * $grade12Weight;
    $cgpaContribution = min(4.0, max(0.0, $cgpa)) / 4.0 * $cgpaWeight;
    $cocContribution = min(30.0, max(0.0, $coc)) / 30.0 * $cocWeight;

    $femaleBonus = strtolower(trim($gender)) === 'female'
        ? placementScoringValue($rules, ['femaleBonusPoints', 'female_bonus_points'], 5.0)
        : 0.0;
    $disabilityBonus = placementScoringFlag($disability)
        ? placementScoringValue($rules, ['disabilityBonusPoints', 'disability_bonus_points'], 5.0)
        : 0.0;
    $developingBonus = placementScoringFlag($developingRegion)
        ? max(
            placementScoringValue($rules, ['developingRegionFemaleBonusPoints', 'developing_region_female_bonus_points'], 10.0),
            placementScoringValue($rules, ['developingRegionDisabilityBonusPoints', 'developing_region_disability_bonus_points'], 10.0)
        )
        : 0.0;

    return round(min(
        100.0,
        $scoreCap,
        max(0.0, $grade12Contribution + $cgpaContribution + $cocContribution + $femaleBonus + $disabilityBonus + $developingBonus)
    ), 2);
}

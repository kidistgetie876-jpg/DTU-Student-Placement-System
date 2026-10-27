DROP TRIGGER IF EXISTS student_data_cumulative_score_before_insert;
DROP TRIGGER IF EXISTS student_data_cumulative_score_before_update;

UPDATE student_data AS sd
LEFT JOIN placement_settings AS ps ON ps.id = 1
SET sd.cumulative_score = ROUND(LEAST(
    COALESCE(ps.max_score_cap, 100),
    GREATEST(
        0,
        LEAST(4, GREATEST(0, COALESCE(NULLIF(sd.cgpa, 0), NULLIF(sd.gpa, 0), 0)))
            / 4 * COALESCE(ps.gpa_weight, 50)
        + LEAST(
            GREATEST(0.01, COALESCE(ps.g12_total_base, 600)),
            GREATEST(0, COALESCE(NULLIF(sd.total_mark, 0), NULLIF(sd.grade_12_result, 0), 0))
          ) / GREATEST(0.01, COALESCE(ps.g12_total_base, 600)) * COALESCE(ps.grade_12_weight, 20)
        + LEAST(30, GREATEST(0, COALESCE(NULLIF(sd.coc_score, 0), NULLIF(sd.coc_result, 0), 0)))
            / 30 * COALESCE(ps.coc_weight, 30)
        + CASE
            WHEN LOWER(COALESCE(sd.minority, '')) IN ('yes', 'y', 'true', '1', 'on')
                 OR LOWER(COALESCE(sd.region, '')) REGEXP 'afar|somali|gambella|benishangul|harari'
            THEN CASE
                WHEN LOWER(COALESCE(sd.sex, sd.gender, '')) IN ('female', 'f', 'woman')
                     AND LOWER(COALESCE(sd.disability, '')) IN ('yes', 'y', 'true', '1', 'on')
                    THEN COALESCE(ps.female_disability_minority_bonus_points, 15)
                WHEN LOWER(COALESCE(sd.sex, sd.gender, '')) IN ('female', 'f', 'woman')
                    THEN COALESCE(ps.minority_female_bonus_points, 10)
                WHEN LOWER(COALESCE(sd.disability, '')) IN ('yes', 'y', 'true', '1', 'on')
                    THEN COALESCE(ps.minority_disability_bonus_points, 10)
                ELSE COALESCE(ps.minority_male_bonus_points, ps.minority_bonus_points, 5)
            END
            ELSE
                CASE
                    WHEN LOWER(COALESCE(sd.sex, sd.gender, '')) IN ('female', 'f', 'woman')
                        THEN COALESCE(ps.female_bonus_points, 5)
                    ELSE 0
                END
                + CASE
                    WHEN LOWER(COALESCE(sd.disability, '')) IN ('yes', 'y', 'true', '1', 'on')
                        THEN COALESCE(ps.disability_bonus_points, 5)
                    ELSE 0
                END
          END
    )
), 2)
WHERE sd.cumulative_score IS NULL OR sd.cumulative_score = 0;

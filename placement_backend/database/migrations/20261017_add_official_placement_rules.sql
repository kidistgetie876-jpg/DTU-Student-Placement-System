ALTER TABLE placement_settings
    ADD COLUMN max_score_cap DECIMAL(5,2) NOT NULL DEFAULT 100,
    ADD COLUMN female_bonus_points DECIMAL(5,2) NOT NULL DEFAULT 5,
    ADD COLUMN disability_bonus_points DECIMAL(5,2) NOT NULL DEFAULT 5,
    ADD COLUMN developing_region_female_bonus_points DECIMAL(5,2) NOT NULL DEFAULT 10,
    ADD COLUMN developing_region_disability_bonus_points DECIMAL(5,2) NOT NULL DEFAULT 10,
    ADD COLUMN general_quota_percent DECIMAL(5,2) NOT NULL DEFAULT 80,
    ADD COLUMN reserved_female_quota_percent DECIMAL(5,2) NOT NULL DEFAULT 20;

UPDATE placement_settings
SET gpa_weight = 30,
    grade_12_weight = 20,
    coc_weight = 50,
    gender_weight = 0,
    disability_weight = 0,
    minority_weight = 0;
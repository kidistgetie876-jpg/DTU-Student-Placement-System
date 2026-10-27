ALTER TABLE placement_settings
    ADD COLUMN minority_bonus_points DECIMAL(5,2) NOT NULL DEFAULT 5;

UPDATE placement_settings
SET gpa_weight = 50,
    grade_12_weight = 20,
    coc_weight = 30;

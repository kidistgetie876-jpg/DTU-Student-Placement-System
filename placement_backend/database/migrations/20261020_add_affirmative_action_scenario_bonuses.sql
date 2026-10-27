ALTER TABLE placement_settings
    ADD COLUMN minority_male_bonus_points DECIMAL(5,2) NOT NULL DEFAULT 5,
    ADD COLUMN minority_female_bonus_points DECIMAL(5,2) NOT NULL DEFAULT 10,
    ADD COLUMN minority_disability_bonus_points DECIMAL(5,2) NOT NULL DEFAULT 10,
    ADD COLUMN female_disability_minority_bonus_points DECIMAL(5,2) NOT NULL DEFAULT 15;

UPDATE placement_settings
SET minority_male_bonus_points = minority_bonus_points,
    minority_female_bonus_points = female_bonus_points + minority_bonus_points,
    minority_disability_bonus_points = disability_bonus_points + minority_bonus_points,
    female_disability_minority_bonus_points = female_bonus_points + disability_bonus_points + minority_bonus_points;

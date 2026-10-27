ALTER TABLE departments
    ADD COLUMN college_id INT NULL,
    ADD COLUMN offered_semester TINYINT UNSIGNED NOT NULL DEFAULT 2,
    ADD COLUMN is_first_semester_only TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN placement_group VARCHAR(60) NOT NULL DEFAULT '';

ALTER TABLE student_choices
    ADD COLUMN semester TINYINT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE placement_settings
    ADD COLUMN active_semester TINYINT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE placement_results
    ADD COLUMN placement_semester TINYINT UNSIGNED NOT NULL DEFAULT 1;

UPDATE departments
SET placement_group = CASE
    WHEN LOWER(COALESCE(college_name, '')) REGEXP 'health'
        THEN 'health_science'
    WHEN LOWER(COALESCE(college_name, '')) REGEXP 'gafat|gefat|technology'
        THEN 'git'
    WHEN LOWER(COALESCE(name, '')) REGEXP '(^|[^a-z])law([^a-z]|$)'
        OR LOWER(COALESCE(college_name, '')) REGEXP 'law'
        THEN 'law'
    WHEN LOWER(COALESCE(stream, '')) REGEXP 'natural'
        THEN 'other_natural_science'
    WHEN LOWER(COALESCE(stream, '')) REGEXP 'social'
        THEN 'other_social_science'
    ELSE placement_group
END,
offered_semester = CASE
    WHEN LOWER(COALESCE(name, '')) REGEXP 'medicine|pharmacy|computer science|information technology|(^|[^a-z])law([^a-z]|$)'
        OR LOWER(COALESCE(college_name, '')) REGEXP 'law'
        THEN 1
    WHEN LOWER(COALESCE(stream, '')) REGEXP 'social'
        THEN 1
    WHEN LOWER(COALESCE(stream, '')) REGEXP 'natural'
        THEN 1
    ELSE 2
END,
is_first_semester_only = CASE
    WHEN LOWER(COALESCE(name, '')) REGEXP 'medicine|pharmacy|computer science|information technology|(^|[^a-z])law([^a-z]|$)'
        OR LOWER(COALESCE(college_name, '')) REGEXP 'law'
        THEN 1
    ELSE is_first_semester_only
END;

CREATE TABLE placement_college_allocations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    student_id BIGINT NULL,
    admission_number VARCHAR(50) NOT NULL,
    college_id INT NULL,
    college_name VARCHAR(150) NOT NULL,
    stream VARCHAR(50) NOT NULL,
    placement_group VARCHAR(60) NOT NULL,
    target_semester TINYINT UNSIGNED NOT NULL DEFAULT 2,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_placement_college_allocation_admission (admission_number),
    KEY idx_placement_college_allocations_student (student_id),
    KEY idx_placement_college_allocations_group (placement_group, target_semester, status)
);

ALTER TABLE student_data
    ADD COLUMN admission_number VARCHAR(50) NULL,
    ADD COLUMN region VARCHAR(100) NULL,
    ADD COLUMN given_name VARCHAR(100) NULL,
    ADD COLUMN father_name VARCHAR(100) NULL,
    ADD COLUMN grandfather_name VARCHAR(100) NULL,
    ADD COLUMN sex VARCHAR(10) NULL,
    ADD COLUMN total_mark DECIMAL(6,2) NULL,
    ADD COLUMN benefit_group VARCHAR(100) NOT NULL DEFAULT 'None',
    ADD COLUMN disability VARCHAR(10) NOT NULL DEFAULT 'No',
    ADD COLUMN minority VARCHAR(10) NOT NULL DEFAULT 'No',
    ADD COLUMN field_of_study VARCHAR(100) NULL,
    ADD COLUMN cgpa DECIMAL(3,2) NULL,
    ADD COLUMN coc_score DECIMAL(5,2) NULL,
    ADD COLUMN placement_status VARCHAR(50) NOT NULL DEFAULT 'Pending';

UPDATE student_data sd
LEFT JOIN users u ON u.id = sd.user_id AND LOWER(u.role) = 'student'
LEFT JOIN moshe_students m
    ON TRIM(m.admission_number) = TRIM(COALESCE(NULLIF(u.id_number, ''), NULLIF(sd.id_number, '')))
LEFT JOIN sims_students s
    ON TRIM(s.student_id) = TRIM(COALESCE(NULLIF(u.id_number, ''), NULLIF(sd.id_number, '')))
SET sd.admission_number = COALESCE(NULLIF(u.id_number, ''), NULLIF(sd.id_number, ''), m.admission_number),
    sd.region = COALESCE(m.region, sd.region),
    sd.given_name = COALESCE(m.given_name, NULLIF(sd.first_name, ''), NULLIF(u.first_name, '')),
    sd.father_name = COALESCE(m.father_name, NULLIF(sd.last_name, ''), NULLIF(u.last_name, '')),
    sd.grandfather_name = COALESCE(m.grand_father_name, ''),
    sd.sex = COALESCE(m.sex, NULLIF(sd.gender, ''), 'Unknown'),
    sd.total_mark = COALESCE(m.total_mark, sd.grade_12_result),
    sd.benefit_group = COALESCE(NULLIF(m.benefit_group, ''), 'None'),
    sd.disability = CASE
        WHEN LOWER(COALESCE(m.benefit_group, '')) REGEXP 'disabilit|disabled' THEN 'Yes'
        ELSE 'No'
    END,
    sd.minority = CASE
        WHEN LOWER(COALESCE(m.benefit_group, '')) REGEXP 'minority|developing[ -]region' THEN 'Yes'
        ELSE 'No'
    END,
    sd.field_of_study = COALESCE(m.field_of_study, sd.stream),
    sd.cgpa = COALESCE(s.cgpa, sd.gpa),
    sd.coc_score = COALESCE(s.coc_score, sd.coc_result),
    sd.placement_status = COALESCE(NULLIF(sd.status, ''), 'Pending');

CREATE UNIQUE INDEX uq_student_data_admission_number
    ON student_data (admission_number);

ALTER TABLE student_choices
    ADD COLUMN admission_number VARCHAR(50) NULL,
    ADD INDEX idx_student_choices_admission_number (admission_number);

UPDATE student_choices sc
JOIN users u ON u.id = sc.student_id
SET sc.admission_number = NULLIF(u.id_number, '');

ALTER TABLE placement_results
    ADD COLUMN admission_number VARCHAR(50) NULL,
    ADD INDEX idx_placement_results_admission_number (admission_number);

UPDATE placement_results pr
JOIN users u ON u.id = pr.student_id
SET pr.admission_number = NULLIF(u.id_number, '');

ALTER TABLE unassigned_students
    ADD COLUMN admission_number VARCHAR(50) NULL,
    ADD INDEX idx_unassigned_admission_number (admission_number);

UPDATE unassigned_students un
JOIN users u ON u.id = un.student_id
SET un.admission_number = NULLIF(u.id_number, '');

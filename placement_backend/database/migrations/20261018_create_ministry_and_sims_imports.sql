CREATE TABLE IF NOT EXISTS moshe_students (
    admission_number VARCHAR(100) NOT NULL,
    region VARCHAR(150) NOT NULL,
    given_name VARCHAR(150) NOT NULL,
    father_name VARCHAR(150) NOT NULL,
    grand_father_name VARCHAR(150) NOT NULL,
    sex VARCHAR(20) NOT NULL,
    total_mark DECIMAL(6,2) NOT NULL,
    benefit_group VARCHAR(255) NOT NULL,
    field_of_study VARCHAR(255) NOT NULL,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (admission_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sims_students (
    student_id VARCHAR(100) NOT NULL,
    cgpa DECIMAL(5,2) NOT NULL,
    coc_score DECIMAL(6,2) NOT NULL,
    program VARCHAR(255) NOT NULL,
    stream VARCHAR(150) NOT NULL,
    year VARCHAR(20) NOT NULL,
    registration_type VARCHAR(100) NOT NULL,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id),
    KEY idx_sims_students_student_id (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

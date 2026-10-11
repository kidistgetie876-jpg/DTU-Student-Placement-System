CREATE TABLE IF NOT EXISTS unassigned_students (
    student_id INT NOT NULL PRIMARY KEY,
    id_number VARCHAR(50) NOT NULL DEFAULT '',
    full_name VARCHAR(255) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    stream VARCHAR(100) NOT NULL DEFAULT '',
    college_name VARCHAR(255) NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'Not assigned',
    placement_run_at DATETIME NOT NULL,
    INDEX idx_unassigned_status_run (status, placement_run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE unassigned_students
    ADD COLUMN reason_code VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN' AFTER status,
    ADD COLUMN reason_details TEXT NULL AFTER reason_code,
    ADD COLUMN total_score DECIMAL(7,2) NULL AFTER reason_details;

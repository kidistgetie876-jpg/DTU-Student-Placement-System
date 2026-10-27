ALTER TABLE departments
    ADD COLUMN approval_status ENUM('pending', 'approved') NOT NULL DEFAULT 'pending',
    ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0;

UPDATE departments
SET approval_status = CASE WHEN capacity_approved = 1 THEN 'approved' ELSE 'pending' END,
    is_locked = CASE WHEN capacity_approved = 1 THEN 1 ELSE 0 END;

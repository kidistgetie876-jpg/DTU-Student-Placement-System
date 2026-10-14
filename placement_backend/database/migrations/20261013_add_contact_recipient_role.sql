ALTER TABLE contact_messages
    MODIFY COLUMN recipient_role ENUM('all', 'registrar', 'admin', 'head', 'student') NOT NULL DEFAULT 'all',
    ADD COLUMN target_type ENUM('all', 'individual') NOT NULL DEFAULT 'all' AFTER recipient_role,
    ADD COLUMN specific_recipient VARCHAR(255) NULL AFTER target_type,
    ADD COLUMN student_id VARCHAR(100) NULL AFTER specific_recipient;

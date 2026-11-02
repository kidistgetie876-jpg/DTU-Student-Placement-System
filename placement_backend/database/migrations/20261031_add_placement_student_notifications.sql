CREATE TABLE IF NOT EXISTS student_notifications (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id INT NULL,
    admission_number VARCHAR(100) NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(40) NOT NULL DEFAULT 'meeting',
    placement_semester TINYINT UNSIGNED NULL,
    placement_result_id BIGINT UNSIGNED NULL,
    meeting_date DATE NULL,
    meeting_time TIME NULL,
    location VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    KEY idx_student_notifications_student_read (student_id, is_read, created_at),
    KEY idx_student_notifications_admission (admission_number),
    KEY idx_student_notifications_placement_result (placement_result_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'student_notifications'
       AND COLUMN_NAME = 'admission_number') = 0,
    'ALTER TABLE student_notifications ADD COLUMN admission_number VARCHAR(100) NULL AFTER student_id',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'student_notifications'
       AND COLUMN_NAME = 'notification_type') = 0,
    'ALTER TABLE student_notifications ADD COLUMN notification_type VARCHAR(40) NOT NULL DEFAULT ''meeting'' AFTER message',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'student_notifications'
       AND COLUMN_NAME = 'placement_semester') = 0,
    'ALTER TABLE student_notifications ADD COLUMN placement_semester TINYINT UNSIGNED NULL AFTER notification_type',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'student_notifications'
       AND COLUMN_NAME = 'placement_result_id') = 0,
    'ALTER TABLE student_notifications ADD COLUMN placement_result_id BIGINT UNSIGNED NULL AFTER placement_semester',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

ALTER TABLE student_notifications
    MODIFY student_id INT NULL,
    MODIFY meeting_date DATE NULL,
    MODIFY meeting_time TIME NULL,
    MODIFY location VARCHAR(500) NULL;

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'student_notifications'
       AND INDEX_NAME = 'idx_student_notifications_admission') = 0,
    'ALTER TABLE student_notifications ADD INDEX idx_student_notifications_admission (admission_number)',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'student_notifications'
       AND INDEX_NAME = 'idx_student_notifications_placement_result') = 0,
    'ALTER TABLE student_notifications ADD INDEX idx_student_notifications_placement_result (placement_result_id)',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

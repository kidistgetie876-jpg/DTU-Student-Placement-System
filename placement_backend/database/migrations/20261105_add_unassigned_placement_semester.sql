SET @migration_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'unassigned_students'
       AND COLUMN_NAME = 'placement_semester') = 0,
    'ALTER TABLE unassigned_students ADD COLUMN placement_semester TINYINT UNSIGNED NULL',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

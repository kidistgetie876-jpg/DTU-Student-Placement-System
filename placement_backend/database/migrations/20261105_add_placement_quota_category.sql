SET @migration_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'placement_results'
       AND COLUMN_NAME = 'quota_category') = 0,
    'ALTER TABLE placement_results ADD COLUMN quota_category VARCHAR(32) NULL AFTER choice_rank',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @moe_admission_column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'student_data'
      AND COLUMN_NAME = 'moe_admission_number'
);
SET @moe_admission_column_migration = IF(
    @moe_admission_column_exists = 0,
    'ALTER TABLE student_data ADD COLUMN moe_admission_number VARCHAR(50) NULL',
    'SELECT ''student_data.moe_admission_number already exists'''
);
PREPARE moe_admission_column_statement FROM @moe_admission_column_migration;
EXECUTE moe_admission_column_statement;
DEALLOCATE PREPARE moe_admission_column_statement;

SET @student_id_column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'student_data'
      AND COLUMN_NAME = 'student_id'
);
SET @student_id_column_migration = IF(
    @student_id_column_exists = 0,
    'ALTER TABLE student_data ADD COLUMN student_id VARCHAR(50) NULL AFTER admission_number',
    'ALTER TABLE student_data MODIFY COLUMN student_id VARCHAR(50) NULL AFTER admission_number'
);
PREPARE student_id_column_statement FROM @student_id_column_migration;
EXECUTE student_id_column_statement;
DEALLOCATE PREPARE student_id_column_statement;

UPDATE student_data
SET moe_admission_number = COALESCE(
    NULLIF(TRIM(moe_admission_number), ''),
    NULLIF(TRIM(admission_number), '')
);

SET @student_data_user_id_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'student_data'
      AND COLUMN_NAME = 'user_id'
);
SET @student_id_backfill_migration = IF(
    @student_data_user_id_exists > 0,
    'UPDATE student_data sd
     INNER JOIN users u ON u.id = sd.user_id AND LOWER(TRIM(u.role)) = ''student''
     SET sd.student_id = NULLIF(TRIM(u.id_number), '''')
     WHERE NULLIF(TRIM(u.id_number), '''') IS NOT NULL
       AND NULLIF(TRIM(sd.student_id), '''') IS NULL
       AND TRIM(u.id_number) <> TRIM(COALESCE(sd.admission_number, ''''))
       AND NOT EXISTS (
           SELECT 1
           FROM users duplicate_user
           WHERE LOWER(TRIM(duplicate_user.role)) = ''student''
             AND TRIM(duplicate_user.id_number) = TRIM(u.id_number)
             AND duplicate_user.id <> u.id
       )',
    'SELECT ''student_data.user_id is unavailable; University IDs will be linked by SIMS import'''
);
PREPARE student_id_backfill_statement FROM @student_id_backfill_migration;
EXECUTE student_id_backfill_statement;
DEALLOCATE PREPARE student_id_backfill_statement;

SET @moe_admission_index_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'student_data'
      AND INDEX_NAME = 'uq_student_data_moe_admission_number'
);
SET @moe_admission_index_migration = IF(
    @moe_admission_index_exists = 0,
    'ALTER TABLE student_data ADD UNIQUE KEY uq_student_data_moe_admission_number (moe_admission_number)',
    'SELECT ''student_data.moe_admission_number unique index already exists'''
);
PREPARE moe_admission_index_statement FROM @moe_admission_index_migration;
EXECUTE moe_admission_index_statement;
DEALLOCATE PREPARE moe_admission_index_statement;

SET @student_id_index_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'student_data'
      AND INDEX_NAME = 'uq_student_data_student_id'
);
SET @student_id_index_migration = IF(
    @student_id_index_exists = 0,
    'ALTER TABLE student_data ADD UNIQUE KEY uq_student_data_student_id (student_id)',
    'SELECT ''student_data.student_id unique index already exists'''
);
PREPARE student_id_index_statement FROM @student_id_index_migration;
EXECUTE student_id_index_statement;
DEALLOCATE PREPARE student_id_index_statement;

SET @student_stream_column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'student_data'
      AND COLUMN_NAME = 'stream'
);

SET @student_stream_migration = IF(
    @student_stream_column_exists = 0,
    'ALTER TABLE student_data ADD COLUMN stream VARCHAR(50) AFTER minority',
    'SELECT ''student_data.stream already exists'''
);

PREPARE student_stream_statement FROM @student_stream_migration;
EXECUTE student_stream_statement;
DEALLOCATE PREPARE student_stream_statement;

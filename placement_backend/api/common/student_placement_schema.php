<?php

function studentPlacementTableExists(mysqli $db, string $table): bool
{
    $statement = $db->prepare(
        'SELECT COUNT(*) AS table_count
         FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to inspect database tables: ' . $db->error);
    }
    $statement->bind_param('s', $table);
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to inspect database tables: ' . $error);
    }
    $row = $statement->get_result()->fetch_assoc();
    $exists = (int) ($row['table_count'] ?? 0) > 0;
    $statement->close();
    return $exists;
}

function studentPlacementTableColumns(mysqli $db, string $table): array
{
    if (!preg_match('/^[a-z_]+$/i', $table)) {
        throw new InvalidArgumentException('Invalid database table name.');
    }
    if (!studentPlacementTableExists($db, $table)) {
        return [];
    }

    $result = $db->query("SHOW COLUMNS FROM `{$table}`");
    if (!$result) {
        throw new RuntimeException("Unable to inspect {$table} columns: " . $db->error);
    }
    $columns = array_column($result->fetch_all(MYSQLI_ASSOC), 'Field');
    $result->free();
    return $columns;
}

function ensureUnassignedStudentIdentitySchema(mysqli $db): void
{
    if (!studentPlacementTableExists($db, 'unassigned_students')) {
        return;
    }

    $columns = studentPlacementTableColumns($db, 'unassigned_students');
    if (!in_array('student_id', $columns, true)) {
        throw new RuntimeException('The unassigned_students table is missing student_id.');
    }
    if (!in_array('admission_number', $columns, true)) {
        if (!$db->query('ALTER TABLE unassigned_students ADD COLUMN admission_number VARCHAR(50) NULL')) {
            throw new RuntimeException('Unable to add admission_number to unassigned_students: ' . $db->error);
        }
    }

    $studentColumn = $db->query("SHOW COLUMNS FROM unassigned_students LIKE 'student_id'");
    if (!$studentColumn) {
        throw new RuntimeException('Unable to inspect unassigned student identifiers: ' . $db->error);
    }
    $studentDefinition = $studentColumn->fetch_assoc();
    $studentColumn->free();
    $indexes = $db->query('SHOW INDEX FROM unassigned_students');
    if (!$indexes) {
        throw new RuntimeException('Unable to inspect unassigned student indexes: ' . $db->error);
    }
    $hasPrimaryStudentId = false;
    $hasUniqueStudentId = false;
    $hasUniqueAdmissionNumber = false;
    while ($index = $indexes->fetch_assoc()) {
        if ($index['Column_name'] === 'student_id') {
            $hasPrimaryStudentId = $hasPrimaryStudentId || $index['Key_name'] === 'PRIMARY';
            $hasUniqueStudentId = $hasUniqueStudentId || (int) $index['Non_unique'] === 0;
        }
        if ($index['Column_name'] === 'admission_number' && (int) $index['Non_unique'] === 0) {
            $hasUniqueAdmissionNumber = true;
        }
    }
    $indexes->free();

    if (($studentDefinition['Null'] ?? 'NO') !== 'YES' || $hasPrimaryStudentId) {
        $alteration = $hasPrimaryStudentId
            ? 'ALTER TABLE unassigned_students DROP PRIMARY KEY, MODIFY student_id INT NULL'
            : 'ALTER TABLE unassigned_students MODIFY student_id INT NULL';
        if (!$db->query($alteration)) {
            throw new RuntimeException('Unable to allow unlinked students in the unassigned roster: ' . $db->error);
        }
        $hasUniqueStudentId = false;
    }
    if (!$hasUniqueStudentId) {
        if (!$db->query('ALTER TABLE unassigned_students ADD UNIQUE KEY uq_unassigned_student_id (student_id)')) {
            throw new RuntimeException('Unable to index unassigned student IDs: ' . $db->error);
        }
    }

    if (!$hasUniqueAdmissionNumber) {
        if (!$db->query("UPDATE unassigned_students SET admission_number = NULL WHERE TRIM(COALESCE(admission_number, '')) = ''")) {
            throw new RuntimeException('Unable to normalize unassigned admission numbers: ' . $db->error);
        }
        $duplicates = $db->query(
            "SELECT admission_number FROM unassigned_students
             WHERE admission_number IS NOT NULL
             GROUP BY admission_number HAVING COUNT(*) > 1 LIMIT 1"
        );
        if (!$duplicates) {
            throw new RuntimeException('Unable to validate unassigned admission numbers: ' . $db->error);
        }
        $hasDuplicateAdmissions = $duplicates->num_rows > 0;
        $duplicates->free();
        if ($hasDuplicateAdmissions) {
            throw new RuntimeException('Unassigned roster contains duplicate admission numbers and cannot be safely indexed.');
        }
        if (!$db->query('ALTER TABLE unassigned_students ADD UNIQUE KEY uq_unassigned_admission_number (admission_number)')) {
            throw new RuntimeException('Unable to index unassigned admission numbers: ' . $db->error);
        }
    }
}

function studentPlacementColumnExpression(array $columns, string $alias, array $candidates, string $fallback = 'NULL'): string
{
    $expressions = [];
    foreach ($candidates as $column) {
        if (in_array($column, $columns, true)) {
            $expressions[] = "`{$alias}`.`{$column}`";
        }
    }
    if (!$expressions) {
        return $fallback;
    }
    return count($expressions) === 1
        ? $expressions[0]
        : 'COALESCE(' . implode(', ', $expressions) . ')';
}

function studentPlacementTextExpression(array $columns, string $alias, array $candidates, string $fallback = "''"): string
{
    $expressions = [];
    foreach ($candidates as $column) {
        if (in_array($column, $columns, true)) {
            $expressions[] = "NULLIF(`{$alias}`.`{$column}`, '')";
        }
    }
    if (!$expressions) {
        return $fallback;
    }
    $expressions[] = $fallback;
    return 'COALESCE(' . implode(', ', $expressions) . ')';
}

function studentPlacementNormalizeStream($value): string
{
    $normalized = strtolower(trim((string) $value));
    $normalized = trim(str_replace('_', ' ', $normalized));
    $normalized = preg_replace('/[^a-z\s]/', '', $normalized);
    $normalized = preg_replace('/\s+/', ' ', $normalized);
    $normalized = trim($normalized);

    if ($normalized === '' || $normalized === 'social' || $normalized === 'social science' || $normalized === 'social sciences') {
        return 'Social Science';
    }
    if ($normalized === 'natural' || $normalized === 'natural science' || $normalized === 'natural sciences') {
        return 'Natural Science';
    }
    return '';
}

function studentPlacementStreamsMatch($studentStream, $departmentStream): bool
{
    $studentStream = studentPlacementNormalizeStream($studentStream);
    $departmentStream = studentPlacementNormalizeStream($departmentStream);
    return $studentStream !== '' && $studentStream === $departmentStream;
}

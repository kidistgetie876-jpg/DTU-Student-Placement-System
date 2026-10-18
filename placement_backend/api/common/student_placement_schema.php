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

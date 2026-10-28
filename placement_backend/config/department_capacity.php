<?php

function ensureDepartmentCapacityApprovalSchema(mysqli $db): void
{
    $columns = [
        'capacity_approved' => 'TINYINT(1) NOT NULL DEFAULT 0',
        'approval_status' => "ENUM('pending', 'approved') NOT NULL DEFAULT 'pending'",
        'is_locked' => 'TINYINT(1) NOT NULL DEFAULT 0',
    ];
    $addedColumns = [];

    foreach ($columns as $column => $definition) {
        $result = $db->query("SHOW COLUMNS FROM departments LIKE '{$column}'");
        if (!$result) {
            throw new RuntimeException('Unable to inspect department capacity approval schema: ' . $db->error);
        }

        $exists = $result->num_rows > 0;
        $result->free();
        if ($exists) {
            continue;
        }

        $alterError = null;
        try {
            $added = $db->query("ALTER TABLE departments ADD COLUMN {$column} {$definition}");
        } catch (Throwable $error) {
            $alterError = $error;
            $added = false;
        }
        if (!$added) {
            $check = $db->query("SHOW COLUMNS FROM departments LIKE '{$column}'");
            $wasAddedConcurrently = $check && $check->num_rows > 0;
            if ($check) {
                $check->free();
            }
            if (!$wasAddedConcurrently) {
                $message = $db->error ?: ($alterError ? $alterError->getMessage() : 'unknown database error');
                throw new RuntimeException("Unable to add departments.{$column}: " . $message);
            }
        } else {
            $addedColumns[] = $column;
        }
    }

    foreach (['approval_status', 'is_locked'] as $column) {
        if (!in_array($column, $addedColumns, true)) {
            continue;
        }
        $expression = $column === 'approval_status'
            ? "CASE WHEN capacity_approved = 1 THEN 'approved' ELSE 'pending' END"
            : "CASE WHEN approval_status = 'approved' OR capacity_approved = 1 THEN 1 ELSE 0 END";
        if (!$db->query("UPDATE departments SET {$column} = {$expression}")) {
            throw new RuntimeException("Unable to initialize departments.{$column}: " . $db->error);
        }
    }

    $approvalStatusColumn = $db->query("SHOW COLUMNS FROM departments LIKE 'approval_status'");
    if (!$approvalStatusColumn) {
        throw new RuntimeException('Unable to inspect department capacity approval status: ' . $db->error);
    }
    $approvalStatusDefinition = $approvalStatusColumn->fetch_assoc();
    $approvalStatusColumn->free();
    if (strpos(strtolower((string) ($approvalStatusDefinition['Type'] ?? '')), "'reopened'") === false) {
        if (!$db->query(
            "ALTER TABLE departments MODIFY approval_status ENUM('pending', 'approved', 'reopened') NOT NULL DEFAULT 'pending'"
        )) {
            throw new RuntimeException('Unable to enable reopened department capacities: ' . $db->error);
        }
    }
}

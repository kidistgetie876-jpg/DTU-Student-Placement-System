<?php
include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Only GET requests are allowed']);
    exit;
}

$db = null;

try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $tableColumns = static function (mysqli $connection, string $table): array {
        $result = $connection->query("SHOW COLUMNS FROM `{$table}`");
        if (!$result) {
            throw new RuntimeException("Unable to inspect {$table} columns: " . $connection->error);
        }
        $columns = array_column($result->fetch_all(MYSQLI_ASSOC), 'Field');
        $result->free();
        return $columns;
    };
    $studentColumns = $tableColumns($db, 'student_data');
    $userColumns = $tableColumns($db, 'users');
    $placementColumns = $tableColumns($db, 'placement_results');

    $hasColumn = static fn (array $columns, string $column): bool => in_array($column, $columns, true);
    $field = static function (string $table, array $columns, string $column): ?string {
        return in_array($column, $columns, true) ? "{$table}.`{$column}`" : null;
    };
    $coalesce = static function (?string ...$expressions): string {
        $expressions = array_values(array_filter($expressions, static fn (?string $expression): bool => $expression !== null));
        if (!$expressions) {
            return 'NULL';
        }
        $expressions = array_map(static fn (string $expression): string => "NULLIF({$expression}, '')", $expressions);
        return count($expressions) === 1 ? $expressions[0] : 'COALESCE(' . implode(', ', $expressions) . ')';
    };

    if (!$hasColumn($placementColumns, 'status')
        || (!$hasColumn($placementColumns, 'student_id')
            && !$hasColumn($placementColumns, 'admission_number')
            && !$hasColumn($placementColumns, 'id_number'))) {
        $missingColumns = [];
        if (!$hasColumn($placementColumns, 'status')) {
            $missingColumns[] = 'status';
        }
        if (!$hasColumn($placementColumns, 'student_id')
            && !$hasColumn($placementColumns, 'admission_number')
            && !$hasColumn($placementColumns, 'id_number')) {
            $missingColumns[] = 'student_id/admission_number/id_number';
        }
        error_log('Pending placement results schema mismatch; missing columns: '
            . implode(', ', $missingColumns)
            . '; available columns: ' . implode(', ', $placementColumns));
        throw new RuntimeException('placement_results is missing a student identifier or status column.');
    }

    $studentJoinConditions = [];
    if ($hasColumn($studentColumns, 'user_id') && $hasColumn($placementColumns, 'student_id')) {
        $studentJoinConditions[] = 'sd.`user_id` = pr.`student_id`';
    }
    foreach ([
        'admission_number' => ['admission_number', 'id_number'],
        'id_number' => ['id_number', 'admission_number'],
    ] as $studentIdentifier => $placementIdentifiers) {
        $studentField = $field('sd', $studentColumns, $studentIdentifier);
        if ($studentField !== null) {
            foreach ($placementIdentifiers as $placementIdentifier) {
            $placementField = $field('pr', $placementColumns, $placementIdentifier);
            if ($placementField !== null) {
                $studentJoinConditions[] = "{$studentField} = {$placementField}";
            }
            }
        }
    }
    $studentJoin = $studentJoinConditions
        ? implode(' OR ', array_unique($studentJoinConditions))
        : '1 = 0';

    $userJoinConditions = [];
    if ($hasColumn($userColumns, 'id') && $hasColumn($placementColumns, 'student_id')) {
        $userJoinConditions[] = 'u.`id` = pr.`student_id`';
    }
    if ($hasColumn($userColumns, 'id') && $hasColumn($studentColumns, 'user_id')) {
        $userJoinConditions[] = 'u.`id` = sd.`user_id`';
    }
    if ($hasColumn($userColumns, 'id_number')) {
        foreach (['admission_number', 'id_number'] as $placementIdentifier) {
            $placementField = $field('pr', $placementColumns, $placementIdentifier);
            if ($placementField !== null) {
                $userJoinConditions[] = "u.`id_number` = {$placementField}";
            }
        }
    }
    $userJoin = $userJoinConditions ? implode(' OR ', array_unique($userJoinConditions)) : '1 = 0';
    if ($hasColumn($userColumns, 'role')) {
        $userJoin = "({$userJoin}) AND LOWER(u.`role`) = 'student'";
    }

    $resolvedStudentId = $coalesce(
        $field('pr', $placementColumns, 'student_id'),
        $field('u', $userColumns, 'id'),
        $field('sd', $studentColumns, 'user_id')
    );
    $officialId = $coalesce(
        $field('pr', $placementColumns, 'id_number'),
        $field('pr', $placementColumns, 'admission_number'),
        $field('sd', $studentColumns, 'admission_number'),
        $field('sd', $studentColumns, 'id_number'),
        $field('u', $userColumns, 'id_number')
    );
    $firstName = $coalesce(
        $field('sd', $studentColumns, 'given_name'),
        $field('sd', $studentColumns, 'first_name'),
        $field('u', $userColumns, 'first_name')
    );
    $lastName = $coalesce(
        $field('sd', $studentColumns, 'father_name'),
        $field('sd', $studentColumns, 'last_name'),
        $field('u', $userColumns, 'last_name')
    );

    $orderBy = [];
    foreach ([
        'final_score' => 'DESC',
        'choice_rank' => 'ASC',
        'student_id' => 'ASC',
    ] as $column => $direction) {
        if ($hasColumn($placementColumns, $column)) {
            $orderBy[] = "pr.`{$column}` {$direction}";
        }
    }

    $sql = "SELECT pr.*,
                {$resolvedStudentId} AS resolved_student_id,
                {$officialId} AS official_id_number,
                {$firstName} AS first_name,
                {$lastName} AS last_name
            FROM placement_results pr
            LEFT JOIN student_data sd ON {$studentJoin}
            LEFT JOIN users u ON {$userJoin}
            WHERE LOWER(TRIM(pr.`status`)) IN ('pending', 'approved')
              AND " . (in_array('is_published', $placementColumns, true) ? 'COALESCE(pr.is_published, 0) = 0' : '1 = 1') . "
              AND NULLIF(TRIM(COALESCE(pr.`dept_name`, '')), '') IS NOT NULL
              AND LOWER(TRIM(pr.`dept_name`)) NOT IN ('not assigned', 'unassigned')";
    if ($orderBy) {
        $sql .= ' ORDER BY ' . implode(', ', $orderBy);
    }
    $result = $db->query($sql);

    if (!$result) {
        throw new RuntimeException('Unable to load pending placement results: ' . $db->error);
    }

    $placements = [];
    while ($row = $result->fetch_assoc()) {
        $studentId = $row['resolved_student_id'] ?? null;
        $placements[] = [
            'placement_id' => isset($row['id']) ? (int) $row['id'] : null,
            'student_id' => $studentId !== null ? (int) $studentId : ($row['official_id_number'] ?? null),
            'id_number' => $row['id_number'] ?? $row['official_id_number'] ?? null,
            'official_id_number' => $row['official_id_number'] ?? $row['id_number'] ?? null,
            'first_name' => (string) ($row['first_name'] ?? ''),
            'last_name' => (string) ($row['last_name'] ?? ''),
            'dept_name' => $row['dept_name'],
            'final_score' => (float) $row['final_score'],
            'choice_rank' => (int) $row['choice_rank'],
            'status' => $row['status'],
        ];
    }

    echo json_encode([
        'success' => true,
        'results' => $placements,
        'count' => count($placements),
    ]);
} catch (Throwable $error) {
    error_log('Pending placement results load failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to load pending placement results.']);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>

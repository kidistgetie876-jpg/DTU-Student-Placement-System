<?php
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function collegesApiResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    collegesApiResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

function collegesApiHasTable(mysqli $database, string $table): bool
{
    $statement = $database->prepare(
        'SELECT COUNT(*) AS table_count
         FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?'
    );
    if (!$statement) {
        throw new RuntimeException($database->error);
    }
    $statement->bind_param('s', $table);
    if (!$statement->execute()) {
        throw new RuntimeException($statement->error);
    }
    $result = $statement->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $statement->close();
    return (int) ($row['table_count'] ?? 0) > 0;
}

try {
    $database = getDbConnection();
    if (!$database instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    if (collegesApiHasTable($database, 'colleges') && collegesApiHasTable($database, 'streams')) {
        $result = $database->query(
            "SELECT MIN(colleges.id) AS id,
                    CASE
                        WHEN LOWER(TRIM(streams.name)) IN ('natural', 'natural science')
                         AND LOWER(TRIM(colleges.name)) IN (
                            'technology',
                            'gafat tech',
                            'gafat institute of technology',
                            'gefat institute of technology',
                            'gafat institute of technology (git)'
                        ) THEN 'Gafat Institute of Technology (GIT)'
                        WHEN LOWER(TRIM(streams.name)) IN ('natural', 'natural science')
                         AND LOWER(TRIM(colleges.name)) IN ('health science', 'college of health science')
                            THEN 'Health Science'
                        WHEN LOWER(TRIM(streams.name)) IN ('natural', 'natural science')
                         AND LOWER(TRIM(colleges.name)) IN (
                            'other natural science',
                            'college of natural and computational sciences',
                            'college of agriculture and environmental sciences',
                            'agriculture and environmental sciences',
                            'freshman faculty'
                        )
                            THEN 'Other Natural Science'
                        WHEN LOWER(TRIM(streams.name)) IN ('social', 'social science')
                         AND LOWER(TRIM(colleges.name)) IN ('law', 'school of law', 'college of law')
                            THEN 'School of Law'
                        WHEN LOWER(TRIM(streams.name)) IN ('social', 'social science')
                         AND LOWER(TRIM(colleges.name)) IN (
                            'other social science',
                            'college of social sciences and humanities',
                            'social sciences and humanities',
                            'college of business and economics',
                            'business and economics'
                        )
                            THEN 'Other Social Science'
                        ELSE TRIM(colleges.name)
                    END AS name,
                    colleges.stream_id,
                    streams.name AS stream_name
             FROM colleges
             INNER JOIN streams ON streams.id = colleges.stream_id
             GROUP BY colleges.stream_id, streams.name, name
             ORDER BY streams.name ASC, name ASC"
        );
        if (!$result) {
            throw new RuntimeException($database->error);
        }
        $colleges = [];
        while ($row = $result->fetch_assoc()) {
            $colleges[] = [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'stream_id' => (int) $row['stream_id'],
                'stream_name' => $row['stream_name'],
            ];
        }
        collegesApiResponse(['success' => true, 'colleges' => $colleges]);
    }

    $departmentColumns = [];
    $columnsResult = $database->query('SHOW COLUMNS FROM departments');
    if (!$columnsResult) {
        throw new RuntimeException($database->error);
    }
    while ($column = $columnsResult->fetch_assoc()) {
        $departmentColumns[(string) $column['Field']] = true;
    }
    $columnsResult->free();
    if (!isset($departmentColumns['college_name']) || !isset($departmentColumns['stream'])) {
        throw new RuntimeException('College catalog tables are unavailable and departments lack college/stream fields.');
    }

    $streamRows = [];
    if (collegesApiHasTable($database, 'streams')) {
        $streamsResult = $database->query('SELECT id, name FROM streams');
        if (!$streamsResult) {
            throw new RuntimeException($database->error);
        }
        while ($stream = $streamsResult->fetch_assoc()) {
            $streamKey = strtolower(trim((string) $stream['name']));
            $streamValue = [
                'id' => (int) $stream['id'],
                'name' => (string) $stream['name'],
            ];
            $streamRows[$streamKey] = $streamValue;
            if ($streamKey === 'natural') {
                $streamRows['natural science'] = $streamValue;
            } elseif ($streamKey === 'social') {
                $streamRows['social science'] = $streamValue;
            }
        }
    }

    $result = $database->query(
        "SELECT DISTINCT
                CASE
                    WHEN LOWER(TRIM(college_name)) IN (
                        'technology', 'gafat tech', 'gafat institute of technology', 'gefat institute of technology',
                        'gafat institute of technology (git)'
                    ) THEN 'Gafat Institute of Technology (GIT)'
                    WHEN LOWER(TRIM(college_name)) IN ('health science', 'college of health science') THEN 'Health Science'
                    WHEN LOWER(TRIM(stream)) IN ('natural', 'natural science') THEN 'Other Natural Science'
                    WHEN LOWER(TRIM(college_name)) IN ('law', 'school of law', 'college of law') THEN 'School of Law'
                    ELSE 'Other Social Science'
                END AS name,
                TRIM(stream) AS stream_name
         FROM departments
         WHERE college_name IS NOT NULL AND TRIM(college_name) <> ''
           AND (
                (LOWER(TRIM(stream)) IN ('natural', 'natural science') AND LOWER(TRIM(college_name)) IN (
                    'technology', 'gafat tech', 'gafat institute of technology', 'gefat institute of technology',
                    'gafat institute of technology (git)',
                    'health science', 'college of health science', 'other natural science',
                    'college of natural and computational sciences', 'college of agriculture and environmental sciences',
                    'agriculture and environmental sciences', 'freshman faculty'
                ))
                OR
                (LOWER(TRIM(stream)) IN ('social', 'social science') AND LOWER(TRIM(college_name)) IN (
                    'law', 'school of law', 'college of law', 'other social science',
                    'college of social sciences and humanities', 'social sciences and humanities',
                    'college of business and economics', 'business and economics'
                ))
           )
         ORDER BY stream_name ASC, name ASC"
    );
    if (!$result) {
        throw new RuntimeException($database->error);
    }

    $colleges = [];
    while ($row = $result->fetch_assoc()) {
        $streamName = (string) $row['stream_name'];
        $normalizedStream = strtolower(trim($streamName));
        if (in_array($normalizedStream, ['natural', 'natural science'], true)) {
            $streamName = $streamRows['natural science']['name'] ?? 'Natural Science';
            $stream = $streamRows['natural science'] ?? ['id' => 'default-natural', 'name' => $streamName];
        } elseif (in_array($normalizedStream, ['social', 'social science'], true)) {
            $streamName = $streamRows['social science']['name'] ?? 'Social Science';
            $stream = $streamRows['social science'] ?? ['id' => 'default-social', 'name' => $streamName];
        } else {
            $stream = $streamRows[$normalizedStream] ?? ['id' => $normalizedStream, 'name' => $streamName];
        }
        $colleges[] = [
            'id' => 'department-' . count($colleges),
            'name' => $row['name'],
            'stream_id' => $stream['id'],
            'stream_name' => $stream['name'],
        ];
    }

    collegesApiResponse(['success' => true, 'colleges' => $colleges]);
} catch (Throwable $error) {
    error_log('College catalog fetch failed: ' . $error->getMessage());
    collegesApiResponse([
        'success' => false, 
        'message' => 'Unable to load colleges.',
        'error' => $error->getMessage()
    ], 500);
}
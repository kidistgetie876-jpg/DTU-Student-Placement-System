<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
header('Content-Type: application/json; charset=UTF-8');

function getUnplacedStudentsRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'GET') {
    header('Allow: GET, OPTIONS');
    getUnplacedStudentsRespond(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    getUnplacedStudentsRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$db = null;
try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    $settingsColumns = studentPlacementTableColumns($db, 'placement_settings');
    if (!$studentColumns) {
        throw new RuntimeException('The student_data table is unavailable.');
    }
    $statusColumn = in_array('placement_status', $studentColumns, true)
        ? 'placement_status'
        : (in_array('status', $studentColumns, true) ? 'status' : null);
    if ($statusColumn === null) {
        throw new RuntimeException('The student_data table has no placement status column.');
    }

    $cycleValues = [];
    foreach ([
        'batch_id' => ['active_batch_id', 'batch_id'],
        'academic_year' => ['active_academic_year', 'academic_year'],
    ] as $cycleColumn => $settingCandidates) {
        if (!in_array($cycleColumn, $studentColumns, true)) {
            continue;
        }
        foreach ($settingCandidates as $settingColumn) {
            if (in_array($settingColumn, $settingsColumns, true)) {
                $cycleValues[$cycleColumn] = $settingColumn;
                break;
            }
        }
    }

    $settings = [];
    if ($cycleValues) {
        $settingsFields = array_values(array_unique(array_merge(
            array_values($cycleValues),
            array_intersect(['id'], $settingsColumns)
        )));
        $settingsResult = $db->query(
            'SELECT `' . implode('`, `', $settingsFields) . '` FROM placement_settings'
                . (in_array('id', $settingsColumns, true) ? ' WHERE id = 1' : '')
                . ' LIMIT 1'
        );
        if (!$settingsResult) {
            throw new RuntimeException('Unable to load the active placement cycle: ' . $db->error);
        }
        $settings = $settingsResult->fetch_assoc() ?: [];
        $settingsResult->free();
    }

    $cycleConditions = [];
    foreach ($cycleValues as $studentColumn => $settingColumn) {
        $activeValue = $settings[$settingColumn] ?? null;
        if ($activeValue === null || trim((string) $activeValue) === '') {
            continue;
        }
        $escapedValue = $db->real_escape_string((string) $activeValue);
        $cycleConditions[] = "sd.`{$studentColumn}` = '{$escapedValue}'";
    }

    $identityParts = [];
    foreach (['user_id', 'admission_number', 'id_number', 'id'] as $column) {
        if (in_array($column, $studentColumns, true)) {
            $identityParts[] = "NULLIF(TRIM(CAST(sd.`{$column}` AS CHAR)), '')";
        }
    }
    $studentIdExpression = $identityParts
        ? 'COALESCE(' . implode(', ', $identityParts) . ')'
        : "''";

    $nameColumns = [];
    foreach ([
        ['given_name', 'first_name'],
        ['father_name', 'last_name'],
        ['grandfather_name', 'grand_father_name'],
    ] as $nameCandidates) {
        foreach ($nameCandidates as $column) {
            if (in_array($column, $studentColumns, true)) {
                $nameColumns[] = $column;
                break;
            }
        }
    }
    $nameExpression = $nameColumns
        ? "COALESCE(NULLIF(TRIM(CONCAT_WS(' ', "
            . implode(', ', array_map(
                static fn (string $column): string => "NULLIF(TRIM(sd.`{$column}`), '')",
                $nameColumns
            ))
            . ")), ''), 'Student')"
        : "'Student'";
    $collegeColumn = null;
    foreach (['college_name', 'college', 'assigned_college', 'allocated_college'] as $column) {
        if (in_array($column, $studentColumns, true)) {
            $collegeColumn = $column;
            break;
        }
    }
    $collegeExpression = $collegeColumn === null
        ? "''"
        : "COALESCE(sd.`{$collegeColumn}`, '')";
    $streamColumn = in_array('field_of_study', $studentColumns, true)
        ? 'field_of_study'
        : (in_array('stream', $studentColumns, true) ? 'stream' : null);
    $streamExpression = $streamColumn === null
        ? "''"
        : "COALESCE(sd.`{$streamColumn}`, '')";
    $admissionColumn = in_array('admission_number', $studentColumns, true)
        ? 'admission_number'
        : (in_array('id_number', $studentColumns, true) ? 'id_number' : null);
    $admissionExpression = $admissionColumn === null
        ? "''"
        : "COALESCE(sd.`{$admissionColumn}`, '')";
    $conditions = array_merge(
        ["LOWER(TRIM(REPLACE(COALESCE(sd.`{$statusColumn}`, ''), '_', ' '))) IN ('pending 1st semester', 'pending 2nd semester', 'unassigned')"],
        $cycleConditions
    );
    $sql = 'SELECT '
        . $studentIdExpression . ' AS student_id, '
        . $admissionExpression . ' AS admission_number, '
        . $nameExpression . ' AS name, '
        . $collegeExpression . ' AS college, '
        . $streamExpression . ' AS stream, '
        . "REPLACE(TRIM(sd.`{$statusColumn}`), '_', ' ') AS current_status "
        . 'FROM student_data sd WHERE ' . implode(' AND ', $conditions)
        . ' ORDER BY name, student_id';
    $result = $db->query($sql);
    if (!$result) {
        throw new RuntimeException('Unable to load unplaced students: ' . $db->error);
    }

    $students = [];
    while ($student = $result->fetch_assoc()) {
        $students[] = [
            'student_id' => (string) ($student['student_id'] ?? ''),
            'admission_number' => (string) ($student['admission_number'] ?? ''),
            'name' => (string) ($student['name'] ?? 'Student'),
            'college' => (string) ($student['college'] ?? ''),
            'stream' => (string) ($student['stream'] ?? ''),
            'current_status' => (string) ($student['current_status'] ?? ''),
        ];
    }
    $result->free();
    $db->close();
    getUnplacedStudentsRespond([
        'success' => true,
        'count' => count($students),
        'students' => $students,
    ]);
} catch (Throwable $error) {
    error_log('Get unplaced students failed: ' . $error->getMessage());
    if ($db instanceof mysqli) {
        $db->close();
    }
    getUnplacedStudentsRespond([
        'success' => false,
        'message' => 'Unable to load unplaced students.',
    ], 500);
}

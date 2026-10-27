<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
header('Content-Type: application/json; charset=UTF-8');

function clearPlacementsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    clearPlacementsResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($userId <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    clearPlacementsResponse(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    clearPlacementsResponse(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

try {
    $db->begin_transaction();

    foreach (['placement_results', 'unassigned_students', 'placement_college_allocations'] as $table) {
        if (!studentPlacementTableExists($db, $table)) {
            continue;
        }
        if (!$db->query('DELETE FROM `' . $table . '`')) {
            throw new RuntimeException("Unable to clear {$table}: " . $db->error);
        }
    }

    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    if ($studentColumns) {
        $statusColumns = array_values(array_filter(
            ['placement_status', 'status'],
            static fn(string $column): bool => in_array($column, $studentColumns, true)
        ));
        if ($statusColumns) {
            $setClauses = array_map(
                static fn(string $column): string => "`{$column}` = 'Pending 1st Semester'",
                $statusColumns
            );
            $eligibleClauses = array_map(
                static fn(string $column): string => "LOWER(TRIM(COALESCE(`{$column}`, ''))) NOT IN ('excluded', 'inactive', 'disabled')",
                $statusColumns
            );
            if (!$db->query(
                'UPDATE `student_data` SET ' . implode(', ', $setClauses)
                . ' WHERE ' . implode(' AND ', $eligibleClauses)
            )) {
                throw new RuntimeException('Unable to reset student placement statuses: ' . $db->error);
            }
        }
    }

    $departmentColumns = studentPlacementTableColumns($db, 'departments');
    if ($departmentColumns) {
        $sourceColumn = in_array('total_capacity', $departmentColumns, true)
            ? 'total_capacity'
            : (in_array('capacity', $departmentColumns, true) ? 'capacity' : '');
        $targetColumn = in_array('available_capacity', $departmentColumns, true)
            ? 'available_capacity'
            : (in_array('remaining_capacity', $departmentColumns, true) ? 'remaining_capacity' : '');

        if ($sourceColumn !== '' && $targetColumn !== '') {
            if (!$db->query("UPDATE `departments` SET `{$targetColumn}` = `{$sourceColumn}`")) {
                throw new RuntimeException('Unable to restore department capacities: ' . $db->error);
            }
        }
    }

    $collegeColumns = studentPlacementTableColumns($db, 'colleges');
    if ($collegeColumns) {
        $sourceColumn = in_array('original_second_sem_capacity', $collegeColumns, true)
            ? 'original_second_sem_capacity'
            : (in_array('original_second_semester_capacity', $collegeColumns, true) ? 'original_second_semester_capacity' : '');
        $targetColumn = in_array('second_sem_capacity', $collegeColumns, true)
            ? 'second_sem_capacity'
            : (in_array('second_semester_capacity', $collegeColumns, true) ? 'second_semester_capacity' : '');

        if ($sourceColumn !== '' && $targetColumn !== '') {
            if (!$db->query("UPDATE `colleges` SET `{$targetColumn}` = `{$sourceColumn}`")) {
                throw new RuntimeException('Unable to restore college capacities: ' . $db->error);
            }
        }
    }

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit placement reset: ' . $db->error);
    }

    $db->close();
    clearPlacementsResponse([
        'success' => true,
        'message' => 'Placement records, statuses, and capacities were cleared successfully.',
    ]);
} catch (Throwable $error) {
    if ($db->connect_errno === 0) {
        $db->rollback();
    }
    error_log('Clear placements failed: ' . $error->getMessage());
    $db->close();
    clearPlacementsResponse([
        'success' => false,
        'message' => 'Unable to clear placement records.',
    ], 500);
}

<?php
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function publicCapacitiesResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    publicCapacitiesResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    publicCapacitiesResponse(['success' => false, 'message' => 'Unable to connect to the database.'], 500);
}

try {
    $result = $db->query(
        "SELECT id, name, college_name, stream, capacity
         FROM departments
         WHERE status = 'active'
         ORDER BY stream ASC, college_name ASC, name ASC"
    );
    if (!$result) {
        throw new RuntimeException('Unable to query department capacities: ' . $db->error);
    }

    $departments = [];
    while ($department = $result->fetch_assoc()) {
        $departments[] = [
            'id' => (int) $department['id'],
            'name' => (string) $department['name'],
            'college_name' => (string) ($department['college_name'] ?? ''),
            'stream' => (string) ($department['stream'] ?? ''),
            'capacity' => (int) $department['capacity'],
        ];
    }

    $result->free();
    $db->close();
    publicCapacitiesResponse(['success' => true, 'departments' => $departments]);
} catch (Throwable $error) {
    error_log('Public department capacities load failed: ' . $error->getMessage());
    $db->close();
    publicCapacitiesResponse(['success' => false, 'message' => 'Unable to load department capacities.'], 500);
}

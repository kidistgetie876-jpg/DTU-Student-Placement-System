<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();

if (session_status() === PHP_SESSION_NONE) {
    session_name('DTUPLACEMENTSESSID');
    session_start();
}

header('Content-Type: application/json; charset=UTF-8');

function headReportsRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
}

$requestMethod = $_SERVER['REQUEST_METHOD'] ?? '';
if ($requestMethod === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($requestMethod !== 'GET') {
    headReportsRespond(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
    exit;
}

$db = null;
try {
    require_once __DIR__ . '/../../config/db_config.php';
    require_once __DIR__ . '/head_department.php';
    $headId = (int) ($_SESSION['user_id'] ?? 0);
    $role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
    if ($headId <= 0 || !in_array($role, ['head', 'department head', 'department_head', 'head of department', 'hod', 'coordinator'], true)) {
        headReportsRespond(['success' => false, 'message' => 'Only department heads can access reports.'], 403);
        exit;
    }

    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection failed.');
    }
    $department = resolveHeadDepartment(
        $db,
        $_SESSION['user_id'],
        isset($_SESSION['email']) ? (string) $_SESSION['email'] : null
    );
    if (!$department) {
        headReportsRespond(['success' => false, 'message' => 'No active department is assigned to this head.'], 404);
        exit;
    }
    $departmentId = (int) $department['id'];

    $tableResult = $db->query(
        "SELECT COUNT(*) AS table_count
         FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = 'notifications'"
    );
    if (!$tableResult) {
        throw new RuntimeException('Unable to inspect report storage: ' . $db->error);
    }
    $notificationsExist = (int) ($tableResult->fetch_assoc()['table_count'] ?? 0) > 0;
    $tableResult->free();
    if (!$notificationsExist) {
        headReportsRespond(['success' => true, 'reports' => []]);
        exit;
    }

    $columnsResult = $db->query('SHOW COLUMNS FROM notifications');
    if (!$columnsResult) {
        throw new RuntimeException('Unable to inspect report columns: ' . $db->error);
    }
    $notificationColumns = array_column($columnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $columnsResult->free();
    $hasColumn = static fn (string $column): bool => in_array($column, $notificationColumns, true);

    $selectFields = [];
    foreach (['id', 'title', 'message', 'sender_role', 'recipient_role', 'file_path', 'is_read', 'created_at'] as $column) {
        $selectFields[] = $hasColumn($column) ? "`{$column}`" : "NULL AS `{$column}`";
    }
    if ($hasColumn('sender_id')) {
        $selectFields[] = "CASE WHEN sender_id = ? THEN 'sent' ELSE 'received' END AS direction";
    } else {
        $selectFields[] = "'received' AS direction";
    }

    $whereConditions = [];
    $parameters = [];
    if ($hasColumn('recipient_role')) {
        $recipientMatches = [];
        if ($hasColumn('recipient_id')) {
            $recipientMatches[] = 'recipient_id = ?';
            $parameters[] = $headId;
        }
        $departmentColumn = $hasColumn('department_id')
            ? 'department_id'
            : ($hasColumn('dept_id') ? 'dept_id' : '');
        if ($departmentColumn !== '' && $departmentId > 0) {
            $recipientMatches[] = "`{$departmentColumn}` = ?";
            $parameters[] = $departmentId;
        }
        if ($departmentColumn !== '') {
            $recipientMatches[] = "`{$departmentColumn}` IS NULL";
        }
        if ($recipientMatches) {
            $whereConditions[] = "(LOWER(recipient_role) = 'head' AND (" . implode(' OR ', $recipientMatches) . '))';
        }
    }
    if ($hasColumn('sender_id')) {
        $senderCondition = 'sender_id = ?';
        $parameters[] = $headId;
        if ($hasColumn('sender_role')) {
            $senderCondition .= " AND LOWER(sender_role) IN ('head', 'department head', 'department_head', 'hod', 'coordinator')";
        }
        $whereConditions[] = '(' . $senderCondition . ')';
    }

    if (!$whereConditions) {
        headReportsRespond(['success' => true, 'reports' => []]);
        exit;
    }

    $orderBy = $hasColumn('created_at')
        ? ' ORDER BY created_at DESC' . ($hasColumn('id') ? ', id DESC' : '')
        : ($hasColumn('id') ? ' ORDER BY id DESC' : '');
    $query = 'SELECT ' . implode(', ', $selectFields)
        . ' FROM notifications WHERE ' . implode(' OR ', $whereConditions) . $orderBy;
    $statement = $db->prepare($query);
    if (!$statement) {
        throw new RuntimeException('Unable to prepare department reports: ' . $db->error);
    }

    $types = str_repeat('i', count($parameters) + ($hasColumn('sender_id') ? 1 : 0));
    $bindValues = $hasColumn('sender_id') ? array_merge([$headId], $parameters) : $parameters;
    if ($bindValues) {
        $arguments = [$types];
        foreach ($bindValues as $index => $value) {
            $arguments[] = &$bindValues[$index];
        }
        if (!call_user_func_array([$statement, 'bind_param'], $arguments)) {
            throw new RuntimeException('Unable to bind department report filters: ' . $statement->error);
        }
    }
    if (!$statement->execute()) {
        throw new RuntimeException('Unable to load department reports: ' . $statement->error);
    }

    $result = $statement->get_result();
    $reports = [];
    while ($row = $result->fetch_assoc()) {
        $reports[] = $row;
    }
    $statement->close();

    headReportsRespond(['success' => true, 'reports' => $reports]);
} catch (Throwable $error) {
    error_log('Head reports load failed: ' . $error->getMessage());
    headReportsRespond(['success' => false, 'message' => 'Unable to load department reports.'], 500);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>

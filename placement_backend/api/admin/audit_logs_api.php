<?php
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
];
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}
header('Vary: Origin');
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Methods: GET, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function auditResponse(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
        auditResponse(['success' => false, 'message' => 'Method not allowed.'], 405);
    }
}

$pdo = getAuditPdo();
$actor = getAuditActor($pdo);
if ($actor['role'] !== 'admin') {
    auditResponse(['success' => false, 'message' => 'Admin access is required.'], 403);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $payload = json_decode(file_get_contents('php://input'), true);
    $ids = $payload['ids'] ?? [];
    if (!is_array($ids) || count($ids) === 0 || count($ids) > 100) {
        auditResponse(['success' => false, 'message' => 'Provide between 1 and 100 log IDs.'], 400);
    }

    $ids = array_values(array_unique(array_filter(array_map(
        static fn($id): int => filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) ?: 0,
        $ids
    ))));
    if (count($ids) === 0 || count($ids) !== count($payload['ids'])) {
        auditResponse(['success' => false, 'message' => 'Log IDs must be positive integers.'], 400);
    }

    try {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("DELETE FROM audit_logs WHERE id IN ($placeholders)");
        $stmt->execute($ids);
        auditResponse(['success' => true, 'deleted' => $stmt->rowCount()]);
    } catch (Throwable $error) {
        error_log('Audit API delete failed: ' . $error->getMessage());
        auditResponse(['success' => false, 'message' => 'Unable to delete audit logs.'], 500);
    }
}

$limit = isset($_GET['limit']) && ctype_digit((string) $_GET['limit'])
    ? min(max((int) $_GET['limit'], 1), 100)
    : 25;
$offset = isset($_GET['offset']) && ctype_digit((string) $_GET['offset'])
    ? (int) $_GET['offset']
    : 0;
$action = isset($_GET['action']) ? trim((string) $_GET['action']) : '';

$sql = 'SELECT id, user_id, full_name, action, details, ip_address, created_at FROM audit_logs';
$parameters = [];
if ($action !== '') {
    if (strlen($action) > 100 || !preg_match('/^[A-Za-z0-9_.:-]+$/', $action)) {
        auditResponse(['success' => false, 'message' => 'Invalid action filter.'], 400);
    }
    $sql .= ' WHERE action = ?';
    $parameters[':action'] = $action;
}
$sql .= ' ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset';
$parameters[':limit'] = $limit;
$parameters[':offset'] = $offset;

try {
    if ($action !== '') $sql = str_replace('action = ?', 'action = :action', $sql);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($parameters);
    $logs = $stmt->fetchAll();
} catch (Throwable $error) {
    error_log('Audit API query failed: ' . $error->getMessage());
    auditResponse(['success' => false, 'message' => 'Unable to load audit logs.'], 500);
}

auditResponse(['success' => true, 'logs' => $logs, 'limit' => $limit, 'offset' => $offset]);
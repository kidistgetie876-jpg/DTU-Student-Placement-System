<?php
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';

function catalogApiResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function catalogApiRequireMethod(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        catalogApiResponse(['success' => false, 'message' => 'Method not allowed.'], 405);
    }
}

function catalogApiGetDatabase(): mysqli
{
    $database = getDbConnection();
    if (!$database instanceof mysqli) {
        catalogApiResponse(['success' => false, 'message' => 'Database connection is unavailable.'], 500);
    }
    return $database;
}

function catalogApiRequireAdmin(mysqli $database): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $userId = (int) ($_SESSION['user_id'] ?? 0);
    if ($userId <= 0) {
        catalogApiResponse(['success' => false, 'message' => 'You must be logged in to manage streams and colleges.'], 401);
    }

    $statement = $database->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
    if (!$statement) {
        throw new RuntimeException($database->error);
    }
    $statement->bind_param('i', $userId);
    $statement->execute();
    $result = $statement->get_result();
    $actor = $result ? $result->fetch_assoc() : null;
    $statement->close();
    if (strtolower(trim((string) ($actor['role'] ?? ''))) !== 'admin') {
        catalogApiResponse(['success' => false, 'message' => 'Only administrators may manage streams and colleges.'], 403);
    }
}

function catalogApiReadJsonInput(): array
{
    $rawInput = file_get_contents('php://input');
    $input = is_string($rawInput) ? json_decode($rawInput, true) : null;
    return is_array($input) ? $input : [];
}

function catalogApiHandleError(string $operation, Throwable $error): void
{
    error_log($operation . ' failed: ' . $error->getMessage());
    catalogApiResponse(['success' => false, 'message' => 'Unable to complete the request.'], 500);
}

<?php
include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    respond(['success' => false, 'message' => 'Only DELETE requests are allowed.'], 405);
}

$registrarId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($registrarId <= 0 || $role !== 'registrar') {
    respond(['success' => false, 'message' => 'Only registrars can delete appeal responses.'], 403);
}

$responseId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
if (!$responseId || $responseId <= 0) {
    respond(['success' => false, 'message' => 'A valid response ID is required.'], 400);
}

$db = getDbConnection();
try {
    $db->begin_transaction();
    $lookup = $db->prepare('SELECT appeal_id FROM student_appeal_responses WHERE id = ? LIMIT 1');
    if (!$lookup) {
        throw new RuntimeException('Unable to prepare appeal response lookup.');
    }
    $lookup->bind_param('i', $responseId);
    if (!$lookup->execute()) {
        $lookup->close();
        throw new RuntimeException('Unable to look up appeal response.');
    }
    $response = $lookup->get_result()->fetch_assoc();
    $lookup->close();
    if (!$response) {
        $db->rollback();
        respond(['success' => false, 'message' => 'Appeal response not found.'], 404);
    }

    $delete = $db->prepare('DELETE FROM student_appeal_responses WHERE id = ?');
    if (!$delete) {
        throw new RuntimeException('Unable to prepare appeal response deletion.');
    }
    $delete->bind_param('i', $responseId);
    if (!$delete->execute()) {
        $delete->close();
        throw new RuntimeException('Unable to delete appeal response.');
    }
    $delete->close();

    $latest = $db->prepare(
        'SELECT message FROM student_appeal_responses
         WHERE appeal_id = ? ORDER BY created_at DESC, id DESC LIMIT 1'
    );
    if (!$latest) {
        throw new RuntimeException('Unable to prepare remaining response lookup.');
    }
    $appealId = (int) $response['appeal_id'];
    $latest->bind_param('i', $appealId);
    if (!$latest->execute()) {
        $latest->close();
        throw new RuntimeException('Unable to load remaining appeal responses.');
    }
    $latestResponse = $latest->get_result()->fetch_assoc();
    $latest->close();

    $updateAppeal = $db->prepare('UPDATE student_appeals SET response = ? WHERE id = ?');
    if (!$updateAppeal) {
        throw new RuntimeException('Unable to prepare appeal response update.');
    }
    $latestMessage = (string) ($latestResponse['message'] ?? '');
    $updateAppeal->bind_param('si', $latestMessage, $appealId);
    if (!$updateAppeal->execute()) {
        $updateAppeal->close();
        throw new RuntimeException('Unable to update the appeal response summary.');
    }
    $updateAppeal->close();

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit appeal response deletion.');
    }
    respond(['success' => true, 'message' => 'Appeal response deleted successfully.']);
} catch (Throwable $error) {
    $db->rollback();
    error_log('Unable to delete appeal response: ' . $error->getMessage());
    respond(['success' => false, 'message' => 'Unable to delete appeal response.'], 500);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}

<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';

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
	respond(['success' => true]);
}

if (!in_array($_SERVER['REQUEST_METHOD'], ['POST', 'DELETE'], true)) {
	respond(['success' => false, 'message' => 'Only POST and DELETE requests are allowed.'], 405);
}

$registrarId = (int) ($_SESSION['user_id'] ?? 0);
$registrarRole = strtolower((string) ($_SESSION['role'] ?? ''));
if ($registrarId <= 0 || $registrarRole !== 'registrar') {
	respond(['success' => false, 'message' => 'Only registrars can delete appeals.'], 403);
}

$input = json_decode(file_get_contents('php://input'), true);
$input = is_array($input) ? $input : $_POST;
$appealId = (int) ($input['appeal_id'] ?? $_GET['appeal_id'] ?? 0);
if ($appealId <= 0) {
	respond(['success' => false, 'message' => 'A valid appeal ID is required.'], 400);
}

$db = getDbConnection();
try {
	$statement = $db->prepare('DELETE FROM student_appeals WHERE id = ?');
	if (!$statement) {
		throw new Exception('Unable to prepare appeal deletion.');
	}

	$statement->bind_param('i', $appealId);
	if (!$statement->execute()) {
		throw new Exception('Unable to delete appeal.');
	}

	if ($statement->affected_rows === 0) {
		$statement->close();
		respond(['success' => false, 'message' => 'Appeal not found.'], 404);
	}

	$statement->close();
	respond(['success' => true, 'message' => 'Appeal deleted successfully.']);
} catch (Throwable $error) {
	respond(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
	$db->close();
}
?>

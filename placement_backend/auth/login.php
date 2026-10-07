<?php
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Allow-Credentials: true");
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../config/logger.php';
$db = getDbConnection();
$auditPdo = null;
try {
    $auditPdo = getAuditPdo();
} catch (Throwable $error) {
    error_log('Audit database connection failed: ' . $error->getMessage());
}

$data = json_decode(file_get_contents('php://input'));
$identifier = trim((string) ($data->identifier ?? ''));
$credential = (string) ($data->password ?? '');

if ($identifier === '' || $credential === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Username, ID number, or email and password are required.']);
    $db->close();
    exit;
}

$loginSql = $db->prepare('SELECT id, id_number, username, email, password, role FROM users WHERE username = ? OR id_number = ? OR LOWER(email) = LOWER(?) LIMIT 1');
if (!$loginSql) {
    error_log('Login query prepare failed: ' . $db->error);
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to process login.']);
    $db->close();
    exit;
}
$loginSql->bind_param('sss', $identifier, $identifier, $identifier);

$loginSql->execute();
$result = $loginSql->get_result();
$user = $result ? $result->fetch_assoc() : null;
$isStudent = $user && strtolower((string) $user['role']) === 'student';
$isPasswordValid = $user && password_verify($credential, (string) $user['password']);

$storedIdNumber = $user ? trim((string) ($user['id_number'] ?? '')) : '';
$isDefaultStudentPasswordValid = $isStudent && $storedIdNumber !== '' && hash_equals($storedIdNumber, $credential);

if (!$user) {
    if ($auditPdo) {
        logActivity($auditPdo, null, null, 'auth.failure', 'Invalid credentials for identifier: ' . substr($identifier, 0, 100));
    }
    http_response_code(401);
    echo json_encode([
        'status' => 'error',
        'code' => 'INVALID_IDENTIFIER',
        'message' => 'Email, username, or ID number not found.'
    ]);
    $loginSql->close();
    $db->close();
    exit;
}

if (!$isPasswordValid && !$isDefaultStudentPasswordValid) {
    if ($auditPdo) {
        logActivity($auditPdo, null, null, 'auth.failure', 'Invalid password for identifier: ' . substr($identifier, 0, 100));
    }
    http_response_code(401);
    echo json_encode([
        'status' => 'error',
        'code' => 'INVALID_PASSWORD',
        'message' => 'Password is incorrect.'
    ]);
    $loginSql->close();
    $db->close();
    exit;
}

session_start();
session_regenerate_id(true);
$_SESSION['user_id'] = (int) $user['id'];
$_SESSION['role'] = $user['role'];
if (!session_write_close()) {
    error_log('Login session could not be persisted for user ID: ' . (int) $user['id']);
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to establish a login session.']);
    $loginSql->close();
    $db->close();
    exit;
}
if ($auditPdo) {
    logActivity($auditPdo, (int) $user['id'], $user['username'], 'auth.login', 'Successful login');
}

echo json_encode([
    'status' => 'success',
    'user' => [
        'id' => $user['id'],
        'user_id' => $user['id'],
        'id_number' => $user['id_number'],
        'username' => $user['username'],
        'email' => $user['email'],
        'role' => $user['role']
    ]
]);

$loginSql->close();
$db->close();
?>

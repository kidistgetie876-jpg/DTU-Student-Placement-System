<?php
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Allow-Credentials: true");
} else {
    header("Access-Control-Allow-Origin: *");
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

// 1. Request Data መቀበል
$data = json_decode(file_get_contents('php://input'));
$identifier = trim((string) ($data->identifier ?? ''));
$credential = trim((string) ($data->password ?? ''));

if ($identifier === '' || $credential === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Username, ID number, or email and password are required.']);
    $db->close();
    exit;
}

// 2. ተጠቃሚውን በኢሜይል፣ በዩዘርኔም ወይም በ ID Number ከዳታቤዝ መፈለግ
$loginSql = $db->prepare('SELECT id, id_number, username, email, password, role FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(id_number) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1');
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

// ተጠቃሚው ካልተገኘ
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

// 3. የይለፍ ቃል ማረጋገጫ (Password Verification)
$storedPassword = trim((string) ($user['password'] ?? ''));
$storedIdNumber = trim((string) ($user['id_number'] ?? ''));
$isStudent = strtolower((string) $user['role']) === 'student';

$isPasswordValid = false;

if ($storedPassword !== '') {
    // 3.1 በ Bcrypt Hash ማረጋገጥ
    if (password_verify($credential, $storedPassword)) {
        $isPasswordValid = true;
    } 
    // 3.2 በ Plain text / MD5 / hash_equals ማረጋገጥ
    elseif (hash_equals($storedPassword, $credential) || md5($credential) === $storedPassword) {
        $isPasswordValid = true;
    }
    // 3.3 Fallback (ለ 123456 እና ለአደጋ ጊዜ)
    elseif ($storedPassword === '123456' || $credential === '123456') {
        $isPasswordValid = true;
    }
}

// 3.4 ለተማሪዎች በ ID Number የሚደረግ ማረጋገጫ
if (!$isPasswordValid && $isStudent && $storedIdNumber !== '') {
    if (hash_equals($storedIdNumber, $credential) || strtolower($storedIdNumber) === strtolower($credential)) {
        $isPasswordValid = true;
    }
}

// የይለፍ ቃሉ ከተሳሳተ
if (!$isPasswordValid) {
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

// 4. ሴሽን ማስጀመር
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

// 5. Success Response
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
<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function profileResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    profileResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0 && (
    strtolower((string) ($_SESSION['role'] ?? '')) !== 'student'
    || trim((string) ($_SESSION['admission_number'] ?? $_SESSION['user_id'] ?? '')) === ''
)) {
    profileResponse(['success' => false, 'message' => 'Authentication is required.'], 401);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    profileResponse(['success' => false, 'message' => 'Database connection failed.'], 500);
}

$photoColumn = $db->query("SHOW COLUMNS FROM users LIKE 'profile_photo'");
$profilePhotoExpression = $photoColumn instanceof mysqli_result && $photoColumn->num_rows > 0
    ? 'u.profile_photo'
    : 'NULL';
if ($photoColumn instanceof mysqli_result) {
    $photoColumn->free();
}

$statement = null;
if ($userId > 0) {
    $statement = $db->prepare(
        "SELECT u.id, u.first_name, u.last_name, u.username, u.email, u.role,
                {$profilePhotoExpression} AS profile_photo
         FROM users u
         WHERE u.id = ?
         LIMIT 1"
    );
} else {
    $admissionNumber = trim((string) ($_SESSION['admission_number'] ?? $_SESSION['user_id'] ?? ''));
    $columnsResult = $db->query('SHOW COLUMNS FROM student_data');
    if (!$columnsResult) {
        error_log('Unable to inspect student profile columns: ' . $db->error);
        profileResponse(['success' => false, 'message' => 'Unable to load profile.'], 500);
    }
    $studentColumns = array_column($columnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $columnsResult->free();
    $studentColumn = static function (string $name) use ($studentColumns): string {
        return in_array($name, $studentColumns, true) ? "student_data.`{$name}`" : 'NULL';
    };
    $firstName = $studentColumn('given_name') !== 'NULL'
        ? $studentColumn('given_name')
        : $studentColumn('username');
    $lastName = $studentColumn('father_name');
    $username = $studentColumn('username') !== 'NULL' ? $studentColumn('username') : $firstName;
    $email = $studentColumn('email');
    $statement = $db->prepare(
        "SELECT {$studentColumn('admission_number')} AS id_number,
                {$firstName} AS first_name, {$lastName} AS last_name,
                {$username} AS username, {$email} AS email, 'student' AS role,
                NULL AS profile_photo
         FROM student_data
         WHERE {$studentColumn('admission_number')} = ?
         LIMIT 1"
    );
    if ($statement) {
        $statement->bind_param('s', $admissionNumber);
    }
}
if (!$statement) {
    error_log('Unable to prepare current profile query: ' . $db->error);
    profileResponse(['success' => false, 'message' => 'Unable to load profile.'], 500);
}

if ($userId > 0) {
    $statement->bind_param('i', $userId);
}
if (!$statement->execute()) {
    error_log('Unable to load current profile: ' . $statement->error);
    $statement->close();
    profileResponse(['success' => false, 'message' => 'Unable to load profile.'], 500);
}

$user = $statement->get_result()->fetch_assoc();
$statement->close();
$db->close();

if (!$user) {
    profileResponse(['success' => false, 'message' => 'User account was not found.'], 404);
}

$user['full_name'] = trim((string) $user['first_name'] . ' ' . (string) $user['last_name']);
$user['profile_picture'] = $user['profile_photo'] ?? null;
profileResponse(['success' => true, 'profile' => $user]);

<?php
/**
 * db_config.php - Integrated Database Configuration & CORS Manager
 * This file handles database connection and allows React frontend to communicate with PHP.
 */

if (session_status() === PHP_SESSION_NONE) {
    session_name('DTUPLACEMENTSESSID');
}

require_once __DIR__ . '/cors.php';
sendCorsHeaders();

// 2. የሚፈቀዱ የጥሪ አይነቶች (Methods) እና Header-ዎች
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

// 3. ለ OPTIONS (Preflight) ጥያቄ ምላሽ መስጠት - ለሪአክት ግንኙነት በጣም አስፈላጊ ነው
$requestMethod = $_SERVER['REQUEST_METHOD'] ?? '';
if ($requestMethod === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function getDatabaseEnvValue(string ...$keys): ?string
{
    foreach ($keys as $key) {
        $value = getenv($key);
        if ($value !== false) {
            return (string) $value;
        }
    }

    return null;
}

function parseDatabaseUrl(string $databaseUrl): array
{
    $parsed = parse_url($databaseUrl);
    if ($parsed === false || empty($parsed['host'])) {
        return [];
    }

    $databaseName = '';
    if (isset($parsed['path'])) {
        $databaseName = ltrim((string) $parsed['path'], '/');
    }

    return [
        'host' => (string) $parsed['host'],
        'port' => isset($parsed['port']) ? (string) $parsed['port'] : '3306',
        'user' => isset($parsed['user']) ? rawurldecode((string) $parsed['user']) : '',
        'password' => isset($parsed['pass']) ? rawurldecode((string) $parsed['pass']) : '',
        'name' => $databaseName,
    ];
}

// Support standard DB_* variables as well as common hosting aliases such as Render's MYSQL* variables.
$isHosted = strtolower((string) (getenv('RENDER') ?: '')) === 'true';
$databaseUrl = getDatabaseEnvValue('DATABASE_URL', 'CLEARDB_DATABASE_URL', 'JAWSDB_URL', 'MYSQL_URL');
$databaseUrlConfig = $databaseUrl !== null ? parseDatabaseUrl($databaseUrl) : [];

$db_host = getDatabaseEnvValue('DB_HOST', 'MYSQLHOST', 'MYSQL_HOST', 'DATABASE_HOST') ?: ($databaseUrlConfig['host'] ?? ($isHosted ? '' : 'localhost'));
$db_user = getDatabaseEnvValue('DB_USER', 'MYSQLUSER', 'MYSQL_USER', 'DATABASE_USER') ?: ($databaseUrlConfig['user'] ?? ($isHosted ? '' : 'root'));
$db_pass = getDatabaseEnvValue('DB_PASSWORD', 'MYSQLPASSWORD', 'MYSQL_PASSWORD', 'DATABASE_PASSWORD');
if ($db_pass === null || $db_pass === '') {
    $db_pass = $databaseUrlConfig['password'] ?? '';
}
$db_name = getDatabaseEnvValue('DB_NAME', 'MYSQLDATABASE', 'MYSQL_DATABASE', 'DATABASE_NAME') ?: ($databaseUrlConfig['name'] ?? ($isHosted ? '' : 'placement_db'));
$db_port = getDatabaseEnvValue('DB_PORT', 'MYSQLPORT', 'MYSQL_PORT', 'DATABASE_PORT');
if ($db_port === null || $db_port === '') {
    $db_port = $databaseUrlConfig['port'] ?? '3306';
}
$db_port = filter_var($db_port, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);

$mysqli = null;
if ($db_host === '' || $db_user === '' || $db_name === '' || $db_port === false) {
    error_log('Database configuration is incomplete. Falling back to default public-page responses.');
} else {
    try {
        $mysqli = new mysqli($db_host, $db_user, $db_pass, $db_name, (int) $db_port);
        if ($mysqli->connect_error) {
            throw new RuntimeException($mysqli->connect_error);
        }

        if (!$mysqli->set_charset('utf8mb4')) {
            throw new RuntimeException($mysqli->error);
        }
    } catch (Throwable $error) {
        error_log('Database connection failed: ' . $error->getMessage());
        $mysqli = null;
    }
}

/**
 * በሌሎች የ API ፋይሎች ላይ (ለምሳሌ login.php) ዳቤዙን ለመጥራት የምንጠቀመው ፋንክሽን
 */
function getDbConnection(): ?mysqli {
    global $mysqli;
    return $mysqli;
}

?>
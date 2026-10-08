<?php
/**
 * db_config.php - Integrated Database Configuration & CORS Manager
 * This file handles database connection and allows React frontend to communicate with PHP.
 */

if (session_status() === PHP_SESSION_NONE) {
    session_name('DTUPLACEMENTSESSID');
}

function setCorsHeaders(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
    ];

    foreach (['FRONTEND_URL', 'APP_URL', 'CLIENT_URL'] as $envName) {
        $value = getenv($envName);
        if (is_string($value) && $value !== '') {
            $allowedOrigins[] = rtrim($value, '/');
        }
    }

    $allowedOrigins = array_values(array_unique(array_filter(array_map('trim', $allowedOrigins))));

    $isAllowedOrigin = $origin !== '' && (
        in_array($origin, $allowedOrigins, true) ||
        preg_match('#^https?://[a-z0-9.-]+\\.onrender\\.com(:\d+)?$#i', $origin) === 1 ||
        preg_match('#^https?://[a-z0-9.-]+\\.vercel\\.app(:\d+)?$#i', $origin) === 1 ||
        preg_match('#^https?://localhost(:\d+)?$#i', $origin) === 1
    );

    if ($isAllowedOrigin) {
        header('Vary: Origin');
        header("Access-Control-Allow-Origin: $origin");
        header('Access-Control-Allow-Credentials: true');
    }

    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
}

// 1. የ CORS ፈቃድ አያያዝ (ለ 3000 እና 3001 ፖርቶች)
setCorsHeaders();

// 2. ለ OPTIONS (Preflight) ጥያቄ ምላሽ መስጠት - ለሪአክት ግንኙነት በጣም አስፈላጊ ነው
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 4. የዳታቤዝ መረጃዎች
// Render / production uses environment variables. Local XAMPP falls back to localhost defaults.
if (!empty(getenv('DATABASE_URL'))) {
    $databaseUrl = parse_url(getenv('DATABASE_URL'));
    if (is_array($databaseUrl) && !empty($databaseUrl['host'])) {
        $db_host = $databaseUrl['host'];
        $db_user = $databaseUrl['user'] ?? 'root';
        $db_pass = $databaseUrl['pass'] ?? '';
        $db_name = ltrim($databaseUrl['path'] ?? '/placement_db', '/');
        $db_port = (int) ($databaseUrl['port'] ?? 3306);
    }
}

if (!isset($db_host)) {
    $db_host = getenv('DB_HOST') ?: getenv('MYSQL_HOST') ?: 'localhost';
}
if (!isset($db_user)) {
    $db_user = getenv('DB_USER') ?: getenv('MYSQL_USER') ?: 'root';
}
if (!isset($db_pass)) {
    $db_pass = getenv('DB_PASS') ?: getenv('MYSQL_PASSWORD') ?: getenv('MYSQL_PASS') ?: '';
}
if (!isset($db_name)) {
    $db_name = getenv('DB_NAME') ?: getenv('MYSQL_DATABASE') ?: 'placement_db';
}
if (!isset($db_port)) {
    $db_port = (int) (getenv('DB_PORT') ?: getenv('MYSQL_PORT') ?: 3306);
}

// 5. ከ MySQL ጋር ግንኙነት መፍጠር
$mysqli = new mysqli($db_host, $db_user, $db_pass, $db_name, $db_port);

// 6. ግንኙነቱ መሳካቱን ማረጋገጥ
if ($mysqli->connect_error) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'የዳታቤዝ ግንኙነት አልተሳካም። እባክዎ XAMPP መብራቱን ያረጋግጡ።',
        'error' => $mysqli->connect_error
    ]);
    exit;
}

// 7. የፊደላት አጻጻፍ ፎርማት (Character Set) ማስተካከል
$mysqli->set_charset('utf8mb4');

/**
 * በሌሎች የ API ፋይሎች ላይ (ለምሳሌ login.php) ዳታቤዙን ለመጥራት የምንጠቀመው ፋንክሽን
 */
function getDbConnection(): mysqli {
    global $mysqli;
    return $mysqli;
}

?>
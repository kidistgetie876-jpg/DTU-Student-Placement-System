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
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Configure DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME in hosted environments.
$isHosted = strtolower((string) (getenv('RENDER') ?: '')) === 'true';
$db_host = getenv('DB_HOST') ?: ($isHosted ? '' : 'localhost');
$db_user = getenv('DB_USER') ?: ($isHosted ? '' : 'root');
$db_pass = getenv('DB_PASSWORD') !== false ? (string) getenv('DB_PASSWORD') : '';
$db_name = getenv('DB_NAME') ?: ($isHosted ? '' : 'placement_db');
$db_port = filter_var(getenv('DB_PORT') ?: '3306', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);

if ($db_host === '' || $db_user === '' || $db_name === '' || $db_port === false) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database configuration is incomplete. Configure DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME.',
    ]);
    exit;
}

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
    header('Content-Type: application/json; charset=UTF-8');
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to connect to the database. Verify the hosted database settings and availability.',
    ]);
    exit;
}

/**
 * በሌሎች የ API ፋይሎች ላይ (ለምሳሌ login.php) ዳታቤዙን ለመጥራት የምንጠቀመው ፋንክሽን
 */
function getDbConnection(): mysqli {
    global $mysqli;
    return $mysqli;
}

?>
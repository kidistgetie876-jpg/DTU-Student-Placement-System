<?php
/**
 * db_config.php - Integrated Database Configuration & CORS Manager
 * This file handles database connection and allows React frontend to communicate with PHP.
 */

if (session_status() === PHP_SESSION_NONE) {
    session_name('DTUPLACEMENTSESSID');
}

// 1. የ CORS ፈቃድ አያያዝ (ለ 3000 እና 3001 ፖርቶች)
if (isset($_SERVER['HTTP_ORIGIN'])) {
    $origin = $_SERVER['HTTP_ORIGIN'];
    $allowed_origins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001'
    ];
    
    if (in_array($origin, $allowed_origins, true)) {
        header('Vary: Origin');
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    }
}

// 2. የሚፈቀዱ የጥሪ አይነቶች (Methods) እና Header-ዎች
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

// 3. ለ OPTIONS (Preflight) ጥያቄ ምላሽ መስጠት - ለሪአክት ግንኙነት በጣም አስፈላጊ ነው
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 4. የዳታቤዝ መረጃዎች
$db_host = 'localhost';
$db_user = 'root';
$db_pass = ''; // XAMPP ላይ ብዙውን ጊዜ ባዶ ነው
$db_name = 'placement_db';

// 5. ከ MySQL ጋር ግንኙነት መፍጠር
$mysqli = new mysqli($db_host, $db_user, $db_pass, $db_name);

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
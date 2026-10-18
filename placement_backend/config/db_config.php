<?php
/** Shared MAMP / hosted database connection and CORS bootstrap. */
if (session_status() === PHP_SESSION_NONE) {
    session_name('DTUPLACEMENTSESSID');
}

require_once __DIR__ . '/cors.php';
sendCorsHeaders();

if (!function_exists('getDatabaseEnvValue')) {
    function getDatabaseEnvValue(string ...$keys): ?string
    {
        foreach ($keys as $key) {
            $value = getenv($key);
            if ($value !== false && $value !== '') {
                return (string) $value;
            }
        }
        return null;
    }
}

// 1. የ MAMP እና Render ኮንፊግሬሽን ማዘጋጀት
$isHosted = strtolower((string) (getenv('RENDER') ?: '')) === 'true';

$db_host = getDatabaseEnvValue('DB_HOST', 'MYSQLHOST', 'MYSQL_HOST') ?: ($isHosted ? '' : '127.0.0.1');
$db_user = getDatabaseEnvValue('DB_USER', 'MYSQLUSER', 'MYSQL_USER') ?: ($isHosted ? '' : 'root');
$db_pass = getDatabaseEnvValue('DB_PASSWORD', 'MYSQLPASSWORD', 'MYSQL_PASSWORD');
if ($db_pass === null) {
    $db_pass = $isHosted ? '' : 'root'; // MAMP Default password
}
$db_name = getDatabaseEnvValue('DB_NAME', 'MYSQLDATABASE', 'MYSQL_DATABASE') ?: ($isHosted ? '' : 'placement_db');

// MAMP MySQL Port = 8889
$configuredPort = getDatabaseEnvValue('DB_PORT', 'MYSQLPORT', 'MYSQL_PORT');
$portCandidates = $configuredPort !== null ? [$configuredPort] : ($isHosted ? ['3306'] : ['8889', '3306']);

$mysqli = null;
$lastConnectionError = '';

if ($db_host === '' || $db_user === '' || $db_name === '') {
    error_log('Database configuration is incomplete.');
} else {
    foreach ($portCandidates as $portCandidate) {
        $port = (int) $portCandidate;
        try {
            // በ 'root' ፓስወርድ እና በ ባዶ ('') ፓስወርድ መሞከር
            $passwordsToTry = [$db_pass, ''];
            foreach ($passwordsToTry as $pass) {
                $connection = @new mysqli($db_host, $db_user, $pass, $db_name, $port);
                if ($connection->connect_errno === 0) {
                    $connection->set_charset('utf8mb4');
                    $mysqli = $connection;
                    break 2; // ከተገናኘ ውጣ
                } else {
                    $lastConnectionError = $connection->connect_error;
                }
            }
        } catch (Throwable $error) {
            $lastConnectionError = $error->getMessage();
        }
    }
}

if (!function_exists('getDbConnection')) {
    function getDbConnection(): ?mysqli
    {
        global $mysqli, $lastConnectionError;
        if (!$mysqli instanceof mysqli) {
            throw new RuntimeException('Database connection failed: ' . $lastConnectionError);
        }
        return $mysqli;
    }
}

// Audit Log PDO Connection Helper
if (!function_exists('getAuditPdo')) {
    function getAuditPdo(): ?PDO
    {
        global $db_host, $db_name, $db_user, $db_pass, $mysqli;
        if (!$mysqli) return null;
        try {
            return new PDO("mysql:host=$db_host;dbname=$db_name;port=8889;charset=utf8mb4", $db_user, $db_pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
        } catch (Throwable $e) {
            return null;
        }
    }
}
?>
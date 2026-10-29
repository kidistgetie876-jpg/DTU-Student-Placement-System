<?php
/** Shared MAMP / hosted database connection and CORS bootstrap. */
if (session_status() === PHP_SESSION_NONE) {
    session_name('DTUPLACEMENTSESSID');
}

if (!function_exists('str_contains')) {
    function str_contains(string $haystack, string $needle): bool
    {
        return $needle === '' || strpos($haystack, $needle) !== false;
    }
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

// Configure local MAMP or hosted database credentials.
$isHosted = strtolower((string) (getenv('RENDER') ?: '')) === 'true';

$db_host = $isHosted
    ? (getDatabaseEnvValue('DB_HOST', 'MYSQLHOST', 'MYSQL_HOST') ?: '')
    : '127.0.0.1';
$db_user = getDatabaseEnvValue('DB_USER', 'MYSQLUSER', 'MYSQL_USER') ?: ($isHosted ? '' : 'root');
$db_pass = getDatabaseEnvValue('DB_PASSWORD', 'MYSQLPASSWORD', 'MYSQL_PASSWORD');
if ($db_pass === null) {
    $db_pass = $isHosted ? '' : 'root'; // MAMP Default password
}
$db_name = getDatabaseEnvValue('DB_NAME', 'MYSQLDATABASE', 'MYSQL_DATABASE') ?: ($isHosted ? '' : 'placement_db');

$configuredPort = getDatabaseEnvValue('DB_PORT', 'MYSQLPORT', 'MYSQL_PORT');
$portCandidates = $isHosted
    ? ($configuredPort !== null ? [$configuredPort] : ['3306'])
    : ['8889'];

$mysqli = null;
$lastConnectionError = '';
$connectedPort = null;
$connectedPassword = null;

if ($db_host === '' || $db_user === '' || $db_name === '') {
    error_log('Database configuration is incomplete.');
} else {
    foreach ($portCandidates as $portCandidate) {
        $port = (int) $portCandidate;
        try {
            // በ 'root' ፓስወርድ እና በ ባዶ ('') ፓስወርድ መሞከር
            $passwordsToTry = [$db_pass, ''];
            foreach ($passwordsToTry as $pass) {
                $connection = mysqli_init();
                if (!$connection) {
                    throw new RuntimeException('Unable to initialize the MySQL connection.');
                }
                $connection->options(MYSQLI_OPT_CONNECT_TIMEOUT, 3);
                if (@$connection->real_connect($db_host, $db_user, $pass, $db_name, $port)) {
                    $connection->set_charset('utf8mb4');
                    $mysqli = $connection;
                    $connectedPort = $port;
                    $connectedPassword = $pass;
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
        global $mysqli, $lastConnectionError, $db_host, $db_user, $db_pass, $db_name, $portCandidates;

        if ($mysqli instanceof mysqli) {
            return $mysqli;
        }

        try {
            foreach ($portCandidates as $portCandidate) {
                $port = (int) $portCandidate;
                $passwordsToTry = [$db_pass, ''];

                foreach ($passwordsToTry as $pass) {
                    $connection = mysqli_init();
                    if (!$connection) {
                        throw new RuntimeException('Unable to initialize the MySQL connection.');
                    }

                    $connection->options(MYSQLI_OPT_CONNECT_TIMEOUT, 3);
                    if (@$connection->real_connect($db_host, $db_user, $pass, $db_name, $port)) {
                        $connection->set_charset('utf8mb4');
                        $mysqli = $connection;
                        if (function_exists('enforceRoleFeaturePermission')) {
                            enforceRoleFeaturePermission($mysqli);
                        }
                        return $mysqli;
                    }

                    $lastConnectionError = $connection->connect_error ?: 'Could not connect to the database.';
                }
            }

            throw new RuntimeException('Database connection failed: ' . $lastConnectionError);
        } catch (Throwable $error) {
            $lastConnectionError = $error->getMessage();
            throw new RuntimeException('Database connection failed: ' . $lastConnectionError);
        }
    }
}

require_once __DIR__ . '/role_feature_permissions.php';
if ($mysqli instanceof mysqli) {
    enforceRoleFeaturePermission($mysqli);
}

// Audit Log PDO Connection Helper
if (!function_exists('getAuditPdo')) {
    function getAuditPdo(): PDO
    {
        global $db_host, $db_name, $db_user, $mysqli, $connectedPort, $connectedPassword;
        if (!$mysqli instanceof mysqli || $connectedPort === null || $connectedPassword === null) {
            throw new RuntimeException('Database connection is unavailable.');
        }
        return new PDO(
            "mysql:host=$db_host;dbname=$db_name;port=$connectedPort;charset=utf8mb4",
            $db_user,
            $connectedPassword,
            [
                PDO::ATTR_TIMEOUT => 3,
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]
        );
    }
}
?>
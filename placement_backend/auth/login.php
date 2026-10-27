<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/../config/cors.php';
sendCorsHeaders();
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../config/logger.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit;
}

$db = null;
$auditPdo = null;

try {
    $db = getDbConnection();
    if (!($db instanceof mysqli)) {
        throw new RuntimeException('Database connection helper failed.');
    }

    $connectAudit = static function () use (&$auditPdo): void {
        try {
            $auditPdo = getAuditPdo();
        } catch (Throwable $error) {
            error_log('Audit database connection failed: ' . $error->getMessage());
        }
    };

    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);
    if (!is_array($data)) {
        $data = [];
    }

    $identifier = trim((string) ($data['admission_number'] ?? $data['username_or_email'] ?? $data['username'] ?? $data['identifier'] ?? $data['email'] ?? ''));
    $credential = trim((string) ($data['password'] ?? $data['given_name'] ?? ''));

    if ($identifier === '' || $credential === '') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Please fill in all required fields.']);
        exit;
    }

    // 1. Student login lookup
    if (array_key_exists('admission_number', $data)) {
        $studentStmt = $db->prepare(
            'SELECT sd.admission_number, sd.given_name, sd.father_name,
                    u.id AS account_id, u.password AS account_password
             FROM student_data sd
             LEFT JOIN users u
               ON u.id_number = sd.admission_number
              AND LOWER(u.role) = \'student\'
             WHERE sd.admission_number = ?
             LIMIT 1'
        );
        if ($studentStmt) {
            $studentStmt->bind_param('s', $identifier);
            $studentStmt->execute();
            $studentResult = $studentStmt->get_result();
            $student = $studentResult->fetch_assoc();
            $studentStmt->close();

            if ($student) {
                $hasAccount = (int) ($student['account_id'] ?? 0) > 0;
                $givenNameMatches = strcasecmp(trim((string) $student['given_name']), $credential) === 0;
                $authenticated = $hasAccount
                    ? (
                        password_verify($credential, (string) ($student['account_password'] ?? ''))
                        || $credential === (string) ($student['account_password'] ?? '')
                        || $givenNameMatches
                    )
                    : $givenNameMatches;

                if ($authenticated) {
                    $studentUserId = (int) ($student['account_id'] ?? 0);
                    $sessionUserId = $studentUserId > 0 ? $studentUserId : $student['admission_number'];

                    session_start();
                    session_regenerate_id(true);
                    $_SESSION['user_id'] = $sessionUserId;
                    $_SESSION['admission_number'] = $student['admission_number'];
                    $_SESSION['role'] = 'student';
                    $_SESSION['given_name'] = $student['given_name'];

                    $connectAudit();
                    if ($auditPdo) {
                        logActivity($auditPdo, $studentUserId > 0 ? $studentUserId : null, $student['given_name'] . ' ' . $student['father_name'], 'auth.login', 'Successful student login');
                    }

                    echo json_encode([
                        'status' => 'success',
                        'user' => [
                            'id' => $sessionUserId,
                            'id_number' => $student['admission_number'],
                            'username' => $student['given_name'],
                            'role' => 'student'
                        ]
                    ]);
                    exit;
                }

                http_response_code(401);
                echo json_encode(['status' => 'error', 'message' => 'Incorrect First Name for the given Admission ID.']);
                exit;
            }
        }
    }

    // 2. Staff / Admin / Department Head lookup
    $userStmt = $db->prepare('SELECT id, id_number, username, email, password, role FROM users WHERE username = ? OR id_number = ? OR LOWER(email) = LOWER(?) LIMIT 1');
    if (!$userStmt) {
        throw new RuntimeException('Login query prepare failed: ' . $db->error);
    }

    $userStmt->bind_param('sss', $identifier, $identifier, $identifier);
    $userStmt->execute();
    $userResult = $userStmt->get_result();
    $user = $userResult->fetch_assoc();
    $userStmt->close();

    if (!$user) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'User or Email not found.']);
        exit;
    }

    // 🔥 የሰራተኛ ፓስወርድ ማረጋገጫ (Plaintext፣ Password Verify እና MD5 ፍተሻ)
    $dbPassword = (string) $user['password'];
    $isValidPassword = (
        $credential === $dbPassword || 
        password_verify($credential, $dbPassword) || 
        md5($credential) === $dbPassword
    );

    if (!$isValidPassword) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Incorrect password.']);
        exit;
    }

    $role = strtolower(trim((string) ($user['role'] ?? '')));
    if (in_array($role, ['head', 'department head', 'department_head'], true)) {
        $role = 'head';
    }

    session_start();
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['role'] = $role;
    $_SESSION['admission_number'] = $user['id_number'];
    $_SESSION['email'] = (string) ($user['email'] ?? '');

    $connectAudit();
    if ($auditPdo) {
        logActivity($auditPdo, (int) $user['id'], $user['username'], 'auth.login', 'Successful staff login');
    }

    echo json_encode([
        'status' => 'success',
        'user' => [
            'id' => $user['id'],
            'id_number' => $user['id_number'],
            'username' => $user['username'],
            'email' => $user['email'],
            'role' => $role
        ]
    ]);

} catch (Throwable $error) {
    error_log('Login failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to process login.',
        'debug' => $error->getMessage()
    ]);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>
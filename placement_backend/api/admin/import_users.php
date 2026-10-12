<?php
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';
require_once __DIR__ . '/../../config/id_number.php';

function importUsersResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    importUsersResponse(['success' => false, 'message' => 'Only POST requests are supported.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$actorId = (int) ($_SESSION['user_id'] ?? 0);
$actorRole = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ($actorId <= 0 || !in_array($actorRole, ['admin', 'registrar'], true)) {
    importUsersResponse(['success' => false, 'message' => 'Only administrators and registrars can import user accounts.'], 403);
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    importUsersResponse(['success' => false, 'message' => 'The database is unavailable.'], 500);
}

$data = json_decode(file_get_contents('php://input'), true);
if (!isset($data['users']) || !is_array($data['users'])) {
    importUsersResponse(['success' => false, 'message' => 'No user data was received.'], 400);
}

function normalizeImportedUserRole(string $role): ?string
{
    $normalized = strtolower(trim($role));
    if (in_array($normalized, ['hod', 'head', 'department_head', 'department head', 'head of department'], true)) {
        return 'hod';
    }
    if (in_array($normalized, ['admin', 'administrator'], true)) {
        return 'admin';
    }
    if ($normalized === 'registrar') {
        return 'registrar';
    }
    return null;
}

function validImportedPhone(string $phone): bool
{
    return $phone === '' || preg_match('/^(09|\+251)\d{8,9}$/', $phone) === 1;
}

$inserted = 0;
$skipped = [];
$auditActor = getAuditActor($db);

try {
    $db->begin_transaction();

    $findExisting = $db->prepare(
        'SELECT id FROM users
         WHERE LOWER(username) = LOWER(?)
            OR LOWER(email) = LOWER(?)
            OR (id_number IS NOT NULL AND LOWER(id_number) = LOWER(?))
         LIMIT 1'
    );
    $insertUser = $db->prepare(
        'INSERT INTO users (first_name, last_name, username, email, phone_number, password, role, id_number, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())'
    );
    if (!$findExisting || !$insertUser) {
        throw new RuntimeException('Unable to prepare user import statements: ' . $db->error);
    }

    $defaultPassword = password_hash('123456', PASSWORD_DEFAULT);
    foreach ($data['users'] as $index => $user) {
        $rowNumber = $index + 2;
        if (!is_array($user)) {
            $skipped[] = ['row' => $rowNumber, 'reason' => 'User row is invalid.'];
            continue;
        }

        $firstName = trim((string) ($user['first_name'] ?? ''));
        $lastName = trim((string) ($user['last_name'] ?? ''));
        $username = trim((string) ($user['username'] ?? ''));
        $email = strtolower(trim((string) ($user['email'] ?? '')));
        $phone = trim((string) ($user['phone'] ?? $user['phone_number'] ?? ''));
        $requestedId = trim((string) ($user['user_id'] ?? $user['id_number'] ?? ''));
        $role = normalizeImportedUserRole((string) ($user['role'] ?? ''));

        if ($firstName === '' || $lastName === '' || $username === '' || $email === '' || $role === null) {
            $skipped[] = ['row' => $rowNumber, 'reason' => 'First name, last name, username, valid email, and a supported role are required.'];
            continue;
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $skipped[] = ['row' => $rowNumber, 'email' => $email, 'reason' => 'Email address is invalid.'];
            continue;
        }
        if (preg_match('/[A-Za-z]/', $username) !== 1) {
            $skipped[] = ['row' => $rowNumber, 'username' => $username, 'reason' => 'Username must contain at least one letter.'];
            continue;
        }
        if (!validImportedPhone($phone)) {
            $skipped[] = ['row' => $rowNumber, 'phone' => $phone, 'reason' => 'Phone must use 09XXXXXXXX or +251XXXXXXXXX format.'];
            continue;
        }

        $idNumber = $requestedId !== '' ? $requestedId : getNextRoleIdNumber($db, $role);
        $findExisting->bind_param('sss', $username, $email, $idNumber);
        if (!$findExisting->execute()) {
            throw new RuntimeException('Unable to check existing user accounts: ' . $findExisting->error);
        }
        if ($findExisting->get_result()->num_rows > 0) {
            $skipped[] = ['row' => $rowNumber, 'username' => $username, 'reason' => 'User ID, username, or email already exists.'];
            continue;
        }

        $insertUser->bind_param(
            'ssssssss',
            $firstName,
            $lastName,
            $username,
            $email,
            $phone,
            $defaultPassword,
            $role,
            $idNumber
        );
        if (!$insertUser->execute()) {
            if ($insertUser->errno === 1062) {
                $skipped[] = ['row' => $rowNumber, 'username' => $username, 'reason' => 'User ID, username, or email already exists.'];
                continue;
            }
            throw new RuntimeException('Unable to create user account: ' . $insertUser->error);
        }
        $inserted++;
    }

    $findExisting->close();
    $insertUser->close();
    $db->commit();

    logActivity(
        $db,
        $auditActor['id'],
        $auditActor['name'],
        'user.bulk_import',
        json_encode(['inserted_count' => $inserted, 'skipped_count' => count($skipped)])
    );

    importUsersResponse([
        'success' => true,
        'message' => "User import complete: {$inserted} new, " . count($skipped) . ' skipped. New accounts use the default password 123456.',
        'inserted_count' => $inserted,
        'skipped_count' => count($skipped),
        'skipped' => $skipped,
    ]);
} catch (Throwable $error) {
    $db->rollback();
    error_log('User import failed: ' . $error->getMessage());
    importUsersResponse(['success' => false, 'message' => 'User import failed because of a database error.'], 500);
}

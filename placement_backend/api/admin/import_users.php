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

function getImportedUserValue(array $user, array $aliases): string
{
    foreach ($aliases as $alias) {
        if (isset($user[$alias]) && trim((string) $user[$alias]) !== '') {
            return trim((string) $user[$alias]);
        }
    }

    foreach ($user as $key => $value) {
        $normalizedKey = strtolower((string) preg_replace('/[^a-z0-9]/i', '', (string) $key));
        if (in_array($normalizedKey, $aliases, true) && trim((string) $value) !== '') {
            return trim((string) $value);
        }
    }

    return '';
}

function normalizeImportedUserRole(string $role, string $idNumber): string
{
    $normalized = strtolower(trim($role));
    $normalized = str_replace(['_', '-'], ' ', $normalized);
    $normalized = preg_replace('/\s+/', ' ', $normalized) ?? $normalized;

    if (in_array($normalized, ['admin', 'administrator'], true)) {
        return 'admin';
    }
    if ($normalized === 'registrar') {
        return 'registrar';
    }
    if (in_array($normalized, ['head', 'hod', 'department head', 'head of department'], true)) {
        return 'head';
    }
    if ($normalized === 'student') {
        return 'student';
    }
    if ($normalized !== '') {
        return '';
    }

    $normalizedId = strtolower(trim($idNumber));
    if (str_starts_with($normalizedId, 'dtu-reg-')) {
        return 'registrar';
    }
    if (str_starts_with($normalizedId, 'dtu-hod-')) {
        return 'head';
    }
    if (str_starts_with($normalizedId, 'dtu16r')) {
        return 'student';
    }
    if (str_starts_with($normalizedId, 'dtu-adm-') || str_contains($normalizedId, 'admin')) {
        return 'admin';
    }
    return 'student';
}

function validImportedPhone(string $phone): bool
{
    return $phone === '' || preg_match('/^(?:09\d{8}|\+251\d{9})$/', $phone) === 1;
}

$inserted = 0;
$skippedCount = 0;
$duplicateCount = 0;
$skipped = [];
$transactionStarted = false;
$recordSkipped = static function (array $row, bool $duplicate = false) use (&$skipped, &$skippedCount, &$duplicateCount): void {
    $skipped[] = $row;
    $skippedCount++;
    if ($duplicate) {
        $duplicateCount++;
    }
};

try {
    $auditActor = getAuditActor($db);
    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start user import transaction: ' . $db->error);
    }
    $transactionStarted = true;

    $findExisting = $db->prepare(
        'SELECT id_number FROM users WHERE id_number = ? OR email = ? LIMIT 1'
    );
    $insertUser = $db->prepare(
        'INSERT INTO users (id_number, first_name, last_name, username, password, email, phone_number, role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insertStudent = $db->prepare(
        "INSERT INTO student_data
            (user_id, id_number, first_name, last_name, username, email, phone, gender, gpa, status, department, stream)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.00, 'Pending', 'Not assigned', ?)"
    );
    if (!$findExisting || !$insertUser || !$insertStudent) {
        throw new RuntimeException('Unable to prepare user import statements: ' . $db->error);
    }

    $temporaryPasswords = [];
    foreach ($data['users'] as $index => $user) {
        $rowNumber = $index + 2;
        if (!is_array($user)) {
            $recordSkipped(['row' => $rowNumber, 'reason' => 'User row is invalid.']);
            continue;
        }

        $firstName = getImportedUserValue($user, ['first_name', 'firstname']);
        $lastName = getImportedUserValue($user, ['last_name', 'lastname']);
        $username = getImportedUserValue($user, ['username', 'loginname']);
        $email = strtolower(getImportedUserValue($user, ['email', 'emailaddress']));
        $phone = preg_replace('/[\s()-]/', '', getImportedUserValue($user, ['phone', 'phone_number', 'phonenumber', 'mobile'])) ?? '';
        $requestedId = getImportedUserValue($user, ['id_number', 'idnumber', 'user_id', 'userid']);
        $role = normalizeImportedUserRole(
            getImportedUserValue($user, ['role', 'userrole', 'accounttype']),
            $requestedId
        );

        if ($firstName === '' || $lastName === '' || $username === '' || $email === '' || $role === '') {
            $recordSkipped(['row' => $rowNumber, 'reason' => 'First name, last name, username, valid email, and a supported role are required.']);
            continue;
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $recordSkipped(['row' => $rowNumber, 'email' => $email, 'reason' => 'Email address is invalid.']);
            continue;
        }
        if (preg_match('/[A-Za-z]/', $username) !== 1) {
            $recordSkipped(['row' => $rowNumber, 'username' => $username, 'reason' => 'Username must contain at least one letter.']);
            continue;
        }
        if (!validImportedPhone($phone)) {
            $recordSkipped(['row' => $rowNumber, 'phone' => $phone, 'reason' => 'Phone must use 09XXXXXXXX or +251XXXXXXXXX format.']);
            continue;
        }

        $idNumber = $requestedId !== '' ? $requestedId : getNextRoleIdNumber($db, $role);
        $findExisting->bind_param('ss', $idNumber, $email);
        if (!$findExisting->execute()) {
            throw new RuntimeException('Unable to check existing user accounts: ' . $findExisting->error);
        }
        if ($findExisting->get_result()->num_rows > 0) {
            $recordSkipped([
                'row' => $rowNumber,
                'id_number' => $idNumber,
                'username' => $username,
                'email' => $email,
                'reason' => 'Skipped because this ID number or email already exists.',
            ], true);
            continue;
        }

        $providedPassword = getImportedUserValue($user, ['password', 'temporary_password', 'temppassword']);
        $temporaryPassword = $providedPassword !== '' ? $providedPassword : bin2hex(random_bytes(12));
        $hashedPassword = password_hash($temporaryPassword, PASSWORD_DEFAULT);
        if ($hashedPassword === false) {
            throw new RuntimeException('Unable to hash the password for user ' . $idNumber . '.');
        }

        $insertUser->bind_param(
            'ssssssss',
            $idNumber,
            $firstName,
            $lastName,
            $username,
            $hashedPassword,
            $email,
            $phone,
            $role,
        );
        $insertErrorCode = 0;
        try {
            $insertSucceeded = $insertUser->execute();
        } catch (mysqli_sql_exception $insertError) {
            if ((int) $insertError->getCode() !== 1062) {
                throw new RuntimeException('Unable to create user account: ' . $insertError->getMessage(), (int) $insertError->getCode(), $insertError);
            }
            $insertErrorCode = 1062;
            $insertSucceeded = false;
        }
        if (!$insertSucceeded) {
            if ($insertErrorCode === 1062 || $insertUser->errno === 1062) {
                $recordSkipped([
                    'row' => $rowNumber,
                    'id_number' => $idNumber,
                    'username' => $username,
                    'email' => $email,
                    'reason' => 'Skipped because a unique user value already exists.',
                ], true);
                continue;
            }
            throw new RuntimeException('Unable to create user account: ' . $insertUser->error);
        }
        if ($insertUser->affected_rows !== 1) {
            throw new RuntimeException(
                'User insert did not create exactly one account for ' . $idNumber
                . ' (affected rows: ' . $insertUser->affected_rows . ').'
            );
        }
        $newUserId = (int) $db->insert_id;
        if ($role === 'student') {
            $gender = getImportedUserValue($user, ['gender']) ?: 'Not specified';
            $stream = getImportedUserValue($user, ['stream']);
            $insertStudent->bind_param(
                'issssssss',
                $newUserId,
                $idNumber,
                $firstName,
                $lastName,
                $username,
                $email,
                $phone,
                $gender,
                $stream
            );
            if (!$insertStudent->execute()) {
                throw new RuntimeException('Unable to create student profile: ' . $insertStudent->error);
            }
        }
        if ($providedPassword === '') {
            $temporaryPasswords[] = [
                'id_number' => $idNumber,
                'username' => $username,
                'password' => $temporaryPassword,
            ];
        }
        $inserted++;
    }

    $findExisting->close();
    $insertUser->close();
    $insertStudent->close();
    if ($inserted === 0) {
        $db->rollback();
        $transactionStarted = false;
        $totalRows = count($data['users']);
        $rowLabel = $totalRows === 1 ? 'row' : 'rows';
        $message = $totalRows > 0 && $duplicateCount === $totalRows
            ? "No new accounts added. All {$totalRows} {$rowLabel} were skipped because they already exist in the system."
            : "No new accounts added. {$skippedCount} rows were skipped; no accounts were imported.";
        importUsersResponse([
            'success' => false,
            'message' => $message,
            'inserted_count' => 0,
            'skipped_count' => $skippedCount,
            'duplicate_count' => $duplicateCount,
            'skipped' => $skipped,
        ], 422);
    }

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit user import transaction: ' . $db->error);
    }
    $transactionStarted = false;

    try {
        logActivity(
            $db,
            $auditActor['id'],
            $auditActor['name'],
            'user.bulk_import',
            json_encode(['inserted_count' => $inserted, 'skipped_count' => $skippedCount])
        );
    } catch (Throwable $auditError) {
        error_log('User import audit logging failed: ' . $auditError->getMessage());
    }

    importUsersResponse([
        'success' => true,
        'message' => $duplicateCount > 0
            ? "Successfully imported {$inserted} users. {$duplicateCount} rows were skipped as duplicates."
                . ($skippedCount > $duplicateCount ? ' ' . ($skippedCount - $duplicateCount) . ' additional rows were skipped.' : '')
            : "Successfully imported {$inserted} users. {$skippedCount} rows were skipped.",
        'inserted_count' => $inserted,
        'skipped_count' => $skippedCount,
        'duplicate_count' => $duplicateCount,
        'skipped' => $skipped,
        'temporary_passwords' => $temporaryPasswords,
    ]);
} catch (Throwable $error) {
    if ($transactionStarted) {
        $db->rollback();
    }
    error_log('User import failed: ' . $error->getMessage());
    importUsersResponse([
        'success' => false,
        'message' => 'User import failed: ' . $error->getMessage(),
        'error' => $error->getMessage(),
        'inserted_count' => 0,
        'skipped_count' => $skippedCount,
        'skipped' => $skipped,
    ], 500);
}

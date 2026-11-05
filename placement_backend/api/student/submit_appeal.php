<?php
include __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$db = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    exit;
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function resolveAppealStudent(mysqli $db, string $sessionUserId, string $admissionNumber): ?array
{
    $numericUserId = ctype_digit($sessionUserId) ? (int) $sessionUserId : 0;
    $userLookup = $db->prepare(
        "SELECT id, id_number FROM users
         WHERE LOWER(TRIM(role)) = 'student'
           AND ((id = ? AND ? > 0) OR id_number = ?)
         LIMIT 1"
    );
    if (!$userLookup) {
        throw new RuntimeException('Unable to prepare student account lookup.');
    }
    $userLookup->bind_param('iis', $numericUserId, $numericUserId, $admissionNumber);
    if (!$userLookup->execute()) {
        $userLookup->close();
        throw new RuntimeException('Unable to look up student account.');
    }
    $student = $userLookup->get_result()->fetch_assoc();
    $userLookup->close();
    if ($student) {
        return [
            'id' => (int) $student['id'],
            'admission_number' => trim((string) ($student['id_number'] ?? '')),
        ];
    }

    if ($admissionNumber === '') {
        return null;
    }
    $profileLookup = $db->prepare(
        'SELECT id, admission_number FROM student_data
         WHERE TRIM(admission_number) = TRIM(?)
         LIMIT 1'
    );
    if (!$profileLookup) {
        throw new RuntimeException('Unable to prepare student profile lookup.');
    }
    $profileLookup->bind_param('s', $admissionNumber);
    if (!$profileLookup->execute()) {
        $profileLookup->close();
        throw new RuntimeException('Unable to look up student profile.');
    }
    $profile = $profileLookup->get_result()->fetch_assoc();
    $profileLookup->close();
    if (!$profile) {
        return null;
    }

    return [
        'id' => (int) $profile['id'],
        'admission_number' => trim((string) $profile['admission_number']),
    ];
}

try {
    if ($method === 'GET') {
        $sessionUserId = trim((string) ($_SESSION['user_id'] ?? ''));
        $sessionRole = strtolower(trim((string) ($_SESSION['role'] ?? '')));
        if ($sessionUserId === '' || !in_array($sessionRole, ['student', 'registrar'], true)) {
            respond(['success' => false, 'message' => 'Please sign in to view appeals.'], 403);
        }

        if ($sessionRole === 'student') {
            $sessionAdmissionNumber = trim((string) ($_SESSION['admission_number'] ?? ''));
            if ($sessionAdmissionNumber === '' && !ctype_digit($sessionUserId)) {
                $sessionAdmissionNumber = $sessionUserId;
            }
            $student = resolveAppealStudent($db, $sessionUserId, $sessionAdmissionNumber);
            if (!$student) {
                respond(['success' => false, 'message' => 'Your student account could not be verified. Please sign in again.'], 404);
            }
            $sessionStudentId = $student['id'];
            $statement = $db->prepare('SELECT sa.id, sa.student_id, COALESCE(u.username, sd.given_name, CAST(sa.student_id AS CHAR)) AS username, u.email, COALESCE(u.id_number, sd.admission_number) AS admission_number, sa.subject, sa.message, sa.status, sa.response, sa.created_at FROM student_appeals sa LEFT JOIN users u ON u.id = sa.student_id LEFT JOIN student_data sd ON sd.id = sa.student_id WHERE sa.student_id = ? ORDER BY sa.created_at DESC, sa.id DESC');
            if (!$statement) {
                throw new Exception('Unable to prepare appeal history query.');
            }
            $statement->bind_param('i', $sessionStudentId);
        } else {
            $statement = $db->prepare('SELECT sa.id, sa.student_id, COALESCE(u.username, sd.given_name, CAST(sa.student_id AS CHAR)) AS username, u.email, COALESCE(u.id_number, sd.admission_number) AS admission_number, sa.subject, sa.message, sa.status, sa.response, sa.created_at FROM student_appeals sa LEFT JOIN users u ON u.id = sa.student_id LEFT JOIN student_data sd ON sd.id = sa.student_id ORDER BY sa.created_at DESC, sa.id DESC');
            if (!$statement) {
                throw new Exception('Unable to prepare appeal history query.');
            }
        }
        if (!$statement->execute()) {
            $statement->close();
            throw new Exception('Unable to load appeal history.');
        }
        $result = $statement->get_result();
        $appeals = [];
        while ($appeal = $result->fetch_assoc()) {
            $appeals[] = $appeal;
        }
        $statement->close();

        $responseSql = 'SELECT r.id, r.appeal_id, r.sender_role, r.sender_name, r.message, r.created_at
            FROM student_appeal_responses r
            INNER JOIN student_appeals sa ON sa.id = r.appeal_id';
        if ($sessionRole === 'student') {
            $responseSql .= ' WHERE sa.student_id = ?';
        }
        $responseSql .= ' ORDER BY r.created_at ASC, r.id ASC';
        $responseStatement = $db->prepare($responseSql);
        if (!$responseStatement) {
            throw new Exception('Unable to prepare appeal response history query.');
        }
        if ($sessionRole === 'student') {
            $responseStatement->bind_param('i', $sessionStudentId);
        }
        if (!$responseStatement->execute()) {
            $responseStatement->close();
            throw new Exception('Unable to load appeal response history.');
        }
        $responseResult = $responseStatement->get_result();
        $responseHistory = [];
        while ($response = $responseResult->fetch_assoc()) {
            $appealId = (string) $response['appeal_id'];
            $responseHistory[$appealId][] = $response;
        }
        $responseStatement->close();
        foreach ($appeals as &$appeal) {
            $appeal['responses'] = $responseHistory[(string) $appeal['id']] ?? [];
        }
        unset($appeal);

        respond(['success' => true, 'appeals' => $appeals]);
    }

    if ($method !== 'POST') {
        respond(['success' => false, 'message' => 'Only GET and POST requests are allowed.'], 405);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    if (isset($input['action']) && $input['action'] === 'update') {
        $sessionRole = strtolower(trim((string) ($_SESSION['role'] ?? '')));
        if ($sessionRole !== 'registrar') {
            respond(['success' => false, 'message' => 'Only registrars can update appeals.'], 403);
        }

        $appealId = (int) ($input['appeal_id'] ?? 0);
        $status = trim((string) ($input['status'] ?? ''));
        $responseText = trim((string) ($input['response'] ?? ''));
        $allowedStatuses = ['Received', 'Under Review', 'Resolved'];

        if ($appealId <= 0 || !in_array($status, $allowedStatuses, true)) {
            respond(['success' => false, 'message' => 'A valid appeal ID and status are required.'], 400);
        }

        $registrarId = ctype_digit((string) ($_SESSION['user_id'] ?? ''))
            ? (int) $_SESSION['user_id']
            : 0;
        if ($registrarId <= 0) {
            respond(['success' => false, 'message' => 'Your registrar account could not be verified. Please sign in again.'], 403);
        }

        $registrarName = 'Registrar';
        $nameStatement = $db->prepare('SELECT username FROM users WHERE id = ? LIMIT 1');
        if (!$nameStatement) {
            throw new Exception('Unable to prepare registrar identity lookup.');
        }
        $nameStatement->bind_param('i', $registrarId);
        if (!$nameStatement->execute()) {
            $nameStatement->close();
            throw new Exception('Unable to look up registrar identity.');
        }
        $registrar = $nameStatement->get_result()->fetch_assoc();
        $nameStatement->close();
        if (!empty($registrar['username'])) {
            $registrarName = trim((string) $registrar['username']);
        }

        $db->begin_transaction();
        $appealLookup = $db->prepare('SELECT id FROM student_appeals WHERE id = ? FOR UPDATE');
        if (!$appealLookup) {
            throw new Exception('Unable to prepare appeal lookup.');
        }
        $appealLookup->bind_param('i', $appealId);
        if (!$appealLookup->execute()) {
            $appealLookup->close();
            throw new Exception('Unable to verify appeal.');
        }
        $appealExists = $appealLookup->get_result()->num_rows > 0;
        $appealLookup->close();
        if (!$appealExists) {
            $db->rollback();
            respond(['success' => false, 'message' => 'Appeal not found.'], 404);
        }

        $statement = $db->prepare(
            $responseText === ''
                ? 'UPDATE student_appeals SET status = ? WHERE id = ?'
                : 'UPDATE student_appeals SET status = ?, response = ? WHERE id = ?'
        );
        if (!$statement) {
            throw new Exception('Unable to prepare appeal update.');
        }
        if ($responseText === '') {
            $statement->bind_param('si', $status, $appealId);
        } else {
            $statement->bind_param('ssi', $status, $responseText, $appealId);
        }
        if (!$statement->execute()) {
            $statement->close();
            throw new Exception('Unable to update appeal.');
        }
        $statement->close();

        $savedResponse = null;
        if ($responseText !== '') {
            $responseStatement = $db->prepare(
                'INSERT INTO student_appeal_responses (appeal_id, sender_user_id, sender_role, sender_name, message)
                 VALUES (?, ?, ?, ?, ?)'
            );
            if (!$responseStatement) {
                throw new Exception('Unable to prepare appeal response save.');
            }
            $senderRole = 'registrar';
            $responseStatement->bind_param('iisss', $appealId, $registrarId, $senderRole, $registrarName, $responseText);
            if (!$responseStatement->execute()) {
                $responseStatement->close();
                throw new Exception('Unable to save appeal response.');
            }
            $responseId = $responseStatement->insert_id;
            $responseStatement->close();
            $savedResponseStatement = $db->prepare(
                'SELECT id, appeal_id, sender_role, sender_name, message, created_at
                 FROM student_appeal_responses WHERE id = ? LIMIT 1'
            );
            if (!$savedResponseStatement) {
                throw new Exception('Unable to prepare saved appeal response lookup.');
            }
            $savedResponseStatement->bind_param('i', $responseId);
            if (!$savedResponseStatement->execute()) {
                $savedResponseStatement->close();
                throw new Exception('Unable to load saved appeal response.');
            }
            $savedResponse = $savedResponseStatement->get_result()->fetch_assoc();
            $savedResponseStatement->close();
            if (!$savedResponse) {
                throw new Exception('Saved appeal response could not be loaded.');
            }
            $savedResponse = [
                'id' => (int) $savedResponse['id'],
                'appeal_id' => (int) $savedResponse['appeal_id'],
                'sender_role' => $savedResponse['sender_role'],
                'sender_name' => $savedResponse['sender_name'],
                'message' => $savedResponse['message'],
                'created_at' => $savedResponse['created_at'],
            ];
        }

        if (!$db->commit()) {
            throw new Exception('Unable to commit appeal update.');
        }
        respond([
            'success' => true,
            'message' => $responseText === '' ? 'Appeal status updated successfully.' : 'Appeal response saved.',
            'response' => $savedResponse,
        ]);
    }

    if (isset($input['action']) && $input['action'] === 'delete') {
        $appealId = (int) ($input['appeal_id'] ?? 0);
        if ($appealId <= 0) {
            respond(['success' => false, 'message' => 'A valid appeal ID is required.'], 400);
        }

        $rawUserId = trim((string) ($_SESSION['user_id'] ?? ''));
        $userId = ctype_digit($rawUserId) ? (int) $rawUserId : 0;
        $role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
        $admissionNumber = trim((string) ($_SESSION['admission_number'] ?? ''));
        if ($role === 'student' && $admissionNumber === '' && $userId === 0) {
            $admissionNumber = $rawUserId;
        }
        if ($role === 'student') {
            $student = resolveAppealStudent($db, $rawUserId, $admissionNumber);
            $userId = (int) ($student['id'] ?? 0);
        }
        if (($userId <= 0 && ($role !== 'student' || $admissionNumber === '')) || !in_array($role, ['student', 'registrar'], true)) {
            respond(['success' => false, 'message' => 'You must be logged in to delete an appeal.'], 403);
        }

        if ($role === 'student') {
            $statement = $db->prepare("DELETE FROM student_appeals WHERE id = ? AND student_id = ? AND status = 'Received'");
            if (!$statement) {
                throw new Exception('Unable to prepare appeal deletion.');
            }
            $statement->bind_param('ii', $appealId, $userId);
        } else {
            $statement = $db->prepare('DELETE FROM student_appeals WHERE id = ?');
            if (!$statement) {
                throw new Exception('Unable to prepare appeal deletion.');
            }
            $statement->bind_param('i', $appealId);
        }

        if (!$statement->execute()) {
            $statement->close();
            throw new Exception('Unable to delete appeal.');
        }
        $deleted = $statement->affected_rows;
        $statement->close();

        if ($deleted === 0) {
            $status = $role === 'student' ? 403 : 404;
            $message = $role === 'student'
                ? 'Only your own appeals with Received status can be deleted.'
                : 'Appeal not found.';
            respond(['success' => false, 'message' => $message], $status);
        }

        respond(['success' => true, 'message' => 'Appeal deleted successfully.', 'deleted' => $deleted]);
    }

    $sessionUserId = trim((string) ($_SESSION['user_id'] ?? ''));
    $sessionRole = strtolower(trim((string) ($_SESSION['role'] ?? '')));
    $requestedStudentId = trim((string) ($input['student_id'] ?? ''));
    $requestedAdmissionNumber = trim((string) ($input['admission_number'] ?? ''));
    $subject = trim((string) ($input['subject'] ?? ''));
    $message = trim((string) ($input['message'] ?? ''));

    if ($sessionUserId === '' || $sessionRole !== 'student') {
        respond(['success' => false, 'message' => 'Please sign in as a student before submitting an appeal.'], 403);
    }

    if ($subject === '' || $message === '') {
        respond(['success' => false, 'message' => 'Subject and message are required.'], 400);
    }

    if (mb_strlen($subject) > 255) {
        respond(['success' => false, 'message' => 'Subject must be 255 characters or fewer.'], 400);
    }

    $sessionStudentId = ctype_digit($sessionUserId) ? (int) $sessionUserId : 0;
    $sessionAdmissionNumber = trim((string) ($_SESSION['admission_number'] ?? ''));
    if ($sessionAdmissionNumber === '' && $sessionStudentId === 0) {
        $sessionAdmissionNumber = $sessionUserId;
    }
    $student = resolveAppealStudent($db, $sessionUserId, $sessionAdmissionNumber);
    if (!$student) {
        respond(['success' => false, 'message' => 'Your student account could not be verified. Please sign in again.'], 404);
    }
    $appealStudentId = $student['id'];
    $accountAdmissionNumber = $student['admission_number'];

    $requestedIdMismatch = $requestedStudentId !== ''
        && (ctype_digit($requestedStudentId)
            ? (int) $requestedStudentId !== $appealStudentId
            : strcasecmp($requestedStudentId, $accountAdmissionNumber) !== 0);
    if ($requestedIdMismatch
        || ($requestedAdmissionNumber !== '' && strcasecmp($requestedAdmissionNumber, $accountAdmissionNumber) !== 0)
        || ($sessionAdmissionNumber !== '' && strcasecmp($sessionAdmissionNumber, $accountAdmissionNumber) !== 0)) {
        respond(['success' => false, 'message' => 'You can only submit an appeal for your own student account.'], 403);
    }

    $statement = $db->prepare("INSERT INTO student_appeals (student_id, subject, message, status) VALUES (?, ?, ?, 'Received')");
    if (!$statement) {
        throw new Exception('Unable to prepare appeal submission.');
    }
    $statement->bind_param('iss', $appealStudentId, $subject, $message);
    if (!$statement->execute()) {
        $statement->close();
        throw new Exception('Unable to save appeal.');
    }

    $appealId = $statement->insert_id;
    $statement->close();
    respond(['success' => true, 'message' => 'Your appeal was submitted to the Registrar.', 'appeal_id' => $appealId]);
} catch (Throwable $error) {
    respond(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    if ($db instanceof mysqli) {
        $db->close();
    }
}
?>
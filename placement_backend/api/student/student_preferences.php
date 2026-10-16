<?php
require_once __DIR__ . '/../../config/db_config.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    sendCorsHeaders();
    http_response_code(204);
    exit;
}

if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'POST'], true)) {
    respond(['success' => false, 'message' => 'Only GET and POST requests are allowed.'], 405);
}

$studentId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower((string) ($_SESSION['role'] ?? ''));
$requestedStudentId = (int) ($_GET['student_id'] ?? 0);

if ($studentId <= 0) {
    respond(['success' => false, 'message' => 'A valid login session is required.'], 403);
}

$canAccessOwnPreferences = $role === 'student';
$canAccessRegistrarPreferences = in_array($role, ['registrar', 'admin'], true) && $requestedStudentId > 0;
if (!$canAccessOwnPreferences && !$canAccessRegistrarPreferences) {
    respond(['success' => false, 'message' => 'Student or registrar access is required.'], 403);
}

if ($canAccessOwnPreferences && $requestedStudentId > 0 && $requestedStudentId !== $studentId) {
    respond(['success' => false, 'message' => 'You can only access your own preferences.'], 403);
}

if ($canAccessOwnPreferences && $requestedStudentId <= 0) {
    $requestedStudentId = $studentId;
}

if (!$canAccessOwnPreferences && $canAccessRegistrarPreferences) {
    $studentId = $requestedStudentId;
}

$db = getDbConnection();
if (!$db instanceof mysqli) {
    respond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}
$transactionStarted = false;

function getPreferenceSubmissionStatus(mysqli $db, int $studentId): array
{
    $settingsStatement = $db->prepare(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'public_portal' LIMIT 1"
    );
    if (!$settingsStatement) {
        throw new Exception('Unable to read placement settings.');
    }
    if (!$settingsStatement->execute()) {
        throw new Exception('Unable to read placement settings.');
    }
    $settingsRow = $settingsStatement->get_result()->fetch_assoc();
    $settingsStatement->close();

    $settings = json_decode((string) ($settingsRow['setting_value'] ?? ''), true);
    $settings = is_array($settings) ? $settings : [];
    $deadline = trim((string) ($settings['placement']['submissionDeadline'] ?? '2026-10-11'));
    $deadlineDateString = substr($deadline, 0, 10);
    $deadlineDate = $deadline === '' ? null : DateTimeImmutable::createFromFormat(
        '!Y-m-d',
        $deadlineDateString,
        new DateTimeZone(date_default_timezone_get())
    );
    $deadlineDateValue = $deadlineDate instanceof DateTimeImmutable
        && $deadlineDate->format('Y-m-d') === $deadlineDateString
        ? $deadlineDateString
        : null;
    $publishedStatement = $db->prepare(
        "SELECT MAX(CASE WHEN LOWER(TRIM(status)) IN ('approved', 'published') THEN 1 ELSE 0 END) AS is_published
         FROM placement_results WHERE student_id = ?"
    );
    if (!$publishedStatement || !$publishedStatement->bind_param('i', $studentId) || !$publishedStatement->execute()) {
        throw new Exception('Unable to check placement result publication status.');
    }
    $placement = $publishedStatement->get_result()->fetch_assoc();
    $publishedStatement->close();
    $resultPublished = (int) ($placement['is_published'] ?? 0) === 1;
    $deadlineActive = $deadlineDateValue !== null && $deadlineDateValue >= date('Y-m-d');

    return [
        'submissionDeadline' => $deadline,
        'isDeadlineActive' => $deadlineActive,
        'isResultPublished' => $resultPublished,
        'deadline_passed' => !$deadlineActive,
        'is_published' => $resultPublished,
    ];
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $statement = $db->prepare(
            'SELECT sc.dept_id, sc.dept_name, sc.college_name, sc.stream, sc.priority
             FROM student_choices sc WHERE sc.student_id = ? ORDER BY sc.priority ASC'
        );
        if (!$statement || !$statement->bind_param('i', $studentId) || !$statement->execute()) {
            throw new Exception('Unable to load student preferences.');
        }
        $result = $statement->get_result();
        $choices = [];
        while ($row = $result->fetch_assoc()) {
            $choices[] = $row;
        }
        $statement->close();

        respond([
            'success' => true,
            'choices' => $choices,
            ...getPreferenceSubmissionStatus($db, $studentId),
        ]);
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $choices = is_array($data) ? ($data['choices'] ?? null) : null;
    if (!is_array($choices) || count($choices) === 0) {
        respond(['success' => false, 'message' => 'At least one department choice is required.'], 400);
    }

    if (!$db->begin_transaction()) {
        throw new Exception('Unable to start the preference update transaction.');
    }
    $transactionStarted = true;
    $submissionStatus = getPreferenceSubmissionStatus($db, $studentId);

    $existingChoicesStatement = $db->prepare(
        'SELECT id FROM student_choices WHERE student_id = ? LIMIT 1 FOR UPDATE'
    );
    if (!$existingChoicesStatement
        || !$existingChoicesStatement->bind_param('i', $studentId)
        || !$existingChoicesStatement->execute()) {
        throw new Exception('Unable to check existing student preferences.');
    }
    $hasExistingChoices = $existingChoicesStatement->get_result()->num_rows > 0;
    $existingChoicesStatement->close();

    if (!$hasExistingChoices && !$submissionStatus['isDeadlineActive']) {
        $db->rollback();
        respond(['success' => false, 'message' => 'The preference submission deadline has passed. Changes are no longer permitted.'], 403);
    }
    if ($submissionStatus['isResultPublished']) {
        $db->rollback();
        respond(['success' => false, 'message' => 'Placement results have been published. Changes are no longer permitted.'], 403);
    }

    $deleteStatement = $db->prepare('DELETE FROM student_choices WHERE student_id = ?');
    $departmentStatement = $db->prepare('SELECT name, college_name, stream FROM departments WHERE id = ? LIMIT 1');
    $insertStatement = $db->prepare(
        'INSERT INTO student_choices (student_id, dept_id, dept_name, college_name, stream, priority)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    if (!$deleteStatement || !$departmentStatement || !$insertStatement) {
        throw new Exception('Unable to prepare preference update.');
    }

    if (!$deleteStatement->bind_param('i', $studentId) || !$deleteStatement->execute()) {
        throw new Exception('Unable to replace existing preferences.');
    }

    $seenDepartmentIds = [];
    $seenPriorities = [];
    foreach ($choices as $choice) {
        $departmentId = (int) ($choice['dept_id'] ?? 0);
        $priority = (int) ($choice['priority'] ?? 0);
        if ($departmentId <= 0 || $priority <= 0
            || isset($seenDepartmentIds[$departmentId]) || isset($seenPriorities[$priority])) {
            throw new InvalidArgumentException('Each choice must have a unique department and ranking.');
        }
        $seenDepartmentIds[$departmentId] = true;
        $seenPriorities[$priority] = true;

        if (!$departmentStatement->bind_param('i', $departmentId) || !$departmentStatement->execute()) {
            throw new Exception('Unable to validate the selected department.');
        }
        $department = $departmentStatement->get_result()->fetch_assoc();
        if (!$department) {
            throw new InvalidArgumentException('A selected department is no longer available.');
        }

        $departmentName = (string) $department['name'];
        $collegeName = (string) ($department['college_name'] ?? '');
        $stream = (string) ($department['stream'] ?? '');
        if (!$insertStatement->bind_param(
            'iisssi',
            $studentId,
            $departmentId,
            $departmentName,
            $collegeName,
            $stream,
            $priority
        ) || !$insertStatement->execute()) {
            throw new Exception('Unable to save a department preference.');
        }
    }

    $deleteStatement->close();
    $departmentStatement->close();
    $insertStatement->close();
    if (!$db->commit()) {
        throw new Exception('Unable to commit student preference changes.');
    }
    $transactionStarted = false;
    respond([
        'success' => true,
        'message' => $hasExistingChoices
            ? 'Preferences updated successfully.'
            : 'Preferences submitted successfully.',
    ]);
} catch (InvalidArgumentException $error) {
    if ($transactionStarted) {
        $db->rollback();
    }
    respond(['success' => false, 'message' => $error->getMessage()], 400);
} catch (Throwable $error) {
    if ($transactionStarted) {
        $db->rollback();
    }
    error_log('Student preference API error: ' . $error->getMessage());
    respond(['success' => false, 'message' => 'Unable to process student preferences.'], 500);
} finally {
    $db->close();
}
?>
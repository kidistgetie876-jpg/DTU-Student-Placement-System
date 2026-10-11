<?php
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function unassignedRespond(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function refreshUnassignedStudentRoster(mysqli $db): void
{
    $result = $db->query(
        "INSERT INTO unassigned_students
            (student_id, id_number, full_name, email, stream, college_name, status, placement_run_at)
         SELECT sd.user_id,
                COALESCE(NULLIF(sd.id_number, ''), u.id_number, ''),
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', sd.first_name, sd.last_name)), ''), u.username, 'Student'),
                COALESCE(NULLIF(sd.email, ''), u.email, ''),
                COALESCE(NULLIF(sd.stream, ''), (
                    SELECT sc.stream
                    FROM student_choices sc
                    WHERE sc.student_id = sd.user_id
                    ORDER BY sc.priority ASC
                    LIMIT 1
                ), ''),
                COALESCE((
                    SELECT sc.college_name
                    FROM student_choices sc
                    WHERE sc.student_id = sd.user_id
                    ORDER BY sc.priority ASC
                    LIMIT 1
                ), ''),
                'Not assigned',
                NOW()
         FROM student_data sd
         INNER JOIN users u ON u.id = sd.user_id AND LOWER(u.role) = 'student'
         WHERE LOWER(TRIM(COALESCE(sd.status, ''))) = 'not assigned'
           AND NOT EXISTS (
               SELECT 1
               FROM placement_results pr
               WHERE pr.student_id = sd.user_id
                 AND (pr.status IS NULL OR pr.status NOT IN ('Rejected', 'Cancelled'))
           )
         ON DUPLICATE KEY UPDATE
            id_number = VALUES(id_number),
            full_name = VALUES(full_name),
            email = VALUES(email),
            stream = VALUES(stream),
            college_name = VALUES(college_name),
            status = 'Not assigned'"
    );
    if (!$result) {
        throw new RuntimeException('Unable to synchronize unassigned students: ' . $db->error);
    }
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
if (!isset($_SESSION['user_id']) || !in_array(strtolower((string) ($_SESSION['role'] ?? '')), ['registrar', 'admin'], true)) {
    unassignedRespond(['success' => false, 'message' => 'Registrar access is required'], 403);
}

$db = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'] ?? '';

try {
    if ($method === 'GET') {
        refreshUnassignedStudentRoster($db);

        $result = $db->query(
            "SELECT student_id, id_number, full_name, email, stream, college_name, status, placement_run_at
             FROM unassigned_students
             WHERE status = 'Not assigned'
             ORDER BY placement_run_at DESC, full_name ASC"
        );
        if (!$result) {
            throw new RuntimeException('Unable to load unassigned students: ' . $db->error);
        }

        $students = [];
        while ($row = $result->fetch_assoc()) {
            $students[] = [
                'studentId' => (int) $row['student_id'],
                'idNumber' => (string) $row['id_number'],
                'fullName' => (string) $row['full_name'],
                'email' => (string) $row['email'],
                'stream' => (string) $row['stream'],
                'college' => (string) $row['college_name'],
                'status' => (string) $row['status'],
                'placementRunAt' => (string) $row['placement_run_at'],
            ];
        }

        if (isset($_GET['format']) && $_GET['format'] === 'csv') {
            header_remove('Content-Type');
            header('Content-Type: text/csv; charset=UTF-8');
            header('Content-Disposition: attachment; filename="unassigned_students_report.csv"');
            $output = fopen('php://output', 'wb');
            if ($output === false) {
                throw new RuntimeException('Unable to create the unassigned student report');
            }
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, ['Student ID', 'Full Name', 'Email', 'Stream', 'College', 'Status']);
            foreach ($students as $student) {
                $values = [
                    $student['idNumber'] !== '' ? $student['idNumber'] : $student['studentId'],
                    $student['fullName'],
                    $student['email'],
                    $student['stream'],
                    $student['college'],
                    $student['status'],
                ];
                foreach ($values as &$value) {
                    if (preg_match('/^[\x00-\x20]*[=+\-@]/', (string) $value)) {
                        $value = "'" . $value;
                    }
                }
                unset($value);
                fputcsv($output, $values);
            }
            fclose($output);
            $db->close();
            exit;
        }

        unassignedRespond(['success' => true, 'students' => $students, 'count' => count($students)]);
    }

    if ($method !== 'POST') {
        header('Allow: GET, POST');
        unassignedRespond(['success' => false, 'message' => 'Only GET and POST requests are allowed'], 405);
    }

    $input = json_decode((string) file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($input)) {
        unassignedRespond(['success' => false, 'message' => 'Request body must be valid JSON'], 400);
    }

    $targetType = strtolower(trim((string) ($input['target_type'] ?? 'all')));
    $studentId = filter_var($input['student_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $meetingDateInput = trim((string) ($input['meeting_date'] ?? $input['meetingDate'] ?? ''));
    $meetingTime = trim((string) ($input['meeting_time'] ?? $input['meetingTime'] ?? ''));
    $meetingLocation = trim((string) ($input['location'] ?? $input['meetingLocation'] ?? ''));
    $additionalMessage = trim((string) ($input['message'] ?? ''));
    if (!in_array($targetType, ['all', 'individual'], true)) {
        unassignedRespond(['success' => false, 'message' => 'Choose a valid notification target'], 400);
    }
    if ($targetType === 'individual' && $studentId === false) {
        unassignedRespond(['success' => false, 'message' => 'Select a valid unassigned student'], 400);
    }

    $meetingDate = DateTimeImmutable::createFromFormat('!Y-m-d', $meetingDateInput);
    $dateErrors = DateTimeImmutable::getLastErrors();
    if (!$meetingDate || ($dateErrors && ($dateErrors['warning_count'] > 0 || $dateErrors['error_count'] > 0))
        || $meetingDate->format('Y-m-d') !== $meetingDateInput
        || $meetingDate < new DateTimeImmutable('today')) {
        unassignedRespond(['success' => false, 'message' => 'Choose a valid meeting date that is today or later'], 400);
    }
    if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $meetingTime)) {
        unassignedRespond(['success' => false, 'message' => 'Enter a valid meeting time'], 400);
    }
    if ($meetingLocation === '' || strlen($meetingLocation) > 500 || strlen($additionalMessage) > 2000) {
        unassignedRespond(['success' => false, 'message' => 'Enter a meeting location and keep the optional message under 2,000 characters'], 400);
    }

    refreshUnassignedStudentRoster($db);

    $title = 'Unassigned student meeting';
    $message = $additionalMessage !== ''
        ? $additionalMessage
        : 'You are invited to discuss grade remediation and/or college reassignment options.';

    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start the notification transaction: ' . $db->error);
    }

    $studentName = '';
    if ($targetType === 'individual') {
        $studentLookup = $db->prepare(
            "SELECT full_name
             FROM unassigned_students
             WHERE student_id = ? AND status = 'Not assigned'
             FOR UPDATE"
        );
        if (!$studentLookup) {
            throw new RuntimeException('Unable to prepare unassigned student lookup: ' . $db->error);
        }
        $studentLookup->bind_param('i', $studentId);
        if (!$studentLookup->execute()) {
            $lookupError = $studentLookup->error;
            $studentLookup->close();
            throw new RuntimeException('Unable to load the selected unassigned student: ' . $lookupError);
        }
        $selectedStudent = $studentLookup->get_result()->fetch_assoc();
        $studentLookup->close();
        if (!$selectedStudent) {
            $db->rollback();
            unassignedRespond(['success' => false, 'message' => 'The selected student is not currently unassigned'], 422);
        }
        $studentName = trim((string) $selectedStudent['full_name']) ?: 'Selected student';

        $insert = $db->prepare(
            "INSERT INTO student_notifications (student_id, title, message, meeting_date, meeting_time, location, is_read)
             SELECT student_id, ?, ?, ?, ?, ?, 0
             FROM unassigned_students
             WHERE student_id = ? AND status = 'Not assigned'"
        );
        if (!$insert) {
            throw new RuntimeException('Unable to prepare internal notification creation: ' . $db->error);
        }
        $insert->bind_param('sssssi', $title, $message, $meetingDateInput, $meetingTime, $meetingLocation, $studentId);
    } else {
        $studentsResult = $db->query(
            "SELECT COUNT(*) AS total
             FROM unassigned_students
             WHERE status = 'Not assigned'"
        );
        if (!$studentsResult) {
            throw new RuntimeException('Unable to load unassigned students: ' . $db->error);
        }
        $unassignedCount = (int) ($studentsResult->fetch_assoc()['total'] ?? 0);
        if ($unassignedCount === 0) {
            $db->rollback();
            unassignedRespond(['success' => false, 'message' => 'There are no unassigned students to notify'], 422);
        }

        $insert = $db->prepare(
            "INSERT INTO student_notifications (student_id, title, message, meeting_date, meeting_time, location, is_read)
             SELECT student_id, ?, ?, ?, ?, ?, 0
             FROM unassigned_students
             WHERE status = 'Not assigned'"
        );
        if (!$insert) {
            throw new RuntimeException('Unable to prepare internal notification creation: ' . $db->error);
        }
        $insert->bind_param('sssss', $title, $message, $meetingDateInput, $meetingTime, $meetingLocation);
    }

    if (!$insert->execute()) {
        $insertError = $insert->error;
        $insert->close();
        throw new RuntimeException('Unable to create internal student notifications: ' . $insertError);
    }
    $createdCount = $insert->affected_rows;
    $insert->close();
    if ($createdCount === 0 || ($targetType === 'individual' && $createdCount !== 1)) {
        $db->rollback();
        $message = $targetType === 'individual'
            ? 'The selected student is no longer unassigned'
            : 'There are no unassigned students to notify';
        unassignedRespond(['success' => false, 'message' => $message], 422);
    }
    if (!$db->commit()) {
        throw new RuntimeException('Unable to save the student notifications: ' . $db->error);
    }

    $successMessage = $targetType === 'all'
        ? "Notification successfully sent to All {$createdCount} Unassigned Students"
        : "Notification successfully sent to {$studentName}";
    unassignedRespond([
        'success' => true,
        'message' => $successMessage,
        'created' => $createdCount,
    ]);
} catch (Throwable $error) {
    if (isset($db) && $db instanceof mysqli && $db->connect_errno === 0) {
        $db->rollback();
    }
    error_log('Unassigned students API failed: ' . $error->getMessage());
    unassignedRespond(['success' => false, 'message' => 'Unable to process the unassigned students request'], 500);
} finally {
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
}

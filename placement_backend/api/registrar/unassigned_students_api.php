<?php
use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function unassignedRespond(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
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

    $meetingDateInput = trim((string) ($input['meetingDate'] ?? ''));
    $meetingTime = trim((string) ($input['meetingTime'] ?? ''));
    $meetingLocation = trim((string) ($input['meetingLocation'] ?? ''));
    $additionalMessage = trim((string) ($input['message'] ?? ''));
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

    $studentsResult = $db->query(
        "SELECT full_name, email
         FROM unassigned_students
         WHERE status = 'Not assigned'
         ORDER BY full_name ASC"
    );
    if (!$studentsResult) {
        throw new RuntimeException('Unable to load unassigned student email recipients: ' . $db->error);
    }
    $students = [];
    while ($row = $studentsResult->fetch_assoc()) {
        $students[] = $row;
    }
    if (!$students) {
        unassignedRespond(['success' => false, 'message' => 'There are no unassigned students to notify'], 422);
    }

    require_once dirname(__DIR__, 3) . '/vendor/autoload.php';
    $smtpUsername = getenv('SMTP_USERNAME');
    $smtpPassword = getenv('SMTP_PASSWORD');
    if (!is_string($smtpUsername) || $smtpUsername === '' || !is_string($smtpPassword) || $smtpPassword === '') {
        throw new RuntimeException('SMTP email credentials are not configured');
    }

    $meetingDateLabel = $meetingDate->format('F j, Y');
    $meetingTimeLabel = DateTimeImmutable::createFromFormat('!H:i', $meetingTime)->format('g:i A');
    $safeLocation = htmlspecialchars($meetingLocation, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $safeMessage = nl2br(htmlspecialchars($additionalMessage, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
    $sentCount = 0;
    $failedCount = 0;
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = 'smtp.gmail.com';
    $mail->SMTPAuth = true;
    $mail->Username = $smtpUsername;
    $mail->Password = $smtpPassword;
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port = 587;
    $mail->CharSet = 'UTF-8';
    $mail->setFrom($smtpUsername, 'DTU Placement Portal');
    $mail->isHTML(true);

    foreach ($students as $student) {
        $email = trim((string) $student['email']);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $failedCount++;
            continue;
        }

        $safeName = htmlspecialchars((string) $student['full_name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $mail->clearAddresses();
        $mail->addAddress($email, (string) $student['full_name']);
        $mail->Subject = 'DTU placement follow-up meeting';
        $mail->Body = '<p>Dear ' . $safeName . ',</p>'
            . '<p>You are invited to an upcoming meeting for students who have not yet been assigned to a department. '
            . 'The meeting will discuss grade remediation and/or college reassignment options.</p>'
            . '<p><strong>Date:</strong> ' . htmlspecialchars($meetingDateLabel, ENT_QUOTES, 'UTF-8') . '<br>'
            . '<strong>Time:</strong> ' . htmlspecialchars($meetingTimeLabel, ENT_QUOTES, 'UTF-8') . '<br>'
            . '<strong>Location:</strong> ' . $safeLocation . '</p>'
            . ($safeMessage !== '' ? '<p>' . $safeMessage . '</p>' : '')
            . '<p>Please attend or contact the Office of the University Registrar if you need assistance.</p>'
            . '<p>Office of the University Registrar<br>Debre Tabor University</p>';
        $mail->AltBody = "Dear {$student['full_name']},\n\n"
            . "You are invited to an upcoming meeting for students who have not yet been assigned to a department. "
            . "The meeting will discuss grade remediation and/or college reassignment options.\n\n"
            . "Date: {$meetingDateLabel}\nTime: {$meetingTimeLabel}\nLocation: {$meetingLocation}\n"
            . ($additionalMessage !== '' ? "\n{$additionalMessage}\n" : '')
            . "\nOffice of the University Registrar\nDebre Tabor University";

        try {
            $mail->send();
            $sentCount++;
        } catch (MailException $error) {
            error_log('Unassigned student meeting email delivery failed: ' . $mail->ErrorInfo);
            $failedCount++;
        }
    }

    if ($sentCount === 0) {
        unassignedRespond([
            'success' => false,
            'message' => 'No meeting notification emails could be sent',
            'sent' => 0,
            'failed' => $failedCount,
        ], 502);
    }

    unassignedRespond([
        'success' => true,
        'message' => $failedCount === 0
            ? "Meeting notification emails sent to {$sentCount} students."
            : "Meeting notification emails sent to {$sentCount} students; {$failedCount} could not be sent.",
        'sent' => $sentCount,
        'failed' => $failedCount,
    ]);
} catch (Throwable $error) {
    error_log('Unassigned students API failed: ' . $error->getMessage());
    unassignedRespond(['success' => false, 'message' => 'Unable to process the unassigned students request'], 500);
} finally {
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
}

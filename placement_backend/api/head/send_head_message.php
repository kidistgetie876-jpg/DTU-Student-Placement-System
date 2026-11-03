<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
require_once __DIR__ . '/head_department.php';

function headSendResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') headSendResponse(['success' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') headSendResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$senderId = (int) ($_SESSION['user_id'] ?? 0);
$senderRole = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$recipientType = strtolower(trim((string) ($_POST['recipient_type'] ?? '')));
$recipientId = $_POST['recipient_id'] ?? $_POST['student_id'] ?? null;
$studentId = is_numeric($recipientId) ? (int) $recipientId : 0;
$message = trim((string) ($_POST['message'] ?? ''));

if ($senderId <= 0 || !in_array($senderRole, ['head', 'department head', 'department_head', 'head of department', 'hod', 'coordinator'], true)) headSendResponse(['success' => false, 'message' => 'Only department heads can send messages.'], 403);
if (!in_array($recipientType, ['student', 'all_students', 'registrar'], true)) headSendResponse(['success' => false, 'message' => 'Choose a valid recipient.'], 400);
if ($message === '') headSendResponse(['success' => false, 'message' => 'Enter a message before sending.'], 400);
if (strlen($message) > 10000) headSendResponse(['success' => false, 'message' => 'The message is too long.'], 400);

$db = getDbConnection();
$absoluteFilePath = null;
$transactionStarted = false;
try {
    $department = resolveHeadDepartment(
        $db,
        $_SESSION['user_id'],
        isset($_SESSION['email']) ? (string) $_SESSION['email'] : null
    );
    if (!$department) headSendResponse(['success' => false, 'message' => 'No active department is assigned to this head.'], 403);
    $departmentId = (int) $department['id'];

    $placementColumns = studentPlacementTableColumns($db, 'placement_results');
    $userColumns = studentPlacementTableColumns($db, 'users');
    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    if (!in_array('id', $userColumns, true) || !in_array('role', $userColumns, true)) {
        throw new RuntimeException('Student account identifiers are unavailable.');
    }

    $joins = '';
    if (in_array('student_id', $placementColumns, true)) {
        $studentAccountCondition = 'u.id = pr.student_id';
    } else {
        $placementAdmissionColumn = in_array('admission_number', $placementColumns, true)
            ? 'admission_number'
            : (in_array('id_number', $placementColumns, true) ? 'id_number' : null);
        $profileIdentityColumns = array_values(array_intersect(
            ['moe_admission_number', 'admission_number', 'id_number', 'student_id'],
            $studentColumns
        ));
        if ($placementAdmissionColumn === null
            || (!in_array('id_number', $userColumns, true) && !in_array('user_id', $studentColumns, true))) {
            throw new RuntimeException('Placement results cannot be matched to student accounts.');
        }

        $profileJoinConditions = array_map(
            static fn (string $column): string => "TRIM(sd.`{$column}`) = TRIM(pr.`{$placementAdmissionColumn}`)",
            $profileIdentityColumns
        );
        if ($profileJoinConditions) {
            $joins .= ' LEFT JOIN student_data sd ON (' . implode(' OR ', $profileJoinConditions) . ')';
        }

        $accountJoinConditions = [];
        if (in_array('user_id', $studentColumns, true)) {
            $accountJoinConditions[] = 'u.id = sd.user_id';
        }
        if (in_array('id_number', $userColumns, true)) {
            $accountJoinConditions[] = "TRIM(u.id_number) = TRIM(pr.`{$placementAdmissionColumn}`)";
            foreach ($profileIdentityColumns as $column) {
                $accountJoinConditions[] = "TRIM(u.id_number) = TRIM(sd.`{$column}`)";
            }
        }
        if (!$accountJoinConditions) {
            throw new RuntimeException('Placement results cannot be matched to student accounts.');
        }
        $studentAccountCondition = '(' . implode(' OR ', $accountJoinConditions) . ')';
    }

    $departmentColumn = in_array('dept_id', $placementColumns, true)
        ? 'dept_id'
        : (in_array('department_id', $placementColumns, true)
            ? 'department_id'
            : (in_array('dept_name', $placementColumns, true) ? 'dept_name' : null));
    if ($departmentColumn === null) {
        throw new RuntimeException('Placement results cannot be matched to the assigned department.');
    }
    $departmentCondition = $departmentColumn === 'dept_name'
        ? "LOWER(TRIM(pr.`{$departmentColumn}`)) = LOWER(TRIM(?))"
        : "pr.`{$departmentColumn}` = ?";
    $departmentValue = $departmentColumn === 'dept_name'
        ? (string) $department['name']
        : $departmentId;
    $departmentType = $departmentColumn === 'dept_name' ? 's' : 'i';
    $loadDepartmentStudents = static function (?int $onlyStudentId = null) use (
        $db,
        $joins,
        $studentAccountCondition,
        $departmentCondition,
        $departmentValue,
        $departmentType
    ): array {
        $studentCondition = $onlyStudentId === null ? '' : ' AND u.id = ?';
        $statement = $db->prepare(
            'SELECT DISTINCT u.id AS student_id FROM placement_results pr'
            . $joins
            . " INNER JOIN users u ON {$studentAccountCondition}"
            . " AND LOWER(TRIM(u.role)) = 'student'"
            . " WHERE {$departmentCondition}{$studentCondition}"
        );
        if (!$statement) {
            throw new RuntimeException('Unable to prepare department student lookup: ' . $db->error);
        }
        if ($onlyStudentId === null) {
            $statement->bind_param($departmentType, $departmentValue);
        } else {
            $statement->bind_param($departmentType . 'i', $departmentValue, $onlyStudentId);
        }
        if (!$statement->execute()) {
            $error = $statement->error;
            $statement->close();
            throw new RuntimeException('Unable to load department students: ' . $error);
        }
        $result = $statement->get_result();
        $studentIds = [];
        while ($row = $result->fetch_assoc()) {
            $studentIds[] = (int) $row['student_id'];
        }
        $statement->close();
        return $studentIds;
    };

    $recipientRole = $recipientType === 'registrar' ? 'registrar' : 'student';
    $recipientIds = [];
    if ($recipientType === 'student') {
        if ($studentId <= 0) headSendResponse(['success' => false, 'message' => 'Select a student recipient.'], 400);
        $recipientIds = $loadDepartmentStudents($studentId);
        if (!$recipientIds) headSendResponse(['success' => false, 'message' => 'The selected student is not assigned to your department.'], 403);
    } elseif ($recipientType === 'all_students') {
        $recipientIds = $loadDepartmentStudents();
        if (!$recipientIds) headSendResponse(['success' => false, 'message' => 'No students are assigned to your department.'], 400);
    } else {
        $recipientIds[] = null;
    }

    $filePath = null;
    if (isset($_FILES['report_file']) && $_FILES['report_file']['error'] !== UPLOAD_ERR_NO_FILE) {
        $file = $_FILES['report_file'];
        $allowedExtensions = ['pdf', 'xls', 'xlsx', 'doc', 'docx'];
        $extension = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
        if ($file['error'] !== UPLOAD_ERR_OK || !in_array($extension, $allowedExtensions, true)) {
            headSendResponse(['success' => false, 'message' => 'Only PDF, Excel, or Word files are allowed.'], 400);
        }
        if ((int) $file['size'] > 10 * 1024 * 1024) {
            headSendResponse(['success' => false, 'message' => 'Attachments must be 10 MB or smaller.'], 400);
        }

        $uploadDirectory = __DIR__ . '/../../uploads/reports';
        if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0750, true)) {
            throw new Exception('Unable to prepare report storage.');
        }
        $storedName = bin2hex(random_bytes(16)) . '.' . $extension;
        $absoluteFilePath = $uploadDirectory . '/' . $storedName;
        if (!move_uploaded_file($file['tmp_name'], $absoluteFilePath)) {
            $absoluteFilePath = null;
            throw new Exception('Unable to save the attachment.');
        }
        $filePath = 'uploads/reports/' . $storedName;
    }

    $db->begin_transaction();
    $transactionStarted = true;
    $statement = $db->prepare('INSERT INTO notifications (sender_id, sender_role, recipient_id, recipient_role, department_id, title, message, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    if (!$statement) throw new Exception('Unable to prepare the message.');
    $title = 'Message from Department Head';
    foreach ($recipientIds as $recipientId) {
        $statement->bind_param('isisisss', $senderId, $senderRole, $recipientId, $recipientRole, $departmentId, $title, $message, $filePath);
        if (!$statement->execute()) throw new Exception('Unable to save the message.');
    }
    $statement->close();
    $db->commit();
    $transactionStarted = false;
    $label = $recipientType === 'registrar' ? 'Registrar' : ($recipientType === 'all_students' ? 'all students' : 'student');
    headSendResponse(['success' => true, 'message' => "Message sent to {$label}."]);
} catch (Throwable $error) {
    if ($transactionStarted) $db->rollback();
    if ($absoluteFilePath !== null && is_file($absoluteFilePath)) unlink($absoluteFilePath);
    error_log('Head send message failed: ' . $error->getMessage());
    headSendResponse(['success' => false, 'message' => $error->getMessage()], 500);
} finally {
    $db->close();
}
?>
<?php
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../common/student_placement_schema.php';
require_once __DIR__ . '/../student/student_notification_reads.php';
header('Content-Type: application/json; charset=UTF-8');

function unassignedRespond(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function ensureUnassignedRosterSchema(mysqli $db): void
{
    $columns = [
        'student_id' => 'INT NULL',
        'admission_number' => 'VARCHAR(50) NULL',
        'id_number' => "VARCHAR(50) NOT NULL DEFAULT ''",
        'full_name' => "VARCHAR(255) NOT NULL DEFAULT ''",
        'email' => "VARCHAR(255) NOT NULL DEFAULT ''",
        'stream' => "VARCHAR(100) NOT NULL DEFAULT ''",
        'college_name' => "VARCHAR(255) NOT NULL DEFAULT ''",
        'status' => "VARCHAR(32) NOT NULL DEFAULT 'Not assigned'",
        'placement_run_at' => 'DATETIME NULL',
        'reason_code' => "VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN'",
        'reason_details' => 'TEXT NULL',
        'total_score' => 'DECIMAL(7,2) NULL',
    ];

    foreach ($columns as $column => $definition) {
        $result = $db->query("SHOW COLUMNS FROM unassigned_students LIKE '{$column}'");
        if (!$result) {
            throw new RuntimeException('Unable to inspect unassigned roster schema: ' . $db->error);
        }
        $exists = $result->num_rows > 0;
        $result->free();
        if ($exists) {
            continue;
        }

        try {
            $added = $db->query("ALTER TABLE unassigned_students ADD COLUMN `{$column}` {$definition}");
        } catch (Throwable $error) {
            $added = false;
        }
        if (!$added) {
            $check = $db->query("SHOW COLUMNS FROM unassigned_students LIKE '{$column}'");
            $wasAddedConcurrently = $check && $check->num_rows > 0;
            if ($check) {
                $check->free();
            }
            if (!$wasAddedConcurrently) {
                throw new RuntimeException("Unable to add unassigned_students.{$column}: " . $db->error);
            }
        }
    }

    $indexes = $db->query('SHOW INDEX FROM unassigned_students');
    if (!$indexes) {
        throw new RuntimeException('Unable to inspect unassigned roster indexes: ' . $db->error);
    }
    $hasUniqueStudentId = false;
    while ($index = $indexes->fetch_assoc()) {
        if ($index['Column_name'] === 'student_id' && (int) $index['Non_unique'] === 0) {
            $hasUniqueStudentId = true;
        }
    }
    $indexes->free();

    if (!$hasUniqueStudentId) {
        $duplicates = $db->query(
            'SELECT student_id FROM unassigned_students
             WHERE student_id IS NOT NULL
             GROUP BY student_id HAVING COUNT(*) > 1 LIMIT 1'
        );
        if (!$duplicates) {
            throw new RuntimeException('Unable to validate unassigned roster student IDs: ' . $db->error);
        }
        $hasDuplicates = $duplicates->num_rows > 0;
        $duplicates->free();
        if ($hasDuplicates) {
            throw new RuntimeException('Unassigned roster contains duplicate student IDs and cannot be safely indexed.');
        }
        try {
            $indexed = $db->query('ALTER TABLE unassigned_students ADD UNIQUE KEY uq_unassigned_student_id (student_id)');
        } catch (Throwable $error) {
            $indexed = false;
        }
        if (!$indexed) {
            $indexes = $db->query('SHOW INDEX FROM unassigned_students');
            $indexExists = false;
            if ($indexes) {
                while ($index = $indexes->fetch_assoc()) {
                    if ($index['Column_name'] === 'student_id' && (int) $index['Non_unique'] === 0) {
                        $indexExists = true;
                    }
                }
                $indexes->free();
            }
            if (!$indexExists) {
                throw new RuntimeException('Unable to index unassigned roster student IDs: ' . $db->error);
            }
        }
    }

    $rosterColumns = [];
    $columnResult = $db->query('SHOW COLUMNS FROM unassigned_students');
    if (!$columnResult) {
        throw new RuntimeException('Unable to read unassigned roster columns: ' . $db->error);
    }
    while ($column = $columnResult->fetch_assoc()) {
        $rosterColumns[] = $column['Field'];
    }
    $columnResult->free();

    $userColumns = [];
    $userResult = $db->query('SHOW COLUMNS FROM users');
    if (!$userResult) {
        throw new RuntimeException('Unable to read user columns for unassigned roster migration: ' . $db->error);
    }
    while ($column = $userResult->fetch_assoc()) {
        $userColumns[] = $column['Field'];
    }
    $userResult->free();

    if (
        in_array('admission_number', $rosterColumns, true)
        && in_array('id_number', $userColumns, true)
        && in_array('id', $userColumns, true)
        && in_array('role', $userColumns, true)
    ) {
        $legacyUpdates = [
            'r.student_id = u.id',
            "r.id_number = COALESCE(NULLIF(r.id_number, ''), r.admission_number)",
        ];
        if (in_array('email', $userColumns, true)) {
            $legacyUpdates[] = "r.email = COALESCE(NULLIF(r.email, ''), u.email)";
        }
        if (in_array('username', $userColumns, true)) {
            $legacyUpdates[] = "r.full_name = COALESCE(NULLIF(r.full_name, ''), u.username)";
        } elseif (in_array('first_name', $userColumns, true)) {
            $legacyUpdates[] = "r.full_name = COALESCE(NULLIF(r.full_name, ''), u.first_name)";
        }
        $updated = $db->query(
            'UPDATE unassigned_students r
             INNER JOIN users u ON TRIM(u.id_number) = TRIM(r.admission_number)
             SET ' . implode(', ', $legacyUpdates) . "
             WHERE r.student_id IS NULL AND LOWER(u.role) = 'student'"
        );
        if (!$updated) {
            throw new RuntimeException('Unable to migrate legacy unassigned roster rows: ' . $db->error);
        }
    }
}

function refreshUnassignedStudentRoster(mysqli $db): void
{
    ensureUnassignedRosterSchema($db);
    ensureUnassignedStudentIdentitySchema($db);
}

function syncUnassignedStudentStatuses(mysqli $db): void
{
    $studentColumns = studentPlacementTableColumns($db, 'student_data');
    $userColumns = studentPlacementTableColumns($db, 'users');
    $rosterColumns = studentPlacementTableColumns($db, 'unassigned_students');
    $placementColumns = studentPlacementTableColumns($db, 'placement_results');
    $statusColumns = array_values(array_filter(
        ['status', 'placement_status'],
        static fn (string $column): bool => in_array($column, $studentColumns, true)
    ));
    if (!$statusColumns) {
        return;
    }

    $studentIdentity = in_array('user_id', $studentColumns, true)
        ? 'sd.`user_id`'
        : 'NULL';
    $admissionParts = array_values(array_filter(
        ['admission_number', 'id_number'],
        static fn (string $column): bool => in_array($column, $studentColumns, true)
    ));
    if (!$admissionParts) {
        return;
    }
    $admissionExpression = count($admissionParts) === 1
        ? "sd.`{$admissionParts[0]}`"
        : 'COALESCE(' . implode(', ', array_map(
            static fn (string $column): string => "NULLIF(sd.`{$column}`, '')",
            $admissionParts
        )) . ')';

    $userJoinConditions = [];
    if (in_array('user_id', $studentColumns, true) && in_array('id', $userColumns, true)) {
        $userJoinConditions[] = 'u.id = sd.user_id';
    }
    if (in_array('id_number', $userColumns, true)) {
        $userJoinConditions[] = "TRIM(u.id_number) = TRIM({$admissionExpression})";
    }
    $userJoin = $userJoinConditions
        ? 'LEFT JOIN users u ON (' . implode(' OR ', $userJoinConditions) . ")"
            . (in_array('role', $userColumns, true) ? " AND LOWER(TRIM(u.role)) = 'student'" : '')
        : 'LEFT JOIN users u ON 1 = 0';

    $accountIdExpression = in_array('id', $userColumns, true)
        ? 'COALESCE(u.id, ' . $studentIdentity . ')'
        : $studentIdentity;
    $placementIdentityConditions = [];
    if (in_array('student_id', $placementColumns, true) && in_array('id', $userColumns, true)) {
        $placementIdentityConditions[] = "pr.student_id = {$accountIdExpression}";
    }
    if (in_array('admission_number', $placementColumns, true)) {
        $placementIdentityConditions[] = "TRIM(pr.admission_number) = TRIM({$admissionExpression})";
    }
    if (in_array('id_number', $placementColumns, true)) {
        $placementIdentityConditions[] = "TRIM(pr.id_number) = TRIM({$admissionExpression})";
    }
    $placementDepartmentConditions = [];
    if (in_array('dept_name', $placementColumns, true)) {
        $placementDepartmentConditions[] = "NULLIF(TRIM(COALESCE(pr.dept_name, '')), '') IS NOT NULL"
            . " AND LOWER(TRIM(pr.dept_name)) NOT IN ('not assigned', 'unassigned')";
    }
    foreach (['dept_id', 'department_id'] as $departmentIdColumn) {
        if (in_array($departmentIdColumn, $placementColumns, true)) {
            $placementDepartmentConditions[] = "pr.`{$departmentIdColumn}` IS NOT NULL AND pr.`{$departmentIdColumn}` > 0";
        }
    }
    $assignedPlacementCondition = $placementDepartmentConditions
        ? ' AND (' . implode(' OR ', $placementDepartmentConditions) . ')'
        : '';
    if ($assignedPlacementCondition !== '' && in_array('status', $placementColumns, true)) {
        $assignedPlacementCondition .= " AND LOWER(TRIM(COALESCE(pr.status, ''))) NOT IN ('rejected', 'cancelled', 'canceled')";
    }
    $placementExclusion = $placementIdentityConditions && $assignedPlacementCondition !== ''
        ? ' AND NOT EXISTS (SELECT 1 FROM placement_results pr WHERE ('
            . implode(' OR ', $placementIdentityConditions) . ')' . $assignedPlacementCondition . ')'
        : '';
    $nameParts = array_values(array_filter(
        ['given_name', 'father_name', 'grandfather_name', 'first_name', 'last_name'],
        static fn (string $column): bool => in_array($column, $studentColumns, true)
    ));
    $nameExpression = $nameParts
        ? "COALESCE(NULLIF(TRIM(CONCAT_WS(' ', "
            . implode(', ', array_map(static fn (string $column): string => "sd.`{$column}`", $nameParts))
            . ")), ''), 'Student')"
        : "'Student'";
    $emailExpression = in_array('email', $studentColumns, true) ? "COALESCE(sd.email, '')" : "''";
    if (in_array('email', $userColumns, true)) {
        $emailExpression = "COALESCE(NULLIF({$emailExpression}, ''), u.email, '')";
    }
    $streamExpression = in_array('field_of_study', $studentColumns, true)
        ? "COALESCE(sd.field_of_study, '')"
        : (in_array('stream', $studentColumns, true) ? "COALESCE(sd.stream, '')" : "''");
    $collegeExpression = in_array('college_name', $studentColumns, true)
        ? "COALESCE(sd.college_name, '')"
        : "''";
    $scoreExpression = in_array('cumulative_score', $studentColumns, true)
        ? 'sd.cumulative_score'
        : (in_array('cumulative_avg', $studentColumns, true) ? 'sd.cumulative_avg' : 'NULL');

    $insertValues = [
        'student_id' => $accountIdExpression,
        'admission_number' => "NULLIF(TRIM({$admissionExpression}), '')",
        'id_number' => "COALESCE(NULLIF(TRIM({$admissionExpression}), ''), '')",
        'full_name' => $nameExpression,
        'email' => $emailExpression,
        'stream' => $streamExpression,
        'college_name' => $collegeExpression,
        'status' => "'Not assigned'",
        'placement_run_at' => 'NOW()',
        'reason_code' => "'PLACEMENT_NOT_COMPLETED'",
        'reason_details' => "'{\"message\":\"Student status is explicitly marked Not assigned.\"}'",
        'total_score' => $scoreExpression,
    ];
    $insertColumns = array_values(array_filter(
        array_keys($insertValues),
        static fn (string $column): bool => in_array($column, $rosterColumns, true)
    ));
    if (!$insertColumns) {
        return;
    }

    $statusConditions = array_map(
        static fn (string $column): string => "LOWER(TRIM(COALESCE(sd.`{$column}`, ''))) IN ('not assigned', 'unassigned')",
        $statusColumns
    );
    $updates = array_values(array_filter(
        $insertColumns,
        static fn (string $column): bool => $column !== 'placement_run_at'
    ));
    $updateExpressions = array_map(
        static fn (string $column): string => "`{$column}` = VALUES(`{$column}`)",
        $updates
    );
    $sql = 'INSERT INTO unassigned_students (`' . implode('`, `', $insertColumns) . '`) '
        . 'SELECT ' . implode(', ', array_map(
            static fn (string $column): string => $insertValues[$column],
            $insertColumns
        ))
        . " FROM student_data sd {$userJoin}"
        . ' WHERE (' . implode(' OR ', $statusConditions) . ')'
        . " AND NULLIF(TRIM({$admissionExpression}), '') IS NOT NULL"
        . $placementExclusion
        . ' ON DUPLICATE KEY UPDATE ' . implode(', ', $updateExpressions);

    if (!$db->query($sql)) {
        throw new RuntimeException('Unable to sync explicitly unassigned students: ' . $db->error);
    }
}

function unassignedReasonLabel(string $reasonCode): string
{
    $labels = [
        'CAPACITY_FULL' => 'Capacity Full',
        'LOW_SCORE' => 'Low Score / Cut-off not met',
        'UNMET_PREREQUISITES' => 'Unmet Prerequisites',
        'NO_CHOICES' => 'No Department Choices',
        'NO_ELIGIBLE_DEPARTMENT' => 'No Eligible Selected Department',
        'PLACEMENT_NOT_COMPLETED' => 'Unassigned after placement run',
    ];

    return $labels[$reasonCode] ?? 'Placement reason unavailable';
}

function buildUnassignedReason(string $reasonCode, array $reasonDetails, ?float $meritScore): string
{
    switch ($reasonCode) {
        case 'LOW_SCORE':
            $score = $meritScore !== null ? number_format($meritScore, 2, '.', '') : 'unavailable';
            $cutoff = $reasonDetails['cutoffScore'] ?? null;
            return is_numeric($cutoff)
                ? "Merit score ({$score}) below cutoff (" . number_format((float) $cutoff, 2, '.', '') . ') for chosen departments'
                : "Merit score ({$score}) below cutoff for chosen departments";
        case 'NO_CHOICES':
            return 'Did not submit department choices';
        case 'CAPACITY_FULL':
            $departments = $reasonDetails['departments'] ?? [];
            return is_array($departments) && $departments
                ? 'Department capacities full for selected choices: ' . implode(', ', $departments)
                : 'Department capacities full for selected choices';
        case 'UNMET_PREREQUISITES':
            return (string) ($reasonDetails['message'] ?? 'Did not meet prerequisites for the selected departments');
        case 'NO_ELIGIBLE_DEPARTMENT':
            return (string) ($reasonDetails['message'] ?? 'No active department was available for the selected choices');
        case 'PLACEMENT_NOT_COMPLETED':
            return (string) ($reasonDetails['message'] ?? 'Placement was not completed for this student');
        default:
            return (string) ($reasonDetails['message'] ?? 'Placement reason is unavailable');
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
$operationStage = 'request';

try {
    if ($method === 'GET') {
        $operationStage = 'refreshing roster';
        refreshUnassignedStudentRoster($db);

        $operationStage = 'syncing explicitly unassigned student statuses';
        syncUnassignedStudentStatuses($db);

        $operationStage = 'loading roster';
        $rosterColumns = studentPlacementTableColumns($db, 'unassigned_students');
        $choiceColumns = studentPlacementTableColumns($db, 'student_choices');
        $departmentColumns = studentPlacementTableColumns($db, 'departments');
        $choiceIdentityConditions = [];
        if (in_array('student_id', $choiceColumns, true)) {
            $choiceIdentityConditions[] = 'sc.student_id = us.student_id';
        }
        if (in_array('user_id', $choiceColumns, true)) {
            $choiceIdentityConditions[] = 'sc.user_id = us.student_id';
        }
        foreach (['admission_number', 'id_number'] as $identityColumn) {
            if (in_array($identityColumn, $choiceColumns, true)) {
                $rosterIdentity = in_array('admission_number', $rosterColumns, true)
                    ? "COALESCE(NULLIF(us.admission_number, ''), us.id_number)"
                    : 'us.id_number';
                $choiceIdentityConditions[] = "TRIM(sc.`{$identityColumn}`) = TRIM({$rosterIdentity})";
            }
        }
        $choiceDepartmentColumn = in_array('dept_id', $choiceColumns, true)
            ? 'dept_id'
            : (in_array('department_id', $choiceColumns, true) ? 'department_id' : '');
        $choiceDepartmentJoin = '';
        if ($choiceDepartmentColumn !== '' && in_array('id', $departmentColumns, true)) {
            $choiceDepartmentJoin = " LEFT JOIN departments d ON d.id = sc.`{$choiceDepartmentColumn}`";
        }
        $collegeFallback = "''";
        if ($choiceIdentityConditions && $choiceColumns) {
            $choiceCollege = studentPlacementTextExpression($choiceColumns, 'sc', ['college_name']);
            if ($choiceDepartmentJoin !== '' && in_array('college_name', $departmentColumns, true)) {
                $choiceCollege = "COALESCE(NULLIF({$choiceCollege}, ''), NULLIF(d.college_name, ''), '')";
            }
            $choicePriority = in_array('priority', $choiceColumns, true) ? 'sc.priority' : '99';
            $collegeFallback = '(SELECT ' . $choiceCollege
                . " FROM student_choices sc{$choiceDepartmentJoin}"
                . ' WHERE (' . implode(' OR ', $choiceIdentityConditions) . ')'
                . " ORDER BY {$choicePriority} ASC LIMIT 1)";
        }
        $collegeExpression = "COALESCE(NULLIF(us.college_name, ''), NULLIF({$collegeFallback}, ''), '')";
        $result = $db->query(
            "SELECT us.student_id, us.admission_number, us.id_number, us.full_name,
                    COALESCE(NULLIF(us.email, ''), 'No Email') AS email,
                    us.stream, {$collegeExpression} AS college_name, us.status,
                    us.reason_code, us.reason_details, us.total_score, us.placement_run_at
             FROM unassigned_students us
             WHERE us.status = 'Not assigned'
               AND us.placement_run_at IS NOT NULL
               AND us.reason_code IN (
                   'CAPACITY_FULL', 'LOW_SCORE', 'UNMET_PREREQUISITES',
                   'NO_CHOICES', 'NO_ELIGIBLE_DEPARTMENT', 'PLACEMENT_NOT_COMPLETED'
               )
             ORDER BY us.placement_run_at DESC, us.full_name ASC"
        );
        if (!$result) {
            throw new RuntimeException('Unable to load unassigned students: ' . $db->error);
        }

        $students = [];
        while ($row = $result->fetch_assoc()) {
            $studentId = $row['student_id'] !== null ? (int) $row['student_id'] : null;
            $admissionNumber = trim((string) ($row['admission_number'] ?? $row['id_number'] ?? ''));
            $operationStage = 'reading placement outcome for student ' . ($studentId ?? $admissionNumber);
            $reasonCode = (string) ($row['reason_code'] ?? 'UNKNOWN');
            $reasonDetails = [];
            if (!empty($row['reason_details'])) {
                $decodedDetails = json_decode((string) $row['reason_details'], true);
                if (!is_array($decodedDetails)) {
                    throw new RuntimeException('Invalid saved unassignment reason details for student ' . (int) $row['student_id']);
                }
                $reasonDetails = $decodedDetails;
            }
            $totalScore = $row['total_score'] !== null ? (float) $row['total_score'] : null;
            $collegeName = (string) $row['college_name'];
            $students[] = [
                'studentId' => $studentId ?? $admissionNumber,
                'idNumber' => (string) $row['id_number'],
                'admissionNumber' => $admissionNumber,
                'accountLinked' => $studentId !== null,
                'fullName' => (string) $row['full_name'],
                'email' => (string) $row['email'],
                'stream' => (string) $row['stream'],
                'college' => $collegeName,
                'college_name' => $collegeName,
                'status' => (string) $row['status'],
                'reasonCode' => $reasonCode,
                'reason' => unassignedReasonLabel($reasonCode),
                'reasonDetails' => $reasonDetails,
                'unassigned_reason' => buildUnassignedReason($reasonCode, $reasonDetails, $totalScore),
                'totalScore' => $totalScore,
                'cutoffScore' => isset($reasonDetails['cutoffScore']) && is_numeric($reasonDetails['cutoffScore'])
                    ? (float) $reasonDetails['cutoffScore']
                    : null,
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
            fputcsv($output, ['Student ID', 'Full Name', 'Email', 'Stream', 'College', 'Status', 'Reason for Unassignment', 'Reason Details', 'Total Score']);
            foreach ($students as $student) {
                $reasonDetails = $student['reasonDetails']['departments'] ?? null;
                if (is_array($reasonDetails)) {
                    $reasonDetails = implode(', ', $reasonDetails);
                } else {
                    $reasonDetails = $student['reasonDetails']['message'] ?? '';
                }
                $values = [
                    $student['idNumber'] !== '' ? $student['idNumber'] : $student['studentId'],
                    $student['fullName'],
                    $student['email'],
                    $student['stream'],
                    $student['college'],
                    $student['status'],
                    $student['unassigned_reason'],
                    $reasonDetails,
                    $student['totalScore'] ?? '',
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
    $recipientId = trim((string) ($input['recipient_id'] ?? $input['student_id'] ?? ''));
    $meetingDateInput = trim((string) ($input['meeting_date'] ?? $input['meetingDate'] ?? ''));
    $meetingTime = trim((string) ($input['meeting_time'] ?? $input['meetingTime'] ?? ''));
    $meetingLocation = trim((string) ($input['location'] ?? $input['meetingLocation'] ?? ''));
    $additionalMessage = trim((string) ($input['message'] ?? ''));
    if (!in_array($targetType, ['all', 'individual'], true)) {
        unassignedRespond(['success' => false, 'message' => 'Choose a valid notification target'], 400);
    }
    if ($targetType === 'individual' && $recipientId === '') {
        unassignedRespond(['success' => false, 'message' => 'Choose an unassigned student to notify'], 400);
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
    ensureStudentMeetingNotificationSchema($db);

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
            "SELECT student_id, admission_number, id_number, full_name
             FROM unassigned_students
             WHERE status = 'Not assigned'
               AND (student_id = ? OR admission_number = ? OR id_number = ?)
             FOR UPDATE"
        );
        if (!$studentLookup) {
            throw new RuntimeException('Unable to prepare unassigned student lookup: ' . $db->error);
        }
        $studentLookup->bind_param('sss', $recipientId, $recipientId, $recipientId);
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
        $recipientStudentId = $selectedStudent['student_id'] !== null
            ? (string) $selectedStudent['student_id']
            : '';
        $recipientAdmissionNumber = trim((string) (
            $selectedStudent['admission_number'] ?: $selectedStudent['id_number']
        ));
        if ($recipientStudentId === '' && $recipientAdmissionNumber === '') {
            $db->rollback();
            unassignedRespond(['success' => false, 'message' => 'The selected student has no account or admission number to identify the notification recipient'], 422);
        }

        $insert = $db->prepare(
            "INSERT INTO student_notifications
                (student_id, admission_number, title, message, meeting_date, meeting_time, location, is_read)
             VALUES (NULLIF(?, ''), NULLIF(?, ''), ?, ?, ?, ?, ?, 0)"
        );
        if (!$insert) {
            throw new RuntimeException('Unable to prepare internal notification creation: ' . $db->error);
        }
        $insert->bind_param(
            'sssssss',
            $recipientStudentId,
            $recipientAdmissionNumber,
            $title,
            $message,
            $meetingDateInput,
            $meetingTime,
            $meetingLocation
        );
    } else {
        $insert = $db->prepare(
            "INSERT INTO student_notifications
                (student_id, admission_number, title, message, meeting_date, meeting_time, location, is_read)
             SELECT student_id, COALESCE(NULLIF(admission_number, ''), NULLIF(id_number, '')),
                    ?, ?, ?, ?, ?, 0
             FROM unassigned_students
             WHERE status = 'Not assigned'
               AND (student_id IS NOT NULL
                    OR NULLIF(admission_number, '') IS NOT NULL
                    OR NULLIF(id_number, '') IS NOT NULL)"
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
            : 'There are no identifiable unassigned students to notify';
        unassignedRespond(['success' => false, 'message' => $message], 422);
    }
    if (!$db->commit()) {
        throw new RuntimeException('Unable to save the student notifications: ' . $db->error);
    }

    $successMessage = $targetType === 'all'
        ? "Notification queued for {$createdCount} unassigned students"
        : "Notification queued for {$studentName}";
    unassignedRespond([
        'success' => true,
        'message' => $successMessage,
        'created' => $createdCount,
    ]);
} catch (Throwable $error) {
    if (isset($db) && $db instanceof mysqli && $db->connect_errno === 0) {
        $db->rollback();
    }
    error_log('Unassigned students API failed during ' . $operationStage . ': ' . $error->getMessage());
    unassignedRespond([
        'success' => false,
        'message' => 'Unable to process the unassigned students request: ' . $error->getMessage(),
        'stage' => $operationStage,
    ], 500);
} finally {
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
}

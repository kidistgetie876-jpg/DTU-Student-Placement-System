<?php
function resolveStudentSessionUserId(mysqli $db, array $session): int
{
    $rawUserId = trim((string) ($session['user_id'] ?? ''));
    if ($rawUserId !== '' && ctype_digit($rawUserId)) {
        $statement = $db->prepare(
            "SELECT id FROM users
             WHERE id = ? AND LOWER(TRIM(role)) = 'student'
             LIMIT 1"
        );
        if (!$statement) {
            throw new RuntimeException('Unable to prepare student identity lookup: ' . $db->error);
        }
        $numericUserId = (int) $rawUserId;
        $statement->bind_param('i', $numericUserId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Unable to resolve student identity: ' . $db->error);
        }
        $row = $statement->get_result()->fetch_assoc();
        $statement->close();
        if ($row) {
            return (int) $row['id'];
        }
    }

    $role = strtolower(trim((string) ($session['role'] ?? '')));
    $admissionNumber = trim((string) ($session['admission_number'] ?? ''));
    if ($admissionNumber === '' && $role === 'student') {
        $admissionNumber = $rawUserId;
    }
    if ($admissionNumber === '') {
        return 0;
    }

    $statement = $db->prepare(
        "SELECT id FROM users
         WHERE id_number = ? AND LOWER(role) = 'student'
         LIMIT 1"
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare student identity lookup: ' . $db->error);
    }
    if (!$statement->bind_param('s', $admissionNumber)) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to bind student identity lookup: ' . $error);
    }
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to resolve student identity: ' . $error);
    }

    $row = $statement->get_result()->fetch_assoc();
    $statement->close();

    return (int) ($row['id'] ?? 0);
}

function isStudentNotificationSession(mysqli $db, array $session): bool
{
    $role = strtolower(trim((string) ($session['role'] ?? '')));
    if ($role === 'student') {
        return true;
    }
    if ($role !== '') {
        return false;
    }

    $rawUserId = trim((string) ($session['user_id'] ?? ''));
    if ($rawUserId !== '' && ctype_digit($rawUserId)) {
        $statement = $db->prepare(
            "SELECT 1 FROM users
             WHERE id = ? AND LOWER(TRIM(role)) = 'student'
             LIMIT 1"
        );
        if (!$statement) {
            throw new RuntimeException('Unable to prepare student session verification: ' . $db->error);
        }
        $userId = (int) $rawUserId;
        $statement->bind_param('i', $userId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Unable to verify student session: ' . $db->error);
        }
        $isStudent = $statement->get_result()->num_rows > 0;
        $statement->close();
        return $isStudent;
    }

    $admissionNumber = trim((string) ($session['admission_number'] ?? $rawUserId));
    if ($admissionNumber === '') {
        return false;
    }
    $statement = $db->prepare(
        "SELECT 1
         FROM student_data sd
         LEFT JOIN users u
           ON u.id_number = sd.admission_number
          AND LOWER(TRIM(u.role)) = 'student'
         WHERE TRIM(sd.admission_number) = TRIM(?)
         LIMIT 1"
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare student profile verification: ' . $db->error);
    }
    $statement->bind_param('s', $admissionNumber);
    if (!$statement->execute()) {
        $statement->close();
        throw new RuntimeException('Unable to verify student profile: ' . $db->error);
    }
    $isStudent = $statement->get_result()->num_rows > 0;
    $statement->close();
    return $isStudent;
}

function ensureStudentNotificationReadsTable(mysqli $db): void
{
    $created = $db->query(
        'CREATE TABLE IF NOT EXISTS student_notification_reads (
            student_id INT NOT NULL,
            notification_id INT NOT NULL,
            read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (student_id, notification_id),
            KEY idx_student_notification_reads_notification (notification_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    if (!$created) {
        throw new Exception('Unable to prepare notification read status storage.');
    }
}

function ensureStudentAdmissionNotificationReadsTable(mysqli $db): void
{
    $created = $db->query(
        'CREATE TABLE IF NOT EXISTS student_admission_notification_reads (
            admission_number VARCHAR(100) NOT NULL,
            notification_id INT NOT NULL,
            read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (admission_number, notification_id),
            KEY idx_student_admission_notification_reads_notification (notification_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    if (!$created) {
        throw new Exception('Unable to prepare admission-based notification read status storage.');
    }
}

function studentNotificationTableExists(mysqli $db, string $table): bool
{
    if (!preg_match('/^[a-z_]+$/i', $table)) {
        throw new InvalidArgumentException('Invalid notification table name.');
    }
    $statement = $db->prepare(
        'SELECT 1 FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?
         LIMIT 1'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to inspect notification storage: ' . $db->error);
    }
    $statement->bind_param('s', $table);
    if (!$statement->execute()) {
        $statement->close();
        throw new RuntimeException('Unable to inspect notification storage: ' . $db->error);
    }
    $exists = $statement->get_result()->num_rows > 0;
    $statement->close();
    return $exists;
}

function ensureStudentMeetingNotificationSchema(mysqli $db): void
{
    if (!studentNotificationTableExists($db, 'student_notifications')) {
        $created = $db->query(
            'CREATE TABLE student_notifications (
                id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                student_id INT NULL,
                admission_number VARCHAR(100) NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                meeting_date DATE NOT NULL,
                meeting_time TIME NOT NULL,
                location VARCHAR(500) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                is_read TINYINT(1) NOT NULL DEFAULT 0,
                KEY idx_student_notifications_student_read (student_id, is_read, created_at),
                KEY idx_student_notifications_admission (admission_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        if (!$created) {
            throw new RuntimeException('Unable to create meeting notification storage: ' . $db->error);
        }
        return;
    }

    $columns = $db->query('SHOW COLUMNS FROM student_notifications');
    if (!$columns) {
        throw new RuntimeException('Unable to inspect meeting notification storage: ' . $db->error);
    }
    $studentIdNullable = false;
    $hasAdmissionNumber = false;
    while ($column = $columns->fetch_assoc()) {
        if ($column['Field'] === 'student_id') {
            $studentIdNullable = $column['Null'] === 'YES';
        }
        if ($column['Field'] === 'admission_number') {
            $hasAdmissionNumber = true;
        }
    }
    $columns->free();

    if (!$studentIdNullable && !$db->query('ALTER TABLE student_notifications MODIFY student_id INT NULL')) {
        throw new RuntimeException('Unable to allow queued meeting notifications: ' . $db->error);
    }
    if (!$hasAdmissionNumber && !$db->query('ALTER TABLE student_notifications ADD COLUMN admission_number VARCHAR(100) NULL AFTER student_id')) {
        throw new RuntimeException('Unable to store admission-number meeting recipients: ' . $db->error);
    }

    $indexes = $db->query('SHOW INDEX FROM student_notifications');
    if (!$indexes) {
        throw new RuntimeException('Unable to inspect meeting notification indexes: ' . $db->error);
    }
    $hasAdmissionIndex = false;
    while ($index = $indexes->fetch_assoc()) {
        if ($index['Column_name'] === 'admission_number') {
            $hasAdmissionIndex = true;
        }
    }
    $indexes->free();
    if (!$hasAdmissionIndex && !$db->query('ALTER TABLE student_notifications ADD INDEX idx_student_notifications_admission (admission_number)')) {
        throw new RuntimeException('Unable to index admission-number meeting recipients: ' . $db->error);
    }
}
?>

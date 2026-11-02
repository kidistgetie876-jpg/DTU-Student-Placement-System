<?php

require_once __DIR__ . '/student_placement_schema.php';

function ensureStudentPlacementNotificationSchema(mysqli $db): void
{
    $created = $db->query(
        'CREATE TABLE IF NOT EXISTS student_notifications (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            student_id INT NULL,
            admission_number VARCHAR(100) NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            notification_type VARCHAR(40) NOT NULL DEFAULT \'meeting\',
            placement_semester TINYINT UNSIGNED NULL,
            placement_result_id BIGINT UNSIGNED NULL,
            meeting_date DATE NULL,
            meeting_time TIME NULL,
            location VARCHAR(500) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            is_read TINYINT(1) NOT NULL DEFAULT 0,
            KEY idx_student_notifications_student_read (student_id, is_read, created_at),
            KEY idx_student_notifications_admission (admission_number),
            KEY idx_student_notifications_placement_result (placement_result_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    if (!$created) {
        throw new RuntimeException('Unable to prepare student placement notification storage: ' . $db->error);
    }

    $columns = studentPlacementTableColumns($db, 'student_notifications');
    $columnDefinitions = [
        'admission_number' => 'VARCHAR(100) NULL AFTER student_id',
        'notification_type' => "VARCHAR(40) NOT NULL DEFAULT 'meeting' AFTER message",
        'placement_semester' => 'TINYINT UNSIGNED NULL AFTER notification_type',
        'placement_result_id' => 'BIGINT UNSIGNED NULL AFTER placement_semester',
        'meeting_date' => 'DATE NULL',
        'meeting_time' => 'TIME NULL',
        'location' => 'VARCHAR(500) NULL',
    ];
    foreach ($columnDefinitions as $column => $definition) {
        if (in_array($column, $columns, true)) {
            continue;
        }
        if (!$db->query("ALTER TABLE student_notifications ADD COLUMN `{$column}` {$definition}")) {
            throw new RuntimeException(
                "Unable to add {$column} to student notification storage: " . $db->error
            );
        }
    }

    $definitions = [];
    $studentIdResult = $db->query("SHOW COLUMNS FROM student_notifications LIKE 'student_id'");
    if (!$studentIdResult) {
        throw new RuntimeException('Unable to inspect student notification identifiers: ' . $db->error);
    }
    $studentIdColumn = $studentIdResult->fetch_assoc();
    $studentIdResult->free();
    if ($studentIdColumn && $studentIdColumn['Null'] !== 'YES') {
        $definitions[] = 'MODIFY student_id INT NULL';
    }
    foreach (['meeting_date' => 'DATE', 'meeting_time' => 'TIME', 'location' => 'VARCHAR(500)'] as $column => $type) {
        $columnResult = $db->query("SHOW COLUMNS FROM student_notifications LIKE '{$column}'");
        if (!$columnResult) {
            throw new RuntimeException("Unable to inspect {$column} notification storage: " . $db->error);
        }
        $definition = $columnResult->fetch_assoc();
        $columnResult->free();
        if ($definition && $definition['Null'] !== 'YES') {
            $definitions[] = "MODIFY `{$column}` {$type} NULL";
        }
    }
    if ($definitions && !$db->query('ALTER TABLE student_notifications ' . implode(', ', $definitions))) {
        throw new RuntimeException('Unable to update student notification storage: ' . $db->error);
    }
}

function createStudentPlacementNotification(
    mysqli $db,
    ?int $studentId,
    string $admissionNumber,
    int $semester,
    string $event,
    string $message,
    ?int $placementResultId = null
): void {
    $notificationTypes = ['placement_run', 'placement_assigned', 'placement_approved', 'placement_published'];
    if (!in_array($event, $notificationTypes, true) || !in_array($semester, [1, 2], true)) {
        throw new InvalidArgumentException('Invalid placement notification details.');
    }

    $admissionNumber = trim($admissionNumber);
    if (($studentId === null || $studentId <= 0) && $admissionNumber === '') {
        throw new InvalidArgumentException('A student identifier is required for placement notifications.');
    }

    $titles = [
        'placement_run' => 'Placement run completed',
        'placement_assigned' => 'Placement assigned',
        'placement_approved' => 'Placement approved',
        'placement_published' => 'Placement result published',
    ];
    $studentId = $studentId !== null && $studentId > 0 ? $studentId : null;
    $placementResultId = $placementResultId !== null && $placementResultId > 0
        ? $placementResultId
        : null;
    $title = $titles[$event];
    $statement = $db->prepare(
        'INSERT INTO student_notifications
            (student_id, admission_number, title, message, notification_type,
             placement_semester, placement_result_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    if (!$statement) {
        throw new RuntimeException('Unable to prepare placement notification: ' . $db->error);
    }

    $statement->bind_param(
        'issssii',
        $studentId,
        $admissionNumber,
        $title,
        $message,
        $event,
        $semester,
        $placementResultId
    );
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to save placement notification: ' . $error);
    }
    $statement->close();
}

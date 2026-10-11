<?php
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
?>

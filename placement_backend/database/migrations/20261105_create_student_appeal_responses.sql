CREATE TABLE IF NOT EXISTS student_appeal_responses (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    appeal_id INT NOT NULL,
    sender_user_id INT NULL,
    sender_role VARCHAR(40) NOT NULL,
    sender_name VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    legacy_response TINYINT NULL DEFAULT NULL,
    UNIQUE KEY uq_student_appeal_legacy_response (appeal_id, legacy_response),
    KEY idx_student_appeal_responses_history (appeal_id, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO student_appeal_responses (
    appeal_id,
    sender_role,
    sender_name,
    message,
    created_at,
    legacy_response
)
SELECT id, 'registrar', 'Registrar', response, created_at, 1
FROM student_appeals
WHERE TRIM(COALESCE(response, '')) <> '';

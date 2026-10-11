<?php
function ensurePasswordResetTokensTable(mysqli $db): void
{
    $created = $db->query(
        'CREATE TABLE IF NOT EXISTS password_reset_tokens (
            user_id INT NOT NULL PRIMARY KEY,
            code_hash VARCHAR(255) NOT NULL,
            expires_at DATETIME NOT NULL,
            attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_password_reset_tokens_expires_at (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    if (!$created) {
        throw new RuntimeException('Unable to prepare password reset storage: ' . $db->error);
    }
}

function passwordResetResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}
?>

<?php
require_once __DIR__ . '/../config/db_config.php';

$db = getDbConnection();
if (!($db instanceof mysqli)) {
    die("Database connection failed.");
}

// ትክክለኛውን የ BCRYPT Hash ለ '12345678' ማዘጋጀት
$hashedPassword = password_hash('12345678', PASSWORD_BCRYPT);

$stmt = $db->prepare("UPDATE users SET password = ?");
if ($stmt) {
    $stmt->bind_param("s", $hashedPassword);
    if ($stmt->execute()) {
        echo "<h2>Success! All user passwords have been securely hashed to '12345678'.</h2>";
        echo "<p>You can now go back to login and sign in successfully.</p>";
    } else {
        echo "Error updating: " . $stmt->error;
    }
    $stmt->close();
}
$db->close();
?>
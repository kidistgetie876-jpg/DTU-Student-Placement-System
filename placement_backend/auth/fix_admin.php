<?php
include __DIR__ . '/../config/db_config.php';
$db = getDbConnection();

// አዲሱን Hash በ PHP መፍጠር
$new_hash = password_hash('123456', PASSWORD_BCRYPT);

// የ password Column VARCHAR(255) መሆኑን ማረጋገጥ እና አዲሱን Hash መጫን
$db->query("ALTER TABLE users MODIFY password VARCHAR(255) NOT NULL");
$stmt = $db->prepare("UPDATE users SET password = ?, role = 'admin' WHERE email = 'kidistgetie876@gmail.com'");
$stmt->bind_param("s", $new_hash);

if ($stmt->execute()) {
    echo "<h2>SUCCESS! Admin password successfully updated with valid hash.</h2>";
    echo "Hash created: " . htmlspecialchars($new_hash);
} else {
    echo "Error updating record: " . $db->error;
}
$stmt->close();
$db->close();
?>
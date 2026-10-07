<?php
// 1. የ CORS ማስተካከያ (ለ Credentials ሲባል በግልጽ መጠቀስ አለበት)
header("Access-Control-Allow-Origin: http://localhost:3000");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json");

// ለ OPTIONS ጥያቄ ምላሽ መስጠት
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}

include __DIR__ . '/../config/db_config.php';

$conn = getDbConnection();

$data = json_decode(file_get_contents("php://input"), true);

if (is_array($data) && isset($data['email'], $data['oldPassword'], $data['newPassword'])) {
    $email = trim((string) $data['email']);
    $oldPassword = (string) $data['oldPassword'];
    $newPassword = (string) $data['newPassword'];

    if ($email === '' || $oldPassword === '' || $newPassword === '') {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "All fields are required."]);
        exit;
    }

    if (strlen($newPassword) < 6) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "New password must be at least 6 characters."]);
        exit;
    }

    $stmt = $conn->prepare("SELECT password FROM users WHERE email = ? LIMIT 1");
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result ? $result->fetch_assoc() : null;

    if ($user) {
        
        if (password_verify($oldPassword, $user['password'])) {
            
            $hashedNewPassword = password_hash($newPassword, PASSWORD_DEFAULT);
            $update = $conn->prepare("UPDATE users SET password = ? WHERE email = ?");
            $update->bind_param('ss', $hashedNewPassword, $email);
            
            if ($update->execute()) {
                echo json_encode(["status" => "success", "message" => "Password updated successfully!"]);
            } else {
                echo json_encode(["status" => "error", "message" => "Failed to update password."]);
            }
        } else {
            echo json_encode(["status" => "error", "message" => "Current password (old) is incorrect."]);
        }
    } else {
        echo json_encode(["status" => "error", "message" => "Email not found."]);
    }
} else {
    echo json_encode(["status" => "error", "message" => "All fields are required."]);
}
?>
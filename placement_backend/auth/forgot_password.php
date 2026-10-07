<!-- <?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

include 'db_connection.php'; // የዳታቤዝ ግንኙነት ፋይልህ ስም

$data = json_decode(file_get_contents("php://input"), true);

if (isset($data['email'])) {
    $email = $data['email'];

    // 1. ተማሪው በዳታቤዝ ውስጥ መኖሩን ማረጋገጥ
    $stmt = $conn->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user) {
        // 2. ፓስወርዱን ወደ ጊዜያዊ ፓስወርድ መቀየር (ለምሳሌ: 123456)
        // ማሳሰቢያ፡ በሰርቨር ላይ ኢሜይል መላክ ከተቻለ እዚህ ጋር ነው የሚላከው
        $new_password = password_hash("123456", PASSWORD_DEFAULT);
        
        $update = $conn->prepare("UPDATE users SET password = ? WHERE email = ?");
        if ($update->execute([$new_password, $email])) {
            echo json_encode([
                "status" => "success", 
                "message" => "Password has been reset to '123456'. Please login and change it."
            ]);
        } else {
            echo json_encode(["status" => "error", "message" => "Failed to update password."]);
        }
    } else {
        echo json_encode(["status" => "error", "message" => "Email address not found."]);
    }
} else {
    echo json_encode(["status" => "error", "message" => "Please provide an email address."]);
}
?> -->
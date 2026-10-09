<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../config/db_config.php';
$db = getDbConnection();

// ============================================================
// 1. ያለምንም Composer ቀጥታ ወደ Gmail የሚልክ የ PHP Socket Function
// ============================================================
function sendDirectGmailOTP($toEmail, $otpCode) {
    $smtpServer = "ssl://smtp.gmail.com";
    $port = 465;
    
    // ያንተ የጂሜይል አድራሻ
    $senderEmail = "tsegayeaderajew021@gmail.com";
    
    // *** ጎግል የሰጠህን ባለ 16 ፊደል App Password እዚህ አስገባ (ክፍተቱን ሳትጨምር) ***
    $appPassword = "hheu ousn tetp idlt"; 

    $socket = @fsockopen($smtpServer, $port, $errno, $errstr, 12);
    if (!$socket) {
        error_log("Gmail SMTP Connection failed: $errstr");
        return false;
    }

    fgets($socket, 515);
    fputs($socket, "EHLO localhost\r\n");
    while ($line = fgets($socket, 515)) {
        if (substr($line, 3, 1) == " ") break;
    }

    fputs($socket, "AUTH LOGIN\r\n");
    fgets($socket, 515);
    fputs($socket, base64_encode($senderEmail) . "\r\n");
    fgets($socket, 515);
    fputs($socket, base64_encode(str_replace(' ', '', $appPassword)) . "\r\n");
    $authResp = fgets($socket, 515);

    if (substr($authResp, 0, 3) != '235') {
        error_log("Gmail Auth Failed: " . $authResp);
        fclose($socket);
        return false;
    }

    fputs($socket, "MAIL FROM: <$senderEmail>\r\n");
    fgets($socket, 515);
    fputs($socket, "RCPT TO: <$toEmail>\r\n");
    fgets($socket, 515);
    fputs($socket, "DATA\r\n");
    fgets($socket, 515);

    // የኢሜይሉ ውብ ዲዛይን
    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: DTU Placement Portal <$senderEmail>\r\n";
    $headers .= "To: <$toEmail>\r\n";
    $headers .= "Subject: DTU Placement Portal - Password Reset Verification Code\r\n";

    $emailBody = "
    <div style='font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffff; box-shadow: 0 4px 15px rgba(0,0,0,0.05);'>
        <div style='text-align: center; margin-bottom: 20px;'>
            <h2 style='color: #0a2d6d; margin: 0; font-size: 20px;'>DEBRE TABOR UNIVERSITY</h2>
            <p style='color: #64748b; font-size: 13px; margin: 4px 0;'>Student Department Placement System</p>
        </div>
        <div style='padding: 20px; background: #f8fafc; border-radius: 10px; text-align: center; border: 1px solid #edf2f7;'>
            <p style='color: #334155; font-size: 15px; margin: 0 0 12px; font-weight: 600;'>Your Password Reset Code:</p>
            <div style='font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0a2d6d; padding: 12px 24px; background: #e2edff; border-radius: 8px; display: inline-block; border: 2px dashed #0a2d6d;'>
                $otpCode
            </div>
            <p style='color: #94a3b8; font-size: 12px; margin-top: 15px; margin-bottom: 0;'>This code is valid for 15 minutes. Do not share it with anyone.</p>
        </div>
    </div>";

    fputs($socket, $headers . "\r\n" . $emailBody . "\r\n.\r\n");
    $sendResp = fgets($socket, 515);

    fputs($socket, "QUIT\r\n");
    fclose($socket);

    return (substr($sendResp, 0, 3) == '250');
}

// ============================================================
// 2. ዋናው API ስራ
// ============================================================
$data = json_decode(file_get_contents('php://input'), true);
$email = trim($data['email'] ?? $data['identifier'] ?? '');

if (empty($email)) {
    echo json_encode(['success' => false, 'message' => 'Please enter your registered email address.']);
    exit;
}

// ተጠቃሚውን መፈለግ
$stmt = $db->prepare("SELECT id, username, email, phone_number FROM users WHERE email = ? OR username = ? LIMIT 1");
$stmt->bind_param("ss", $email, $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();

if (!$user) {
    echo json_encode(['success' => false, 'message' => 'No account found with this email address.']);
    exit;
}

// ባለ 6-ዲጂት ሚስጥር ኮድ ማመንጨት
$code = (string)rand(100000, 999999);

// ዳታቤዝ ላይ ማስቀመጥ
$update = $db->prepare("UPDATE users SET reset_code = ?, reset_code_expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?");
$update->bind_param("si", $code, $user['id']);
$update->execute();

// ቀጥታ ወደ ጂሜይል መላክ
$emailSent = sendDirectGmailOTP($user['email'], $code);

echo json_encode([
    'success' => true,
    'message' => 'Verification code sent to ' . $user['email'] . ' successfully.',
    'email' => $user['email'],
    'verificationCode' => $code, // ለፈተና ስትሞክር በስክሪኑ ላይም እንዲታይ
    'realEmailDelivered' => $emailSent
]);

$db->close();
?>
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

require_once __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

// ============================================================
// 1. በቀጥታ ወደ ጂሜይልህ የሚልክ ፈጣን SMTP Function
// ============================================================
function sendContactEmailToSupport($senderName, $senderEmail, $subjectTitle, $messageText, $supportEmail) {
    $smtpServer = "ssl://smtp.gmail.com";
    $port = 465;
    $systemEmail = "tsegayeaderajew021@gmail.com";
    
    // የጎግል App Passwordህ (ያለ ክፍተት)
    $appPassword = "hheuousntetpidlt"; 

    $socket = @fsockopen($smtpServer, $port, $errno, $errstr, 12);
    if (!$socket) {
        error_log("SMTP Connect Failed: $errstr");
        return false;
    }

    fgets($socket, 515);
    fputs($socket, "EHLO localhost\r\n");
    while ($line = fgets($socket, 515)) {
        if (substr($line, 3, 1) == " ") break;
    }

    fputs($socket, "AUTH LOGIN\r\n");
    fgets($socket, 515);
    fputs($socket, base64_encode($systemEmail) . "\r\n");
    fgets($socket, 515);
    fputs($socket, base64_encode($appPassword) . "\r\n");
    $authResp = fgets($socket, 515);

    if (substr($authResp, 0, 3) != '235') {
        fclose($socket);
        return false;
    }

    fputs($socket, "MAIL FROM: <$systemEmail>\r\n");
    fgets($socket, 515);
    fputs($socket, "RCPT TO: <$supportEmail>\r\n");
    fgets($socket, 515);
    fputs($socket, "DATA\r\n");
    fgets($socket, 515);

    // ውብ የኢሜይል ደብዳቤ አቀራረብ
    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: DTU Contact Portal <$systemEmail>\r\n";
    $headers .= "To: <$supportEmail>\r\n";
    $headers .= "Reply-To: <$senderEmail>\r\n";
    $headers .= "Subject: [DTU Contact Form] New Message from " . htmlspecialchars($senderName) . "\r\n";

    $htmlBody = "
    <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 25px; border: 1px solid #cbd5e1; border-radius: 12px; background: #ffffff;'>
        <div style='border-bottom: 2px solid #0a2d6d; padding-bottom: 12px; margin-bottom: 20px;'>
            <h2 style='color: #0a2d6d; margin: 0;'>DEBRE TABOR UNIVERSITY</h2>
            <p style='color: #64748b; font-size: 13px; margin: 4px 0;'>Student Placement System — New Contact Message</p>
        </div>
        <div style='background: #f8fafc; padding: 18px; border-radius: 8px; margin-bottom: 20px;'>
            <p style='margin: 6px 0;'><strong>Sender Name:</strong> " . htmlspecialchars($senderName) . "</p>
            <p style='margin: 6px 0;'><strong>Sender Email:</strong> <a href='mailto:" . htmlspecialchars($senderEmail) . "'>" . htmlspecialchars($senderEmail) . "</a></p>
            <p style='margin: 6px 0;'><strong>Subject:</strong> " . htmlspecialchars($subjectTitle) . "</p>
            <p style='margin: 6px 0;'><strong>Date Received:</strong> " . date('Y-m-d H:i:s') . "</p>
        </div>
        <div style='padding: 15px; border-left: 4px solid #0a2d6d; background: #f1f5f9; border-radius: 4px;'>
            <h4 style='margin-top: 0; color: #1e293b;'>Message Body:</h4>
            <p style='color: #334155; line-height: 1.6; white-space: pre-wrap;'>" . htmlspecialchars($messageText) . "</p>
        </div>
        <div style='margin-top: 25px; text-align: center; color: #94a3b8; font-size: 11px;'>
            This message was submitted via the official Debre Tabor University Student Placement public contact form.
        </div>
    </div>";

    fputs($socket, $headers . "\r\n" . $htmlBody . "\r\n.\r\n");
    $dataResp = fgets($socket, 515);

    fputs($socket, "QUIT\r\n");
    fclose($socket);

    return (substr($dataResp, 0, 3) == '250');
}

// ============================================================
// 2. ዋናው Contact Form መቀበያ
// ============================================================
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

$name    = trim($data['name'] ?? $data['fullName'] ?? '');
$email   = trim($data['email'] ?? $data['emailAddress'] ?? '');
$subject = trim($data['subject'] ?? 'Placement Inquiry');
$message = trim($data['message'] ?? '');

if (empty($name) || empty($email) || empty($message)) {
    echo json_encode(['success' => false, 'message' => 'Please provide your name, email, and message.']);
    exit;
}

// 1. መጀመሪያ መልዕክቱን በዳታቤዝ ውስጥ ማስቀመጥ (ለታሪክ)
try {
    $db->query("CREATE TABLE IF NOT EXISTS contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150),
        email VARCHAR(150),
        subject VARCHAR(255),
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $stmt = $db->prepare("INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("ssss", $name, $email, $subject, $message);
    $stmt->execute();
} catch (Exception $e) {
    // Database save failed, continue to send email
}

// 2. በዳታቤዝ የተቀመጠውን የ Contact Email ማምጣት
$targetSupportEmail = "tsegayeaderajew021@gmail.com"; // ነባሪ
try {
    $setRes = $db->query("SELECT setting_value FROM system_settings WHERE setting_key = 'public_portal' LIMIT 1");
    if ($setRes && $row = $setRes->fetch_assoc()) {
        $settings = json_decode($row['setting_value'], true);
        if (!empty($settings['contact']['supportEmail'])) {
            $targetSupportEmail = $settings['contact']['supportEmail'];
        }
    }
} catch (Exception $e) {}

// 3. እውነተኛውን ኢሜይል ወደ ጂሜይልህ መላክ
$emailSent = sendContactEmailToSupport($name, $email, $subject, $message, $targetSupportEmail);

$db->close();

echo json_encode([
    'success' => true,
    'message' => 'Thank you! Your message has been sent to the Placement Office email successfully.',
    'emailDelivered' => $emailSent,
    'deliveredTo' => $targetSupportEmail
]);
?>
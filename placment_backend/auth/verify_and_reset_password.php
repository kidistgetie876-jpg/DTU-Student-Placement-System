<?php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204); exit;
}

require_once __DIR__ . '/../config/db_config.php';
$db = getDbConnection();

$data = json_decode(file_get_contents('php://input'), true);
$action = $data['action'] ?? 'reset'; // 'verify_only' ወይም 'reset'
$email = trim($data['email'] ?? '');
$code = trim($data['code'] ?? $data['verification_code'] ?? '');

if (empty($email) || empty($code)) {
    echo json_encode(['success' => false, 'message' => 'Email and Verification Code are required.']);
    exit;
}

// ተጠቃሚውን እና ኮዱን ማረጋገጥ
$stmt = $db->prepare("SELECT id, reset_code, reset_code_expires_at FROM users WHERE email = ? OR username = ? LIMIT 1");
$stmt->bind_param("ss", $email, $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();

if (!$user || empty($user['reset_code']) || $user['reset_code'] !== $code) {
    echo json_encode(['success' => false, 'message' => 'Invalid verification code. Please check and re-enter.']);
    exit;
}

if (strtotime($user['reset_code_expires_at']) < time()) {
    echo json_encode(['success' => false, 'message' => 'Verification code has expired. Please request a new one.']);
    exit;
}

// 1. ኮዱን ብቻ ማረጋገጥ ከሆነ (Step 2)
if ($action === 'verify_only') {
    echo json_encode(['success' => true, 'message' => 'Code verified successfully!']);
    exit;
}

// 2. አዲስ ፓስወርድ ማስቀመጥ ከሆነ (Step 3)
$newPassword = $data['newPassword'] ?? '';
$confirmPassword = $data['confirmPassword'] ?? '';

if (empty($newPassword) || strlen($newPassword) < 6) {
    echo json_encode(['success' => false, 'message' => 'Password must be at least 6 characters long.']);
    exit;
}

if ($newPassword !== $confirmPassword) {
    echo json_encode(['success' => false, 'message' => 'New passwords do not match.']);
    exit;
}

$hashed = password_hash($newPassword, PASSWORD_DEFAULT);
$update = $db->prepare("UPDATE users SET password = ?, reset_code = NULL, reset_code_expires_at = NULL WHERE id = ?");
$update->bind_param("si", $hashed, $user['id']);

if ($update->execute()) {
    echo json_encode(['success' => true, 'message' => 'Password changed successfully! You can now log in.']);
} else {
    echo json_encode(['success' => false, 'message' => 'Database error updating password.']);
}

$db->close();
?>
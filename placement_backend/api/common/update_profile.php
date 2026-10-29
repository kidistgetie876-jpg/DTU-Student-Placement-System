<?php
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function updateProfileResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    updateProfileResponse(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    updateProfileResponse(['success' => false, 'message' => 'Authentication is required.'], 401);
}

$input = $_POST;
if (!$input) {
    $jsonInput = json_decode(file_get_contents('php://input'), true);
    if (is_array($jsonInput)) {
        $input = $jsonInput;
    }
}
$fullName = trim((string) ($input['full_name'] ?? ''));
$email = trim((string) ($input['email'] ?? ''));
if ($fullName === '' || strlen($fullName) > 200) {
    updateProfileResponse(['success' => false, 'message' => 'Enter a name no longer than 200 characters.'], 400);
}
if (
    !filter_var($email, FILTER_VALIDATE_EMAIL)
    || preg_match('/^[a-zA-Z0-9._%+-]+@gmail\.com$/', $email) !== 1
    || strlen($email) > 254
) {
    updateProfileResponse(['success' => false, 'message' => 'A valid @gmail.com address is required.'], 400);
}
$email = strtolower($email);

$photo = $_FILES['profile_photo'] ?? null;
$photoExtension = null;
if ($photo && $photo['error'] !== UPLOAD_ERR_NO_FILE) {
    $uploadError = (int) ($photo['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($uploadError !== UPLOAD_ERR_OK) {
        updateProfileResponse(['success' => false, 'message' => 'The profile photo upload failed.'], 400);
    }
    if (!isset($photo['tmp_name'], $photo['size']) || (int) $photo['size'] <= 0 || (int) $photo['size'] > 5 * 1024 * 1024) {
        updateProfileResponse(['success' => false, 'message' => 'Profile photos must be 5 MB or smaller.'], 400);
    }
    if (!is_uploaded_file($photo['tmp_name'])) {
        updateProfileResponse(['success' => false, 'message' => 'Invalid profile photo upload.'], 400);
    }

    $imageHeader = file_get_contents($photo['tmp_name'], false, null, 0, 12);
    if ($imageHeader === false) {
        error_log('Unable to read the uploaded profile photo header.');
        updateProfileResponse(['success' => false, 'message' => 'Unable to validate the profile photo on the server.'], 500);
    }
    if (strncmp($imageHeader, "\xFF\xD8\xFF", 3) === 0) {
        $photoExtension = 'jpg';
    } elseif (strncmp($imageHeader, "\x89PNG\r\n\x1A\n", 8) === 0) {
        $photoExtension = 'png';
    } elseif (strncmp($imageHeader, 'RIFF', 4) === 0 && substr($imageHeader, 8, 4) === 'WEBP') {
        $photoExtension = 'webp';
    }
    if ($photoExtension === null) {
        updateProfileResponse(['success' => false, 'message' => 'Choose a JPEG, PNG, or WebP image.'], 400);
    }
}

$nameParts = preg_split('/\s+/', $fullName, 2);
$firstName = trim((string) ($nameParts[0] ?? ''));
$lastName = trim((string) ($nameParts[1] ?? ''));

try {
    $db = getDbConnection();
} catch (Throwable $error) {
    error_log('Profile update database connection failed: ' . $error->getMessage());
    updateProfileResponse(['success' => false, 'message' => 'Unable to connect to the profile database.'], 500);
}
if (!$db instanceof mysqli) {
    updateProfileResponse(['success' => false, 'message' => 'Database connection failed.'], 500);
}

$hasProfilePhotoColumn = false;
if ($photoExtension !== null) {
    try {
        $photoColumn = $db->query("SHOW COLUMNS FROM users LIKE 'profile_photo'");
    } catch (Throwable $error) {
        error_log('Unable to inspect profile photo database configuration: ' . $error->getMessage());
        $db->close();
        updateProfileResponse(['success' => false, 'message' => 'Unable to verify profile photo storage configuration.'], 500);
    }
    $hasProfilePhotoColumn = $photoColumn instanceof mysqli_result && $photoColumn->num_rows > 0;
    if ($photoColumn instanceof mysqli_result) {
        $photoColumn->free();
    }
    if (!$hasProfilePhotoColumn) {
        updateProfileResponse([
            'success' => false,
            'message' => 'Profile photo storage is not configured. Apply the user profile photo database migration first.',
        ], 503);
    }
}

$storedPhotoPath = null;
$newPhotoPath = null;
$oldPhotoPath = null;
$uploadDirectory = __DIR__ . '/../../uploads/profile-photos';
$failureStep = 'start profile update';

try {
    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start profile update transaction: ' . $db->error);
    }

    $failureStep = 'check email availability';
    $emailCheck = $db->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1');
    if (!$emailCheck) {
        throw new RuntimeException('Unable to prepare email uniqueness check: ' . $db->error);
    }
    $emailCheck->bind_param('si', $email, $userId);
    if (!$emailCheck->execute()) {
        throw new RuntimeException('Unable to check profile email uniqueness: ' . $emailCheck->error);
    }
    $emailExists = $emailCheck->get_result()->num_rows > 0;
    $emailCheck->close();
    if ($emailExists) {
        $db->rollback();
        updateProfileResponse(['success' => false, 'message' => 'This email address is already registered.'], 400);
    }

    $failureStep = 'load the current profile';
    $currentPhotoExpression = $hasProfilePhotoColumn ? 'profile_photo' : 'NULL';
    $currentProfile = $db->prepare(
        "SELECT {$currentPhotoExpression} AS profile_photo FROM users WHERE id = ? LIMIT 1"
    );
    if (!$currentProfile) {
        throw new RuntimeException('Unable to prepare current profile query: ' . $db->error);
    }
    $currentProfile->bind_param('i', $userId);
    if (!$currentProfile->execute()) {
        throw new RuntimeException('Unable to load current profile: ' . $currentProfile->error);
    }
    $currentUser = $currentProfile->get_result()->fetch_assoc();
    $currentProfile->close();
    if (!$currentUser) {
        $db->rollback();
        updateProfileResponse(['success' => false, 'message' => 'User account was not found.'], 404);
    }
    $oldPhotoPath = (string) ($currentUser['profile_photo'] ?? '');
    $storedPhotoPath = $oldPhotoPath !== '' ? $oldPhotoPath : null;

    if ($photoExtension !== null) {
        $failureStep = 'prepare profile photo storage';
        if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true) && !is_dir($uploadDirectory)) {
            throw new RuntimeException('Unable to create profile photo storage directory.');
        }
        if (!is_writable($uploadDirectory)) {
            throw new RuntimeException('Profile photo storage directory is not writable.');
        }
        $photoFileName = bin2hex(random_bytes(16)) . '.' . $photoExtension;
        $destination = $uploadDirectory . DIRECTORY_SEPARATOR . $photoFileName;
        $failureStep = 'save the profile photo';
        if (!move_uploaded_file($photo['tmp_name'], $destination)) {
            throw new RuntimeException('Unable to store the uploaded profile photo.');
        }
        $newPhotoPath = $destination;
        $storedPhotoPath = 'uploads/profile-photos/' . $photoFileName;
    }

    $failureStep = 'save profile details';
    if ($photoExtension !== null) {
        $updateUser = $db->prepare('UPDATE users SET first_name = ?, last_name = ?, email = ?, profile_photo = ? WHERE id = ?');
        if (!$updateUser) {
            throw new RuntimeException('Unable to prepare user profile update: ' . $db->error);
        }
        $updateUser->bind_param('ssssi', $firstName, $lastName, $email, $storedPhotoPath, $userId);
    } else {
        $updateUser = $db->prepare('UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?');
        if (!$updateUser) {
            throw new RuntimeException('Unable to prepare user profile update: ' . $db->error);
        }
        $updateUser->bind_param('sssi', $firstName, $lastName, $email, $userId);
    }
    if (!$updateUser->execute()) {
        throw new RuntimeException('Unable to update user profile: ' . $updateUser->error, $updateUser->errno);
    }
    $updateUser->close();

    $failureStep = 'load the updated profile';
    $profilePhotoExpression = $hasProfilePhotoColumn ? 'profile_photo' : 'NULL';
    $readProfile = $db->prepare(
        "SELECT id, first_name, last_name, username, email, role, {$profilePhotoExpression} AS profile_photo
         FROM users WHERE id = ? LIMIT 1"
    );
    if (!$readProfile) {
        throw new RuntimeException('Unable to prepare updated profile query: ' . $db->error);
    }
    $readProfile->bind_param('i', $userId);
    if (!$readProfile->execute()) {
        throw new RuntimeException('Unable to load updated profile: ' . $readProfile->error);
    }
    $profile = $readProfile->get_result()->fetch_assoc();
    $readProfile->close();

    $failureStep = 'complete the profile update';
    if (!$profile || !$db->commit()) {
        throw new RuntimeException('Unable to commit profile update: ' . $db->error);
    }

    if ($newPhotoPath !== null && preg_match('#^uploads/profile-photos/[a-f0-9]{32}\.(?:jpg|png|webp)$#', $oldPhotoPath)) {
        $oldPhotoFile = __DIR__ . '/../../' . $oldPhotoPath;
        if (is_file($oldPhotoFile) && !unlink($oldPhotoFile)) {
            error_log('Unable to remove replaced profile photo: ' . $oldPhotoFile);
        }
    }

    $profile['full_name'] = trim((string) $profile['first_name'] . ' ' . (string) $profile['last_name']);
    $updatedUser = array_merge($profile, ['email' => $email]);
    $updatedUser['profile_picture'] = $updatedUser['profile_photo'] ?? null;
    $db->close();
    updateProfileResponse([
        'success' => true,
        'message' => 'Profile updated successfully.',
        'user' => $updatedUser,
        'profile' => $updatedUser,
    ]);
} catch (Throwable $error) {
    $db->rollback();
    if ($newPhotoPath !== null && is_file($newPhotoPath) && !unlink($newPhotoPath)) {
        error_log('Unable to clean up failed profile photo upload: ' . $newPhotoPath);
    }
    error_log('Profile update failed: ' . $error->getMessage());
    $db->close();
    if ((int) $error->getCode() === 1062) {
        updateProfileResponse(['success' => false, 'message' => 'This email address is already registered.'], 400);
    }
    updateProfileResponse(['success' => false, 'message' => 'Unable to ' . $failureStep . '.'], 500);
}

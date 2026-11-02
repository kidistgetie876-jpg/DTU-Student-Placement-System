<?php

function resolveStudentRequestIdentity(
    mysqli $db,
    string $studentId,
    string $admissionNumber
): array {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    if (strtolower(trim((string) ($_SESSION['role'] ?? ''))) !== 'student') {
        if ($admissionNumber === '' && $studentId !== '' && !ctype_digit($studentId)) {
            $admissionNumber = $studentId;
        }
        return [$studentId, $admissionNumber];
    }

    $sessionUserId = trim((string) ($_SESSION['user_id'] ?? ''));
    $sessionAdmissionNumber = trim((string) ($_SESSION['admission_number'] ?? ''));
    if ($sessionAdmissionNumber === '' && $sessionUserId !== '' && !ctype_digit($sessionUserId)) {
        $sessionAdmissionNumber = $sessionUserId;
    }

    if ($sessionUserId !== '' && ctype_digit($sessionUserId)) {
        $studentId = $sessionUserId;
        if ($sessionAdmissionNumber === '') {
            $lookup = $db->prepare(
                "SELECT id_number FROM users
                 WHERE id = ? AND LOWER(TRIM(role)) = 'student'
                 LIMIT 1"
            );
            if (!$lookup) {
                throw new RuntimeException('Unable to prepare the current student identity lookup: ' . $db->error);
            }
            $userId = (int) $sessionUserId;
            $lookup->bind_param('i', $userId);
            if (!$lookup->execute()) {
                $error = $lookup->error;
                $lookup->close();
                throw new RuntimeException('Unable to resolve the current student identity: ' . $error);
            }
            $sessionAdmissionNumber = trim((string) ($lookup->get_result()->fetch_assoc()['id_number'] ?? ''));
            $lookup->close();
        }
    } elseif ($sessionUserId !== '') {
        $studentId = $sessionUserId;
    } elseif ($sessionAdmissionNumber !== '') {
        $studentId = $sessionAdmissionNumber;
    }

    if ($sessionAdmissionNumber !== '') {
        $admissionNumber = $sessionAdmissionNumber;
    }

    return [$studentId, $admissionNumber];
}

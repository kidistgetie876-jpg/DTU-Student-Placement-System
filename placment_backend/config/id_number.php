<?php

function getNextRoleIdNumber(mysqli $conn, string $role): string
{
    switch (strtolower(trim($role))) {
        case 'head':
        case 'department_head':
        case 'department head':
        case 'head of department':
        case 'hod':
            $prefix = 'DTU-HOD-';
            $highestSequence = 0;
            $digits = 3;
            $studentRole = false;
            break;
        case 'registrar':
            $prefix = 'DTU-REG-';
            $highestSequence = 0;
            $digits = 3;
            $studentRole = false;
            break;
        case 'admin':
            $prefix = 'DTU-ADM-';
            $highestSequence = 0;
            $digits = 3;
            $studentRole = false;
            break;
        default:
            $prefix = 'DTU16R';
            $highestSequence = 1000;
            $digits = 4;
            $studentRole = true;
            break;
    }

    $result = $conn->query("SELECT id_number FROM users WHERE id_number IS NOT NULL AND TRIM(id_number) <> ''");
    if (!$result) {
        throw new RuntimeException('Unable to read existing user ID numbers: ' . $conn->error);
    }

    $pattern = '/^' . preg_quote($prefix, '/') . '(\\d+)$/i';
    while ($row = $result->fetch_assoc()) {
        $roleId = trim((string)($row['id_number'] ?? ''));
        $matches = [];
        $matchesCurrentPrefix = preg_match($pattern, $roleId, $matches) === 1;
        $matchesLegacyStudentPrefix = $studentRole && preg_match('/^DTU\\d{2}[A-Z](\\d+)$/i', $roleId, $matches) === 1;
        if ($matchesCurrentPrefix || $matchesLegacyStudentPrefix) {
            $highestSequence = max($highestSequence, (int)$matches[1]);
        }
    }

    return $prefix . str_pad((string)($highestSequence + 1), $digits, '0', STR_PAD_LEFT);
}

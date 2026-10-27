<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function ministryImportRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function ministryNormalizeHeader(string $header): string
{
    return preg_replace('/[^a-z0-9]/', '', strtolower(trim($header))) ?? '';
}

function ministryRowValue(array $row, array $headers, array $aliases, $default = '')
{
    foreach ($aliases as $alias) {
        $key = ministryNormalizeHeader($alias);
        if (array_key_exists($key, $headers)) {
            return $row[$headers[$key]];
        }
    }
    return $default;
}

function ministryImportFlag($value, string $field, int $rowNumber): string
{
    $normalized = strtolower(trim((string) $value));
    if (in_array($normalized, ['yes', 'y', '1', 'true'], true)) {
        return 'Yes';
    }
    if (in_array($normalized, ['no', 'n', '0', 'false'], true)) {
        return 'No';
    }
    throw new InvalidArgumentException(
        'Row ' . $rowNumber . ' has an invalid ' . $field . ' value. Use Yes/No or 1/0.'
    );
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    ministryImportRespond(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ((int) ($_SESSION['user_id'] ?? 0) <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    ministryImportRespond(['success' => false, 'message' => 'Registrar or Admin access is required.'], 403);
}

$payload = json_decode((string) file_get_contents('php://input'), true);
$rows = is_array($payload) ? ($payload['students'] ?? $payload['records'] ?? $payload['data'] ?? null) : null;

if (!is_array($rows) || count($rows) === 0) {
    ministryImportRespond(['success' => false, 'message' => 'A non-empty students array is required.'], 400);
}

$db = null;
try {
    $db = getDbConnection();
} catch (Throwable $error) {
    error_log('MoSHE import database connection failed: ' . $error->getMessage());
}

if (!$db instanceof mysqli) {
    ministryImportRespond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

try {
    // 1. Fetch Grade 12 Base Setting safely (Default to 700 to prevent strict mark rejection)
    $grade12TotalBase = 700.00;
    $baseResult = $db->query('SELECT g12_total_base FROM placement_settings WHERE id = 1 LIMIT 1');
    if ($baseResult && $baseSettings = $baseResult->fetch_assoc()) {
        if (!empty($baseSettings['g12_total_base'])) {
            $grade12TotalBase = max(0.01, (float) $baseSettings['g12_total_base']);
        }
        $baseResult->free();
    }

    // 2. Prepare Official Student Data Statement
    $officialStatement = $db->prepare(
        "INSERT INTO student_data
            (admission_number, region, given_name, father_name, grandfather_name, sex,
             total_mark, disability, minority, field_of_study, placement_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
         ON DUPLICATE KEY UPDATE 
            region = VALUES(region), 
            given_name = VALUES(given_name),
            father_name = VALUES(father_name), 
            grandfather_name = VALUES(grandfather_name),
            sex = VALUES(sex), 
            total_mark = VALUES(total_mark), 
            disability = VALUES(disability), 
            minority = VALUES(minority),
            field_of_study = VALUES(field_of_study)"
    );

    if (!$officialStatement) {
        throw new RuntimeException('Unable to prepare official student import statement: ' . $db->error);
    }

    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start the MoSHE import transaction.');
    }

    $imported = 0;
    foreach ($rows as $index => $row) {
        if (!is_array($row)) {
            throw new InvalidArgumentException('Row ' . ($index + 1) . ' is not a valid record.');
        }

        $normalizedHeaders = [];
        foreach (array_keys($row) as $key) {
            $normalizedKey = ministryNormalizeHeader((string) $key);
            if ($normalizedKey !== '' && !array_key_exists($normalizedKey, $normalizedHeaders)) {
                $normalizedHeaders[$normalizedKey] = $key;
            }
        }

        // Header normalization accepts case and punctuation variations such as camelCase and snake_case.
        $admissionNumber = trim((string) ministryRowValue($row, $normalizedHeaders, ['AdmissionNumber', 'admission_number', 'student_id']));
        $region          = trim((string) ministryRowValue($row, $normalizedHeaders, ['Region', 'region']));
        $givenName       = trim((string) ministryRowValue($row, $normalizedHeaders, ['GivenName', 'given_name', 'first_name']));
        $fatherName      = trim((string) ministryRowValue($row, $normalizedHeaders, ['FatherName', 'father_name', 'last_name']));
        $grandFatherName = trim((string) ministryRowValue($row, $normalizedHeaders, ['GrandFatherName', 'GrandfatherName', 'grandfather_name']));

        $rawSex = strtolower(trim((string) ministryRowValue($row, $normalizedHeaders, ['Sex', 'sex', 'gender'])));
        if (in_array($rawSex, ['m', 'male'], true)) {
            $sex = 'Male';
        } elseif (in_array($rawSex, ['f', 'female'], true)) {
            $sex = 'Female';
        } else {
            throw new InvalidArgumentException('Row ' . ($index + 1) . ' has an invalid Sex value.');
        }

        $totalMarkValue = trim((string) ministryRowValue($row, $normalizedHeaders, ['TotalMark', 'total_mark', 'grade_12_result']));
        $minority = ministryImportFlag(
            ministryRowValue($row, $normalizedHeaders, ['Minority', 'minority']),
            'Minority',
            $index + 1
        );
        $disability = ministryImportFlag(
            ministryRowValue($row, $normalizedHeaders, ['Disability', 'disability']),
            'Disability',
            $index + 1
        );
        $fieldOfStudy = trim((string) ministryRowValue($row, $normalizedHeaders, ['FieldOfStudy', 'FieldOfstudy', 'field_of_study', 'stream']));

        if (
            $admissionNumber === '' || $region === '' || $givenName === '' ||
            $fatherName === '' || $grandFatherName === '' || $totalMarkValue === '' ||
            $fieldOfStudy === ''
        ) {
            throw new InvalidArgumentException('Row ' . ($index + 1) . ' is missing one or more required values.');
        }
        if (!is_numeric($totalMarkValue)) {
            throw new InvalidArgumentException('Row ' . ($index + 1) . ' has an invalid TotalMark value.');
        }

        $mark = (float) $totalMarkValue;

        $officialStatement->bind_param(
            'ssssssdsss',
            $admissionNumber,
            $region,
            $givenName,
            $fatherName,
            $grandFatherName,
            $sex,
            $mark,
            $disability,
            $minority,
            $fieldOfStudy
        );

        if (!$officialStatement->execute()) {
            throw new RuntimeException('Official student import failed on row ' . ($index + 1) . ': ' . $officialStatement->error);
        }

        $imported++;
    }

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit the MoSHE import.');
    }

    $officialStatement->close();
    $db->close();

    ministryImportRespond([
        'success'        => true,
        'message'        => "MoSHE import completed successfully. $imported records imported.",
        'imported_count' => $imported
    ]);

} catch (Throwable $error) {
    if ($db && $db instanceof mysqli) {
        $db->rollback();
        $db->close();
    }
    
    error_log('MoSHE import failed: ' . $error->getMessage());

    ministryImportRespond([
        'success' => false,
        'message' => $error->getMessage()
    ], 400);
}
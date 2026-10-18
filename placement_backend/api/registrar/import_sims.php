<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

function simsImportRespond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function simsNormalizeHeader(string $header): string
{
    return preg_replace('/[^a-z0-9]/', '', strtolower(trim($header))) ?? '';
}

function simsRowValue(array $row, array $headers, array $aliases, $default = '')
{
    foreach ($aliases as $alias) {
        $key = simsNormalizeHeader($alias);
        if (array_key_exists($key, $headers)) {
            return $row[$headers[$key]];
        }
    }
    return $default;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    simsImportRespond(['success' => false, 'message' => 'Only POST requests are allowed.'], 405);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if ((int) ($_SESSION['user_id'] ?? 0) <= 0 || !in_array($role, ['registrar', 'admin'], true)) {
    simsImportRespond(['success' => false, 'message' => 'Registrar access is required.'], 403);
}

$payload = json_decode((string) file_get_contents('php://input'), true);
$rows = is_array($payload) ? ($payload['students'] ?? $payload['records'] ?? $payload['data'] ?? null) : null;
if (!is_array($rows) || count($rows) === 0) {
    simsImportRespond(['success' => false, 'message' => 'A non-empty students array is required.'], 400);
}

$db = null;
$studentLookup = null;
$officialUpdate = null;
$transactionStarted = false;

try {
    $db = getDbConnection();
} catch (Throwable $error) {
    error_log('SIMS import database connection failed: ' . $error->getMessage());
}
if (!$db instanceof mysqli) {
    simsImportRespond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}

try {
    $studentLookup = $db->prepare(
        'SELECT admission_number
         FROM student_data
         WHERE TRIM(UPPER(admission_number)) = TRIM(UPPER(?))
         LIMIT 1'
    );
    $officialUpdate = $db->prepare(
        'UPDATE student_data
         SET cgpa = ?, coc_score = ?
         WHERE TRIM(UPPER(admission_number)) = TRIM(UPPER(?))'
    );

    if (!$studentLookup || !$officialUpdate) {
        throw new RuntimeException('Unable to prepare SIMS import statements: ' . $db->error);
    }

    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start the SIMS import transaction.');
    }
    $transactionStarted = true;
    $imported = 0;

    foreach ($rows as $index => $row) {
        if (!is_array($row)) {
            throw new InvalidArgumentException('Row ' . ($index + 1) . ' is not a valid record.');
        }
        $normalizedHeaders = [];
        foreach (array_keys($row) as $key) {
            $normalizedKey = simsNormalizeHeader((string) $key);
            if ($normalizedKey !== '' && !array_key_exists($normalizedKey, $normalizedHeaders)) {
                $normalizedHeaders[$normalizedKey] = $key;
            }
        }

        // 'admission' እና 'admission_' የተቆረጡ ስሞችን ጭምር ያካተተ alias
        $admissionNumber = trim((string) simsRowValue(
            $row,
            $normalizedHeaders,
            ['Student ID', 'admission_number', 'student_id', 'AdmissionNumber', 'admission', 'admission_']
        ));
        $cgpa = simsRowValue($row, $normalizedHeaders, ['CGPA', 'cgpa'], null);
        $cocScore = simsRowValue($row, $normalizedHeaders, ['COC Score', 'coc_score', 'cocscore'], null);

        if ($admissionNumber === '' || !is_numeric($cgpa) || (float) $cgpa < 0 || (float) $cgpa > 4) {
            throw new InvalidArgumentException('Row ' . ($index + 1) . ' must have a valid Student ID/Admission Number and CGPA between 0 and 4.');
        }
        if (!is_numeric($cocScore) || (float) $cocScore < 0 || (float) $cocScore > 30) {
            throw new InvalidArgumentException('Row ' . ($index + 1) . ' has a COC Score outside 0-30.');
        }

        $gpaValue = (float) $cgpa;
        $cocValue = (float) $cocScore;

        $studentLookup->bind_param('s', $admissionNumber);
        if (!$studentLookup->execute()) {
            throw new RuntimeException('Unable to query student on row ' . ($index + 1) . ': ' . $studentLookup->error);
        }
        $studentLookup->bind_result($matchedAdmissionNumber);
        $studentFound = $studentLookup->fetch();
        $studentLookup->free_result();

        if (!$studentFound) {
            throw new InvalidArgumentException('Row ' . ($index + 1) . ' (' . $admissionNumber . ') does not match any existing student record.');
        }

        $officialUpdate->bind_param('dds', $gpaValue, $cocValue, $admissionNumber);
        if (!$officialUpdate->execute()) {
            throw new RuntimeException('Unable to update student scores on row ' . ($index + 1) . ': ' . $officialUpdate->error);
        }

        $imported++;
    }

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit the SIMS import.');
    }
    $transactionStarted = false;
    $studentLookup->close();
    $officialUpdate->close();
    $db->close();

    simsImportRespond([
        'success' => true,
        'message' => 'SIMS import completed and student scores were successfully updated.',
        'imported_count' => $imported,
        'updated_count' => $imported,
    ]);
} catch (Throwable $error) {
    if ($transactionStarted) {
        $db->rollback();
    }
    error_log('SIMS import failed: ' . $error->getMessage());
    if ($studentLookup instanceof mysqli_stmt) {
        $studentLookup->close();
    }
    if ($officialUpdate instanceof mysqli_stmt) {
        $officialUpdate->close();
    }
    if ($db instanceof mysqli) {
        $db->close();
    }
    simsImportRespond([
        'success' => false,
        'message' => $error instanceof InvalidArgumentException ? $error->getMessage() : 'Unable to import SIMS records.',
    ], $error instanceof InvalidArgumentException ? 400 : 500);
}
<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';
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
$scoreAndIdentifierUpdate = null;
$transactionStarted = false;

try {
    $db = getDbConnection();
} catch (Throwable $error) {
    error_log('SIMS import database connection failed: ' . $error->getMessage());
}
if (!$db instanceof mysqli) {
    simsImportRespond(['success' => false, 'message' => 'Database connection is unavailable.'], 503);
}
$auditActor = getAuditActor($db);

try {
    $studentColumnsResult = $db->query('SHOW COLUMNS FROM student_data');
    if (!$studentColumnsResult) {
        throw new RuntimeException('Unable to inspect student_data columns: ' . $db->error);
    }
    $studentColumns = array_column($studentColumnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $studentColumnsResult->free();
    if (!in_array('student_id', $studentColumns, true)) {
        throw new RuntimeException('student_data.student_id is unavailable; apply the dual student identifiers migration before importing SIMS data.');
    }
    $userColumnsResult = $db->query('SHOW COLUMNS FROM users');
    if (!$userColumnsResult) {
        throw new RuntimeException('Unable to inspect users columns: ' . $db->error);
    }
    $userColumns = array_column($userColumnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $userColumnsResult->free();

    $identityConditions = [];
    foreach (['student_id', 'moe_admission_number', 'admission_number', 'id_number'] as $column) {
        if (in_array($column, $studentColumns, true)) {
            $identityConditions[] = "TRIM(UPPER(sd.`{$column}`)) = TRIM(UPPER(?))";
        }
    }
    $canMatchLinkedStudentAccount = in_array('user_id', $studentColumns, true)
        && in_array('id', $userColumns, true)
        && in_array('id_number', $userColumns, true);
    $linkedAccountJoin = '';
    $linkedAccountCondition = '';
    $linkedAccountMatchExpression = '0';
    if ($canMatchLinkedStudentAccount) {
        $roleCondition = in_array('role', $userColumns, true)
            ? " AND LOWER(TRIM(u.role)) = 'student'"
            : '';
        $linkedAccountJoin = " LEFT JOIN users u ON u.id = sd.user_id{$roleCondition}";
        $linkedAccountCondition = 'TRIM(UPPER(u.id_number)) = TRIM(UPPER(?))';
        $linkedAccountMatchExpression = "CASE WHEN u.id IS NULL THEN 0 ELSE 1 END";
        $identityConditions[] = $linkedAccountCondition;
    }
    if (!$identityConditions) {
        throw new RuntimeException('The student_data table has no supported student identifier or linked student account.');
    }
    $identityConditionSql = implode(' OR ', $identityConditions);
    $studentIdExpression = in_array('student_id', $studentColumns, true)
        ? 'sd.student_id'
        : 'NULL';
    $legacyStudentIdExpression = in_array('id_number', $studentColumns, true)
        ? 'sd.id_number'
        : 'NULL';
    $moeAdmissionNumberExpression = in_array('moe_admission_number', $studentColumns, true)
        ? 'sd.moe_admission_number'
        : 'NULL';
    $admissionNumberExpression = in_array('admission_number', $studentColumns, true)
        ? 'sd.admission_number'
        : 'NULL';
    if (!$db->begin_transaction()) {
        throw new RuntimeException('Unable to start the SIMS import transaction.');
    }
    $transactionStarted = true;

    $sequentialIdentityExpressions = array_values(array_filter([
        $moeAdmissionNumberExpression !== 'NULL'
            ? "NULLIF(TRIM({$moeAdmissionNumberExpression}), '')"
            : null,
        $admissionNumberExpression !== 'NULL'
            ? "NULLIF(TRIM({$admissionNumberExpression}), '')"
            : null,
    ]));
    if (!$sequentialIdentityExpressions) {
        throw new RuntimeException('The student_data table has no Ministry admission number for sequential SIMS mapping.');
    }
    $sequentialRosterFilter = implode(
        ' OR ',
        array_map(
            static fn(string $expression): string => "{$expression} IS NOT NULL",
            $sequentialIdentityExpressions
        )
    );
    $sequentialRosterResult = $db->query(
        'SELECT sd.id, ' . $studentIdExpression . ' AS university_student_id, '
        . $legacyStudentIdExpression . ' AS legacy_student_id, '
        . $moeAdmissionNumberExpression . ' AS moe_admission_number, '
        . $admissionNumberExpression . ' AS admission_number
         FROM student_data sd
         WHERE ' . $sequentialRosterFilter . '
         ORDER BY sd.id ASC'
    );
    if (!$sequentialRosterResult) {
        throw new RuntimeException('Unable to load the ordered Ministry student roster: ' . $db->error);
    }
    $sequentialRoster = $sequentialRosterResult->fetch_all(MYSQLI_ASSOC);
    $sequentialRosterResult->free();

    $studentLookup = $db->prepare(
        "SELECT sd.id, {$studentIdExpression} AS university_student_id,
                {$legacyStudentIdExpression} AS legacy_student_id,
                {$moeAdmissionNumberExpression} AS moe_admission_number,
                {$admissionNumberExpression} AS admission_number,
                {$linkedAccountMatchExpression} AS linked_account_match
         FROM student_data sd
         {$linkedAccountJoin}
         WHERE ({$identityConditionSql})
         LIMIT 2"
    );
    $scoreAndIdentifierUpdate = in_array('student_id', $studentColumns, true)
        ? $db->prepare(
            "UPDATE student_data
             SET cgpa = ?, coc_score = ?,
                 student_id = CASE
                     WHEN ? = 1 AND (? = 1 OR student_id IS NULL OR TRIM(student_id) = '') THEN ?
                     ELSE student_id
                 END
             WHERE id = ?"
        )
        : $db->prepare('UPDATE student_data SET cgpa = ?, coc_score = ? WHERE id = ?');

    if (!$studentLookup || !$scoreAndIdentifierUpdate) {
        throw new RuntimeException('Unable to prepare SIMS import statements: ' . $db->error);
    }
    $imported = 0;
    $linkedCount = 0;
    $matchedStudentDataIds = [];
    $seenUniversityIds = [];
    $rowIndex = 0;

    foreach ($rows as $row) {
        $index = $rowIndex++;
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
            ['Student ID', 'university_student_id', 'student_id', 'moe_admission_number', 'admission_number', 'AdmissionNumber', 'admission', 'admission_']
        ));
        $cgpa = simsRowValue($row, $normalizedHeaders, ['CGPA', 'cgpa'], null);
        $cocScore = simsRowValue($row, $normalizedHeaders, ['COC Score', 'coc_score', 'cocscore'], null);

        if ($admissionNumber === '' || !is_numeric($cgpa) || (float) $cgpa < 0 || (float) $cgpa > 4) {
            throw new InvalidArgumentException('Row ' . ($index + 1) . ' must have a valid Student ID/Admission Number and CGPA between 0 and 4.');
        }
        $normalizedAdmissionNumber = strtoupper($admissionNumber);
        if (isset($seenUniversityIds[$normalizedAdmissionNumber])) {
            throw new InvalidArgumentException('Row ' . ($index + 1) . ' contains a duplicate Student ID.');
        }
        $seenUniversityIds[$normalizedAdmissionNumber] = true;
        if (!is_numeric($cocScore) || (float) $cocScore < 0 || (float) $cocScore > 30) {
            throw new InvalidArgumentException('Row ' . ($index + 1) . ' has a COC Score outside 0-30.');
        }

        $gpaValue = (float) $cgpa;
        $cocValue = (float) $cocScore;

        $lookupValues = array_fill(0, count($identityConditions), $admissionNumber);
        $lookupArguments = [str_repeat('s', count($lookupValues))];
        foreach ($lookupValues as $valueIndex => $value) {
            $lookupArguments[] = &$lookupValues[$valueIndex];
        }
        if (!call_user_func_array([$studentLookup, 'bind_param'], $lookupArguments)) {
            throw new RuntimeException('Unable to bind student identifier on row ' . ($index + 1) . '.');
        }
        if (!$studentLookup->execute()) {
            throw new RuntimeException('Unable to query student on row ' . ($index + 1) . ': ' . $studentLookup->error);
        }
        $studentLookup->bind_result(
            $matchedStudentDataId,
            $matchedUniversityStudentId,
            $matchedLegacyStudentId,
            $matchedMoeAdmissionNumber,
            $matchedAdmissionNumber,
            $matchedLinkedAccount
        );
        $studentFound = $studentLookup->fetch();
        $hasMultipleMatches = false;
        if ($studentFound) {
            $hasMultipleMatches = $studentLookup->fetch() === true;
        }
        $studentLookup->free_result();

        $matchedBySequence = false;
        if (!$studentFound) {
            if (count($rows) !== count($sequentialRoster)) {
                throw new InvalidArgumentException(
                    'Row ' . ($index + 1) . ' (' . $admissionNumber . ') does not match an existing student record, '
                    . 'and sequential mapping is unavailable because the SIMS row count does not match the Ministry roster.'
                );
            }
            if (!isset($sequentialRoster[$index])) {
                throw new InvalidArgumentException('Row ' . ($index + 1) . ' has no matching Ministry roster entry.');
            }
            $sequentialMatch = $sequentialRoster[$index];
            $matchedStudentDataId = $sequentialMatch['id'];
            $matchedUniversityStudentId = $sequentialMatch['university_student_id'];
            $matchedLegacyStudentId = $sequentialMatch['legacy_student_id'];
            $matchedMoeAdmissionNumber = $sequentialMatch['moe_admission_number'];
            $matchedAdmissionNumber = $sequentialMatch['admission_number'];
            $matchedLinkedAccount = 0;
            $matchedBySequence = true;
        }
        if ($hasMultipleMatches) {
            throw new InvalidArgumentException('Row ' . ($index + 1) . ' (' . $admissionNumber . ') matches multiple student records. Resolve the duplicate IDs before importing.');
        }
        $matchedStudentId = trim((string) $matchedUniversityStudentId);
        $matchedLegacyId = trim((string) $matchedLegacyStudentId);
        $matchedMoeId = trim((string) $matchedMoeAdmissionNumber);
        $matchedAdmissionId = trim((string) $matchedAdmissionNumber);
        $matchedStudentDataId = (int) $matchedStudentDataId;
        if (isset($matchedStudentDataIds[$matchedStudentDataId])) {
            throw new InvalidArgumentException(
                'Row ' . ($index + 1) . ' maps to a student record already used by another SIMS row.'
            );
        }
        $matchedStudentDataIds[$matchedStudentDataId] = true;
        $matchesUniversityStudentId = $matchedStudentId !== ''
            && strcasecmp($matchedStudentId, $admissionNumber) === 0;
        $matchesLegacyUniversityId = $matchedLegacyId !== ''
            && strcasecmp($matchedLegacyId, $admissionNumber) === 0
            && strcasecmp($matchedMoeId, $admissionNumber) !== 0
            && strcasecmp($matchedAdmissionId, $admissionNumber) !== 0;
        $matchedByUniversityId = (int) $matchedLinkedAccount === 1
            || $matchesUniversityStudentId
            || $matchesLegacyUniversityId;
        $storedIdIsMinistryNumber = $matchedStudentId !== ''
            && (
                strcasecmp($matchedStudentId, $matchedMoeId) === 0
                || strcasecmp($matchedStudentId, $matchedAdmissionId) === 0
            );
        if (
            $matchedByUniversityId
            && $matchedStudentId !== ''
            && strcasecmp($matchedStudentId, $admissionNumber) !== 0
            && !$storedIdIsMinistryNumber
        ) {
            throw new InvalidArgumentException(
                'Row ' . ($index + 1) . ' (' . $admissionNumber . ') is linked to a different University Student ID.'
            );
        }
        if (
            $matchedBySequence
            && $matchedStudentId !== ''
            && strcasecmp($matchedStudentId, $admissionNumber) !== 0
            && strcasecmp($matchedStudentId, $matchedMoeId) !== 0
            && strcasecmp($matchedStudentId, $matchedAdmissionId) !== 0
        ) {
            throw new InvalidArgumentException(
                'Row ' . ($index + 1) . ' (' . $admissionNumber . ') conflicts with an existing University Student ID.'
            );
        }

        if (in_array('student_id', $studentColumns, true)) {
            $shouldLinkUniversityId = ($matchedByUniversityId || $matchedBySequence) ? 1 : 0;
            $shouldReplaceUniversityId = ($matchedBySequence || $storedIdIsMinistryNumber) ? 1 : 0;
            if (!$scoreAndIdentifierUpdate->bind_param(
                'ddiisi',
                $gpaValue,
                $cocValue,
                $shouldLinkUniversityId,
                $shouldReplaceUniversityId,
                $admissionNumber,
                $matchedStudentDataId
            )) {
                throw new RuntimeException('Unable to bind student update on row ' . ($index + 1) . '.');
            }
        } elseif (!$scoreAndIdentifierUpdate->bind_param('ddi', $gpaValue, $cocValue, $matchedStudentDataId)) {
            throw new RuntimeException('Unable to bind student update on row ' . ($index + 1) . '.');
        }
        if (!$scoreAndIdentifierUpdate->execute()) {
            throw new RuntimeException('Unable to update student scores on row ' . ($index + 1) . ': ' . $scoreAndIdentifierUpdate->error);
        }

        if (
            in_array('student_id', $studentColumns, true)
            && ($matchedByUniversityId || $matchedBySequence)
            && ($matchedStudentId === '' || $matchedBySequence || $storedIdIsMinistryNumber)
        ) {
            $linkedCount++;
        }
        $imported++;
    }

    if (!$db->commit()) {
        throw new RuntimeException('Unable to commit the SIMS import.');
    }
    $transactionStarted = false;
    logActivity(
        $db,
        $auditActor['id'],
        $auditActor['name'],
        'data.import',
        "Imported SIMS student scores: {$imported} records updated."
    );
    $studentLookup->close();
    $scoreAndIdentifierUpdate->close();
    $db->close();

    simsImportRespond([
        'success' => true,
        'message' => 'SIMS import completed and student scores were successfully updated.',
        'imported_count' => $imported,
        'updated_count' => $imported,
        'linked_count' => $linkedCount,
    ]);
} catch (Throwable $error) {
    if ($transactionStarted) {
        $db->rollback();
    }
    error_log('SIMS import failed: ' . $error->getMessage());
    if ($studentLookup instanceof mysqli_stmt) {
        $studentLookup->close();
    }
    if ($scoreAndIdentifierUpdate instanceof mysqli_stmt) {
        $scoreAndIdentifierUpdate->close();
    }
    if ($db instanceof mysqli) {
        $db->close();
    }
    simsImportRespond([
        'success' => false,
        'message' => $error instanceof InvalidArgumentException ? $error->getMessage() : 'Unable to import SIMS records.',
    ], $error instanceof InvalidArgumentException ? 400 : 500);
}
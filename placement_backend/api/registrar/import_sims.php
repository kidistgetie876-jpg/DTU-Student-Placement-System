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
    $userColumnsResult = $db->query('SHOW COLUMNS FROM users');
    if (!$userColumnsResult) {
        throw new RuntimeException('Unable to inspect users columns: ' . $db->error);
    }
    $userColumns = array_column($userColumnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
    $userColumnsResult->free();

    $identityConditions = [];
    $identityValues = [];
    foreach (['student_id', 'moe_admission_number', 'admission_number', 'id_number'] as $column) {
        if (in_array($column, $studentColumns, true)) {
            foreach (['university_student_id', 'admission_number'] as $identifier) {
                $identityConditions[] = "TRIM(UPPER(sd.`{$column}`)) = TRIM(UPPER(?))";
                $identityValues[] = $identifier;
            }
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
        $linkedAccountCondition = "NULLIF(TRIM(u.id_number), '') IS NOT NULL AND TRIM(UPPER(u.id_number)) = TRIM(UPPER(?))";
        $linkedAccountMatchExpression = "CASE WHEN u.id IS NULL THEN 0 ELSE 1 END";
        $identityConditions[] = $linkedAccountCondition;
        $identityValues[] = 'linked_university_student_id';
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
    $rosterCountResult = $db->query('SELECT COUNT(*) AS student_count FROM student_data');
    if (!$rosterCountResult) {
        throw new RuntimeException('Unable to verify the MoSHE master roster: ' . $db->error);
    }
    $masterRosterCount = (int) ($rosterCountResult->fetch_assoc()['student_count'] ?? 0);
    $rosterCountResult->free();

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
    $updateAssignments = ['cgpa = ?', 'coc_score = ?'];
    $updateTypes = 'dd';
    if (in_array('student_id', $studentColumns, true)) {
        $updateAssignments[] = 'student_id = CASE WHEN ? = 1 AND (? = 1 OR student_id IS NULL OR TRIM(student_id) = \'\') THEN ? ELSE student_id END';
        $updateTypes .= 'iis';
    }
    foreach (['admission_number', 'moe_admission_number'] as $column) {
        if (in_array($column, $studentColumns, true)) {
            $fallback = $column === 'admission_number'
                && in_array('moe_admission_number', $studentColumns, true)
                ? "NULLIF(moe_admission_number, ''), `{$column}`"
                : "`{$column}`";
            $updateAssignments[] = "`{$column}` = COALESCE(NULLIF(?, ''), {$fallback})";
            $updateTypes .= 's';
        }
    }
    $updateTypes .= 'i';
    $scoreAndIdentifierUpdate = $db->prepare(
        'UPDATE student_data SET ' . implode(', ', $updateAssignments) . ' WHERE id = ?'
    );

    if (!$studentLookup || !$scoreAndIdentifierUpdate) {
        throw new RuntimeException('Unable to prepare SIMS import statements: ' . $db->error);
    }
    $lookupStudent = static function (string $sourceStudentId, string $admissionNumber) use (
        $studentLookup,
        $identityValues
    ): array {
        $lookupValues = array_map(
            static function (string $identity) use ($sourceStudentId, $admissionNumber): string {
                if ($identity === 'linked_university_student_id') {
                    return $sourceStudentId;
                }
                if ($identity === 'university_student_id') {
                    return $sourceStudentId !== '' ? $sourceStudentId : $admissionNumber;
                }
                return $admissionNumber !== '' ? $admissionNumber : $sourceStudentId;
            },
            $identityValues
        );
        $lookupArguments = [str_repeat('s', count($lookupValues))];
        foreach ($lookupValues as $valueIndex => $value) {
            $lookupArguments[] = &$lookupValues[$valueIndex];
        }
        if (!call_user_func_array([$studentLookup, 'bind_param'], $lookupArguments)) {
            throw new RuntimeException('Unable to bind student identifiers.');
        }
        if (!$studentLookup->execute()) {
            throw new RuntimeException('Unable to query student record: ' . $studentLookup->error);
        }
        $studentLookup->bind_result(
            $studentDataId,
            $universityStudentId,
            $legacyStudentId,
            $moeAdmissionNumber,
            $storedAdmissionNumber,
            $linkedAccountMatch
        );
        $found = $studentLookup->fetch() === true;
        $record = $found
            ? [
                'id' => $studentDataId,
                'student_id' => $universityStudentId,
                'legacy_student_id' => $legacyStudentId,
                'moe_admission_number' => $moeAdmissionNumber,
                'admission_number' => $storedAdmissionNumber,
                'linked_account_match' => $linkedAccountMatch,
            ]
            : null;
        $hasMultipleMatches = $found && $studentLookup->fetch() === true;
        $studentLookup->free_result();

        return [
            'found' => $found,
            'multiple' => $hasMultipleMatches,
            'record' => $record,
        ];
    };

    $fallbackCandidates = [];
    $fallbackEligible = false;
    if (
        in_array('student_id', $studentColumns, true)
        && (in_array('admission_number', $studentColumns, true)
            || in_array('moe_admission_number', $studentColumns, true))
    ) {
        $admissionColumns = [];
        foreach (['moe_admission_number', 'admission_number'] as $column) {
            if (in_array($column, $studentColumns, true)) {
                $admissionColumns[] = "NULLIF(TRIM(`{$column}`), '')";
            }
        }
        $ministryIdExpression = 'COALESCE(' . implode(', ', $admissionColumns) . ')';
        $candidateSql = "SELECT id, student_id, "
            . (in_array('id_number', $studentColumns, true) ? 'id_number' : 'NULL')
            . ', '
            . (in_array('moe_admission_number', $studentColumns, true) ? 'moe_admission_number' : 'NULL')
            . ', '
            . (in_array('admission_number', $studentColumns, true) ? 'admission_number' : 'NULL')
            . " FROM student_data
                WHERE (student_id IS NULL OR TRIM(student_id) = '')
                  AND {$ministryIdExpression} IS NOT NULL
                ORDER BY id";
        $candidateResult = $db->query($candidateSql);
        if (!$candidateResult) {
            throw new RuntimeException('Unable to inspect unlinked MoSHE student records: ' . $db->error);
        }
        $fallbackCandidates = $candidateResult->fetch_all(MYSQLI_ASSOC);
        $candidateResult->free();

        $unmatchedImportCount = 0;
        $ambiguousImportCount = 0;
        $seenFallbackImportIds = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $headers = [];
            foreach (array_keys($row) as $key) {
                $normalizedKey = simsNormalizeHeader((string) $key);
                if ($normalizedKey !== '' && !array_key_exists($normalizedKey, $headers)) {
                    $headers[$normalizedKey] = $key;
                }
            }
            $candidateStudentId = trim((string) simsRowValue(
                $row,
                $headers,
                ['university_student_id', 'student_id', 'Student ID']
            ));
            $candidateAdmissionNumber = trim((string) simsRowValue(
                $row,
                $headers,
                ['moe_admission_number', 'admission_number', 'Admission Number', 'AdmissionNumber', 'admission', 'admission_']
            ));
            $isUniversityId = preg_match('/^DTU16R\d+$/i', $candidateStudentId) === 1
                || preg_match('/^DTU\d{2}[A-Z]\d+$/i', $candidateStudentId) === 1;
            if (!$isUniversityId || $candidateAdmissionNumber !== '') {
                continue;
            }
            $candidateCgpa = simsRowValue($row, $headers, ['CGPA', 'cgpa'], null);
            $candidateCocScore = simsRowValue($row, $headers, ['COC Score', 'coc_score', 'cocscore'], null);
            if (
                !is_numeric($candidateCgpa)
                || (float) $candidateCgpa < 0
                || (float) $candidateCgpa > 4
                || !is_numeric($candidateCocScore)
                || (float) $candidateCocScore < 0
                || (float) $candidateCocScore > 30
            ) {
                continue;
            }
            $normalizedCandidateId = strtoupper($candidateStudentId);
            if (isset($seenFallbackImportIds[$normalizedCandidateId])) {
                $ambiguousImportCount++;
                continue;
            }
            $seenFallbackImportIds[$normalizedCandidateId] = true;

            $match = $lookupStudent($candidateStudentId, '');
            if ($match['multiple']) {
                $ambiguousImportCount++;
            } elseif (!$match['found']) {
                $unmatchedImportCount++;
            }
        }
        $fallbackEligible = $ambiguousImportCount === 0
            && $unmatchedImportCount > 0
            && $unmatchedImportCount === count($fallbackCandidates);
    }

    $imported = 0;
    $linkedCount = 0;
    $matchedStudentDataIds = [];
    $seenUniversityIds = [];
    $fallbackCandidateIndex = 0;
    $rowErrors = [];
    $rowIndex = 0;

    foreach ($rows as $row) {
        $index = $rowIndex++;
        if (!is_array($row)) {
            $rowErrors[] = [
                'row' => $index + 1,
                'message' => 'This row is not a valid record.',
            ];
            continue;
        }
        $normalizedHeaders = [];
        foreach (array_keys($row) as $key) {
            $normalizedKey = simsNormalizeHeader((string) $key);
            if ($normalizedKey !== '' && !array_key_exists($normalizedKey, $normalizedHeaders)) {
                $normalizedHeaders[$normalizedKey] = $key;
            }
        }

        // 'admission' እና 'admission_' የተቆረጡ ስሞችን ጭምር ያካተተ alias
        $sourceStudentId = trim((string) simsRowValue(
            $row,
            $normalizedHeaders,
            ['university_student_id', 'student_id', 'Student ID']
        ));
        $admissionNumber = trim((string) simsRowValue(
            $row,
            $normalizedHeaders,
            ['moe_admission_number', 'admission_number', 'Admission Number', 'AdmissionNumber', 'admission', 'admission_']
        ));
        $lookupIdentifier = $admissionNumber !== '' ? $admissionNumber : $sourceStudentId;
        $cgpa = simsRowValue($row, $normalizedHeaders, ['CGPA', 'cgpa'], null);
        $cocScore = simsRowValue($row, $normalizedHeaders, ['COC Score', 'coc_score', 'cocscore'], null);

        if ($lookupIdentifier === '' || !is_numeric($cgpa) || (float) $cgpa < 0 || (float) $cgpa > 4) {
            $rowErrors[] = [
                'row' => $index + 1,
                'student_id' => $sourceStudentId,
                'admission_number' => $admissionNumber,
                'message' => 'A valid Student ID/Admission Number and CGPA between 0 and 4 are required.',
            ];
            continue;
        }
        $normalizedIdentifier = strtoupper($lookupIdentifier);
        if (isset($seenUniversityIds[$normalizedIdentifier])) {
            $rowErrors[] = [
                'row' => $index + 1,
                'student_id' => $sourceStudentId,
                'admission_number' => $admissionNumber,
                'message' => 'This identifier is duplicated in the import file.',
            ];
            continue;
        }
        if (!is_numeric($cocScore) || (float) $cocScore < 0 || (float) $cocScore > 30) {
            $rowErrors[] = [
                'row' => $index + 1,
                'student_id' => $sourceStudentId,
                'admission_number' => $admissionNumber,
                'message' => 'COC Score must be between 0 and 30.',
            ];
            continue;
        }
        $seenUniversityIds[$normalizedIdentifier] = true;

        $gpaValue = (float) $cgpa;
        $cocValue = (float) $cocScore;

        $lookupResult = $lookupStudent($sourceStudentId, $admissionNumber);
        $studentFound = $lookupResult['found'];
        $hasMultipleMatches = $lookupResult['multiple'];
        $matchedRecord = $lookupResult['record'];
        $isUniversityId = preg_match('/^DTU16R\d+$/i', $sourceStudentId) === 1
            || preg_match('/^DTU\d{2}[A-Z]\d+$/i', $sourceStudentId) === 1;
        if (
            !$studentFound
            && !$hasMultipleMatches
            && $fallbackEligible
            && $sourceStudentId !== ''
            && $admissionNumber === ''
            && $isUniversityId
        ) {
            $candidate = $fallbackCandidates[$fallbackCandidateIndex] ?? null;
            if ($candidate !== null) {
                $matchedRecord = [
                    'id' => $candidate['id'],
                    'student_id' => $candidate['student_id'],
                    'legacy_student_id' => $candidate['id_number'] ?? null,
                    'moe_admission_number' => $candidate['moe_admission_number'] ?? null,
                    'admission_number' => $candidate['admission_number'] ?? null,
                    'linked_account_match' => 0,
                ];
                $fallbackCandidateIndex++;
                $studentFound = true;
            }
        }

        if (!$studentFound) {
            $identifiers = [];
            if ($sourceStudentId !== '') {
                $identifiers[] = 'University Student ID "' . $sourceStudentId . '"';
            }
            if ($admissionNumber !== '') {
                $identifiers[] = 'Admission Number "' . $admissionNumber . '"';
            }
            $missingRecordContext = $masterRosterCount === 0
                ? ' Please upload the MoSHE Master Roster before importing Registrar SIMS data.'
                : ' Verify that the MoSHE Master Roster has been uploaded and that this row contains the matching University Student ID and/or Ministry Admission Number.';
            if (
                $isUniversityId
                && $admissionNumber === ''
                && count($fallbackCandidates) > 0
                && !$fallbackEligible
            ) {
                $missingRecordContext .= ' Automatic sequential linking was skipped because the unmatched SIMS IDs and unlinked MoSHE records could not be paired unambiguously. Provide the Ministry Admission Number or import the complete matching batch in the same order.';
            }
            $rowErrors[] = [
                'row' => $index + 1,
                'student_id' => $sourceStudentId,
                'admission_number' => $admissionNumber,
                'message' => 'No student master record found for '
                    . implode(' and ', $identifiers) . '.' . $missingRecordContext,
            ];
            continue;
        }
        if ($hasMultipleMatches) {
            $rowErrors[] = [
                'row' => $index + 1,
                'student_id' => $sourceStudentId,
                'admission_number' => $admissionNumber,
                'message' => 'This identifier matches multiple student master records. Resolve the duplicate IDs before importing.',
            ];
            continue;
        }
        $matchedStudentId = trim((string) $matchedRecord['student_id']);
        $matchedLegacyId = trim((string) $matchedRecord['legacy_student_id']);
        $matchedMoeId = trim((string) $matchedRecord['moe_admission_number']);
        $matchedAdmissionId = trim((string) $matchedRecord['admission_number']);
        $matchedStudentDataId = (int) $matchedRecord['id'];
        if (isset($matchedStudentDataIds[$matchedStudentDataId])) {
            $rowErrors[] = [
                'row' => $index + 1,
                'student_id' => $sourceStudentId,
                'admission_number' => $admissionNumber,
                'message' => 'This row matches a student record already used by another SIMS row.',
            ];
            continue;
        }
        $importedStudentId = $sourceStudentId !== '' ? $sourceStudentId : $lookupIdentifier;
        $matchesUniversityStudentId = $matchedStudentId !== ''
            && strcasecmp($matchedStudentId, $importedStudentId) === 0;
        $matchesLegacyUniversityId = $matchedLegacyId !== ''
            && strcasecmp($matchedLegacyId, $importedStudentId) === 0
            && strcasecmp($matchedMoeId, $importedStudentId) !== 0
            && strcasecmp($matchedAdmissionId, $importedStudentId) !== 0;
        $matchedByUniversityId = (int) $matchedRecord['linked_account_match'] === 1
            || $matchesUniversityStudentId
            || $matchesLegacyUniversityId;
        $storedIdIsMinistryNumber = $matchedStudentId !== ''
            && (
                strcasecmp($matchedStudentId, $matchedMoeId) === 0
                || strcasecmp($matchedStudentId, $matchedAdmissionId) === 0
            );
        $isRecognizedUniversityId = preg_match('/^DTU16R\d+$/i', $sourceStudentId) === 1
            || preg_match('/^DTU\d{2}[A-Z]\d+$/i', $sourceStudentId) === 1;
        $hasExplicitUniversityId = $sourceStudentId !== ''
            && (
                $isRecognizedUniversityId
                || (
                    strcasecmp($sourceStudentId, $matchedMoeId) !== 0
                    && strcasecmp($sourceStudentId, $matchedAdmissionId) !== 0
                )
            );
        if (
            $hasExplicitUniversityId
            && $matchedStudentId !== ''
            && strcasecmp($matchedStudentId, $sourceStudentId) !== 0
            && !$storedIdIsMinistryNumber
        ) {
            $rowErrors[] = [
                'row' => $index + 1,
                'student_id' => $sourceStudentId,
                'admission_number' => $admissionNumber,
                'message' => 'The student master record is already linked to a different University Student ID.',
            ];
            continue;
        }
        $matchedStudentDataIds[$matchedStudentDataId] = true;
        $updateValues = [$gpaValue, $cocValue];
        if (in_array('student_id', $studentColumns, true)) {
            $updateValues[] = ($matchedByUniversityId || $hasExplicitUniversityId) ? 1 : 0;
            $updateValues[] = $storedIdIsMinistryNumber ? 1 : 0;
            $updateValues[] = $importedStudentId;
        }
        foreach (['admission_number', 'moe_admission_number'] as $column) {
            if (in_array($column, $studentColumns, true)) {
                $updateValues[] = $admissionNumber;
            }
        }
        $updateValues[] = $matchedStudentDataId;
        $updateArguments = [$updateTypes];
        foreach ($updateValues as $valueIndex => $value) {
            $updateArguments[] = &$updateValues[$valueIndex];
        }
        if (!call_user_func_array([$scoreAndIdentifierUpdate, 'bind_param'], $updateArguments)) {
            throw new RuntimeException('Unable to bind student update on row ' . ($index + 1) . '.');
        }
        if (!$scoreAndIdentifierUpdate->execute()) {
            throw new RuntimeException('Unable to update student scores on row ' . ($index + 1) . ': ' . $scoreAndIdentifierUpdate->error);
        }

        if (
            in_array('student_id', $studentColumns, true)
            && ($matchedByUniversityId || $hasExplicitUniversityId)
            && ($matchedStudentId === '' || $storedIdIsMinistryNumber)
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
        'Imported SIMS student scores: ' . $imported . ' record(s) updated; '
            . count($rowErrors) . ' row(s) skipped.'
    );
    $studentLookup->close();
    $scoreAndIdentifierUpdate->close();
    $db->close();

    simsImportRespond([
        'success' => $imported > 0,
        'message' => $imported === 0
            ? 'No SIMS records were imported. See row_errors for details.'
            : 'SIMS import completed: ' . $imported . ' record(s) updated.'
                . (count($rowErrors) > 0
                    ? ' ' . count($rowErrors) . ' row(s) were skipped.'
                    : ''),
        'imported_count' => $imported,
        'updated_count' => $imported,
        'linked_count' => $linkedCount,
        'skipped_count' => count($rowErrors),
        'row_errors' => $rowErrors,
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
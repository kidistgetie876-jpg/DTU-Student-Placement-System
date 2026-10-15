<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

function downloadReportError(string $message, int $status): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['success' => false, 'message' => $message]);
    exit;
}

function reportXmlText(string $text): string
{
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $text) ?? '';
    return htmlspecialchars($text, ENT_XML1 | ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function generateNotificationDocx(string $filePath, array $report): void
{
    if (!class_exists(ZipArchive::class)) {
        throw new RuntimeException('PHP ZIP support is required to generate a DOCX fallback.');
    }

    $message = preg_split('/\r\n|\r|\n/', (string) ($report['message'] ?? '')) ?: [''];
    $paragraphs = [
        '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>'
            . reportXmlText((string) ($report['title'] ?: 'Report'))
            . '</w:t></w:r></w:p>',
        '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Notification</w:t></w:r></w:p>',
    ];
    foreach ($message as $line) {
        $paragraphs[] = '<w:p><w:r><w:t xml:space="preserve">'
            . reportXmlText($line)
            . '</w:t></w:r></w:p>';
    }
    $paragraphs[] = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Sender role: </w:t></w:r><w:r><w:t>'
        . reportXmlText((string) ($report['sender_role'] ?? ''))
        . '</w:t></w:r></w:p>';
    $paragraphs[] = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Date: </w:t></w:r><w:r><w:t>'
        . reportXmlText((string) ($report['created_at'] ?? ''))
        . '</w:t></w:r></w:p>';

    $documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        . '<w:body>' . implode('', $paragraphs)
        . '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
        . '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"'
        . ' w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
        . '</w:body></w:document>';
    $contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        . '<Default Extension="xml" ContentType="application/xml"/>'
        . '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        . '</Types>';
    $relationshipsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        . '</Relationships>';

    $temporaryPath = tempnam(dirname($filePath), '.report-');
    if ($temporaryPath === false) {
        throw new RuntimeException('Unable to prepare a temporary DOCX file.');
    }

    try {
        $archive = new ZipArchive();
        if ($archive->open($temporaryPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Unable to create the DOCX archive.');
        }

        if (
            !$archive->addFromString('[Content_Types].xml', $contentTypesXml)
            || !$archive->addFromString('_rels/.rels', $relationshipsXml)
            || !$archive->addFromString('word/document.xml', $documentXml)
        ) {
            $archive->close();
            throw new RuntimeException('Unable to write the DOCX document contents.');
        }
        if (!$archive->close()) {
            throw new RuntimeException('Unable to finish creating the DOCX archive.');
        }

        if (file_exists($filePath)) {
            if (!unlink($temporaryPath)) {
                throw new RuntimeException('Unable to clean up the temporary DOCX file.');
            }
            return;
        }

        if (!rename($temporaryPath, $filePath)) {
            throw new RuntimeException('Unable to save the generated DOCX file.');
        }
    } finally {
        if (file_exists($temporaryPath)) {
            unlink($temporaryPath);
        }
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    downloadReportError('Only GET requests are allowed.', 405);
}

$notificationId = filter_var($_GET['notification_id'] ?? null, FILTER_VALIDATE_INT);
if ($notificationId === false || $notificationId === null || $notificationId <= 0) {
    downloadReportError('A valid report ID is required.', 400);
}

require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    downloadReportError('You must be logged in to download this report.', 401);
}

try {
    $pdo = getAuditPdo();
    $actorStatement = $pdo->prepare('SELECT role FROM users WHERE id = :user_id LIMIT 1');
    $actorStatement->execute([':user_id' => $userId]);
    $role = strtolower(trim((string) ($actorStatement->fetchColumn() ?: '')));
    if ($role === '') {
        downloadReportError('You are not allowed to download this report.', 403);
    }

    $statement = $pdo->prepare(
        'SELECT id, file_path, title, message, created_at, sender_id, sender_role,
                recipient_id, recipient_role, department_id
         FROM notifications
         WHERE id = :notification_id
         LIMIT 1'
    );
    $statement->execute([':notification_id' => $notificationId]);
    $report = $statement->fetch();

    if (!$report) {
        downloadReportError('Report file not found on server.', 404);
    }

    $isHeadRole = in_array($role, ['head', 'hod', 'coordinator'], true);
    $roleAliases = $isHeadRole
        ? ['head', 'hod', 'coordinator']
        : [$role];
    $senderRoles = array_map('strtolower', $roleAliases);
    $recipientRoles = $senderRoles;
    $isSender = (int) $report['sender_id'] === $userId
        && in_array(strtolower((string) $report['sender_role']), $senderRoles, true);
    $isRecipient = in_array(strtolower((string) $report['recipient_role']), $recipientRoles, true)
        && ($report['recipient_id'] === null || (int) $report['recipient_id'] === $userId);

    if (!$isSender && !$isRecipient && $isHeadRole) {
        $departmentStatement = $pdo->prepare(
            'SELECT id FROM departments WHERE head_id = :user_id AND status = "active" LIMIT 1'
        );
        $departmentStatement->execute([':user_id' => $userId]);
        $departmentId = (int) ($departmentStatement->fetchColumn() ?: 0);
        $isDepartmentRecipient = $departmentId > 0
            && strtolower((string) $report['recipient_role']) === 'head'
            && ($report['department_id'] === null || (int) $report['department_id'] === $departmentId)
            && ($report['recipient_id'] === null || (int) $report['recipient_id'] === $userId);
    } else {
        $isDepartmentRecipient = false;
    }

    if (!$isSender && !$isRecipient && !$isDepartmentRecipient) {
        downloadReportError('You are not allowed to download this report.', 403);
    }

    $uploadDirectory = __DIR__ . '/../../uploads/reports';
    if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0750, true) && !is_dir($uploadDirectory)) {
        throw new RuntimeException('Unable to create the report storage directory.');
    }
    $reportDirectory = realpath($uploadDirectory);
    if ($reportDirectory === false) {
        throw new RuntimeException('Unable to resolve the report storage directory.');
    }

    $relativePath = str_replace('\\', '/', (string) ($report['file_path'] ?? ''));
    $filePath = false;
    if (preg_match('#^uploads/reports/[a-f0-9]{32}\.(?:pdf|doc|docx|xls|xlsx)$#i', $relativePath)) {
        $resolvedPath = realpath($reportDirectory . DIRECTORY_SEPARATOR . basename($relativePath));
        if (
            $resolvedPath !== false
            && file_exists($resolvedPath)
            && is_file($resolvedPath)
            && str_starts_with($resolvedPath, $reportDirectory . DIRECTORY_SEPARATOR)
        ) {
            $filePath = $resolvedPath;
        }
    }

    $fallbackName = 'notification_' . $notificationId . '_fallback.docx';
    if ($filePath === false) {
        $fallbackPath = $reportDirectory . DIRECTORY_SEPARATOR . $fallbackName;
        if (!file_exists($fallbackPath)) {
            generateNotificationDocx($fallbackPath, $report);
        }

        $filePath = realpath($fallbackPath);
        if (
            $filePath === false
            || !file_exists($filePath)
            || !is_file($filePath)
            || !str_starts_with($filePath, $reportDirectory . DIRECTORY_SEPARATOR)
        ) {
            throw new RuntimeException('The generated DOCX report could not be found.');
        }

        try {
            $updateStatement = $pdo->prepare(
                'UPDATE notifications SET file_path = :file_path WHERE id = :notification_id'
            );
            $updateStatement->execute([
                ':file_path' => 'uploads/reports/' . $fallbackName,
                ':notification_id' => $notificationId,
            ]);
        } catch (Throwable $error) {
            error_log('Generated report path could not be saved: ' . $error->getMessage());
        }
    }

    $filename = basename($filePath);
    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    $contentTypes = [
        'pdf' => 'application/pdf',
        'doc' => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls' => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    header('Content-Description: File Transfer');
    header('Content-Type: ' . $contentTypes[$extension]);
    header('Content-Disposition: attachment; filename="' . $filename . '"; filename*=UTF-8\'\'' . rawurlencode($filename));
    header('Content-Length: ' . filesize($filePath));
    header('X-Content-Type-Options: nosniff');
    readfile($filePath);
} catch (Throwable $error) {
    error_log('Report download failed: ' . $error->getMessage());
    downloadReportError('Unable to download report file.', 500);
}
?>

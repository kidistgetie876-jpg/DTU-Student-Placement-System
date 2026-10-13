<?php
function getReportAttachmentUrl(string $filePath): ?string
{
    $normalizedPath = ltrim(str_replace('\\', '/', $filePath), '/');
    $storagePrefix = 'uploads/reports/';
    if (strpos($normalizedPath, $storagePrefix) !== 0) {
        return null;
    }

    $filename = substr($normalizedPath, strlen($storagePrefix));
    if ($filename === '' || basename($filename) !== $filename) {
        return null;
    }

    $scriptPath = parse_url((string) ($_SERVER['SCRIPT_NAME'] ?? ''), PHP_URL_PATH);
    $apiPosition = strrpos((string) $scriptPath, '/api/');
    if ($apiPosition === false) {
        return null;
    }

    $backendPath = substr($scriptPath, 0, $apiPosition);
    return rtrim($backendPath, '/') . '/uploads/reports/' . rawurlencode($filename);
}

<?php
error_reporting(E_ALL);
ini_set('display_errors', '0');

function sendCorsHeaders(): void
{
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $configuredOrigins = getenv('FRONTEND_ORIGINS') ?: getenv('FRONTEND_ORIGIN') ?: '';
    $allowedOrigins = array_filter(array_map('trim', explode(',', $configuredOrigins)));
    $allowedOrigins[] = 'http://localhost:3000';
    $allowedOrigins[] = 'http://localhost:3001';
    $allowedOrigins[] = 'http://127.0.0.1:3000';
    $allowedOrigins[] = 'http://127.0.0.1:3001';

    $originParts = parse_url($origin);
    $originHost = is_array($originParts)
        ? strtolower(trim((string) ($originParts['host'] ?? ''), '[]'))
        : '';
    $isValidOrigin = is_array($originParts)
        && in_array(strtolower((string) ($originParts['scheme'] ?? '')), ['http', 'https'], true)
        && !isset($originParts['user'])
        && !isset($originParts['pass'])
        && !isset($originParts['path'])
        && !isset($originParts['query'])
        && !isset($originParts['fragment'])
        && $originHost !== '';
    $isLocalOrigin = $isValidOrigin
        && in_array($originHost, ['localhost', '127.0.0.1', '::1'], true);

    if ($origin !== '' && $isValidOrigin && (in_array($origin, $allowedOrigins, true) || $isLocalOrigin)) {
        header_remove('Access-Control-Allow-Origin');
        header('Access-Control-Allow-Origin: ' . $origin);
    }
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

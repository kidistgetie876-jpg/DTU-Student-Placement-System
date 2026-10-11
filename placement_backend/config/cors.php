<?php
function sendCorsHeaders(): void
{
    $allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'https://dtu-student-placement-system-1.onrender.com',
    ];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    header('Vary: Origin');
    if (in_array($origin, $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
    }
}

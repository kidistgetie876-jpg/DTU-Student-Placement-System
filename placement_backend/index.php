<?php
header('Content-Type: application/json; charset=UTF-8');

echo json_encode([
    'success' => true,
    'service' => 'DTU Student Placement API',
    'message' => 'Backend is running. Use the /api and /auth endpoints for application requests.',
], JSON_UNESCAPED_UNICODE);

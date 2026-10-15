<?php
require_once __DIR__ . '/catalog_api_helpers.php';

catalogApiRequireMethod('GET');

try {
    $database = catalogApiGetDatabase();
    $result = $database->query('SELECT id, name FROM streams ORDER BY name ASC');
    $streams = [];
    while ($row = $result->fetch_assoc()) {
        $streams[] = ['id' => (int) $row['id'], 'name' => $row['name']];
    }
    catalogApiResponse(['success' => true, 'streams' => $streams]);
} catch (Throwable $error) {
    catalogApiHandleError('Stream fetch', $error);
}

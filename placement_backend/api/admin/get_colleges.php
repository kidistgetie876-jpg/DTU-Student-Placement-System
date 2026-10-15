<?php
require_once __DIR__ . '/catalog_api_helpers.php';

catalogApiRequireMethod('GET');

try {
    $database = catalogApiGetDatabase();
    $result = $database->query(
        'SELECT colleges.id, colleges.name, colleges.stream_id, streams.name AS stream_name
         FROM colleges
         INNER JOIN streams ON streams.id = colleges.stream_id
         ORDER BY streams.name ASC, colleges.name ASC'
    );
    $colleges = [];
    while ($row = $result->fetch_assoc()) {
        $colleges[] = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'stream_id' => (int) $row['stream_id'],
            'stream_name' => $row['stream_name'],
        ];
    }
    catalogApiResponse(['success' => true, 'colleges' => $colleges]);
} catch (Throwable $error) {
    catalogApiHandleError('College fetch', $error);
}

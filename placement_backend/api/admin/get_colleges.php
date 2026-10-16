<?php
require_once __DIR__ . '/catalog_api_helpers.php';

catalogApiRequireMethod('GET');

try {
    $database = catalogApiGetDatabase();
    $result = $database->query(
        "SELECT MIN(colleges.id) AS id,
                CASE
                    WHEN LOWER(TRIM(colleges.name)) IN (
                        'technology',
                        'gafat institute of technology',
                        'gefat institute of technology'
                    ) THEN 'Gafat Institute of Technology'
                    ELSE TRIM(colleges.name)
                END AS name,
                colleges.stream_id,
                streams.name AS stream_name
         FROM colleges
         INNER JOIN streams ON streams.id = colleges.stream_id
         GROUP BY colleges.stream_id, streams.name,
                  CASE
                      WHEN LOWER(TRIM(colleges.name)) IN (
                          'technology',
                          'gafat institute of technology',
                          'gefat institute of technology'
                      ) THEN 'gafat institute of technology'
                      ELSE LOWER(TRIM(colleges.name))
                  END
         ORDER BY streams.name ASC, name ASC"
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

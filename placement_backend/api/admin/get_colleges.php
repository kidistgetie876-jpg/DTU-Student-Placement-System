<?php
require_once __DIR__ . '/catalog_api_helpers.php';

catalogApiRequireMethod('GET');

try {
    $database = catalogApiGetDatabase();
    $result = $database->query(
        "SELECT MIN(colleges.id) AS id,
                CASE
                    WHEN LOWER(TRIM(colleges.name)) IN (
                        'technology', 'gafat tech', 'gafat institute of technology', 'gefat institute of technology',
                        'gafat institute of technology (git)'
                    ) THEN 'Gafat Institute of Technology (GIT)'
                    WHEN LOWER(TRIM(colleges.name)) IN ('health science', 'college of health science')
                        THEN 'Health Science'
                    WHEN LOWER(TRIM(streams.name)) IN ('natural', 'natural science')
                        THEN 'Other Natural Science'
                    WHEN LOWER(TRIM(colleges.name)) IN ('law', 'school of law', 'college of law')
                        THEN 'School of Law'
                    ELSE 'Other Social Science'
                END AS name,
                colleges.stream_id,
                streams.name AS stream_name
         FROM colleges
         INNER JOIN streams ON streams.id = colleges.stream_id
         WHERE (
            LOWER(TRIM(streams.name)) IN ('natural', 'natural science')
            AND LOWER(TRIM(colleges.name)) IN (
                'technology', 'gafat tech', 'gafat institute of technology', 'gefat institute of technology',
                'gafat institute of technology (git)',
                'health science', 'college of health science', 'other natural science',
                'college of natural and computational sciences', 'college of agriculture and environmental sciences',
                'agriculture and environmental sciences', 'freshman faculty'
            )
         ) OR (
            LOWER(TRIM(streams.name)) IN ('social', 'social science')
            AND LOWER(TRIM(colleges.name)) IN (
                'law', 'school of law', 'college of law', 'other social science',
                'college of social sciences and humanities', 'social sciences and humanities',
                'college of business and economics', 'business and economics'
            )
         )
         GROUP BY colleges.stream_id, streams.name, name
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

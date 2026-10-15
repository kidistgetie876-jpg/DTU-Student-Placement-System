<?php
require_once __DIR__ . '/catalog_api_helpers.php';

catalogApiRequireMethod('POST');

try {
    $database = catalogApiGetDatabase();
    catalogApiRequireAdmin($database);
    $input = catalogApiReadJsonInput();
    $name = trim((string) ($input['name'] ?? ''));
    if ($name === '' || strlen($name) > 150) {
        catalogApiResponse(['success' => false, 'message' => 'Stream name must be between 1 and 150 characters.'], 400);
    }

    $statement = $database->prepare('INSERT INTO streams (name) VALUES (?)');
    if (!$statement) {
        throw new RuntimeException($database->error);
    }
    $statement->bind_param('s', $name);
    $statement->execute();
    $stream = ['id' => (int) $database->insert_id, 'name' => $name];
    $statement->close();
    catalogApiResponse(['success' => true, 'stream' => $stream], 201);
} catch (mysqli_sql_exception $error) {
    if ((int) $error->getCode() === 1062) {
        catalogApiResponse(['success' => false, 'message' => 'A stream with this name already exists.'], 409);
    }
    catalogApiHandleError('Stream creation', $error);
} catch (Throwable $error) {
    catalogApiHandleError('Stream creation', $error);
}

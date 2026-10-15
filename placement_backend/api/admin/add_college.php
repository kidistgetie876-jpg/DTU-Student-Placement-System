<?php
require_once __DIR__ . '/catalog_api_helpers.php';

catalogApiRequireMethod('POST');

try {
    $database = catalogApiGetDatabase();
    catalogApiRequireAdmin($database);
    $input = catalogApiReadJsonInput();
    $name = trim((string) ($input['name'] ?? ''));
    $streamId = filter_var($input['stream_id'] ?? null, FILTER_VALIDATE_INT);
    if ($name === '' || strlen($name) > 150) {
        catalogApiResponse(['success' => false, 'message' => 'College name must be between 1 and 150 characters.'], 400);
    }
    if ($streamId === false || $streamId === null || $streamId <= 0) {
        catalogApiResponse(['success' => false, 'message' => 'A valid stream is required.'], 400);
    }

    $streamStatement = $database->prepare('SELECT id, name FROM streams WHERE id = ? LIMIT 1');
    if (!$streamStatement) {
        throw new RuntimeException($database->error);
    }
    $streamStatement->bind_param('i', $streamId);
    $streamStatement->execute();
    $streamResult = $streamStatement->get_result();
    $stream = $streamResult ? $streamResult->fetch_assoc() : null;
    $streamStatement->close();
    if (!$stream) {
        catalogApiResponse(['success' => false, 'message' => 'The selected stream does not exist.'], 400);
    }

    $statement = $database->prepare('INSERT INTO colleges (name, stream_id) VALUES (?, ?)');
    if (!$statement) {
        throw new RuntimeException($database->error);
    }
    $statement->bind_param('si', $name, $streamId);
    $statement->execute();
    $college = [
        'id' => (int) $database->insert_id,
        'name' => $name,
        'stream_id' => (int) $streamId,
        'stream_name' => $stream['name'],
    ];
    $statement->close();
    catalogApiResponse(['success' => true, 'college' => $college], 201);
} catch (mysqli_sql_exception $error) {
    if ((int) $error->getCode() === 1062) {
        catalogApiResponse(['success' => false, 'message' => 'This college already exists for the selected stream.'], 409);
    }
    catalogApiHandleError('College creation', $error);
} catch (Throwable $error) {
    catalogApiHandleError('College creation', $error);
}

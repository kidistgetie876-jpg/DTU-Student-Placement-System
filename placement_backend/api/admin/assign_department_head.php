<?php
require_once __DIR__ . '/catalog_api_helpers.php';

catalogApiRequireMethod('POST');

try {
    $database = catalogApiGetDatabase();
    catalogApiRequireAdmin($database);
    $input = catalogApiReadJsonInput();
    $departmentId = filter_var($input['department_id'] ?? null, FILTER_VALIDATE_INT);
    $headId = filter_var($input['head_id'] ?? null, FILTER_VALIDATE_INT);
    if ($departmentId === false || $departmentId === null || $departmentId <= 0) {
        catalogApiResponse(['success' => false, 'message' => 'A valid department is required.'], 400);
    }
    if ($headId === false || $headId === null || $headId <= 0) {
        catalogApiResponse(['success' => false, 'message' => 'A valid Department Head account is required.'], 400);
    }

    $transactionStarted = false;
    $database->begin_transaction();
    $transactionStarted = true;

    $departmentStatement = $database->prepare(
        'SELECT id, name FROM departments WHERE id = ? LIMIT 1 FOR UPDATE'
    );
    if (!$departmentStatement) {
        throw new RuntimeException($database->error);
    }
    $departmentStatement->bind_param('i', $departmentId);
    if (!$departmentStatement->execute()) {
        throw new RuntimeException($departmentStatement->error);
    }
    $departmentResult = $departmentStatement->get_result();
    $department = $departmentResult ? $departmentResult->fetch_assoc() : null;
    $departmentStatement->close();
    if (!$department) {
        $database->rollback();
        $transactionStarted = false;
        catalogApiResponse(['success' => false, 'message' => 'Department not found.'], 404);
    }

    $headStatement = $database->prepare(
        "SELECT id, first_name, last_name, username
         FROM users
         WHERE id = ? AND LOWER(TRIM(role)) = 'head'
         LIMIT 1 FOR UPDATE"
    );
    if (!$headStatement) {
        throw new RuntimeException($database->error);
    }
    $headStatement->bind_param('i', $headId);
    if (!$headStatement->execute()) {
        throw new RuntimeException($headStatement->error);
    }
    $headResult = $headStatement->get_result();
    $head = $headResult ? $headResult->fetch_assoc() : null;
    $headStatement->close();
    if (!$head) {
        $database->rollback();
        $transactionStarted = false;
        catalogApiResponse(['success' => false, 'message' => 'The selected account is not a Department Head.'], 400);
    }

    $assignedStatement = $database->prepare(
        'SELECT id, name FROM departments WHERE head_id = ? AND id <> ? LIMIT 1 FOR UPDATE'
    );
    if (!$assignedStatement) {
        throw new RuntimeException($database->error);
    }
    $assignedStatement->bind_param('ii', $headId, $departmentId);
    if (!$assignedStatement->execute()) {
        throw new RuntimeException($assignedStatement->error);
    }
    $assignedResult = $assignedStatement->get_result();
    $assignedDepartment = $assignedResult ? $assignedResult->fetch_assoc() : null;
    $assignedStatement->close();
    if ($assignedDepartment) {
        $database->rollback();
        $transactionStarted = false;
        catalogApiResponse([
            'success' => false,
            'message' => 'This head is already assigned to another department.',
        ], 409);
    }

    $updateStatement = $database->prepare('UPDATE departments SET head_id = ? WHERE id = ?');
    if (!$updateStatement) {
        throw new RuntimeException($database->error);
    }
    $updateStatement->bind_param('ii', $headId, $departmentId);
    if (!$updateStatement->execute()) {
        throw new RuntimeException($updateStatement->error);
    }
    $updateStatement->close();
    $database->commit();
    $transactionStarted = false;

    catalogApiResponse([
        'success' => true,
        'message' => 'Department Head assigned successfully.',
        'department' => [
            'id' => (int) $department['id'],
            'name' => $department['name'],
            'head_id' => (int) $head['id'],
            'head_name' => trim((string) $head['first_name'] . ' ' . (string) $head['last_name'])
                ?: (string) $head['username'],
        ],
    ]);
} catch (Throwable $error) {
    if (isset($transactionStarted) && $transactionStarted && isset($database) && $database instanceof mysqli) {
        $database->rollback();
    }
    catalogApiHandleError('Department head assignment', $error);
}

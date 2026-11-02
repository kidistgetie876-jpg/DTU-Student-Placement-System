<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/catalog_api_helpers.php';
require_once __DIR__ . '/../../config/logger.php';

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($method, ['POST', 'DELETE'], true)) {
    header('Allow: POST, DELETE, OPTIONS');
    catalogApiResponse(['success' => false, 'message' => 'Method not allowed.'], 405);
}

try {
    $database = catalogApiGetDatabase();
    catalogApiRequireAdmin($database);
    $auditActor = getAuditActor($database);
    $input = catalogApiReadJsonInput();
    $transactionStarted = false;

    if ($method === 'DELETE') {
        $departmentId = filter_var($input['department_id'] ?? null, FILTER_VALIDATE_INT);
        if ($departmentId === false || $departmentId === null || $departmentId <= 0) {
            catalogApiResponse(['success' => false, 'message' => 'A valid department is required.'], 400);
        }

        if (!$database->begin_transaction()) {
            throw new RuntimeException($database->error ?: 'Unable to start department head removal.');
        }
        $transactionStarted = true;
        $departmentStatement = $database->prepare(
            "SELECT d.id, d.name, d.head_id, u.first_name, u.last_name, u.username
             FROM departments d
             LEFT JOIN users u ON u.id = d.head_id
             WHERE d.id = ? LIMIT 1 FOR UPDATE"
        );
        if (!$departmentStatement) {
            throw new RuntimeException($database->error);
        }
        $departmentStatement->bind_param('i', $departmentId);
        if (!$departmentStatement->execute()) {
            throw new RuntimeException($departmentStatement->error);
        }
        $department = $departmentStatement->get_result()->fetch_assoc();
        $departmentStatement->close();
        if (!$department) {
            $database->rollback();
            $transactionStarted = false;
            catalogApiResponse(['success' => false, 'message' => 'Department not found.'], 404);
        }
        if ($department['head_id'] === null) {
            if (!$database->commit()) {
                throw new RuntimeException($database->error ?: 'Unable to save department head removal.');
            }
            $transactionStarted = false;
            catalogApiResponse(['success' => true, 'message' => 'No department head is assigned.']);
        }

        $clearStatement = $database->prepare('UPDATE departments SET head_id = NULL WHERE id = ?');
        if (!$clearStatement) {
            throw new RuntimeException($database->error);
        }
        $clearStatement->bind_param('i', $departmentId);
        if (!$clearStatement->execute()) {
            throw new RuntimeException($clearStatement->error);
        }
        $clearStatement->close();
        if (!$database->commit()) {
            throw new RuntimeException($database->error ?: 'Unable to save department head removal.');
        }
        $transactionStarted = false;

        $headName = trim((string) $department['first_name'] . ' ' . (string) $department['last_name'])
            ?: (string) ($department['username'] ?? 'Unknown user');
        logActivity(
            $database,
            $auditActor['id'],
            $auditActor['name'],
            'department.remove_head',
            "Removed {$headName} as head of {$department['name']}."
        );
        catalogApiResponse([
            'success' => true,
            'message' => 'Department Head removed successfully.',
        ]);
    }

    $departmentId = filter_var($input['department_id'] ?? null, FILTER_VALIDATE_INT);
    $headId = filter_var($input['head_id'] ?? null, FILTER_VALIDATE_INT);
    if ($departmentId === false || $departmentId === null || $departmentId <= 0) {
        catalogApiResponse(['success' => false, 'message' => 'A valid department is required.'], 400);
    }
    if ($headId === false || $headId === null || $headId <= 0) {
        catalogApiResponse(['success' => false, 'message' => 'A valid Department Head account is required.'], 400);
    }

    if (!$database->begin_transaction()) {
        throw new RuntimeException($database->error ?: 'Unable to start department head assignment.');
    }
    $transactionStarted = true;

    $departmentStatement = $database->prepare(
        'SELECT d.id, d.name, d.head_id, u.first_name AS current_first_name,
                u.last_name AS current_last_name, u.username AS current_username
         FROM departments d LEFT JOIN users u ON u.id = d.head_id
         WHERE d.id = ? LIMIT 1 FOR UPDATE'
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
         WHERE id = ? AND LOWER(TRIM(role)) IN ('head', 'coordinator')
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
        catalogApiResponse(['success' => false, 'message' => 'The selected account is not a Department Head or coordinator.'], 400);
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
    if (!$database->commit()) {
        throw new RuntimeException($database->error ?: 'Unable to save department head assignment.');
    }
    $transactionStarted = false;

    $headName = trim((string) $head['first_name'] . ' ' . (string) $head['last_name'])
        ?: (string) $head['username'];
    if ((int) ($department['head_id'] ?? 0) !== $headId) {
        $previousHeadName = trim(
            (string) ($department['current_first_name'] ?? '') . ' ' . (string) ($department['current_last_name'] ?? '')
        ) ?: (string) ($department['current_username'] ?? '');
        $details = $previousHeadName !== ''
            ? "Changed head of {$department['name']} from {$previousHeadName} to {$headName}."
            : "Assigned {$headName} as head of {$department['name']}.";
        logActivity(
            $database,
            $auditActor['id'],
            $auditActor['name'],
            'department.assign_head',
            $details
        );
    }

    catalogApiResponse([
        'success' => true,
        'message' => 'Department Head assigned successfully.',
        'department' => [
            'id' => (int) $department['id'],
            'name' => $department['name'],
            'head_id' => (int) $head['id'],
            'head_name' => $headName,
        ],
    ]);
} catch (Throwable $error) {
    if (isset($transactionStarted) && $transactionStarted && isset($database) && $database instanceof mysqli) {
        $database->rollback();
    }
    catalogApiHandleError('Department head assignment', $error);
}

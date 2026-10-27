<?php

require_once __DIR__ . '/../common/student_placement_schema.php';

function resolveHeadDepartment(mysqli $db, $sessionUserId, ?string $sessionEmail = null): ?array
{
    $userColumns = studentPlacementTableColumns($db, 'users');
    $departmentColumns = studentPlacementTableColumns($db, 'departments');
    $userIdColumn = in_array('id', $userColumns, true)
        ? 'id'
        : (in_array('user_id', $userColumns, true) ? 'user_id' : '');
    if ($userIdColumn === '' || !in_array('id', $departmentColumns, true)) {
        throw new RuntimeException('User or department identifiers are unavailable.');
    }

    $userFields = ["`{$userIdColumn}` AS user_id"];
    foreach (['username', 'email', 'first_name', 'last_name', 'role', 'assigned_dept_id', 'department_id'] as $column) {
        if (in_array($column, $userColumns, true)) {
            $userFields[] = "`{$column}`";
        }
    }
    $user = null;
    $numericUserId = filter_var($sessionUserId, FILTER_VALIDATE_INT);
    if ($numericUserId !== false && $numericUserId !== null && $numericUserId > 0) {
        $userStatement = $db->prepare(
            'SELECT ' . implode(', ', $userFields) . " FROM users WHERE `{$userIdColumn}` = ? LIMIT 1"
        );
        if (!$userStatement) {
            throw new RuntimeException('Unable to prepare department-head account lookup: ' . $db->error);
        }
        $userStatement->bind_param('i', $numericUserId);
    } else {
        $identity = trim((string) ($sessionEmail ?? $sessionUserId));
        $identityColumn = in_array('email', $userColumns, true)
            ? 'email'
            : (in_array('username', $userColumns, true) ? 'username' : '');
        if ($identity === '' || $identityColumn === '') {
            return null;
        }
        $userStatement = $db->prepare(
            'SELECT ' . implode(', ', $userFields)
            . " FROM users WHERE LOWER(TRIM(`{$identityColumn}`)) = LOWER(TRIM(?)) LIMIT 1"
        );
        if (!$userStatement) {
            throw new RuntimeException('Unable to prepare department-head account lookup: ' . $db->error);
        }
        $userStatement->bind_param('s', $identity);
    }
    if (!$userStatement->execute()) {
        throw new RuntimeException('Unable to load department-head account: ' . $userStatement->error);
    }
    $user = $userStatement->get_result()->fetch_assoc() ?: null;
    $userStatement->close();
    if (!$user && $sessionEmail !== null && trim($sessionEmail) !== '') {
        $identityColumn = in_array('email', $userColumns, true)
            ? 'email'
            : (in_array('username', $userColumns, true) ? 'username' : '');
        if ($identityColumn !== '') {
            $userStatement = $db->prepare(
                'SELECT ' . implode(', ', $userFields)
                . " FROM users WHERE LOWER(TRIM(`{$identityColumn}`)) = LOWER(TRIM(?)) LIMIT 1"
            );
            if (!$userStatement) {
                throw new RuntimeException('Unable to prepare department-head email lookup: ' . $db->error);
            }
            $userStatement->bind_param('s', $sessionEmail);
            if (!$userStatement->execute()) {
                throw new RuntimeException('Unable to resolve department-head email: ' . $userStatement->error);
            }
            $user = $userStatement->get_result()->fetch_assoc() ?: null;
            $userStatement->close();
        }
    }
    if (!$user) {
        return null;
    }

    $headRole = strtolower(trim((string) ($user['role'] ?? '')));
    if ($headRole !== '' && !in_array($headRole, ['head', 'department head', 'department_head', 'head of department', 'hod', 'coordinator'], true)) {
        return null;
    }

    $department = null;
    $assignedDepartmentId = filter_var($user['assigned_dept_id'] ?? null, FILTER_VALIDATE_INT);
    if ($assignedDepartmentId !== false && $assignedDepartmentId !== null && $assignedDepartmentId > 0) {
        $statement = $db->prepare('SELECT d.* FROM departments d WHERE d.id = ? LIMIT 1');
        if (!$statement) {
            throw new RuntimeException('Unable to prepare assigned department lookup: ' . $db->error);
        }
        $statement->bind_param('i', $assignedDepartmentId);
        if (!$statement->execute()) {
            throw new RuntimeException('Unable to load assigned department: ' . $statement->error);
        }
        $department = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
    }

    $headLinkColumns = studentPlacementTableColumns($db, 'department_heads');

    if (!$department && in_array('user_id', $headLinkColumns, true) && in_array('department_id', $headLinkColumns, true)) {
        $linkStatus = in_array('status', $headLinkColumns, true)
            ? " AND LOWER(TRIM(COALESCE(dh.status, ''))) = 'active'"
            : '';
        $orderBy = in_array('id', $headLinkColumns, true) ? ' ORDER BY dh.id DESC' : '';
        $statement = $db->prepare(
            'SELECT d.* FROM department_heads dh'
            . ' INNER JOIN departments d ON d.id = dh.department_id'
            . ' WHERE dh.user_id = ?' . $linkStatus . $orderBy . ' LIMIT 1'
        );
        if (!$statement) {
            throw new RuntimeException('Unable to prepare department assignment lookup: ' . $db->error);
        }
        $resolvedUserId = (int) $user['user_id'];
        $statement->bind_param('i', $resolvedUserId);
        if (!$statement->execute()) {
            throw new RuntimeException('Unable to load department assignment: ' . $statement->error);
        }
        $department = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
    }

    if (!$department && in_array('head_id', $departmentColumns, true)) {
        $identities = array_values(array_unique(array_filter([
            trim((string) $user['user_id']),
            trim((string) ($user['username'] ?? '')),
            trim((string) ($user['email'] ?? '')),
        ], static fn (string $value): bool => $value !== '')));
        $matches = [];
        foreach ($identities as $identity) {
            $matches[] = "LOWER(TRIM(CAST(d.head_id AS CHAR))) = LOWER(TRIM(?))";
        }
        if ($matches) {
            $statement = $db->prepare(
                'SELECT d.* FROM departments d WHERE (' . implode(' OR ', $matches) . ')'
                . ' ORDER BY d.id DESC LIMIT 1'
            );
            if (!$statement) {
                throw new RuntimeException('Unable to prepare department-head ID lookup: ' . $db->error);
            }
            $types = str_repeat('s', count($identities));
            $values = $identities;
            $arguments = [$types];
            foreach ($values as &$value) {
                $arguments[] = &$value;
            }
            unset($value);
            if (!call_user_func_array([$statement, 'bind_param'], $arguments)) {
                throw new RuntimeException('Unable to bind department-head ID lookup: ' . $statement->error);
            }
            if (!$statement->execute()) {
                throw new RuntimeException('Unable to load department assignment: ' . $statement->error);
            }
            $department = $statement->get_result()->fetch_assoc() ?: null;
            $statement->close();
        }
    }

    if (!$department && in_array('head_name', $departmentColumns, true)) {
        $names = array_values(array_unique(array_filter([
            trim((string) $user['user_id']),
            trim((string) ($user['username'] ?? '')),
            trim((string) ($user['email'] ?? '')),
            trim((string) ($user['first_name'] ?? '') . ' ' . (string) ($user['last_name'] ?? '')),
        ], static fn (string $value): bool => $value !== '')));
        if ($names) {
            $matches = array_fill(0, count($names), "LOWER(TRIM(d.head_name)) = LOWER(TRIM(?))");
            $statement = $db->prepare(
                'SELECT d.* FROM departments d WHERE (' . implode(' OR ', $matches) . ')'
                . ' ORDER BY d.id DESC LIMIT 1'
            );
            if (!$statement) {
                throw new RuntimeException('Unable to prepare department-head name lookup: ' . $db->error);
            }
            $types = str_repeat('s', count($names));
            $arguments = [$types];
            foreach ($names as &$name) {
                $arguments[] = &$name;
            }
            unset($name);
            if (!call_user_func_array([$statement, 'bind_param'], $arguments)) {
                throw new RuntimeException('Unable to bind department-head name lookup: ' . $statement->error);
            }
            if (!$statement->execute()) {
                throw new RuntimeException('Unable to load department assignment: ' . $statement->error);
            }
            $department = $statement->get_result()->fetch_assoc() ?: null;
            $statement->close();
        }
    }

    if (!$department && in_array('department_id', $userColumns, true)) {
        $statement = $db->prepare(
            'SELECT d.* FROM departments d INNER JOIN users u ON d.id = u.department_id'
            . " WHERE u.`{$userIdColumn}` = ? LIMIT 1"
        );
        if (!$statement) {
            throw new RuntimeException('Unable to prepare user department lookup: ' . $db->error);
        }
        $resolvedUserId = (int) $user['user_id'];
        $statement->bind_param('i', $resolvedUserId);
        if (!$statement->execute()) {
            throw new RuntimeException('Unable to load user department: ' . $statement->error);
        }
        $department = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
    }

    if (!$department) {
        return null;
    }
    $department['id'] = (int) $department['id'];
    $department['department_id'] = $department['id'];
    $department['head_username'] = (string) ($user['username'] ?? '');
    $department['head_email'] = (string) ($user['email'] ?? '');
    if (empty($department['head_name'])) {
        $department['head_name'] = $department['head_username'];
    }
    return $department;
}

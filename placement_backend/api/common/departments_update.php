<?php
// 1. CORS ፈቃድ - ለ 3000 እና 3001 ፖርት
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Allow-Credentials: true");
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

include __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/logger.php';
require_once __DIR__ . '/../../config/department_capacity.php';
require_once __DIR__ . '/../head/head_department.php';
$db = getDbConnection();
try {
    ensureDepartmentCapacityApprovalSchema($db);
} catch (Throwable $error) {
    error_log('Department capacity update schema setup failed: ' . $error->getMessage());
    http_response_code(503);
    echo json_encode(["success" => false, "message" => "Department capacity settings are temporarily unavailable."]);
    exit;
}
$auditActor = getAuditActor($db);

$input = file_get_contents("php://input");
$data = json_decode($input, true);
if (!is_array($data)) {
    $data = $_POST;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $updates = is_array($data) && isset($data['capacities'])
        ? $data['capacities']
        : (is_array($data) && isset($data['departments']) ? $data['departments'] : []);
    $approveCapacities = !empty($data['approve_capacities']);
    $actorRole = strtolower(trim((string) ($auditActor['role'] ?? '')));
    $isRegistrar = $actorRole === 'registrar';
    $isHead = in_array($actorRole, ['head', 'hod', 'coordinator', 'head_of_department', 'head of department', 'department_head', 'department head'], true);
    if (!$isRegistrar && !$isHead && $actorRole !== 'admin') {
        http_response_code(401);
        echo json_encode(["success" => false, "message" => "Sign in with an authorized department role."]);
        exit;
    }

    if (!empty($data['allow_head_edit'])) {
        if (!$isRegistrar) {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "Only a registrar can unlock department capacities."]);
            exit;
        }

        if (!$db->begin_transaction()) {
            http_response_code(503);
            echo json_encode(["success" => false, "message" => "Unable to begin the capacity unlock operation."]);
            exit;
        }
        $unlockStatement = $db->prepare(
            "UPDATE departments
             SET capacity_approved = 0, approval_status = 'reopened', is_locked = 0
             WHERE capacity_approved = 1
                OR LOWER(TRIM(approval_status)) = 'approved'
                OR is_locked = 1"
        );
        if (!$unlockStatement || !$unlockStatement->execute()) {
            $error = $unlockStatement ? $unlockStatement->error : $db->error;
            if ($unlockStatement) {
                $unlockStatement->close();
            }
            $db->rollback();
            error_log('Department capacity unlock failed: ' . $error);
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Unable to unlock department capacities."]);
            exit;
        }

        $unlockedCount = $unlockStatement->affected_rows;
        $unlockStatement->close();
        if (!$db->commit()) {
            $db->rollback();
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Unable to save department capacity unlocks."]);
            exit;
        }
        logActivity(
            $db,
            $auditActor['id'],
            $auditActor['name'],
            'department.capacity_unlock',
            json_encode(['unlocked_count' => $unlockedCount])
        );
        echo json_encode([
            "success" => true,
            "status" => "success",
            "updated_count" => $unlockedCount,
            "message" => $unlockedCount > 0
                ? "Department capacities are unlocked for editing."
                : "There are no approved department capacities to unlock.",
        ]);
        $db->close();
        exit;
    }

    if ($approveCapacities && !$isRegistrar) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Only a registrar can approve department capacities."]);
        exit;
    }

    $assignedHeadDepartmentId = 0;
    if ($isHead) {
        $assignedHeadDepartment = resolveHeadDepartment(
            $db,
            $auditActor['id'] ?? 0,
            isset($_SESSION['email']) ? (string) $_SESSION['email'] : null
        );
        if (!$assignedHeadDepartment) {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "No active department is assigned to this head."]);
            exit;
        }
        $assignedHeadDepartmentId = (int) $assignedHeadDepartment['id'];
    }

    if (empty($updates)) {
        echo json_encode(["success" => false, "message" => "ምንም ዳታ አልደረሰኝም።"]);
        exit;
    }

    $departmentRead = $db->prepare('SELECT capacity, is_locked FROM departments WHERE id = ? LIMIT 1 FOR UPDATE');
    $capacityUpdate = $db->prepare('UPDATE departments SET capacity = ?, capacity_approved = COALESCE(?, capacity_approved), approval_status = COALESCE(?, approval_status), is_locked = COALESCE(?, is_locked) WHERE id = ?');
    $statusUpdate = $db->prepare('UPDATE departments SET capacity = ?, status = ?, capacity_approved = COALESCE(?, capacity_approved), approval_status = COALESCE(?, approval_status), is_locked = COALESCE(?, is_locked) WHERE id = ?');
    if (!$departmentRead || !$capacityUpdate || !$statusUpdate) {
        echo json_encode(["success" => false, "message" => "Unable to prepare department updates."]);
        exit;
    }

    if (!$db->begin_transaction()) {
        http_response_code(503);
        echo json_encode(["success" => false, "message" => "Unable to begin the department capacity update."]);
        exit;
    }

    $successCount = 0;
    foreach ($updates as $dept) {
        if (!is_array($dept)) {
            $db->rollback();
            $departmentRead->close();
            $capacityUpdate->close();
            $statusUpdate->close();
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Each capacity update must be an object."]);
            exit;
        }
        $id = (int) ($dept['department_id'] ?? $dept['id'] ?? 0);
        $capacity = filter_var($dept['capacity'] ?? null, FILTER_VALIDATE_INT);
        if ($id <= 0 || $capacity === false || $capacity < 0) {
            $db->rollback();
            $departmentRead->close();
            $capacityUpdate->close();
            $statusUpdate->close();
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Each department needs a valid ID and non-negative integer capacity."]);
            exit;
        }

        if (array_key_exists('status', $dept)) {
            $status = strtolower(trim((string) $dept['status']));
            if (!in_array($status, ['active', 'inactive'], true)) {
                $db->rollback();
                $departmentRead->close();
                $capacityUpdate->close();
                $statusUpdate->close();
                http_response_code(400);
                echo json_encode(["success" => false, "message" => "Department status must be active or inactive."]);
                exit;
            }
        }

        $departmentRead->bind_param('i', $id);
        if (!$departmentRead->execute()) {
            $db->rollback();
            $departmentRead->close();
            $capacityUpdate->close();
            $statusUpdate->close();
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Unable to read the current department capacity."]);
            exit;
        }
        $currentDepartment = $departmentRead->get_result()->fetch_assoc();
        if (!$currentDepartment) {
            $db->rollback();
            $departmentRead->close();
            $capacityUpdate->close();
            $statusUpdate->close();
            http_response_code(404);
            echo json_encode(["success" => false, "message" => "Department not found."]);
            exit;
        }

        $capacityChanged = (int) $currentDepartment['capacity'] !== $capacity;
        if ($isHead && $id !== $assignedHeadDepartmentId) {
            $db->rollback();
            $departmentRead->close();
            $capacityUpdate->close();
            $statusUpdate->close();
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "You can only edit the capacity of your assigned department."]);
            exit;
        }
        if ($isHead && (int) $currentDepartment['is_locked'] === 1) {
            $db->rollback();
            $departmentRead->close();
            $capacityUpdate->close();
            $statusUpdate->close();
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "Capacity is locked."]);
            exit;
        }

        $approvalState = $approveCapacities ? 1 : ($capacityChanged ? 0 : null);
        $approvalStatus = $approveCapacities ? 'approved' : ($capacityChanged ? 'pending' : null);
        $lockedState = $approveCapacities ? 1 : ($capacityChanged ? 0 : null);

        if (array_key_exists('status', $dept)) {
            $statusUpdate->bind_param('isisii', $capacity, $status, $approvalState, $approvalStatus, $lockedState, $id);
            $updated = $statusUpdate->execute();
        } else {
            $capacityUpdate->bind_param('iisii', $capacity, $approvalState, $approvalStatus, $lockedState, $id);
            $updated = $capacityUpdate->execute();
        }

        if (!$updated) {
            $error = $db->error;
            $db->rollback();
            $departmentRead->close();
            $capacityUpdate->close();
            $statusUpdate->close();
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Unable to update department: " . $error]);
            exit;
        }
        $successCount++;
    }
    $departmentRead->close();
    $capacityUpdate->close();
    $statusUpdate->close();
    if (!$db->commit()) {
        $db->rollback();
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Unable to save department capacity updates."]);
        exit;
    }

    echo json_encode([
        "success" => true, 
        "status" => "success",
        "updated_count" => $successCount,
        "message" => $approveCapacities
            ? "Department capacities approved and updated."
            : "Capacities updated"
    ]);
    logActivity($db, $auditActor['id'], $auditActor['name'], 'department.capacity_update', json_encode(['updated_count' => $successCount]));
}
$db->close();
?>
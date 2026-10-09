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
$db = getDbConnection();
$auditActor = getAuditActor($db);

$input = file_get_contents("php://input");
$data = json_decode($input, true);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $updates = isset($data['departments']) ? $data['departments'] : [];
    $approveCapacities = !empty($data['approve_capacities']);
    $actorRole = strtolower(trim((string) ($auditActor['role'] ?? '')));
    $isRegistrar = $actorRole === 'registrar';
    $isHead = in_array($actorRole, ['head', 'hod', 'head_of_department', 'head of department'], true);

    if ($approveCapacities && !$isRegistrar) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Only a registrar can approve department capacities."]);
        exit;
    }

    if (empty($updates)) {
        echo json_encode(["success" => false, "message" => "ምንም ዳታ አልደረሰኝም።"]);
        exit;
    }

    $departmentRead = $db->prepare('SELECT capacity FROM departments WHERE id = ? LIMIT 1');
    $capacityUpdate = $db->prepare('UPDATE departments SET capacity = ?, capacity_approved = COALESCE(?, capacity_approved) WHERE id = ?');
    $statusUpdate = $db->prepare('UPDATE departments SET capacity = ?, status = ?, capacity_approved = COALESCE(?, capacity_approved) WHERE id = ?');
    if (!$departmentRead || !$capacityUpdate || !$statusUpdate) {
        echo json_encode(["success" => false, "message" => "Unable to prepare department updates."]);
        exit;
    }

    $successCount = 0;
    foreach ($updates as $dept) {
        $id = (int) ($dept['id'] ?? 0);
        $capacity = filter_var($dept['capacity'] ?? null, FILTER_VALIDATE_INT);
        if ($id <= 0 || $capacity === false || $capacity < 0) {
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
            $departmentRead->close();
            $capacityUpdate->close();
            $statusUpdate->close();
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Unable to read the current department capacity."]);
            exit;
        }
        $currentDepartment = $departmentRead->get_result()->fetch_assoc();
        if (!$currentDepartment) {
            $departmentRead->close();
            $capacityUpdate->close();
            $statusUpdate->close();
            http_response_code(404);
            echo json_encode(["success" => false, "message" => "Department not found."]);
            exit;
        }

        $approvalState = $approveCapacities
            ? 1
            : ($isHead && (int) $currentDepartment['capacity'] !== $capacity ? 0 : null);

        if (array_key_exists('status', $dept)) {
            $statusUpdate->bind_param('isii', $capacity, $status, $approvalState, $id);
            $updated = $statusUpdate->execute();
        } else {
            $capacityUpdate->bind_param('iii', $capacity, $approvalState, $id);
            $updated = $capacityUpdate->execute();
        }

        if (!$updated) {
            $error = $db->error;
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

    echo json_encode([
        "success" => true, 
        "message" => "በተሳካ ሁኔታ የ $successCount ዲፓርትመንቶች አቅም በዳታቤዝ ተዘምኗል!"
    ]);
    logActivity($db, $auditActor['id'], $auditActor['name'], 'department.capacity_update', json_encode(['updated_count' => $successCount]));
}
$db->close();
?>
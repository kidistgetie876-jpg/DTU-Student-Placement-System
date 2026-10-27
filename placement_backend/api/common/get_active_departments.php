<?php
require_once __DIR__ . '/../../config/cors.php';
sendCorsHeaders();
require_once __DIR__ . '/../../config/db_config.php';
require_once __DIR__ . '/../../config/placement_semester.php';
require_once __DIR__ . '/student_placement_allocation.php';
header('Content-Type: application/json; charset=UTF-8');

function sendDepartmentsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET, OPTIONS');
    sendDepartmentsResponse(['success' => false, 'message' => 'Only GET requests are allowed.'], 405);
}

try {
    $db = getDbConnection();
    if (!$db instanceof mysqli) {
        throw new RuntimeException('Database connection is unavailable.');
    }

    $columnsResult = $db->query('SHOW COLUMNS FROM departments');
    if (!$columnsResult) {
        throw new RuntimeException($db->error ?: 'Unable to inspect the departments table.');
    }

    $columnNames = [];
    while ($column = $columnsResult->fetch_assoc()) {
        $columnNames[(string) $column['Field']] = true;
    }
    $columnsResult->free();

    $collegeId = isset($_GET['college_id']) ? (int) $_GET['college_id'] : 0;
    $collegeName = trim((string) ($_GET['college_name'] ?? ''));
    $status = strtolower(trim((string) ($_GET['status'] ?? 'active')));
    $semester = (int) ($_GET['semester'] ?? 1);
    if (!in_array($semester, [1, 2], true)) {
        sendDepartmentsResponse(['success' => false, 'message' => 'A valid placement semester is required.'], 400);
    }
    $studentId = trim((string) ($_GET['student_id'] ?? ''));
    $admissionNumber = trim((string) ($_GET['admission_number'] ?? ''));
    if ($admissionNumber === '' && $studentId !== '' && !ctype_digit($studentId)) {
        $admissionNumber = $studentId;
    }
    $showAll = in_array($status, ['all', 'all_status', 'all-status', 'both', 'false', '0'], true);
    $allocatedGroup = '';
    $allocatedCollege = '';
    $secondSemesterEligible = false;
    if ($semester === 2) {
        $settingsColumns = studentPlacementTableColumns($db, 'placement_settings');
        $activeSemester = 1;
        if (in_array('active_semester', $settingsColumns, true)) {
            $settingsResult = $db->query('SELECT active_semester FROM placement_settings WHERE id = 1 LIMIT 1');
            if (!$settingsResult) {
                throw new RuntimeException('Unable to load the active placement semester: ' . $db->error);
            }
            $settings = $settingsResult->fetch_assoc();
            $settingsResult->free();
            $activeSemester = (int) ($settings['active_semester'] ?? 1);
        }
        $secondSemesterPortal = getStudentSecondSemesterChoicePortalState(
            $db,
            $studentId,
            $admissionNumber
        );
        $secondSemesterEligible = $secondSemesterPortal['eligible'];
        $allocation = $secondSemesterPortal['allocation'] ?? ['group' => '', 'college' => ''];
        $allocatedGroup = (string) ($allocation['group'] ?? '');
        $allocatedCollege = trim((string) ($allocation['college'] ?? ''));
    }

    if (($semester === 2 || !$showAll)
        && !isset($columnNames['status'])
        && !isset($columnNames['is_active'])) {
        throw new RuntimeException('The departments table is missing a supported active-status column.');
    }

    $selectFields = ['id', 'name'];
    foreach (['college_name', 'college_id', 'stream', 'placement_group'] as $field) {
        if (isset($columnNames[$field])) {
            $selectFields[] = $field;
        }
    }
    if (isset($columnNames['status']) && isset($columnNames['is_active'])) {
        $selectFields[] = "CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'active' OR is_active = 1 THEN 'active' ELSE 'inactive' END AS status";
    } elseif (isset($columnNames['status'])) {
        $selectFields[] = 'status';
    } elseif (isset($columnNames['is_active'])) {
        $selectFields[] = "CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END AS status";
    }
    $selectFields[] = isset($columnNames['offered_semester'])
        ? 'offered_semester'
        : ($semester === 2 ? '2 AS offered_semester' : 'NULL AS offered_semester');
    $selectFields[] = isset($columnNames['is_first_semester_only'])
        ? 'is_first_semester_only'
        : '0 AS is_first_semester_only';

    $sql = 'SELECT ' . implode(', ', $selectFields) . ' FROM departments';
    $whereClauses = [];
    $values = [];

    if ($semester === 2 || !$showAll) {
        $activeConditions = [];
        if (isset($columnNames['status'])) {
            $activeConditions[] = "LOWER(TRIM(COALESCE(status, ''))) = 'active'";
        }
        if (isset($columnNames['is_active'])) {
            $activeConditions[] = 'is_active = 1';
        }
        $whereClauses[] = '(' . implode(' OR ', $activeConditions) . ')';
    }

    if ($semester === 2) {
        if (!$secondSemesterEligible || $allocatedGroup === '' || $allocatedCollege === ''
            || !isset($columnNames['college_name'])) {
            $whereClauses[] = '1 = 0';
        } else {
            $requestedCollege = trim(preg_replace('/\s+/', ' ', $collegeName) ?? $collegeName);
            if (
                $requestedCollege !== ''
                && normalizeStudentPlacementCollegeName($requestedCollege)
                    !== normalizeStudentPlacementCollegeName($allocatedCollege)
            ) {
                $whereClauses[] = '1 = 0';
            }
            $collegeKey = normalizeStudentPlacementCollegeName($allocatedCollege);
            $collegeNames = [$allocatedCollege];
            if ($collegeKey === 'other social science') {
                $collegeNames = array_merge($collegeNames, [
                    'Other Social Science',
                    'Other Social Sciences',
                    'Social Science',
                    'Social Sciences',
                    'College of Social Science',
                    'College of Social Sciences',
                    'College of Other Social Science',
                    'College of Other Social Sciences',
                ]);
            } elseif ($collegeKey === 'other natural science') {
                $collegeNames = array_merge($collegeNames, [
                    'Other Natural Science',
                    'Other Natural Sciences',
                    'Natural Science',
                    'Natural Sciences',
                    'College of Other Natural Science',
                    'College of Other Natural Sciences',
                ]);
            } elseif ($collegeKey === 'health science') {
                $collegeNames = array_merge($collegeNames, [
                    'Health Science',
                    'Health Sciences',
                    'College of Health Science',
                    'College of Health Sciences',
                ]);
            } elseif ($collegeKey === 'gafat institute of technology') {
                $collegeNames[] = 'Gafat Institute of Technology';
            } elseif ($collegeKey === 'law') {
                $collegeNames[] = 'School of Law';
                $collegeNames[] = 'Law';
            }
            $collegeNames = array_values(array_unique(array_map(
                static fn(string $name): string => strtolower(trim(preg_replace('/\s+/', ' ', $name) ?? $name)),
                $collegeNames
            )));
            $whereClauses[] = 'LOWER(TRIM(COALESCE(college_name, \'\'))) IN ('
                . implode(', ', array_fill(0, count($collegeNames), '?')) . ')';
            array_push($values, ...$collegeNames);
        }
    }

    if ($semester !== 2 && $collegeId > 0 && isset($columnNames['college_id'])) {
        $whereClauses[] = 'college_id = ' . (int) $collegeId;
    } elseif ($semester !== 2 && $collegeName !== '') {
        if (isset($columnNames['college_name'])) {
            if (strcasecmp($collegeName, 'School of Law') === 0) {
                $whereClauses[] = "LOWER(TRIM(COALESCE(college_name, ''))) IN ('law', 'school of law')";
            } else {
                $safeCollegeName = $db->real_escape_string($collegeName);
                $whereClauses[] = "LOWER(TRIM(COALESCE(college_name, ''))) LIKE '%" . strtolower($safeCollegeName) . "%'";
            }
        } else {
            $whereClauses[] = '1 = 0';
        }
    } elseif ($collegeId > 0) {
        $whereClauses[] = '1 = 0';
    }

    if ($whereClauses) {
        $sql .= ' WHERE ' . implode(' AND ', $whereClauses);
    }
    $sql .= ' ORDER BY name ASC';

    if ($values) {
        $statement = $db->prepare($sql);
        if (!$statement) {
            throw new RuntimeException($db->error ?: 'Unable to prepare the active department lookup.');
        }
        $types = str_repeat('s', count($values));
        $statement->bind_param($types, ...$values);
        if (!$statement->execute()) {
            throw new RuntimeException($statement->error ?: 'Unable to fetch active departments.');
        }
        $result = $statement->get_result();
    } else {
        $statement = null;
        $result = $db->query($sql);
    }
    if (!$result) {
        throw new RuntimeException($db->error ?: 'Unable to fetch active departments.');
    }

    $departments = [];
    while ($row = $result->fetch_assoc()) {
        if ($semester === 2 && !placementDepartmentOfferedInSemester($row, 2)) {
            continue;
        }
        $normalizedCollegeName = trim((string) ($row['college_name'] ?? ''));
        if (strcasecmp($normalizedCollegeName, 'Law') === 0) {
            $normalizedCollegeName = 'School of Law';
        }
        if ($semester === 2) {
            $departmentGroup = normalizeStudentPlacementGroup(
                (string) ($row['placement_group'] ?? ''),
                $normalizedCollegeName,
                (string) ($row['stream'] ?? '')
            );
            if (
                $departmentGroup !== $allocatedGroup
                || normalizeStudentPlacementCollegeName($normalizedCollegeName)
                    !== normalizeStudentPlacementCollegeName($allocatedCollege)
            ) {
                continue;
            }
        }
        $row['college_name'] = $normalizedCollegeName;
        $departments[] = $row;
    }

    $result->free();
    if ($statement instanceof mysqli_stmt) {
        $statement->close();
    }
    $db->close();

    sendDepartmentsResponse([
        'success' => true,
        'departments' => $departments,
        'placementGroup' => $allocatedGroup,
        'allocated_college' => $allocatedCollege,
        'secondSemesterChoiceEligible' => $secondSemesterEligible,
    ]);
} catch (Throwable $error) {
    error_log('Active department lookup failed: ' . $error->getMessage());
    if (isset($db) && $db instanceof mysqli) {
        $db->close();
    }
    sendDepartmentsResponse([
        'success' => false,
        'message' => 'Unable to load active departments.',
        'error' => $error->getMessage(),
    ], 503);
}

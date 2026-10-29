<?php

function roleFeatureDefaults(): array
{
    $features = [
        'student.overview',
        'student.preferences',
        'student.results',
        'student.appeals',
        'student.notifications',
        'registrar.overview',
        'registrar.student-information',
        'registrar.data-import',
        'registrar.choice-matrix',
        'registrar.capacity',
        'registrar.department-status',
        'registrar.placement-rules',
        'registrar.settings',
        'registrar.deadlines',
        'registrar.run-placement',
        'registrar.approve-results',
        'registrar.placed-students',
        'registrar.unassigned-students',
        'registrar.appeals',
        'registrar.reports',
        'registrar.announcements',
        'head.overview',
        'head.approvals',
        'head.capacity',
        'head.students',
        'head.reports',
        'admin.overview',
        'admin.users',
        'admin.departments',
        'admin.reports',
        'admin.contact-messages',
        'admin.assign-head',
        'admin.data-import',
        'admin.audit-logs',
        'admin.system-settings',
        'admin.account-settings',
    ];
    return array_fill_keys($features, true);
}

function roleFeatureEndpointMap(): array
{
    return [
        'common/dashboard_overview_api.php' => ['registrar.overview', 'admin.overview'],
        'common/departments_api.php' => [
            'POST' => ['admin.departments'],
            'PUT' => ['admin.departments'],
            'DELETE' => ['admin.departments'],
        ],
        'common/colleges_api.php' => [
            'POST' => ['admin.departments'],
            'PUT' => ['admin.departments'],
            'DELETE' => ['admin.departments'],
        ],
        'common/departments_update.php' => ['registrar.department-status', 'admin.departments'],
        'common/choices_api.php' => ['student.preferences'],
        'common/choices_matrix_api.php' => ['registrar.choice-matrix'],
        'common/send_notification.php' => ['registrar.announcements'],
        'common/send_report.php' => ['registrar.reports', 'head.reports'],
        'common/download_report.php' => ['registrar.reports', 'head.reports', 'admin.reports', 'student.notifications'],
        'common/get_notifications.php' => [
            'student.notifications',
            'registrar.announcements',
            'head.reports',
            'admin.contact-messages',
        ],
        'common/mark_notifications_read.php' => [
            'student.notifications',
            'registrar.announcements',
            'head.reports',
            'admin.contact-messages',
        ],
        'student/student_data_api.php' => ['student.overview'],
        'student/student_profile.php' => [
            'GET' => ['student.overview', 'registrar.student-information'],
        ],
        'student/placement_status.php' => ['student.overview'],
        'student/student_preferences.php' => [
            'GET' => ['student.preferences', 'registrar.student-information'],
            'POST' => ['student.preferences'],
        ],
        'student/get_student_result.php' => ['student.results'],
        'student/submit_appeal.php' => [
            'GET' => ['student.appeals', 'registrar.appeals'],
            'POST' => ['student.appeals'],
        ],
        'student/get_student_notifications.php' => ['student.notifications'],
        'student/get_active_departments.php' => ['student.preferences'],
        'student/mark_notification_read.php' => ['student.notifications'],
        'student/mark_all_notifications_read.php' => ['student.notifications'],
        'student/delete_student_notification.php' => ['student.notifications'],
        'registrar/student_information.php' => ['registrar.student-information'],
        'registrar/register_student.php' => ['registrar.student-information'],
        'registrar/update_student.php' => ['registrar.student-information'],
        'registrar/delete_student.php' => ['registrar.student-information'],
        'registrar/registrar_import_api.php' => ['registrar.data-import'],
        'registrar/import_sims.php' => ['registrar.data-import'],
        'registrar/import_moshe.php' => ['registrar.data-import'],
        'registrar/get_student_choice_matrix.php' => ['registrar.choice-matrix'],
        'registrar/candidate_students_api.php' => ['registrar.run-placement'],
        'registrar/get_placement_candidates.php' => ['registrar.run-placement'],
        'registrar/get_second_semester_candidates.php' => ['registrar.run-placement'],
        'registrar/placement_preview.php' => ['registrar.run-placement'],
        'registrar/placement_engine.php' => ['registrar.run-placement'],
        'registrar/run_second_semester_placement.php' => ['registrar.run-placement'],
        'registrar/activate_second_semester.php' => ['registrar.run-placement'],
        'registrar/clear_placements.php' => ['registrar.run-placement'],
        'registrar/assign_manual_student.php' => ['registrar.run-placement'],
        'registrar/get_pending_results.php' => ['registrar.approve-results'],
        'registrar/publish_results.php' => ['registrar.approve-results'],
        'registrar/publish_all_results.php' => ['registrar.approve-results'],
        'registrar/get_placed_students.php' => ['registrar.placed-students'],
        'registrar/get_unplaced_students.php' => ['registrar.overview'],
        'registrar/unassigned_students_api.php' => ['registrar.unassigned-students'],
        'registrar/get_placement_settings.php' => [
            'GET' => [
                'student.overview',
                'registrar.settings',
                'registrar.placement-rules',
                'registrar.deadlines',
                'admin.system-settings',
            ],
        ],
        'registrar/update_placement_settings.php' => ['registrar.settings', 'registrar.placement-rules', 'registrar.deadlines'],
        'registrar/toggle_second_sem_choice.php' => ['registrar.settings'],
        'registrar/get_registrar_stats.php' => ['registrar.overview'],
        'registrar/get_registrar_reports.php' => ['registrar.reports'],
        'registrar/get_sent_reports.php' => ['registrar.reports'],
        'registrar/mark_report_read.php' => ['registrar.reports'],
        'registrar/delete_sent_report.php' => ['registrar.reports'],
        'registrar/clear_student_preferences.php' => ['registrar.choice-matrix'],
        'registrar/reset_active_student_choices.php' => ['registrar.choice-matrix'],
        'registrar/delete_selected_student_choices.php' => ['registrar.choice-matrix'],
        'registrar/delete_appeal.php' => ['registrar.appeals'],
        'registrar/delete_admin_report.php' => ['registrar.reports'],
        'registrar/update-rules.php' => ['registrar.placement-rules'],
        'admin/users_api.php' => [
            'GET' => ['admin.users', 'registrar.student-information'],
            'POST' => ['admin.users'],
            'PUT' => ['admin.users'],
            'DELETE' => ['admin.users'],
        ],
        'admin/import_api.php' => ['admin.data-import'],
        'admin/import_users.php' => ['admin.data-import'],
        'admin/add_college.php' => ['admin.departments'],
        'admin/add_stream.php' => ['admin.departments'],
        'admin/assign_department_head.php' => ['admin.assign-head'],
        'admin/get_colleges.php' => ['admin.departments'],
        'admin/get_streams.php' => ['admin.departments'],
        'admin/audit_logs_api.php' => ['admin.audit-logs'],
        'admin/get_admin_reports.php' => ['admin.reports'],
        'admin/delete_report.php' => ['admin.reports'],
        'admin/mark_report_read.php' => ['admin.reports'],
        'admin/get_contact_messages.php' => ['admin.contact-messages'],
        'admin/delete_contact_message.php' => ['admin.contact-messages'],
        'admin/mark_message_read.php' => ['admin.contact-messages'],
        'admin/send_contact_reply.php' => ['admin.contact-messages'],
        'admin/send_message.php' => ['admin.contact-messages'],
        'admin/get_admin_stats.php' => ['admin.overview'],
        'head/get_head_dashboard.php' => ['head.overview'],
        'head/head_api.php' => ['head.overview'],
        'head/head_preferences.php' => ['head.approvals'],
        'head/head_approval.php' => ['head.approvals'],
        'head/approve_placement.php' => ['head.approvals'],
        'head/get_department_capacity.php' => ['head.capacity'],
        'head/get_placed_students.php' => ['head.students'],
        'head/get_head_reports.php' => ['head.reports'],
        'head/mark_report_read.php' => ['head.reports'],
        'head/delete_head_report.php' => ['head.reports'],
        'head/clear_head_report_history.php' => ['head.reports'],
        'head/send_head_message.php' => ['head.reports'],
    ];
}

function roleFeatureSettings(mysqli $db): array
{
    $defaults = roleFeatureDefaults();
    $table = $db->query("SHOW TABLES LIKE 'system_settings'");
    if (!$table) {
        throw new RuntimeException('Unable to inspect role permission storage: ' . $db->error);
    }
    $exists = $table->num_rows > 0;
    $table->free();
    if (!$exists) {
        return $defaults;
    }

    $key = 'role_permissions';
    $statement = $db->prepare('SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1');
    if (!$statement) {
        throw new RuntimeException('Unable to read role permissions: ' . $db->error);
    }
    $statement->bind_param('s', $key);
    if (!$statement->execute()) {
        $error = $statement->error;
        $statement->close();
        throw new RuntimeException('Unable to read role permissions: ' . $error);
    }
    $row = $statement->get_result()->fetch_assoc();
    $statement->close();
    if (!$row) {
        return $defaults;
    }

    $stored = json_decode((string) $row['setting_value'], true);
    if (!is_array($stored)) {
        throw new RuntimeException('Stored role permissions are invalid.');
    }
    foreach ($defaults as $featureId => $defaultValue) {
        $defaults[$featureId] = $featureId === 'admin.system-settings'
            ? true
            : (array_key_exists($featureId, $stored) ? (bool) $stored[$featureId] : $defaultValue);
    }
    return $defaults;
}

function enforceRoleFeaturePermission(mysqli $db): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    $apiPosition = strpos($script, '/api/');
    if ($apiPosition === false) {
        return;
    }
    $endpoint = substr($script, $apiPosition + 5);
    $endpointPermissions = roleFeatureEndpointMap()[$endpoint] ?? null;
    if (!$endpointPermissions) {
        return;
    }
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (isset($endpointPermissions[$method]) && is_array($endpointPermissions[$method])) {
        $requiredFeatures = $endpointPermissions[$method];
    } elseif (array_keys($endpointPermissions) === range(0, count($endpointPermissions) - 1)) {
        $requiredFeatures = $endpointPermissions;
    } else {
        return;
    }
    if (!$requiredFeatures) {
        return;
    }
    $checked = true;

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $userId = (int) ($_SESSION['user_id'] ?? 0);
    $sessionRole = strtolower(trim((string) ($_SESSION['role'] ?? '')));
    $sessionAdmissionNumber = trim((string) (
        $_SESSION['admission_number']
        ?? ((!ctype_digit((string) ($_SESSION['user_id'] ?? '')))
            ? ($_SESSION['user_id'] ?? '')
            : '')
    ));
    $isKnownStudentAdmission = static function (string $admissionNumber) use ($db): bool {
        if ($admissionNumber === '') {
            return false;
        }
        $studentColumnsResult = $db->query('SHOW COLUMNS FROM student_data');
        if (!$studentColumnsResult) {
            throw new RuntimeException('Unable to verify the student admission record: ' . $db->error);
        }
        $studentColumns = array_column($studentColumnsResult->fetch_all(MYSQLI_ASSOC), 'Field');
        $studentColumnsResult->free();
        $admissionColumn = in_array('admission_number', $studentColumns, true)
            ? 'admission_number'
            : (in_array('id_number', $studentColumns, true) ? 'id_number' : '');
        if ($admissionColumn === '') {
            return false;
        }

        $studentStatement = $db->prepare(
            "SELECT 1 FROM student_data WHERE TRIM(`{$admissionColumn}`) = TRIM(?) LIMIT 1"
        );
        if (!$studentStatement) {
            throw new RuntimeException('Unable to prepare student admission verification: ' . $db->error);
        }
        $studentStatement->bind_param('s', $admissionNumber);
        if (!$studentStatement->execute()) {
            $error = $studentStatement->error;
            $studentStatement->close();
            throw new RuntimeException('Unable to verify the student admission record: ' . $error);
        }
        $isKnownStudent = $studentStatement->get_result()->num_rows > 0;
        $studentStatement->close();
        return $isKnownStudent;
    };
    $role = '';
    if ($sessionRole === 'student' && $userId <= 0 && $isKnownStudentAdmission($sessionAdmissionNumber)) {
        $role = 'student';
    }

    if ($userId <= 0 && $role !== 'student') {
        http_response_code(401);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['success' => false, 'message' => 'Sign in is required to access this feature.']);
        exit;
    }

    if ($userId > 0) {
        $statement = $db->prepare('SELECT role, id_number FROM users WHERE id = ? LIMIT 1');
        if (!$statement) {
            throw new RuntimeException('Unable to validate the current account role: ' . $db->error);
        }
        $statement->bind_param('i', $userId);
        if (!$statement->execute()) {
            $error = $statement->error;
            $statement->close();
            throw new RuntimeException('Unable to validate the current account role: ' . $error);
        }
        $user = $statement->get_result()->fetch_assoc();
        $statement->close();
        $role = strtolower(trim((string) ($user['role'] ?? '')));
        if (
            $sessionRole === 'student'
            && (
                $role !== 'student'
                || ($sessionAdmissionNumber !== ''
                    && strcasecmp(trim((string) ($user['id_number'] ?? '')), $sessionAdmissionNumber) !== 0)
            )
        ) {
            $role = $isKnownStudentAdmission($sessionAdmissionNumber) ? 'student' : '';
        }
    }
    $prefix = in_array($role, ['head', 'hod', 'coordinator', 'department_head', 'department head'], true)
        ? 'head.'
        : ($role . '.');
    $matchedRoleFeature = false;
    foreach ($requiredFeatures as $featureId) {
        if (strpos($featureId, $prefix) !== 0) {
            continue;
        }
        $matchedRoleFeature = true;
        try {
            $permissions = roleFeatureSettings($db);
        } catch (Throwable $error) {
            error_log('Unable to enforce role feature permissions: ' . $error->getMessage());
            http_response_code(500);
            header('Content-Type: application/json; charset=UTF-8');
            echo json_encode(['success' => false, 'message' => 'Unable to verify access permissions.']);
            exit;
        }
        if (($permissions[$featureId] ?? true) === false) {
            http_response_code(403);
            header('Content-Type: application/json; charset=UTF-8');
            echo json_encode(['success' => false, 'message' => 'This feature is currently closed by the Administrator.']);
            exit;
        }
    }
    if (!$matchedRoleFeature) {
        http_response_code(403);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['success' => false, 'message' => 'Your account role cannot access this feature.']);
        exit;
    }
}

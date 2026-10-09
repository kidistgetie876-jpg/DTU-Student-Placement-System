<?php
<<<<<<< HEAD:placement_backend/api/common/system_settings_api.php
require_once __DIR__ . '/../../config/db_config.php';
setCorsHeaders();
=======
header('Access-Control-Allow-Origin: http://localhost:3000');
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:placment_backend/api/common/system_settings_api.php
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

function settingsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function defaultSystemSettings(): array
{
    return [
        'site' => [
            'universityTitle' => 'DEBRE TABOR UNIVERSITY',
            'systemSubtitle' => 'Student Department Placement System',
        ],
        // *** አዲሱ የተጨመረው የ Homepage ክፍል ***
        'homepage' => [
            'academicYear' => '2016 E.C. / 2026 G.C. Placement Cycle',
            'heroBadge' => 'DTU Department Placement System',
            'footerCopyrightText' => 'DTU Placement. All rights reserved.',
            'footerText' => 'Connecting students, departments, and employers through a transparent and efficient placement experience.',
            'heroTitle' => 'Debre Tabor University Student Department Placement System',
            'heroText' => 'A modern and trusted platform for departments, students, and placement offices to manage academic placement services with confidence.',
            'heroPrimaryButton' => 'View Placement Services',
            'heroSecondaryButton' => 'Contact Office',
            'directoryEyebrow' => 'Academic Excellence',
            'directoryTitle' => 'DEBRE TABOR UNIVERSITY - COLLEGES & DEPARTMENTS',
            'directorySubtitle' => 'Debre Tabor University is organized into diverse colleges and schools that serve students through strong academic programs, applied research, and practical professional training across science, technology, health, business, and the humanities.',
            'statsHeading' => 'Why DTU students choose this portal',
            'statsDescription' => 'This platform is designed to support departments in managing placement requests, tracking student progress, and connecting applicants with the right opportunities.',
            'stat1Number' => '120+',
            'stat1Label' => 'Placement records',
            'stat2Number' => '24/7',
            'stat2Label' => 'Support access',
            'stat3Number' => '95%',
            'stat3Label' => 'Readiness rate',
            'feature1Title' => 'Academic Placement',
            'feature1Desc' => 'Support students across faculties with department-based placement coordination.',
            'feature2Title' => 'Career Readiness',
            'feature2Desc' => 'Prepare graduates for internships, employment, and professional growth.',
            'feature3Title' => 'Student Support',
            'feature3Desc' => 'Connect learners with advisors, employers, and university placement offices.',
            'coreServicesTitle' => 'Core Services',
            'coreService1' => 'Department placement tracking',
            'coreService2' => 'Internship and job coordination',
            'coreService3' => 'Student advisory support',
        ],
        'contact' => [
            'location' => 'Registrar Office, Ground Floor, Main Campus, Debre Tabor, Ethiopia',
            'phone1' => '+251 988024266',
            'phone2' => '+251 995015403',
            'supportEmail' => 'tsegayaaderajew021@gmail.com',
            'officeHours' => 'Monday - Friday: 8:30 AM - 5:30 PM (Local Time)',
        ],
        'maintenance' => [
            'enabled' => false,
            'title' => 'System Under Maintenance',
            'message' => 'The DTU Placement Portal is currently undergoing scheduled system updates. Services will resume shortly.',
            'expectedReturn' => 'Soon',
        ],
        'placement' => [
            'submissionStart' => '2026-10-01',
            'submissionDeadline' => '2026-10-11',
<<<<<<< HEAD:placement_backend/api/common/system_settings_api.php
            'processingStart' => '2026-10-12',
            'processingEnd' => '2026-10-20',
            'resultsDate' => '2026-10-21',
            'appealStart' => '2026-10-22',
            'appealEnd' => '2026-10-25',
=======
            'processingStart' => '2026-08-16',
            'processingEnd' => '2026-08-24',
            'resultsDate' => '2026-08-27',
            'appealStart' => '2026-08-27',
            'appealEnd' => '2026-08-30',
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:placment_backend/api/common/system_settings_api.php
            'gpa_weight' => 40,
            'grade_12_weight' => 20,
            'coc_weight' => 30,
            'gender_weight' => 3,
            'disability_weight' => 3,
            'minority_weight' => 4,
        ],
        'navigation' => [
            ['id' => 'home', 'label' => 'Home', 'path' => '/', 'enabled' => true],
            ['id' => 'services', 'label' => 'Services', 'path' => '/services', 'enabled' => true],
            ['id' => 'placement-info', 'label' => 'Placement Info', 'path' => '/placement-info', 'enabled' => true],
            ['id' => 'announcements', 'label' => 'Announcements', 'path' => '/announcements', 'enabled' => true],
            ['id' => 'contact', 'label' => 'Contact', 'path' => '/contact', 'enabled' => true],
        ],
    ];
}

function mergeSystemSettings(array $current, array $incoming): array
{
    // 'homepage' እዚህ ውስጥ ተካቷል
    foreach (['site', 'contact', 'placement', 'homepage'] as $section) {
        if (!isset($incoming[$section]) || !is_array($incoming[$section])) {
            continue;
        }
        if ($section === 'placement') {
            $dateKeys = [
                'submissionStart',
                'submissionDeadline',
                'processingStart',
                'processingEnd',
                'resultsDate',
                'appealStart',
                'appealEnd',
            ];

            foreach ($dateKeys as $key) {
                if (array_key_exists($key, $incoming[$section]) && is_scalar($incoming[$section][$key])) {
                    $current[$section][$key] = trim((string)$incoming[$section][$key]);
                }
            }

            foreach ($incoming[$section] as $key => $value) {
                if (is_string($key) && !in_array($key, $dateKeys, true) && is_scalar($value)) {
                    $current[$section][$key] = trim((string)$value);
                }
            }
            continue;
        }
        foreach ($current[$section] as $key => $defaultValue) {
            if (array_key_exists($key, $incoming[$section]) && is_scalar($incoming[$section][$key])) {
                $current[$section][$key] = trim((string)$incoming[$section][$key]);
            }
        }
    }

    if (isset($incoming['maintenance']) && is_array($incoming['maintenance'])) {
        $maintenance = $incoming['maintenance'];
        if (array_key_exists('enabled', $maintenance)) {
            $current['maintenance']['enabled'] = filter_var($maintenance['enabled'], FILTER_VALIDATE_BOOLEAN);
        }
        foreach (['title', 'message', 'expectedReturn'] as $key) {
            if (array_key_exists($key, $maintenance) && is_scalar($maintenance[$key])) {
                $current['maintenance'][$key] = trim((string) $maintenance[$key]);
            }
        }
    }

    // ዳታው በ 'homepage' ውስጥ ሳይሆን በቀጥታ ከተላከም እንዲቀበል
    if (isset($current['homepage'])) {
        foreach ($current['homepage'] as $key => $defaultValue) {
            if (array_key_exists($key, $incoming) && is_scalar($incoming[$key])) {
                $current['homepage'][$key] = trim((string)$incoming[$key]);
            }
        }
    }

    if (isset($incoming['navigation']) && is_array($incoming['navigation'])) {
        foreach ($current['navigation'] as &$link) {
            foreach ($incoming['navigation'] as $incomingLink) {
                if (!is_array($incomingLink) || ($incomingLink['id'] ?? '') !== $link['id']) {
                    continue;
                }
                if (isset($incomingLink['label']) && is_scalar($incomingLink['label'])) {
                    $link['label'] = trim((string)$incomingLink['label']);
                }
                if (array_key_exists('enabled', $incomingLink)) {
                    $link['enabled'] = filter_var($incomingLink['enabled'], FILTER_VALIDATE_BOOLEAN);
                }
                break;
            }
        }
        unset($link);
    }

    return $current;
}

try {
    $createTable = $db->query(
        "CREATE TABLE IF NOT EXISTS system_settings (
            setting_key VARCHAR(100) PRIMARY KEY,
            setting_value LONGTEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    if (!$createTable) {
        throw new Exception('Unable to prepare system settings storage.');
    }

    $settings = defaultSystemSettings();
    $statement = $db->prepare('SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1');
    if (!$statement) {
        throw new Exception('Unable to read system settings.');
    }
    $key = 'public_portal';
    $statement->bind_param('s', $key);
    $statement->execute();
    $storedRow = $statement->get_result()->fetch_assoc();
    $statement->close();
    if ($storedRow) {
        $storedSettings = json_decode((string)$storedRow['setting_value'], true);
        if (is_array($storedSettings)) {
            $settings = mergeSystemSettings($settings, $storedSettings);
        }
    }

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        settingsResponse(['success' => true, 'settings' => $settings, 'data' => $settings['homepage'] ?? []]);
    }

    if ($method !== 'POST') {
        settingsResponse(['success' => false, 'message' => 'Method not allowed.'], 405);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        settingsResponse(['success' => false, 'message' => 'A JSON settings object is required.'], 400);
    }

    $incoming = isset($input['settings']) && is_array($input['settings']) ? $input['settings'] : $input;

<<<<<<< HEAD:placement_backend/api/common/system_settings_api.php
    if (isset($incoming['placement']) && is_array($incoming['placement'])) {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        $userId = (int) ($_SESSION['user_id'] ?? 0);
        if ($userId <= 0) {
            settingsResponse(['success' => false, 'message' => 'Please sign in before updating the placement schedule.'], 401);
        }
        $roleStatement = $db->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
        if (!$roleStatement) {
            throw new Exception('Unable to validate placement schedule access.');
        }
        $roleStatement->bind_param('i', $userId);
        if (!$roleStatement->execute()) {
            $roleStatement->close();
            throw new Exception('Unable to validate placement schedule access.');
        }
        $userRole = strtolower(trim((string) ($roleStatement->get_result()->fetch_assoc()['role'] ?? '')));
        $roleStatement->close();
        if (!in_array($userRole, ['admin', 'registrar'], true)) {
            settingsResponse(['success' => false, 'message' => 'Only an administrator or registrar can update the placement schedule.'], 403);
        }

        $dateKeys = [
            'submissionStart' => 'Preference Submission Start Date',
            'submissionDeadline' => 'Preference Submission Deadline',
            'processingStart' => 'Placement Processing Start Date',
            'processingEnd' => 'Placement Processing End Date',
            'resultsDate' => 'Results Announcement Date',
            'appealStart' => 'Appeal Window Start Date',
            'appealEnd' => 'Appeal Window End Date',
        ];
        $dates = [];
        foreach ($dateKeys as $key => $label) {
            $value = $incoming['placement'][$key] ?? null;
            if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
                settingsResponse(['success' => false, 'message' => $label . ' must be a valid date.'], 400);
            }
            $date = DateTime::createFromFormat('!Y-m-d', $value);
            $dateErrors = DateTime::getLastErrors();
            if (!$date || ($dateErrors && ($dateErrors['warning_count'] > 0 || $dateErrors['error_count'] > 0)) || $date->format('Y-m-d') !== $value) {
                settingsResponse(['success' => false, 'message' => $label . ' must be a valid date.'], 400);
            }
            $dates[$key] = $value;
        }

        $orderedDates = array_keys($dateKeys);
        for ($index = 1; $index < count($orderedDates); $index++) {
            $previousKey = $orderedDates[$index - 1];
            $key = $orderedDates[$index];
            if ($dates[$key] < $dates[$previousKey]) {
                settingsResponse([
                    'success' => false,
                    'message' => $dateKeys[$key] . ' must be on or after ' . $dateKeys[$previousKey] . '.',
                ], 400);
            }
        }
    }

=======
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:placment_backend/api/common/system_settings_api.php
    if (array_key_exists('maintenance', $incoming)) {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        $adminId = (int) ($_SESSION['user_id'] ?? 0);
        if ($adminId <= 0) {
            settingsResponse(['success' => false, 'message' => 'Administrator login is required to update maintenance mode.'], 401);
        }
        $adminStatement = $db->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
        if (!$adminStatement) {
            throw new Exception('Unable to validate administrator access.');
        }
        $adminStatement->bind_param('i', $adminId);
        $adminStatement->execute();
        $admin = $adminStatement->get_result()->fetch_assoc();
        $adminStatement->close();
        if (strtolower((string) ($admin['role'] ?? '')) !== 'admin') {
            settingsResponse(['success' => false, 'message' => 'Only administrators can update maintenance mode.'], 403);
        }
    }

    $settings = mergeSystemSettings($settings, $incoming);
    $encodedSettings = json_encode($settings, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($encodedSettings === false) {
        throw new Exception('Unable to encode system settings.');
    }

    $save = $db->prepare('INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()');
    if (!$save) {
        throw new Exception('Unable to prepare settings update.');
    }
    $save->bind_param('ss', $key, $encodedSettings);
    if (!$save->execute()) {
        throw new Exception('Unable to save system settings.');
    }
    $save->close();

    settingsResponse([
        'success' => true, 
        'message' => 'Settings saved successfully!', 
        'settings' => $settings, 
        'data' => $settings['homepage'] ?? []
    ]);
} catch (Throwable $error) {
    error_log('System settings API error: ' . $error->getMessage());
    settingsResponse(['success' => false, 'message' => 'Unable to process system settings: ' . $error->getMessage()], 500);
} finally {
    $db->close();
}
?>
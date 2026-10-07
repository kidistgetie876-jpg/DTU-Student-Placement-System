<?php
require_once __DIR__ . '/../../config/db_config.php';
header('Content-Type: application/json; charset=UTF-8');

$db = getDbConnection();

function announcementsResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function readAnnouncementInput(): array
{
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        return [];
    }

    return [
        'title' => trim((string)($input['title'] ?? '')),
        'category' => trim((string)($input['category'] ?? 'Notice')),
        'priority' => trim((string)($input['priority'] ?? 'Normal')),
        'deadline' => trim((string)($input['deadline'] ?? '')),
        'content' => trim((string)($input['content'] ?? $input['message'] ?? '')),
    ];
}

try {
    $createTable = $db->query(
        "CREATE TABLE IF NOT EXISTS placement_announcements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            category VARCHAR(80) NOT NULL DEFAULT 'Notice',
            priority VARCHAR(40) NOT NULL DEFAULT 'Normal',
            deadline DATE NULL,
            content TEXT NOT NULL,
            publisher VARCHAR(255) NOT NULL DEFAULT 'Office of the University Registrar',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_placement_announcements_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    if (!$createTable) {
        throw new Exception('Unable to prepare announcement storage.');
    }
    $publisherColumn = $db->query("SHOW COLUMNS FROM placement_announcements LIKE 'publisher'");
    if (!$publisherColumn || $publisherColumn->num_rows === 0) {
        if (!$db->query("ALTER TABLE placement_announcements ADD COLUMN publisher VARCHAR(255) NOT NULL DEFAULT 'Office of the University Registrar'")) {
            throw new Exception('Unable to add announcement publisher storage.');
        }
    }

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        $statement = $db->prepare('SELECT id, title, category, priority, deadline, content, publisher, created_at, updated_at FROM placement_announcements ORDER BY created_at DESC, id DESC');
        if (!$statement || !$statement->execute()) {
            throw new Exception('Unable to fetch announcements.');
        }
        $result = $statement->get_result();
        $announcements = [];
        while ($row = $result->fetch_assoc()) {
            $announcements[] = $row;
        }
        $statement->close();
        announcementsResponse(['success' => true, 'announcements' => $announcements]);
    }

    if ($method === 'POST' || $method === 'PUT') {
        $data = readAnnouncementInput();
        if ($data['title'] === '' || $data['content'] === '') {
            announcementsResponse(['success' => false, 'message' => 'Title and content are required.'], 400);
        }
        if (strlen($data['title']) > 255 || strlen($data['category']) > 80 || strlen($data['priority']) > 40) {
            announcementsResponse(['success' => false, 'message' => 'Announcement details are too long.'], 400);
        }
        $deadline = $data['deadline'] !== '' ? $data['deadline'] : null;
        if ($deadline !== null) {
            $parsedDeadline = DateTime::createFromFormat('Y-m-d', $deadline);
            if (!$parsedDeadline || $parsedDeadline->format('Y-m-d') !== $deadline) {
                announcementsResponse(['success' => false, 'message' => 'Deadline must be a valid date.'], 400);
            }
        }
        $publisher = 'Office of the University Registrar';

        if ($method === 'POST') {
            $statement = $db->prepare('INSERT INTO placement_announcements (title, category, priority, deadline, content, publisher) VALUES (?, ?, ?, ?, ?, ?)');
            if (!$statement) {
                throw new Exception('Unable to prepare announcement creation.');
            }
            $statement->bind_param('ssssss', $data['title'], $data['category'], $data['priority'], $deadline, $data['content'], $publisher);
            if (!$statement->execute()) {
                throw new Exception('Unable to create announcement.');
            }
            $announcementId = $statement->insert_id;
            $statement->close();
            announcementsResponse(['success' => true, 'message' => 'Announcement published.', 'id' => $announcementId, 'publisher' => $publisher], 201);
        }

        $id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int)$_GET['id'] : (int)($_POST['id'] ?? 0);
        if ($id <= 0) {
            announcementsResponse(['success' => false, 'message' => 'Announcement ID is required.'], 400);
        }
        $statement = $db->prepare('UPDATE placement_announcements SET title = ?, category = ?, priority = ?, deadline = ?, content = ?, publisher = ? WHERE id = ? LIMIT 1');
        if (!$statement) {
            throw new Exception('Unable to prepare announcement update.');
        }
        $statement->bind_param('ssssssi', $data['title'], $data['category'], $data['priority'], $deadline, $data['content'], $publisher, $id);
        if (!$statement->execute()) {
            throw new Exception('Unable to update announcement.');
        }
        $updated = $statement->affected_rows > 0;
        $statement->close();
        if (!$updated) {
            $exists = $db->prepare('SELECT id FROM placement_announcements WHERE id = ? LIMIT 1');
            $exists->bind_param('i', $id);
            $exists->execute();
            $found = $exists->get_result()->num_rows > 0;
            $exists->close();
            if (!$found) {
                announcementsResponse(['success' => false, 'message' => 'Announcement not found.'], 404);
            }
        }
        announcementsResponse(['success' => true, 'message' => 'Announcement updated.']);
    }

    if ($method === 'DELETE') {
        $id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) {
            announcementsResponse(['success' => false, 'message' => 'Announcement ID is required.'], 400);
        }
        $statement = $db->prepare('DELETE FROM placement_announcements WHERE id = ? LIMIT 1');
        if (!$statement) {
            throw new Exception('Unable to prepare announcement deletion.');
        }
        $statement->bind_param('i', $id);
        if (!$statement->execute()) {
            throw new Exception('Unable to delete announcement.');
        }
        $deleted = $statement->affected_rows > 0;
        $statement->close();
        if (!$deleted) {
            announcementsResponse(['success' => false, 'message' => 'Announcement not found.'], 404);
        }
        announcementsResponse(['success' => true, 'message' => 'Announcement deleted.']);
    }

    announcementsResponse(['success' => false, 'message' => 'Method not allowed.'], 405);
} catch (Throwable $error) {
    error_log('Announcements API error: ' . $error->getMessage());
    announcementsResponse(['success' => false, 'message' => 'Unable to process announcements.'], 500);
} finally {
    $db->close();
}
?>
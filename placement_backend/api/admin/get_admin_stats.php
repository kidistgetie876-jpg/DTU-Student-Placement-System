<?php
include __DIR__ . '/../../config/db_config.php';
$db = getDbConnection();

// 1. ጠቅላላ ተማሪዎችን ቁጠር
$res1 = $db->query("SELECT COUNT(*) as count FROM users WHERE role = 'student'");
$students = $res1->fetch_assoc()['count'];

// 2. ጠቅላላ ዲፓርትመንቶችን ቁጠር
$res2 = $db->query("SELECT COUNT(*) as count FROM departments");
$depts = $res2->fetch_assoc()['count'];

// 3. ንቁ አድሚኖችን ቁጠር
$res3 = $db->query("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
$admins = $res3->fetch_assoc()['count'];

echo json_encode([
    "success" => true,
    "stats" => [
        "totalStudents" => $students,
        "totalDepartments" => $depts,
        "activeAdmins" => $admins
    ]
]);
$db->close();
?>
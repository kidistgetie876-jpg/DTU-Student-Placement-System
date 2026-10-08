<?php
// CORS ለመፍቀድ (ከ React ጋር ለመገናኘት በጣም አስፈላጊ ነው)
require_once __DIR__ . '/../../config/db_config.php';
setCorsHeaders();
header("Content-Type: application/json; charset=UTF-8");

// የሙከራ ዳታ
$response = [
    "status" => "success",
    "message" => "Backend connected successfully!",
    "database" => "Pending check"
];

echo json_encode($response);
?>
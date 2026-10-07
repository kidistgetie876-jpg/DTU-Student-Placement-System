<?php
// CORS ለመፍቀድ (ከ React ጋር ለመገናኘት በጣም አስፈላጊ ነው)
header("Access-Control-Allow-Origin: http://localhost:3000");
header("Content-Type: application/json; charset=UTF-8");

// የሙከራ ዳታ
$response = [
    "status" => "success",
    "message" => "Backend connected successfully!",
    "database" => "Pending check"
];

echo json_encode($response);
?>
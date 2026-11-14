<?php
require_once __DIR__ . '/db_config.php';
$pdo = ofbolPdo();
$stmt = $pdo->query("SELECT * FROM tipos_documento");
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));

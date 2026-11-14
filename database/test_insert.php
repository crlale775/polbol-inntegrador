<?php

require_once __DIR__ . '/db_config.php';
$dbConfig = ofbolDatabaseConfig();
$host = $dbConfig['host'];
$port = $dbConfig['port'];
$dbname = $dbConfig['dbname'];
$user = $dbConfig['user'];
$password = $dbConfig['password'];

try {
    $pdo = new PDO("pgsql:host=$host;port=$port;dbname=$dbname", $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    $stmt = $pdo->prepare('INSERT INTO historial_estados (id_documento, estado_anterior, estado_nuevo, usuario, fecha) VALUES (?, ?, ?, ?, ?) RETURNING id_historial');
    $stmt->execute([9, 7, 8, 11, date('Y-m-d H:i:s')]);
    $newId = $stmt->fetchColumn();
    echo "¡INSERT EXITOSO! Nuevo id_historial generado: $newId\n";

} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}

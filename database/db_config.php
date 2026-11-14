<?php

/** Conexión para herramientas CLI: los secretos se leen del .env local. */
function ofbolDatabaseConfig(): array
{
    require_once dirname(__DIR__) . '/vendor/autoload.php';

    $root = dirname(__DIR__);
    if (is_file($root . '/.env')) {
        Dotenv\Dotenv::createImmutable($root)->safeLoad();
    }

    $read = static function (string $key): ?string {
        $value = $_SERVER[$key] ?? $_ENV[$key] ?? getenv($key);
        return is_string($value) && $value !== '' ? $value : null;
    };

    $config = [
        'host' => $read('DB_HOST'),
        'port' => $read('DB_PORT'),
        'dbname' => $read('DB_DATABASE'),
        'user' => $read('DB_USERNAME'),
        'password' => $read('DB_PASSWORD'),
    ];

    $environmentKeys = ['host' => 'DB_HOST', 'port' => 'DB_PORT', 'dbname' => 'DB_DATABASE', 'user' => 'DB_USERNAME', 'password' => 'DB_PASSWORD'];
    foreach ($config as $key => $value) {
        if ($value === null) {
            throw new RuntimeException("Falta configurar {$environmentKeys[$key]} en el entorno local.");
        }
    }

    return $config;
}

function ofbolPdo(): PDO
{
    $config = ofbolDatabaseConfig();

    return new PDO(
        "pgsql:host={$config['host']};port={$config['port']};dbname={$config['dbname']}",
        $config['user'],
        $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
    );
}

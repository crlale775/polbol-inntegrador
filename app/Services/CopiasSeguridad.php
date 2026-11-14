<?php

namespace App\Services;

use PDO;
use RuntimeException;
use Throwable;

/**
 * Copias de seguridad de la información institucional (PostgreSQL).
 *
 * No depende de programas externos (pg_dump): lee y escribe los datos con la
 * misma conexión del sistema. Cada copia es un archivo comprimido con una
 * cabecera (quién, cuándo, cuántos registros por tabla) y los registros de
 * cada tabla en lotes.
 *
 * Recuperar una copia reemplaza TODOS los datos de las tablas incluidas. Se
 * hace dentro de una única transacción: si algo falla, la base de datos queda
 * exactamente como estaba antes de empezar.
 */
class CopiasSeguridad
{
    private const FORMATO = 'ofbol-copia-seguridad';
    private const VERSION = 1;
    private const LOTE = 400;
    private const CANDADO = 20261114;

    /** Tablas internas del framework: no son información institucional. */
    private const EXCLUIDAS = [
        'migrations', 'sessions', 'cache', 'cache_locks', 'jobs', 'job_batches',
        'failed_jobs', 'password_reset_tokens',
    ];

    /**
     * @param array{host?:string, port?:string|int, database?:string, username?:string, password?:string} $conexion
     *        Datos de conexión, solo para generar el archivo .sql con pg_dump.
     */
    public function __construct(private PDO $pdo, private string $carpeta, private array $conexion = [])
    {
    }

    /** Copias disponibles, de la más reciente a la más antigua. */
    public function listar(): array
    {
        $copias = [];
        foreach (glob($this->carpeta . DIRECTORY_SEPARATOR . 'copia-*.jsonl.gz') ?: [] as $archivo) {
            if (! preg_match('/copia-([1-9][0-9]{0,9})\.jsonl\.gz$/D', $archivo, $partes)) {
                continue;
            }
            try {
                $cabecera = $this->leerCabecera($archivo);
            } catch (Throwable) {
                continue; // archivo ajeno o dañado: no se ofrece para recuperar
            }
            $copias[] = $this->resumen((int) $partes[1], $archivo, $cabecera);
        }
        usort($copias, fn (array $a, array $b) => $b['id'] <=> $a['id']);

        return $copias;
    }

    /** Ruta del archivo de una copia, o null si no existe. */
    public function ruta(int $id): ?string
    {
        $archivo = $this->carpeta . DIRECTORY_SEPARATOR . 'copia-' . $id . '.jsonl.gz';

        return $id > 0 && is_file($archivo) ? $archivo : null;
    }

    public function eliminar(int $id): bool
    {
        $archivo = $this->ruta($id);
        if ($archivo === null || ! @unlink($archivo)) {
            return false;
        }
        @unlink($this->archivoSql($id));

        return true;
    }

    /**
     * Archivo .sql de la copia, para abrirlo con pgAdmin o psql.
     *
     * Si pg_dump estuvo disponible al guardar, es un respaldo completo (estructura
     * y datos). Si no, se genera aquí a partir de la copia con solo los datos.
     */
    public function rutaSql(int $id): ?string
    {
        $archivo = $this->ruta($id);
        if ($archivo === null) {
            return null;
        }
        $sql = $this->archivoSql($id);
        if (! is_file($sql) || filesize($sql) === 0) {
            $this->sqlDesdeCopia($archivo, $sql);
        }

        return $sql;
    }

    /** Guarda una copia con el estado actual de los datos. */
    public function crear(string $autor, string $nota = '', string $origen = 'manual'): array
    {
        if (! is_dir($this->carpeta) && ! @mkdir($this->carpeta, 0775, true) && ! is_dir($this->carpeta)) {
            throw new RuntimeException('No se pudo preparar la carpeta donde se guardan las copias.');
        }

        $id = time();
        while (is_file($this->carpeta . DIRECTORY_SEPARATOR . 'copia-' . $id . '.jsonl.gz')) {
            $id++;
        }
        $destino = $this->carpeta . DIRECTORY_SEPARATOR . 'copia-' . $id . '.jsonl.gz';
        $parcial = $destino . '.parcial';

        $salida = @gzopen($parcial, 'wb6');
        if ($salida === false) {
            throw new RuntimeException('No se pudo crear el archivo de la copia. Revise el espacio disponible en el disco.');
        }

        // Una sola foto coherente de todos los datos, aunque otras personas sigan trabajando.
        $this->pdo->beginTransaction();
        try {
            $this->pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
            $tablas = $this->ordenarPorDependencia($this->tablas());
            $columnas = [];
            $conteos = [];
            foreach ($tablas as $tabla) {
                $columnas[$tabla] = $this->columnas($tabla);
                $conteos[$tabla] = (int) $this->pdo->query('SELECT COUNT(*) FROM ' . $this->id($tabla))->fetchColumn();
            }

            $cabecera = [
                'formato' => self::FORMATO,
                'version' => self::VERSION,
                'creada' => date('c'),
                'autor' => $autor,
                'nota' => $nota,
                'origen' => $origen,
                'base' => (string) $this->pdo->query('SELECT current_database()')->fetchColumn(),
                'tablas' => $conteos,
                'columnas' => $columnas,
            ];
            $this->escribir($salida, json_encode($cabecera, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n");

            foreach ($tablas as $tabla) {
                if ($conteos[$tabla] === 0) {
                    continue;
                }
                $this->pdo->exec('DECLARE copia_cursor NO SCROLL CURSOR FOR SELECT row_to_json(t)::text FROM ' . $this->id($tabla) . ' t');
                do {
                    $filas = $this->pdo->query('FETCH ' . self::LOTE . ' FROM copia_cursor')->fetchAll(PDO::FETCH_COLUMN);
                    if ($filas) {
                        $this->escribir($salida, $tabla . "\t[" . implode(',', $filas) . "]\n");
                    }
                } while (count($filas) === self::LOTE);
                $this->pdo->exec('CLOSE copia_cursor');
            }
            $this->pdo->commit();
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            @gzclose($salida);
            @unlink($parcial);
            throw $error;
        }

        if (! gzclose($salida) || ! @rename($parcial, $destino)) {
            @unlink($parcial);
            throw new RuntimeException('No se pudo terminar de guardar la copia. Revise el espacio disponible en el disco.');
        }

        // Respaldo .sql como el de pgAdmin. Si pg_dump no está, el .sql se arma al descargar.
        $this->volcarConPgDump($this->archivoSql($id));

        return $this->resumen($id, $destino, $cabecera);
    }

    /**
     * Reemplaza los datos actuales por los de la copia indicada.
     *
     * @return array{tablas:int, registros:int}
     */
    public function recuperar(int $id): array
    {
        $archivo = $this->ruta($id);
        if ($archivo === null) {
            throw new RuntimeException('La copia seleccionada ya no existe.');
        }
        $cabecera = $this->leerCabecera($archivo);
        $esperado = $cabecera['tablas'];

        // Antes de tocar nada: la copia debe corresponder a la estructura actual.
        $actuales = $this->tablas();
        $enCopia = array_keys($esperado);
        if (array_diff($actuales, $enCopia) || array_diff($enCopia, $actuales)) {
            throw new RuntimeException('Esta copia se guardó con una versión distinta del sistema y no se puede recuperar de forma automática. Sus datos actuales no se modificaron.');
        }
        foreach ($actuales as $tabla) {
            $guardadas = $cabecera['columnas'][$tabla] ?? [];
            $hoy = $this->columnas($tabla);
            if (array_diff($guardadas, $hoy) || array_diff($hoy, $guardadas)) {
                throw new RuntimeException('Esta copia se guardó con una versión distinta del sistema (cambió la tabla "' . $tabla . '") y no se puede recuperar de forma automática. Sus datos actuales no se modificaron.');
            }
        }

        $entrada = @gzopen($archivo, 'rb');
        if ($entrada === false) {
            throw new RuntimeException('No se pudo abrir el archivo de la copia.');
        }

        $this->pdo->beginTransaction();
        try {
            if (! $this->pdo->query('SELECT pg_try_advisory_xact_lock(' . self::CANDADO . ')')->fetchColumn()) {
                throw new RuntimeException('Ya hay una recuperación en curso. Espere a que termine.');
            }

            // Con permisos de administrador de la base se omite la comprobación de
            // relaciones mientras se cargan los datos; si no, se respeta el orden guardado.
            $this->pdo->exec('SAVEPOINT copia_permisos');
            try {
                $this->pdo->exec("SET LOCAL session_replication_role = 'replica'");
                $this->pdo->exec('RELEASE SAVEPOINT copia_permisos');
            } catch (Throwable) {
                $this->pdo->exec('ROLLBACK TO SAVEPOINT copia_permisos');
            }

            $this->pdo->exec('TRUNCATE TABLE ' . implode(', ', array_map(fn (string $t) => $this->id($t), $actuales)) . ' RESTART IDENTITY CASCADE');

            gzgets($entrada); // cabecera, ya leída
            $sentencias = [];
            while (($linea = gzgets($entrada)) !== false) {
                $linea = rtrim($linea, "\r\n");
                if ($linea === '') {
                    continue;
                }
                $partes = explode("\t", $linea, 2);
                if (count($partes) !== 2 || ! isset($esperado[$partes[0]])) {
                    throw new RuntimeException('El archivo de la copia está dañado. Sus datos actuales no se modificaron.');
                }
                [$tabla, $filas] = $partes;
                if (! isset($sentencias[$tabla])) {
                    $lista = implode(', ', array_map(fn (string $c) => $this->id($c), $cabecera['columnas'][$tabla]));
                    $sentencias[$tabla] = $this->pdo->prepare(
                        'INSERT INTO ' . $this->id($tabla) . ' (' . $lista . ') OVERRIDING SYSTEM VALUE SELECT ' . $lista
                        . ' FROM json_populate_recordset(NULL::' . $this->id($tabla) . ', ?::json)'
                    );
                }
                $sentencias[$tabla]->execute([$filas]);
            }
            if (! gzeof($entrada)) {
                throw new RuntimeException('El archivo de la copia está incompleto. Sus datos actuales no se modificaron.');
            }

            // La copia solo se da por buena si cada tabla quedó con los registros que declara.
            $registros = 0;
            foreach ($esperado as $tabla => $cantidad) {
                $cargados = (int) $this->pdo->query('SELECT COUNT(*) FROM ' . $this->id($tabla))->fetchColumn();
                if ($cargados !== (int) $cantidad) {
                    throw new RuntimeException('La copia no se pudo cargar completa (tabla "' . $tabla . '"). Sus datos actuales no se modificaron.');
                }
                $registros += $cargados;
            }

            $this->ajustarContadores($actuales);
            $this->pdo->commit();
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        } finally {
            @gzclose($entrada);
        }

        return ['tablas' => count($actuales), 'registros' => $registros];
    }

    private function archivoSql(int $id): string
    {
        return $this->carpeta . DIRECTORY_SEPARATOR . 'copia-' . $id . '.sql';
    }

    /** Respaldo completo en SQL plano con pg_dump, el mismo programa que usa pgAdmin. */
    private function volcarConPgDump(string $destino): bool
    {
        if (! function_exists('proc_open') || empty($this->conexion['database'])) {
            return false;
        }
        $parcial = $destino . '.parcial';
        foreach ($this->candidatosPgDump() as $programa) {
            $orden = [
                $programa, '--format=plain', '--encoding=UTF8', '--no-owner', '--no-privileges',
                '--clean', '--if-exists', '--inserts',
                '--host=' . ($this->conexion['host'] ?? '127.0.0.1'),
                '--port=' . ($this->conexion['port'] ?? 5432),
                '--username=' . ($this->conexion['username'] ?? 'postgres'),
                '--dbname=' . $this->conexion['database'],
                '--file=' . $parcial,
            ];
            foreach (self::EXCLUIDAS as $tabla) {
                $orden[] = '--exclude-table=' . $tabla;
            }
            $entorno = array_merge(getenv(), ['PGPASSWORD' => (string) ($this->conexion['password'] ?? ''), 'PGCONNECT_TIMEOUT' => '10']);
            try {
                $proceso = @proc_open($orden, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubos, null, $entorno);
                if (! is_resource($proceso)) {
                    continue;
                }
                fclose($tubos[0]);
                stream_get_contents($tubos[1]);
                stream_get_contents($tubos[2]);
                fclose($tubos[1]);
                fclose($tubos[2]);
                $salida = proc_close($proceso);
            } catch (Throwable) {
                $salida = 1;
            }
            if ($salida === 0 && is_file($parcial) && filesize($parcial) > 0 && @rename($parcial, $destino)) {
                return true;
            }
            @unlink($parcial);
        }

        return false;
    }

    /** Dónde suele estar pg_dump: instalación de PostgreSQL, Laragon o el PATH del sistema. */
    private function candidatosPgDump(): array
    {
        $carpetas = array_filter([getenv('ProgramFiles') ?: null, getenv('ProgramFiles(x86)') ?: null, 'C:\\Program Files']);
        $patrones = ['C:\\laragon\\bin\\postgresql\\*\\bin\\pg_dump.exe', '/usr/lib/postgresql/*/bin/pg_dump', '/usr/local/bin/pg_dump', '/usr/bin/pg_dump'];
        foreach (array_unique($carpetas) as $carpeta) {
            $patrones[] = $carpeta . '\\PostgreSQL\\*\\bin\\pg_dump.exe';
        }
        $encontrados = [];
        foreach ($patrones as $patron) {
            foreach (glob($patron) ?: [] as $ruta) {
                $encontrados[] = $ruta;
            }
        }
        rsort($encontrados, SORT_NATURAL); // primero la versión más nueva
        $propio = getenv('PG_DUMP_PATH');

        return array_values(array_unique(array_merge($propio ? [$propio] : [], $encontrados, ['pg_dump'])));
    }

    /**
     * Arma un .sql con los datos de la copia (sin crear tablas), ejecutable en la
     * Herramienta de consultas de pgAdmin o con psql sobre una base que ya tenga la estructura.
     */
    private function sqlDesdeCopia(string $archivo, string $destino): void
    {
        $cabecera = $this->leerCabecera($archivo);
        $entrada = @gzopen($archivo, 'rb');
        $salida = @fopen($destino . '.parcial', 'wb');
        if ($entrada === false || $salida === false) {
            throw new RuntimeException('No se pudo preparar el archivo SQL de la copia.');
        }
        $tablas = array_keys($cabecera['tablas']);
        $nombres = implode(', ', array_map(fn (string $t) => $this->id($t), $tablas));
        $literal = fn (string $texto) => "'" . str_replace("'", "''", $texto) . "'";

        fwrite($salida, "-- Copia de seguridad de la base de datos \"" . ($cabecera['base'] ?? '') . "\" · Policía Boliviana\n"
            . '-- Guardada el ' . ($cabecera['creada'] ?? '') . ' por ' . ($cabecera['autor'] ?? '') . "\n"
            . "-- Contiene los DATOS de todas las tablas; la estructura (tablas) ya debe existir.\n"
            . "-- Al ejecutarlo se reemplaza el contenido actual de esas tablas.\n\n"
            . "SET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\n\nBEGIN;\n\n"
            . 'TRUNCATE TABLE ' . $nombres . " RESTART IDENTITY CASCADE;\n\n");

        gzgets($entrada);
        while (($linea = gzgets($entrada)) !== false) {
            $partes = explode("\t", rtrim($linea, "\r\n"), 2);
            if (count($partes) !== 2 || ! isset($cabecera['columnas'][$partes[0]])) {
                continue;
            }
            $lista = implode(', ', array_map(fn (string $c) => $this->id($c), $cabecera['columnas'][$partes[0]]));
            fwrite($salida, 'INSERT INTO ' . $this->id($partes[0]) . ' (' . $lista . ') OVERRIDING SYSTEM VALUE SELECT ' . $lista
                . ' FROM json_populate_recordset(NULL::' . $this->id($partes[0]) . ', ' . $literal($partes[1]) . "::json);\n");
        }
        gzclose($entrada);

        // Numeradores automáticos a continuación del mayor valor cargado.
        fwrite($salida, "\nDO \$copia\$\nDECLARE r record; maximo bigint;\nBEGIN\n"
            . "  FOR r IN SELECT c.table_name AS tabla, c.column_name AS columna,\n"
            . "                  pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) AS secuencia\n"
            . "           FROM information_schema.columns c\n"
            . "           WHERE c.table_schema = current_schema() AND c.table_name IN ("
            . implode(', ', array_map($literal, $tablas)) . ")\n  LOOP\n"
            . "    IF r.secuencia IS NOT NULL THEN\n"
            . "      EXECUTE format('SELECT MAX(%I) FROM %I', r.columna, r.tabla) INTO maximo;\n"
            . "      PERFORM setval(r.secuencia::regclass, COALESCE(maximo, 1), maximo IS NOT NULL);\n"
            . "    END IF;\n  END LOOP;\nEND\n\$copia\$;\n\nCOMMIT;\n");

        if (! fclose($salida) || ! @rename($destino . '.parcial', $destino)) {
            @unlink($destino . '.parcial');
            throw new RuntimeException('No se pudo preparar el archivo SQL de la copia.');
        }
    }

    /** Tablas con información institucional, en orden alfabético. */
    private function tablas(): array
    {
        $todas = $this->pdo->query(
            'SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename'
        )->fetchAll(PDO::FETCH_COLUMN);

        return array_values(array_diff($todas, self::EXCLUIDAS));
    }

    /** Columnas que se pueden escribir (las calculadas por la base no se copian). */
    private function columnas(string $tabla): array
    {
        $consulta = $this->pdo->prepare(
            "SELECT column_name FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = ? AND is_generated = 'NEVER'
             ORDER BY ordinal_position"
        );
        $consulta->execute([$tabla]);

        return $consulta->fetchAll(PDO::FETCH_COLUMN);
    }

    /** Primero las tablas de las que dependen otras, para respetar las relaciones al recuperar. */
    private function ordenarPorDependencia(array $tablas): array
    {
        $relaciones = $this->pdo->query(
            "SELECT DISTINCT hija.relname AS hija, madre.relname AS madre
             FROM pg_constraint c
             JOIN pg_class hija ON hija.oid = c.conrelid
             JOIN pg_class madre ON madre.oid = c.confrelid
             JOIN pg_namespace n ON n.oid = hija.relnamespace
             WHERE c.contype = 'f' AND n.nspname = current_schema() AND hija.oid <> madre.oid"
        )->fetchAll(PDO::FETCH_ASSOC);

        $pendientes = array_fill_keys($tablas, []);
        foreach ($relaciones as $relacion) {
            if (isset($pendientes[$relacion['hija']], $pendientes[$relacion['madre']])) {
                $pendientes[$relacion['hija']][$relacion['madre']] = true;
            }
        }

        $orden = [];
        while ($pendientes) {
            $libres = array_keys(array_filter($pendientes, fn (array $madres) => $madres === []));
            if (! $libres) {
                // Relaciones circulares: el resto va al final, en orden alfabético.
                $libres = array_keys($pendientes);
            }
            foreach ($libres as $tabla) {
                $orden[] = $tabla;
                unset($pendientes[$tabla]);
            }
            foreach ($pendientes as $tabla => $madres) {
                $pendientes[$tabla] = array_diff_key($madres, array_flip($libres));
            }
        }

        return $orden;
    }

    /** Deja cada numerador automático a continuación del mayor valor recuperado. */
    private function ajustarContadores(array $tablas): void
    {
        $secuencia = $this->pdo->prepare('SELECT pg_get_serial_sequence(?, ?)');
        foreach ($tablas as $tabla) {
            foreach ($this->columnas($tabla) as $columna) {
                $secuencia->execute([$this->id($tabla), $columna]);
                $nombre = $secuencia->fetchColumn();
                if (! $nombre) {
                    continue;
                }
                $maximo = $this->pdo->query('SELECT MAX(' . $this->id($columna) . ') FROM ' . $this->id($tabla))->fetchColumn();
                $ajuste = $this->pdo->prepare('SELECT setval(?::regclass, ?, ?)');
                $ajuste->bindValue(1, $nombre);
                $ajuste->bindValue(2, $maximo === null ? 1 : (int) $maximo, PDO::PARAM_INT);
                $ajuste->bindValue(3, $maximo !== null, PDO::PARAM_BOOL);
                $ajuste->execute();
            }
        }
    }

    private function leerCabecera(string $archivo): array
    {
        $entrada = @gzopen($archivo, 'rb');
        if ($entrada === false) {
            throw new RuntimeException('No se pudo abrir el archivo de la copia.');
        }
        $linea = gzgets($entrada);
        gzclose($entrada);

        $cabecera = is_string($linea) ? json_decode($linea, true) : null;
        if (! is_array($cabecera) || ($cabecera['formato'] ?? null) !== self::FORMATO
            || ($cabecera['version'] ?? null) !== self::VERSION
            || ! is_array($cabecera['tablas'] ?? null) || ! is_array($cabecera['columnas'] ?? null)) {
            throw new RuntimeException('El archivo no es una copia de seguridad válida de este sistema.');
        }

        return $cabecera;
    }

    private function resumen(int $id, string $archivo, array $cabecera): array
    {
        return [
            'id' => $id,
            'creada' => (string) ($cabecera['creada'] ?? date('c', $id)),
            'autor' => (string) ($cabecera['autor'] ?? ''),
            'nota' => (string) ($cabecera['nota'] ?? ''),
            'origen' => (string) ($cabecera['origen'] ?? 'manual'),
            'tablas' => count($cabecera['tablas']),
            'registros' => array_sum(array_map('intval', $cabecera['tablas'])),
            'tamano' => (int) @filesize($archivo),
            'sql_completo' => $this->esVolcadoCompleto($this->archivoSql($id)),
        ];
    }

    /** true si el .sql guardado es un respaldo completo de pg_dump (estructura y datos). */
    private function esVolcadoCompleto(string $sql): bool
    {
        return is_file($sql) && str_contains((string) @file_get_contents($sql, false, null, 0, 400), 'PostgreSQL database dump');
    }

    /** @param resource $salida */
    private function escribir($salida, string $texto): void
    {
        if (gzwrite($salida, $texto) !== strlen($texto)) {
            throw new RuntimeException('No se pudo escribir la copia. Revise el espacio disponible en el disco.');
        }
    }

    /** Nombre de tabla o columna entre comillas, tal como lo espera PostgreSQL. */
    private function id(string $nombre): string
    {
        return '"' . str_replace('"', '""', $nombre) . '"';
    }
}

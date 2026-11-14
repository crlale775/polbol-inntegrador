<?php

declare(strict_types=1);

/**
 * OFBOL — Carga masiva de datos de demostración sobre PostgreSQL.
 *
 * Reglas de seguridad:
 *  - SOLO INSERTA filas. No crea, altera ni elimina tablas, columnas, índices
 *    o restricciones; tampoco borra ni actualiza registros existentes.
 *  - Es idempotente: completa cada tabla operativa hasta el objetivo
 *    (1200 filas por defecto) y no inserta nada si ya se alcanzó.
 *  - Los nombres y apellidos de oficiales, usuarios y solicitantes se derivan
 *    del dataset LFW (scripts/data/lfw_identities.txt).
 *  - No toca catálogos del sistema (roles, grados, cargos, tipos, estados,
 *    EPIs, normas/reglas): son datos maestros con significado funcional.
 *
 * Uso:  php scripts/seed_datos_masivos.php
 */

require_once dirname(__DIR__) . '/database/db_config.php';

$pdo = ofbolPdo();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec("SET client_encoding TO 'UTF8'");

$objetivo = max(1000, (int) (getenv('OBJETIVO_FILAS') ?: 1200));
mt_srand(20261110);

function contar(PDO $pdo, string $tabla): int
{
    return (int) $pdo->query('SELECT count(*) FROM "' . $tabla . '"')->fetchColumn();
}

function insertar(PDO $pdo, string $tabla, array $datos): void
{
    static $cache = [];
    $columnas = array_keys($datos);
    $llave = $tabla . '|' . implode(',', $columnas);
    if (!isset($cache[$llave])) {
        $cache[$llave] = $pdo->prepare(
            'INSERT INTO "' . $tabla . '" (' . implode(', ', $columnas) . ') VALUES (:' . implode(', :', $columnas) . ')'
        );
    }
    $cache[$llave]->execute($datos);
}

function fechaAleatoria(string $desde, string $hasta, int $minutos = 0): string
{
    return date('Y-m-d H:i:s', mt_rand(strtotime($desde), strtotime($hasta)) + ($minutos * 60));
}

function slug(string $texto): string
{
    $texto = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $texto) ?: $texto;
    $texto = strtolower(preg_replace('/[^A-Za-z0-9]+/', '', $texto) ?? '');

    return $texto !== '' ? $texto : 'oficial';
}

$archivoNombres = __DIR__ . '/data/lfw_identities.txt';
if (!is_file($archivoNombres)) {
    throw new RuntimeException('No se encontró scripts/data/lfw_identities.txt con las identidades LFW.');
}

$personas = [];
foreach (file($archivoNombres, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $linea) {
    $partes = explode('_', trim($linea));
    $nombres = trim((string) array_shift($partes));
    $apellidos = trim(implode(' ', $partes));
    if ($nombres === '') {
        continue;
    }
    if ($apellidos === '') {
        $apellidos = 'Choque';
    }
    $personas[] = [$nombres, $apellidos];
}
if (count($personas) < 1000) {
    throw new RuntimeException('El listado LFW no contiene identidades suficientes.');
}
shuffle($personas);

echo "=====================================================\n";
echo " OFBOL — carga masiva de datos (objetivo: {$objetivo} filas/tabla)\n";
echo " Solo INSERT · sin cambios de esquema · sin borrados\n";
echo "=====================================================\n";

$pdo->beginTransaction();

try {
    // ---------------------------------------------------------------
    // 1. OFICIALES (nombres del dataset LFW)
    // ---------------------------------------------------------------
    $grados = array_map('intval', $pdo->query('SELECT id_grado FROM grados ORDER BY id_grado')->fetchAll(PDO::FETCH_COLUMN));
    $cargos = array_map('intval', $pdo->query('SELECT id_cargo FROM cargos ORDER BY id_cargo')->fetchAll(PDO::FETCH_COLUMN));
    $epis = array_map('intval', $pdo->query('SELECT id_epi FROM epis ORDER BY id_epi')->fetchAll(PDO::FETCH_COLUMN));

    $totalOficiales = contar($pdo, 'oficiales');
    $faltanOficiales = max(0, $objetivo - $totalOficiales);
    echo "\n[1/14] Oficiales: {$totalOficiales} existentes, se insertan {$faltanOficiales}...\n";

    $ciUsados = array_flip($pdo->query('SELECT ci FROM oficiales')->fetchAll(PDO::FETCH_COLUMN));
    $escUsados = array_flip($pdo->query('SELECT escalafon FROM oficiales')->fetchAll(PDO::FETCH_COLUMN));
    $prefijosEpi = [1 => 'LPZ', 2 => 'SUR', 3 => 'FER', 4 => 'MUN', 5 => 'COT', 6 => 'CHI', 7 => 'CEN', 8 => 'BOS', 9 => 'MER'];

    for ($i = 0; $i < $faltanOficiales; $i++) {
        [$nombres, $apellidos] = $personas[$i % count($personas)];

        do {
            $ci = mt_rand(1000000, 4999999) . '-' . ['LP', 'CB', 'SC', 'OR', 'PT'][mt_rand(0, 4)];
        } while (isset($ciUsados[$ci]));
        $ciUsados[$ci] = true;

        $numero = $totalOficiales + $i + 1;
        do {
            $escalafon = 'ESC-LFW-' . str_pad((string) ($numero * 7 + 11000), 6, '0', STR_PAD_LEFT);
            $numero += 100000;
        } while (isset($escUsados[$escalafon]));
        $escUsados[$escalafon] = true;

        $epi = $epis[$i % count($epis)];

        insertar($pdo, 'oficiales', [
            'id_grado' => $grados[mt_rand(0, count($grados) - 1)],
            'id_epi' => $epi,
            'id_cargo' => $cargos[mt_rand(0, count($cargos) - 1)],
            'escalafon' => $escalafon,
            'ci' => $ci,
            'nombres' => $nombres,
            'apellidos' => $apellidos,
            'estado' => mt_rand(1, 100) <= 88 ? 'true' : 'false',
            'numero_item' => 'IT-' . (900000 + $totalOficiales + $i + 1),
            'codigo_institucional' => 'POL-' . ($prefijosEpi[$epi] ?? 'LPZ') . '-' . (1000 + $totalOficiales + $i + 1),
            'foto' => null,
        ]);
    }

    // ---------------------------------------------------------------
    // 2. USUARIOS (cuentas oficiales sobre los 3 roles existentes)
    // ---------------------------------------------------------------
    $totalUsuarios = contar($pdo, 'usuarios');
    $faltanUsuarios = max(0, $objetivo - $totalUsuarios);
    echo "[2/14] Usuarios: {$totalUsuarios} existentes, se insertan {$faltanUsuarios}...\n";

    $hashDemo = password_hash('Ofbol2026*Demo', PASSWORD_BCRYPT);
    $usuarioUsado = array_flip($pdo->query('SELECT usuario FROM usuarios')->fetchAll(PDO::FETCH_COLUMN));
    $correoUsado = array_flip($pdo->query('SELECT correo FROM usuarios')->fetchAll(PDO::FETCH_COLUMN));

    for ($i = 0; $i < $faltanUsuarios; $i++) {
        [$nombres, $apellidos] = $personas[($i + 4000) % count($personas)];

        $rol = 1;
        if ($i % 12 === 0) {
            $rol = 3;
        } elseif ($i % 6 === 0) {
            $rol = 2;
        }
        $epi = $rol === 1 ? $epis[$i % count($epis)] : null;

        $base = 'usr_' . slug($nombres . ' ' . $apellidos);
        $usuario = $base . '_' . ($i + 1);
        while (isset($usuarioUsado[$usuario]) || strlen($usuario) > 50) {
            $usuario = $base . '_' . ($i + 1) . mt_rand(100, 999);
        }
        $usuarioUsado[$usuario] = true;

        $correo = $usuario . '@ofbol.demo';
        while (isset($correoUsado[$correo])) {
            $correo = $usuario . mt_rand(10, 99) . '@ofbol.demo';
        }
        $correoUsado[$correo] = true;

        insertar($pdo, 'usuarios', [
            'id_rol' => $rol,
            'usuario' => $usuario,
            'password' => $hashDemo,
            'correo' => $correo,
            'estado' => mt_rand(1, 100) <= 92 ? 'true' : 'false',
            'created_at' => fechaAleatoria('2025-01-10 08:00:00', '2026-11-09 20:00:00'),
            'id_epi' => $epi,
            'foto' => null,
        ]);
    }

    // ---------------------------------------------------------------
    // 3. DOCUMENTOS + 4. VERSIONES
    // ---------------------------------------------------------------
    $ofPorEpi = [];
    foreach ($pdo->query('SELECT id_oficial, id_epi FROM oficiales') as $fila) {
        $ofPorEpi[(int) $fila['id_epi']][] = (int) $fila['id_oficial'];
    }
    $secPorEpi = [];
    foreach ($pdo->query('SELECT id_usuario, id_epi FROM usuarios WHERE id_rol = 1 AND id_epi IS NOT NULL') as $fila) {
        $secPorEpi[(int) $fila['id_epi']][] = (int) $fila['id_usuario'];
    }
    $revisores = array_map('intval', $pdo->query('SELECT id_usuario FROM usuarios WHERE id_rol = 2 ORDER BY id_usuario')->fetchAll(PDO::FETCH_COLUMN));
    $generales = array_map('intval', $pdo->query('SELECT id_usuario FROM usuarios WHERE id_rol = 3 ORDER BY id_usuario')->fetchAll(PDO::FETCH_COLUMN));
    $todosUsuarios = array_map('intval', $pdo->query('SELECT id_usuario FROM usuarios')->fetchAll(PDO::FETCH_COLUMN));

    if ($revisores === []) {
        $revisores = $todosUsuarios;
    }
    if ($generales === []) {
        $generales = $todosUsuarios;
    }
    foreach ($epis as $epi) {
        if (empty($secPorEpi[$epi])) {
            $secPorEpi[$epi] = $todosUsuarios;
        }
        if (empty($ofPorEpi[$epi])) {
            throw new RuntimeException("No hay oficiales para la EPI {$epi}.");
        }
    }

    $totalDocs = contar($pdo, 'documentos');
    $faltanDocs = max(0, $objetivo - $totalDocs);
    echo "[3/14] Documentos: {$totalDocs} existentes, se insertan {$faltanDocs}...\n";

    $nombresEpi = $pdo->query('SELECT id_epi, nombre FROM epis')->fetchAll(PDO::FETCH_KEY_PAIR);
    $codigosUsados = array_flip($pdo->query('SELECT codigo_documento FROM documentos')->fetchAll(PDO::FETCH_COLUMN));

    $prefijosTipo = [1 => 'MEM-DISC', 2 => 'MEM-FEL', 3 => 'PERM', 4 => 'VAC', 5 => 'DESIG', 6 => 'OTR'];
    $tiposPool = [1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6];
    $estadosPool = [1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 6, 7, 7, 8, 8, 8];
    $referencias = [
        1 => 'Llamada de atención por incumplimiento del servicio y la disciplina institucional',
        2 => 'Felicitación por destacada actuación en operativo de seguridad ciudadana',
        3 => 'Permiso especial por motivos justificados y necesidad del servicio',
        4 => 'Solicitud de vacación anual reglamentaria del periodo correspondiente',
        5 => 'Designación de funciones y destino en unidad operativa',
        6 => 'Trámite administrativo interno de la unidad policial',
    ];
    $tiposLibres = [
        'Constancia de servicios prestados',
        'Certificado de habilitación para portar arma',
        'Informe circunstanciado de patrullaje',
        'Solicitud de traslado departamental',
        'Reconocimiento por años de servicio',
    ];
    $observacionesDoc = [
        1 => 'Falta la rúbrica y el sello institucional de la autoridad en el documento escaneado.',
        2 => 'La fecha consignada no coincide con la del libro de altas de la unidad.',
        3 => 'El correlativo del memorándum presenta duplicidad con otro trámite.',
        4 => 'El PDF adjunto tiene baja resolución y no permite lectura fehaciente.',
        5 => 'Falta el informe circunstanciado de respaldo del trámite.',
        6 => 'Discrepancia en los datos filiatorios del oficial destinatario.',
    ];

    $documentosNuevos = [];
    $contadorCodigo = 3000;

    for ($i = 0; $i < $faltanDocs; $i++) {
        $epi = $epis[$i % count($epis)];
        $oficial = $ofPorEpi[$epi][mt_rand(0, count($ofPorEpi[$epi]) - 1)];
        $secretario = $secPorEpi[$epi][mt_rand(0, count($secPorEpi[$epi]) - 1)];
        $tipo = $tiposPool[mt_rand(0, count($tiposPool) - 1)];
        $estado = $estadosPool[mt_rand(0, count($estadosPool) - 1)];
        $fecha = fechaAleatoria('2025-01-05 08:00:00', '2026-11-09 18:00:00');

        do {
            $codigo = $prefijosTipo[$tipo] . '-EPI' . $epi . '-' . date('Y', strtotime($fecha)) . '-' . str_pad((string) $contadorCodigo++, 4, '0', STR_PAD_LEFT);
        } while (isset($codigosUsados[$codigo]));
        $codigosUsados[$codigo] = true;

        $oficialNombre = $pdo->query('SELECT nombres || \' \' || apellidos FROM oficiales WHERE id_oficial = ' . $oficial)->fetchColumn();
        $referencia = $referencias[$tipo] . ' — ' . $oficialNombre;
        $tipoLibre = $tipo === 6 ? $tiposLibres[mt_rand(0, count($tiposLibres) - 1)] : null;

        $revisionPrevia = null;
        if ($estado >= 3 && mt_rand(1, 100) <= 35) {
            $revisionPrevia = json_encode([
                'observaciones' => [[
                    'tipo' => $observacionesDoc[mt_rand(1, 6)],
                    'detalle' => 'Detectado por el verificador automático antes de la remisión.',
                ]],
                'verificado_en' => $fecha,
            ], JSON_UNESCAPED_UNICODE);
        }

        insertar($pdo, 'documentos', [
            'id_tipo' => $tipo,
            'id_oficial' => $oficial,
            'id_usuario' => $secretario,
            'id_epi' => $epi,
            'codigo_documento' => $codigo,
            'referencia' => mb_substr($referencia, 0, 255),
            'ruta_pdf' => 'documentos/' . date('Y', strtotime($fecha)) . '/' . $codigo . '.pdf',
            'hash' => hash('sha256', $codigo . '|' . $fecha . '|' . $i),
            'fecha_subida' => $fecha,
            'estado_actual' => $estado,
            'tipo_libre' => $tipoLibre,
            'tipo_libre_clave' => $tipoLibre ? slug($tipoLibre) : null,
            'revision_previa' => $revisionPrevia,
        ]);

        $idDocumento = (int) $pdo->lastInsertId('documentos_id_documento_seq');
        $documentosNuevos[] = [
            'id' => $idDocumento,
            'epi' => $epi,
            'usuario' => $secretario,
            'oficial' => $oficial,
            'estado' => $estado,
            'fecha' => $fecha,
            'codigo' => $codigo,
        ];
    }

    $totalVersiones = contar($pdo, 'versiones_documento');
    $faltanVersiones = max(0, $objetivo - $totalVersiones);
    echo "[4/14] Versiones de documento: {$totalVersiones} existentes, se insertan {$faltanVersiones}...\n";

    $versionesCreadas = 0;
    foreach ($documentosNuevos as $doc) {
        if ($versionesCreadas >= $faltanVersiones) {
            break;
        }
        insertar($pdo, 'versiones_documento', [
            'id_documento' => $doc['id'],
            'version' => 1,
            'ruta_pdf' => 'documentos/' . date('Y', strtotime($doc['fecha'])) . '/' . $doc['codigo'] . '.pdf',
            'fecha' => $doc['fecha'],
            'subido_por' => $doc['usuario'],
        ]);
        $versionesCreadas++;
    }
    if ($versionesCreadas < $faltanVersiones) {
        $candidatos = $pdo->query('SELECT d.id_documento, d.id_usuario, d.ruta_pdf, d.fecha_subida, COALESCE(MAX(v.version), 0) AS ultima FROM documentos d LEFT JOIN versiones_documento v ON v.id_documento = d.id_documento GROUP BY d.id_documento, d.id_usuario, d.ruta_pdf, d.fecha_subida ORDER BY d.fecha_subida DESC LIMIT 800')->fetchAll(PDO::FETCH_ASSOC);
        $candidatos = array_values($candidatos);
        $j = 0;
        while ($versionesCreadas < $faltanVersiones && $candidatos !== []) {
            $c = $candidatos[$j % count($candidatos)];
            insertar($pdo, 'versiones_documento', [
                'id_documento' => (int) $c['id_documento'],
                'version' => (int) $c['ultima'] + 1 + intdiv($j, count($candidatos)),
                'ruta_pdf' => str_replace('.pdf', '_v' . ($j + 2) . '.pdf', (string) $c['ruta_pdf']),
                'fecha' => $c['fecha_subida'],
                'subido_por' => (int) $c['id_usuario'],
            ]);
            $versionesCreadas++;
            $j++;
        }
    }

    // ---------------------------------------------------------------
    // 5. REVISIONES
    // ---------------------------------------------------------------
    $totalRevisiones = contar($pdo, 'revisiones');
    $faltanRevisiones = max(0, $objetivo - $totalRevisiones);
    echo "[5/14] Revisiones: {$totalRevisiones} existentes, se insertan hasta {$faltanRevisiones}...\n";

    $revisionesCreadas = 0;
    $estadoRevision = [4 => 'Observado', 5 => 'Devuelto', 6 => 'Aprobado', 7 => 'Aprobado', 8 => 'Aprobado'];

    foreach ($documentosNuevos as $doc) {
        if (!isset($estadoRevision[$doc['estado']]) || $revisionesCreadas >= $faltanRevisiones) {
            continue;
        }
        $revisor = $revisores[mt_rand(0, count($revisores) - 1)];
        $observado = in_array($doc['estado'], [4, 5], true);
        insertar($pdo, 'revisiones', [
            'id_documento' => $doc['id'],
            'usuario_revisor' => $revisor,
            'nivel_revision' => 'Comando Departamental La Paz',
            'estado' => $estadoRevision[$doc['estado']],
            'id_tipo_observacion' => $observado ? mt_rand(1, 7) : null,
            'observacion_libre' => $observado
                ? $observacionesDoc[mt_rand(1, 6)]
                : 'Revisión formal conforme a normativa. Trámite habilitado para la siguiente etapa.',
            'fecha' => date('Y-m-d H:i:s', strtotime($doc['fecha']) + mt_rand(1, 72) * 3600),
        ]);
        $revisionesCreadas++;
    }

    $docsTopUp = $pdo->query("SELECT id_documento, id_usuario, fecha_subida, estado_actual FROM documentos WHERE estado_actual BETWEEN 6 AND 8 ORDER BY id_documento DESC LIMIT 600")->fetchAll(PDO::FETCH_ASSOC);
    $docsTopUp = array_values($docsTopUp);
    $k = 0;
    while ($revisionesCreadas < $faltanRevisiones && $docsTopUp !== []) {
        $d = $docsTopUp[$k % count($docsTopUp)];
        insertar($pdo, 'revisiones', [
            'id_documento' => (int) $d['id_documento'],
            'usuario_revisor' => $revisores[mt_rand(0, count($revisores) - 1)],
            'nivel_revision' => $k % 30 === 0 ? 'Comando General' : 'Comando Departamental La Paz',
            'estado' => 'Aprobado',
            'id_tipo_observacion' => null,
            'observacion_libre' => 'Conformidad verificada en segunda instancia institucional.',
            'fecha' => date('Y-m-d H:i:s', strtotime((string) $d['fecha_subida']) + mt_rand(24, 240) * 3600),
        ]);
        $revisionesCreadas++;
        $k++;
    }

    // ---------------------------------------------------------------
    // 6. HISTORIAL DE ESTADOS (trazabilidad coherente)
    // ---------------------------------------------------------------
    $totalHistorial = contar($pdo, 'historial_estados');
    echo "[6/14] Historial de estados: {$totalHistorial} existentes, se agregan trazas del flujo...\n";

    $trazas = [
        1 => [[null, 1, 'usuario', 0]],
        2 => [[1, 2, 'usuario', 1]],
        3 => [[1, 2, 'usuario', 1], [2, 3, 'revisor', 3]],
        4 => [[1, 2, 'usuario', 1], [2, 4, 'revisor', 3]],
        5 => [[1, 2, 'usuario', 1], [2, 5, 'revisor', 3]],
        6 => [[1, 2, 'usuario', 1], [2, 3, 'revisor', 2], [3, 6, 'revisor', 4]],
        7 => [[1, 2, 'usuario', 1], [2, 3, 'revisor', 2], [3, 6, 'revisor', 3], [6, 7, 'revisor', 4]],
        8 => [[1, 2, 'usuario', 1], [2, 3, 'revisor', 2], [3, 6, 'revisor', 3], [6, 7, 'revisor', 4], [7, 8, 'general', 6]],
    ];

    foreach ($documentosNuevos as $doc) {
        $revisor = $revisores[mt_rand(0, count($revisores) - 1)];
        $general = $generales[mt_rand(0, count($generales) - 1)];
        foreach ($trazas[$doc['estado']] as [$anterior, $nuevo, $actor, $horas]) {
            $usuarioTraza = match ($actor) {
                'usuario' => $doc['usuario'],
                'revisor' => $revisor,
                default => $general,
            };
            insertar($pdo, 'historial_estados', [
                'id_documento' => $doc['id'],
                'estado_anterior' => $anterior,
                'estado_nuevo' => $nuevo,
                'usuario' => $usuarioTraza,
                'fecha' => date('Y-m-d H:i:s', strtotime($doc['fecha']) + $horas * 3600),
            ]);
        }
    }

    $historialCreadas = contar($pdo, 'historial_estados') - $totalHistorial;
    $faltanHistorial = max(0, $objetivo - $totalHistorial);
    $j = 0;
    while ($historialCreadas < $faltanHistorial && $docsTopUp !== []) {
        $d = $docsTopUp[$j % count($docsTopUp)];
        insertar($pdo, 'historial_estados', [
            'id_documento' => (int) $d['id_documento'],
            'estado_anterior' => 7,
            'estado_nuevo' => 8,
            'usuario' => $generales[mt_rand(0, count($generales) - 1)],
            'fecha' => date('Y-m-d H:i:s', strtotime((string) $d['fecha_subida']) + mt_rand(48, 400) * 3600),
        ]);
        $historialCreadas++;
        $j++;
    }

    // ---------------------------------------------------------------
    // 7. FLUJO DE DOCUMENTOS
    // ---------------------------------------------------------------
    $totalFlujos = contar($pdo, 'flujo_documentos');
    $faltanFlujos = max(0, $objetivo - $totalFlujos);
    echo "[7/14] Flujo de documentos: {$totalFlujos} existentes, se insertan {$faltanFlujos}...\n";

    $flujosCreados = 0;
    foreach ($documentosNuevos as $doc) {
        if ($flujosCreados >= $faltanFlujos) {
            break;
        }
        insertar($pdo, 'flujo_documentos', [
            'id_documento' => $doc['id'],
            'origen' => (string) ($nombresEpi[$doc['epi']] ?? 'EPI ' . $doc['epi']),
            'destino' => 'Comando Departamental de Policía La Paz',
            'fecha' => $doc['fecha'],
            'usuario' => $doc['usuario'],
        ]);
        $flujosCreados++;

        if ($doc['estado'] >= 6 && $flujosCreados < $faltanFlujos) {
            insertar($pdo, 'flujo_documentos', [
                'id_documento' => $doc['id'],
                'origen' => 'Comando Departamental de Policía La Paz',
                'destino' => 'Comando General de la Policía Boliviana',
                'fecha' => date('Y-m-d H:i:s', strtotime($doc['fecha']) + mt_rand(24, 120) * 3600),
                'usuario' => $generales[mt_rand(0, count($generales) - 1)],
            ]);
            $flujosCreados++;
        }
    }
    $j = 0;
    while ($flujosCreados < $faltanFlujos && $docsTopUp !== []) {
        $d = $docsTopUp[$j % count($docsTopUp)];
        insertar($pdo, 'flujo_documentos', [
            'id_documento' => (int) $d['id_documento'],
            'origen' => 'Comando General de la Policía Boliviana',
            'destino' => 'Dirección Nacional de Personal (Escalafón)',
            'fecha' => date('Y-m-d H:i:s', strtotime((string) $d['fecha_subida']) + mt_rand(72, 500) * 3600),
            'usuario' => $generales[mt_rand(0, count($generales) - 1)],
        ]);
        $flujosCreados++;
        $j++;
    }

    // ---------------------------------------------------------------
    // 8. VALIDACIONES DEL SISTEMA EXPERTO
    // ---------------------------------------------------------------
    $totalValidaciones = contar($pdo, 'validaciones');
    $faltanValidaciones = max(0, $objetivo - $totalValidaciones);
    echo "[8/14] Validaciones: {$totalValidaciones} existentes, se insertan {$faltanValidaciones}...\n";

    $reglas = array_map('intval', $pdo->query('SELECT id_regla FROM reglas ORDER BY id_regla')->fetchAll(PDO::FETCH_COLUMN));
    $validacionesCreadas = 0;
    foreach ($documentosNuevos as $doc) {
        if ($validacionesCreadas >= $faltanValidaciones) {
            break;
        }
        foreach ([true, false] as $esSegunda) {
            if ($validacionesCreadas >= $faltanValidaciones || ($esSegunda && mt_rand(1, 100) > 60)) {
                continue;
            }
            $observado = in_array($doc['estado'], [4, 5], true);
            insertar($pdo, 'validaciones', [
                'id_documento' => $doc['id'],
                'id_regla' => $reglas[mt_rand(0, count($reglas) - 1)],
                'resultado' => $observado ? 'Observado' : 'Aprobado',
                'mensaje' => $observado
                    ? 'Se detectaron observaciones formales en el documento remitido.'
                    : 'El documento cumple con los requisitos verificados automáticamente.',
                'fecha' => date('Y-m-d H:i:s', strtotime($doc['fecha']) + mt_rand(1, 20) * 60),
            ]);
            $validacionesCreadas++;
        }
    }
    $j = 0;
    while ($validacionesCreadas < $faltanValidaciones && $docsTopUp !== []) {
        $d = $docsTopUp[$j % count($docsTopUp)];
        insertar($pdo, 'validaciones', [
            'id_documento' => (int) $d['id_documento'],
            'id_regla' => $reglas[mt_rand(0, count($reglas) - 1)],
            'resultado' => 'Aprobado',
            'mensaje' => 'Validación de consistencia superada en la verificación complementaria.',
            'fecha' => date('Y-m-d H:i:s', strtotime((string) $d['fecha_subida']) + mt_rand(20, 300) * 60),
        ]);
        $validacionesCreadas++;
        $j++;
    }

    // ---------------------------------------------------------------
    // 9. NOTIFICACIONES
    // ---------------------------------------------------------------
    $totalNotificaciones = contar($pdo, 'notificaciones');
    $faltanNotificaciones = max(0, $objetivo - $totalNotificaciones);
    echo "[9/14] Notificaciones: {$totalNotificaciones} existentes, se insertan {$faltanNotificaciones}...\n";

    $textosNotificacion = [
        1 => ['Trámite en borrador', 'El documento aún no fue remitido al Comando Departamental.'],
        2 => ['Nuevo trámite recibido', 'La EPI remitió un documento para dictamen departamental.'],
        3 => ['Trámite en revisión', 'El Comando Departamental inició la revisión formal del documento.'],
        4 => ['Documento observado', 'El trámite presenta observaciones que deben subsanarse.'],
        5 => ['Documento devuelto', 'El expediente fue devuelto a la unidad de origen.'],
        6 => ['Documento aprobado', 'El Comando Departamental aprobó el trámite remitido.'],
        7 => ['Remitido al Comando General', 'El expediente aprobado fue remitido para registro.'],
        8 => ['Registrado oficialmente', 'El Comando General asentó el documento en el escalafón.'],
    ];
    $notificacionesCreadas = 0;
    foreach ($documentosNuevos as $doc) {
        if ($notificacionesCreadas >= $faltanNotificaciones) {
            break;
        }
        [$titulo, $mensaje] = $textosNotificacion[$doc['estado']];
        insertar($pdo, 'notificaciones', [
            'id_usuario' => $doc['estado'] >= 3 ? $revisores[mt_rand(0, count($revisores) - 1)] : $doc['usuario'],
            'id_documento' => $doc['id'],
            'titulo' => mb_substr($titulo . ' — ' . $doc['codigo'], 0, 150),
            'mensaje' => $mensaje,
            'leido' => mt_rand(1, 100) <= 45 ? 'true' : 'false',
            'fecha' => date('Y-m-d H:i:s', strtotime($doc['fecha']) + mt_rand(5, 600) * 60),
        ]);
        $notificacionesCreadas++;
    }
    $j = 0;
    while ($notificacionesCreadas < $faltanNotificaciones && $docsTopUp !== []) {
        $d = $docsTopUp[$j % count($docsTopUp)];
        insertar($pdo, 'notificaciones', [
            'id_usuario' => $todosUsuarios[mt_rand(0, count($todosUsuarios) - 1)],
            'id_documento' => (int) $d['id_documento'],
            'titulo' => 'Recordatorio de trámite pendiente',
            'mensaje' => 'El expediente continúa en la bandeja institucional y requiere seguimiento.',
            'leido' => mt_rand(1, 100) <= 50 ? 'true' : 'false',
            'fecha' => date('Y-m-d H:i:s', strtotime((string) $d['fecha_subida']) + mt_rand(1, 900) * 60),
        ]);
        $notificacionesCreadas++;
        $j++;
    }

    // ---------------------------------------------------------------
    // 10. AUDITORÍA
    // ---------------------------------------------------------------
    $totalAuditoria = contar($pdo, 'auditoria');
    $faltanAuditoria = max(0, $objetivo - $totalAuditoria);
    echo "[10/14] Auditoría: {$totalAuditoria} existentes, se insertan {$faltanAuditoria}...\n";

    $accionesAuditoria = [
        ['documentos', 'SUBIDA_DOCUMENTO'],
        ['documentos', 'REMISION_CONFIRMADA'],
        ['documentos', 'SUBSANACION_REENVIO'],
        ['revisiones', 'DICTAMEN_REGISTRADO'],
        ['usuarios', 'LOGIN'],
        ['usuarios', 'CONSULTA_BANDEJA'],
        ['documentos', 'EXPORTACION_REPORTE'],
    ];
    $auditoriasCreadas = 0;
    foreach ($documentosNuevos as $doc) {
        if ($auditoriasCreadas >= $faltanAuditoria) {
            break;
        }
        [$tabla, $accion] = $accionesAuditoria[mt_rand(0, count($accionesAuditoria) - 1)];
        insertar($pdo, 'auditoria', [
            'id_usuario' => $doc['usuario'],
            'tabla' => $tabla,
            'accion' => $accion,
            'descripcion' => mb_substr('Evento ' . $accion . ' sobre el trámite ' . $doc['codigo'] . '.', 0, 500),
            'fecha' => date('Y-m-d H:i:s', strtotime($doc['fecha']) + mt_rand(1, 500) * 60),
        ]);
        $auditoriasCreadas++;
    }
    $j = 0;
    while ($auditoriasCreadas < $faltanAuditoria) {
        [$tabla, $accion] = $accionesAuditoria[mt_rand(0, count($accionesAuditoria) - 1)];
        insertar($pdo, 'auditoria', [
            'id_usuario' => $todosUsuarios[mt_rand(0, count($todosUsuarios) - 1)],
            'tabla' => $tabla,
            'accion' => $accion,
            'descripcion' => 'Evento de auditoría generado durante la carga de datos de demostración.',
            'fecha' => fechaAleatoria('2025-01-10 08:00:00', '2026-11-09 21:00:00'),
        ]);
        $auditoriasCreadas++;
        $j++;
    }

    // ---------------------------------------------------------------
    // 11. SESIONES
    // ---------------------------------------------------------------
    $totalSesiones = contar($pdo, 'sesiones');
    $faltanSesiones = max(0, $objetivo - $totalSesiones);
    echo "[11/14] Sesiones: {$totalSesiones} existentes, se insertan {$faltanSesiones}...\n";

    $ips = ['192.168.1.', '192.168.0.', '10.0.0.', '172.16.0.'];
    for ($i = 0; $i < $faltanSesiones; $i++) {
        $inicio = fechaAleatoria('2025-01-10 07:00:00', '2026-11-09 22:00:00');
        $cerrada = mt_rand(1, 100) <= 80;
        insertar($pdo, 'sesiones', [
            'id_usuario' => $todosUsuarios[mt_rand(0, count($todosUsuarios) - 1)],
            'ip' => $ips[mt_rand(0, count($ips) - 1)] . mt_rand(2, 254),
            'fecha_inicio' => $inicio,
            'fecha_fin' => $cerrada ? date('Y-m-d H:i:s', strtotime($inicio) + mt_rand(5, 480) * 60) : null,
        ]);
    }

    // ---------------------------------------------------------------
    // 12. HISTORIAL DE DESTINOS
    // ---------------------------------------------------------------
    $totalDestinos = contar($pdo, 'historial_destinos');
    $faltanDestinos = max(0, $objetivo - $totalDestinos);
    echo "[12/14] Historial de destinos: {$totalDestinos} existentes, se insertan {$faltanDestinos}...\n";

    $oficialesDb = $pdo->query('SELECT id_oficial, id_epi FROM oficiales ORDER BY id_oficial')->fetchAll(PDO::FETCH_ASSOC);
    $destinosCreados = 0;
    foreach ($oficialesDb as $indice => $of) {
        if ($destinosCreados >= $faltanDestinos) {
            break;
        }
        $inicio = date('Y-m-d', mt_rand(strtotime('2016-01-01'), strtotime('2024-06-30')));
        $sigueVigente = mt_rand(1, 100) <= 60;
        insertar($pdo, 'historial_destinos', [
            'id_oficial' => (int) $of['id_oficial'],
            'id_epi' => (int) $of['id_epi'],
            'fecha_inicio' => $inicio,
            'fecha_fin' => $sigueVigente ? null : date('Y-m-d', strtotime($inicio) + mt_rand(200, 1200) * 86400),
        ]);
        $destinosCreados++;

        if ($destinosCreados < $faltanDestinos && $indice % 3 === 0) {
            $epiAnterior = $epis[mt_rand(0, count($epis) - 1)];
            if ($epiAnterior === (int) $of['id_epi']) {
                $epiAnterior = $epis[0] === $epiAnterior ? $epis[1] : $epis[0];
            }
            insertar($pdo, 'historial_destinos', [
                'id_oficial' => (int) $of['id_oficial'],
                'id_epi' => $epiAnterior,
                'fecha_inicio' => date('Y-m-d', strtotime($inicio) - mt_rand(400, 1500) * 86400),
                'fecha_fin' => date('Y-m-d', strtotime($inicio) - 86400),
            ]);
            $destinosCreados++;
        }
    }

    // ---------------------------------------------------------------
    // 13. LINKS DE REGISTRO
    // ---------------------------------------------------------------
    $totalLinks = contar($pdo, 'links_registro');
    $faltanLinks = max(0, $objetivo - $totalLinks);
    echo "[13/14] Links de registro: {$totalLinks} existentes, se insertan {$faltanLinks}...\n";

    $linksNuevos = [];
    $linksACrear = max($faltanLinks, max(0, $objetivo - contar($pdo, 'solicitudes_registro')));
    for ($i = 0; $i < $linksACrear; $i++) {
        $token = bin2hex(random_bytes(32));
        $expirado = mt_rand(1, 100) <= 25;
        insertar($pdo, 'links_registro', [
            'token' => $token,
            'id_rol' => 1,
            'id_epi' => $epis[$i % count($epis)],
            'id_usuario_emisor' => $generales[mt_rand(0, count($generales) - 1)],
            'estado' => 'activo',
            'fecha_expiracion' => $expirado
                ? fechaAleatoria('2025-02-01 08:00:00', '2026-06-30 20:00:00')
                : fechaAleatoria('2027-01-01 08:00:00', '2027-12-31 20:00:00'),
            'creado_en' => fechaAleatoria('2025-01-10 08:00:00', '2026-11-09 20:00:00'),
        ]);
        $linksNuevos[] = $token;
    }

    // ---------------------------------------------------------------
    // 14. SOLICITUDES DE REGISTRO
    // ---------------------------------------------------------------
    $totalSolicitudes = contar($pdo, 'solicitudes_registro');
    $faltanSolicitudes = max(0, $objetivo - $totalSolicitudes);
    echo "[14/14] Solicitudes de registro: {$totalSolicitudes} existentes, se insertan {$faltanSolicitudes}...\n";

    $estadosSolicitud = ['recibida', 'en_cola', 'verificada', 'aprobada', 'aprobada', 'rechazada'];
    $solicitudesCreadas = 0;

    if ($linksNuevos === [] && $faltanSolicitudes > 0) {
        $linksNuevos = $pdo->query('SELECT token FROM links_registro ORDER BY id_link DESC LIMIT ' . $faltanSolicitudes)->fetchAll(PDO::FETCH_COLUMN);
    }

    foreach ($linksNuevos as $indice => $token) {
        if ($solicitudesCreadas >= $faltanSolicitudes) {
            break;
        }
        $idLink = (int) $pdo->query("SELECT id_link FROM links_registro WHERE token = " . $pdo->quote($token))->fetchColumn();
        $idEpi = (int) $pdo->query("SELECT id_epi FROM links_registro WHERE id_link = {$idLink}")->fetchColumn();
        [$nombres, $apellidos] = $personas[($indice + 900) % count($personas)];
        $estado = $estadosSolicitud[mt_rand(0, count($estadosSolicitud) - 1)];

        $usuarioSolicitud = 'sol_' . slug($nombres . ' ' . $apellidos) . '_' . ($indice + 1);
        while ((int) $pdo->query("SELECT count(*) FROM solicitudes_registro WHERE usuario = " . $pdo->quote($usuarioSolicitud))->fetchColumn() > 0) {
            $usuarioSolicitud .= mt_rand(1, 9);
        }

        $iaEstado = match ($estado) {
            'recibida' => 'pendiente',
            'en_cola' => 'en_cola',
            default => 'procesada',
        };
        $procesada = $iaEstado === 'procesada';
        $aprobada = $estado === 'aprobada';
        $rechazada = $estado === 'rechazada';
        $creadoEn = fechaAleatoria('2025-02-01 08:00:00', '2026-11-09 18:00:00');

        insertar($pdo, 'solicitudes_registro', [
            'id_link' => $idLink,
            'token' => $token,
            'id_rol' => 1,
            'id_epi' => $idEpi > 0 ? $idEpi : $epis[0],
            'nombres' => mb_substr(mb_strtoupper($nombres), 0, 100),
            'apellidos' => mb_substr(mb_strtoupper($apellidos), 0, 100),
            'ci' => mt_rand(3000000, 9999999) . '-LP',
            'telefono' => '7' . mt_rand(1000000, 9999999),
            'usuario' => $usuarioSolicitud,
            'ruta_memo' => 'solicitudes/' . $token . '_' . ($indice + 1) . '.pdf',
            'hash_memo' => hash('sha256', $token . $indice),
            'estado_solicitud' => $estado,
            'ia_estado' => $iaEstado,
            'ia_firma' => $procesada ? ($rechazada ? 'false' : 'true') : null,
            'ia_sello' => $procesada ? ($rechazada ? 'false' : 'true') : null,
            'ia_nombres' => json_encode([mb_strtoupper($nombres), mb_strtoupper($apellidos)], JSON_UNESCAPED_UNICODE),
            'ia_coincide' => $procesada ? ($rechazada ? 'false' : 'true') : null,
            'ia_advertencia' => $procesada ? ($rechazada ? 'true' : 'false') : null,
            'ia_rostro' => $procesada ? ($rechazada ? 'false' : 'true') : null,
            'ia_mensaje' => $procesada
                ? ($rechazada
                    ? 'ADVERTENCIA DE IDENTIDAD: los datos del memo no coinciden con la fotografía y la firma no fue detectada.'
                    : 'Verificación completada: firma, sello, nombres y rostro coinciden con la solicitud.')
                : null,
            'observacion' => $rechazada ? 'Solicitud rechazada por documentación inconsistente.' : null,
            'id_usuario_creado' => $aprobada ? $todosUsuarios[mt_rand(0, count($todosUsuarios) - 1)] : null,
            'creado_en' => $creadoEn,
            'ia_verificado_en' => $procesada ? date('Y-m-d H:i:s', strtotime($creadoEn) + mt_rand(1, 30) * 60) : null,
            'resuelto_en' => ($aprobada || $rechazada) ? date('Y-m-d H:i:s', strtotime($creadoEn) + mt_rand(31, 600) * 60) : null,
            'ruta_foto' => 'solicitudes/fotos/' . $token . '.png',
        ]);
        $solicitudesCreadas++;
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "\nERROR: " . $e->getMessage() . "\nNo se aplicó ningún cambio (rollback).\n");
    exit(1);
}

echo "\n=====================================================\n";
echo " CARGA COMPLETADA — filas por tabla\n";
echo "=====================================================\n";
$resumen = [
    'oficiales', 'usuarios', 'documentos', 'versiones_documento', 'revisiones',
    'historial_estados', 'flujo_documentos', 'validaciones', 'notificaciones',
    'auditoria', 'sesiones', 'historial_destinos', 'links_registro', 'solicitudes_registro',
];
foreach ($resumen as $tabla) {
    printf("  %-24s %6d\n", $tabla, contar($pdo, $tabla));
}
echo "\nContraseña de las cuentas demo nuevas: Ofbol2026*Demo\n";
echo "Catálogos intactos: roles, grados, cargos, epis, tipos y estados del sistema.\n";

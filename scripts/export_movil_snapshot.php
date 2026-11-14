<?php
/**
 * Exporta un snapshot de solo lectura de la base OFBOL para la demo móvil.
 * No modifica nada: solo SELECT y escritura del JSON en la carpeta de la app.
 */
require_once __DIR__ . '/../database/db_config.php';

$salida = 'C:/Users/ALEJANDRO/Desktop/aplicacion/ofbol_movil/assets/data/ofbol.json';
@mkdir(dirname($salida), 0777, true);

$pdo = ofbolPdo();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$filas = fn (string $sql): array => $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

$catalogos = [
    'estados' => $filas('select id_estado id, nombre from estados_documento order by id_estado'),
    'tipos' => $filas('select id_tipo id, nombre from tipos_documento order by id_tipo'),
    'epis' => $filas('select id_epi id, nombre, direccion, telefono from epis order by id_epi'),
    'grados' => $filas('select id_grado id, nombre, abreviatura from grados order by id_grado'),
    'cargos' => $filas('select id_cargo id, nombre from cargos order by id_cargo'),
    'roles' => $filas('select id_rol id, nombre from roles order by id_rol'),
    'tipos_observacion' => $filas('select id_tipo id, nombre from tipos_observacion order by id_tipo'),
];

$oficiales = $filas(
    'select o.id_oficial id, o.escalafon, o.ci, o.nombres, o.apellidos, o.estado,
            o.numero_item, o.codigo_institucional,
            g.abreviatura grado_abrev, g.nombre grado,
            e.nombre epi, e.id_epi epi_id,
            c.nombre cargo
     from oficiales o
     join grados g on g.id_grado = o.id_grado
     join epis e on e.id_epi = o.id_epi
     left join cargos c on c.id_cargo = o.id_cargo
     order by o.id_oficial'
);

$documentos = $filas(
    'select d.id_documento id, d.codigo_documento codigo, d.referencia,
            d.fecha_subida fecha, d.estado_actual estado_id,
            d.id_epi epi_id, d.ruta_pdf, d.hash,
            t.nombre tipo, ed.nombre estado,
            o.escalafon, o.nombres || \' \' || o.apellidos oficial,
            g.abreviatura grado
     from documentos d
     join tipos_documento t on t.id_tipo = d.id_tipo
     join estados_documento ed on ed.id_estado = d.estado_actual
     join oficiales o on o.id_oficial = d.id_oficial
     join grados g on g.id_grado = o.id_grado
     order by d.fecha_subida desc nulls last, d.id_documento desc'
);

$versiones = $filas('select id_documento doc, version, fecha from versiones_documento order by id_documento, version');
$revisiones = $filas(
    'select r.id_documento doc, r.nivel_revision nivel, r.estado, r.observacion,
            r.fecha, r.observacion_libre, t.nombre tipo_observacion
     from revisiones r
     left join tipos_observacion t on t.id_tipo = r.id_tipo_observacion
     order by r.fecha, r.id_revision'
);
$historial = $filas(
    'select h.id_documento doc, ea.nombre anterior, en.nombre nuevo, h.fecha
     from historial_estados h
     left join estados_documento ea on ea.id_estado = h.estado_anterior
     join estados_documento en on en.id_estado = h.estado_nuevo
     order by h.fecha, h.id_historial'
);
$flujo = $filas('select id_documento doc, origen, destino, fecha from flujo_documentos order by fecha, id_flujo');
$validaciones = $filas('select id_documento doc, resultado, mensaje, fecha from validaciones order by fecha, id_validacion');

$conteoPorOficial = [];
foreach ($documentos as $d) {
    $clave = $d['escalafon'];
    $conteoPorOficial[$clave] = ($conteoPorOficial[$clave] ?? 0) + 1;
}

$demo = null;
$mejor = 0;
foreach ($oficiales as $o) {
    $n = $conteoPorOficial[$o['escalafon']] ?? 0;
    if ($n > $mejor) {
        $mejor = $n;
        $demo = $o;
    }
}

$payload = [
    'meta' => [
        'sistema' => 'OFBOL · Policía Boliviana',
        'generado' => date('c'),
        'total_documentos' => count($documentos),
        'total_oficiales' => count($oficiales),
        'demo_escalafon' => $demo['escalafon'] ?? null,
        'demo_nombre' => $demo ? trim($demo['grado'] . ' ' . $demo['nombres'] . ' ' . $demo['apellidos']) : null,
    ],
    'catalogos' => $catalogos,
    'oficiales' => $oficiales,
    'documentos' => $documentos,
    'versiones' => $versiones,
    'revisiones' => $revisiones,
    'historial' => $historial,
    'flujo' => $flujo,
    'validaciones' => $validaciones,
];

$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
file_put_contents($salida, $json);

printf(
    "OK %s\n documentos=%d oficiales=%d versiones=%d revisiones=%d historial=%d flujo=%d validaciones=%d\n demo=%s (%s) docs=%d\n peso=%.2f MB\n",
    $salida,
    count($documentos),
    count($oficiales),
    count($versiones),
    count($revisiones),
    count($historial),
    count($flujo),
    count($validaciones),
    $demo['escalafon'] ?? '-',
    $demo ? trim($demo['nombres'] . ' ' . $demo['apellidos']) : '-',
    $demo ? ($conteoPorOficial[$demo['escalafon']] ?? 0) : 0,
    strlen($json) / 1048576
);

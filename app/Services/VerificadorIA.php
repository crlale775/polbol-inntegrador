<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * VerificadorIA — Cliente de la IA LOCAL (LM Studio) que analiza el memorándum
 * de designación subido en el formulario público de registro.
 *
 * Servidor: LM Studio → http://127.0.0.1:1234  (configurable en .env)
 *   Modelo:  qwen2.5-vl-3b-instruct (visión, 3B — MODELO ÚNICO para todo)
 *   Endpoint: POST /api/v1/chat
 *   Body: {
 *     "model": "qwen2-vl-2b-instruct",
 *     "temperature": 0,
 *     "input": [
 *       {"type": "text",  "content": "instrucciones + JSON esperado"},
 *       {"type": "image", "data_url": "data:image/png;base64,<imagen>"},
 *     ]
 *   }
 *   Respuesta: { "output": [ { "type": "message", "content": "..." } ] }
 *
 * Estrategia de consulta (probada en vivo con qwen2-vl-2b):
 *   - El modelo de 2B responde JSON confiable con UNA o DOS imágenes; con más
 *     tiende a narrar o a evaluar solo la última.
 *   - Los prompts de "identificar/resumir" inducen al modelo a recortar el
 *     nombre (devuelve solo el primer nombre). La tarea que funciona es la
 *     COPIA VERBATIM: pedir que copie exactamente la línea del destinatario
 *     (bloque "Al Señor(a): ... Presente.-"), palabra por palabra.
 *   - Las preguntas binarias de presencia ("¿está escrito X?") NO sirven: el
 *     modelo 2B contesta "true" casi siempre (sesgo de sí).
 *   - Por eso la identidad se decide comparando LOCALMENTE el nombre copiado
 *     del memo contra el nombre registrado, sin pedirle opinión a la IA.
 *
 * MODELO ÚNICO: qwen2.5-vl-7b (IA_MODEL) responde TODAS las consultas.
 * Ya no se alterna entre modelos: intercambiarlos en caliente en LM Studio
 * (descargar 6 GB → cargar otro → ...) era la causa de verificaciones de 4+
 * minutos y de timeouts sin respuesta.
 *
 * Pipeline por verificación (optimizado para velocidad con el 7B):
 *   1) NOMBRES: UNA consulta con la PÁGINA COMPLETA (la más barata); si no
 *      coincide, mitad inferior; como último recurso, mitad superior.
 *   2) FIRMA/SELLO: UNA consulta con la página completa; solo si falta algo,
 *      mitades inferior y superior como respaldo (corte temprano al tener
 *      ambos). Antes eran hasta 7 consultas secuenciales; ahora típicamente 2.
 *   3) Decisión local de identidad + reglas de negocio (normalizar()).
 *
 * Configuración (.env): IA_URL, IA_ENDPOINT, IA_MODEL, IA_TIMEOUT,
 * IA_MAX_PAGINAS, IA_DPI.
 */
class VerificadorIA
{
    /**
     * Prompt ÚNICO de lectura documental.
     *
     * Se envía idéntico en cada consulta (solo cambia la imagen) para que el
     * motor reutilice el caché de prefijo (KV cache) y no reprocese el texto
     * de instrucciones en cada documento.
     *
     * Reglas de diseño del prompt (probadas con modelos de 2B-3B):
     *   - Salida JSON mínima: menos tokens generados = respuesta más rápida.
     *   - "Copia literal" del destinatario en vez de "identifica a la persona":
     *     los modelos pequeños recortan el nombre cuando se les pide resumir.
     *   - Se prohíbe explícitamente narrar o explicar: el texto libre era la
     *     causa de respuestas de 40+ líneas y de JSON inválido.
     */
    protected const PROMPT_DOCUMENTO = 'Documento escaneado o fotografiado de la Policía Boliviana '
        . '(puede estar levemente rotado, con membrete y sellos). '
        . 'Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin explicaciones y sin texto adicional: '
        . '{"es_memo": true o false, '
        . '"tipo": "DESIGNACION"|"LLAMADA DE ATENCION"|"ARRESTO"|"VACACION"|"CUENTA VACACION"|'
        . '"COMISION DE ESTUDIO"|"CAMBIO DE DESTINO"|"FELICITACION"|"OTRO"|null, '
        . '"destinatario": "nombres y apellidos de la persona escrita después de \'Al Señor(a):\' o '
        . '\'A la Señora:\', sin grados ni cargos, o null", '
        . '"fecha": "dd/mm/aaaa o null", "firma": true o false, "sello": true o false}. '
        . 'REGLAS: '
        . '1) es_memo es true solo si el documento es un memorándum u oficio institucional de la Policía '
        . 'Boliviana (título MEMORÁNDUM o membrete policial con destinatario, fecha y firma). Si es una tesis, '
        . 'informe académico, carta particular, factura, formulario o cualquier otro documento, es_memo es false. '
        . '2) destinatario: copia el nombre LETRA POR LETRA tal como está impreso, sin abreviar ni corregir. '
        . 'Si no se lee con claridad, usa null. '
        . '3) firma es true solo si hay una firma manuscrita visible; sello es true solo si hay un sello o timbre '
        . 'institucional visible (no cuentes el membrete impreso como sello). '
        . '4) No inventes datos: si algo no se ve, usa null o false.';

    /**
     * Presupuesto de tiempo (segundos) que puede consumir una verificación.
     * Se fija con iniciarPresupuesto() al entrar a analizar()/revisarRapido().
     */
    protected ?float $limite = null;

    /**
     * Segundos del presupuesto que NO puede tocar la consulta principal.
     *
     * La lectura completa de la página es la consulta cara (procesa toda la
     * imagen). Si se la deja consumir el presupuesto entero, la comprobación
     * de la firma se queda sin tiempo y un memo firmado se reporta como "sin
     * firma". Con esta reserva la lectura principal se corta antes y siempre
     * queda margen para el recorte inferior.
     */
    protected float $reservaSeg = 0.0;

    /** Registro de consultas de la verificación en curso (para el log). */
    protected array $consultas = [];

    /**
     * Sin límite de inferencia por defecto. Conserva el presupuesto opcional
     * de instalaciones que decidan expresamente activar el modo acotado.
     */
    protected function iniciarPresupuesto(float $segundos): void
    {
        $this->limite = config('ia.esperar_sin_limite', true)
            ? null : microtime(true) + max(1.0, $segundos);
        if ($this->limite === null) {
            @set_time_limit(0);
        }
    }

    /** Segundos que quedan del presupuesto (infinito si no se abrió). */
    protected function restante(): float
    {
        if ($this->limite === null) {
            return INF;
        }

        return max(0.0, $this->limite - microtime(true));
    }

    /** IDs de modelo publicados por el servidor (/v1/models), cacheados. */
    protected ?array $modelosServidor = null;

    /** Modelo que respondió correctamente por última vez (evita reintentos). */
    protected ?string $modeloActivo = null;

    public function __construct(protected PdfPaginas $paginas)
    {
    }

    public function disponible(): bool
    {
        return config('ia.url') !== '' && config('ia.model') !== '';
    }

    public function url(): string
    {
        return rtrim((string) config('ia.url'), '/');
    }

    /**
     * IDs de los modelos publicados por LM Studio (GET /v1/models).
     *
     * @return array<int, string>
     */
    public function modelosDisponibles(bool $refrescar = false): array
    {
        if ($this->modelosServidor !== null && !$refrescar) {
            return $this->modelosServidor;
        }

        if ($this->url() === '') {
            return $this->modelosServidor = [];
        }

        try {
            $respuesta = Http::timeout(8)->acceptJson()->get($this->url() . '/v1/models');
            if ($respuesta->failed()) {
                return $this->modelosServidor = [];
            }

            $ids = [];
            foreach ((array) $respuesta->json('data', []) as $modelo) {
                $id = is_array($modelo) ? ($modelo['id'] ?? null) : (is_string($modelo) ? $modelo : null);
                if (is_string($id) && $id !== '') {
                    $ids[] = $id;
                }
            }

            return $this->modelosServidor = array_values(array_unique($ids));
        } catch (\Throwable) {
            return $this->modelosServidor = [];
        }
    }

    /**
     * Modelos configurados como candidatos, en orden de preferencia y filtrados
     * a los que el servidor realmente tiene descargados.
     *
     * Si ninguno de los configurados está descargado, se elige automáticamente
     * el primer modelo de VISIÓN disponible (así el sistema sigue funcionando
     * tras cambiar de modelo en LM Studio sin editar el .env).
     *
     * @return array<int, string>
     */
    public function modelosCandidatos(?string $preferido = null): array
    {
        $configurados = [];
        foreach (array_merge([$preferido], (array) config('ia.modelos', [])) as $modelo) {
            $modelo = trim((string) $modelo);
            if ($modelo !== '' && !in_array($modelo, $configurados, true)) {
                $configurados[] = $modelo;
            }
        }

        $disponibles = $this->modelosDisponibles();
        if (count($disponibles) === 0) {
            return $configurados;
        }

        $descargados = array_values(array_filter(
            $configurados,
            fn (string $m) => in_array($m, $disponibles, true)
        ));

        // Circuit breaker: un modelo que acaba de fallar al cargar se omite
        // durante 10 minutos (evita esperar la carga rota en cada consulta).
        if (count($descargados) > 1) {
            $sanos = array_values(array_filter($descargados, fn (string $m) => !$this->modeloMarcadoRoto($m)));
            if (count($sanos) > 0) {
                $descargados = $sanos;
            }
        }

        if (count($descargados) > 0) {
            return $descargados;
        }

        $vision = $this->primerModeloVision($disponibles);
        if ($vision !== null) {
            Log::warning('[VerificadorIA] Ninguno de los modelos configurados está descargado; se usa ' . $vision . ' (visión) automáticamente. Configure IA_MODEL/IA_MODEL_RAPIDO con los IDs de LM Studio.');

            return [$vision];
        }

        return $configurados;
    }

    /**
     * Primer modelo de visión (multimodal) entre los publicados por el servidor.
     *
     * @param  array<int, string>  $ids
     */
    protected function primerModeloVision(array $ids): ?string
    {
        $claves = ['vl', 'vision', 'llava', 'moondream', 'internvl', 'gemma-3', 'minicpm-v', 'pixtral'];
        foreach ($ids as $id) {
            $bajo = mb_strtolower($id, 'UTF-8');
            foreach ($claves as $clave) {
                if (str_contains($bajo, $clave)) {
                    return $id;
                }
            }
        }

        return null;
    }

    /**
     * Modelo que se usará para una consulta (preferido → IA_MODEL → rápidos).
     */
    public function resolverModelo(?string $preferido = null): ?string
    {
        if ($this->modeloActivo !== null && ($preferido === null || $preferido === $this->modeloActivo)) {
            return $this->modeloActivo;
        }

        $candidatos = $this->modelosCandidatos($preferido);

        return $candidatos[0] ?? null;
    }

    /**
     * Analiza un PDF (memo de designación) y devuelve el resultado normalizado.
     *
     * @param  string  $rutaAbsoluta  Ruta absoluta al PDF en storage.
     * @param  array   $esperado      ['nombres' => ..., 'apellidos' => ...]
     * @return array{firma:bool,sello:bool,nombres:array,coincide:bool|null,mensaje:string|null,raw:array}
     */
    public function analizar(string $rutaAbsoluta, array $esperado = []): array
    {
        if (!$this->disponible()) {
            throw new RuntimeException(
                'La IA local no está configurada. Defina IA_URL e IA_MODEL en el archivo .env (ej. http://127.0.0.1:1234 y qwen/qwen2.5-vl-3b).'
            );
        }

        // Espera completa por defecto; presupuesto solo en el modo acotado.
        $inicio = microtime(true);
        $this->iniciarPresupuesto((float) config('ia.presupuesto', 300));
        // La lectura completa no puede comerse el tiempo de la firma.
        $this->reservaSeg = 2.0;

        // 0. DESCARTE TEMPRANO: si el documento no empieza con MEMORÁNDUM se
        //    rechaza sin gastar consultas de visión (firma/sello/nombres).
        $evidencia = $this->evidenciaRapida($rutaAbsoluta, !empty($esperado['forzar_revision']));
        $encabezado = $evidencia['encabezado'];
        if ($encabezado['es_memo'] === false) {
            return [
                'firma' => false,
                'sello' => false,
                'nombres' => [],
                'destinatario' => null,
                'autoridad' => null,
                'coincide' => false,
                'descartado' => true,
                'no_concluyente' => false,
                'encabezado' => $encabezado['encabezado'],
                'mensaje' => 'DOCUMENTO DESCARTADO: el archivo no empieza con el título MEMORÁNDUM. '
                    . ($encabezado['mensaje'] ?? '') . ' No se analizó firma, sello ni identidad.',
                'raw' => ['encabezado' => $encabezado],
            ];
        }

        $json = $evidencia['json'];

        // 2.b DESCARTE en documentos ESCANEADOS: sin capa de texto no hubo
        //     pre-filtro de encabezado, así que la lectura completa decide. Si
        //     el modelo dice claramente que no es memorándum, se descarta (en
        //     rojo) sin evaluar firma, sello ni identidad.
        if (count($json) > 0 && isset($json['es_memo']) && !$this->booleano($json['es_memo'])) {
            $this->registrarResumen('registro_publico/descarte');

            return [
                'firma' => false,
                'sello' => false,
                'nombres' => [],
                'destinatario' => null,
                'autoridad' => null,
                'coincide' => false,
                'descartado' => true,
                'no_concluyente' => false,
                'encabezado' => $encabezado['encabezado'] ?? null,
                'mensaje' => 'DOCUMENTO DESCARTADO: el archivo no es un memorándum institucional de '
                    . 'la Policía Boliviana, por lo que no se verificó firma, sello ni identidad. '
                    . 'Adjunte el memorándum correcto.',
                'raw' => ['respuesta_ia' => json_encode($json, JSON_UNESCAPED_UNICODE)],
            ];
        }

        $nombreEsperado = trim((string) (($esperado['nombres'] ?? '') . ' ' . ($esperado['apellidos'] ?? '')));
        $destinatario = is_string($json['destinatario'] ?? null) ? trim((string) $json['destinatario']) : '';
        $firma = $evidencia['firma'];
        $sello = $evidencia['sello'];

        $raw = [
            'destinatario' => $destinatario !== '' ? $destinatario : null,
            'firma' => $firma,
            'sello' => $sello,
        ];
        if ($destinatario !== '') {
            $raw['coincide'] = $this->nombresLimpiosDe($raw) !== []
                ? $this->coinciden($nombreEsperado, $this->nombresLimpiosDe($raw))
                : false;
        }

        $lectura = json_encode($json, JSON_UNESCAPED_UNICODE) ?: '';
        $resultado = $this->normalizar($raw, $esperado, $lectura);
        $resultado['encabezado'] = $encabezado['encabezado'];
        $resultado['tipo_detectado'] = is_string($json['tipo'] ?? null) ? trim((string) $json['tipo']) : null;
        $resultado['fecha_documento'] = is_string($json['fecha'] ?? null) ? trim((string) $json['fecha']) : null;

        // Si la IA no devolvió JSON utilizable NO se aprueba nada: se marca la
        // verificación como no concluyente para revisión manual (nunca un falso
        // "firma y sello correctos" por una respuesta vacía).
        if (count($json) === 0) {
            $resultado['no_concluyente'] = true;
            $resultado['firma'] = false;
            $resultado['sello'] = false;
            $resultado['coincide'] = false;
            $resultado['mensaje'] = 'La IA local no devolvió una lectura válida del memorándum. '
                . 'Revise el documento manualmente antes de aprobar.';
        }

        if (!empty($evidencia['firmaSinVerificar'])) {
            $resultado['no_concluyente'] = true;
            $resultado['mensaje'] .= ' La lectura de la firma no fue concluyente; confírmela manualmente.';
        }
        $resultado['tiempo_seg'] = round(microtime(true)-$inicio,3);

        $this->registrarResumen('registro_publico');

        return $resultado;
    }

    /**
     * Primera página del PDF como data URL, reescalada al lado mayor permitido.
     *
     * Sin recortes 2x2: el pipeline de una sola consulta no los necesita y
     * rasterizarlos añadía ~1 s por documento.
     */
    protected function imagenPaginaUno(string $rutaAbsoluta): ?string
    {
        $paginas = $this->paginas->renderizar(
            $rutaAbsoluta,
            1,
            (int) config('ia.dpi', 150),
            (int) config('ia.max_lado', 1280),
            false
        );

        if (count($paginas) === 0) {
            return null;
        }

        foreach ($paginas as $pagina) {
            if (($pagina['archivo'] ?? '') === 'pagina_1.png') {
                return $pagina['data_url'];
            }
        }

        return $paginas[0]['data_url'] ?? null;
    }

    /**
     * Consulta ÚNICA de lectura del memorándum (destinatario, tipo, fecha,
     * firma y sello) con el presupuesto restante.
     *
     * @return array<string, mixed> JSON decodificado ([] si no fue válido)
     */
    protected function leerDocumento(string $imagen, ?string $modelo = null): array
    {
        $contenido = $this->consultar(
            [$imagen],
            self::PROMPT_DOCUMENTO,
            $modelo ?? (string) config('ia.model', ''),
            null,
            (int) config('ia.max_tokens', 200)
        );

        return $this->extraerJson($contenido) ?? [];
    }

    /**
     * Detecta un SELLO/TIMBRE institucional midiendo la TINTA DE COLOR de la
     * página, sin preguntarle al modelo.
     *
     * Por qué: al preguntar "¿hay sello?" el modelo de 3B respondía distinto
     * según la resolución (true a 1024 px, false a 1280 px) sobre el mismo
     * documento. Los sellos policiales son tinta de color (morado, azul, rojo)
     * y eso se mide de forma determinista y en milisegundos:
     *
     *   - se ignora la franja superior (membrete y escudo institucional, que
     *     también son de color y darían falsos positivos);
     *   - se cuentan los píxeles con saturación alta (tinta de color, no texto
     *     negro ni fondo crema) y se mide el tamaño del conjunto;
     *   - un sello ocupa entre 0.1 % y 25 % de la página; una firma con
     *     bolígrafo azul o una palabra resaltada quedan por debajo.
     *
     * Devuelve true / false, o null si no hay evidencia suficiente (en ese
     * caso decide el modelo).
     */
    protected function detectarSello(string $dataUrl): ?bool
    {
        if (!function_exists('imagecreatefromstring')) {
            return null;
        }

        $coma = strpos($dataUrl, ',');
        if ($coma === false) {
            return null;
        }

        $binario = base64_decode(substr($dataUrl, $coma + 1), true);
        if ($binario === false || $binario === '') {
            return null;
        }

        $im = @imagecreatefromstring($binario);
        if ($im === false) {
            return null;
        }

        $ancho = imagesx($im);
        $alto = imagesy($im);
        $desdeY = (int) round($alto * 0.18);

        // Rejilla gruesa: un sello concentra mucha tinta en una zona pequeña,
        // mientras que un membrete o una línea decorativa la reparten en franjas
        // largas. Se mira la densidad MÁXIMA de una celda, no el total.
        $celda = max(24, (int) round($ancho / 24));
        $celdas = [];
        $coloridos = 0;
        $muestreados = 0;

        // Muestreo cada 2 px: suficiente para medir proporciones y ~4× más rápido.
        for ($y = $desdeY; $y < $alto; $y += 2) {
            $fila = intdiv($y - $desdeY, $celda);
            for ($x = 0; $x < $ancho; $x += 2) {
                $muestreados++;
                $clave = $fila . ':' . intdiv($x, $celda);
                $celdas[$clave] = $celdas[$clave] ?? [0, 0];
                $celdas[$clave][1]++;

                $rgb = imagecolorat($im, $x, $y);
                $r = ($rgb >> 16) & 0xFF;
                $g = ($rgb >> 8) & 0xFF;
                $b = $rgb & 0xFF;

                $max = max($r, $g, $b);
                $min = min($r, $g, $b);

                // Fondo oscuro o negro: no es tinta de color.
                if ($max < 60) {
                    continue;
                }

                // Saturación (HSL) y descarte de grises (texto impreso/fotocopia).
                if ($max === 0 || (($max - $min) / $max) < 0.35) {
                    continue;
                }

                $coloridos++;
                $celdas[$clave][0]++;
            }
        }

        imagedestroy($im);

        if ($muestreados === 0) {
            return null;
        }

        $proporcion = $coloridos / $muestreados;

        // Sin tinta de color apreciable: no hay sello.
        if ($proporcion < 0.0003) {
            return false;
        }

        $densidadMaxima = 0.0;
        foreach ($celdas as [$pintados, $vistos]) {
            if ($vistos > 0) {
                $densidadMaxima = max($densidadMaxima, $pintados / $vistos);
            }
        }

        // Una celda con más de 8 % de tinta de color es una mancha compacta
        // (sello). Un escudo en el membrete también lo sería, pero el membrete
        // queda fuera de la zona analizada.
        if ($densidadMaxima >= 0.08) {
            return true;
        }

        // Tinta de color repartida (subrayados, logos, resaltados): sin opinión.
        return null;
    }

    /**
     * Recorta la franja INFERIOR de la página (donde va la firma) y la devuelve
     * como data URL.
     *
     * A resolución completa la firma manuscrita son trazos de 1-2 px y el 3B la
     * confunde con texto impreso (decía "sin firma" en memos firmados). Con el
     * recorte la firma ocupa mucho más de la imagen y la lectura es fiable.
     */
    protected function recortarInferior(string $dataUrl, float $fraccion = 0.45): ?string
    {
        $coma = strpos($dataUrl, ',');
        if ($coma === false) {
            return null;
        }

        $binario = base64_decode(substr($dataUrl, $coma + 1), true);
        if ($binario === false || $binario === '') {
            return null;
        }

        $im = @imagecreatefromstring($binario);
        if ($im === false) {
            return null;
        }

        $ancho = imagesx($im);
        $alto = imagesy($im);
        $altoRecorte = max(1, (int) round($alto * $fraccion));

        $recorte = imagecreatetruecolor($ancho, $altoRecorte);
        imagecopy($recorte, $im, 0, 0, 0, $alto - $altoRecorte, $ancho, $altoRecorte);
        imagedestroy($im);

        $buf = fopen('php://temp', 'r+');
        if ($buf === false) {
            imagedestroy($recorte);
            return null;
        }

        imagepng($recorte, $buf, 6);
        imagedestroy($recorte);
        rewind($buf);
        $png = (string) stream_get_contents($buf);
        fclose($buf);

        return 'data:image/png;base64,' . base64_encode($png);
    }

    /**
     * Segunda lectura SOLO de la firma, sobre el recorte inferior.
     *
     * Se ejecuta únicamente si la lectura principal no vio firma y todavía
     * queda presupuesto (consultar() lo recorta al tiempo restante, así que
     * nunca se supera el tope de config('ia.presupuesto')).
     *
     * @return bool|null true/false si el modelo respondió; null si no se pudo
     *                   verificar (sin tiempo, sin recorte o respuesta inválida).
     *                   null NO es "no hay firma": el llamador debe advertirlo
     *                   en vez de afirmar que el memo no está firmado.
     */
    protected function confirmarFirma(string $imagen): ?bool
    {
        // Es la última consulta: puede gastar todo lo que quede.
        $this->reservaSeg = 0.0;

        if ($this->restante() < 1.5) {
            return null;
        }

        $recorte = $this->recortarInferior($imagen);
        if ($recorte === null) {
            return null;
        }

        $prompt = 'Esta es la parte INFERIOR de un memorándum. ¿Hay una FIRMA MANUSCRITA '
            . '(trazos de bolígrafo o lápiz, curvos y de distinto grosor, hechos a mano)? '
            . 'El texto impreso, los sellos y las líneas rectas NO son una firma. '
            . 'Responde SOLO con JSON válido: {"firma": true} o {"firma": false}.';

        try {
            $contenido = $this->consultar(
                [$recorte],
                $prompt,
                (string) config('ia.model', ''),
                null,
                16
            );
        } catch (\Throwable) {
            return null;
        }

        $json = $this->extraerJson($contenido);
        if ($json === null || !array_key_exists('firma', $json)) {
            return null;
        }

        return $this->booleano($json['firma']);
    }

    /**
     * Interpreta los booleanos que devuelve el modelo:
     * true / false / "true" / "True" / "si" / 1 / "yes".
     */
    protected function booleano(mixed $valor): bool
    {
        if (is_bool($valor)) {
            return $valor;
        }
        if (is_numeric($valor)) {
            return (int) $valor === 1;
        }
        if (is_string($valor)) {
            return in_array(mb_strtolower(trim($valor), 'UTF-8'), ['true', 'si', 'sí', 'yes', '1'], true);
        }

        return false;
    }

    /**
     * Modelo para leer nombres del destinatario (y todo lo demás).
     *
     * MODELO ÚNICO: qwen2.5-vl-7b (IA_MODEL). Un solo modelo visionario carga
     * en LM Studio y responde nombre + firma + sello; intercambiar modelos en
     * caliente (2B → 9B → 2B) obligaba a LM Studio a descargar/recargar pesos
     * (6 GB) en cada verificación y era la causa de los intentos de 4+ minutos.
     * El 7B es el mejor lector de OCR de escaneos reales de los disponibles
     * (probado: lee "Estela Huallpa Mamani" donde el 2B leía "Sofia Mariani").
     */
    protected function modeloParaNombre(array $paginas): ?string
    {
        return $this->resolverModelo((string) config('ia.model', ''));
    }

    /**
     * Pre-filtro del ENCABEZADO del documento: un memo de la Policía Boliviana
     * empieza con el título "MEMORÁNDUM". Si no aparece, se descarta el archivo
     * de inmediato y NO se gasta ninguna consulta de visión pesada.
     *
     * Orden de comprobación:
     *   1. Capa de texto del PDF (coste cero, sin IA).
     *   2. Si es un escaneo/foto: una consulta MUY pequeña con solo la franja
     *      superior de la página (≈1/4 de los píxeles de una revisión normal).
     *   3. Si no se puede leer, devuelve es_memo = null (no bloquea: decide la
     *      revisión completa).
     *
     * @return array{es_memo:?bool, metodo:string, encabezado:?string, mensaje:?string}
     */
    public function verificarEncabezado(string $rutaAbsoluta): array
    {
        if (!config('ia.gate_memo', true)) {
            return ['es_memo' => null, 'metodo' => 'omitido', 'encabezado' => null, 'mensaje' => null];
        }

        try {
            $encabezado = $this->paginas->encabezado($rutaAbsoluta);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('No se pudo leer el encabezado del PDF para verificación.', ['exception' => $e]);
            return [
                'es_memo' => null,
                'metodo' => 'error',
                'encabezado' => null,
                'mensaje' => 'No se pudo leer el encabezado del PDF. Intente con otro archivo.',
            ];
        }

        $texto = trim((string) ($encabezado['texto'] ?? ''));
        if (mb_strlen($texto) >= 15) {
            $esMemo = $this->textoPareceMemorandum($texto);

            return [
                'es_memo' => $esMemo,
                'metodo' => 'texto',
                'encabezado' => $this->primeraLinea($texto),
                'mensaje' => $esMemo
                    ? 'Encabezado MEMORÁNDUM detectado en el texto del PDF.'
                    : 'El encabezado del PDF no contiene la palabra MEMORÁNDUM.',
            ];
        }

        $imagen = $encabezado['imagen'] ?? null;

        // Documento escaneado/fotografiado: NO se gasta una consulta de visión
        // solo para el encabezado. Medido en este equipo, la franja cuesta
        // 2.5-3.5 s del presupuesto y la lectura completa ya devuelve
        // "es_memo", así que el descarte sale igual (en rojo) sin duplicar el
        // trabajo. IA_GATE_VISION=true restaura el pre-filtro por imagen.
        if (is_string($imagen) && $imagen !== '' && !config('ia.gate_vision', false)) {
            return [
                'es_memo' => null,
                'metodo' => 'escaneo_sin_prefiltro',
                'encabezado' => null,
                'mensaje' => 'Documento escaneado: el tipo se decide en la lectura completa (una sola consulta).',
            ];
        }

        if (is_string($imagen) && $imagen !== '') {
            // Se pide TRANSCRIBIR toda la franja (no "la palabra más grande"):
            // así el título MEMORÁNDUM aparece aunque haya membrete o sellos.
            $prompt = 'Esta es la FRANJA SUPERIOR (encabezado) de la primera página de un documento '
                . 'escaneado o fotografiado. Transcribe LITERALMENTE todo el texto visible en ella, '
                . 'línea por línea, en mayúsculas, incluido el membrete institucional y el título '
                . 'grande del documento. No inventes, no resumas, no traduzcas y no expliques nada. '
                . 'Respuesta SOLO con JSON válido: {"encabezado": "<todo el texto transcrito>"}.';

            // El encabezado es solo un pre-filtro: se le da una fracción corta
            // del presupuesto (IA_TIMEOUT_ENCABEZADO) para que, si el modelo
            // tarda, quede tiempo para la lectura completa del documento.
            $topeEncabezado = min(
                (float) config('ia.timeout_encabezado', 3.5),
                max(1.0, $this->restante() - 1.5)
            );

            if ($topeEncabezado < 1.0) {
                return [
                    'es_memo' => null,
                    'metodo' => 'presupuesto',
                    'encabezado' => null,
                    'mensaje' => 'Sin tiempo para el pre-filtro del encabezado; se continúa con la lectura completa.',
                ];
            }

            try {
                $contenido = $this->consultar(
                    [$imagen],
                    $prompt,
                    (string) config('ia.model', ''),
                    $topeEncabezado,
                    (int) config('ia.max_tokens_encabezado', 80)
                );
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Falló la lectura del encabezado con IA.', ['exception' => $e]);
                return [
                    'es_memo' => null,
                    'metodo' => 'imagen',
                    'encabezado' => null,
                    'mensaje' => 'No se pudo leer el encabezado con la IA; se continuará con la revisión completa.',
                ];
            }

            $json = $this->extraerJson($contenido) ?? [];
            $copiado = $json['encabezado'] ?? $json['titulo'] ?? $json['texto'] ?? null;
            $copiado = is_string($copiado) ? trim($copiado) : '';

            if ($copiado === '') {
                return [
                    'es_memo' => null,
                    'metodo' => 'imagen',
                    'encabezado' => null,
                    'mensaje' => 'La IA no pudo leer el encabezado del documento; se continúa con la revisión completa.',
                ];
            }

            $esMemo = $this->textoPareceMemorandum($copiado);

            // Lectura demasiado corta = OCR poco fiable. Sin evidencia clara no
            // se descarta el documento (mejor una revisión de más que rechazar
            // un memorándum válido por una mala lectura del encabezado).
            if (!$esMemo && mb_strlen(trim((string) preg_replace('/\s+/u', ' ', $copiado))) < 15) {
                return [
                    'es_memo' => null,
                    'metodo' => 'imagen',
                    'encabezado' => $this->primeraLinea($copiado),
                    'mensaje' => 'El encabezado no se leyó con claridad ("' . $this->primeraLinea($copiado) . '); se continúa con la revisión completa.',
                ];
            }

            return [
                'es_memo' => $esMemo,
                'metodo' => 'imagen',
                'encabezado' => $this->primeraLinea($copiado),
                'mensaje' => $esMemo
                    ? 'Encabezado MEMORÁNDUM detectado en la imagen del documento.'
                    : 'El encabezado del documento no dice MEMORÁNDUM (leído: "' . $this->primeraLinea($copiado) . '").',
            ];
        }

        return [
            'es_memo' => null,
            'metodo' => 'sin_lectura',
            'encabezado' => null,
            'mensaje' => 'No se pudo leer el encabezado del PDF; se continúa con la revisión completa.',
        ];
    }

    /**
     * ¿El texto contiene la palabra MEMORÁNDUM? Tolerante a tildes, puntuación
     * y errores leves de OCR (MEMORANOUM, MEMORANDUN, MEMCRANDUM...).
     */
    protected function textoPareceMemorandum(string $texto): bool
    {
        $normal = mb_strtoupper($texto, 'UTF-8');
        $normal = str_replace(
            ['Á', 'É', 'Í', 'Ó', 'Ú', 'Ü', 'Ñ', '.', ',', ':', ';', '-', '_'],
            ['A', 'E', 'I', 'O', 'U', 'U', 'N', ' ', ' ', ' ', ' ', ' ', ' '],
            $normal
        );
        $normal = (string) preg_replace('/[^A-Z0-9 ]+/', ' ', $normal);
        $normal = (string) preg_replace('/\s+/', ' ', trim($normal));

        if (preg_match('/\bMEMORAND(UM|UN|O|UMS|OS)?\b/', $normal) === 1) {
            return true;
        }

        // OCR imperfecto del título: "MEMORANOUM", "MEMCRANDUM"...
        foreach (explode(' ', $normal) as $token) {
            $largo = mb_strlen($token);
            if ($largo < 7 || $largo > 13) {
                continue;
            }
            similar_text($token, 'MEMORANDUM', $porcentaje);
            if ($porcentaje >= 78) {
                return true;
            }
        }

        return false;
    }

    /**
     * Primera línea útil de un texto (para mostrar el encabezado detectado).
     */
    protected function primeraLinea(string $texto): string
    {
        foreach (preg_split('/\R/u', $texto) ?: [] as $linea) {
            $linea = trim($linea);
            if ($linea !== '') {
                return mb_substr($linea, 0, 90);
            }
        }

        return mb_substr(trim($texto), 0, 90);
    }

    /**
     * Copia verbatim el nombre del destinatario del memo.
     *
     * Estrategia (siempre con el modelo único IA_MODEL, ej. qwen2.5-vl-7b):
     *   1. Mitad superior (recortes c1_1 + c1_2 juntos): el bloque destinatario
     *      suele estar arriba. Si la lectura coincide con el nombre registrado,
     *      se acepta de inmediato (sin gastar más consultas).
     *   2. Si leyó algo pero NO coincide, reintenta con la página completa y
     *      luego con la mitad inferior; se queda la mejor lectura.
     * NUNCA se pasa el nombre registrado en el prompt.
     */
    protected function consultarDestinatario(array $paginas, array &$contenidos, string $nombreEsperado = ''): array
    {
        $grupos = $this->agruparPrimeraPagina($paginas);

        $modeloNombre = $this->modeloParaNombre($paginas);
        $texto = 'En esta imagen hay un MEMORÁNDUM institucional de la Policía Boliviana '
            . '(escaneado o fotografiado; puede estar rotado). Busca el bloque del DESTINATARIO que '
            . 'empieza después de "Al Señor(a):" o "A la Señora:" y termina antes de "Presente.-". '
            . 'Copia EXACTAMENTE el NOMBRE COMPLETO de la persona destinataria (nombres y apellidos), '
            . 'sin grados militares (como "Sof.", "Sgto.", "Cnl.", "2do"), sin cargos ni '
            . 'dependencias. Si hay varias líneas, copia solo la que contiene el nombre de la persona. '
            . 'Si no puedes leerla, responde {"destinatario": null}. '
            . 'Respuesta SOLO con JSON válido: {"destinatario": "<nombre copiado>"}.';

        // Sin modelo disponible: último intento con la mitad inferior.
        if ($modeloNombre === null) {
            $lecturaBaja = $this->intentarMitadInferior($grupos, $texto, $nombreEsperado, $contenidos);
            return ['destinatario' => $lecturaBaja];
        }

        $timeoutBase = max(90, (int) config('ia.timeout_fallback', 120));
        $primeraLectura = null;

        // 1) PÁGINA COMPLETA: una sola consulta con la vista completa. Con el
        //    7B suele bastar para leer el bloque destinatario y es la consulta
        //    MÁS RÁPIDA (1 imagen, sin recortes). Si la lectura coincide con el
        //    nombre registrado, se acepta de inmediato sin más consultas.
        $full = $grupos['full'][0] ?? null;
        if ($full !== null) {
            try {
                $contenido = $this->consultar([$full], $texto, $modeloNombre, $timeoutBase);
                $contenidos[] = '[destinatario/full] ' . $contenido;
                $destinatario = $this->extraerDestinatario($contenido);
                if ($destinatario !== null) {
                    if ($nombreEsperado === '' || $this->coinciden($nombreEsperado, [$destinatario])) {
                        return ['destinatario' => $destinatario];
                    }
                    // Leyó algo pero no coincide: se guarda y se compara con la
                    // lectura de la mitad inferior.
                    $primeraLectura = $destinatario;
                }
            } catch (\Throwable) {
                // se intenta con los recortes
            }
        }

        // 2) MITAD INFERIOR (c21 + c22): el bloque destinatario a veces cae
        //    por debajo del centro de la hoja.
        $lecturaBaja = $this->intentarMitadInferior($grupos, $texto, $nombreEsperado, $contenidos);
        if ($lecturaBaja !== null) {
            if ($primeraLectura === null || $this->esMejorLectura($lecturaBaja, $primeraLectura, $nombreEsperado)) {
                return ['destinatario' => $lecturaBaja];
            }
            return ['destinatario' => $primeraLectura];
        }

        // 3) Último recurso: MITAD SUPERIOR (c11 + c12) solo si la página
        //    completa no leyó nada.
        if ($primeraLectura === null) {
            $imagenes = array_values(array_filter(array_merge($grupos['c11'], $grupos['c12'])));
            if (count($imagenes) > 0) {
                try {
                    $contenido = $this->consultar($imagenes, $texto, $modeloNombre, $timeoutBase);
                    $contenidos[] = '[destinatario/mitad_superior] ' . $contenido;
                    $destinatario = $this->extraerDestinatario($contenido);
                    if ($destinatario !== null) {
                        return ['destinatario' => $destinatario];
                    }
                } catch (\Throwable) {
                    // sin lectura
                }
            }
        }

        return ['destinatario' => $primeraLectura];
    }

    /**
     * Último intento: mitad inferior de la página (los memos escaneados a veces
     * traen el bloque destinatario por debajo del centro). Devuelve la lectura
     * válida o null.
     */
    protected function intentarMitadInferior(array $grupos, string $texto, string $nombreEsperado, array &$contenidos): ?string
    {
        $imagenes = array_values(array_filter(array_merge($grupos['c21'], $grupos['c22'])));
        if (count($imagenes) === 0) {
            return null;
        }

        try {
            $contenido = $this->consultar($imagenes, $texto);
            $contenidos[] = "[destinatario/mitad_inferior] " . $contenido;
            $destinatario = $this->extraerDestinatario($contenido);
            if ($destinatario !== null) {
                if ($nombreEsperado === '' || $this->coinciden($nombreEsperado, [$destinatario])) {
                    return $destinatario;
                }
                return $destinatario; // lectura no coincidente: la decide analizar()
            }
        } catch (\Throwable) {
            // sin lectura
        }

        return null;
    }

    /**
     * Decide si $nueva es mejor candidato que $actual para ser la lectura del
     * destinatario.
     *
     * Criterios:
     *   - Si el nombre esperado coincide con $nueva y no con $actual, gana $nueva.
     *   - Si $nueva tiene más palabras que $actual, es más probable que sea el
     *     nombre completo (el 2B a veces devuelve solo un nombre corto).
     *   - Si $actual parece alucinación (muy corto, o palabras sospechosas),
     *     gana $nueva si tiene aspecto de nombre.
     */
    protected function esMejorLectura(string $nueva, string $actual, string $nombreEsperado): bool
    {
        if ($this->coinciden($nombreEsperado, [$nueva]) && !$this->coinciden($nombreEsperado, [$actual])) {
            return true;
        }

        $palabrasNueva = count(preg_split('/\s+/', trim($nueva)) ?: []);
        $palabrasActual = count(preg_split('/\s+/', trim($actual)) ?: []);
        if ($palabrasNueva > $palabrasActual) {
            return true;
        }

        // Si el actual parece placeholder o texto del prompt, la nueva gana.
        $bajoActual = mb_strtolower($actual, 'UTF-8');
        if (str_contains($bajoActual, 'texto copiado') || str_contains($bajoActual, '<nombre copiado>') || str_contains($bajoActual, 'destinatario')) {
            return true;
        }

        return false;
    }

    /**
     * Extrae el destinatario de la respuesta cruda de la IA, descartando
     * respuestas sospechosas (placeholder copiado del prompt, "null" literal,
     * texto narrativo, nombres de campos, etc.).
     */
    protected function extraerDestinatario(string $contenido): ?string
    {
        $json = $this->extraerJson($contenido);
        $candidato = $json['destinatario'] ?? null;
        if ($candidato === null || !is_string($candidato)) {
            return null;
        }

        $candidato = trim($candidato);
        if ($candidato === '') {
            return null;
        }

        // Respuestas que revelan que la IA no leyó (copió el ejemplo o narró).
        $sospechoso = [
            'texto copiado', 'nombre copiado', 'destinatario', 'la persona', 'no se puede',
            'no puedo', 'no se encuentra', 'no se encontro', 'no hay', 'null', 'ninguno',
            'no legible', 'ilegible', 'desconocido', 'no aplica', 'n/a', 'nadie',
            'no identific', 'no logro', 'no pude', 'no pudo', 'imposible', 'sin datos',
        ];
        $bajo = mb_strtolower($candidato, 'UTF-8');
        foreach ($sospechoso as $s) {
            if (str_contains($bajo, $s)) {
                return null;
            }
        }

        // Debe parecer un nombre: al menos 2 palabras y al menos una letra mayúscula
        // (o ser todo mayúsculas como suele aparecer en los memos).
        if (preg_match('/[A-ZÁÉÍÓÚÑ]/u', $candidato) !== 1 && mb_strtoupper($candidato, 'UTF-8') !== $candidato) {
            return null;
        }
        $palabras = preg_split('/\s+/', trim($candidato)) ?: [];
        if (count($palabras) < 2) {
            return null;
        }

        return $candidato;
    }

    /**
     * Separa las imágenes de la primera página por cuadrantes.
     *
     * @return array{full:array,c11:array,c12:array,c21:array,c22:array}
     */
    protected function agruparPrimeraPagina(array $paginas): array
    {
        $grupos = ['full' => [], 'c11' => [], 'c12' => [], 'c21' => [], 'c22' => []];
        $prefijo = 'pagina_1';

        foreach ($paginas as $pagina) {
            $nombre = (string) ($pagina['archivo'] ?? '');
            if (str_starts_with($nombre, $prefijo . '_c')) {
                // "pagina_1_c1_1.png" → "11", "pagina_1_c1_2.png" → "12", ...
                $clave = substr($nombre, strlen($prefijo) + 2); // "1_1.png"
                $clave = str_replace(['_1.png', '_2.png', '.png'], ['1', '2', ''], $clave);
                $clave = str_replace('_', '', $clave);
                if (isset($grupos['c' . $clave])) {
                    $grupos['c' . $clave][] = $pagina['data_url'];
                }
            } elseif (str_starts_with($nombre, $prefijo . '.png')) {
                $grupos['full'][] = $pagina['data_url'];
            }
        }

        return $grupos;
    }

    /**
     * Consultas individuales (una imagen por consulta) de firma y sello en los
     * cuatro cuadrantes; el resultado se combina con OR.
     *
     * @return array{0: bool, 1: bool}
     */
    protected function consultarFirmaSello(array $paginas, array &$contenidos): array
    {
        $grupos = $this->agruparPrimeraPagina($paginas);

        $texto = 'Recorte ampliado de un memorándum. Responde SOLO con JSON válido y sin texto adicional: '
            . '{"firma": true si hay una FIRMA manuscrita (rúbrica de tinta) sobre o junto al nombre '
            . 'impreso de la autoridad, false si no, y "sello": true si hay un SELLO/timbre institucional '
            . 'circular de tinta morada/azul/roja, false si no}. Escribe ambos campos en un único objeto.';

        $firma = false;
        $sello = false;

        $procesar = function (array $imagenes, string $etiqueta) use (&$firma, &$sello, $texto, &$contenidos): void {
            $imagen = $imagenes[0] ?? null;
            if (!$imagen) {
                return;
            }
            try {
                $contenido = $this->consultar([$imagen], $texto);
                $contenidos[] = "[{$etiqueta}] " . $contenido;
                $json = $this->extraerJson($contenido);
                if ($json !== null) {
                    if (!empty($json['firma'])) {
                        $firma = true;
                    }
                    if (!empty($json['sello'])) {
                        $sello = true;
                    }
                }
            } catch (\Throwable) {
                // una imagen que falle no debe tumbar la verificación
            }
        };

        // 1) PÁGINA COMPLETA: 1 consulta. La firma y el sello son elementos
        //    grandes; el 7B los detecta en la vista completa la mayoría de las
        //    veces. (Antes se consultaba cuadrante por cuadrante: hasta 4.)
        $procesar($grupos['full'], 'firma_sello/full');

        // 2) Solo si falta algo: mitad inferior (c21 + c22), donde suelen
        //    estar la firma y el sello.
        foreach (['c21' => $grupos['c21'], 'c22' => $grupos['c22']] as $clave => $imagenes) {
            if ($firma && $sello) {
                break;
            }
            $procesar($imagenes, $clave);
        }

        // 3) Último recurso: mitad superior (c11 + c12).
        if (!($firma && $sello)) {
            foreach (['c11' => $grupos['c11'], 'c12' => $grupos['c12']] as $clave => $imagenes) {
                if ($firma && $sello) {
                    break;
                }
                $procesar($imagenes, $clave);
            }
        }

        return [$firma, $sello];
    }

    /**
     * Envía una consulta multimodal a LM Studio y devuelve el contenido textual.
     *
     * Espera al modelo sin un corte de duración por defecto. La conexión a
     * un servicio apagado sigue fallando rápidamente. El modo acotado es opcional.
     *
     * @param  array<int, string>  $dataUrls
     * @param  int|null  $maxTokens  Tope de tokens de salida (acota la latencia).
     */
    protected function consultar(
        array $dataUrls,
        string $texto,
        ?string $modelo = null,
        ?int $timeout = null,
        ?int $maxTokens = null
    ): string {
        $input = [['type' => 'text', 'content' => $texto]];
        foreach ($dataUrls as $dataUrl) {
            $input[] = ['type' => 'image', 'data_url' => $dataUrl];
        }

        $endpoint = $this->url() . '/' . ltrim((string) config('ia.endpoint', '/api/v1/chat'), '/');

        $candidatos = $this->modelosCandidatos($modelo);
        if (count($candidatos) === 0) {
            throw new RuntimeException(
                'No hay modelos de IA configurados. Defina IA_MODEL (recomendado: qwen/qwen2.5-vl-3b) ' .
                'e IA_MODEL_RAPIDO en el archivo .env.'
            );
        }

        // Si un modelo no carga en LM Studio (p. ej. "Failed to load model",
        // exitCode=3221225775 por un runtime corrupto), se prueba el siguiente
        // en vez de devolver el fallo al usuario que está subiendo el memo.
        $intentos = [];

        foreach ($candidatos as $candidato) {
            // Se reservan 300 ms para armar y devolver la respuesta HTTP: sin
            // esta reserva el cliente corta justo cuando el modelo termina.
            $tope = config('ia.esperar_sin_limite', true) ? 0 : min(
                $timeout ?? (int) config('ia.timeout', 240),
                (int) config('ia.timeout_maximo', 300),
                $this->restante() - 0.3 - $this->reservaSeg
            );
            if ($tope !== 0 && $tope < 0.5) {
                throw new RuntimeException(sprintf(
                    'La revisión agotó su tope de seguridad de %d s sin respuesta del modelo. '
                    . 'Cargue el modelo en la GPU (LM Studio → GPU Offload) o revise IA_URL.',
                    (int) config('ia.presupuesto', 300)
                ));
            }

            $cuerpo = [
                'model' => $candidato,
                'temperature' => 0,
                'store' => false,
                'input' => $input,
            ];
            if ($maxTokens !== null && $maxTokens > 0) {
                // Nombres de campo aceptados por LM Studio (REST v1 y compat. OpenAI).
                $cuerpo['max_output_tokens'] = $maxTokens;
            }

            $inicio = microtime(true);

            try {
                $response = Http::timeout($tope)
                    // Detectar un servicio apagado no limita una inferencia activa.
                    ->connectTimeout(2)
                    ->asJson()
                    ->post($endpoint, $cuerpo);
            } catch (\Throwable $e) {
                $this->registrarConsulta(count($dataUrls), $candidato, microtime(true) - $inicio, 'error');
                throw new RuntimeException('No se pudo contactar a la IA local (' . $this->url() . '): ' . $e->getMessage());
            }

            $duracion = microtime(true) - $inicio;

            if ($response->successful()) {
                $this->registrarConsulta(count($dataUrls), $candidato, $duracion, 'ok');
                $this->modeloActivo = $candidato;
                $this->marcarModelo($candidato, false);

                $output = $response->json('output');
                $contenido = '';
                if (is_array($output)) {
                    foreach ($output as $bloque) {
                        if (is_array($bloque) && ($bloque['type'] ?? null) === 'message' && isset($bloque['content'])) {
                            $contenido .= $bloque['content'];
                        }
                    }
                }

                return $this->aUtf8(trim((string) $contenido));
            }

            $detalle = $response->json('error.message') ?? $response->json('error') ?? $response->body();
            $detalle = is_string($detalle) ? $detalle : (string) json_encode($detalle);
            $this->registrarConsulta(count($dataUrls), $candidato, $duracion, 'http_' . $response->status());
            $intentos[] = $candidato . ' (HTTP ' . $response->status() . ')';

            if (!$this->esErrorDeModelo($detalle, $response->status())) {
                throw new RuntimeException(
                    'La IA local respondió con error HTTP ' . $response->status() . ': ' . mb_substr($detalle, 0, 300)
                );
            }

            Log::warning(sprintf(
                '[VerificadorIA] el modelo %s no se pudo cargar (%s); se intenta el siguiente candidato.',
                $candidato,
                mb_substr($detalle, 0, 200)
            ));
            $this->marcarModelo($candidato, true);
        }

        throw new RuntimeException($this->mensajeSinModelo($intentos));
    }

    /**
     * ¿El modelo está marcado como roto (no cargó en los últimos minutos)?
     */
    protected function modeloMarcadoRoto(string $modelo): bool
    {
        try {
            return Cache::has('ia:modelo_roto:' . $modelo);
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * Marca/desmarca un modelo como no cargable (10 minutos).
     */
    protected function marcarModelo(string $modelo, bool $roto): void
    {
        try {
            if ($roto) {
                Cache::put('ia:modelo_roto:' . $modelo, true, now()->addMinutes(10));
            } else {
                Cache::forget('ia:modelo_roto:' . $modelo);
            }
        } catch (\Throwable) {
            // el cache es una optimización: si falla, no afecta la verificación
        }
    }

    /**
     * Garantiza UTF-8 válido en el texto que devuelve el modelo. Los modelos
     * pequeños a veces emiten bytes sueltos (p. ej. 0xE9) y eso rompía el
     * json_encode de la respuesta al navegador ("Malformed UTF-8 characters").
     */
    protected function aUtf8(string $texto): string
    {
        if ($texto === '' || mb_check_encoding($texto, 'UTF-8')) {
            return $texto;
        }

        return (string) mb_convert_encoding($texto, 'UTF-8', 'UTF-8');
    }

    /**
     * ¿El error del servidor es de CARGA de modelo (reintentable con otro)?
     */
    protected function esErrorDeModelo(string $detalle, int $status): bool
    {
        $bajo = mb_strtolower($detalle, 'UTF-8');
        $claves = [
            'failed to load model', 'fail to load model', 'model not found', 'no models loaded',
            'model_not_found', 'exited before becoming healthy', 'exitcode=', 'failed to load',
            'unable to load model', 'model load',
        ];
        foreach ($claves as $clave) {
            if (str_contains($bajo, $clave)) {
                return true;
            }
        }

        return in_array($status, [400, 404, 503], true) && str_contains($bajo, 'model');
    }

    /**
     * Mensaje de error accionable cuando NINGÚN modelo pudo cargar.
     *
     * @param  array<int, string>  $intentos
     */
    protected function mensajeSinModelo(array $intentos): string
    {
        $disponibles = $this->modelosDisponibles(true);
        $lista = count($disponibles) > 0
            ? implode(', ', $disponibles)
            : 'ninguno (¿está LM Studio con el servidor iniciado en ' . $this->url() . '?)';

        return 'La IA local no pudo cargar ningún modelo de visión. Intentos: ' . implode(', ', $intentos)
            . '. Modelos disponibles en LM Studio: ' . $lista . '. '
            . 'El código exitCode=3221225775 significa que el motor (llama-server) no arranca: ' .
            'suele ser un runtime corrupto de LM Studio. Abra una terminal y ejecute "php artisan ia:diagnostico"; ' .
            'en LM Studio, vuelva a descargar el runtime (Settings → Runtime) o elija otra versión, ' .
            'y confirme que IA_MODEL/IA_MODEL_RAPIDO coincidan con los IDs descargados.';
    }

    /**
     * Registra una consulta individual a la IA en el log (para auditar cuántas
     * consultas hace cada verificación y cuánto tarda cada una).
     */
    protected function registrarConsulta(int $nImagenes, ?string $modelo, float $duracion, string $estado = 'ok'): void
    {
        $this->consultas[] = [
            'imagenes' => $nImagenes,
            'modelo' => $modelo ?: (string) config('ia.model'),
            'duracion' => round($duracion, 1),
            'estado' => $estado,
        ];

        Log::info(sprintf(
            '[VerificadorIA] consulta #%d: %d imagen(es), modelo %s, %s → %.1f s',
            count($this->consultas),
            $nImagenes,
            $modelo ?: (string) config('ia.model'),
            $estado,
            $duracion
        ));
    }

    /**
     * Registra el resumen de una verificación completa (flujo + nº de consultas
     * + duración total) para saber de un vistazo cuánto costó cada proceso.
     */
    protected function registrarResumen(string $flujo): void
    {
        $total = count($this->consultas);
        $duracion = array_sum(array_column($this->consultas, 'duracion'));
        $imagenes = array_sum(array_column($this->consultas, 'imagenes'));

        Log::info(sprintf(
            '[VerificadorIA] RESUMEN %s: %d consulta(s), %d imagen(es) enviadas, duración total %.1f s',
            $flujo,
            $total,
            $imagenes,
            $duracion
        ));

        $this->consultas = [];
    }

    /**
     * Extrae el primer objeto JSON de una cadena (tolerante a código fence).
     */
    protected function extraerJson(string $texto): ?array
    {
        $texto = trim($texto);
        $texto = preg_replace('/^```(?:json)?/i', '', $texto);
        $texto = preg_replace('/```$/', '', $texto);
        $texto = trim((string) $texto);

        $inicio = strpos($texto, '{');
        if ($inicio === false) {
            return null;
        }
        $texto = substr($texto, $inicio);

        $decodificado = json_decode($texto, true);
        if (is_array($decodificado)) {
            return $decodificado;
        }

        // Equilibrio de llaves (fallback)
        $profundidad = 0;
        $fin = null;
        for ($i = 0; $i < strlen($texto); $i++) {
            if ($texto[$i] === '{') {
                $profundidad++;
            } elseif ($texto[$i] === '}') {
                $profundidad--;
                if ($profundidad === 0) {
                    $fin = $i + 1;
                    break;
                }
            }
        }
        if ($fin !== null) {
            $decodificado = json_decode(substr($texto, 0, $fin), true);
            if (is_array($decodificado)) {
                return $decodificado;
            }
        }

        return null;
    }

    /**
     * Normaliza la respuesta a la estructura interna y aplica las reglas de
     * negocio (advertencias de identidad, firma y sello). La identidad ya fue
     * decidida localmente en analizar(); aquí solo se cubren los casos límite.
     */
    protected function normalizar(array $raw, array $esperado = [], string $respuestaCruda = ''): array
    {
        $firma = $raw['firma'] ?? $raw['tiene_firma'] ?? false;
        $sello = $raw['sello'] ?? $raw['tiene_sello'] ?? false;

        $destinatario = $raw['destinatario'] ?? null;
        $nombres = $this->nombresLimpiosDe($raw);

        $coincide = $raw['coincide'] ?? $raw['coincidencia_nombre'] ?? null;
        $mensaje = $raw['mensaje'] ?? null;

        $esperadoCompleto = trim(($esperado['nombres'] ?? '') . ' ' . ($esperado['apellidos'] ?? ''));
        $identidadLegible = count($nombres) > 0;

        // Caso límite: no se pudo leer el destinatario del memo → no se puede
        // confirmar la identidad; advertencia para revisión manual (nunca se
        // activa una cuenta sin poder vincularla al memo).
        if ($coincide === null && $esperadoCompleto !== '' && !$identidadLegible) {
            $coincide = false;
        }

        // Mensajes de advertencia acumulativos (identidad, firma y sello).
        $advertencias = [];
        if ($coincide === false) {
            if ($esperadoCompleto !== '' && !$identidadLegible) {
                $advertencias[] = sprintf(
                    'ADVERTENCIA DE IDENTIDAD: no se pudo leer el nombre del destinatario del memo '
                    . '(bloque "Al Señor(a):"), por lo que no se puede confirmar que %s sea la persona '
                    . 'designada. Revisar el documento adjunto antes de aprobar.',
                    $esperadoCompleto
                );
            } else {
                $detectados = $identidadLegible ? implode(', ', $nombres) : 'sin nombres legibles';
                $advertencias[] = sprintf(
                    'ADVERTENCIA DE IDENTIDAD: la persona registrada (%s) NO tiene relación con el/los '
                    . 'nombre(s) del memo de designación (%s).',
                    $esperadoCompleto !== '' ? $esperadoCompleto : 'registro',
                    $detectados
                );
            }
        }
        if (!$firma) {
            $advertencias[] = 'No se detectó la FIRMA en el memo de designación.';
        }
        if (!$sello) {
            $advertencias[] = 'No se detectó el SELLO institucional en el memo de designación.';
        }

        $mensaje = count($advertencias) > 0
            ? implode(' ', $advertencias)
            : ($mensaje ?: 'Documento verificado correctamente: firma y sello detectados e identidad coherente con el memo.');

        return [
            'firma' => (bool) $firma,
            'sello' => (bool) $sello,
            'nombres' => $nombres,
            'destinatario' => is_string($destinatario) && trim($destinatario) !== ''
                ? $this->limpiarNombre($destinatario)
                : null,
            'autoridad' => null,
            'coincide' => $coincide,
            'descartado' => false,
            'mensaje' => $mensaje,
            'raw' => ['respuesta_ia' => $respuestaCruda, 'datos' => $raw],
        ];
    }

    /**
     * Devuelve los nombres detectados ya limpios (sin grados ni cargos).
     */
    protected function nombresLimpiosDe(array $raw): array
    {
        $destinatario = $raw['destinatario'] ?? $raw['destinatario_nombre']
            ?? $raw['designado'] ?? $raw['designada'] ?? $raw['persona'] ?? null;
        $nombres = $raw['nombres'] ?? $raw['nombres_detectados'] ?? $raw['personas'] ?? [];
        if (is_string($nombres)) {
            $nombres = preg_split('/[,;|\n]+/', $nombres) ?: [];
        }
        $nombres = array_values(array_filter(array_map('trim', (array) $nombres)));
        if ($destinatario !== null && trim((string) $destinatario) !== '') {
            array_unshift($nombres, trim((string) $destinatario));
        }

        return array_values(array_filter(array_map(
            fn ($n) => $this->limpiarNombre((string) $n),
            $nombres
        ), fn ($n) => $n !== ''));
    }

    /**
     * Elimina grados militares (Sgt., Cnl., 2do., ...), cargos y palabras de
     * relleno de un nombre detectado para quedarse solo con nombres/apellidos.
     */
    protected function limpiarNombre(string $nombre): string
    {
        $nombre = trim($nombre);
        if ($nombre === '') {
            return '';
        }

        $desacentuar = function (string $s): string {
            return str_replace(
                ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', 'Á', 'É', 'Í', 'Ó', 'Ú', 'Ü', 'Ñ'],
                ['a', 'e', 'i', 'o', 'u', 'u', 'n', 'A', 'E', 'I', 'O', 'U', 'U', 'N'],
                $s
            );
        };

        $stop = [
            // grados y jerarquía policial/militar
            'sgt', 'sgto', 'sarg', 'sargento', 'cbo', 'cabo', 'cnl', 'coronel', 'tcnl',
            'teniente', 'cap', 'capitan', 'capitán', 'tte', 'sbtte', 'subtte', 'subteniente',
            'gral', 'general', 'mgr', 'msc', 'magister', 'dr', 'dra', 'lic', 'licenciado',
            'cad', 'cadete', 'oficial', 'suboficial', 'sof', 'sdo', 'alumno', 'egresado',
            '2do', '2°', '1ro', '1er', '1°', '3ro', '4to', '5to', '6to', '7mo', '8vo', '9no',
            // fórmulas de tratamiento
            'sr', 'sra', 'srta', 'senor', 'senora', 'senorita', 'usted', 'presente',
            // cargos e institucionales que a veces se cuelan
            'seguridad', 'interna', 'custodio', 'custodios', 'encargada', 'encargado',
            'centro', 'orientacion', 'femenina', 'obrajes', 'direccion', 'subdireccion',
            'nacional', 'regimen', 'penitenciario', 'policia', 'boliviana', 'designacion',
            // dependencias / secciones que aparecen junto al destinatario
            'seg', 'seccion', 'sección', 'externa', 'externo', 'miraflores', 'cpf', 'c.p.f.',
            'kardex', 'filiacion', 'division', 'custodia', 'privada', 'libertad',
            'agente', 'agentes', 'servicio', 'servicios', 'unidad', 'unidades', 'epi', 'eps',
            'destacamento', 'brigada', 'comando', 'departamental', 'regional', 'nivel', 'central',
            'cuartel', 'prefectura', 'oficina', 'oficinas', 'jefatura', 'subjefatura', 'mando',
            'personal', 'administrativo', 'administrativa', 'plantel', 'tropa', 'clase', 'clases',
            // conectores
            'de', 'del', 'la', 'el', 'los', 'las', 'y', 'a', 'en', 'por', 'para', 'al', 'con', 'su',
        ];
        $stop = array_map($desacentuar, $stop);
        $stopSet = array_flip($stop);

        $tokens = preg_split('/\s+/', $desacentuar($nombre)) ?: [];
        $limpios = [];
        foreach ($tokens as $tok) {
            $tok = trim($tok, " .,;:()/-\t");
            if ($tok === '') {
                continue;
            }
            $tokLimpio = trim($tok, ".,;:()/-");
            if ($tokLimpio === '') {
                continue;
            }
            $base = mb_strtolower($tokLimpio, 'UTF-8');
            if (isset($stopSet[$base])) {
                continue;
            }
            if (preg_match('/^[0-9]+$/', $tokLimpio)) {
                continue;
            }
            $limpios[] = $tokLimpio;
        }

        return implode(' ', $limpios);
    }

    /**
     * Comparación aproximada (sin tildes, sin mayúsculas) entre el nombre
     * esperado y los nombres copiados del memo.
     *
     * Coincide si:
     *   - TODO el nombre registrado aparece en el memo (token por token), o
     *   - el nombre registrado normalizado es subcadena del texto detectado, o
     *   - comparte al menos 2 palabras (no basta un apellido común: "José Carlos
     *     Mamani Flores" vs "Alejandro Quispe Mamani" NO coincide).
     *
     * Además tolera errores de OCR del modelo pequeño (ej. "Estel" ≈ "Estela")
     * usando similar_text con umbral alto por token.
     */
    protected function coinciden(string $esperado, array $detectados): bool
    {
        $normalizar = function (string $s): string {
            $s = mb_strtolower($s, 'UTF-8');
            $s = str_replace(
                ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', 'ä', 'ë', 'ï', 'ö', 'à', 'è', 'ì', 'ò', 'ù'],
                ['a', 'e', 'i', 'o', 'u', 'u', 'n', 'a', 'e', 'i', 'o', 'a', 'e', 'i', 'o', 'u'],
                $s
            );

            return trim((string) preg_replace('/[^a-z0-9 ]/', ' ', $s));
        };

        $esperadoNormalizado = $normalizar($esperado);
        $tokEsperado = preg_split('/\s+/', $esperadoNormalizado, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $tokEsperado = array_values(array_filter($tokEsperado, fn ($t) => mb_strlen($t) >= 3));
        if (count($tokEsperado) === 0) {
            return false;
        }

        // Unión de todos los tokens copiados del memo + texto completo normalizado.
        $unionDetectada = [];
        $textoDetectadoCompleto = '';
        foreach ($detectados as $detectado) {
            $normalizado = $normalizar((string) $detectado);
            $textoDetectadoCompleto .= ' ' . $normalizado;
            $toks = preg_split('/\s+/', $normalizado, -1, PREG_SPLIT_NO_EMPTY) ?: [];
            foreach ($toks as $t) {
                if (mb_strlen($t) >= 3) {
                    $unionDetectada[$t] = true;
                }
            }
        }

        // Subcadena: el nombre registrado completo aparece literalmente en el memo.
        if ($esperadoNormalizado !== '' && str_contains(trim($textoDetectadoCompleto), $esperadoNormalizado)) {
            return true;
        }

        $unionDetectada = array_keys($unionDetectada);

        $todosPresentes = true;
        $compartidas = 0;
        foreach ($tokEsperado as $t) {
            if ($this->tokenCoincide($t, $unionDetectada)) {
                $compartidas++;
            } else {
                $todosPresentes = false;
            }
        }

        return $todosPresentes || $compartidas >= 2;
    }

    /**
     * Compara un token esperado contra la lista de tokens detectados,
     * permitiendo errores de OCR leves (1-2 letras) vía similar_text.
     */
    protected function tokenCoincide(string $token, array $detectados): bool
    {
        if (in_array($token, $detectados, true)) {
            return true;
        }

        foreach ($detectados as $d) {
            if (mb_strlen($d) < 4 || mb_strlen($token) < 4) {
                continue;
            }
            similar_text($token, $d, $porcentaje);
            // Umbral alto: "estel" vs "estela" (~91%) sí; "mamani" vs "flores" no.
            if ($porcentaje >= 88) {
                return true;
            }
        }

        return false;
    }

    /**
     * REVISIÓN RÁPIDA en vivo (para el módulo "Subir Documento").
     *
     * A diferencia del pipeline completo (hasta 7 consultas: destinatario con
     * reintentos + firma/sello por cuadrante), aquí se hace UNA SOLA consulta
     * de visión sobre la primera página a baja resolución (IA_DPI_RAPIDO),
     * pidiendo TODO en un único JSON: es_memo, tipo, destinatario, fecha,
     * firma y sello. Esto baja la revisión de ~90 segundos a ~10-25 segundos.
     *
     * @param  string  $rutaAbsoluta  Ruta absoluta al PDF en storage.
     * @param  array   $contexto      ['tipo_esperado' => ..., 'oficial_esperado' => ...]
     * @return array{ia_disponible:bool,es_memo:bool,tipo_detectado:?string,tipo_esperado:?string,coincide_tipo:?bool,destinatario:?string,coincide_oficial:?bool,fecha_documento:?string,firma:bool,sello:bool,resumen:?string,alertas:array,advertencias:array,tiempo_seg:float}
     */
    /**
     * Solo evidencia extraída del archivo; las comparaciones con el formulario
     * y las autorizaciones se realizan nuevamente en cada petición.
     */
    protected function claveEvidencia(string $hashArchivo): string
    {
        return 'ia:evidencia:v1:'.hash('sha256', json_encode([
            $hashArchivo,
            auth()->id(), auth()->user()?->id_epi,
            $this->url(), config('ia.endpoint'), config('ia.model'), config('ia.modelos'),
            config('ia.dpi'), config('ia.max_lado'), config('ia.max_tokens'),
            config('ia.gate_memo'), config('ia.gate_vision'), self::PROMPT_DOCUMENTO,
        ]));
    }

    protected function evidenciaRapida(string $rutaAbsoluta, bool $forzar): array
    {
        $vigencia = max(0, (int) config('ia.cache_lectura_segundos', 900));
        $clave = $this->claveEvidencia(hash_file('sha256', $rutaAbsoluta));
        if ($vigencia > 0 && !$forzar) {
            try {
                $guardada = Cache::get($clave);
                if (is_array($guardada) && isset($guardada['json'], $guardada['encabezado'])) {
                    Log::info('[VerificadorIA] Evidencia del mismo archivo reutilizada; se recalculan las comparaciones.');
                    return $guardada;
                }
            } catch (\Throwable) { /* Un fallo de caché nunca sustituye la lectura. */ }
        }

        $encabezado = $this->verificarEncabezado($rutaAbsoluta);
        if ($encabezado['es_memo'] === false) {
            return ['encabezado' => $encabezado];
        }
        $imagen = $this->imagenPaginaUno($rutaAbsoluta);
        if ($imagen === null) {
            throw new RuntimeException('No se obtuvo la imagen de la primera página del PDF.');
        }
        $json = $this->leerDocumento($imagen);
        $firma = $this->booleano($json['firma'] ?? false);
        $sello = $this->booleano($json['sello'] ?? false);
        if ($this->detectarSello($imagen) === true) $sello = true;
        $firmaSinVerificar = false;
        if (!$firma && $this->booleano($json['es_memo'] ?? false)) {
            $confirmada = $this->confirmarFirma($imagen);
            if ($confirmada === null) $firmaSinVerificar = true;
            else $firma = $confirmada;
        }
        $evidencia = compact('encabezado', 'json', 'firma', 'sello', 'firmaSinVerificar');
        // No memorizar fallos, respuestas parciales ni resultados de otro modelo.
        $completa = count(array_intersect(['es_memo','tipo','destinatario','fecha','firma','sello'], array_keys($json))) === 6
            && is_bool($json['es_memo']) && is_bool($json['firma']) && is_bool($json['sello']);
        if ($vigencia > 0 && $completa && !$firmaSinVerificar && $this->modeloActivo === config('ia.model')) {
            try { Cache::put($clave, $evidencia, now()->addSeconds($vigencia)); }
            catch (\Throwable) { /* Se devuelve el resultado real aunque falle la caché. */ }
        }
        return $evidencia;
    }

    public function revisarRapido(string $rutaAbsoluta, array $contexto = []): array
    {
        if (!$this->disponible()) {
            throw new RuntimeException(
                'La IA local no está configurada. Defina IA_URL e IA_MODEL en el archivo .env (ej. http://127.0.0.1:1234 y qwen/qwen2.5-vl-3b).'
            );
        }

        $inicio = microtime(true);
        $tipoEsperadoTemprano = trim((string) ($contexto['tipo_esperado'] ?? ''));

        // Sin corte de duración por defecto; conserva el modo acotado opcional.
        $this->iniciarPresupuesto((float) config('ia.presupuesto', 300));
        // La lectura completa no puede comerse el tiempo de la firma.
        $this->reservaSeg = 2.0;

        // 0. DESCARTE TEMPRANO POR ENCABEZADO: un memorándum institucional
        //    empieza con el título "MEMORÁNDUM". Si no está, el archivo se
        //    descarta de inmediato y NO se hace la revisión completa.
        //    Con PDFs que tienen capa de texto esto cuesta CERO consultas.
        $lectura = $this->evidenciaRapida($rutaAbsoluta, !empty($contexto['forzar_revision']));
        return $this->compararLectura($lectura, $contexto, $inicio);
    }

    /** El controlador verifica antes el propietario de la revisión anterior. */
    public function revisarEvidencia(string $hashArchivo, array $contexto = []): array
    {
        $inicio = microtime(true);
        abort_unless((int) config('ia.cache_lectura_segundos', 900) > 0, 410, 'Adjunte el PDF para revisarlo nuevamente.');
        $lectura = Cache::get($this->claveEvidencia($hashArchivo));
        abort_unless(is_array($lectura) && isset($lectura['json'], $lectura['encabezado']), 410,
            'La lectura anterior venció. Adjunte el PDF nuevamente para revisarlo.');
        Log::info('[VerificadorIA] Comparaciones actualizadas sin retransmitir el PDF.');
        return $this->compararLectura($lectura, $contexto, $inicio);
    }

    protected function compararLectura(array $lectura, array $contexto, float $inicio): array
    {
        $tipoEsperadoTemprano = trim((string) ($contexto['tipo_esperado'] ?? ''));
        $encabezado = $lectura['encabezado'];
        if ($encabezado['es_memo'] === false) {
            $this->registrarResumen('subir_documento/descarte');

            return [
                'ia_disponible' => true,
                'descartado' => true,
                'es_memo' => false,
                'encabezado' => $encabezado['encabezado'],
                'motivo_descarte' => 'El documento no empieza con el título MEMORÁNDUM'
                    . ($encabezado['encabezado'] ? ' (se leyó: "' . $encabezado['encabezado'] . '")' : '')
                    . '. No se revisó firma, sello ni destinatario.',
                'tipo_detectado' => null,
                'tipo_esperado' => $tipoEsperadoTemprano !== '' ? $tipoEsperadoTemprano : null,
                'coincide_tipo' => null,
                'destinatario' => null,
                'coincide_oficial' => null,
                'fecha_documento' => null,
                'firma' => false,
                'firma_verificada' => null,
                'sello' => false,
                'resumen' => null,
                'alertas' => [
                    'DOCUMENTO DESCARTADO: el archivo adjunto no es un memorándum (su encabezado no dice '
                    . '"MEMORÁNDUM"). Adjunte el memorándum correcto antes de registrar el trámite.',
                ],
                'advertencias' => [],
                'tiempo_seg' => round(microtime(true) - $inicio, 3),
            ];
        }

        $json = $lectura['json'];

        // 3. Normalizar campos.
        $esMemo = $this->booleano($json['es_memo'] ?? false);
        $tipoDetectado = is_string($json['tipo'] ?? null) ? trim((string) $json['tipo']) : '';
        $tipoEsperado = trim((string) ($contexto['tipo_esperado'] ?? ''));
        $oficialEsperado = trim((string) ($contexto['oficial_esperado'] ?? ''));
        $destinatario = is_string($json['destinatario'] ?? null) ? trim((string) $json['destinatario']) : '';
        $fechaDocumento = is_string($json['fecha'] ?? null) ? trim((string) $json['fecha']) : '';
        // Algunos modelos repiten el formato del prompt en vez de leer una fecha.
        // Una plantilla como dd/mm/aaaa no es evidencia documental.
        if (preg_match('/\b(?:dd|mm|aaaa|yyyy)\b/i', $fechaDocumento)) {
            $fechaDocumento = '';
        }
        $resumen = '';
        $firma = $lectura['firma'];
        $sello = $lectura['sello'];
        $firmaSinVerificar = $lectura['firmaSinVerificar'];

        // 3.b Sin lectura válida del modelo no se afirma nada: se avisa en rojo
        //     y se pide revisión manual (nunca un falso "documento conforme").
        if (count($json) === 0) {
            $this->registrarResumen('subir_documento/sin_lectura');

            return [
                'ia_disponible' => true,
                'descartado' => false,
                'es_memo' => false,
                'encabezado' => $encabezado['encabezado'] ?? null,
                'motivo_descarte' => null,
                'tipo_detectado' => null,
                'tipo_esperado' => $tipoEsperado !== '' ? $tipoEsperado : null,
                'coincide_tipo' => null,
                'destinatario' => null,
                'coincide_oficial' => null,
                'fecha_documento' => null,
                'firma' => false,
                'firma_verificada' => null,
                'sello' => false,
                'resumen' => null,
                'no_concluyente' => true,
                'alertas' => [
                    'La IA local no devolvió una lectura válida del documento. Revise el archivo manualmente antes de continuar.',
                ],
                'advertencias' => [],
                'tiempo_seg' => round(microtime(true) - $inicio, 3),
            ];
        }

        // 5. Comparaciones locales (la IA solo extrae; la decisión es nuestra).
        $coincideTipo = null;
        if ($tipoDetectado !== '' && $tipoEsperado !== '' && $esMemo) {
            $coincideTipo = $this->tiposCoinciden($tipoEsperado, $tipoDetectado);
        }

        $coincideOficial = null;
        if ($destinatario !== '' && $oficialEsperado !== '') {
            $limpio = $this->limpiarNombre($destinatario);
            $coincideOficial = $limpio !== '' && $this->coinciden($oficialEsperado, [$limpio]);
        }

        // 6. Alertas (bloquean envío) y advertencias (avisan).
        $alertas = [];
        $advertencias = [];

        if (!$esMemo) {
            $alertas[] = 'El sistema determinó que el documento NO es un memorándum institucional de la Policía Boliviana. Verifique el archivo adjunto.';
        } elseif ($coincideTipo === false) {
            $alertas[] = sprintf(
                'El documento parece ser del tipo "%s", que NO coincide con el tipo seleccionado ("%s").',
                $tipoDetectado,
                $tipoEsperado
            );
        } else {
            $aprobacion = 'El documento fue identificado como memorándum institucional';
            if ($tipoDetectado !== '') {
                $aprobacion .= ' (tipo: ' . $tipoDetectado . ')';
            }
            $advertencias[] = $aprobacion . '.';
        }

        if ($coincideOficial === false) {
            $advertencias[] = sprintf(
                'El destinatario del documento ("%s") no parece coincidir con el oficial seleccionado (%s).',
                $destinatario,
                $oficialEsperado
            );
        } elseif ($coincideOficial === true) {
            $advertencias[] = sprintf('Destinatario confirmado en el documento: %s.', $destinatario);
        }

        if ($fechaDocumento !== '') {
            $advertencias[] = 'Fecha detectada en el documento: ' . $fechaDocumento . '.';
        }

        if ($firmaSinVerificar) {
            $advertencias[] = 'No se pudo verificar la firma dentro del tiempo disponible: confírmela manualmente en el documento.';
        } elseif (!$firma) {
            $advertencias[] = 'No se detectó firma manuscrita en el documento.';
        }
        if (!$sello) {
            $advertencias[] = 'No se detectó sello institucional en el documento.';
        }
        if ($firma && $sello) {
            $advertencias[] = 'Firma y sello institucional detectados en el documento.';
        }

        $resultado = [
            'ia_disponible' => true,
            'firma_verificada' => !$firmaSinVerificar,
            // Si la revisión completa tampoco lo reconoce como memorándum, el
            // documento se descarta (misma regla que el filtro de encabezado).
            'descartado' => !$esMemo,
            'es_memo' => $esMemo,
            'encabezado' => $encabezado['encabezado'] ?? null,
            'motivo_descarte' => $esMemo ? null : ('El documento NO es un memorándum institucional: '
                . 'no empieza con el título MEMORÁNDUM ni tiene la estructura de un memorándum '
                . 'de la Policía Boliviana (membrete, destinatario "Al Señor(a):", fecha y firma). '
                . 'No se validó firma, sello ni destinatario.'),
            'tipo_detectado' => $tipoDetectado !== '' ? $tipoDetectado : null,
            'tipo_esperado' => $tipoEsperado !== '' ? $tipoEsperado : null,
            'coincide_tipo' => $coincideTipo,
            'destinatario' => $destinatario !== '' ? $destinatario : null,
            'coincide_oficial' => $coincideOficial,
            'fecha_documento' => $fechaDocumento !== '' ? $fechaDocumento : null,
            'firma' => (bool) $firma,
            'sello' => (bool) $sello,
            'resumen' => $resumen !== '' ? $resumen : null,
            'no_concluyente' => false,
            'alertas' => $alertas,
            'advertencias' => $advertencias,
            'tiempo_seg' => round(microtime(true) - $inicio, 3),
        ];

        $this->registrarResumen('subir_documento');

        return $resultado;
    }

    /**
     * Compara el tipo seleccionado por el secretario con el tipo leído por la IA.
     * Tolerante a mayúsculas, tildes y sinónimos comunes.
     */
    protected function tiposCoinciden(string $esperado, string $detectado): bool
    {
        $norm = function (string $s): string {
            $s = mb_strtolower($s, 'UTF-8');
            $s = str_replace(
                ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', 'à', 'è', 'ì', 'ò', 'ù'],
                ['a', 'e', 'i', 'o', 'u', 'u', 'n', 'a', 'e', 'i', 'o', 'u'],
                $s
            );
            return trim((string) preg_replace('/[^a-z0-9 ]/', ' ', $s));
        };

        $e = $norm($esperado);
        $d = $norm($detectado);
        if ($e === '' || $d === '') {
            return false;
        }

        if ($e === $d || str_contains($e, $d) || str_contains($d, $e)) {
            return true;
        }

        // Sinónimos: si ambos hablan de lo mismo con otras palabras.
        $alias = [
            'designacion' => ['designa', 'designado', 'designada'],
            'llamada de atencion' => ['llamada', 'atencion', 'llamado'],
            'arresto' => ['arresto', 'detencion', 'detenido'],
            'vacacion' => ['vacacion', 'descanso', 'licencia', 'permiso'],
            'cuenta vacacion' => ['cuenta', 'vacaciones', 'dias'],
            'comision de estudio' => ['comision', 'estudio', 'estudios', 'curso'],
            'cambio de destino' => ['cambio', 'destino', 'traslado'],
            'felicitacion' => ['felicitacion', 'felicitaciones', 'felicita'],
        ];
        foreach ($alias as $clave => $sinonimos) {
            $coincideE = $e === $clave || in_array($e, $sinonimos, true);
            $coincideD = $d === $clave || in_array($d, $sinonimos, true);
            if ($coincideE && $coincideD) {
                return true;
            }
        }

        // Palabras significativas compartidas (ignorando artículos/preposiciones).
        $palabras = fn (string $s) => array_values(array_filter(
            preg_split('/\s+/', $s) ?: [],
            fn ($t) => !in_array($t, ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'al', 'a', 'por', 'para', 'cuenta', 'memo', 'memorandum'], true)
        ));
        $compartidas = count(array_intersect($palabras($e), $palabras($d)));

        return $compartidas >= 2;
    }

    /**
     * Analiza la FOTO DE PERFIL subida en el registro público y determina si
     * contiene un ROSTRO humano (no objetos, animales, logos, documentos, etc.).
     * Usa el mismo modelo de visión local (IA_MODEL) con una sola imagen.
     *
     * @return array{es_rostro:bool,mensaje:string}
     */
    public function analizarRostro(string $rutaAbsoluta, bool $forzar = false): array
    {
        if (!$this->disponible()) {
            throw new RuntimeException('La IA local no está configurada. Defina IA_URL e IA_MODEL en el archivo .env.');
        }
        if (!is_file($rutaAbsoluta)) {
            throw new RuntimeException('La foto de perfil no se encontró en el servidor.');
        }

        // Presupuesto propio: la foto se revisa DESPUÉS del memorándum, así que
        // el límite de esa verificación ya está consumido.
        $this->iniciarPresupuesto((float) config('ia.presupuesto', 300));

        $inicio = microtime(true);
        $texto = 'Mira esta imagen y determina si contiene el ROSTRO de una persona (foto tipo perfil: '
            . 'cara humana visible, de frente o ligeramente girada). Responde false si es otra cosa: '
            . 'objetos, animales, paisajes, logos, capturas de pantalla, documentos o imágenes sin personas. '
            . 'Responde SOLO con JSON válido: {"rostro": true} o {"rostro": false}.';

        $vigencia = max(0, (int) config('ia.cache_lectura_segundos', 900));
        $clave = 'ia:rostro:v1:'.hash('sha256', json_encode([
            hash_file('sha256',$rutaAbsoluta), auth()->id(), auth()->user()?->id_epi,
            $this->url(), config('ia.model'), config('ia.max_tokens_rostro'), $texto, 1024,
        ]));
        if (!$forzar && $vigencia > 0) {
            try {
                $previa = Cache::get($clave);
                if (is_array($previa) && is_bool($previa['es_rostro'] ?? null)) {
                    return array_merge($previa,['tiempo_seg'=>round(microtime(true)-$inicio,3)]);
                }
            } catch (\Throwable) { /* Continuar con la imagen real. */ }
        }

        $ext = strtolower(pathinfo($rutaAbsoluta, PATHINFO_EXTENSION));
        $mime = $ext === 'png' ? 'png' : 'jpeg';

        // Reducir la foto antes de enviarla: las cámaras suben fotos de 3-5 MB
        // que al modelo le llegan reescaladas igualmente, así que enviar más
        // píxeles solo alarga el base64 y la latencia. 1024 px de lado mayor es
        // más que suficiente para detectar un rostro.
        $binario = (string) file_get_contents($rutaAbsoluta);
        if (function_exists('imagecreatefromstring') && $binario !== '') {
            $im = @imagecreatefromstring($binario);
            if ($im !== false) {
                $ancho = imagesx($im);
                $alto = imagesy($im);
                $maxLado = 1024;
                if ($ancho > $maxLado || $alto > $maxLado) {
                    $escala = $maxLado / max($ancho, $alto);
                    $nuevoAncho = max(1, (int) round($ancho * $escala));
                    $nuevoAlto = max(1, (int) round($alto * $escala));
                    $nuevo = imagecreatetruecolor($nuevoAncho, $nuevoAlto);
                    if ($mime === 'png') {
                        imagealphablending($nuevo, false);
                        imagesavealpha($nuevo, true);
                    }
                    imagecopyresampled($nuevo, $im, 0, 0, 0, 0, $nuevoAncho, $nuevoAlto, $ancho, $alto);
                    $buf = fopen('php://temp', 'r+');
                    if ($buf !== false) {
                        if ($mime === 'png') {
                            imagepng($nuevo, $buf);
                        } else {
                            imagejpeg($nuevo, $buf, 85);
                        }
                        rewind($buf);
                        $binario = (string) stream_get_contents($buf);
                        fclose($buf);
                    }
                    imagedestroy($nuevo);
                }
                imagedestroy($im);
            }
        }
        $dataUrl = 'data:image/' . $mime . ';base64,' . base64_encode($binario);

        $contenido = $this->consultar(
            [$dataUrl],
            $texto,
            (string) config('ia.model', ''),
            null,
            (int) config('ia.max_tokens_rostro', 20)
        );
        $json = $this->extraerJson($contenido);

        $valor = $json['rostro'] ?? $json['es_rostro'] ?? $json['face'] ?? null;
        $esRostro = null;
        if (is_bool($valor)) $esRostro = $valor;
        elseif (is_string($valor)) {
            $limpio = mb_strtolower(trim($valor),'UTF-8');
            if (in_array($limpio,['true','si','sí','yes','1'],true)) $esRostro = true;
            elseif (in_array($limpio,['false','no','0'],true)) $esRostro = false;
        } elseif ($valor === 0 || $valor === 1) $esRostro = $valor === 1;
        $resultado = [
            'es_rostro'=>$esRostro,
            'mensaje'=>$esRostro === null ? 'La lectura de la foto no fue concluyente. Revísela manualmente.'
                : ($esRostro ? 'Se detectó un rostro humano en la foto de perfil.'
                    : 'La foto de perfil NO parece contener un rostro humano. Solicitar una foto correcta.'),
        ];
        if ($vigencia > 0 && $esRostro !== null && $this->modeloActivo === config('ia.model')) {
            try { Cache::put($clave,$resultado,now()->addSeconds($vigencia)); } catch (\Throwable) {}
        }
        $this->registrarResumen('registro_publico/foto');
        return array_merge($resultado,['tiempo_seg'=>round(microtime(true)-$inicio,3)]);
    }
}

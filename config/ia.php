<?php

return [
    /*
    |--------------------------------------------------------------------------
    | IA LOCAL DE VERIFICACIÓN DOCUMENTAL (firma, sello y nombres en el memo)
    |--------------------------------------------------------------------------
    | Servidor: LM Studio (API REST v1, compatible con la forma de OpenAI).
    |   'url'      → http://IP:PUERTO   (ej. http://127.0.0.1:1234)
    |   'endpoint' → POST {url}/api/v1/chat  con body:
    |                   { "model": "qwen2.5-vl-3b-instruct",
    |                     "temperature": 0,
    |                     "input": [ {"type":"text","content":"..."},
    |                                {"type":"image","data_url":"data:image/png;base64,..."} ] }
    |   y respuesta {"output":[{"type":"message","content":"..."}]}
    |
    | MODELO: Qwen2.5-VL 3B Instruct (Qwen2.5-VL-3B-Instruct-GGUF, 3.27 GB).
    |   Es el punto de equilibrio de este equipo (RTX 3050 Laptop 4 GB VRAM +
    |   27.7 GB RAM, Ryzen 9 6900HS):
    |     · entra completo en la GPU (el 7B no cabía y parte se iba a la RAM,
    |       que era la causa de los 50-70 s por documento);
    |     · lee mejor los escaneos reales que el 2B;
    |     · responde en ~2-5 s por página con el prompt de una sola pasada.
    |   Si más adelante se cambia de modelo, actualice IA_MODEL con el IDENTADOR
    |   exacto que muestra `lms ls` (no el nombre del archivo del Hub).
    |
    | CARGA RECOMENDADA EN LM STUDIO (la que deja el sistema por defecto):
    |   lms load qwen2.5-vl-3b-instruct --gpu max --context-length 4096 \
    |           --parallel 1 --ttl 3600 -y
    |   En la interfaz: GPU Offload = máximo, Flash Attention = ON,
    |   Context Length = 4096, Parallel = 1, Keep model in memory = ON.
    |   Con el modelo CARGADO (no "just-in-time") la primera consulta no paga
    |   los ~10 s de carga de pesos.
    |
    | PRESUPUESTO DE TIEMPO:
    |   Lo primero es que la verificación sea FUNCIONAL y PRECISA: el modelo
    |   tarda lo que necesite. Una página real tarda 5-30 s según el equipo y
    |   según si los pesos ya están cargados en la GPU. Por defecto no hay
    |   corte de duración de inferencia (esperar_sin_limite=true). Los valores
    |   de presupuesto solo se utilizan al activar expresamente el modo
    |   acotado. Los errores de conexión siguen notificándose normalmente.
    |
    | CÓMO SE GASTA EL PRESUPUESTO (revisión en vivo, ~2 consultas máximo):
    |   1. Pre-filtro del encabezado (0 s si el PDF trae capa de texto; si es
    |      escaneo, una franja pequeña con tope de 'timeout_encabezado').
    |      Si no dice MEMORÁNDUM → descarte inmediato en rojo, sin más IA.
    |   2. UNA sola consulta sobre la primera página con TODO el JSON
    |      (tipo, destinatario, fecha, firma, sello).
    |
    | SI ALGO TARDA MÁS DE LA CUENTA:
    |   - Baje 'max_lado' (cada 56 px de lado = 1 token de visión).
    |   - Confirme que el modelo esté 100 % en GPU (`lms ps` debe decir GPU).
    |   - `php artisan ia:diagnostico` revisa servidor, modelos y latencias.
    */
    'url' => env('IA_URL', 'http://127.0.0.1:1234'),
    'endpoint' => env('IA_ENDPOINT', '/api/v1/chat'),

    // Modelo de visión único: mismo ID para todos los flujos.
    'model' => env('IA_MODEL', 'qwen2.5-vl-3b-instruct'),
    // Se mantiene por compatibilidad: apunta al mismo modelo a propósito. Dos
    // modelos distintos obligaban a LM Studio a descargar/cargar pesos entre
    // consultas (6 GB por cambio) y era la causa de las esperas de minutos.
    'model_rapido' => env('IA_MODEL_RAPIDO', env('IA_MODEL', 'qwen2.5-vl-3b-instruct')),
    // Sin respaldo por defecto: cargar un segundo modelo obliga a LM Studio a
    // sacar de la VRAM el que está en uso (con 4 GB, el 7B cae a CPU y cada
    // consulta pasa de 4 s a ~20 s). Si el modelo principal no está descargado,
    // VerificadorIA elige automáticamente otro modelo de visión disponible.
    // IA_MODEL_FALLBACK admite una lista separada por comas si se necesita.
    'model_fallback' => env('IA_MODEL_FALLBACK', ''),

    /*
    | Lista ordenada y sin duplicados de modelos candidatos. Vacío = no intentar.
    | Se calcula una sola vez al cargar la configuración (seguro para config:cache).
    */
    'modelos' => (static function (): array {
        $lista = array_merge(
            [(string) env('IA_MODEL', 'qwen2.5-vl-3b-instruct'), (string) env('IA_MODEL_RAPIDO', '')],
            explode(',', (string) env('IA_MODEL_FALLBACK', ''))
        );

        $limpios = [];
        foreach ($lista as $modelo) {
            $modelo = trim((string) $modelo);
            if ($modelo !== '' && !in_array($modelo, $limpios, true)) {
                $limpios[] = $modelo;
            }
        }

        return $limpios;
    })(),

    /*
    |--------------------------------------------------------------------------
    | TIEMPO
    |--------------------------------------------------------------------------
    | Modo acotado opcional (esperar_sin_limite=false):
    | 'presupuesto' → tope de una verificación completa (segundos).
    |   Amplio a propósito: no debe recortar trabajo legítimo del modelo.
    | 'timeout'     → tope de una consulta suelta (nunca mayor al presupuesto).
    | 'timeout_fallback' → tope de la consulta de respaldo (lectura de nombres).
    | 'timeout_maximo' → techo duro de cualquier consulta, aunque sobre tiempo.
    | 'timeout_encabezado' → tope del pre-filtro del encabezado.
    */
    'presupuesto' => (float) env('IA_PRESUPUESTO', 300),
    'timeout' => (int) env('IA_TIMEOUT', 240),
    'timeout_fallback' => (int) env('IA_TIMEOUT_FALLBACK', 300),
    'timeout_maximo' => (int) env('IA_TIMEOUT_MAXIMO', 300),
    'timeout_encabezado' => (float) env('IA_TIMEOUT_ENCABEZADO', 20),

    // Esperar el resultado real de la inferencia, sin cortar por duración.
    // Los parámetros de presupuesto anteriores solo rigen si se desactiva.
    'esperar_sin_limite' => (bool) env('IA_ESPERAR_SIN_LIMITE', true),
    // Evidencia del mismo PDF por usuario/EPI; nunca decisiones ni permisos.
    'cache_lectura_segundos' => (int) env('IA_CACHE_LECTURA_SEGUNDOS', 900),

    /*
    |--------------------------------------------------------------------------
    | IMAGEN QUE RECIBE EL MODELO
    |--------------------------------------------------------------------------
    | El costo de visión crece con los píxeles: tokens ≈ (ancho/56)·(alto/56).
    |   A4 a 150 DPI sin reescalar (1240×1754)  → ~690 tokens  (lento)
    |   A4 reescalada a max_lado = 1280         → ~440 tokens  (equilibrio)
    | Se rasteriza a 'dpi' (nítido) y se reduce con LANCZOS, que da mejor OCR
    | que rasterizar directo a baja resolución con los mismos tokens.
    */
    'dpi' => (int) env('IA_DPI', 150),
    'dpi_rapido' => (int) env('IA_DPI_RAPIDO', 150),
    'max_lado' => (int) env('IA_MAX_LADO', 1280),
    'max_lado_encabezado' => (int) env('IA_MAX_LADO_ENCABEZADO', 900),
    'max_paginas' => (int) env('IA_MAX_PAGINAS', 1),

    /*
    |--------------------------------------------------------------------------
    | SALIDA
    |--------------------------------------------------------------------------
    | Respuestas cortas = respuestas rápidas, pero truncar el JSON lo invalida y
    | obliga a revisión manual. El margen es amplio porque la generación se
    | detiene sola al cerrar el JSON: el techo alto no cuesta latencia.
    */
    'max_tokens' => (int) env('IA_MAX_TOKENS', 400),
    'max_tokens_encabezado' => (int) env('IA_MAX_TOKENS_ENCABEZADO', 120),
    'max_tokens_rostro' => (int) env('IA_MAX_TOKENS_ROSTRO', 20),

    /*
    | Pre-filtro local del encabezado (sin IA cuando el PDF tiene capa de texto):
    | si el documento NO empieza con "MEMORÁNDUM" se descarta de inmediato, sin
    | gastar consultas de visión. IA_GATE_MEMO=false lo desactiva (emergencia).
    */
    'gate_memo' => (bool) env('IA_GATE_MEMO', true),

    /*
    | Pre-filtro del encabezado por IMAGEN (solo documentos escaneados).
    | Desactivado a propósito: la franja superior cuesta 2.5-3.5 s del presupuesto
    | y la lectura completa ya devuelve es_memo, así que el descarte sale igual
    | sin duplicar trabajo. Actívelo solo si necesita rechazar escaneos que no
    | son memorándums sin leer la página entera.
    */
    'gate_vision' => (bool) env('IA_GATE_VISION', false),

    /*
    | Cola FIFO de verificación automática (registro público de oficiales).
    |   'cola_lote' → solicitudes máximo por invocación de `php artisan ia:procesar-cola`.
    |   'cola_pausa' → segundos de espera del worker daemon cuando la cola está vacía.
    */
    'cola_lote' => (int) env('IA_COLA_LOTE', 10),
    'cola_pausa' => (int) env('IA_COLA_PAUSA', 3),
];

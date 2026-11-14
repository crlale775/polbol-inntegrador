<?php

namespace App\Http\Controllers;

use App\Models\Documento;
use App\Models\Epi;
use App\Models\HistorialEstado;
use App\Models\Oficial;
use App\Models\TipoDocumento;
use App\Models\Usuario;
use App\Services\VerificadorIA;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DocumentoController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'estado_actual' => ['sometimes', 'integer', 'exists:estados_documento,id_estado'],
            'id_epi' => ['sometimes', 'integer', 'exists:epis,id_epi'],
            'id_oficial' => ['sometimes', 'integer', 'exists:oficiales,id_oficial'],
            'id_tipo' => ['sometimes', 'integer', 'exists:tipos_documento,id_tipo'],
            'id_usuario' => ['sometimes', 'integer', 'exists:usuarios,id_usuario'],
            'search' => ['sometimes', 'string', 'max:100'],
            'resumen' => ['sometimes', 'boolean'],
        ]);
        $query = Documento::with([
            'tipoDocumento',
            'oficial.grado',
            'oficial.cargo',
            'usuario.epi',
            'epi',
            'estado',
        ]);
        if ($request->boolean('resumen')) {
            // Los historiales/listas de selección abren el expediente por separado.
            // No transportar todas las revisiones, versiones y dictámenes de IA.
            // hash y versiones_count cubren lo que muestran las listas sin cargar
            // las colecciones completas (revisiones con revisor, versiones).
            $query->select(['id_documento', 'id_tipo', 'id_oficial', 'id_usuario', 'id_epi',
                'codigo_documento', 'referencia', 'ruta_pdf', 'hash', 'fecha_subida', 'estado_actual', 'tipo_libre'])
                ->withCount('versiones');
        } else {
            $query->with(['revisiones.revisor', 'revisiones.tipoObservacion', 'versiones']);
        }

        if ((int) $request->user()->id_rol === 1) {
            $query->where('id_epi', $request->user()->id_epi);
        }

        if (isset($filters['estado_actual'])) {
            $query->where('estado_actual', $filters['estado_actual']);
        }

        if (isset($filters['id_epi'])) {
            $query->where('id_epi', $filters['id_epi']);
        }

        if (isset($filters['id_oficial'])) {
            $query->where('id_oficial', $filters['id_oficial']);
        }

        if (isset($filters['id_tipo'])) {
            $query->where('id_tipo', $filters['id_tipo']);
        }

        if (isset($filters['id_usuario'])) {
            $query->where('id_usuario', $filters['id_usuario']);
        }

        if (isset($filters['search'])) {
            $search = $filters['search'];
            $query->where(function ($q) use ($search) {
                $q->where('codigo_documento', 'ilike', "%{$search}%")
                  ->orWhere('referencia', 'ilike', "%{$search}%")
                  ->orWhereHas('oficial', function ($oq) use ($search) {
                      $oq->where('nombres', 'ilike', "%{$search}%")
                         ->orWhere('apellidos', 'ilike', "%{$search}%")
                         ->orWhere('ci', 'ilike', "%{$search}%");
                  });
            });
        }

        $documentos = $query->orderBy('fecha_subida', 'desc')->get();
        return response()->json($documentos);
    }

    public function store(Request $request): JsonResponse
    {
        $documento = app(\App\Services\ConfirmacionEnvio::class)->registrar($request);
        return response()->json($documento->load(['tipoDocumento', 'oficial.grado', 'epi', 'estado']), 201);
    }

    public function show(string|int $id): JsonResponse
    {
        $documento = Documento::with([
            'tipoDocumento',
            'oficial.grado',
            'oficial.cargo',
            'usuario.epi',
            'epi',
            'estado',
            'versiones.usuario',
            'revisiones.revisor',
            'revisiones.tipoObservacion',
            'validaciones.regla',
            'flujos.usuario',
            'historialEstados.usuario.rol',
            'historialEstados.estadoAnterior',
            'historialEstados.estadoNuevo',
        ])->findOrFail($id);

        return response()->json($documento);
    }

    public function update(Request $request, string|int $id): JsonResponse
    {
        abort_unless(in_array((int) $request->user()->id_rol, [2,3], true), 403, 'Utilice la subsanación confirmada para re-enviar el trámite.');
        $data = $request->validate(['estado_actual' => ['required','integer','exists:estados_documento,id_estado']]);
        $doc = \Illuminate\Support\Facades\DB::transaction(function () use ($request, $id, $data) {
            $doc = Documento::lockForUpdate()->findOrFail($id);
            $anterior = (int) $doc->estado_actual;
            $nuevo = (int) $data['estado_actual'];
            $departamental = (int) $request->user()->id_rol === 2;
            $origenes = $departamental ? [2,3] : [6,7];
            $destinos = $departamental ? [3,4,5,6,7] : [4,5,8];
            abort_unless(in_array($nuevo, $destinos, true), 403, 'Su rol no puede realizar esa transición.');
            if ($anterior === $nuevo) return $doc;
            abort_unless(in_array($anterior, $origenes, true), 409, 'El trámite cambió de estado. Actualice la bandeja antes de continuar.');
            $doc->update(['estado_actual' => $nuevo]);
            HistorialEstado::create(['id_documento'=>$doc->id_documento,'estado_anterior'=>$anterior,'estado_nuevo'=>$nuevo,'usuario'=>$request->user()->id_usuario,'fecha'=>now()]);
            return $doc;
        });
        return response()->json($doc->load(['tipoDocumento','oficial.grado','epi','estado']));
    }

    /**
     * REVISIÓN IA EN VIVO del PDF antes de registrarlo (módulo Subir Documento).
     *
     * Recibe el PDF recién adjuntado, lo convierte a imagen (1ª página, baja
     * resolución) y hace UNA sola consulta al modelo de visión local
     * (LM Studio) para determinar si es un memorándum, su tipo, destinatario,
     * fecha, firma y sello. El resultado alimenta el panel del Sistema Experto.
     */
    public function revisarIA(Request $request): JsonResponse
    {
        abort_unless(in_array((int) $request->user()->id_rol, [1, 2, 3], true), 403);
        $validated = $request->validate([
            // 50 MB: los memos escaneados en alta resolución suelen superar los
            // 15 MB (Laragon permite 2G en php.ini, así que el límite real es este).
            'archivo' => 'required_without:revision_anterior|file|mimes:pdf|max:51200|prohibits:revision_anterior',
            'revision_anterior' => 'nullable|uuid',
            'tipo_esperado' => 'nullable|string|max:120',
            'oficial_esperado' => 'nullable|string|max:250',
            'forzar_revision' => 'sometimes|boolean',
            'id_oficial' => 'nullable|integer|exists:oficiales,id_oficial',
            'id_tipo' => 'nullable|integer|exists:tipos_documento,id_tipo',
            'tipo_libre' => 'nullable|string|max:100',
        ], [
            'archivo.max' => 'El archivo PDF no puede superar los 50 MB.',
            'archivo.mimes' => 'Solo se permiten documentos en formato PDF.',
        ]);

        if ((int)$request->user()->id_rol === 1 && !empty($validated['id_oficial'])) {
            abort_unless(Oficial::where('id_oficial',$validated['id_oficial'])->where('id_epi',$request->user()->id_epi)->exists(),403);
        }
        $confirmaciones = app(\App\Services\ConfirmacionEnvio::class);
        $verificador = app(VerificadorIA::class);
        $contexto = [
            'tipo_esperado' => $validated['tipo_esperado'] ?? '',
            'oficial_esperado' => $validated['oficial_esperado'] ?? '',
            'forzar_revision' => $validated['forzar_revision'] ?? false,
        ];
        if (!empty($validated['revision_anterior'])) {
            abort_if($contexto['forzar_revision'], 422, 'Adjunte el PDF para solicitar una nueva lectura.');
            $anterior = \Illuminate\Support\Facades\Cache::get('revision_emision_'.$validated['revision_anterior']);
            abort_unless($anterior, 410, 'La revisión anterior venció. Adjunte nuevamente el PDF.');
            abort_unless($anterior['owner'] === (int) $request->user()->id_usuario, 403);
            $resultado = $verificador->revisarEvidencia($anterior['hash'], $contexto);
            return response()->json($confirmaciones->guardarRevision($request->user(), $anterior['hash'], $validated, $resultado), 200, [], JSON_INVALID_UTF8_SUBSTITUTE);
        }
        $hashRevision = hash_file('sha256',$request->file('archivo')->getRealPath());

        if (!$verificador->disponible()) {
            return response()->json($confirmaciones->guardarRevision($request->user(),$hashRevision,$validated,[
                'ia_disponible' => false, 'mensaje' => 'La revisión automática no está disponible. El documento requiere revisión humana.',
            ]));
        }

        // El disco 'local' apunta a storage/app/private (Laravel 11+), por lo
        // que la ruta absoluta se resuelve con Storage::path(), no con
        // storage_path('app/...'), que apuntaba a una carpeta inexistente y
        // provocaba "El archivo PDF no existe" en la revisión con IA.
        $rutaRel = $request->file('archivo')->store('ia_tmp', 'local');
        $rutaAbs = \Illuminate\Support\Facades\Storage::disk('local')->path($rutaRel);

        try {
            $resultado = $verificador->revisarRapido($rutaAbs, $contexto);

            // JSON_INVALID_UTF8_SUBSTITUTE: el modelo puede devolver algún byte
            // suelto; sin esto la respuesta fallaba con "Malformed UTF-8".
            return response()->json($confirmaciones->guardarRevision($request->user(),$hashRevision,$validated,$resultado), 200, [], JSON_INVALID_UTF8_SUBSTITUTE);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Falló la revisión IA de un documento.', [
                'exception' => $e,
                'user_id' => $request->user()?->id_usuario,
            ]);
            return response()->json($confirmaciones->guardarRevision($request->user(),$hashRevision,$validated,[
                'ia_disponible' => false, 'mensaje' => 'No se pudo completar la revisión automática. El documento requiere revisión humana.',
            ]), 200, [], JSON_INVALID_UTF8_SUBSTITUTE);
        } finally {
            if (is_file($rutaAbs)) {
                @unlink($rutaAbs);
            }
        }
    }

    /**
     * Persiste el PDF fuera del directorio público; se sirve con autorización.
     */
    public function subirArchivo(Request $request): JsonResponse
    {
        $inicioCarga = hrtime(true);
        abort_unless((int) $request->user()->id_rol === 1, 403, 'La carga de documentos corresponde a la Secretaría EPI.');
        $validated = $request->validate([
            'archivo' => 'required|file|mimes:pdf|max:51200',
        ], [
            'archivo.max' => 'El archivo PDF no puede superar los 50 MB.',
            'archivo.mimes' => 'Solo se permiten documentos en formato PDF.',
        ]);

        $finValidacion = hrtime(true);
        $archivo = $request->file('archivo');
        $nombre = preg_replace('/[^A-Za-z0-9._-]+/', '_', (string) $archivo->getClientOriginalName());
        $nombre = $nombre ?: ('documento_' . now()->format('Ymd_His') . '.pdf');

        // El nombre original es solo una etiqueta: nunca debe sobrescribir otro expediente.
        $ruta = $archivo->storeAs('documentos', (string) \Illuminate\Support\Str::uuid() . '.pdf', 'local');
        if (!$ruta || !\Illuminate\Support\Facades\Storage::disk('local')->exists($ruta)) {
            return response()->json(['message' => 'No se pudo guardar el PDF. Intente nuevamente.'], 500);
        }

        $finGuardado = hrtime(true);
        $hash = hash_file('sha256', \Illuminate\Support\Facades\Storage::disk('local')->path($ruta));
        $finHash = hrtime(true);
        \Illuminate\Support\Facades\Cache::put('archivo_emision_'.hash('sha256',$ruta), ['owner'=>(int)$request->user()->id_usuario,'epi'=>(int)$request->user()->id_epi,'hash'=>$hash], now()->addHours(2));
        return response()->json([
            'ruta' => $ruta,
            'hash' => $hash,
            'nombre' => $nombre,
            'bytes' => $archivo->getSize(),
        ], 201)->header('Server-Timing', sprintf(
            'validacion;dur=%.2f, guardado;dur=%.2f, hash;dur=%.2f, carga_servidor;dur=%.2f',
            ($finValidacion-$inicioCarga)/1e6, ($finGuardado-$finValidacion)/1e6,
            ($finHash-$finGuardado)/1e6, (hrtime(true)-$inicioCarga)/1e6
        ));
    }

    /** Sirve documentos existentes solo después de validar sesión y ámbito EPI. */
    public function archivo(Request $request, string|int $id): \Symfony\Component\HttpFoundation\Response
    {
        $documento = Documento::findOrFail($id);
        abort_unless((int) $request->user()->id_rol !== 1
            || (int) $documento->id_epi === (int) $request->user()->id_epi, 404);

        $ruta = ltrim(str_replace('\\', '/', (string) $documento->ruta_pdf), '/');
        if (str_starts_with($ruta, 'storage/')) {
            $ruta = substr($ruta, strlen('storage/'));
        }
        abort_unless(str_starts_with($ruta, 'documentos/'), 404);

        $disk = \Illuminate\Support\Facades\Storage::disk('local');
        if (!$disk->exists($ruta)) {
            $disk = \Illuminate\Support\Facades\Storage::disk('public');
        }
        abort_unless($disk->exists($ruta), 404);

        return $disk->response($ruta, basename($ruta), [
            'Content-Type' => 'application/pdf',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** Sirve un PDF identificado por su ruta persistida en documento/versión. */
    public function archivoPorRuta(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $validated = $request->validate(['ruta' => ['required', 'string', 'max:500']]);
        $rutaSolicitada = ltrim(str_replace('\\', '/', $validated['ruta']), '/');
        if (str_starts_with($rutaSolicitada, 'storage/')) {
            $rutaSolicitada = substr($rutaSolicitada, strlen('storage/'));
        }
        abort_unless(str_starts_with($rutaSolicitada, 'documentos/'), 404);

        $documento = Documento::whereIn('ruta_pdf', [
            $rutaSolicitada,
            'storage/' . $rutaSolicitada,
            '/storage/' . $rutaSolicitada,
        ])->first();
        $rutaArchivo = $documento?->ruta_pdf ?? $rutaSolicitada;
        if (!$documento) {
            $version = \App\Models\VersionDocumento::with('documento')
                ->whereIn('ruta_pdf', [
                    $rutaSolicitada,
                    'storage/' . $rutaSolicitada,
                    '/storage/' . $rutaSolicitada,
                ])->firstOrFail();
            $documento = $version->documento;
            $rutaArchivo = $version->ruta_pdf;
        }
        abort_unless($documento, 404);
        abort_unless((int) $request->user()->id_rol !== 1
            || (int) $documento->id_epi === (int) $request->user()->id_epi, 404);

        $rutaArchivo = ltrim(str_replace('\\', '/', (string) $rutaArchivo), '/');
        if (str_starts_with($rutaArchivo, 'storage/')) {
            $rutaArchivo = substr($rutaArchivo, strlen('storage/'));
        }
        abort_unless(str_starts_with($rutaArchivo, 'documentos/'), 404);

        $disk = \Illuminate\Support\Facades\Storage::disk('local');
        if (!$disk->exists($rutaArchivo)) {
            $disk = \Illuminate\Support\Facades\Storage::disk('public');
        }
        abort_unless($disk->exists($rutaArchivo), 404);

        return $disk->response($rutaArchivo, basename($rutaArchivo), [
            'Content-Type' => 'application/pdf',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function destroy(string|int $id): JsonResponse
    {
        $documento = Documento::findOrFail($id);
        $documento->delete();
        return response()->json(['message' => 'Documento eliminado correctamente']);
    }

    /**
     * Obtener trazabilidad completa y estructurada de un documento
     */
    public function trazabilidad(string|int $id): JsonResponse
    {
        $documento = Documento::with([
            'tipoDocumento',
            'oficial.grado',
            'oficial.cargo',
            'usuario.epi',
            'epi',
            'estado',
            'versiones.usuario',
            'revisiones.revisor',
            'revisiones.tipoObservacion',
            'historialEstados.usuario.rol',
            'historialEstados.estadoAnterior',
            'historialEstados.estadoNuevo',
        ])->findOrFail($id);

        $historial = $documento->historialEstados->sortBy('fecha')->values();

        // Mapeo completo de etapas institucionales
        $etapasDefinidas = [
            ['paso' => 1, 'clave' => 'subido', 'nombre' => 'Subido por Secretario EPI', 'icono' => 'document-arrow-up'],
            ['paso' => 2, 'clave' => 'recibido_dptal', 'nombre' => 'Recibido en Comando Departamental', 'icono' => 'inbox-arrow-down'],
            ['paso' => 3, 'clave' => 'en_revision', 'nombre' => 'En Revisión Normativa', 'icono' => 'magnifying-glass'],
            ['paso' => 4, 'clave' => 'observado', 'nombre' => 'Observado (si aplica)', 'icono' => 'exclamation-triangle'],
            ['paso' => 5, 'clave' => 'corregido', 'nombre' => 'Corregido / Re-enviado', 'icono' => 'arrow-path'],
            ['paso' => 6, 'clave' => 'aprobado', 'nombre' => 'Aprobado por Comando Departamental', 'icono' => 'check-badge'],
            ['paso' => 7, 'clave' => 'remitido', 'nombre' => 'Remitido al Comando General', 'icono' => 'paper-airplane'],
            ['paso' => 8, 'clave' => 'recepcionado_cg', 'nombre' => 'Recepcionado en Comando General', 'icono' => 'building-library'],
            ['paso' => 9, 'clave' => 'registrado', 'nombre' => 'Registrado Oficialmente en Escalafón', 'icono' => 'document-check'],
            ['paso' => 10, 'clave' => 'flujo_cerrado', 'nombre' => 'Flujo Institucional Cerrado', 'icono' => 'lock-closed'],
        ];

        return response()->json([
            'documento' => $documento,
            'historial' => $historial,
            'revisiones' => $documento->revisiones,
            'versiones' => $documento->versiones,
            'etapas_definidas' => $etapasDefinidas,
        ]);
    }

    /**
     * Desempeño comparativo de las 9 EPIs
     */
    public function desempenioEpis(): JsonResponse
    {
        $epis = Epi::orderBy('id_epi')->get();
        $tipos = TipoDocumento::orderBy('id_tipo')->get();
        $documentos = Documento::with(['tipoDocumento', 'estado', 'usuario', 'epi', 'oficial.grado', 'historialEstados'])->get();
        $secretarios = Usuario::where('id_rol', 1)->where('estado', true)->with('epi')->get()->keyBy('id_epi');

        $resultado = $epis->map(function ($epi) use ($documentos, $secretarios, $tipos) {
            $docsEpi = $documentos->where('id_epi', $epi->id_epi);

            $total = $docsEpi->count();
            $enviados = $docsEpi->whereIn('estado_actual', [2, 3])->count();
            $enRevision = $docsEpi->where('estado_actual', 3)->count();
            $observados = $docsEpi->whereIn('estado_actual', [4, 5])->count();
            $aprobados = $docsEpi->whereIn('estado_actual', [6, 7, 8])->count();
            $registrados = $docsEpi->where('estado_actual', 8)->count();

            $tasaAprobacion = $total > 0 ? round(($aprobados / $total) * 100, 1) : 0;
            $tasaObservacion = $total > 0 ? round(($observados / $total) * 100, 1) : 0;

            // Desglose por tipo
            $porTipo = [];
            foreach ($tipos as $t) {
                $porTipo[$t->nombre] = $docsEpi->where('id_tipo', $t->id_tipo)->count();
            }

            $sec = $secretarios->get($epi->id_epi);

            // Detalle por tipo dentro de esta EPI (para el panel de la torre)
            $porTipoDetalle = $tipos->map(function ($t) use ($docsEpi) {
                $d = $docsEpi->where('id_tipo', $t->id_tipo);

                return [
                    'id_tipo' => $t->id_tipo,
                    'tipo' => $t->nombre,
                    'total' => $d->count(),
                    'aprobados' => $d->whereIn('estado_actual', [6, 7, 8])->count(),
                    'observados' => $d->whereIn('estado_actual', [4, 5])->count(),
                ];
            })->sortByDesc('total')->values();

            // Oficiales (destinatarios) que más memorándums recibieron de esta EPI,
            // con el desglose por tipo: "quién recibió más y de qué tipo".
            $topReceptores = $docsEpi->groupBy('id_oficial')
                ->map(function ($grupo) {
                    $of = $grupo->first()->oficial;
                    if (!$of) {
                        return null;
                    }
                    $porTipoOf = $grupo->groupBy(fn ($d) => $d->tipoDocumento?->nombre ?? 'Otro')
                        ->map->count()
                        ->sortDesc();

                    return [
                        'id_oficial' => $of->id_oficial,
                        'nombres' => $of->nombres,
                        'apellidos' => $of->apellidos,
                        'grado' => $of->grado->abreviatura ?? ($of->grado->nombre ?? ''),
                        'foto' => $of->foto ?? null,
                        'total' => $grupo->count(),
                        'tipo_principal' => $porTipoOf->keys()->first(),
                        'por_tipo' => $porTipoOf->all(),
                    ];
                })
                ->filter()
                ->sortByDesc('total')
                ->take(5)
                ->values();

            // Tiempo promedio REAL (horas) desde la subida hasta el último
            // cambio de estado registrado en historial_estados. Antes se
            // devolvía rand(18,36): datos inventados para una métrica oficial.
            $horasTotales = 0.0;
            $conTiempo = 0;
            foreach ($docsEpi as $d) {
                $inicio = $d->fecha_subida ? \Illuminate\Support\Carbon::parse($d->fecha_subida) : null;
                if (!$inicio) {
                    continue;
                }
                $hist = $d->historialEstados->sortBy('fecha');
                $fin = $hist->isNotEmpty() ? \Illuminate\Support\Carbon::parse($hist->last()->fecha) : now();
                $horasTotales += max(0, (float) $inicio->diffInHours($fin));
                $conTiempo++;
            }
            $tiempoPromedioHoras = $conTiempo > 0 ? round($horasTotales / $conTiempo, 1) : 0;

            return [
                'id_epi' => $epi->id_epi,
                'nombre' => $epi->nombre,
                'codigo' => $epi->codigo,
                'ubicacion' => $epi->ubicacion,
                'secretario' => $sec ? [
                    'id_usuario' => $sec->id_usuario,
                    'usuario' => $sec->usuario,
                    'correo' => $sec->correo,
                    'foto' => $sec->foto,
                    'estado' => $sec->estado,
                ] : null,
                'metricas' => [
                    'total_documentos' => $total,
                    'enviados' => $enviados,
                    'en_revision' => $enRevision,
                    'observados' => $observados,
                    'aprobados' => $aprobados,
                    'registrados' => $registrados,
                    'tasa_aprobacion' => $tasaAprobacion,
                    'tasa_observacion' => $tasaObservacion,
                    'tiempo_promedio_horas' => $tiempoPromedioHoras,
                ],
                'por_tipo' => $porTipo,
                'por_tipo_detalle' => $porTipoDetalle,
                'top_receptores' => $topReceptores,
            ];
        });

        // ══════════════════════════════════════════════════════════════
        // CONSOLIDADO GLOBAL — fusiona el antiguo módulo de Estadísticas.
        // Todo viaja en la MISMA respuesta: la vista no hace peticiones extra.
        // ══════════════════════════════════════════════════════════════
        $totalGlobal = $documentos->count();
        $aprobadosGlobal = $documentos->whereIn('estado_actual', [6, 7, 8])->count();
        $observadosGlobal = $documentos->whereIn('estado_actual', [4, 5])->count();

        $resumenGlobal = [
            'total' => $totalGlobal,
            'aprobados' => $aprobadosGlobal,
            'observados' => $observadosGlobal,
            'en_proceso' => $documentos->whereIn('estado_actual', [1, 2, 3])->count(),
            'registrados' => $documentos->where('estado_actual', 8)->count(),
            'epis_activas' => $epis->count(),
            'epis_con_carga' => $documentos->pluck('id_epi')->unique()->count(),
        ];
        $resumenGlobal['tasa_aprobacion'] = $totalGlobal > 0 ? round(($aprobadosGlobal / $totalGlobal) * 100, 1) : 0;
        $resumenGlobal['tasa_observacion'] = $totalGlobal > 0 ? round(($observadosGlobal / $totalGlobal) * 100, 1) : 0;

        // Distribución por estado (formato de serie, listo para gráficas)
        $porEstado = $documentos
            ->groupBy(fn ($d) => $d->estado?->nombre ?? 'Sin estado')
            ->map(fn ($grupo, $nombre) => ['estado' => $nombre, 'total' => $grupo->count()])
            ->values()
            ->sortByDesc('total')
            ->values();

        // Tipos de memorándum MÁS y MENOS usados, con la EPI que más los emite
        $tiposMasUsados = $tipos->map(function ($t) use ($documentos, $epis) {
            $d = $documentos->where('id_tipo', $t->id_tipo);
            $idEpiTop = $d->groupBy('id_epi')->sortDesc()->keys()->first();

            return [
                'id_tipo' => $t->id_tipo,
                'tipo' => $t->nombre,
                'total' => $d->count(),
                'aprobados' => $d->whereIn('estado_actual', [6, 7, 8])->count(),
                'observados' => $d->whereIn('estado_actual', [4, 5])->count(),
                'epi_principal' => $idEpiTop ? $epis->firstWhere('id_epi', $idEpiTop)?->nombre : null,
            ];
        })->sortByDesc('total')->values();

        // Ranking global de destinatarios (quién recibió más memorándums)
        $topReceptoresGlobal = $documentos->groupBy('id_oficial')
            ->map(function ($grupo) {
                $of = $grupo->first()->oficial;
                if (!$of) {
                    return null;
                }
                $porTipoOf = $grupo->groupBy(fn ($d) => $d->tipoDocumento?->nombre ?? 'Otro')
                    ->map->count()
                    ->sortDesc();

                return [
                    'id_oficial' => $of->id_oficial,
                    'nombres' => $of->nombres,
                    'apellidos' => $of->apellidos,
                    'grado' => $of->grado->abreviatura ?? ($of->grado->nombre ?? ''),
                    'foto' => $of->foto ?? null,
                    'epi_origen' => $grupo->first()->epi?->nombre,
                    'total' => $grupo->count(),
                    'observados' => $grupo->whereIn('estado_actual', [4, 5])->count(),
                    'tipo_principal' => $porTipoOf->keys()->first(),
                ];
            })
            ->filter()
            ->sortByDesc('total')
            ->take(8)
            ->values();

        return response()->json([
            'epis' => $resultado,
            'resumen_global' => $resumenGlobal,
            'por_estado' => $porEstado,
            'tipos_mas_usados' => $tiposMasUsados,
            'top_receptores_global' => $topReceptoresGlobal,
        ]);
    }

    /**
     * Estadísticas generales consolidadas
     */
    public function estadisticasGenerales(): JsonResponse
    {
        $documentos = Documento::with(['tipoDocumento', 'estado', 'epi'])->get();
        $total = $documentos->count();

        $aprobados = $documentos->whereIn('estado_actual', [6, 7, 8])->count();
        $observados = $documentos->whereIn('estado_actual', [4, 5])->count();
        $enRevision = $documentos->whereIn('estado_actual', [2, 3])->count();
        $registrados = $documentos->where('estado_actual', 8)->count();

        $porEstado = $documentos->groupBy('estado.nombre')->map->count();
        $porTipo = $documentos->groupBy('tipoDocumento.nombre')->map->count();
        $porEpi = $documentos->groupBy('epi.nombre')->map->count();

        return response()->json([
            'total_documentos' => $total,
            'aprobados' => $aprobados,
            'observados' => $observados,
            'en_revision' => $enRevision,
            'registrados' => $registrados,
            'tasa_aprobacion' => $total > 0 ? round(($aprobados / $total) * 100, 1) : 0,
            'por_estado' => $porEstado,
            'por_tipo' => $porTipo,
            'por_epi' => $porEpi,
        ]);
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\RegistroLink;
use App\Models\SolicitudRegistro;
use App\Models\Usuario;
use App\Services\ColaVerificacionIA;
use App\Services\VerificadorIA;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class SolicitudRegistroController extends Controller
{
    /**
     * Lista de solicitudes de registro (panel interno).
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'estado_solicitud' => ['nullable', 'in:recibida,en_cola,verificada,aprobada,rechazada'],
            'con_advertencia' => ['nullable', 'boolean'],
            'q' => ['nullable', 'string', 'max:100'],
            'paginar' => ['sometimes','boolean'],
            'por_pagina' => ['sometimes','integer','min:1','max:50'],
            'page' => ['sometimes','integer','min:1','max:1000000'],
            'ia_estado' => ['nullable','in:pendiente,en_cola,verificando,procesada,error'],
        ]);
        $query = $request->boolean('paginar') ? SolicitudRegistro::with(['rol','epi'])
            : SolicitudRegistro::with(['link.rol', 'link.epi', 'rol', 'epi', 'usuarioCreado']);

        if (isset($filters['estado_solicitud'])) {
            $query->where('estado_solicitud', $filters['estado_solicitud']);
        }

        if (isset($filters['con_advertencia'])) {
            $query->where('ia_advertencia', (bool) $filters['con_advertencia']);
        }
        if (!empty($filters['ia_estado'])) $query->where('ia_estado',$filters['ia_estado']);

        if (!empty($filters['q'])) {
            $q = trim($filters['q']);
            $query->where(function ($qb) use ($q) {
                $qb->where('nombres', 'ilike', "%{$q}%")
                    ->orWhere('apellidos', 'ilike', "%{$q}%")
                    ->orWhere('telefono', 'ilike', "%{$q}%")
                    ->orWhere('usuario', 'ilike', "%{$q}%")
                    ->orWhere('ci', 'ilike', "%{$q}%");
            });
        }

        if ($request->boolean('paginar')) {
            $pagina = $query->orderByDesc('id_solicitud')->paginate((int)($filters['por_pagina'] ?? 20),['*'],'page',(int)($filters['page'] ?? 1));
            $archivos = app(\App\Services\ArchivosRegistro::class);
            foreach ($pagina->items() as $fila) $fila->setAttribute('adjuntos',$archivos->estado($fila));
            $stats = SolicitudRegistro::selectRaw("COUNT(*) FILTER (WHERE estado_solicitud IN ('recibida','verificada')) AS recibidas, COUNT(*) FILTER (WHERE estado_solicitud='aprobada') AS aprobadas, COUNT(*) FILTER (WHERE ia_advertencia) AS advertencias")->first();
            return response()->json(['data'=>$pagina->items(),
                'meta'=>['pagina'=>$pagina->currentPage(),'ultima_pagina'=>$pagina->lastPage(),'total'=>$pagina->total(),'por_pagina'=>$pagina->perPage()],
                'estadisticas'=>['recibidas'=>(int)$stats->recibidas,'aprobadas'=>(int)$stats->aprobadas,'advertencias'=>(int)$stats->advertencias],
            ]);
        }
        $solicitudes = $query->orderByDesc('id_solicitud')->get();

        return response()->json($solicitudes);
    }

    public function show(string|int $id): JsonResponse
    {
        $solicitud = SolicitudRegistro::with(['link.rol', 'link.epi', 'link.emisor', 'rol', 'epi', 'usuarioCreado.epi'])
            ->findOrFail($id);
        $solicitud->setAttribute('adjuntos',app(\App\Services\ArchivosRegistro::class)->estado($solicitud));

        return response()->json($solicitud);
    }

    /** Acceso al memo/foto de un registro, limitado al Comando General. */
    public function archivo(Request $request, string|int $id, string $tipo): \Symfony\Component\HttpFoundation\Response
    {
        abort_unless((int) $request->user()->id_rol === 3, 404);
        abort_unless(in_array($tipo, ['memo', 'foto'], true), 404);
        $solicitud = SolicitudRegistro::findOrFail($id);
        $ruta = ltrim(str_replace('\\', '/', (string) ($tipo === 'memo' ? $solicitud->ruta_memo : $solicitud->ruta_foto)), '/');
        abort_unless(str_starts_with($ruta, 'solicitudes/'), 404);

        $disk = \Illuminate\Support\Facades\Storage::disk('local');
        if (!$disk->exists($ruta)) {
            $disk = \Illuminate\Support\Facades\Storage::disk('public');
        }
        abort_unless($disk->exists($ruta), 404);
        $mime = $tipo === 'memo' ? 'application/pdf' : (str_ends_with(strtolower($ruta), '.png') ? 'image/png' : 'image/jpeg');

        return $disk->response($ruta, basename($ruta), [
            'Content-Type' => $mime,
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * Formulario PÚBLICO de registro (el oficial llega por el link de WhatsApp).
     * Sube el memo de designación, crea la cuenta en BD (estado inactivo hasta
     * aprobación) y deja la solicitud lista para la verificación IA.
     */
    public function registrarPublico(string $token, Request $request): JsonResponse
    {
        $rutas = [];
        try {
            return DB::transaction(function () use ($token, $request, &$rutas) {
                return $this->recibirRegistro($token, $request, $rutas);
            });
        } catch (\Throwable $error) {
            foreach ($rutas as $ruta) Storage::disk('local')->delete($ruta);
            throw $error;
        }
    }

    private function recibirRegistro(string $token, Request $request, array &$rutas): JsonResponse
    {
        $link = RegistroLink::with(['rol', 'epi'])
            ->where('token', $token)
            ->lockForUpdate()
            ->first();

        if (!$link || $link->estado !== 'activo' || ($link->fecha_expiracion && $link->fecha_expiracion->lte(now()))) {
            return response()->json(['message' => 'El enlace de registro no es válido o ya fue utilizado.'], 404);
        }

        $validated = $request->validate([
            'nombres' => [
                'required', 'string', 'min:2', 'max:100',
                'regex:/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\']+( [A-Za-zÁÉÍÓÚÜÑáéíóúüñ\']+)*$/u',
                function (string $attribute, mixed $value, \Closure $fail) {
                    if (!self::nombreConAspectoReal((string) $value)) {
                        $fail('Ingrese NOMBRES reales (cada palabra con letras y vocales, sin texto inventado como "jadajij").');
                    }
                },
            ],
            'apellidos' => [
                'required', 'string', 'min:2', 'max:100',
                'regex:/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\']+( [A-Za-zÁÉÍÓÚÜÑáéíóúüñ\']+)*$/u',
                function (string $attribute, mixed $value, \Closure $fail) {
                    if (!self::nombreConAspectoReal((string) $value)) {
                        $fail('Ingrese APELLIDOS reales (cada palabra con letras y vocales, sin texto inventado como "jadajij").');
                    }
                },
            ],
            // CI: parte numérica de 7, 8 o 9 dígitos + complemento opcional (ej. "4892301 LP").
            'ci' => ['nullable', 'string', 'max:20', 'regex:/^[0-9]{7,9}( [A-Za-z]{1,2})?$/'],
            // Celular boliviano: EXACTAMENTE 8 dígitos, comienza en 6 o 7.
            'telefono' => ['required', 'string', 'regex:/^[67][0-9]{7}$/'],
            'usuario' => 'nullable|string|min:3|max:50|regex:/^[a-zA-Z0-9_.-]+$/',
            'password' => ['required', 'string', 'max:255', \Illuminate\Validation\Rules\Password::min(12)->letters()->mixedCase()->numbers()->symbols()],
            // Foto de perfil obligatoria: la IA debe detectar un rostro.
            'foto' => 'required|image|mimes:jpg,jpeg,png|max:5120',
            // 50 MB: memos escaneados/fotografiados en alta resolución.
            'archivo' => 'required|file|mimes:pdf|max:51200',
        ], [
            'archivo.max' => 'El memorándum en PDF no puede superar los 50 MB.',
            'archivo.mimes' => 'El memorándum debe estar en formato PDF.',
        ]);

        $nombres = trim($validated['nombres']);
        $apellidos = trim($validated['apellidos']);

        // Usuario de acceso: el que digita la persona o uno autogenerado único.
        $usuario = $this->usuarioUnico(
            isset($validated['usuario']) && $validated['usuario'] !== ''
                ? mb_strtolower($validated['usuario'])
                : $this->slugUsuario($nombres . ' ' . $apellidos)
        );

        // Guardar el memo fuera del directorio público.
        $archivo = $request->file('archivo');
        $ruta = $archivo->storeAs('solicitudes', Str::uuid() . '.pdf', 'local');
        abort_unless($ruta, 500, 'No se pudo guardar el archivo. Intente nuevamente.');
        $rutas[] = $ruta;
        $rutaAbsoluta = \Illuminate\Support\Facades\Storage::disk('local')->path($ruta);
        $hashMemo = hash_file('sha256', $rutaAbsoluta);

        // Guardar la foto de perfil fuera del directorio público.
        $foto = $request->file('foto');
        $extensionFoto = strtolower($foto->getClientOriginalExtension() ?: 'jpg');
        $rutaFoto = $foto->storeAs('solicitudes/fotos', Str::uuid() . '.' . $extensionFoto, 'local');
        abort_unless($rutaFoto, 500, 'No se pudo guardar la fotografía. Intente nuevamente.');
        $rutas[] = $rutaFoto;

        // Crear la cuenta (inactiva hasta que el panel la apruebe tras la verificación IA)
        $usuarioNuevo = Usuario::create([
            'id_rol' => $link->id_rol,
            'id_epi' => $link->id_epi,
            'usuario' => $usuario,
            'password' => Hash::make($validated['password']),
            'correo' => $usuario . '@registro.ofbol',
            'estado' => false,
            'created_at' => now(),
        ]);

        $solicitud = SolicitudRegistro::create([
            'id_link' => $link->id_link,
            'token' => $link->token,
            'id_rol' => $link->id_rol,
            'id_epi' => $link->id_epi,
            'nombres' => $nombres,
            'apellidos' => $apellidos,
            'ci' => $validated['ci'] ?? null,
            'telefono' => trim($validated['telefono']),
            'usuario' => $usuario,
            'ruta_memo' => $ruta,
            'ruta_foto' => $rutaFoto,
            'hash_memo' => $hashMemo,
            'estado_solicitud' => 'recibida',
            // EN COLA: la verificación IA arranca sola (FIFO, sin botones).
            'ia_estado' => 'en_cola',
            'id_usuario_creado' => $usuarioNuevo->id_usuario,
            'creado_en' => now(),
        ]);

        // VERIFICACIÓN AUTOMÁTICA: la solicitud queda EN COLA y se despacha un
        // worker en segundo plano que procesa la cola FIFO (memo + foto).
        // El formulario responde al instante; la IA empieza a trabajar ya.
        $link->update(['estado' => 'utilizado']);
        DB::afterCommit(fn () => $this->despacharWorker());

        return response()->json([
            'message' => 'Su solicitud fue recibida y está EN COLA de verificación automática (firma, sello, identidad y foto de perfil). En cuanto la IA valide su memo podrá ingresar al sistema.',
            'solicitud' => $solicitud->load(['link.rol', 'link.epi', 'rol', 'epi']),
            'credenciales' => [
                'usuario' => $usuario,
                'rol' => $link->rol?->nombre ?? 'Usuario',
                'epi' => $link->epi?->nombre ?? null,
                'estado' => 'inactivo (en verificación)',
            ],
        ], 201);
    }

    /**
     * Ejecuta (o re-ejecuta) la verificación con la IA local.
     */
    public function verificarIA(string|int $id, Request $request): JsonResponse
    {
        $datos = $request->validate(['forzar'=>['sometimes','boolean']]);
        $solicitud = SolicitudRegistro::with(['link'])->findOrFail($id);
        $verificador = app(VerificadorIA::class);

        try {
            $resultado = $this->ejecutarVerificacion($solicitud, $verificador, (bool) ($datos['forzar'] ?? false));
        } catch (\Illuminate\Validation\ValidationException $error) {
            return response()->json(['message'=>implode(' ',array_merge(...array_values($error->errors()))), 'errors'=>$error->errors()],422);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $error) {
            throw $error;
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Falló la verificación de una solicitud de registro.', [
                'exception' => $e,
                'solicitud_id' => $solicitud->id_solicitud,
            ]);
            return response()->json([
                'message' => 'No se pudo completar la revisión con el modelo local. Compruebe que LM Studio esté disponible y vuelva a intentar.',
            ], 502);
        }

        return response()->json([
            'message' => $resultado['advertencia']
                ? 'Verificación completada con ADVERTENCIAS.'
                : 'Verificación completada correctamente.',
            'solicitud' => $solicitud->load(['link.rol', 'link.epi', 'usuarioCreado'])->setAttribute('adjuntos',app(\App\Services\ArchivosRegistro::class)->estado($solicitud)),
            'tiempo_seg' => $resultado['tiempo_seg'] ?? null,
        ]);
    }

    /** Recuperar originales ausentes sin sustituir identidad ni activar cuentas. */
    public function actualizarAdjuntos(string|int $id, Request $request): JsonResponse
    {
        abort_unless((int)$request->user()->id_rol === 3,403);
        $request->validate([
            'archivo'=>['required_without:foto','file','mimes:pdf','max:51200'],
            'foto'=>['required_without:archivo','image','mimes:jpg,jpeg,png','max:5120'],
        ], ['archivo.max'=>'El memorándum no puede superar los 50 MB.']);
        $lock = \Illuminate\Support\Facades\Cache::lock(\App\Services\VerificacionRegistro::claveBloqueo((int)$id),3600);
        abort_unless($lock->get(),409,'La solicitud está en verificación. Espere el resultado antes de cambiar los adjuntos.');
        $nuevos = [];
        try {
            $solicitud = DB::transaction(function () use ($id,$request,&$nuevos) {
                $s = SolicitudRegistro::lockForUpdate()->findOrFail($id);
                abort_if(in_array($s->estado_solicitud,['aprobada','rechazada'],true),409,'La solicitud ya fue resuelta.');
                $antes = ['memo'=>$s->ruta_memo,'foto'=>$s->ruta_foto,'hash'=>$s->hash_memo];
                if ($request->hasFile('archivo')) {
                    $ruta = $request->file('archivo')->storeAs('solicitudes',Str::uuid().'.pdf','local');
                    abort_unless($ruta,500,'No se pudo guardar el memorándum.');$nuevos[]=$ruta;
                    $s->ruta_memo=$ruta;$s->hash_memo=hash_file('sha256',Storage::disk('local')->path($ruta));
                }
                if ($request->hasFile('foto')) {
                    $file=$request->file('foto');$ruta=$file->storeAs('solicitudes/fotos',Str::uuid().'.'.$file->extension(),'local');
                    abort_unless($ruta,500,'No se pudo guardar la fotografía.');$nuevos[]=$ruta;$s->ruta_foto=$ruta;
                }
                $s->fill(['ia_estado'=>'pendiente','ia_firma'=>null,'ia_sello'=>null,'ia_coincide'=>null,'ia_rostro'=>null,
                    'ia_nombres'=>null,'ia_advertencia'=>true,'ia_mensaje'=>'Adjuntos actualizados. Ejecute la verificación antes de decidir.',
                    'ia_verificado_en'=>null,'estado_solicitud'=>'recibida'])->save();
                \App\Models\Auditoria::create(['id_usuario'=>$request->user()->id_usuario,'tabla'=>'solicitudes_registro','accion'=>'actualizar_adjuntos',
                    'descripcion'=>json_encode(['solicitud'=>$s->id_solicitud,'anteriores'=>$antes,'nuevos'=>['memo'=>$s->ruta_memo,'foto'=>$s->ruta_foto,'hash'=>$s->hash_memo]],JSON_UNESCAPED_UNICODE),'fecha'=>now()]);
                return $s;
            });
        } catch (\Throwable $error) {
            foreach($nuevos as $ruta)Storage::disk('local')->delete($ruta);
            throw $error;
        } finally { $lock->release(); }
        // Se conservan los originales previos y su referencia en auditoría.
        return response()->json(['message'=>'Adjuntos guardados. Puede verificar el memorándum y la foto.',
            'solicitud'=>$solicitud->load(['rol','epi','usuarioCreado'])->setAttribute('adjuntos',app(\App\Services\ArchivosRegistro::class)->estado($solicitud))]);
    }

    /** Aprueba la solicitud y ACTIVA la cuenta del oficial registrado. */
    public function aprobar(string|int $id): JsonResponse
    {
        return DB::transaction(fn () => $this->aprobarBloqueado($id));
    }

    private function aprobarBloqueado(string|int $id): JsonResponse
    {
        $solicitud = SolicitudRegistro::lockForUpdate()->findOrFail($id);
        abort_if(in_array($solicitud->estado_solicitud, ['aprobada', 'rechazada'], true), 409, 'La solicitud ya fue resuelta.');

        $usuario = $solicitud->id_usuario_creado
            ? Usuario::find($solicitud->id_usuario_creado)
            : null;

        if (!$usuario) {
            return response()->json(['message' => 'La cuenta de este registro ya no existe en el sistema.'], 422);
        }

        $usuario->estado = true;
        $usuario->save();

        $solicitud->estado_solicitud = 'aprobada';
        $solicitud->resuelto_en = now();
        $solicitud->save();

        if ($solicitud->link) {
            $solicitud->link->estado = 'utilizado';
            $solicitud->link->save();
        }

        return response()->json([
            'message' => "Registro aprobado. La cuenta '{$usuario->usuario}' quedó ACTIVADA para ingresar al sistema.",
            'solicitud' => $solicitud->load(['link.rol', 'link.epi', 'usuarioCreado']),
        ]);
    }

    /**
     * Rechaza la solicitud (la cuenta permanece inactiva).
     */
    public function rechazar(string|int $id, Request $request): JsonResponse
    {
        return DB::transaction(fn () => $this->rechazarBloqueado($id, $request));
    }

    private function rechazarBloqueado(string|int $id, Request $request): JsonResponse
    {
        $solicitud = SolicitudRegistro::lockForUpdate()->findOrFail($id);
        abort_if(in_array($solicitud->estado_solicitud, ['aprobada', 'rechazada'], true), 409, 'La solicitud ya fue resuelta.');

        $validated = $request->validate([
            'observacion' => 'required|string|min:3|max:500',
        ]);

        $solicitud->estado_solicitud = 'rechazada';
        $solicitud->observacion = $validated['observacion'];
        $solicitud->resuelto_en = now();
        $solicitud->save();

        return response()->json([
            'message' => 'Solicitud rechazada. La cuenta quedó inactiva.',
            'solicitud' => $solicitud->load(['link.rol', 'link.epi', 'usuarioCreado']),
        ]);
    }

    /**
     * Ejecuta la verificación IA (memo + foto de perfil) y persiste el resultado.
     * Usada por el botón de re-verificación del panel y por la cola FIFO.
     */
    protected function ejecutarVerificacion(SolicitudRegistro $solicitud, VerificadorIA $verificador, bool $forzar = false): array
    {
        return app(\App\Services\VerificacionRegistro::class, ['verificador'=>$verificador])->verificar($solicitud, $forzar);
    }

    /**
     * Despacha el worker de la cola IA en segundo plano (sin bloquear la
     * respuesta del formulario). En Windows (Laragon) se lanza vía cmd `start /B`;
     * en Linux/production, un proceso desvinculado con `&`.
     */
    protected function despacharWorker(): void
    {
        try {
            $php = PHP_BINARY ?: 'php';
            $artisan = base_path('artisan');

            if (stripos(PHP_OS_FAMILY, 'WIN') === 0) {
                // Windows: popen ejecuta vía cmd.exe; `start "" /B` lanza el
                // proceso desvinculado (el primer "" es el título de ventana:
                // sin él, start trataría la ruta del PHP como título y no
                // ejecutaría nada). Una pasada completa de la cola por despacho.
                $cmd = 'start "" /B ' . escapeshellarg($php) . ' ' . escapeshellarg($artisan) . ' ia:procesar-cola';
                pclose(popen($cmd, 'r'));
            } else {
                $cmd = escapeshellarg($php) . ' ' . escapeshellarg($artisan) . ' ia:procesar-cola > /dev/null 2>&1 &';
                exec($cmd);
            }
        } catch (\Throwable) {
            // Si el dispatch falla (p. ej. hosting restringido), la solicitud
            // queda 'en_cola' y el daemon de Laragon la tomará luego.
        }
    }

    /**
     * Heurística anti-basura para nombres/apellidos: rechaza tokens sin
     * vocales ("jijj"), tokens de 1-2 letras sin ser partículas válidas,
     * repeticiones obvias y ruido de teclado.
     */
    public static function nombreConAspectoReal(string $nombreCompleto): bool
    {
        $particulas = ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'san', 'santa', "d'", 'da', 'di', 'do', 'von', 'van', 'mc', 'mac'];
        $tokens = preg_split('/\s+/', trim($nombreCompleto), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if (count($tokens) === 0) {
            return false;
        }

        foreach ($tokens as $token) {
            $t = mb_strtolower(trim($token, " .,;:'\"-"), 'UTF-8');
            $t = str_replace(['á','é','í','ó','ú','ü','ñ'], ['a','e','i','o','u','u','n'], $t);
            if ($t === '') {
                continue;
            }

            // Partículas válidas (de, del, la...) pueden ser cortas.
            if (in_array($t, $particulas, true)) {
                continue;
            }

            // Debe tener al menos 3 caracteres.
            if (mb_strlen($t) < 3) {
                return false;
            }

            // Debe tener al menos 2 vocales o combinación consonante+vocal variada.
            $vocales = preg_match_all('/[aeiou]/', $t);
            $unicos = count(count_chars($t, 1) ? array_unique(str_split($t)) : []);
            if ($vocales < 2 && $unicos < 3) {
                return false;
            }

            // No puede ser una sola letra repetida (ej. "aaaa", "jjjj").
            if (preg_match('/^(.)\1+$/u', $t)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Genera un nombre de usuario legible a partir del nombre completo.
     */
    protected function slugUsuario(string $nombreCompleto): string
    {
        $slug = Str::slug($nombreCompleto, '');
        if ($slug === '') {
            $slug = 'usuario' . Str::lower(Str::random(5));
        }

        return mb_substr($slug, 0, 50);
    }

    /**
     * Asegura que el nombre de usuario no exista aún (agrega sufijo numérico).
     */
    protected function usuarioUnico(string $base): string
    {
        $candidato = $base;
        for ($i = 1; $i <= 12; $i++) {
            if (!Usuario::where('usuario', $candidato)->exists()) {
                return $candidato;
            }
            $candidato = mb_substr($base, 0, 46) . $i;
        }

        return mb_substr($base, 0, 40) . Str::lower(Str::random(6));
    }
}

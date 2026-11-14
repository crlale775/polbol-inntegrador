<?php

namespace App\Http\Controllers;

use App\Models\Auditoria;
use App\Models\Usuario;
use App\Services\CopiasSeguridad;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

/**
 * Copias de seguridad de la información (solo Comando General).
 *
 * Guardar, listar, descargar (.sql), recuperar y eliminar copias. Toda acción
 * pide la contraseña de quien la ordena. Recuperar reemplaza todos los datos y
 * guarda antes una copia automática del estado actual.
 */
class CopiaSeguridadController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json($this->servicio()->listar());
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate(['nota' => ['nullable', 'string', 'max:120']]);
        if ($rechazo = $this->confirmarPassword($request)) {
            return $rechazo;
        }
        @set_time_limit(300);

        try {
            $copia = $this->servicio()->crear($request->user()->usuario, trim((string) ($datos['nota'] ?? '')));
        } catch (RuntimeException $error) {
            return response()->json(['message' => $error->getMessage()], 422);
        } catch (Throwable $error) {
            report($error);

            return response()->json(['message' => 'No se pudo guardar la copia de seguridad. Intente nuevamente.'], 500);
        }

        $this->auditar($request->user()->id_usuario, 'COPIA_CREADA', sprintf(
            'Copia de seguridad guardada con %d registros.%s',
            $copia['registros'],
            $copia['nota'] !== '' ? ' Nota: ' . $copia['nota'] : ''
        ));

        return response()->json($copia, 201);
    }

    /** Archivo .sql de la copia, para abrirlo con pgAdmin o psql. */
    public function descargar(Request $request, string|int $id): BinaryFileResponse|JsonResponse
    {
        if ($rechazo = $this->confirmarPassword($request)) {
            return $rechazo;
        }
        @set_time_limit(300);

        try {
            $ruta = $this->servicio()->rutaSql((int) $id);
        } catch (RuntimeException $error) {
            return response()->json(['message' => $error->getMessage()], 422);
        }
        abort_unless($ruta, 404, 'La copia seleccionada ya no existe.');

        $this->auditar($request->user()->id_usuario, 'COPIA_DESCARGADA', sprintf(
            'Se descargó el archivo SQL de la copia de seguridad del %s.',
            date('d/m/Y H:i', (int) $id)
        ));

        return response()->download($ruta, 'Copia_de_seguridad_Policia_Boliviana_' . date('Y-m-d_Hi', (int) $id) . '.sql', [
            'Content-Type' => 'application/sql; charset=UTF-8',
        ]);
    }

    public function recuperar(Request $request, string|int $id): JsonResponse
    {
        if ($rechazo = $this->confirmarPassword($request)) {
            return $rechazo;
        }
        $actor = $request->user();

        $servicio = $this->servicio();
        abort_unless($servicio->ruta((int) $id), 404, 'La copia seleccionada ya no existe.');
        @set_time_limit(600);

        try {
            // Red de seguridad: el estado actual queda guardado antes de reemplazarlo.
            $previa = $servicio->crear($actor->usuario, 'Guardada automáticamente antes de recuperar una copia', 'automatica');
            $resultado = $servicio->recuperar((int) $id);
        } catch (RuntimeException $error) {
            return response()->json(['message' => $error->getMessage()], 422);
        } catch (Throwable $error) {
            report($error);

            return response()->json(['message' => 'No se pudo recuperar la copia. Sus datos actuales no se modificaron.'], 500);
        }

        try {
            Cache::flush();
        } catch (Throwable) {
            // La caché es opcional; los datos ya están recuperados.
        }

        // El usuario que ordenó la recuperación puede no existir en los datos recuperados.
        if (Usuario::where('id_usuario', $actor->id_usuario)->exists()) {
            $this->auditar($actor->id_usuario, 'COPIA_RECUPERADA', sprintf(
                'Se recuperó la copia de seguridad del %s (%d registros). El estado anterior quedó guardado en otra copia.',
                date('d/m/Y H:i', (int) $id),
                $resultado['registros']
            ));
        }

        return response()->json([
            'message' => 'La información se recuperó correctamente.',
            'registros' => $resultado['registros'],
            'copia_previa' => $previa['id'],
        ]);
    }

    public function destroy(Request $request, string|int $id): JsonResponse
    {
        if ($rechazo = $this->confirmarPassword($request)) {
            return $rechazo;
        }
        abort_unless($this->servicio()->eliminar((int) $id), 404, 'La copia seleccionada ya no existe.');

        $this->auditar($request->user()->id_usuario, 'COPIA_ELIMINADA', sprintf(
            'Se eliminó la copia de seguridad del %s.',
            date('d/m/Y H:i', (int) $id)
        ));

        return response()->json(['message' => 'Copia eliminada.']);
    }

    private function servicio(): CopiasSeguridad
    {
        abort_unless(DB::connection()->getDriverName() === 'pgsql', 501, 'Las copias de seguridad requieren PostgreSQL.');

        $conexion = (array) config('database.connections.' . DB::connection()->getName(), []);

        return new CopiasSeguridad(DB::connection()->getPdo(), storage_path('app/copias-seguridad'), [
            'host' => $conexion['host'] ?? '127.0.0.1',
            'port' => $conexion['port'] ?? 5432,
            'database' => $conexion['database'] ?? null,
            'username' => $conexion['username'] ?? null,
            'password' => $conexion['password'] ?? '',
        ]);
    }

    /** Medida de seguridad: cada acción sobre las copias exige la contraseña de quien la ordena. */
    private function confirmarPassword(Request $request): ?JsonResponse
    {
        $datos = $request->validate(['password' => ['required', 'string', 'max:255']], [
            'password.required' => 'Escriba su contraseña para continuar.',
        ]);

        return Hash::check($datos['password'], (string) $request->user()->password)
            ? null
            : response()->json(['message' => 'La contraseña no es correcta. No se realizó ninguna acción.'], 422);
    }

    private function auditar(int $idUsuario, string $accion, string $descripcion): void
    {
        try {
            Auditoria::create([
                'id_usuario' => $idUsuario,
                'tabla' => 'copias_seguridad',
                'accion' => $accion,
                'descripcion' => $descripcion,
                'fecha' => now(),
            ]);
        } catch (Throwable $error) {
            report($error);
        }
    }
}

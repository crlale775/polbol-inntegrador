<?php

namespace App\Http\Middleware;

use App\Models\Auditoria;
use App\Models\Documento;
use App\Models\FlujoDocumento;
use App\Models\HistorialDestino;
use App\Models\HistorialEstado;
use App\Models\Oficial;
use App\Models\Revision;
use App\Models\Sesion;
use App\Models\Usuario;
use App\Models\Validacion;
use App\Models\VersionDocumento;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class PermisosInstitucionales
{
    public function handle(Request $request, Closure $next): Response
    {
        $actor = $request->user();
        abort_unless($actor, 401);

        $rol = (int) $actor->id_rol;
        $recurso = $request->segment(2);
        $id = $request->segment(3);
        $escritura = ! $request->isMethodSafe();

        // Todos los selectores protegidos son IDs positivos salvo el tipo de
        // adjunto. Rechazar alias (+1, espacios, exponentes) antes de PostgreSQL.
        foreach ($request->route()->parameters() as $nombre => $valor) {
            if ($nombre === 'tipo') continue;
            abort_unless(is_scalar($valor) && preg_match('/^[1-9][0-9]{0,9}$/D', (string) $valor)
                && (int) $valor <= 2147483647, 404);
        }

        abort_unless(in_array($rol, [1, 2, 3], true), 403, 'Rol institucional no habilitado.');

        if (in_array($recurso, ['registro-links', 'solicitudes-registro', 'copias-seguridad'], true)) {
            abort_unless($rol === 3, 403, 'Esta operación corresponde al Comando General.');
        }

        if ($recurso === 'panel') {
            abort_if($id === 'general' && $rol !== 3, 403);
            abort_if($id === 'departamental' && $rol === 1, 403);
        }

        if ($rol === 1) {
            $this->aplicarAlcanceEpi($request, $actor, $recurso, $id);
        }

        if ($escritura && in_array($recurso, [
            'roles', 'comando-departamental', 'epis', 'cargos', 'grados',
            'tipos-documento', 'tipos-memo', 'estados-documento',
            'tipos-observacion', 'plantillas', 'configuraciones', 'normas', 'articulos', 'reglas',
        ], true)) {
            abort_unless($rol === 3, 403, 'Solo el Comando General puede modificar este catálogo.');
        }

        if ($escritura && in_array($recurso, ['auditorias', 'sesiones', 'historial-estados'], true)) {
            abort_unless($rol === 3, 403, 'Este registro de seguridad solo puede modificarse desde Comando General.');
        }

        if ($escritura && in_array($recurso, ['oficiales', 'revisiones', 'validaciones', 'flujo-documentos', 'historial-destinos'], true)) {
            abort_unless($rol >= 2, 403, 'Esta operación requiere un rol de mando.');
        }

        if ($escritura && $recurso === 'versiones-documento') {
            abort_unless($rol >= 2, 403, 'Las versiones EPI se registran mediante la subsanación confirmada.');
        }

        if ($escritura && $recurso === 'documentos' && $request->isMethod('DELETE')) {
            abort_unless($rol === 3, 403, 'La eliminación de documentos está reservada al Comando General.');
        }

        if ($recurso === 'usuarios' && $rol !== 3) {
            if ($id) {
                $destino = Usuario::findOrFail($id);
                $propio = (int) $destino->id_usuario === (int) $actor->id_usuario;
                $secretario = $rol === 2 && (int) $destino->id_rol === 1;
                abort_unless($propio || $secretario, 403, 'No puede administrar esta cuenta.');

                if ($escritura && ! $secretario) {
                    abort_if($request->isMethod('DELETE') || $request->segment(4) === 'reset-password', 403);
                    abort_if($request->hasAny(['id_rol', 'id_epi', 'estado']), 403, 'No puede cambiar sus propios permisos.');
                }
            } else {
                abort_unless($rol === 2, 403, 'La gestión de usuarios requiere un rol de mando.');
                if ($escritura) {
                    abort_unless((int) $request->input('id_rol') === 1, 403, 'Solo puede crear cuentas de Secretaría EPI.');
                } else {
                    $request->merge(['id_rol' => 1]);
                }
            }

            if ($escritura && $request->has('id_rol')) {
                abort_unless((int) $request->input('id_rol') === 1, 403, 'No puede elevar el rol de una cuenta.');
            }
        }

        return $next($request);
    }

    private function aplicarAlcanceEpi(Request $request, Usuario $actor, ?string $recurso, ?string $id): void
    {
        $idEpi = (int) $actor->id_epi;
        abort_if($idEpi < 1, 403, 'La cuenta no tiene una EPI asignada.');

        if (in_array($recurso, ['desempenio-epis', 'estadisticas-generales'], true)) {
            abort(403, 'Las métricas globales requieren un rol de mando.');
        }

        if ($recurso === 'documentos') {
            $request->merge(['id_epi' => $idEpi]);
            if ($id && ctype_digit($id)) {
                $this->autorizarDocumento(Documento::findOrFail($id), $idEpi);
            }
            if ($request->filled('id_documento')) {
                $this->autorizarDocumento(Documento::findOrFail($request->input('id_documento')), $idEpi);
            }
            if ($request->filled('id_oficial')) {
                abort_unless(Oficial::where('id_oficial', $request->input('id_oficial'))->where('id_epi', $idEpi)->exists(), 404);
            }
        }

        if ($recurso === 'oficiales') {
            $request->merge(['id_epi' => $idEpi]);
            if ($id && ctype_digit($id)) {
                abort_unless(Oficial::where('id_oficial', $id)->where('id_epi', $idEpi)->exists(), 404);
            }
        }

        $documentoRecursos = [
            'revisiones' => Revision::class,
            'versiones-documento' => VersionDocumento::class,
            'validaciones' => Validacion::class,
            'flujo-documentos' => FlujoDocumento::class,
            'historial-estados' => HistorialEstado::class,
        ];

        if (isset($documentoRecursos[$recurso])) {
            $modelo = $documentoRecursos[$recurso];
            if ($id && ctype_digit($id)) {
                $registro = $modelo::with('documento')->findOrFail($id);
                abort_unless((int) $registro->documento?->id_epi === $idEpi, 404);
            }
            if ($request->filled('id_documento')) {
                $this->autorizarDocumento(Documento::findOrFail($request->input('id_documento')), $idEpi);
            }
        }

        if ($recurso === 'historial-destinos') {
            $request->merge(['id_epi' => $idEpi]);
            if ($id && ctype_digit($id)) {
                abort_unless(HistorialDestino::where('id_historial', $id)->where('id_epi', $idEpi)->exists(), 404);
            }
            if ($request->filled('id_oficial')) {
                abort_unless(Oficial::where('id_oficial', $request->input('id_oficial'))->where('id_epi', $idEpi)->exists(), 404);
            }
        }

        if ($recurso === 'usuarios' && $id) {
            abort_unless((int) Usuario::findOrFail($id)->id_usuario === (int) $actor->id_usuario, 404);
        }

        if ($recurso === 'sesiones') {
            $request->merge(['id_usuario' => $actor->id_usuario]);
            if ($id && ctype_digit($id)) {
                abort_unless(Sesion::where('id_sesion', $id)->where('id_usuario', $actor->id_usuario)->exists(), 404);
            }
        }

        if ($recurso === 'auditorias') {
            $request->merge(['id_usuario' => $actor->id_usuario]);
            if ($id && ctype_digit($id)) {
                abort_unless(Auditoria::where('id_auditoria', $id)->where('id_usuario', $actor->id_usuario)->exists(), 404);
            }
        }

        if ($recurso === 'notificaciones') {
            $request->merge(['id_usuario' => $actor->id_usuario]);
            if ($request->filled('id_documento')) {
                $this->autorizarDocumento(Documento::findOrFail($request->input('id_documento')), $idEpi);
            }
        }
    }

    private function autorizarDocumento(Documento $documento, int $idEpi): void
    {
        abort_unless((int) $documento->id_epi === $idEpi, 404);
    }
}

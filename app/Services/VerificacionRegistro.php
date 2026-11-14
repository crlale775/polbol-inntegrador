<?php

namespace App\Services;

use App\Models\SolicitudRegistro;
use Illuminate\Support\Facades\{Cache, DB, Log};
use Illuminate\Validation\ValidationException;

/** Único flujo para el panel y la cola. Nunca activa cuentas. */
class VerificacionRegistro
{
    public function __construct(protected VerificadorIA $verificador, protected ArchivosRegistro $archivos) {}

    public static function claveBloqueo(int $id): string { return 'registro:verificacion:'.$id; }

    public function verificar(SolicitudRegistro $solicitud, bool $forzar = false): array
    {
        $lock = Cache::lock(self::claveBloqueo($solicitud->id_solicitud), 3600);
        abort_unless($lock->get(), 409, 'Esta solicitud ya se está verificando. Espere el resultado.');
        try {
            $solicitud->refresh();
            try {
                $memo = $this->archivos->ruta($solicitud->ruta_memo, 'memo');
                if (!$memo) throw ValidationException::withMessages(['archivo' => 'No se encontró el memorándum adjunto en el servidor. Vuelva a adjuntar el original para verificarlo.']);
                if ($solicitud->hash_memo && !hash_equals($solicitud->hash_memo, hash_file('sha256', $memo))) {
                    throw ValidationException::withMessages(['archivo' => 'El memorándum no coincide con la huella guardada. Vuelva a adjuntar el original antes de verificar.']);
                }
                $solicitud->update(['ia_estado'=>'verificando']);
                $inicio = microtime(true);
                $resultado = $this->verificador->analizar($memo, [
                    'nombres'=>$solicitud->nombres, 'apellidos'=>$solicitud->apellidos, 'forzar_revision'=>$forzar,
                ]);
                $foto = $this->archivos->ruta($solicitud->ruta_foto, 'foto');
                $rostro = ['es_rostro'=>null, 'mensaje'=>'Foto de perfil no disponible. Adjunte la foto original para completar su revisión.'];
                if (!empty($resultado['descartado'])) {
                    $rostro['mensaje'] = 'La foto no se analizó porque el memorándum requiere corrección.';
                } elseif ($foto) {
                    try { $rostro = $this->verificador->analizarRostro($foto, $forzar); }
                    catch (\Throwable $error) {
                        Log::warning('No se completó la revisión de la fotografía.', ['solicitud_id'=>$solicitud->id_solicitud,'exception'=>$error]);
                        $rostro['mensaje'] = 'No se pudo completar la lectura de la foto. Requiere revisión humana.';
                    }
                }
                $advertencia = !empty($resultado['descartado']) || !empty($resultado['no_concluyente'])
                    || ($resultado['coincide'] ?? null) !== true || ($resultado['firma'] ?? null) !== true
                    || ($resultado['sello'] ?? null) !== true || $rostro['es_rostro'] !== true;
                $mensaje = trim(($resultado['mensaje'] ?? '').' '.$rostro['mensaje']);
                DB::transaction(function () use ($solicitud, $resultado, $rostro, $advertencia, $mensaje) {
                    $actual = SolicitudRegistro::lockForUpdate()->findOrFail($solicitud->id_solicitud);
                    // Actualizar evidencia nunca reabre una decisión humana.
                    $actual->fill([
                        'ia_firma'=>$resultado['firma'], 'ia_sello'=>$resultado['sello'],
                        'ia_nombres'=>json_encode($resultado['nombres'], JSON_UNESCAPED_UNICODE),
                        'ia_coincide'=>$resultado['coincide'], 'ia_rostro'=>$rostro['es_rostro'],
                        'ia_mensaje'=>$mensaje, 'ia_advertencia'=>$advertencia, 'ia_estado'=>'procesada', 'ia_verificado_en'=>now(),
                    ]);
                    if ($actual->estado_solicitud === 'recibida' && !$advertencia) $actual->estado_solicitud = 'verificada';
                    $actual->save();
                });
                $solicitud->refresh();
                return array_merge($resultado, ['advertencia'=>$advertencia, 'rostro'=>$rostro['es_rostro'], 'tiempo_seg'=>round(microtime(true)-$inicio,3)]);
            } catch (\Throwable $error) {
                $mensaje = $error instanceof ValidationException ? implode(' ', array_merge(...array_values($error->errors())))
                    : 'No se pudo completar la revisión con el modelo local. Compruebe que LM Studio esté disponible y vuelva a intentar.';
                DB::transaction(function () use ($solicitud,$mensaje) {
                    $actual=SolicitudRegistro::lockForUpdate()->findOrFail($solicitud->id_solicitud);
                    $campos=['ia_estado'=>'error','ia_mensaje'=>$mensaje,'ia_advertencia'=>true];
                    if(!in_array($actual->estado_solicitud,['aprobada','rechazada'],true)) $campos += [
                        'ia_firma'=>null,'ia_sello'=>null,'ia_coincide'=>null,'ia_rostro'=>null,'ia_nombres'=>null,
                    ];
                    $actual->fill($campos)->save();
                });
                throw $error;
            }
        } finally { $lock->release(); }
    }
}

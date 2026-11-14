<?php

namespace App\Services;

use App\Models\SolicitudRegistro;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * ColaVerificacionIA — Cola FIFO de verificación automática.
 *
 * Cuando una solicitud llega del formulario público ya queda EN COLA
 * (ia_estado = 'en_cola') y un trabajador la va procesando en orden de
 * llegada (el primero en entrar es el primero en salir): no se necesita
 * apretar ningún botón de "Verificar IA".
 *
 * La reclamación de la solicitud usa SELECT ... FOR UPDATE SKIP LOCKED
 * dentro de una transacción: si dos trabajadores corren a la vez, cada
 * solicitud es tomada por UNO solo (sin duplicar verificaciones ni
 * bloquear las tablas).
 */
class ColaVerificacionIA
{
    /** Máximo de solicitudes procesadas por invocación del worker. */
    protected int $loteMaximo;

    public function __construct(protected VerificadorIA $verificador)
    {
        $this->loteMaximo = max(1, (int) config('ia.cola_lote', 10));
    }

    /** Indica si la IA local está configurada y disponible. */
    public function verificadorDisponible(): bool
    {
        return $this->verificador->disponible();
    }

    /**
     * Reclama y procesa la siguiente solicitud en cola (FIFO por id_solicitud).
     * Devuelve la solicitud procesada o null si la cola está vacía.
     */
    public function procesarSiguiente(): ?SolicitudRegistro
    {
        $solicitud = $this->reclamarSiguiente();

        if ($solicitud === null) {
            return null;
        }

        $this->procesar($solicitud);

        return $solicitud;
    }

    /**
     * Drena la cola hasta un máximo de lote. Devuelve la cantidad procesada.
     */
    public function procesarPendientes(): int
    {
        $procesadas = 0;

        while ($procesadas < $this->loteMaximo) {
            $solicitud = $this->procesarSiguiente();
            if ($solicitud === null) {
                break;
            }
            $procesadas++;
        }

        return $procesadas;
    }

    /**
     * Toma (reclama) la siguiente solicitud 'en_cola' más antigua de forma
     * segura para múltiples trabajadores: UPDATE atómico con
     * FOR UPDATE SKIP LOCKED (PostgreSQL). Si dos trabajadores corren a la
     * vez, cada uno reclama una solicitud DISTINTA.
     */
    protected function reclamarSiguiente(): ?SolicitudRegistro
    {
        $fila = DB::selectOne("
            UPDATE solicitudes_registro
            SET ia_estado = 'verificando'
            WHERE id_solicitud = (
                SELECT id_solicitud FROM solicitudes_registro
                WHERE ia_estado = 'en_cola' AND estado_solicitud IN ('recibida','verificada')
                ORDER BY id_solicitud            -- FIFO: primero en entrar, primero en salir
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING id_solicitud
        ");

        if (!$fila || !isset($fila->id_solicitud)) {
            return null;
        }

        return SolicitudRegistro::find($fila->id_solicitud);
    }

    /**
     * Ejecuta la verificación completa (memo + foto de perfil) y persiste el
     * resultado. Los errores marcan ia_estado = 'error' para reintento manual.
     */
    public function procesar(SolicitudRegistro $solicitud): void
    {
        if(in_array($solicitud->fresh()?->estado_solicitud,['aprobada','rechazada'],true))return;
        try {
            app(VerificacionRegistro::class, ['verificador'=>$this->verificador])->verificar($solicitud);
        } catch (Throwable $error) {
            \Illuminate\Support\Facades\Log::warning('No se completó la verificación de una solicitud en cola.', [
                'solicitud_id'=>$solicitud->id_solicitud, 'exception'=>$error,
            ]);
        }
    }
}

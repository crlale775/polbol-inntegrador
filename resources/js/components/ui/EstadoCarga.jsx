import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, FileUp, X } from 'lucide-react';

/**
 * Cada tarjeta de carga administra su propio temporizador de retiro: el efecto
 * que lo crea es el mismo que lo libera al desmontarse o al cambiar de estado.
 */
function TarjetaCarga({ carga, ahora, onCerrar }) {
    useEffect(() => {
        if (carga.estado !== 'completo') return undefined;
        const timer = setTimeout(() => onCerrar(carga.id), 15000);
        return () => clearTimeout(timer);
    }, [carga.estado, carga.id, onCerrar]);

    const activa = ['subiendo', 'procesando'].includes(carga.estado);
    const segundos = activa ? Math.max(0, Math.floor(((ahora || performance.now()) - carga.inicio) / 1000)) : carga.segundos.toFixed(1);
    const Icono = carga.estado === 'error' ? AlertTriangle : carga.estado === 'completo' ? CheckCircle2 : FileUp;
    const titulo = carga.estado === 'subiendo' ? 'Transfiriendo archivo' : carga.estado === 'procesando'
        ? (carga.revision ? 'Revisando documento' : 'Confirmando recepción')
        : carga.estado === 'error' ? 'No se pudo completar' : 'Proceso terminado';
    return <section className={`ofbol-upload-status ofbol-upload-status--${carga.estado}`}>
        <div className="flex items-start gap-3">
            <Icono size={21} aria-hidden="true" className="shrink-0 mt-1" />
            <div className="min-w-0 flex-1">
                <p className="font-bold text-sm" role="status">{titulo}</p>
                <p className="text-xs truncate mt-1" title={carga.nombre}>{carga.nombre}</p>
            </div>
            {!activa && <button className="ofbol-upload-close" aria-label="Cerrar estado de carga" onClick={() => onCerrar(carga.id)}><X size={16} /></button>}
        </div>
        {carga.estado === 'subiendo' && <progress className="ofbol-upload-progress" max="100" value={carga.porcentaje ?? undefined} aria-label="Transferencia del archivo" />}
        <div className="flex justify-between gap-3 mt-3 text-xs tabular-nums">
            <span>{carga.estado === 'subiendo' ? `${carga.porcentaje ?? 0}% transferido` : carga.estado === 'procesando' ? 'Esperando respuesta del servidor' : carga.estado === 'error' ? 'Sin confirmación' : 'Respuesta recibida'}</span>
            <span>{segundos} s</span>
        </div>
        {(carga.mensaje || (activa && Number(segundos) >= 30)) && <p className="text-xs leading-relaxed mt-3">{carga.mensaje || 'El análisis está tardando. Mantenga esta ventana abierta; aún no hay un resultado confirmado.'}</p>}
    </section>;
}

/** Estado compartido para cargas en registro, correcciones, perfiles y solicitudes. */
export default function EstadoCarga() {
    const [cargas, setCargas] = useState({});
    const [ahora, setAhora] = useState(0);
    const cerrar = useCallback((id) => {
        setCargas((prev) => { const next = { ...prev }; delete next[id]; return next; });
    }, []);
    useEffect(() => {
        const recibir = ({ detail }) => {
            setCargas((prev) => ({ ...Object.fromEntries(Object.entries(prev).slice(-2)), [detail.id]: detail }));
        };
        window.addEventListener('ofbol:carga', recibir);
        return () => { window.removeEventListener('ofbol:carga', recibir); };
    }, []);
    const activas = Object.values(cargas).some((c) => ['subiendo', 'procesando'].includes(c.estado));
    useEffect(() => {
        if (!activas) return undefined;
        const timer = setInterval(() => setAhora(performance.now()), 1000);
        return () => clearInterval(timer);
    }, [activas]);
    return <aside className="ofbol-upload-stack" aria-label="Estado de carga de archivos">
        {Object.values(cargas).slice(-3).map((c) => (
            <TarjetaCarga key={c.id} carga={c} ahora={ahora} onCerrar={cerrar} />
        ))}
    </aside>;
}

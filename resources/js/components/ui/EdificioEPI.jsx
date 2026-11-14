/**
 * EdificioEPI — Estación Policial Integral representada como un EDIFICIO 3D
 * (CSS puro, sin librerías 3D pesadas).
 *
 * - Clickeable: abre el detalle de documentos de la EPI.
 * - Las ventanas se ILUMINAN según la carga de trabajo real:
 *     · en revisión  → ventanas ámbar parpadeando
 *     · observados   → ventanas rojas fijas
 *     · aprobados    → ventanas verdes
 *     · sin carga    → ventanas apagadas
 * - Placa institucional con el nombre y contador en vivo.
 * - Efecto hover: el edificio "se levanta" con sombra proyectada.
 */
import React from 'react';

export default function EdificioEPI({ epi, resumen, onClick, index = 0, activa = false }) {
    const total = resumen?.total ?? 0;
    const enRevision = resumen?.en_revision ?? 0;
    const observados = resumen?.observados ?? 0;
    const aprobados = resumen?.aprobados ?? 0;

    // Compact schematic: volume remains readable without oversized towers.
    const pisos = Math.min(7, Math.max(3, 2 + Math.ceil(total / 8)));
    const ventanasPorPiso = 4;

    // Distribución de ventanas encendidas proporcional a la carga real
    const totalVentanas = pisos * ventanasPorPiso;
    const nRevision = Math.min(totalVentanas, Math.round((enRevision / Math.max(total, 1)) * totalVentanas * 0.7));
    const nObservadas = Math.min(totalVentanas - nRevision, Math.round((observados / Math.max(total, 1)) * totalVentanas * 0.7));
    const nAprobadas = Math.min(totalVentanas - nRevision - nObservadas, Math.round((aprobados / Math.max(total, 1)) * totalVentanas * 0.7));

    // Semilla estable por EPI para que el parpadeo no sea idéntico entre edificios
    const semilla = (epi.id_epi || 0) * 7 + index * 13;

    const claseVentana = (i) => {
        if (i < nRevision) return 'epi-ventana epi-ventana--revision';
        if (i < nRevision + nObservadas) return 'epi-ventana epi-ventana--observada';
        if (i < nRevision + nObservadas + nAprobadas) return 'epi-ventana epi-ventana--aprobada';
        return 'epi-ventana';
    };

    // Alerta visual: EPI con observados necesita atención
    const alerta = observados > 0;

    // Borde de selección cuando la EPI está abierta abajo
    const estiloPlaca = activa
        ? { borderColor: '#4d7750', boxShadow: '0 0 0 2px rgba(77, 119, 80, 0.2)', background: '#edf4e5' }
        : undefined;
    const ocupacion = total === 0 ? 'vacia' : observados > 0 ? 'alerta' : enRevision > 0 ? 'activa' : 'tranquila';

    return (
        <button
            type="button"
            onClick={onClick}
            className="epi-edificio-wrap group"
            style={{ animationDelay: `${index * 70}ms` }}
            aria-label={`Abrir documentos de ${epi.nombre} (${total} documentos)`}
            aria-pressed={activa}
        >
            {/* Halo de alerta */}
            {alerta && <span className="epi-halo-alerta" />}

            <div className="epi-edificio" data-ocupacion={ocupacion} aria-hidden="true">
                {/* Antena con luz */
                }
                <span className="epi-antena" />
                <span className="epi-luz-antena" style={{ animationDelay: `${(semilla % 10) * 120}ms` }} />

                {/* Cuerpo del edificio: pisos y ventanas */}
                <div className="epi-cuerpo">
                    {Array.from({ length: pisos }).map((_, piso) => (
                        <div key={piso} className="epi-piso">
                            {Array.from({ length: ventanasPorPiso }).map((__, col) => {
                                const i = piso * ventanasPorPiso + col;
                                return (
                                    <span
                                        key={col}
                                        className={claseVentana(i)}
                                        style={{ animationDelay: `${((semilla + i * 3) % 14) * 180}ms` }}
                                    />
                                );
                            })}
                        </div>
                    ))}

                    {/* Puerta de entrada */}
                    <div className="epi-puerta">
                        <span className="epi-puerta-luz" />
                    </div>
                </div>

                {/* Lateral 3D */}
                <div className="epi-lateral" />
            </div>

            {/* Placa institucional */}
            <div className="epi-placa" style={estiloPlaca}>
                <span className="epi-placa-codigo">{epi.codigo || `EPI ${epi.id_epi}`}</span>
                <span className="epi-placa-nombre">{(epi.nombre || '').replace(/^EPI\s*\d+\s*/i, '')}</span>
                <span className="epi-placa-contadores">
                    <b className={enRevision > 0 ? 'text-amber-600' : ''}>{enRevision}</b> rev
                    <i>·</i>
                    <b className={observados > 0 ? 'text-red-600' : ''}>{observados}</b> obs
                    <i>·</i>
                    <b className={aprobados > 0 ? 'text-emerald-600' : ''}>{aprobados}</b> apr
                    <i>·</i>
                    <b className="text-slate-800">{total}</b> tot
                </span>
                {/* Barra de presión de carga */}
                <span className="epi-carga">
                    <span
                        className="epi-carga-fill"
                        style={{
                            width: `${Math.min(100, (total / 12) * 100)}%`,
                            background: alerta
                                ? '#8f2020'
                                : enRevision > 0
                                ? '#9a6f0a'
                                : '#1a5c52',
                        }}
                    />
                </span>
            </div>

            {/* CTA que aparece en hover */}
            <span className="epi-cta">Abrir jurisdicción →</span>
        </button>
    );
}

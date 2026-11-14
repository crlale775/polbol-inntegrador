import React from 'react';

/**
 * CargandoLista — esqueleto de tabla/listado mientras llegan los datos.
 * Reemplaza al spinner centrado: conserva la forma de la pantalla, así el
 * contenido aparece en su sitio y la espera se percibe más corta.
 */
const ANCHOS = ['92%', '78%', '86%', '70%', '88%', '74%', '82%', '68%'];

export default function CargandoLista({ filas = 7, etiqueta = 'Cargando datos' }) {
    return (
        <div className="ofbol-cargando-lista" role="status" aria-label={etiqueta}>
            <p className="sr-only">{etiqueta}…</p>
            <div className="ofbol-cargando-cabecera" aria-hidden="true">
                <span className="ofbol-skeleton" style={{ width: '18%' }} />
                <span className="ofbol-skeleton" style={{ width: '14%' }} />
                <span className="ofbol-skeleton" style={{ width: '24%' }} />
                <span className="ofbol-skeleton" style={{ width: '12%' }} />
            </div>
            {Array.from({ length: filas }, (_, i) => (
                <div key={i} className="ofbol-cargando-fila" aria-hidden="true">
                    <span className="ofbol-skeleton ofbol-cargando-avatar" />
                    <span className="ofbol-cargando-texto">
                        <span className="ofbol-skeleton" style={{ width: ANCHOS[i % ANCHOS.length] }} />
                        <span className="ofbol-skeleton ofbol-cargando-sub" style={{ width: `${40 + ((i * 13) % 30)}%` }} />
                    </span>
                    <span className="ofbol-skeleton ofbol-cargando-chip" />
                </div>
            ))}
        </div>
    );
}

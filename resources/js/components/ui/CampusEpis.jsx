import React, { useId, useMemo, useState } from 'react';
import { Building2, Search, LayoutGrid, List, ArrowUpRight } from 'lucide-react';
import EdificioEPI from './EdificioEPI';
import { EstadoVacio } from './Graficos';
import { resumenDeEpi } from '../../lib/desempenio';

const textKey = (text) => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** One light, data-driven campus reused by dashboards and both command levels. */
export default function CampusEpis({ epis = [], seleccionada, onSeleccion, titulo = 'Campus operativo de EPIs', compacto = false }) {
    const heading = useId();
    const searchId = useId();
    const [query, setQuery] = useState('');
    const [state, setState] = useState('todas');
    const [view, setView] = useState('edificios');
    const filtered = useMemo(() => epis.filter((epi) => {
        const summary = resumenDeEpi(epi);
        const matches = textKey(`${epi.nombre} ${epi.codigo ?? ''} ${epi.ubicacion ?? ''}`).includes(textKey(query));
        return matches && (state === 'todas' || (state === 'observadas' && summary.observados > 0)
            || (state === 'revision' && summary.en_revision > 0) || (state === 'sin-carga' && summary.total === 0));
    }), [epis, query, state]);
    const clear = () => { setQuery(''); setState('todas'); };

    return <section className={`ofbol-card ofbol-campus-panel ${compacto ? 'ofbol-campus-panel--compact' : ''}`} aria-labelledby={heading}>
        <header className="ofbol-campus-heading">
            <div><h2 id={heading} className="ofbol-titulo-seccion flex items-center gap-2"><Building2 size={19} aria-hidden="true" />{titulo}</h2>
                <p className="ofbol-kpi-pie">Seleccione una estación para explorar su carga documental y su estado.</p></div>
            <div className="ofbol-campus-view" role="group" aria-label="Vista de estaciones">
                <button type="button" aria-pressed={view === 'edificios'} onClick={() => setView('edificios')}><LayoutGrid size={16} aria-hidden="true" />Edificios</button>
                <button type="button" aria-pressed={view === 'lista'} onClick={() => setView('lista')}><List size={16} aria-hidden="true" />Lista</button>
            </div>
        </header>
        <div className="ofbol-campus-toolbar">
            <div className="ofbol-campus-search"><Search size={16} aria-hidden="true" /><label className="sr-only" htmlFor={searchId}>Buscar estación</label><input id={searchId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar EPI por nombre o zona…" type="search" /></div>
            <label className="flex items-center gap-2 text-xs"><span>Estado</span><select className="ofbol-input" aria-label="Filtrar estaciones por estado" value={state} onChange={(event) => setState(event.target.value)}>
                <option value="todas">Todas las estaciones</option><option value="observadas">Con observaciones</option><option value="revision">En revisión</option><option value="sin-carga">Sin documentos</option>
            </select></label>
            <p className="text-xs text-slate-500 tabular-nums" role="status">{filtered.length} de {epis.length} estaciones</p>
        </div>
        {filtered.length === 0 ? <EstadoVacio icono={Building2} titulo={epis.length ? 'Ninguna estación coincide con los filtros' : 'No hay estaciones disponibles'}
            nota={epis.length ? 'Pruebe otra zona o vuelva a mostrar todas las EPIs.' : 'Cuando exista una EPI registrada, su edificio y actividad aparecerán aquí.'}
            accion={epis.length > 0 ? <button className="ofbol-btn-ghost" onClick={clear}>Mostrar todas las estaciones</button> : undefined} />
            : view === 'edificios' ? <div className="ofbol-campus"><div className="ofbol-campus-grid">
                {filtered.map((epi, index) => <div key={epi.id_epi} className="ofbol-campus-station">
                    <EdificioEPI epi={epi} resumen={resumenDeEpi(epi)} index={index} activa={Number(seleccionada) === Number(epi.id_epi)} onClick={() => onSeleccion?.(epi)} />
                    <span className="ofbol-campus-station-note">{resumenDeEpi(epi).registrados} registrados</span>
                </div>)}
            </div></div> : <div className="ofbol-campus-list">
                {filtered.map((epi) => { const summary = resumenDeEpi(epi); return <button key={epi.id_epi} className="ofbol-campus-list-item" aria-pressed={Number(seleccionada) === Number(epi.id_epi)} onClick={() => onSeleccion?.(epi)}>
                    <span className="ofbol-campus-list-icon"><Building2 size={24} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><strong>{epi.nombre}</strong><small>{epi.ubicacion || epi.codigo || 'Estación Policial Integral'}</small></span>
                    <span className="ofbol-campus-list-value"><b>{summary.total}</b><small>documentos</small></span>
                    <span className="ofbol-campus-list-value hidden sm:block"><b>{summary.observados}</b><small>observados</small></span>
                    <ArrowUpRight size={17} aria-hidden="true" />
                </button>; })}
            </div>}
        <footer className="ofbol-campus-legend" aria-label="Leyenda del campus">
            <span><i className="ofbol-campus-dot ofbol-campus-dot--amber" />En revisión</span><span><i className="ofbol-campus-dot ofbol-campus-dot--red" />Observados</span><span><i className="ofbol-campus-dot ofbol-campus-dot--green" />Aprobados</span><span>Altura = volumen de documentos</span>
        </footer>
    </section>;
}

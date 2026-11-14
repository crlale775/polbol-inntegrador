import { descargarCsv } from '../../js/lib/csvSeguro';
/**
 * Auditoria.jsx — Registro de Actividad Institucional
 * Comando General de la Policía Boliviana
 *
 * Cada evento se muestra en lenguaje llano (quién, qué hizo, sobre qué), agrupado
 * por día. El dato técnico original se conserva en el detalle para auditoría.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, Download, Search, ShieldCheck } from 'lucide-react';
import LayoutComandoGeneral from '../../js/components/LayoutComandoGeneral';
import CargandoLista from '../../js/components/ui/CargandoLista';
import Alert from '../../js/components/ui/Alert';
import Modal from '../../js/components/ui/Modal';
import { EstadoVacio } from '../../js/components/ui/Graficos';
import api from '../../js/lib/api';
import useListaProgresiva from '../../js/lib/useListaProgresiva';
import MasResultados from '../../js/components/ui/MasResultados';
import { CATEGORIAS, describirActividad, claveDia, etiquetaDia, horaCorta, fechaCompleta } from '../../js/lib/actividad';

const RESUMEN = ['documento', 'revision', 'acceso', 'administracion'];
const NOTA_RESUMEN = {
    documento: 'subidas, envíos y correcciones',
    revision: 'dictámenes y observaciones',
    acceso: 'ingresos y consultas',
    administracion: 'cambios de configuración',
};

function instanciaDe(rolNombre) {
    const rol = rolNombre.toLowerCase();
    if (rol.includes('departamental') || rol.includes('comando d')) return 'departamental';
    if (rol.includes('general') || rol.includes('comando g')) return 'general';
    if (rol.includes('secretario') || rol.includes('epi')) return 'epi';
    return '';
}

function Dato({ etiqueta, children }) {
    return (
        <div>
            <dt className="ofbol-etiqueta">{etiqueta}</dt>
            <dd className="mt-1 text-sm" style={{ color: 'var(--ofbol-ink)' }}>{children}</dd>
        </div>
    );
}

export default function Auditoria() {
    const [auditorias, setAuditorias] = useState([]);
    const [epis, setEpis] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [filtroAccion, setFiltroAccion] = useState('todas');
    const [filtroInstancia, setFiltroInstancia] = useState('todas');
    const [filtroEpi, setFiltroEpi] = useState('');
    const [filtroCategoria, setFiltroCategoria] = useState('');
    const [detalle, setDetalle] = useState(null);
    const [mensaje, setMensaje] = useState(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [res, episRes] = await Promise.all([
                api.get('/auditorias'),
                api.get('/epis').catch(() => []),
            ]);
            if (Array.isArray(res)) setAuditorias(res);
            if (Array.isArray(episRes)) setEpis(episRes);
        } catch (err) {
            setMensaje({ tipo: 'error', texto: 'No se pudieron cargar los registros de actividad.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Cada evento se traduce una sola vez; filtros, tabla y exportación usan el mismo texto.
    const eventos = useMemo(() => auditorias.map((a) => {
        const rol = a.usuario?.rol?.nombre || '';
        return {
            ...a,
            lectura: describirActividad(a),
            operador: a.usuario?.usuario || 'Sistema',
            rol,
            instancia: instanciaDe(rol),
            unidad: a.usuario?.epi?.nombre || '',
        };
    }), [auditorias]);

    const acciones = useMemo(() => {
        const vistas = new Map();
        eventos.forEach((e) => { if (e.accion && !vistas.has(e.accion)) vistas.set(e.accion, e.lectura.titulo); });
        return [...vistas.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
    }, [eventos]);

    // Todo menos la categoría: así las tarjetas de resumen muestran cuántos hay de cada tipo.
    const base = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return eventos.filter((e) => {
            const texto = `${e.lectura.titulo} ${e.lectura.detalle} ${e.operador} ${e.rol} ${e.unidad} ${e.lectura.modulo} ${e.accion || ''} ${e.descripcion || ''}`.toLowerCase();
            return (!q || texto.includes(q))
                && (filtroAccion === 'todas' || e.accion === filtroAccion)
                && (filtroInstancia === 'todas' || e.instancia === filtroInstancia)
                && (!filtroEpi || e.usuario?.epi?.id_epi === parseInt(filtroEpi, 10));
        });
    }, [eventos, busqueda, filtroAccion, filtroInstancia, filtroEpi]);

    const conteo = useMemo(() => base.reduce((total, e) => {
        total[e.lectura.categoria] = (total[e.lectura.categoria] || 0) + 1;
        return total;
    }, {}), [base]);

    const filtrados = useMemo(
        () => (filtroCategoria ? base.filter((e) => e.lectura.categoria === filtroCategoria) : base),
        [base, filtroCategoria],
    );
    const progresivo = useListaProgresiva(filtrados);

    const handleExportarActividad = () => {
        const csvRows = [
            ['ID', 'FECHA', 'USUARIO', 'ROL', 'UNIDAD', 'TIPO', 'QUE HIZO', 'DETALLE', 'MODULO', 'CODIGO DE ACCION', 'DATO TECNICO'],
            ...filtrados.map((e) => [
                e.id_auditoria,
                `${e.fecha || ''}`,
                e.operador,
                e.rol,
                e.unidad || 'Central',
                e.lectura.nombreCategoria,
                e.lectura.titulo,
                e.lectura.detalle,
                e.lectura.modulo,
                `${e.accion || ''}`,
                `${e.descripcion || ''}`,
            ]),
        ];

        descargarCsv(csvRows, `Registro_Actividad_Policia_Boliviana_${new Date().toISOString().slice(0, 10)}.csv`);

        setMensaje({ tipo: 'success', texto: 'Registro de actividad exportado correctamente.' });
    };

    let diaAnterior = null;

    return (
        <LayoutComandoGeneral>
            <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6 ofbol-page-enter">

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="ofbol-display heading-balance">Registro de actividad institucional</h1>
                        <p className="ofbol-nota mt-2">
                            Quién hizo qué y cuándo: ingresos al sistema, envíos de trámites, revisiones y cambios de configuración.
                        </p>
                    </div>

                    <button type="button" onClick={handleExportarActividad} className="ofbol-btn-primary shrink-0">
                        <Download size={15} />
                        Exportar CSV
                    </button>
                </div>

                {mensaje && <Alert type={mensaje.tipo} onClose={() => setMensaje(null)}>{mensaje.texto}</Alert>}

                {/* ─ Resumen por tipo de actividad (también filtra) ─ */}
                {!loading && eventos.length > 0 && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" role="group" aria-label="Filtrar por tipo de actividad">
                        {RESUMEN.map((clave) => {
                            const activa = filtroCategoria === clave;
                            return (
                                <button key={clave} type="button" aria-pressed={activa}
                                    onClick={() => setFiltroCategoria(activa ? '' : clave)}
                                    className="ofbol-kpi text-left"
                                    style={activa ? { borderColor: 'var(--ofbol-olive)', background: 'var(--ofbol-olive-wash)' } : undefined}>
                                    <span className="ofbol-etiqueta">{CATEGORIAS[clave].nombre}</span>
                                    <span className="ofbol-cifra-sm tabular-nums">{(conteo[clave] || 0).toLocaleString('es-BO')}</span>
                                    <span className="ofbol-kpi-pie">{activa ? 'Mostrando solo este tipo' : NOTA_RESUMEN[clave]}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ─ Filtros ─ */}
                <div className="ofbol-card p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ofbol-muted)' }} aria-hidden="true" />
                            <input
                                type="search"
                                aria-label="Buscar por persona, actividad o trámite"
                                placeholder="Buscar por persona, actividad o trámite…"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                className="ofbol-input w-full pl-9"
                            />
                        </div>

                        <select aria-label="Filtrar por instancia"
                            value={filtroInstancia}
                            onChange={(e) => setFiltroInstancia(e.target.value)}
                            className="ofbol-input"
                        >
                            <option value="todas">Todas las instancias</option>
                            <option value="epi">Secretaría EPI</option>
                            <option value="departamental">Comando Departamental</option>
                            <option value="general">Comando General</option>
                        </select>

                        <select aria-label="Filtrar por actividad"
                            value={filtroAccion}
                            onChange={(e) => setFiltroAccion(e.target.value)}
                            className="ofbol-input"
                        >
                            <option value="todas">Todas las actividades</option>
                            {acciones.map(([codigo, titulo]) => <option key={codigo} value={codigo}>{titulo}</option>)}
                        </select>

                        <select aria-label="Filtrar por EPI"
                            value={filtroEpi}
                            onChange={(e) => setFiltroEpi(e.target.value)}
                            className="ofbol-input"
                        >
                            <option value="">Todas las EPIs</option>
                            {epis.map((e) => (
                                <option key={e.id_epi} value={e.id_epi}>{e.nombre}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* ─ Actividad agrupada por día ─ */}
                <div className="ofbol-card overflow-hidden">
                    {loading ? (
                        <CargandoLista />
                    ) : filtrados.length === 0 ? (
                        <div className="p-4">
                            <EstadoVacio
                                icono={ShieldCheck}
                                titulo="Sin actividad para mostrar"
                                nota="Ningún registro coincide con los filtros aplicados."
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto ofbol-scroll">
                            <table className="ofbol-table">
                                <caption className="sr-only">
                                    {filtrados.length} actividades registradas, de la más reciente a la más antigua
                                </caption>
                                <thead>
                                    <tr>
                                        <th>Hora</th>
                                        <th>Quién</th>
                                        <th>Qué hizo</th>
                                        <th>Detalle</th>
                                        <th><span className="sr-only">Ver más</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {progresivo.visibles.map((e) => {
                                        const dia = claveDia(e.fecha);
                                        const nuevoDia = dia !== diaAnterior;
                                        diaAnterior = dia;
                                        return (
                                            <React.Fragment key={e.id_auditoria}>
                                                {nuevoDia && (
                                                    <tr>
                                                        <th colSpan={5} scope="colgroup" className="text-left"
                                                            style={{ background: 'var(--ofbol-olive-wash)', color: 'var(--ofbol-ink)' }}>
                                                            {etiquetaDia(e.fecha)}
                                                        </th>
                                                    </tr>
                                                )}
                                                <tr>
                                                    <td className="whitespace-nowrap tabular-nums" style={{ color: 'var(--ofbol-slate)' }}>
                                                        {horaCorta(e.fecha)}
                                                    </td>
                                                    <td>
                                                        <p className="font-bold">{e.operador}</p>
                                                        <p className="text-xs mt-0.5" style={{ color: 'var(--ofbol-slate)' }}>
                                                            {[e.rol || 'Sistema', e.unidad].filter(Boolean).join(' · ')}
                                                        </p>
                                                    </td>
                                                    <td>
                                                        <p className="font-bold">{e.lectura.titulo}</p>
                                                        <span className={`ofbol-badge ${e.lectura.tono} mt-1.5`}>{e.lectura.nombreCategoria}</span>
                                                    </td>
                                                    <td className="min-w-64 max-w-md">
                                                        <p>{e.lectura.detalle}</p>
                                                        {e.lectura.demostracion && (
                                                            <p className="text-xs mt-0.5" style={{ color: 'var(--ofbol-slate)' }}>Registro de demostración.</p>
                                                        )}
                                                    </td>
                                                    <td className="text-right">
                                                        <button type="button" className="ofbol-enlace-accion" onClick={() => setDetalle(e)}
                                                            aria-label={`Ver el detalle: ${e.lectura.titulo}, ${e.operador}`}>
                                                            Ver detalle <ChevronRight size={14} aria-hidden="true" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            </React.Fragment>
                                        );
                                    })}
                                    <MasResultados lista={progresivo} como="tr" columnas={5} />
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <Modal open={!!detalle} onClose={() => setDetalle(null)} title="Detalle de la actividad" size="lg">
                {detalle && (
                    <div className="p-5 space-y-5 overflow-y-auto">
                        <div>
                            <span className={`ofbol-badge ${detalle.lectura.tono}`}>{detalle.lectura.nombreCategoria}</span>
                            <p className="mt-2 text-lg font-bold" style={{ color: 'var(--ofbol-ink)' }}>
                                {detalle.operador} · {detalle.lectura.titulo.toLowerCase()}
                            </p>
                            <p className="mt-1 text-sm" style={{ color: 'var(--ofbol-ink-soft)' }}>{detalle.lectura.detalle}</p>
                        </div>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Dato etiqueta="Cuándo">{fechaCompleta(detalle.fecha)}</Dato>
                            <Dato etiqueta="Quién">{detalle.operador}</Dato>
                            <Dato etiqueta="Cargo en el sistema">{detalle.rol || 'Sistema'}</Dato>
                            <Dato etiqueta="Unidad">{detalle.unidad || 'Nivel central'}</Dato>
                            <Dato etiqueta="Parte del sistema">{detalle.lectura.modulo}</Dato>
                            <Dato etiqueta="Trámite relacionado">{detalle.lectura.tramite || 'Ninguno'}</Dato>
                            <Dato etiqueta="Número de registro">{detalle.id_auditoria}</Dato>
                        </dl>
                        {detalle.lectura.demostracion && (
                            <p className="ofbol-nota">Este registro se generó al cargar datos de demostración; no corresponde a una operación real.</p>
                        )}
                        <details>
                            <summary className="cursor-pointer text-sm font-bold" style={{ color: 'var(--ofbol-olive)' }}>
                                Dato técnico original
                            </summary>
                            <p className="ofbol-nota mt-2">Así quedó guardado en la bitácora. Sirve para una revisión técnica o una auditoría.</p>
                            <dl className="mt-3 space-y-3">
                                <Dato etiqueta="Código de la acción"><span className="font-mono text-xs">{detalle.accion || '—'}</span></Dato>
                                <Dato etiqueta="Descripción guardada">
                                    <span className="font-mono text-xs [overflow-wrap:anywhere]">{detalle.descripcion || '—'}</span>
                                </Dato>
                            </dl>
                        </details>
                    </div>
                )}
            </Modal>
        </LayoutComandoGeneral>
    );
}

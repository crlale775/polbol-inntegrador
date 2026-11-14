/**
 * DesempenioEpis.jsx — Desempeño y Estadísticas por EPI (Comando Departamental)
 *
 * Vista UNIFICADA: reemplaza al antiguo módulo "Estadísticas" (eliminado).
 * Una sola petición a /desempenio-epis entrega TODO:
 *   · Las 9 EPIs como torres gráficas (campus clickeable, reusa EdificioEPI).
 *   · Al entrar a una EPI: qué tipos envió más/menos y qué oficiales
 *     recibieron más memorándums y de qué tipo.
 *   · Consolidado global: distribución por estado, tipos más/menos usados,
 *     ranking de destinatarios y cuadro comparativo de las 9 unidades.
 *
 * Rendimiento: una petición, cero gráficas pesadas (las barras son CSS puro),
 * todo derivado en memoria y memoizado.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import CampusEpis from '../ui/CampusEpis';
import ScreenSkeleton from '../ui/ScreenSkeleton';
import { leerDesempenio } from '../../lib/desempenio';
import Alert from '../ui/Alert';
import AvatarFoto from '../ui/AvatarFoto';
import { ChipEnVivo, useSyncGlobal } from '../ui/ToastEnVivo';
import api from '../../lib/api';
import {
    Building2, Trophy, AlertTriangle, CheckCircle2, Clock, Send,
    Users, BarChart3, ArrowUpRight, RefreshCw, ChevronRight,
} from 'lucide-react';
import { KpiPanel, ACENTOS } from '../ui/Panel';
import { EstadoVacio, ChipsDato } from '../ui/Graficos';

const OLIVA = ['#33401f', '#3d4a2c', '#4a5a35', '#5a6b3d', '#6d7d4f', '#8a9a6d', '#a4b287', '#c1c9a6'];
/* Los acentos salen de la paleta institucional compartida, no de hex sueltos. */
const ACENTO = { amber: ACENTOS.ambar, teal: ACENTOS.teal, crimson: ACENTOS.crimson, steel: ACENTOS.steel };

const ORDENES = [
    { id: 'volumen', label: 'Volumen emitido' },
    { id: 'aprobacion', label: 'Tasa de aprobación' },
    { id: 'observacion', label: 'Tasa de observación' },
    { id: 'tiempo', label: 'Rapidez de atención' },
    { id: 'registrados', label: 'Registrados' },
];

function ordenarEpis(lista, criterio) {
    const copia = [...lista];
    if (criterio === 'registrados') return copia.sort((a, b) => b.metricas.registrados - a.metricas.registrados);
    if (criterio === 'aprobacion') return copia.sort((a, b) => b.metricas.tasa_aprobacion - a.metricas.tasa_aprobacion);
    if (criterio === 'observacion') return copia.sort((a, b) => b.metricas.tasa_observacion - a.metricas.tasa_observacion);
    if (criterio === 'tiempo') {
        // menor tiempo promedio = mejor; los que no tienen datos van al final
        return copia.sort((a, b) => {
            const ta = a.metricas.tiempo_promedio_horas || Number.MAX_SAFE_INTEGER;
            const tb = b.metricas.tiempo_promedio_horas || Number.MAX_SAFE_INTEGER;
            return ta - tb;
        });
    }
    return copia.sort((a, b) => b.metricas.total_documentos - a.metricas.total_documentos);
}

const colorTasa = (t) => (t >= 75 ? ACENTO.teal : t >= 50 ? ACENTO.amber : ACENTO.crimson);

export default function DesempenioEpisPanel({ Layout, titulo = 'Desempeño por EPI', ordenInicial = 'volumen' }) {
    const { conectado } = useSyncGlobal();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [orden, setOrden] = useState(ordenInicial);
    const [params, setParams] = useSearchParams();
    const idSel = Number(params.get('epi')) || null;
    const setIdSel = (id) => setParams((previous) => { const next = new URLSearchParams(previous); next.set('epi', id); return next; }, { replace: true });
    const seleccionarEpi = (epi) => {
        setIdSel(epi.id_epi);
        requestAnimationFrame(() => document.getElementById('desempenio-detalle')?.scrollIntoView?.({
            behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start',
        }));
    };

    const cargar = useCallback(async (silencioso = false) => {
        try {
            if (!silencioso) setLoading(true);
            const res = await api.get('/desempenio-epis');
            setData(leerDesempenio(res));
            setError(null);
        } catch (error) {
            setError(error.message || 'No se pudo cargar el desempeño de las EPIs.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void cargar(); }, [cargar]);

    useEffect(() => {
        const onSync = () => { void cargar(true); };
        window.addEventListener('ofbol:sync', onSync);
        return () => window.removeEventListener('ofbol:sync', onSync);
    }, [cargar]);

    const epis = useMemo(() => data?.epis ?? [], [data]);
    const ordenados = useMemo(() => ordenarEpis(epis, orden), [epis, orden]);
    const resumen = data?.resumen_global ?? {};
    const porEstado = data?.por_estado ?? [];
    const tipos = data?.tipos_mas_usados ?? [];
    const receptores = data?.top_receptores_global ?? [];

    const epiSel = useMemo(
        () => epis.find((e) => Number(e.id_epi) === idSel) ?? ordenados[0] ?? null,
        [epis, ordenados, idSel]
    );

    const maxReceptorGlobal = receptores[0]?.total || 1;
    const maxTipo = tipos[0]?.total || 1;
    const totalEstado = porEstado.reduce((a, e) => a + e.total, 0) || 1;

    if (loading) {
        return (
            <Layout>
                <ScreenSkeleton />
            </Layout>
        );
    }

    if (!data || epis.length === 0) {
        return <Layout><div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <h1 className="ofbol-display">{titulo}</h1>
            <EstadoVacio icono={Building2} titulo={error ? 'No se pudo mostrar el campus de EPIs' : 'Todavía no hay estaciones registradas'}
                nota={error || 'Los edificios aparecerán aquí al registrar las estaciones policiales.'}
                accion={<button className="ofbol-btn-primary" onClick={() => void cargar()}><RefreshCw size={16} aria-hidden="true" />Volver a consultar</button>} />
        </div></Layout>;
    }

    return (
        <Layout>
            <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-7 ofbol-page-enter">
                {/* ── Encabezado ── */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="ofbol-display heading-balance">{titulo}</h1>
                        <p className="ofbol-nota mt-2">
                            Productividad, calidad documental y analítica consolidada de las Estaciones
                            Policiales Integrales del Departamento de La Paz. Hacé clic en una torre para
                            ver qué envió y quién recibió más.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <ChipEnVivo conectado={conectado} />
                        <label htmlFor="orden-epis" className="ofbol-etiqueta">Ordenar por</label>
                        <select
                            id="orden-epis"
                            value={orden}
                            onChange={(e) => setOrden(e.target.value)}
                            className="ofbol-input !py-2 !text-xs font-bold"
                        >
                            {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        <button type="button" onClick={() => void cargar()} className="ofbol-btn-ghost">
                            <RefreshCw size={13} aria-hidden="true" /> Actualizar
                        </button>
                    </div>
                </div>

                {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

                {/* ── KPIs globales ── */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 ofbol-stagger">
                    <KpiPanel grande icono={<Send size={14} />} etiqueta="Total emitidos" valor={resumen.total ?? 0} acento={ACENTOS.oliva} />
                    <KpiPanel icono={<CheckCircle2 size={14} />} etiqueta="Aprobados" valor={resumen.aprobados ?? 0} acento={ACENTOS.teal} sub={`${resumen.tasa_aprobacion ?? 0}% de efectividad`} />
                    <KpiPanel icono={<AlertTriangle size={14} />} etiqueta="Observados" valor={resumen.observados ?? 0} acento={ACENTOS.ambar} sub={`${resumen.tasa_observacion ?? 0}% del total`} />
                    <KpiPanel icono={<Clock size={14} />} etiqueta="En proceso" valor={resumen.en_proceso ?? 0} acento={ACENTOS.steel} sub={`${resumen.registrados ?? 0} registrados`} />
                    <KpiPanel icono={<BarChart3 size={14} />} etiqueta="EPIs con carga" valor={`${resumen.epis_con_carga ?? 0}/${resumen.epis_activas ?? epis.length}`} acento={ACENTOS.olivaClaro} />
                </div>

                <CampusEpis epis={ordenados} seleccionada={epiSel?.id_epi} onSeleccion={seleccionarEpi} />
                <p className="sr-only" role="status">{epiSel ? `Estación seleccionada: ${epiSel.nombre}` : 'Seleccione una estación'}</p>

                {/* ── Detalle de la EPI seleccionada ── */}
                {epiSel && (
                    <section id="desempenio-detalle" aria-label={`Detalle de ${epiSel.nombre}`} className="ofbol-card p-5 lg:p-6 scroll-mt-20 space-y-5">
                        <header
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4"
                            style={{ borderBottom: '1px solid var(--ofbol-line)' }}
                        >
                            <div className="min-w-0">
                                <p className="ofbol-etiqueta">EPI seleccionada</p>
                                <h2
                                    className="text-lg font-black mt-1 flex items-center gap-2"
                                    style={{ color: 'var(--ofbol-ink)' }}
                                >
                                    {epiSel.nombre}
                                    <span className="ofbol-etiqueta shrink-0">{epiSel.codigo}</span>
                                </h2>
                                <p className="ofbol-nota mt-0.5">{epiSel.ubicacion}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <p className="ofbol-etiqueta">Secretario/a</p>
                                    <p className="text-xs font-bold" style={{ color: 'var(--ofbol-ink)' }}>
                                        {epiSel.secretario?.usuario ?? 'Sin asignar'}
                                    </p>
                                </div>
                                <AvatarFoto
                                    foto={epiSel.secretario?.foto}
                                    nombre={epiSel.secretario?.usuario ?? epiSel.nombre}
                                    iniciales={epiSel.secretario?.usuario?.[0]?.toUpperCase() ?? 'E'}
                                    className="w-10 h-10 rounded-xl text-[13px]"
                                    fallbackClassName="bg-[#3d4a2c]"
                                />
                            </div>
                        </header>

                        {/* Métricas de la unidad */}
                        <ChipsDato
                            datos={[
                                { etiqueta: 'Total', valor: epiSel.metricas.total_documentos },
                                { etiqueta: 'En revisión', valor: epiSel.metricas.en_revision, color: ACENTO.amber },
                                { etiqueta: 'Observados', valor: epiSel.metricas.observados, color: ACENTO.crimson },
                                { etiqueta: 'Aprobados', valor: epiSel.metricas.aprobados, color: ACENTO.teal },
                                { etiqueta: 'Registrados', valor: epiSel.metricas.registrados, color: ACENTO.teal },
                                {
                                    etiqueta: 'Tasa aprob.',
                                    valor: `${epiSel.metricas.tasa_aprobacion}%`,
                                    color: colorTasa(epiSel.metricas.tasa_aprobacion),
                                },
                            ]}
                        />

                        {/* Barra de eficiencia + tiempo */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="flex-1">
                                <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                                    <span>Nivel de eficiencia</span>
                                    <span className="tabular-nums">{epiSel.metricas.tasa_aprobacion}%</span>
                                </div>
                                <div className="ofbol-progress">
                                    <div
                                        className="ofbol-progress-bar"
                                        style={{
                                            width: `${Math.min(100, epiSel.metricas.tasa_aprobacion)}%`,
                                            background: colorTasa(epiSel.metricas.tasa_aprobacion),
                                        }}
                                    />
                                </div>
                            </div>
                            <div
                                className="flex items-center gap-2 px-3 py-2 rounded-[10px] shrink-0"
                                style={{ background: '#f4f2ec', border: '1px solid var(--ofbol-line)' }}
                            >
                                <Clock size={14} aria-hidden="true" style={{ color: 'var(--ofbol-muted)' }} />
                                <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--ofbol-ink)' }}>
                                    {epiSel.metricas.tiempo_promedio_horas} h
                                </span>
                                <span className="ofbol-etiqueta">tiempo promedio</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Qué envió esta EPI */}
                            <div>
                                <h3 className="ofbol-titulo-seccion mb-3 flex items-center gap-1.5">
                                    <ArrowUpRight size={12} aria-hidden="true" /> Qué envió esta EPI (por tipo)
                                </h3>
                                {(epiSel.por_tipo_detalle ?? []).filter((t) => t.total > 0).length === 0 ? (
                                    <EstadoVacio compacto icono={Send} titulo="Esta unidad todavía no emitió memorándums" nota="Aquí verá los tipos de documento cuando comience su actividad." />
                                ) : (
                                    <div className="space-y-3">
                                        {(epiSel.por_tipo_detalle ?? []).filter((t) => t.total > 0).map((t, i) => {
                                            const max = epiSel.por_tipo_detalle[0]?.total || 1;
                                            return (
                                                <div key={t.id_tipo}>
                                                    <div className="flex items-center justify-between text-[11px] mb-1 gap-2">
                                                        <span className="font-bold text-slate-700 truncate">{t.tipo}</span>
                                                        <span className="tabular-nums font-black shrink-0" style={{ color: 'var(--ofbol-ink)' }}>
                                                            {t.total}
                                                            <span className="text-slate-400 font-bold"> · {t.aprobados} apr · {t.observados} obs</span>
                                                        </span>
                                                    </div>
                                                    <div className="ofbol-progress">
                                                        <div className="ofbol-progress-bar" style={{ width: `${Math.max((t.total / max) * 100, 5)}%`, background: OLIVA[i % OLIVA.length] }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Quién recibió más en esta EPI */}
                            <div>
                                <h3 className="ofbol-titulo-seccion mb-3 flex items-center gap-1.5">
                                    <Trophy size={12} aria-hidden="true" /> Oficiales que más recibieron de esta EPI
                                </h3>
                                {(epiSel.top_receptores ?? []).length === 0 ? (
                                    <EstadoVacio compacto icono={Users} titulo="Sin destinatarios registrados" nota="Los oficiales de los documentos emitidos aparecerán aquí." />
                                ) : (
                                    <div className="space-y-3">
                                        {epiSel.top_receptores.map((o, i) => (
                                            <div key={o.id_oficial} className="flex items-center gap-3">
                                                <span
                                                    className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 tabular-nums"
                                                    style={i === 0
                                                        ? { background: 'rgba(154,111,10,0.18)', color: ACENTO.amber }
                                                        : { background: 'rgba(61,74,44,0.08)', color: '#5a615f' }}
                                                >
                                                    {i + 1}
                                                </span>
                                                <AvatarFoto
                                                    foto={o.foto}
                                                    nombre={`${o.nombres} ${o.apellidos}`}
                                                    iniciales={`${o.nombres?.[0] ?? ''}${o.apellidos?.[0] ?? ''}`}
                                                    className="w-8 h-8 rounded-lg text-[10px]"
                                                    fallbackClassName="bg-[#3d4a2c]"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[12px] font-bold text-[#0a0f0d] truncate">
                                                        <span className="text-[#3d4a2c] font-black">{o.grado}</span> {o.nombres} {o.apellidos}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 truncate">
                                                        Más recibido: <span className="font-bold">{o.tipo_principal}</span>
                                                    </p>
                                                </div>
                                                <span className="ofbol-badge ofbol-badge--olive tabular-nums shrink-0">{o.total}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                )}

                {/* ── Analítica global (ex-módulo Estadísticas) ── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <section className="ofbol-card p-6 lg:col-span-5 space-y-4">
                        <h2 className="ofbol-titulo-seccion">
                            Distribución por estado
                        </h2>
                        <div className="space-y-3">
                            {porEstado.map((e, i) => {
                                const pct = ((e.total / totalEstado) * 100).toFixed(1);
                                return (
                                    <div key={e.estado}>
                                        <div className="flex justify-between text-[11px] font-bold mb-1">
                                            <span className="text-slate-700 truncate">{e.estado}</span>
                                            <span className="tabular-nums text-[#0a0f0d] shrink-0 ml-2">{e.total} · {pct}%</span>
                                        </div>
                                        <div className="ofbol-progress">
                                            <div className="ofbol-progress-bar" style={{ width: `${pct}%`, background: OLIVA[i % OLIVA.length] }} />
                                        </div>
                                    </div>
                                );
                            })}
                            {porEstado.length === 0 && <EstadoVacio compacto icono={BarChart3} titulo="Todavía no hay estados para comparar" />}
                        </div>
                    </section>

                    <section className="ofbol-card p-6 lg:col-span-7 space-y-4">
                        <header>
                            <h2 className="ofbol-titulo-seccion">
                                Tipos de memorándum más y menos usados
                            </h2>
                            <p className="ofbol-kpi-pie mt-1">
                                Demanda por tipo y la EPI que más lo emite.
                            </p>
                        </header>
                        <div className="space-y-3">
                            {tipos.length === 0 && <EstadoVacio compacto icono={BarChart3} titulo="Todavía no hay tipos con actividad" />}
                            {tipos.map((t, i) => (
                                <div key={t.id_tipo} className="flex items-center gap-3">
                                    <span
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 tabular-nums"
                                        style={{ background: 'rgba(61,74,44,0.08)', color: OLIVA[i % OLIVA.length] }}
                                    >
                                        {i + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline gap-2">
                                            <span className="text-[12px] font-bold text-[#3f4849] truncate">{t.tipo}</span>
                                            <span className="text-[12px] font-black tabular-nums text-[#0a0f0d] shrink-0">
                                                {t.total}
                                                {i === 0 && <span className="text-[9px] font-black uppercase ml-1.5" style={{ color: ACENTO.amber }}>top</span>}
                                            </span>
                                        </div>
                                        <div className="ofbol-progress mt-1">
                                            <div className="ofbol-progress-bar" style={{ width: `${Math.max((t.total / maxTipo) * 100, 4)}%`, background: OLIVA[i % OLIVA.length] }} />
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-1">
                                            {t.epi_principal ? `Más emitido por ${t.epi_principal}` : 'Sin EPI principal'}
                                            {' · '}{t.aprobados} aprobados · {t.observados} observados
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* ── Ranking global de destinatarios ── */}
                <section className="ofbol-card p-6 space-y-4">
                    <header className="flex items-center gap-2">
                        <Users size={14} className="text-[#3d4a2c]" />
                        <h2 className="ofbol-titulo-seccion">
                            Destinatarios con más memorándums recibidos
                        </h2>
                    </header>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        {receptores.length === 0 && <EstadoVacio compacto icono={Users} titulo="Todavía no hay destinatarios para comparar" />}
                        {receptores.map((o, i) => (
                            <div key={o.id_oficial} className="flex items-center gap-3">
                                <span
                                    className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 tabular-nums"
                                    style={i === 0
                                        ? { background: 'rgba(154,111,10,0.18)', color: ACENTO.amber }
                                        : i < 3
                                            ? { background: 'rgba(154,111,10,0.1)', color: ACENTO.amber }
                                            : { background: 'rgba(61,74,44,0.08)', color: '#5a615f' }}
                                >
                                    {i + 1}
                                </span>
                                <AvatarFoto
                                    foto={o.foto}
                                    nombre={`${o.nombres} ${o.apellidos}`}
                                    iniciales={`${o.nombres?.[0] ?? ''}${o.apellidos?.[0] ?? ''}`}
                                    className="w-9 h-9 rounded-lg text-[11px]"
                                    fallbackClassName="bg-[#3d4a2c]"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[12px] font-bold text-[#0a0f0d] truncate">
                                        <span className="text-[#3d4a2c] font-black">{o.grado}</span> {o.nombres} {o.apellidos}
                                    </p>
                                    <div className="ofbol-progress mt-1.5">
                                        <div className="ofbol-progress-bar" style={{ width: `${Math.max((o.total / maxReceptorGlobal) * 100, 6)}%` }} />
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1 truncate">
                                        {o.epi_origen} · principal: <span className="font-bold">{o.tipo_principal}</span>
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[13px] font-black tabular-nums text-[#0a0f0d]">{o.total}</p>
                                    {o.observados > 0 && <p className="text-[9px] font-bold" style={{ color: ACENTO.amber }}>{o.observados} obs.</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Cuadro comparativo de las 9 EPIs ── */}
                <section className="ofbol-card overflow-hidden">
                    <header
                        className="px-4 pt-4 pb-3 flex items-center justify-between"
                        style={{ borderBottom: '1px solid var(--ofbol-line)' }}
                    >
                        <h2 className="ofbol-titulo-seccion">
                            Cuadro comparativo de estaciones policiales
                        </h2>
                        <span className="ofbol-etiqueta shrink-0">
                            Ordenado por {ORDENES.find((o) => o.id === orden)?.label}
                        </span>
                    </header>
                    <div className="overflow-x-auto">
                        <table className="ofbol-table w-full">
                            <thead>
                                <tr>
                                    <th className="text-left">#</th>
                                    <th className="text-left">Estación (EPI)</th>
                                    <th className="text-left">Secretario/a</th>
                                    <th className="text-center">Total</th>
                                    <th className="text-center">En revisión</th>
                                    <th className="text-center">Observados</th>
                                    <th className="text-center">Aprobados</th>
                                    <th className="text-center">Tasa</th>
                                    <th className="text-center">Tiempo prom.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ordenados.map((item, idx) => (
                                    <tr
                                        key={item.id_epi}
                                        onClick={() => seleccionarEpi(item)}
                                        className="cursor-pointer"
                                        style={epiSel?.id_epi === item.id_epi ? { background: 'rgba(61,74,44,0.05)' } : undefined}
                                    >
                                        <td className="font-black text-slate-400 tabular-nums">{idx + 1}</td>
                                        <td>
                                            <button className="text-left font-bold text-[#0a0f0d] hover:underline" onClick={(event) => { event.stopPropagation(); seleccionarEpi(item); }}>Inspeccionar {item.nombre}</button>
                                            <p className="text-[10px] text-slate-400">{item.ubicacion}</p>
                                        </td>
                                        <td>
                                            {item.secretario ? (
                                                <p className="font-semibold text-slate-700 text-[11px]">{item.secretario.usuario}</p>
                                            ) : (
                                                <span className="text-[10px] font-bold" style={{ color: 'var(--ofbol-crimson)' }}>Sin asignar</span>
                                            )}
                                        </td>
                                        <td className="text-center tabular-nums font-bold">{item.metricas.total_documentos}</td>
                                        <td className="text-center tabular-nums font-bold" style={{ color: ACENTO.amber }}>{item.metricas.en_revision}</td>
                                        <td className="text-center tabular-nums font-bold" style={{ color: ACENTO.crimson }}>{item.metricas.observados}</td>
                                        <td className="text-center tabular-nums font-bold" style={{ color: ACENTO.teal }}>{item.metricas.aprobados}</td>
                                        <td className="text-center">
                                            <span className="ofbol-badge ofbol-badge--olive tabular-nums">{item.metricas.tasa_aprobacion}%</span>
                                        </td>
                                        <td className="text-center tabular-nums text-slate-600 font-semibold">
                                            {item.metricas.tiempo_promedio_horas} h
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Leyenda de ayuda */}
                <p className="ofbol-nota flex items-center gap-1.5">
                    <ChevronRight size={11} aria-hidden="true" />
                    Los datos se actualizan en vivo. Tocá una torre o una fila para inspeccionar la unidad.
                </p>
            </div>
        </Layout>
    );
}


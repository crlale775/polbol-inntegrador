import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Building2, Download, FileSpreadsheet, RefreshCw, ShieldCheck, Table2 } from 'lucide-react';
import { GraficoLineas, GraficoColumnas, EstadoVacio } from '../../../js/components/ui/Graficos';
import { DonutPanel } from '../../../js/components/ui/Panel';
import LayoutSecretario from '../../../js/components/LayoutSecretario';
import LayoutComandoDepartamental from '../../../js/components/LayoutComandoDepartamental';
import LayoutComandoGeneral from '../../../js/components/LayoutComandoGeneral';
import api from '../../../js/lib/api';
import '../../../css/reportes.css';

const LAYOUTS = { unidad: LayoutSecretario, departamental: LayoutComandoDepartamental, nacional: LayoutComandoGeneral };
const PURPOSE = {
    unidad: ['Operación de la estación', 'Identifique pendientes, tipos de trámite y carga documental del personal de su EPI.'],
    departamental: ['Supervisión departamental', 'Compare estaciones, examine los dictámenes y priorice los documentos con mayor antigüedad.'],
    nacional: ['Control institucional', 'Explore el registro oficial, la demanda documental y la evidencia de trazabilidad.'],
};
const COLORS = ['#285343', '#ad7726', '#5e8190', '#9b5550', '#819774', '#75628a', '#b69b67', '#66746e'];
const number = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 });
const valueText = (value, format = 'text', unit = '') => value == null ? 'Sin base' : `${typeof value === 'number' ? number.format(value) : value}${format === 'percent' ? ' %' : unit ? ` ${unit}` : ''}`;

function DataTable({ table, compact = false }) {
    const [sort, setSort] = useState(null);
    const [page, setPage] = useState(0);
    const size = compact ? 10 : 15;
    const rows = useMemo(() => {
        if (!sort) return table.rows;
        return [...table.rows].sort((a, b) => {
            if (a[sort.key] == null) return b[sort.key] == null ? 0 : 1;
            if (b[sort.key] == null) return -1;
            const cmp = typeof a[sort.key] === 'number' ? a[sort.key] - b[sort.key] : String(a[sort.key]).localeCompare(String(b[sort.key]), 'es', { numeric: true });
            return cmp * sort.dir;
        });
    }, [table, sort]);
    const pages = Math.ceil(rows.length / size);
    const current = Math.min(page, Math.max(0, pages - 1));
    return <section className="report-table">
        <div className="report-section-title"><h3>{table.title}</h3><span>{number.format(rows.length)} registros</span></div>
        {rows.length ? <>
            <div className="report-table-scroll" role="region" aria-label={table.title} tabIndex={0}>
                <table><thead><tr>{table.columns.map(col => <th key={col.key} aria-sort={sort?.key === col.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => { setSort({ key: col.key, dir: sort?.key === col.key ? -sort.dir : 1 }); setPage(0); }}>{col.label}<span aria-hidden="true"> {sort?.key === col.key ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span></button></th>)}</tr></thead>
                    <tbody>{rows.slice(current * size, (current + 1) * size).map((row, i) => <tr key={current * size + i}>{table.columns.map(col => <td key={col.key} className={col.format === 'text' ? '' : 'numeric'}>{valueText(row[col.key], col.format)}</td>)}</tr>)}</tbody>
                </table>
            </div>
            <div className="report-pagination"><span>{current * size + 1}–{Math.min((current + 1) * size, rows.length)} de {number.format(rows.length)} · La descarga incluye todo el detalle.</span>{pages > 1 && <div><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label={`Página anterior de ${table.title}`}>Anterior</button><span>{current + 1} / {pages}</span><button type="button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)} aria-label={`Página siguiente de ${table.title}`}>Siguiente</button></div>}</div>
        </> : <p className="report-empty">Sin registros para los filtros seleccionados.</p>}
    </section>;
}

function HorizontalChart({ chart }) {
    const max = Math.max(1, ...chart.labels.map((_, i) => chart.type === 'stacked' ? chart.series.reduce((n, s) => n + s.values[i], 0) : Math.max(...chart.series.map(s => s.values[i]))));
    return <div className="report-horizontal" role="img" aria-label={chart.labels.map((label, i) => `${label}: ${chart.series.map(s => `${s.name} ${s.values[i]}`).join(', ')}`).join('. ')}>
        <div className="report-legend">{chart.series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
        {chart.labels.map((label, i) => <div className="report-bar-row" key={label}><span title={label}>{label}</span><div className="report-bar-track">{chart.series.map(s => <i key={s.name} title={`${s.name}: ${s.values[i]}`} style={{ width: `${100 * s.values[i] / max}%`, background: s.color }} />)}</div><strong>{number.format(chart.series.reduce((sum, s) => sum + s.values[i], 0))}</strong></div>)}
    </div>;
}

function ChartCard({ chart }) {
    const [showData, setShowData] = useState(false);
    const columns = [{ key: 'label', label: 'Categoría', format: 'text' }, ...chart.series.map((s, i) => ({ key: `s${i}`, label: s.name, format: 'number' }))];
    const rows = chart.labels.map((label, i) => Object.assign({ label }, ...chart.series.map((s, j) => ({ [`s${j}`]: s.values[i] }))));
    const any = chart.series.some(s => s.values.some(v => v > 0));
    const series = chart.series.map(s => ({ label: s.name, valores: s.values, color: s.color }));
    return <article className="report-chart"><div className="report-section-title"><h3>{chart.title}</h3><button type="button" onClick={() => setShowData(v => !v)} aria-expanded={showData} aria-label={`Ver datos de ${chart.title}`}><Table2 size={15} />{showData ? 'Gráfica' : 'Datos'}</button></div>
        {showData ? <DataTable compact table={{ title: `Datos · ${chart.title}`, columns, rows }} /> : !any ? <EstadoVacio compacto titulo="Sin actividad en este período" nota="Cambie los filtros para consultar otros registros." /> : chart.type === 'donut' ? <DonutPanel size={180} thickness={23} datos={chart.labels.map((label, i) => ({ label, total: chart.series[0].values[i], color: COLORS[i % COLORS.length] }))} /> : chart.type === 'line' ? <GraficoLineas categorias={chart.labels} series={series} altura={220} ariaLabel={chart.title} /> : chart.type === 'column' ? <GraficoColumnas datos={chart.labels.map((label, i) => ({ label, valores: chart.series.map(s => s.values[i]) }))} series={series} altura={220} mostrarTotal ariaLabel={chart.title} /> : <HorizontalChart chart={chart} />}
    </article>;
}

function ActionPanel({ reports, selected, onSelect, role }) {
    const verbs = { unidad: ['Atender pendientes', 'Entender mi emisión', 'Consultar al personal'], departamental: ['Comparar estaciones', 'Revisar la calidad', 'Priorizar seguimiento'], nacional: ['Supervisar el cierre', 'Analizar la demanda', 'Examinar la evidencia'] };
    return <section className="report-actions"><div className="report-section-title"><h2>Qué hacer ahora</h2><span>Explore según su responsabilidad</span></div><div>{reports.map((report, i) => <button type="button" key={report.id} onClick={() => onSelect(report.id)} aria-pressed={report.id === selected}><span className="report-action-index">0{i + 1}</span><strong>{verbs[role][i]}</strong><span>{report.description}</span><b>{report.id === selected ? 'Viendo' : 'Ver →'}</b></button>)}</div></section>;
}

export default function ReportesEngine({ alcance = 'unidad' }) {
    const Layout = LAYOUTS[alcance];
    const [payload, setPayload] = useState(null);
    const [selected, setSelected] = useState('');
    const [filters, setFilters] = useState({});
    const [refresh, setRefresh] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [downloading, setDownloading] = useState('');
    const requestId = useRef(0);
    useEffect(() => {
        const id = ++requestId.current;
        setLoading(true); setError(''); setNotice('');
        const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
        if (refresh) params.set('actualizar', '1');
        api.get(`/reportes?${params}`).then(data => {
            if (id !== requestId.current) return;
            if (data.rol !== alcance || !data.reportes?.length) throw new Error('No se pudo validar el reporte de su rol.');
            setPayload(data); setSelected(previous => data.reportes.some(r => r.id === previous) ? previous : data.reportes[0].id);
        }).catch(e => { if (id === requestId.current) { setPayload(null); setError(e.message || 'No se pudieron consultar los reportes.'); } }).finally(() => { if (id === requestId.current) setLoading(false); });
        return () => { requestId.current++; };
    }, [alcance, filters, refresh]);
    const report = payload?.reportes.find(r => r.id === selected);
    const busy = loading || Boolean(downloading);
    const download = async (format) => {
        setDownloading(format); setError(''); setNotice('');
        try {
            const query = new URLSearchParams({ snapshot: payload.snapshot, tipo: selected, formato: format });
            const file = await api.download(`/reportes/exportar?${query}`);
            const url = URL.createObjectURL(file.blob);
            const link = document.createElement('a'); link.href = url; link.download = file.filename || `Policia_Boliviana_${selected}.${format}`;
            document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
            setNotice(`Archivo ${format === 'pdf' ? 'PDF' : 'Excel'} preparado. Revisa tus descargas.`);
        } catch (e) { setError(e.message); } finally { setDownloading(''); }
    };
    const Icon = alcance === 'unidad' ? Building2 : alcance === 'departamental' ? BarChart3 : ShieldCheck;
    return <Layout><div className={`reportes reportes-${alcance}`}>
        <header className="report-header"><div><p className="report-eyebrow"><Icon size={17} />{PURPOSE[alcance][0]}</p><h1>{payload?.titulo || 'Reportes institucionales'}</h1><p>{PURPOSE[alcance][1]}</p></div><div className="report-downloads"><button type="button" disabled={busy || !report} onClick={() => download('pdf')}><Download size={17} />{downloading === 'pdf' ? 'Generando PDF…' : 'Descargar PDF'}</button><button type="button" disabled={busy || !report} onClick={() => download('xlsx')}><FileSpreadsheet size={17} />{downloading === 'xlsx' ? 'Generando Excel…' : 'Excel editable'}</button></div></header>
        <form className="report-filters" onSubmit={e => { e.preventDefault(); const draft = Object.fromEntries(new FormData(e.currentTarget)); if (draft.desde && draft.hasta && draft.desde > draft.hasta) { setError('La fecha final debe ser igual o posterior a la inicial.'); return; } setFilters({ ...draft }); }}><label>Desde<input type="date" name="desde" defaultValue="" disabled={busy} /></label><label>Hasta<input type="date" name="hasta" defaultValue="" disabled={busy} /></label>{alcance !== 'unidad' && <label>Estación<select name="id_epi" defaultValue="" disabled={busy}><option value="">Todas las EPIs del ámbito</option>{payload?.epis.map(epi => <option key={epi.id_epi} value={epi.id_epi}>{epi.nombre}</option>)}</select></label>}<button type="submit" disabled={busy}>Aplicar filtros</button><button type="button" className="report-refresh" disabled={busy} onClick={() => setRefresh(r => r + 1)}><RefreshCw size={16} />Actualizar</button><span>El archivo conserva el reporte y los filtros aplicados.</span></form>
        {error && <div role="alert" className="report-error">{error}<button type="button" disabled={busy} onClick={() => setRefresh(r => r + 1)}>Volver a consultar</button></div>}{notice && <p role="status" className="report-notice">{notice}</p>}
        {loading ? <div className="report-loading" role="status"><RefreshCw size={20} />Consultando los datos de su ámbito…<div className="ofbol-skeleton" /></div> : payload && report ? <>
            <div className="report-scope"><span><ShieldCheck size={15} />{payload.ambito}</span><span>Período: {payload.filtros.desde || 'inicio del registro'} — {payload.filtros.hasta || 'último registro'} · Corte: {new Date(payload.generado_en).toLocaleString('es-BO')}</span></div>
            <div className="report-tabs" role="tablist" aria-label="Tipos de reporte">{payload.reportes.map(r => <button type="button" role="tab" id={`tab-${r.id}`} aria-controls={`panel-${r.id}`} key={r.id} aria-selected={r.id === selected} disabled={Boolean(downloading)} onClick={() => setSelected(r.id)}>{r.title}</button>)}</div>
            <section role="tabpanel" id={`panel-${report.id}`} aria-labelledby={`tab-${report.id}`} key={report.id}><div className="report-intro"><h2>{report.title}</h2><p>{report.description}</p></div><div className="report-kpis">{report.kpis.map((kpi, i) => <article key={kpi.label}><span>{kpi.label}</span><strong>{valueText(kpi.value, 'number', kpi.unit)}</strong><span>{i === 0 ? 'En el ámbito consultado' : 'Al corte del reporte'}</span></article>)}</div>
                <div className={`report-charts report-layout-${report.layout}`}>{report.charts.map(chart => <ChartCard key={chart.id} chart={chart} />)}</div><div className="report-tables">{report.tables.map(table => <DataTable key={table.id} table={table} />)}</div><details className="report-method"><summary>Cómo interpretar este reporte</summary>{report.notes.map(note => <p key={note}>{note}</p>)}<p>El Excel contiene gráficas nativas vinculadas a la hoja «Datos gráficas». Puede editar los valores y las gráficas en esa copia.</p></details>
            </section><ActionPanel reports={payload.reportes} selected={selected} onSelect={setSelected} role={alcance} />
        </> : !error && <p>No hay un reporte disponible para esta cuenta.</p>}
    </div></Layout>;
}

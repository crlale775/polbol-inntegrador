/**
 * RegistroOficialesIA.jsx — Panel de Registro de Oficiales y Verificación IA
 * Comando General de la Policía Boliviana
 *
 * Funciones:
 *  - Generar links de registro (el emisor elige el ROL y la EPI). El link se
 *    envía al oficial (WhatsApp) y abre el form público /registro-oficial/:token.
 *  - Listar solicitudes recibidas con su estado IA (firma, sello, nombres).
 *  - Ejecutar la verificación con la IA local (detecta si el nombre del
 *    registro NO coincide con el memo de designación → advertencia).
 *  - Aprobar (activa la cuenta) o rechazar la solicitud.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IdCard, Search, RefreshCw, ChevronLeft, ChevronRight, FileUp } from 'lucide-react';
import LayoutComandoGeneral from '../../js/components/LayoutComandoGeneral';
import Spinner from '../../js/components/ui/Spinner';
import CargandoLista from '../../js/components/ui/CargandoLista';
import Alert from '../../js/components/ui/Alert';
import Modal from '../../js/components/ui/Modal';
import { useConfirmar } from '../../js/components/ui/ConfirmDialog';
import { useAuth } from '../../js/context/AuthContext';
import api from '../../js/lib/api';
import { ChipEnVivo, useSyncGlobal } from '../../js/components/ui/ToastEnVivo';

const URL_BASE = window.location.origin;

function fmtFecha(f) {
    if (!f) return '—';
    const d = new Date(f);
    return isNaN(d) ? '—' : d.toLocaleString('es-BO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const BADGES_ESTADO = {
    recibida:   { label: 'Recibida',   cls: 'bg-blue-50 text-blue-800 border-blue-200' },
    verificada: { label: 'Verificada', cls: 'bg-teal-50 text-teal-800 border-teal-200' },
    aprobada:   { label: 'Aprobada',   cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    rechazada:  { label: 'Rechazada',  cls: 'bg-red-50 text-red-800 border-red-200' },
};

const BADGES_IA = {
    pendiente:  { label: 'IA pendiente', cls: 'bg-slate-100 text-slate-600' },
    en_cola:    { label: 'En cola (automático)', cls: 'bg-amber-50 text-amber-700' },
    verificando:{ label: 'Verificando con IA…', cls: 'bg-blue-50 text-blue-700' },
    procesada:  { label: 'IA procesada', cls: 'bg-emerald-50 text-emerald-700' },
    error:      { label: 'IA error',     cls: 'bg-red-50 text-red-700' },
};

function FotoSolicitud({solicitud}) {
    const [error,setError]=useState(false);
    const nombre=`${solicitud.nombres||''} ${solicitud.apellidos||''}`.trim();
    return <span className="w-10 h-10 shrink-0 rounded-full overflow-hidden bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold" aria-label={`Perfil de ${nombre}`}>
        {solicitud.ruta_foto && solicitud.adjuntos?.foto !== false && !error
            ? <img src={api.solicitudArchivoUrl(solicitud.id_solicitud,'foto')} alt={nombre} loading="lazy" decoding="async" className="w-full h-full object-cover" onError={()=>setError(true)} />
            : `${solicitud.nombres?.[0]||''}${solicitud.apellidos?.[0]||''}`}
    </span>;
}

function Paginacion({meta,pagina,cambiar,nombre,loading=false}) {
    if(!meta||meta.ultima_pagina<=1)return null;
    return <nav aria-label={nombre} className="flex flex-wrap items-center justify-between gap-3 text-xs pt-4">
        <span className="text-slate-500">Página {pagina} de {meta.ultima_pagina} · {meta.total} registros</span>
        <div className="flex gap-2">
            <button type="button" aria-label={`Anterior: ${nombre}`} disabled={loading||pagina<=1} onClick={()=>cambiar(pagina-1)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-40"><ChevronLeft size={16}/> Anterior</button>
            <button type="button" aria-label={`Siguiente: ${nombre}`} disabled={loading||pagina>=meta.ultima_pagina} onClick={()=>cambiar(pagina+1)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-40">Siguiente <ChevronRight size={16}/></button>
        </div>
    </nav>;
}

export default function RegistroOficialesIA() {
    const { user } = useAuth();
    const [solicitudes, setSolicitudes] = useState([]);
    const [links, setLinks] = useState([]);
    const [roles, setRoles] = useState([]);
    const [epis, setEpis] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mensaje, setMensaje] = useState(null);
    const [procesando, setProcesando] = useState(false);

    const [pagina, setPagina] = useState(1);
    const [paginaLinks, setPaginaLinks] = useState(1);
    const [busqueda, setBusqueda] = useState('');
    const [consulta, setConsulta] = useState('');
    const [filtro, setFiltro] = useState('');
    const [meta, setMeta] = useState(null);
    const [metaLinks, setMetaLinks] = useState(null);
    const [estadisticas, setEstadisticas] = useState(null);
    const [activosGlobal, setActivos] = useState(null);
    const [memoNuevo, setMemoNuevo] = useState(null);
    const [fotoNueva, setFotoNueva] = useState(null);
    const [verificandoId, setVerificandoId] = useState(null);
    const [segundosIA, setSegundosIA] = useState(0);
    const cargaVersionRef = useRef(0);
    const detalleVersionRef = useRef(0);
    useEffect(() => {
        const timer = setTimeout(() => { setConsulta(busqueda.trim()); setPagina(1); },300);
        return () => clearTimeout(timer);
    },[busqueda]);
    useEffect(() => {
        if (!verificandoId) return;
        const inicio=Date.now(); setSegundosIA(0);
        const timer=setInterval(()=>setSegundosIA(Math.floor((Date.now()-inicio)/1000)),1000);
        return ()=>clearInterval(timer);
    },[verificandoId]);

    // Generación de link
    const [modalLink, setModalLink] = useState(false);
    const [formLink, setFormLink] = useState({ id_rol: '1', id_epi: '1' });
    const [linkGenerado, setLinkGenerado] = useState(null);
    const [celularWa, setCelularWa] = useState('');

    // Detalle / acciones
    const [detalle, setDetalle] = useState(null);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);
    const [modalRechazo, setModalRechazo] = useState(false);
    const [motivoRechazo, setMotivoRechazo] = useState('');

    // Confirmación de acciones irreversibles (reemplaza a window.confirm).
    const { pedir, Confirmacion } = useConfirmar();

    const cargarCatalogos = async () => {
        try {
            const [rls,eps]=await Promise.all([api.get('/roles'),api.get('/epis')]);
            setRoles(Array.isArray(rls)?rls:[]);setEpis(Array.isArray(eps)?eps:[]);
        } catch { setMensaje({tipo:'error',texto:'No se pudieron cargar los roles y estaciones. Pulse Actualizar para reintentar.'}); }
    };
    const cargarTodo = async (mostrarCarga = false) => {
        const version=++cargaVersionRef.current;
        if(mostrarCarga)setLoading(true);
        const params=new URLSearchParams({paginar:'1',por_pagina:'20',page:String(pagina)});
        if(consulta)params.set('q',consulta);
        if(filtro==='advertencia')params.set('con_advertencia','1');
        else if(filtro==='error')params.set('ia_estado','error');
        else if(filtro)params.set('estado_solicitud',filtro);
        try {
            const [sol,lnk]=await Promise.all([
                api.get(`/solicitudes-registro?${params}`),
                api.get(`/registro-links?resumen=1&limite=8&page=${paginaLinks}`),
            ]);
            if(version!==cargaVersionRef.current)return;
            setSolicitudes(Array.isArray(sol)?sol:(sol.data||[]));setMeta(sol.meta||null);
            setEstadisticas(sol.estadisticas||null);
            setLinks(Array.isArray(lnk)?lnk:(lnk.data||[]));setMetaLinks(lnk.meta||null);
            setActivos(lnk.estadisticas?.activos??null);
        } catch(err) {
            if(version===cargaVersionRef.current)setMensaje({tipo:'error',texto:err.message||'No se pudieron cargar las solicitudes.'});
        } finally { if(version===cargaVersionRef.current)setLoading(false); }
    };

    // Ref estable para que el listener del modo en vivo siempre llame a la versión actual
    const cargarTodoRef = useRef(cargarTodo);
    useEffect(() => {
        cargarTodoRef.current = cargarTodo;
    });

    useEffect(() => { void cargarCatalogos(); }, []);
    useEffect(() => {
        void cargarTodo(true);
        return () => { cargaVersionRef.current++; };
    }, [pagina, paginaLinks, consulta, filtro]);

    // ── MODO EN VIVO: nuevas solicitudes de registro o IA terminada → refrescar ──
    const { conectado } = useSyncGlobal();
    useEffect(() => {
        const onSync = () => {
            if (typeof cargarTodoRef.current === 'function') cargarTodoRef.current();
        };
        window.addEventListener('ofbol:sync', onSync);
        return () => window.removeEventListener('ofbol:sync', onSync);
    }, []);

    const rolEsSecretario = () => String(formLink.id_rol) === '1';

    // ── Generar link de registro ──
    const generarLink = async (e) => {
        e.preventDefault();
        setProcesando(true);
        setLinkGenerado(null);
        try {
            const res = await api.post('/registro-links', {
                id_rol: parseInt(formLink.id_rol),
                id_epi: rolEsSecretario() ? parseInt(formLink.id_epi || '') : null,
                id_usuario_emisor: user?.id_usuario ?? null,
            });
            const url = `${URL_BASE}/registro-oficial/${res.token}`;
            setLinkGenerado({ url, token: res.token, rol: res.rol?.nombre, epi: res.epi?.nombre });
            cargarTodo();
        } catch (err) {
            const detalle = err.errors ? Object.values(err.errors).flat().join(' · ') : (err.message || 'No se pudo generar el enlace.');
            setMensaje({ tipo: 'error', texto: detalle });
        } finally {
            setProcesando(false);
        }
    };

    const copiar = (texto) => {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(texto).then(() => setMensaje({ tipo: 'success', texto: 'Enlace copiado al portapapeles.' }));
        } else {
            const ta = document.createElement('textarea');
            ta.value = texto;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setMensaje({ tipo: 'success', texto: 'Enlace copiado al portapapeles.' });
        }
    };

    const waLink = () => {
        const cel = celularWa.replace(/[^0-9]/g, '');
        const texto = encodeURIComponent(`Estimado(a), la POLICÍA BOLIVIANA le invita a completar su registro oficial. Por favor ingrese al siguiente enlace y adjunte su memo de designación: ${linkGenerado.url}`);
        return cel ? `https://wa.me/${cel}?text=${texto}` : `https://wa.me/?text=${texto}`;
    };

    // ── Detalle de solicitud ──
    const cerrarDetalle = () => {
        detalleVersionRef.current++;setDetalle(null);setMemoNuevo(null);setFotoNueva(null);
    };
    const abrirDetalle = async (s) => {
        const version=++detalleVersionRef.current;
        setCargandoDetalle(true);setDetalle(s);setMemoNuevo(null);setFotoNueva(null);
        try {
            const data=await api.get(`/solicitudes-registro/${s.id_solicitud}`);
            if(version===detalleVersionRef.current)setDetalle(data);
        } catch(err) { setMensaje({tipo:'error',texto:err.message||'No se pudo cargar el detalle.'}); }
        finally { if(version===detalleVersionRef.current)setCargandoDetalle(false); }
    };
    const verificarIA = async (s, forzar=false) => {
        const inicio=performance.now();
        const version=++detalleVersionRef.current;
        setDetalle(s);setCargandoDetalle(false);setProcesando(true);setVerificandoId(s.id_solicitud);
        try {
            const res=await api.post(`/solicitudes-registro/${s.id_solicitud}/verificar-ia`,{forzar});
            const duracion=(performance.now()-inicio)/1000;
            const tiempo=` (${duracion<1?'menos de 1':duracion.toFixed(1)} s)`;
            setMensaje({tipo:res.solicitud?.ia_advertencia?'warning':'success',texto:res.message+tiempo});
            if(version===detalleVersionRef.current)setDetalle(res.solicitud);
        } catch(err) {
            setMensaje({tipo:'error',texto:err.errors?Object.values(err.errors).flat().join(' '):(err.message||'No se pudo completar la revisión.')});
            try {
                const actual=await api.get(`/solicitudes-registro/${s.id_solicitud}`);
                if(version===detalleVersionRef.current)setDetalle(actual);
            } catch { /* El mensaje del intento permanece visible. */ }
        } finally { setProcesando(false);setVerificandoId(null);void cargarTodo(); }
    };
    const guardarAdjuntos = async (e) => {
        e.preventDefault();if(!detalle||(!memoNuevo&&!fotoNueva))return;
        if(memoNuevo&&memoNuevo.size>50*1024*1024){setMensaje({tipo:'error',texto:'El memorándum supera los 50 MB.'});return;}
        if(fotoNueva&&fotoNueva.size>5*1024*1024){setMensaje({tipo:'error',texto:'La foto supera los 5 MB.'});return;}
        const version=detalleVersionRef.current;setProcesando(true);
        try {
            const fd=new FormData();if(memoNuevo)fd.append('archivo',memoNuevo);if(fotoNueva)fd.append('foto',fotoNueva);
            const res=await api.upload(`/solicitudes-registro/${detalle.id_solicitud}/adjuntos`,fd,{timeoutMs:0});
            if(version===detalleVersionRef.current){setDetalle(res.solicitud);setMemoNuevo(null);setFotoNueva(null);}
            setMensaje({tipo:'success',texto:res.message});void cargarTodo();
        } catch(err) { setMensaje({tipo:'error',texto:err.errors?Object.values(err.errors).flat().join(' '):err.message}); }
        finally {setProcesando(false);}
    };

    const aprobar = async (s) => {
        const confirmado = await pedir({
            titulo: 'Aprobar el registro',
            mensaje: `Se activará la cuenta «${s.usuario}» de ${s.nombres} ${s.apellidos}.`,
            detalle: s.ia_advertencia || s.ia_estado!=='procesada' || s.adjuntos?.memo===false || s.adjuntos?.foto===false
                ? 'Hay observaciones o comprobaciones pendientes. Revise los originales antes de autorizar el acceso; la decisión es suya.'
                : 'El oficial podrá ingresar al sistema.',
            tono: 'oliva',
            confirmarTexto: 'Aprobar y activar',
        });
        if (!confirmado) return;
        setProcesando(true);
        try {
            const res = await api.post(`/solicitudes-registro/${s.id_solicitud}/aprobar`, {});
            setMensaje({ tipo: 'success', texto: res.message });
            if (detalle?.id_solicitud === s.id_solicitud) setDetalle(res.solicitud);
            cargarTodo();
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.message || 'Error al aprobar.' });
        } finally {
            setProcesando(false);
        }
    };

    const rechazar = async (e) => {
        e?.preventDefault?.();
        if (!motivoRechazo.trim()) {
            setMensaje({ tipo: 'error', texto: 'Debe indicar el motivo del rechazo.' });
            return;
        }
        setProcesando(true);
        try {
            const res = await api.post(`/solicitudes-registro/${modalRechazo.id_solicitud}/rechazar`, { observacion: motivoRechazo.trim() });
            setMensaje({ tipo: 'warning', texto: res.message });
            setModalRechazo(false);
            setMotivoRechazo('');
            setDetalle(res.solicitud);
            cargarTodo();
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.message || 'Error al rechazar.' });
        } finally {
            setProcesando(false);
        }
    };

    const cancelarLink = async (l) => {
        const confirmado = await pedir({
            titulo: 'Cancelar el enlace',
            mensaje: 'El enlace dejará de aceptar registros de oficiales.',
            detalle: 'Los registros ya recibidos no se ven afectados.',
            tono: 'crimson',
            confirmarTexto: 'Cancelar enlace',
        });
        if (!confirmado) return;
        try {
            await api.post(`/registro-links/${l.id_link}/cancelar`, {});
            setMensaje({ tipo: 'success', texto: 'Enlace cancelado.' });
            cargarTodo();
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.message || 'Error al cancelar.' });
        }
    };

    const stats = useMemo(() => {
        const recibidas = solicitudes.filter((s) => s.estado_solicitud === 'recibida' || s.estado_solicitud === 'verificada').length;
        const aprobadas = solicitudes.filter((s) => s.estado_solicitud === 'aprobada').length;
        const advertencias = solicitudes.filter((s) => s.ia_advertencia).length;
        const activos = links.filter((l) => l.estado === 'activo').length;
        return { ...(estadisticas || {recibidas, aprobadas, advertencias}), activos: activosGlobal ?? activos };
    }, [solicitudes, links, estadisticas, activosGlobal]);

    const resultadoIA = (s) => {
        const chips = [];
        if (s.ia_firma === true) chips.push({ t: 'Firma', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' });
        else if (s.ia_firma === false) chips.push({ t: 'Sin firma', cls: 'bg-red-50 text-red-700 border-red-200' });
        if (s.ia_sello === true) chips.push({ t: 'Sello', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' });
        else if (s.ia_sello === false) chips.push({ t: 'Sin sello', cls: 'bg-red-50 text-red-700 border-red-200' });
        // Los nombres detectados se guardan como JSON string en ia_nombres
        let nombresMemo = [];
        if (Array.isArray(s.nombres_detectados)) nombresMemo = s.nombres_detectados;
        else if (typeof s.ia_nombres === 'string' && s.ia_nombres) {
            try { nombresMemo = JSON.parse(s.ia_nombres); } catch (_) { nombresMemo = []; }
        }
        if (Array.isArray(nombresMemo) && nombresMemo.length > 0) {
            chips.push({ t: `Memo: ${nombresMemo.join(', ')}`, cls: 'bg-blue-50 text-blue-800 border-blue-200' });
        }
        // Resultado de la verificación de rostro en la foto de perfil
        if (s.ia_rostro === true) chips.push({ t: 'Rostro OK', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' });
        else if (s.ia_rostro === false) chips.push({ t: 'Sin rostro', cls: 'bg-red-50 text-red-700 border-red-200' });
        return chips;
    };

    return (
        <LayoutComandoGeneral>
            <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 ofbol-page-enter">
                {/* ─ Header ─ */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#e6efec] text-[#2a351a] border border-[#cbe4df]">
                                Vinculación y Seguridad
                            </span>
                            <span className="text-xs text-slate-400">· Registro externo de oficiales</span>
                        </div>
                        <div className="mb-2">
                            <ChipEnVivo conectado={conectado} />
                        </div>
                        <h1 className="ofbol-display heading-balance break-words">
                            Registro de Oficiales y Verificación IA
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Genere el enlace de registro, verifique con la IA local (firma · sello · identidad del memo) y active la cuenta del oficial.
                        </p>
                    </div>
                    <button
                        onClick={() => { setModalLink(true); setLinkGenerado(null); }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#33401f] hover:bg-[#0f312c] text-white text-xs font-black rounded-xl transition-colors shadow-sm self-start sm:self-auto"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l4-4a4 4 0 015.656 5.656l-1.5 1.5" />
                        </svg>
                        Generar link de registro
                    </button>
                </div>

                {mensaje && <Alert type={mensaje.tipo} onClose={() => setMensaje(null)}>{mensaje.texto}</Alert>}
                {verificandoId && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-center gap-3">
                    <Spinner size="sm"/> Verificando solicitud #{verificandoId} · {segundosIA} s. Se revisan el memorándum, la identidad y la foto.
                </div>}

                {/* ─ Métricas ─ */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'En verificación', value: stats.recibidas, color: 'text-blue-900', chip: 'bg-blue-50' },
                        { label: 'Cuentas activadas', value: stats.aprobadas, color: 'text-emerald-900', chip: 'bg-emerald-50' },
                        { label: 'Advertencias IA', value: stats.advertencias, color: 'text-red-900', chip: 'bg-red-50' },
                        { label: 'Links activos', value: stats.activos, color: 'text-teal-900', chip: 'bg-teal-50' },
                    ].map((m) => (
                        <div key={m.label} className={`${m.chip} rounded-[14px] p-4 border border-slate-100`}>
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{m.label}</p>
                            <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
                        </div>
                    ))}
                </div>

                {/* ─ Links generados ─ */}
                {links.length > 0 && (
                    <div className="bg-white rounded-[14px] border border-slate-100 p-5">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Enlaces de registro generados</h3>
                        <div className="space-y-2">
                            {links.slice(0, 8).map((l) => (
                                <div key={l.id_link} className="flex flex-wrap items-center gap-2 text-xs bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                                    <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                        l.estado === 'activo' ? 'bg-emerald-50 text-emerald-700' : ['usado', 'utilizado'].includes(l.estado) ? 'bg-slate-100 text-slate-500' : 'bg-red-50 text-red-700'
                                    }`}>{l.estado}</span>
                                    <span className="font-bold text-slate-800">{l.rol?.nombre}</span>
                                    {l.epi && <span className="text-slate-500">{l.epi?.nombre}</span>}
                                    <span className="text-slate-400">{fmtFecha(l.creado_en)}</span>
                                    <span className="text-slate-400">· {l.solicitudes_count ?? l.solicitudes?.length ?? 0} solicitud(es)</span>
                                    <div className="ml-auto flex gap-1.5">
                                        <button onClick={() => copiar(`${URL_BASE}/registro-oficial/${l.token}`)} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-600 hover:bg-slate-100">Copiar</button>
                                        {l.estado === 'activo' && (
                                            <button onClick={() => cancelarLink(l)} className="px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 font-bold text-red-700 hover:bg-red-100">Cancelar</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Paginacion meta={metaLinks} pagina={paginaLinks} cambiar={setPaginaLinks} nombre="Enlaces de registro" loading={loading}/>
                    </div>
                )}

                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
                    <label className="flex-1 basis-full sm:basis-64 min-w-0 text-xs font-bold text-slate-600">Buscar solicitudes
                        <span className="relative block mt-1"><Search size={16} className="absolute left-3 top-3 text-slate-400"/>
                            <input type="search" value={busqueda} maxLength={100} onChange={e=>setBusqueda(e.target.value)} placeholder="Nombre, C.I., usuario o celular" className="ofbol-input w-full pl-9"/>
                        </span>
                    </label>
                    <label className="text-xs font-bold text-slate-600">Estado
                        <select value={filtro} onChange={e=>{setFiltro(e.target.value);setPagina(1);}} className="ofbol-input block mt-1">
                            <option value="">Todos los estados</option><option value="recibida">Recibidas</option><option value="verificada">Verificadas</option>
                            <option value="aprobada">Aprobadas</option><option value="rechazada">Rechazadas</option><option value="advertencia">Con observaciones</option><option value="error">Error de verificación</option>
                        </select>
                    </label>
                    <button type="button" onClick={()=>{void cargarTodo(true);void cargarCatalogos();}} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50"><RefreshCw size={16}/> Actualizar</button>
                </div>

                {/* ─ Tabla de solicitudes ─ */}
                <div className="min-w-0 bg-white rounded-[14px] border border-slate-100 overflow-hidden">
                    {loading ? (
                        <CargandoLista />
                    ) : solicitudes.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 space-y-2">
                            <IdCard size={30} strokeWidth={1.5} className="mx-auto text-slate-300" aria-hidden="true" />
                            <p className="text-xs font-bold">Aún no hay solicitudes de registro</p>
                            <p className="text-xs">Genere un link y envíelo al oficial por WhatsApp para que complete su registro.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                        <th className="px-4 py-3">Fecha</th>
                                        <th className="px-4 py-3">Registrado</th>
                                        <th className="px-4 py-3">Celular</th>
                                        <th className="px-4 py-3">Rol / EPI</th>
                                        <th className="px-4 py-3">Cuenta</th>
                                        <th className="px-4 py-3">Estado IA</th>
                                        <th className="px-4 py-3">Advertencia</th>
                                        <th className="px-4 py-3 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {solicitudes.map((s) => {
                                        const be = BADGES_ESTADO[s.estado_solicitud] ?? BADGES_ESTADO.recibida;
                                        const bi = BADGES_IA[s.ia_estado] ?? BADGES_IA.pendiente;
                                        return (
                                            <tr key={s.id_solicitud} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtFecha(s.creado_en)}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3"><FotoSolicitud key={s.id_solicitud} solicitud={s}/><div>
                                                        <p className="font-bold text-slate-900">{s.nombres} {s.apellidos}</p>
                                                        <p className="text-[10px] text-slate-400">{s.ci ? `CI ${s.ci}` : ''}</p>
                                                    </div></div>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-slate-600">{s.telefono}</td>
                                                <td className="px-4 py-3">
                                                    <p className="font-semibold text-slate-800">{s.rol?.nombre ?? `Rol ${s.id_rol}`}</p>
                                                    {s.epi?.nombre && <p className="text-[10px] text-slate-400">{s.epi.nombre}</p>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${be.cls}`}>{be.label}</span>
                                                    <p className="font-mono text-[10px] text-slate-500 mt-0.5">{s.usuario}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${bi.cls}`}>{bi.label}</span>
                                                    {s.ia_estado === 'procesada' && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {resultadoIA(s).map((c, i) => (
                                                                <span key={i} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${c.cls}`}>{c.t}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {s.ia_advertencia ? (
                                                        <span title={s.ia_mensaje || ''} className="px-2 py-1 rounded-md bg-red-50 text-red-700 border border-red-200 text-[10px] font-black cursor-help">
                                                            Revisar observaciones
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                                                    <button onClick={() => abrirDetalle(s)} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Ver</button>
                                                    <button
                                                        onClick={() => verificarIA(s)}
                                                        disabled={procesando || s.adjuntos?.memo === false}
                                                        className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold disabled:opacity-40"
                                                    >
                                                        {s.adjuntos?.memo === false ? 'Falta PDF' : s.ia_estado === 'procesada' ? 'Re-verificar IA' : 'Verificar IA'}
                                                    </button>
                                                    {s.estado_solicitud !== 'aprobada' && s.estado_solicitud !== 'rechazada' && (
                                                        <>
                                                            <button onClick={() => aprobar(s)} disabled={procesando} className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-40">Aprobar</button>
                                                            <button onClick={() => { setModalRechazo(s); setMotivoRechazo(''); }} disabled={procesando} className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold disabled:opacity-40">Rechazar</button>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="px-4 pb-4"><Paginacion meta={meta} pagina={pagina} cambiar={setPagina} nombre="Solicitudes" loading={loading}/></div>
                </div>
            </div>

            {/* ═══ MODAL: Generar link ═══ */}
            <Modal open={modalLink} onClose={() => setModalLink(false)} title="Generar link de registro" size="md">
                <form onSubmit={generarLink} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="link-rol" className="text-[10px] font-black uppercase text-slate-500 block mb-1">Rol que recibirá *</label>
                            <select aria-label="Filtro"
                                id="link-rol"
                                value={formLink.id_rol}
                                onChange={(e) => setFormLink((f) => ({ ...f, id_rol: e.target.value }))}
                                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus-visible:ring-2 focus-visible:ring-[#33401f]"
                            >
                                {roles.map((r) => (
                                    <option key={r.id_rol} value={r.id_rol}>{r.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="link-epi" className="text-[10px] font-black uppercase text-slate-500 block mb-1">EPI asignada {rolEsSecretario() ? '*' : '(opcional)'}</label>
                            <select aria-label="Filtro"
                                id="link-epi"
                                value={formLink.id_epi}
                                onChange={(e) => setFormLink((f) => ({ ...f, id_epi: e.target.value }))}
                                disabled={!rolEsSecretario()}
                                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[#33401f]"
                            >
                                {rolEsSecretario() && <option value="">Seleccione EPI…</option>}
                                {epis.map((ep) => (
                                    <option key={ep.id_epi} value={ep.id_epi}>{ep.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                        Se generará un enlace único. Envíelo al oficial (WhatsApp, correo…) para que complete el formulario y adjunte su memo de designación.
                    </p>

                    {linkGenerado ? (
                        <div className="space-y-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                            <p className="text-xs font-black text-emerald-800">Enlace generado — {linkGenerado.rol}{linkGenerado.epi ? ` · ${linkGenerado.epi}` : ''}</p>
                            <div className="flex items-center gap-2">
                                <input readOnly aria-label="Enlace de registro generado" value={linkGenerado.url} onFocus={(e) => e.target.select()} className="w-full text-[10px] font-mono bg-white border border-emerald-200 rounded-lg px-2.5 py-2" />
                                <button type="button" onClick={() => copiar(linkGenerado.url)} className="px-3 py-2 bg-[#33401f] text-white rounded-lg text-[11px] font-black shrink-0">Copiar</button>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input aria-label="Celular del oficial (opcional) ej. 59171234567"
                                    type="tel"
                                    value={celularWa}
                                    onChange={(e) => setCelularWa(e.target.value)}
                                    placeholder="Celular del oficial (opcional) ej. 59171234567"
                                    className="w-full text-xs p-2 bg-white border border-emerald-200 rounded-lg focus-visible:ring-2 focus-visible:ring-emerald-400"
                                />
                                <a href={waLink()} target="_blank" rel="noreferrer" className="px-3 py-2 bg-[#1a5c52] text-white rounded-lg text-[11px] font-black text-center shrink-0 whitespace-nowrap">
                                    Enviar por WhatsApp
                                </a>
                            </div>
                            <button type="button" onClick={() => { setLinkGenerado(null); setModalLink(false); }} className="text-[11px] font-bold text-emerald-800 underline">
                                Listo, cerrar
                            </button>
                        </div>
                    ) : (
                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button type="button" onClick={() => setModalLink(false)} className="px-4 py-2 text-xs font-bold text-slate-600 rounded-lg">Cancelar</button>
                            <button type="submit" disabled={procesando || (rolEsSecretario() && !formLink.id_epi)} className="px-5 py-2 bg-[#33401f] hover:bg-[#0f312c] text-white text-xs font-black rounded-xl disabled:opacity-50">
                                {procesando ? 'Generando…' : 'Generar enlace'}
                            </button>
                        </div>
                    )}
                </form>
            </Modal>

            {/* ═══ MODAL: Detalle de solicitud ═══ */}
            <Modal
                open={!!detalle && !modalRechazo}
                onClose={cerrarDetalle}
                title={`Solicitud #${detalle?.id_solicitud ?? ''} — ${detalle?.nombres ?? ''} ${detalle?.apellidos ?? ''}`}
                size="xl"
            >
                {!detalle ? null : cargandoDetalle ? (
                    <CargandoLista />
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        {/* Columna izquierda: datos + verificación IA */}
                        <div className="space-y-4 min-w-0">
                            {/* Datos */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                {[
                                    ['Celular', detalle.telefono],
                                    ['Cédula de identidad', detalle.ci || '—'],
                                    ['Usuario asignado', detalle.usuario],
                                    ['Rol', detalle.rol?.nombre ?? detalle.id_rol],
                                    ['EPI', detalle.epi?.nombre ?? 'Nivel Central'],
                                    ['Recibido', fmtFecha(detalle.creado_en)],
                                ].map(([l, v]) => (
                                    <div key={l} className="bg-slate-50 rounded-xl p-3">
                                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{l}</p>
                                        <p className="font-bold text-slate-800 mt-0.5 break-words">{v}</p>
                                    </div>
                                ))}
                            </div>

                            <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" aria-label="Adjuntos de la solicitud">
                                <h3 className="text-sm font-bold flex items-center gap-2"><FileUp size={17}/> Adjuntos para la revisión</h3>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <span className={detalle.adjuntos?.memo===false?'text-red-800':'text-emerald-800'}>Memorándum: {detalle.adjuntos?.memo===false?'no disponible':'adjunto'}</span>
                                    <span className={detalle.adjuntos?.foto===false?'text-red-800':'text-emerald-800'}>Foto: {detalle.adjuntos?.foto===false?'no disponible':'adjunta'}</span>
                                </div>
                                {(detalle.adjuntos?.memo===false||detalle.adjuntos?.foto===false)&&<p className="text-xs text-amber-900 bg-amber-50 rounded-lg p-3">El registro existe, pero falta el archivo original en el servidor. Adjunte el original correcto; la IA no puede verificar un archivo ausente.</p>}
                                {!['aprobada','rechazada'].includes(detalle.estado_solicitud)&&<form onSubmit={guardarAdjuntos} className="space-y-3">
                                    <label className="block text-xs font-semibold">Memorándum PDF · máximo 50 MB<input key={`memo-${detalle.ruta_memo}`} type="file" accept="application/pdf,.pdf" disabled={procesando} onChange={e=>setMemoNuevo(e.target.files?.[0]||null)} className="block w-full min-w-0 mt-1 text-xs"/></label>
                                    <label className="block text-xs font-semibold">Foto de perfil · JPG o PNG · máximo 5 MB<input key={`foto-${detalle.ruta_foto}`} type="file" accept="image/jpeg,image/png" disabled={procesando} onChange={e=>setFotoNueva(e.target.files?.[0]||null)} className="block w-full min-w-0 mt-1 text-xs"/></label>
                                    <button type="submit" disabled={procesando||(!memoNuevo&&!fotoNueva)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-40">Guardar adjuntos</button>
                                    <p className="text-xs text-slate-500">Actualizar adjuntos reinicia la revisión. La cuenta permanece inactiva hasta su aprobación.</p>
                                </form>}
                            </section>

                            {/* Foto de perfil + resultado de rostro */}
                            {detalle.ruta_foto && detalle.adjuntos?.foto !== false && (
                                <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                                    <img
                                        src={api.solicitudArchivoUrl(detalle.id_solicitud, 'foto')}
                                        alt="Foto de perfil del solicitante"
                                        className="w-16 h-16 rounded-xl object-cover border border-slate-200"
                                    />
                                    <div className="text-xs">
                                        <p className="font-black uppercase tracking-wider text-slate-400 text-[9px]">Foto de perfil · verificación IA</p>
                                        {detalle.ia_rostro === true && <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">Rostro humano detectado</span>}
                                        {detalle.ia_rostro === false && <span className="px-2 py-0.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold">No parece un rostro</span>}
                                        {detalle.ia_rostro === null || detalle.ia_rostro === undefined ? (
                                            <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-bold">Sin verificar aún</span>
                                        ) : null}
                                    </div>
                                </div>
                            )}

                            {/* Estado */}
                            <div className="flex flex-wrap gap-2 items-center text-[11px]">
                                <span className={`px-2.5 py-1 rounded-md font-black border ${(BADGES_ESTADO[detalle.estado_solicitud] ?? BADGES_ESTADO.recibida).cls}`}>
                                    {(BADGES_ESTADO[detalle.estado_solicitud] ?? BADGES_ESTADO.recibida).label}
                                </span>
                                <span className={`px-2.5 py-1 rounded-md font-bold ${(BADGES_IA[detalle.ia_estado] ?? BADGES_IA.pendiente).cls}`}>
                                    {(BADGES_IA[detalle.ia_estado] ?? BADGES_IA.pendiente).label}
                                </span>
                                {detalle.ia_advertencia && (
                                    <span className="px-2.5 py-1 rounded-md font-black bg-red-600 text-white">{detalle.ia_coincide===false?'ADVERTENCIA DE IDENTIDAD':'REVISIÓN REQUERIDA'}</span>
                                )}
                            </div>

                            {/* Resultado IA */}
                            <div className="rounded-xl border border-slate-200 overflow-hidden">
                                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    Último resultado de IA del memorándum
                                </div>
                                <div className="p-4 space-y-3">
                                    <div className="flex flex-wrap gap-2">
                                        {detalle.ia_firma === true && <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">Firma detectada</span>}
                                        {detalle.ia_firma === false && <span className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold">Sin firma</span>}
                                        {detalle.ia_sello === true && <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">Sello detectado</span>}
                                        {detalle.ia_sello === false && <span className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold">Sin sello</span>}
                                        {detalle.ia_firma === null && <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-bold">Sin verificar aún</span>}
                                    </div>

                                    {detalle.ia_nombres && (() => { try {
                                        const n = JSON.parse(detalle.ia_nombres);
                                        return n.length > 0 ? (
                                            <p className="text-xs text-slate-600">
                                                <strong>Nombres detectados en el memo:</strong> {n.join(', ')}
                                            </p>
                                        ) : null;
                                    } catch (_) { return null; } })()}

                                    {detalle.ia_coincide === false && (
                                        <Alert type="warning">
                                            El nombre con el que se registró (<strong>{detalle.nombres} {detalle.apellidos}</strong>) no coincide con el memo de designación subido.
                                        </Alert>
                                    )}
                                    {detalle.ia_mensaje && (
                                        <p className={`text-xs font-medium ${detalle.ia_advertencia ? 'text-amber-700' : 'text-emerald-700'}`}>
                                            {detalle.ia_mensaje}
                                        </p>
                                    )}
                                    {detalle.ia_estado === 'error' && (
                                        <Alert type="error">
                                            {detalle.ia_mensaje || 'No se pudo completar la revisión. Compruebe los adjuntos y el servicio local.'}
                                        </Alert>
                                    )}

                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <button onClick={() => verificarIA(detalle)} disabled={procesando || detalle.adjuntos?.memo===false} className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-black rounded-xl disabled:opacity-50">
                                            {verificandoId ? `Verificando… ${segundosIA} s` : detalle.adjuntos?.memo===false?'Adjunte el PDF para verificar':detalle.ia_estado === 'procesada' ? 'Re-verificar con IA' : 'Verificar con IA local'}
                                        </button>
                                        {detalle.ia_estado==='procesada'&&<button type="button" disabled={procesando||detalle.adjuntos?.memo===false} onClick={()=>verificarIA(detalle,true)} className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold disabled:opacity-50">Nueva lectura de adjuntos</button>}
                                        {detalle.estado_solicitud !== 'aprobada' && detalle.estado_solicitud !== 'rechazada' && (
                                            <>
                                                <button onClick={() => aprobar(detalle)} disabled={procesando} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl disabled:opacity-50">
                                                    Aprobar y activar cuenta
                                                </button>
                                                <button onClick={() => setModalRechazo(detalle)} disabled={procesando} className="px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-xs font-black rounded-xl disabled:opacity-50">
                                                    Rechazar
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {detalle.observacion && (
                                <Alert type="warning">
                                    <strong>Observación:</strong> {detalle.observacion}
                                </Alert>
                            )}
                        </div>

                        {/* Columna derecha: documento en vivo */}
                        {detalle.ruta_memo && detalle.adjuntos?.memo !== false && (
                            <div className="min-w-0 flex flex-col">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                        Memo de designación adjunto
                                    </p>
                                    <a
                                        href={api.solicitudArchivoUrl(detalle.id_solicitud, 'memo')}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] font-bold text-emerald-700 hover:underline flex items-center gap-1"
                                    >
                                        Abrir en pestaña ↗
                                    </a>
                                </div>
                                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex-1 min-h-[420px] xl:min-h-[520px]">
                                    <iframe
                                        key={detalle.ia_verificado_en || detalle.id_solicitud}
                                        src={api.solicitudArchivoUrl(detalle.id_solicitud, 'memo')}
                                        title="Memo de designación"
                                        className="w-full h-full min-h-[420px] xl:min-h-[520px]"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* ═══ MODAL: Rechazo ═══ */}
            <Modal open={!!modalRechazo} onClose={() => setModalRechazo(false)} title={`Rechazar registro de ${modalRechazo?.nombres ?? ''} ${modalRechazo?.apellidos ?? ''}`} size="sm">
                <form onSubmit={rechazar} className="space-y-3">
                    <textarea aria-label="Indique el motivo del rechazo (ej. el nombre no coincide con el memo de designación)…"
                        rows={4}
                        value={motivoRechazo}
                        onChange={(e) => setMotivoRechazo(e.target.value)}
                        placeholder="Indique el motivo del rechazo (ej. el nombre no coincide con el memo de designación)…"
                        className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus-visible:ring-2 focus-visible:ring-red-400"
                    />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setModalRechazo(false)} className="px-4 py-2 text-xs font-bold text-slate-600 rounded-lg">Cancelar</button>
                        <button type="submit" disabled={procesando} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl disabled:opacity-50">
                            {procesando ? 'Procesando…' : 'Confirmar rechazo'}
                        </button>
                    </div>
                </form>
            </Modal>
            {Confirmacion}
        </LayoutComandoGeneral>
    );
}

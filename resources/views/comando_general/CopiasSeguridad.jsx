/**
 * CopiasSeguridad.jsx — Copias de seguridad de la información
 * Comando General de la Policía Boliviana
 *
 * Guardar una copia de todos los datos, ver las copias guardadas, descargarlas
 * en SQL (como un respaldo de pgAdmin) y recuperar una. Como medida de seguridad,
 * cada acción pide antes la contraseña. Recuperar reemplaza toda la información
 * actual y el servidor guarda antes una copia automática.
 */
import React, { useEffect, useState } from 'react';
import { DatabaseBackup, Download, Lock, RotateCcw, Save, Trash2 } from 'lucide-react';
import LayoutComandoGeneral from '../../js/components/LayoutComandoGeneral';
import CargandoLista from '../../js/components/ui/CargandoLista';
import Alert from '../../js/components/ui/Alert';
import Modal from '../../js/components/ui/Modal';
import Spinner from '../../js/components/ui/Spinner';
import { EstadoVacio } from '../../js/components/ui/Graficos';
import api from '../../js/lib/api';

const fecha = (valor) => {
    const dia = new Date(valor);
    return Number.isNaN(dia.getTime()) ? 'Fecha no disponible' : dia.toLocaleString('es-BO', { dateStyle: 'long', timeStyle: 'short' });
};

function tamano(bytes) {
    const valor = Number(bytes) || 0;
    if (valor >= 1048576) return `${(valor / 1048576).toLocaleString('es-BO', { maximumFractionDigits: 1 })} MB`;
    return `${Math.max(1, Math.round(valor / 1024)).toLocaleString('es-BO')} KB`;
}

/** Qué se le explica a la persona antes de pedirle la contraseña, según la acción. */
const ACCIONES = {
    guardar: {
        titulo: 'Guardar una copia de seguridad',
        boton: 'Guardar copia', enCurso: 'Guardando…', Icono: Save, clase: 'ofbol-btn-primary',
        texto: () => 'Se guardará una copia de toda la información del sistema tal como está ahora.',
    },
    descargar: {
        titulo: 'Descargar la copia en SQL',
        boton: 'Descargar archivo', enCurso: 'Preparando…', Icono: Download, clase: 'ofbol-btn-primary',
        texto: (copia) => `Se descargará un archivo .sql con la copia del ${fecha(copia.creada)}. Contiene toda la información del sistema: guárdelo en un lugar seguro.`,
    },
    eliminar: {
        titulo: 'Eliminar esta copia',
        boton: 'Eliminar copia', enCurso: 'Eliminando…', Icono: Trash2, clase: 'ofbol-btn-danger',
        texto: (copia) => `Se eliminará la copia guardada el ${fecha(copia.creada)} y ya no podrá recuperarla. La información actual del sistema no cambia.`,
    },
    recuperar: {
        titulo: 'Recuperar una copia de seguridad',
        boton: 'Recuperar esta copia', enCurso: 'Recuperando…', Icono: RotateCcw, clase: 'ofbol-btn-danger',
        texto: (copia) => `Toda la información del sistema volverá a como estaba el ${fecha(copia.creada)}.`,
    },
};

export default function CopiasSeguridad() {
    const [copias, setCopias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [nota, setNota] = useState('');
    const [mensaje, setMensaje] = useState(null);
    // Acción en espera de contraseña: { tipo, copia }.
    const [pendiente, setPendiente] = useState(null);
    const [password, setPassword] = useState('');
    const [procesando, setProcesando] = useState(false);
    const [errorAccion, setErrorAccion] = useState('');

    const cargar = async () => {
        try {
            const lista = await api.get('/copias-seguridad');
            setCopias(Array.isArray(lista) ? lista : []);
        } catch (error) {
            setMensaje({ tipo: 'error', texto: error.message || 'No se pudo consultar la lista de copias.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { cargar(); }, []);

    const pedir = (tipo, copia = null) => { setPassword(''); setErrorAccion(''); setMensaje(null); setPendiente({ tipo, copia }); };
    const cerrar = () => { if (!procesando) setPendiente(null); };

    const ejecutar = {
        guardar: async () => {
            const copia = await api.post('/copias-seguridad', { nota: nota.trim(), password });
            setNota('');
            return `Copia guardada con ${(Number(copia?.registros) || 0).toLocaleString('es-BO')} registros.`;
        },
        descargar: async (copia) => {
            const { blob, filename } = await api.download(`/copias-seguridad/${copia.id}/descargar`, { password });
            const url = URL.createObjectURL(blob);
            const enlace = document.createElement('a');
            enlace.href = url;
            enlace.download = filename || `Copia_de_seguridad_${copia.id}.sql`;
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return 'Archivo SQL descargado. Puede abrirlo con pgAdmin.';
        },
        eliminar: async (copia) => {
            await api.delete(`/copias-seguridad/${copia.id}`, { password });
            return 'Copia eliminada.';
        },
        recuperar: async (copia) => {
            const respuesta = await api.post(`/copias-seguridad/${copia.id}/recuperar`, { password });
            return `La información volvió al estado del ${fecha(copia.creada)} (${(Number(respuesta?.registros) || 0).toLocaleString('es-BO')} registros). Lo que había antes quedó guardado en una copia automática.`;
        },
    };

    const confirmar = async (evento) => {
        evento.preventDefault();
        if (procesando || !password || !pendiente) return;
        setProcesando(true);
        setErrorAccion('');
        try {
            const texto = await ejecutar[pendiente.tipo](pendiente.copia);
            setPendiente(null);
            setPassword('');
            setMensaje({ tipo: 'success', texto });
            await cargar();
        } catch (error) {
            setErrorAccion(error.message || 'No se pudo completar la acción. No se modificó nada.');
        } finally {
            setProcesando(false);
        }
    };

    const guardar = (evento) => { evento.preventDefault(); pedir('guardar'); };
    const accion = pendiente ? ACCIONES[pendiente.tipo] : null;

    return (
        <LayoutComandoGeneral>
            <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6 ofbol-page-enter">
                <div className="min-w-0">
                    <h1 className="ofbol-display heading-balance">Copias de seguridad</h1>
                    <p className="ofbol-nota mt-2">
                        Guarde una copia de toda la información del sistema y vuelva a ella si algo sale mal.
                    </p>
                </div>

                {mensaje && <Alert type={mensaje.tipo} onClose={() => setMensaje(null)}>{mensaje.texto}</Alert>}

                {/* ─ Guardar una copia ─ */}
                <form onSubmit={guardar} className="ofbol-card p-5 space-y-4">
                    <div>
                        <h2 className="ofbol-titulo-seccion">Guardar una copia ahora</h2>
                        <p className="ofbol-nota mt-1">
                            Incluye usuarios, oficiales, trámites, revisiones, catálogos y el registro de actividad.
                            No incluye los archivos PDF ni las fotografías. Por seguridad se le pedirá su contraseña.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                        <div className="flex-1 min-w-0">
                            <label htmlFor="copia-nota" className="ofbol-etiqueta">Nota para reconocerla después (opcional)</label>
                            <input id="copia-nota" type="text" name="nota" maxLength={120} autoComplete="off"
                                value={nota} onChange={(e) => setNota(e.target.value)}
                                placeholder="Ej.: Antes del cierre de gestión…" className="ofbol-input w-full mt-1.5" />
                        </div>
                        <button type="submit" className="ofbol-btn-primary shrink-0">
                            <Save size={15} aria-hidden="true" /> Guardar copia ahora
                        </button>
                    </div>
                </form>

                {/* ─ Copias guardadas ─ */}
                <div className="ofbol-card overflow-hidden">
                    {loading ? (
                        <CargandoLista />
                    ) : copias.length === 0 ? (
                        <div className="p-4">
                            <EstadoVacio icono={DatabaseBackup} titulo="Todavía no hay copias guardadas"
                                nota="Guarde la primera copia con el botón de arriba. Conviene hacerlo antes de cambios importantes." />
                        </div>
                    ) : (
                        <div className="overflow-x-auto ofbol-scroll">
                            <table className="ofbol-table">
                                <caption className="sr-only">Copias de seguridad guardadas, de la más reciente a la más antigua</caption>
                                <thead>
                                    <tr>
                                        <th>Guardada el</th>
                                        <th>Por</th>
                                        <th>Nota</th>
                                        <th>Contenido</th>
                                        <th><span className="sr-only">Acciones</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {copias.map((copia) => (
                                        <tr key={copia.id}>
                                            <td className="whitespace-nowrap font-bold">{fecha(copia.creada)}</td>
                                            <td>{copia.autor || 'Sistema'}</td>
                                            <td className="min-w-48 max-w-sm">
                                                {copia.origen === 'automatica' && <span className="ofbol-badge ofbol-badge--amber mb-1">Automática</span>}
                                                <p>{copia.nota || 'Sin nota'}</p>
                                            </td>
                                            <td className="whitespace-nowrap tabular-nums">
                                                <p>{(Number(copia.registros) || 0).toLocaleString('es-BO')} registros · {tamano(copia.tamano)}</p>
                                                <p className="text-xs mt-0.5" style={{ color: 'var(--ofbol-slate)' }}>
                                                    {copia.sql_completo ? 'SQL completo: tablas y datos' : 'SQL con los datos'}
                                                </p>
                                            </td>
                                            <td>
                                                <div className="flex items-center justify-end gap-2">
                                                    <button type="button" className="ofbol-btn-fila" onClick={() => pedir('recuperar', copia)}
                                                        aria-label={`Recuperar la copia del ${fecha(copia.creada)}`}
                                                        style={{ background: 'var(--ofbol-olive-wash)', color: 'var(--ofbol-olive-dark)' }}>
                                                        <RotateCcw size={14} aria-hidden="true" /> Recuperar
                                                    </button>
                                                    <button type="button" className="ofbol-btn-fila" onClick={() => pedir('descargar', copia)}
                                                        aria-label={`Descargar en SQL la copia del ${fecha(copia.creada)}`}
                                                        style={{ background: 'var(--ofbol-surface)', color: 'var(--ofbol-ink-soft)', border: '1px solid var(--ofbol-line)' }}>
                                                        <Download size={14} aria-hidden="true" /> Descargar SQL
                                                    </button>
                                                    <button type="button" className="ofbol-btn-fila" onClick={() => pedir('eliminar', copia)}
                                                        aria-label={`Eliminar la copia del ${fecha(copia.creada)}`}
                                                        style={{ background: 'var(--ofbol-crimson-wash)', color: 'var(--ofbol-crimson)' }}>
                                                        <Trash2 size={14} aria-hidden="true" /> Eliminar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <Modal open={!!pendiente} onClose={cerrar} title={accion?.titulo || 'Confirmar'} size="md">
                {pendiente && (
                    <form onSubmit={confirmar} className="p-5 space-y-4" aria-busy={procesando}>
                        <p className="text-sm" style={{ color: 'var(--ofbol-ink)' }}>{accion.texto(pendiente.copia)}</p>
                        {pendiente.tipo === 'recuperar' && (
                            <ul className="text-sm space-y-2 list-disc pl-5" style={{ color: 'var(--ofbol-ink-soft)' }}>
                                <li>Lo registrado después de esa fecha (trámites, revisiones, usuarios) dejará de verse.</li>
                                <li>Antes de empezar se guarda sola una copia del estado actual, por si necesita volver.</li>
                                <li>Si algo falla durante el proceso, no se cambia nada.</li>
                            </ul>
                        )}
                        <div>
                            <label htmlFor="copia-password" className="ofbol-etiqueta">Por seguridad, escriba su contraseña</label>
                            <div className="relative mt-1.5">
                                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ofbol-muted)' }} aria-hidden="true" />
                                <input id="copia-password" type="password" name="password" autoComplete="current-password" required
                                    value={password} onChange={(e) => setPassword(e.target.value)} disabled={procesando}
                                    className="ofbol-input w-full pl-9" />
                            </div>
                        </div>
                        {errorAccion && <Alert type="error">{errorAccion}</Alert>}
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                            <button type="button" className="ofbol-btn-ghost" onClick={cerrar} disabled={procesando}>Cancelar</button>
                            <button type="submit" className={accion.clase} disabled={procesando || !password}>
                                {procesando ? <><Spinner size="sm" /> {accion.enCurso}</> : <><accion.Icono size={15} aria-hidden="true" /> {accion.boton}</>}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </LayoutComandoGeneral>
    );
}

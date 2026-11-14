/**
 * Traduce un evento del registro de actividad a lenguaje llano.
 *
 * La bitácora guarda códigos (`REMISION_CONFIRMADA`) y, a veces, datos técnicos
 * en JSON. Aquí se convierten en "qué pasó" para cualquier persona; el dato
 * original se conserva aparte para quien necesite auditarlo.
 */

export const CATEGORIAS = {
    acceso: { nombre: 'Accesos', tono: 'ofbol-badge--olive' },
    documento: { nombre: 'Documentos', tono: 'ofbol-badge--teal' },
    revision: { nombre: 'Revisión', tono: 'ofbol-badge--amber' },
    administracion: { nombre: 'Administración', tono: 'ofbol-badge--crimson' },
    reporte: { nombre: 'Reportes', tono: 'ofbol-badge--olive' },
    otro: { nombre: 'Otros', tono: 'ofbol-badge--olive' },
};

const MODULOS = {
    documentos: 'Documentos',
    revisiones: 'Revisión de trámites',
    usuarios: 'Usuarios y accesos',
    solicitudes_registro: 'Solicitudes de registro de oficiales',
    tipos_libres: 'Propuestas de tipos de memorándum',
    tipos_memo: 'Tipos de memorándum',
    copias_seguridad: 'Copias de seguridad',
    oficiales: 'Oficiales',
    plantillas: 'Plantillas',
    notificaciones: 'Notificaciones',
};

const delTramite = (c, conCodigo, sinCodigo) => (c.tramite ? conCodigo.replace('%s', c.tramite) : sinCodigo);

const CATALOGO = {
    LOGIN: { titulo: 'Inició sesión', categoria: 'acceso', detalle: () => 'Ingresó al sistema con su usuario y contraseña.' },
    LOGOUT: { titulo: 'Cerró sesión', categoria: 'acceso', detalle: () => 'Salió del sistema.' },
    CONSULTA_BANDEJA: {
        titulo: 'Consultó su bandeja', categoria: 'acceso',
        detalle: (c) => delTramite(c, 'Abrió su bandeja y consultó el trámite %s.', 'Abrió su bandeja de trámites.'),
    },
    SUBIDA_DOCUMENTO: {
        titulo: 'Subió un documento', categoria: 'documento',
        detalle: (c) => delTramite(c, 'Cargó al sistema el documento del trámite %s.', 'Cargó un documento al sistema.'),
    },
    REMISION_CONFIRMADA: {
        titulo: 'Envió un trámite a revisión', categoria: 'documento',
        detalle: (c) => {
            const previas = c.texto.match(/Observaciones previas:\s*(\d+)/i);
            const nota = !previas ? '' : Number(previas[1]) === 0 ? ' No tenía observaciones pendientes.'
                : ` Llevaba ${previas[1]} ${Number(previas[1]) === 1 ? 'observación previa' : 'observaciones previas'}.`;
            return delTramite(c, 'Confirmó el envío del trámite %s al Comando Departamental.', 'Confirmó el envío de un trámite al Comando Departamental.') + nota;
        },
    },
    SUBSANACION_REENVIO: {
        titulo: 'Corrigió y reenvió un trámite', categoria: 'documento',
        detalle: (c) => {
            const version = c.texto.match(/versi[oó]n\s*(\d+)/i);
            return delTramite(c, 'Corrigió las observaciones del trámite %s y lo envió de nuevo', 'Corrigió las observaciones de un trámite y lo envió de nuevo')
                + (version ? ` (versión ${version[1]} del documento).` : '.');
        },
    },
    DICTAMEN_REGISTRADO: {
        titulo: 'Registró un dictamen', categoria: 'revision',
        detalle: (c) => delTramite(c, 'Dejó registrado el resultado de la revisión del trámite %s.', 'Dejó registrado el resultado de la revisión de un trámite.'),
    },
    APROBACION_REVISION: {
        titulo: 'Aprobó un trámite', categoria: 'revision',
        detalle: (c) => delTramite(c, 'Aprobó el trámite %s en la revisión.', 'Aprobó un trámite en la revisión.'),
    },
    OBSERVACION_TRAMITE: {
        titulo: 'Observó un trámite', categoria: 'revision',
        detalle: (c) => delTramite(c, 'Devolvió el trámite %s con observaciones para que se corrija.', 'Devolvió un trámite con observaciones para que se corrija.'),
    },
    REGISTRO_FINAL: {
        titulo: 'Registró un trámite en el escalafón', categoria: 'revision',
        detalle: (c) => delTramite(c, 'Dejó el trámite %s registrado de forma definitiva.', 'Dejó un trámite registrado de forma definitiva.'),
    },
    EXPORTACION_REPORTE: {
        titulo: 'Descargó un reporte', categoria: 'reporte',
        detalle: (c) => delTramite(c, 'Descargó un reporte que incluye el trámite %s.', 'Descargó un reporte del sistema.'),
    },
    TIPO_MEMO_CREADO: { titulo: 'Creó un tipo de memorándum', categoria: 'administracion', detalle: (c) => c.texto || 'Agregó un nuevo tipo de memorándum.' },
    TIPO_MEMO_EDITADO: { titulo: 'Modificó un tipo de memorándum', categoria: 'administracion', detalle: (c) => c.texto || 'Cambió los datos de un tipo de memorándum.' },
    TIPO_MEMO_ELIMINADO: { titulo: 'Eliminó un tipo de memorándum', categoria: 'administracion', detalle: (c) => c.texto || 'Quitó un tipo de memorándum.' },
    SUGERENCIA_APROBADA: { titulo: 'Aprobó una propuesta de tipo de memorándum', categoria: 'administracion', detalle: (c) => propuesta(c, 'Aceptó') },
    SUGERENCIA_RECHAZADA: { titulo: 'Rechazó una propuesta de tipo de memorándum', categoria: 'administracion', detalle: (c) => propuesta(c, 'Rechazó') },
    COPIA_CREADA: { titulo: 'Guardó una copia de seguridad', categoria: 'administracion', detalle: (c) => c.texto || 'Guardó una copia de toda la información del sistema.' },
    COPIA_RECUPERADA: { titulo: 'Recuperó una copia de seguridad', categoria: 'administracion', detalle: (c) => c.texto || 'Reemplazó la información actual por la de una copia guardada.' },
    COPIA_DESCARGADA: { titulo: 'Descargó una copia de seguridad', categoria: 'administracion', detalle: (c) => c.texto || 'Descargó el archivo de una copia guardada.' },
    COPIA_ELIMINADA: { titulo: 'Eliminó una copia de seguridad', categoria: 'administracion', detalle: (c) => c.texto || 'Eliminó una copia guardada.' },
    ACTUALIZAR_ADJUNTOS: { titulo: 'Reemplazó los archivos de una solicitud', categoria: 'administracion', detalle: adjuntos },
};

function propuesta(c, verbo) {
    const partes = c.texto.match(/Decisi[oó]n sobre (.+?); usos registrados:\s*(\d+)/i);
    if (!partes) return `${verbo} una propuesta de nuevo tipo de memorándum.`;
    const usos = Number(partes[2]);
    return `${verbo} la propuesta de tipo «${partes[1]}», que se había usado ${usos} ${usos === 1 ? 'vez' : 'veces'}.`;
}

function adjuntos(c) {
    const datos = c.json;
    if (!datos) return 'Reemplazó los archivos adjuntos de una solicitud de registro.';
    const cambio = (clave) => datos.nuevos?.[clave] && datos.nuevos[clave] !== datos.anteriores?.[clave];
    const piezas = [cambio('memo') && 'el memorándum', cambio('foto') && 'la fotografía'].filter(Boolean);
    const que = piezas.length ? piezas.join(' y ') : 'los archivos adjuntos';
    const numero = datos.solicitud ? ` de la solicitud de registro N.º ${datos.solicitud}` : ' de una solicitud de registro';
    return `Reemplazó ${que}${numero}. La verificación debe ejecutarse otra vez antes de decidir.`;
}

function leerJson(texto) {
    if (!/^\s*[{[]/.test(texto)) return null;
    try { return JSON.parse(texto); } catch { return null; }
}

/** "EXPORTACION_REPORTE" → "Exportacion reporte": último recurso para códigos sin traducción. */
function legible(codigo) {
    const texto = String(codigo || '').replace(/[_-]+/g, ' ').trim().toLowerCase();
    return texto ? texto[0].toUpperCase() + texto.slice(1) : 'Actividad registrada';
}

export function nombreModulo(tabla) {
    return MODULOS[tabla] || legible(tabla || 'Sistema');
}

export function describirActividad(evento) {
    const texto = String(evento?.descripcion || '').trim();
    const json = leerJson(texto);
    const codigo = String(evento?.accion || '').trim();
    const tramite = json ? null : (texto.match(/\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b/)?.[0] || null);
    const demostracion = /carga de datos de demostraci[oó]n/i.test(texto);
    const contexto = { texto: demostracion ? '' : texto, json, tramite };
    const entrada = CATALOGO[codigo.toUpperCase()];
    const categoria = entrada?.categoria || 'otro';
    const detalle = entrada ? entrada.detalle(contexto)
        : json ? `Se registró un cambio en ${nombreModulo(evento?.tabla).toLowerCase()}.`
        : contexto.texto || 'Actividad registrada por el sistema.';
    return {
        titulo: entrada?.titulo || legible(codigo),
        detalle,
        categoria,
        nombreCategoria: CATEGORIAS[categoria].nombre,
        tono: CATEGORIAS[categoria].tono,
        tramite,
        modulo: nombreModulo(evento?.tabla),
        demostracion,
        codigo,
        tecnico: texto,
    };
}

const fechaValida = (valor) => { const fecha = valor ? new Date(valor) : null; return fecha && !Number.isNaN(fecha.getTime()) ? fecha : null; };
const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function claveDia(valor) {
    const fecha = fechaValida(valor);
    return fecha ? `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}` : 'sin-fecha';
}

export function etiquetaDia(valor, hoy = new Date()) {
    const fecha = fechaValida(valor);
    if (!fecha) return 'Sin fecha registrada';
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    const larga = fecha.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const texto = larga[0].toUpperCase() + larga.slice(1);
    return mismoDia(fecha, hoy) ? `Hoy · ${texto}` : mismoDia(fecha, ayer) ? `Ayer · ${texto}` : texto;
}

export function horaCorta(valor) {
    const fecha = fechaValida(valor);
    return fecha ? fecha.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '—';
}

export function fechaCompleta(valor) {
    const fecha = fechaValida(valor);
    return fecha ? fecha.toLocaleString('es-BO', { dateStyle: 'full', timeStyle: 'medium' }) : 'Sin fecha registrada';
}

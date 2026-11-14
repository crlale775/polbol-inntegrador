/**
 * API Client — Wrapper ligero para fetch que conecta React con los Controllers de Laravel
 * Uso: import api from '@/lib/api';
 *      const data = await api.get('/documentos');
 *      const res  = await api.post('/documentos', { ... });
 */

import SoundManager from './sounds';
import { createGetCache } from './getCache';

const API_BASE = '/api';

const csrfHeaders = () => {
    const token = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='));
    return token ? { 'X-XSRF-TOKEN': decodeURIComponent(token.slice('XSRF-TOKEN='.length)) } : {};
};

const headers = (extra = {}) => ({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...csrfHeaders(),
    ...extra,
});

/**
 * Evita el bucle infinito de alertas cuando la sesión PHP expira:
 * se notifica UNA sola vez y se redirige al login limpiando la sesión local.
 */
let sesionExpiradaNotificada = false;
let redireccionSesion = null;
let generacionSesion = 0;

function notificarSesionExpirada() {
    if (sesionExpiradaNotificada) return;
    sesionExpiradaNotificada = true;
    getCache.invalidate();

    try {
        sessionStorage.removeItem('ofbol_user');
        localStorage.removeItem('ofbol_user');
        localStorage.removeItem('ofbol_session_hora');
    } catch {
        /* almacenamiento no disponible */
    }

    // Los toasts/módulos escuchan este evento para avisar al usuario y redirigir.
    window.dispatchEvent(new CustomEvent('ofbol:sesion-expirada'));

    redireccionSesion = setTimeout(() => {
        if (/^\/(secretario|secretario-unidad|comando-departamental|comando-general)\//.test(window.location.pathname)) {
            window.location.replace('/login');
        }
    }, 1200);
}

// Peticiones de pantalla en curso: el sondeo del modo en vivo cede su turno
// mientras haya alguna, para no hacer fila delante de lo que el usuario espera.
let enVuelo = 0;
async function request(method, path, body = null, formData = false) {
    const cuenta = !path.startsWith('/sync/');
    if (cuenta) enVuelo++;
    try { return await solicitar(method, path, body, formData); }
    finally { if (cuenta) enVuelo--; }
}

async function solicitar(method, path, body = null, formData = false) {
    if (path === '/login' || path === '/logout') {
        generacionSesion++;
        clearTimeout(redireccionSesion);
        redireccionSesion = null;
    }
    const solicitudSesion = generacionSesion;
    if (method !== 'GET') getCache.invalidate();
    const opts = {
        method,
        headers: formData
            ? { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...csrfHeaders() }
            : headers(),
        credentials: 'same-origin',
    };

    if (body) {
        opts.body = formData ? body : JSON.stringify(body);
    }

    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, opts);
    } catch (red) {
        // Red caída / servidor apagado: mensaje claro en vez de "Error undefined".
        SoundManager.error();
        throw new Error('No hay conexión con el servidor. Verifique su red e intente de nuevo.');
    }

    if (!res.ok) {
        if ((res.status === 401 || res.status === 419) && !['/login', '/logout'].includes(path)
            && solicitudSesion === generacionSesion) {
            notificarSesionExpirada();
        }
        const json = await res.json().catch(() => null);
        const err = new Error(res.status === 419
            ? 'La sesión del formulario venció. Recargue la página e intente nuevamente.'
            : json?.message || `Error ${res.status}`);
        err.status = res.status;
        err.sesionAnterior = solicitudSesion !== generacionSesion;
        err.errors = json?.errors || null;

        // El sistema tiene un sonido por tipo de fallo: la sesión vencida y la
        // validación de un formulario avisan distinto de una caída real.
        if (res.status === 401 || res.status === 422) {
            SoundManager.advertencia();
        } else {
            SoundManager.error();
        }

        throw err;
    }

    if (solicitudSesion !== generacionSesion) {
        throw Object.assign(new Error('Se descartó una respuesta de la sesión anterior.'), { sesionAnterior: true });
    }
    if (path === '/login') {
        sesionExpiradaNotificada = false;
        clearTimeout(redireccionSesion);
        redireccionSesion = null;
    }
    if (method !== 'GET') getCache.invalidate();
    const data = await res.json().catch(() => null);
    if (solicitudSesion !== generacionSesion) throw Object.assign(new Error('Se descartó una respuesta de la sesión anterior.'), { sesionAnterior: true });
    return data;
}

const CATALOGOS = new Set([
    '/roles', '/epis', '/comando-departamental', '/grados', '/cargos',
    '/tipos-documento', '/tipos-memo', '/estados-documento', '/tipos-observacion',
    '/plantillas', '/normas', '/articulos', '/reglas',
]);
// Los catálogos básicos llegan juntos en /catalogos: una pantalla que antes
// pedía cuatro catálogos ahora hace una sola petición. Si el servidor todavía
// no conoce esa ruta (caché de rutas antigua), se vuelve a las rutas propias.
const EN_PAQUETE = new Set([
    '/epis', '/tipos-documento', '/estados-documento', '/tipos-observacion',
    '/grados', '/cargos', '/roles', '/comando-departamental',
]);
let paqueteDisponible = true;
let paqueteEnCurso = null;
// Petición silenciosa: un fallo aquí no suena ni cierra sesión; la ruta propia
// del catálogo se encarga de informar el error real si lo hay.
async function pedirPaquete() {
    const solicitudSesion = generacionSesion;
    const res = await fetch(`${API_BASE}/catalogos`, { headers: headers(), credentials: 'same-origin' });
    if (!res.ok) throw Object.assign(new Error(`Error ${res.status}`), { status: res.status });
    // Con la caché de rutas antigua, la SPA responde HTML con 200: tratarlo como ausente.
    if (!(res.headers.get('content-type') || '').includes('json')) throw Object.assign(new Error('Sin ruta de catálogos'), { status: 404 });
    const data = await res.json();
    if (solicitudSesion !== generacionSesion) throw Object.assign(new Error('Sesión anterior'), { sesionAnterior: true });
    return data;
}
async function cargarCatalogo(path, { prime }) {
    if (paqueteDisponible && EN_PAQUETE.has(path)) {
        try {
            paqueteEnCurso ??= pedirPaquete().finally(() => { paqueteEnCurso = null; });
            const paquete = await paqueteEnCurso;
            if (paquete && Object.hasOwn(paquete, path)) {
                for (const [ruta, datos] of Object.entries(paquete)) if (ruta !== path) prime(ruta, datos);
                return paquete[path];
            }
        } catch (err) {
            if (err?.sesionAnterior) throw err;
            if (err?.status === 404 || err?.status === 405) paqueteDisponible = false;
        }
    }
    return request('GET', path);
}

const getCache = createGetCache((path, ctx) => cargarCatalogo(path, ctx), {
    ttlFor: (path) => CATALOGOS.has(path) ? 60000 : path.startsWith('/notificaciones?') ? 10000 : 0,
});

// Progreso real de transferencia; recibir el 100 % no implica que el servidor
// haya terminado de guardar o revisar el documento.
function upload(path, formData, options = {}) {
    const solicitudSesion = generacionSesion;
    getCache.invalidate();
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const inicio = performance.now();
        const id = `${Date.now()}-${Math.random()}`;
        const revision = path === '/documentos/revisar-ia';
        const nombre = formData.get('archivo')?.name || formData.get('foto')?.name || 'Archivo';
        const informar = (estado, extra = {}) => window.dispatchEvent(new CustomEvent('ofbol:carga', {
            detail: { id, nombre, revision, inicio, estado, segundos: (performance.now() - inicio) / 1000, ...extra },
        }));
        const fallar = (mensaje, status = 0, errors = null) => {
            const err = Object.assign(new Error(mensaje), { status, errors });
            informar('error', { mensaje });
            reject(err);
        };
        xhr.open('POST', `${API_BASE}${path}`);
        xhr.withCredentials = true;
        // Un PDF grande o una inferencia lenta esperan su confirmación real.
        // Cero desactiva el corte de duración; los errores de red siguen activos.
        xhr.timeout = options.timeoutMs ?? (revision || path === '/upload-documento' ? 0 : 120000);
        for (const [key, value] of Object.entries({ Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...csrfHeaders() })) {
            xhr.setRequestHeader(key, value);
        }
        xhr.upload.onprogress = (event) => {
            const porcentaje = event.lengthComputable ? Math.round(event.loaded / event.total * 100) : null;
            informar(porcentaje === 100 ? 'procesando' : 'subiendo', { porcentaje });
            options.onProgress?.(porcentaje);
        };
        xhr.upload.onload = () => informar('procesando', { porcentaje: 100 });
        xhr.onerror = () => fallar('Se interrumpió la conexión. No se confirmó la carga del archivo. Verifique su red y vuelva a intentar.');
        xhr.ontimeout = () => fallar(revision
            ? 'No se confirmó el resultado de la revisión automática. Puede reintentar.'
            : 'El servidor no confirmó la carga. Verifique su conexión antes de volver a intentar.');
        xhr.onabort = () => fallar('La carga fue cancelada.');
        xhr.onload = () => {
            if (solicitudSesion !== generacionSesion) {
                informar('error', { mensaje: 'La cuenta cambió durante la carga. No se registró el documento.' });
                reject(Object.assign(new Error('La cuenta cambió durante la carga. Intente nuevamente.'), { sesionAnterior: true }));
                return;
            }
            getCache.invalidate();
            let data;
            try { data = JSON.parse(xhr.responseText); } catch { data = null; }
            if (xhr.status < 200 || xhr.status >= 300) {
                if ((xhr.status === 401 || xhr.status === 419) && solicitudSesion === generacionSesion) notificarSesionExpirada();
                return fallar(xhr.status === 413 ? 'El archivo supera el límite del servidor.'
                    : xhr.status === 419 ? 'La sesión del formulario venció. Recargue la página.'
                    : data?.message || `No se pudo cargar el archivo (error ${xhr.status}).`, xhr.status, data?.errors);
            }
            if (!data || (path === '/upload-documento' && !data.ruta)) {
                return fallar('El servidor no confirmó dónde guardó el archivo. No se registró el documento.');
            }
            if (revision && data.ia_disponible === false) {
                informar('error', { mensaje: data.mensaje || 'No se pudo completar la revisión automática.' });
            } else {
                informar('completo', { mensaje: revision
                    ? (data.descartado ? 'Revisión terminada. Requiere revisión humana.' : 'Revisión terminada. Consulte las observaciones.')
                    : 'Archivo recibido y guardado. El registro del trámite se confirma por separado.' });
            }
            resolve(data);
        };
        informar('subiendo', { porcentaje: 0 });
        xhr.send(formData);
    });
}

const api = {
    ocupado: () => enVuelo > 0,
    archivoUrl: (ruta) => `/api/archivos/documento?ruta=${encodeURIComponent(ruta || '')}`,
    solicitudArchivoUrl: (id, tipo) => `/api/solicitudes-registro/${encodeURIComponent(id)}/archivo/${encodeURIComponent(tipo)}`,
    get:    (path)             => getCache.get(path),
    // Con `body` la descarga se pide por POST (p. ej. cuando exige confirmar la contraseña).
    download: async (path, body) => {
        const solicitudSesion = generacionSesion;
        const response = await fetch(`${API_BASE}${path}`, {
            method: body ? 'POST' : 'GET',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/octet-stream, application/json', 'X-Requested-With': 'XMLHttpRequest',
                ...(body ? { 'Content-Type': 'application/json', ...csrfHeaders() } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!response.ok) {
            if ([401, 419].includes(response.status) && solicitudSesion === generacionSesion) notificarSesionExpirada();
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || 'No se pudo preparar la descarga. Intente nuevamente.');
        }
        const disposition = response.headers.get('Content-Disposition') || '';
        const filename = disposition.match(/filename="?([^";]+)"?/)?.[1];
        const blob = await response.blob();
        if (solicitudSesion !== generacionSesion) throw Object.assign(new Error('La cuenta cambió durante la descarga. Intente nuevamente.'), { sesionAnterior: true });
        return { blob, filename };
    },
    post:   (path, body)       => request('POST',   path, body),
    put:    (path, body)       => request('PUT',    path, body),
    patch:  (path, body)       => request('PATCH',  path, body),
    delete: (path, body)       => request('DELETE', path, body),
    upload,
};

export default api;

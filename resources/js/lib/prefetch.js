/**
 * prefetch.js — Precarga de módulos (code-splitting acelerado).
 *
 * Las vistas de OFBOL se cargan con `React.lazy`, así que la primera visita a
 * un módulo descarga su chunk. Precargarlo cuando el cursor pasa por el menú
 * (o en tiempo ocioso tras montar el layout) hace que abrir el módulo sea
 * INSTANTÁNEO: el chunk ya está en caché del navegador.
 *
 * Vite deduplica las importaciones dinámicas: llamar aquí al mismo import()
 * que usa `app.jsx` no genera descargas dobles.
 */

const IMPORTS = {
    // Secretaría EPI
    '/secretario/dashboard': () => import('../../views/secretario_unidad/Dashboard'),
    '/secretario/subir-documento': () => import('../../views/secretario_unidad/SubirDocumento'),
    '/secretario/mis-documentos': () => import('../../views/secretario_unidad/MisDocumentos'),
    '/secretario/correcciones': () => import('../../views/secretario_unidad/Correcciones'),
    '/secretario/oficiales': () => import('../../views/secretario_unidad/OficialesEpi'),
    '/secretario/historial': () => import('../../views/secretario_unidad/Historial'),
    '/secretario/plantillas': () => import('../../views/secretario_unidad/Plantillas'),
    '/secretario/reportes': () => import('../../views/secretario_unidad/Reportes'),
    '/secretario/notificaciones': () => import('../../views/secretario_unidad/Notificaciones'),
    '/secretario/perfil': () => import('../../views/secretario_unidad/Perfil'),

    // Comando Departamental
    '/comando-departamental/dashboard': () => import('../../views/secretario_comando_departamental/Dashboard'),
    '/comando-departamental/revision': () => import('../../views/secretario_comando_departamental/RevisarDocumentos'),
    '/comando-departamental/observaciones': () => import('../../views/secretario_comando_departamental/Observaciones'),
    '/comando-departamental/historial': () => import('../../views/secretario_comando_departamental/Historial'),
    '/comando-departamental/trazabilidad': () => import('../../views/secretario_comando_departamental/Trazabilidad'),
    '/comando-departamental/documentos-epi': () => import('../../views/secretario_comando_departamental/DocumentosPorEpi'),
    '/comando-departamental/desempenio': () => import('../../views/secretario_comando_departamental/DesempenioEpis'),
    '/comando-departamental/secretarios': () => import('../../views/secretario_comando_departamental/GestionSecretarios'),
    '/comando-departamental/reportes': () => import('../../views/secretario_comando_departamental/Reportes'),
    '/comando-departamental/notificaciones': () => import('../../views/secretario_comando_departamental/Notificaciones'),
    '/comando-departamental/perfil': () => import('../../views/secretario_comando_departamental/Perfil'),

    // Comando General
    '/comando-general/dashboard': () => import('../../views/comando_general/Dashboard'),
    '/comando-general/documentos': () => import('../../views/comando_general/DocumentosAprobados'),
    '/comando-general/registro': () => import('../../views/comando_general/RegistroDocumental'),
    '/comando-general/tipos-memo': () => import('../../views/comando_general/GestionTiposMemo'),
    '/comando-general/historial': () => import('../../views/comando_general/Historial'),
    '/comando-general/trazabilidad': () => import('../../views/comando_general/Trazabilidad'),
    '/comando-general/comparativo': () => import('../../views/comando_general/ComparativoGeneral'),
    '/comando-general/directorio': () => import('../../views/comando_general/DirectorioInstitucional'),
    '/comando-general/usuarios': () => import('../../views/comando_general/GestionUsuarios'),
    '/comando-general/registro-oficiales': () => import('../../views/comando_general/RegistroOficialesIA'),
    '/comando-general/auditoria': () => import('../../views/comando_general/Auditoria'),
    '/comando-general/copias-seguridad': () => import('../../views/comando_general/CopiasSeguridad'),
    '/comando-general/reportes': () => import('../../views/comando_general/Reportes'),
    '/comando-general/notificaciones': () => import('../../views/comando_general/Notificaciones'),
    '/comando-general/perfil': () => import('../../views/comando_general/Perfil'),
};

const yaPrecargadas = new Map();

/** Explicit intent (hover, focus, login): reuse the same import promise. */
export function prefetchRuta(path) {
    if (!IMPORTS[path]) return Promise.resolve();
    if (yaPrecargadas.has(path)) return yaPrecargadas.get(path);
    const promise = IMPORTS[path]().catch(() => { yaPrecargadas.delete(path); });
    yaPrecargadas.set(path, promise);
    return promise;
}

export function prefetchRutas(paths = []) {
    return Promise.all(paths.map(prefetchRuta));
}

/** One module per idle turn; never compete with navigation or a metered link. */
export function prefetchEnOcioso(paths = []) {
    if (typeof window === 'undefined') return () => {};
    const connection = navigator.connection;
    if (connection?.saveData || /(^2g$|slow-2g)/.test(connection?.effectiveType ?? '')) return () => {};
    const queue = [...new Set(paths)].filter((path) => path !== window.location.pathname);
    let cancelled = false;
    let timer;
    let idle;
    const schedule = () => {
        if (cancelled || !queue.length) return;
        if (document.hidden) { timer = window.setTimeout(schedule, 2000); return; }
        const load = () => {
            if (cancelled) return;
            void prefetchRuta(queue.shift()).finally(schedule);
        };
        if ('requestIdleCallback' in window) idle = window.requestIdleCallback(load, { timeout: 3000 });
        else timer = window.setTimeout(load, 1600);
    };
    // Leave the first page's API and rendering a clear start.
    timer = window.setTimeout(schedule, 1800);
    return () => { cancelled = true; window.clearTimeout(timer); if (idle !== undefined) window.cancelIdleCallback?.(idle); };
}

export default prefetchRuta;

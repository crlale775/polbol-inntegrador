import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fuenteGuia } from './preferencias';
import '../../../css/ayuda-launcher.css';

const rutaConAyuda = path => path === '/' || path === '/login' || /^\/(secretario|secretario-unidad|comando-departamental|comando-general|registro-oficial)\//.test(path);
const FRASES = ['¿Necesitas ayuda? Podemos recorrer esta sección juntos.', 'Puedo mostrarte dónde empezar. Pulsa sobre mí.', '¿Alguna duda? Te explico los controles paso a paso.', 'Estoy aquí cuando necesites una mano con esta sección.'];
export const INTERVALO_CAPI = 120000;
// Al abrirse el panel tras iniciar sesión, Capi saluda unos segundos y vuelve a su imagen quieta.
const DURACION_SALUDO = 4800;
const EVENTO_ACCESO_LISTO = 'policia:acceso-listo';

export default function AyudaSistema() {
    const { pathname } = useLocation();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pending, setPending] = useState(null);
    const [tourActive, setTourActive] = useState(false);
    const [bubble, setBubble] = useState('');
    const [saludando, setSaludando] = useState(false);
    const [sobre, setSobre] = useState(false);
    const [accesos, setAccesos] = useState(0);
    const driver = useRef(null);
    const launcher = useRef(null);
    const generation = useRef(0);
    const restoreFocus = useRef(false);
    const visited = useRef(new Set());
    const phraseIndex = useRef(0);

    useEffect(() => {
        if (!tourActive && restoreFocus.current) { restoreFocus.current = false; launcher.current?.focus({ preventScroll: true }); }
    }, [tourActive]);
    useEffect(() => {
        generation.current++;
        driver.current?.destroy(); driver.current = null;
        setPending(null); setLoading(false); setTourActive(false); setError(''); setBubble('');
        return () => { generation.current++; driver.current?.destroy(); driver.current = null; };
    }, [pathname, user?.id_usuario]);
    useEffect(() => {
        let fin;
        const alAcceder = () => { clearTimeout(fin); setAccesos(n => n + 1); setSaludando(true); fin = setTimeout(() => setSaludando(false), DURACION_SALUDO); };
        window.addEventListener(EVENTO_ACCESO_LISTO, alAcceder);
        return () => { window.removeEventListener(EVENTO_ACCESO_LISTO, alAcceder); clearTimeout(fin); };
    }, []);
    useEffect(() => {
        setBubble('');
        if (tourActive || !rutaConAyuda(pathname)) return;
        let hideTimer;
        const canSpeak = () => document.visibilityState !== 'hidden'
            && !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')
            && !document.querySelector('[aria-modal="true"], .driver-popover, .pb-access-transition');
        const speak = text => { if (!canSpeak()) return; clearTimeout(hideTimer); setBubble(text); hideTimer = setTimeout(() => setBubble(''), 10000); };
        const key = `${user?.id_usuario || 'publico'}:${pathname.startsWith('/registro-oficial/') ? 'registro-oficial' : pathname}`;
        const hello = setTimeout(() => { if (!visited.current.has(key) && canSpeak()) { visited.current.add(key); speak('Hola, soy Capi. Estoy aquí para ayudarte en esta sección.'); } }, 900);
        let interval = setInterval(() => speak(FRASES[phraseIndex.current++ % FRASES.length]), INTERVALO_CAPI);
        const visibility = () => { clearInterval(interval); setBubble(''); if (document.visibilityState === 'visible') interval = setInterval(() => speak(FRASES[phraseIndex.current++ % FRASES.length]), INTERVALO_CAPI); };
        document.addEventListener('visibilitychange', visibility);
        return () => { clearTimeout(hello); clearTimeout(hideTimer); clearInterval(interval); document.removeEventListener('visibilitychange', visibility); };
    }, [pathname, user?.id_usuario, tourActive, accesos]);
    useEffect(() => {
        if (!pending || pending.generation !== generation.current) return;
        setTourActive(true);
        try { driver.current = pending.run({ guide: pending.guide, onDestroyed: () => { driver.current = null; restoreFocus.current = pending.generation === generation.current; setTourActive(false); } }); }
        catch { setTourActive(false); setError('No se pudo iniciar la guía. Pulsa sobre Capi para intentarlo nuevamente.'); }
        setPending(null);
    }, [pending]);

    const start = async () => {
        if (loading) return;
        const current = generation.current;
        setLoading(true); setError(''); setBubble('');
        try {
            const [{ iniciarRecorrido }, catalog] = await Promise.all([import('./recorrido'), import('../../lib/guias')]);
            if (current !== generation.current) return;
            const base = catalog.guiaDeRuta(pathname);
            if (!base) throw new Error('Esta dirección todavía no tiene una guía disponible.');
            const guide = catalog.guiaDeDialogo(base, catalog.dialogoActual());
            setPending({ run: iniciarRecorrido, guide, generation: current });
        } catch (e) { if (current === generation.current) setError(e.message || 'No se pudo abrir la guía. Intente nuevamente.'); }
        finally { setLoading(false); }
    };
    if (!rutaConAyuda(pathname)) return null;
    return <>
        {!tourActive && <div className="capi-dock">
            {bubble && <div className="capi-bubble" role="status"><span>{bubble}</span><button type="button" aria-label="Ocultar mensaje de Capi" onClick={() => setBubble('')}><X size={15} /></button></div>}
            <button ref={launcher} type="button" className="policia-help-launcher capi-launcher" data-guide-route={pathname} aria-label="Ayuda de esta pantalla" aria-haspopup="dialog" title="Capi: iniciar recorrido de esta sección" disabled={loading} onClick={start}
                onMouseEnter={() => setSobre(true)} onMouseLeave={() => setSobre(false)}>
                <span className="capi-caption">{loading ? 'Abriendo…' : '¿Te ayudo?'}</span>
                <span className={`capi-circle${saludando ? ' capi-circle--saluda' : ''}`}><img className="capi-launch-image" src={saludando || sobre ? fuenteGuia('izquierda') : '/images/ayuda/capi-izquierda.webp'} alt="" width="76" height="89" decoding="async" /><span className="capi-name">Capi</span></span>
            </button>
        </div>}
        {error && <p className="policia-help-loading" role="alert">{error}</p>}
    </>;
}

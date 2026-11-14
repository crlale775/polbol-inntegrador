import React, { useEffect, useRef, useState } from 'react';

export default function RedInstitucional3D() {
    const canvas = useRef(null);
    const controller = useRef(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        let disposed = false, release;
        setReady(false);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        const lowData = navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '');
        if (lowData) return;
        import('./redInstitucional').then(({ crearRedInstitucional }) => {
            if (disposed) return;
            try { release = crearRedInstitucional(canvas.current, { reducedMotion: reduced.matches, onReady: () => setReady(true), onError: () => setReady(false) }); controller.current = release; }
            catch { setReady(false); }
        }).catch(() => { if (!disposed) setReady(false); });
        const motion = () => controller.current?.setReducedMotion(reduced.matches);
        reduced.addEventListener?.('change',motion);
        return () => { disposed = true; reduced.removeEventListener?.('change',motion); release?.(); controller.current = null; };
    }, []);
    return <div className={`pb-red-visual ${ready ? 'is-ready' : ''}`} aria-hidden="true">
        <svg className="pb-red-fallback" viewBox="0 0 1000 800" fill="none">
            <ellipse cx="600" cy="490" rx="320" ry="200" stroke="#37664d" />
            <ellipse cx="600" cy="490" rx="220" ry="140" stroke="#37664d" />
            {[0,1,2,3,4,5,6,7,8].map((i) => { const a=i*Math.PI*2/9, x=600+Math.cos(a)*280,y=490+Math.sin(a)*170;return <g key={i}><path d={`M ${x} ${y} Q ${x} 230 600 350`} stroke="#7ea77b" strokeDasharray="6 9" /><path d={`M ${x-18} ${y} v -70 l 36 -12 v 82 z`} fill="#1e4934" stroke="#b3c99b" /><path d={`M ${x-10} ${y-50} h 20 m -20 14 h 20 m -20 14 h 20`} stroke="#cdbb72" /></g>; })}
            <path d="M545 480V270l55-28 55 28v210z" fill="#214d38" stroke="#cdbb72" strokeWidth="2" /><path d="M565 290h70m-70 30h70m-70 30h70m-70 30h70m-70 30h70" stroke="#cdbb72" /><path d="M600 242v-60" stroke="#cdbb72" /><circle cx="600" cy="180" r="10" stroke="#cdbb72" />
        </svg>
        <canvas ref={canvas} className="pb-red-canvas" />
        <div className="pb-red-vignette" />
    </div>;
}

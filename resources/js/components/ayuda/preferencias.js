export function animacionPausada() {
    return document.hidden || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function fuenteGuia(direction, paused = animacionPausada()) {
    const side = direction === 'izquierda' ? 'izquierda' : 'derecha';
    return paused ? `/images/ayuda/capi-${side}.webp` : `/images/ayuda/guia-${side}.webp`;
}

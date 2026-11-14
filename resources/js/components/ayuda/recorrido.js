import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../../../css/ayuda.css';
import { objetivoDeTema, elementoVisible } from '../../lib/guias';
import { fuenteGuia } from './preferencias';

const escape = (value) => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

export function iniciarRecorrido({ guide, topicIndex, onDestroyed }) {
    const full = topicIndex === undefined;
    const themes = full ? [
        { title: 'Hola, soy Capi', description: `Te acompaño en ${guide.title}. ${guide.summary} Vamos paso a paso; puedes salir con la cruz o con Escape.` },
        ...guide.topics,
    ] : [guide.topics[topicIndex]];
    const pathname = window.location.pathname;
    const workspace = document.querySelector('#main-content');
    const scroll = workspace ? { top: workspace.scrollTop, left: workspace.scrollLeft } : null;
    const windowScroll = { top: window.scrollY, left: window.scrollX };
    let tour;
    let ended = false;
    const updateMotion = () => {
        document.querySelectorAll('.policia-guide-avatar').forEach(img => { img.src = fuenteGuia(img.dataset.direction); });
    };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('visibilitychange', updateMotion);
    media.addEventListener?.('change', updateMotion);
    const cleanup = () => {
        if (ended) return;
        ended = true;
        document.removeEventListener('visibilitychange', updateMotion);
        media.removeEventListener?.('change', updateMotion);
        if (scroll && workspace?.isConnected && window.location.pathname === pathname) {
            workspace.scrollTop = scroll.top; workspace.scrollLeft = scroll.left;
        }
        if (window.location.pathname === pathname) window.scrollTo(windowScroll.left, windowScroll.top);
        onDestroyed?.();
    };
    // También limpia si se cierra durante la transición inicial de Driver.js.
    const close = () => { try { tour?.destroy(); } finally { cleanup(); } };
    tour = driver({
        animate: !media.matches,
        duration: 180,
        smoothScroll: false,
        allowClose: true,
        overlayClickBehavior: 'none',
        overlayColor: '#102e24',
        overlayOpacity: 0.55,
        disableActiveInteraction: true,
        stagePadding: 7,
        stageRadius: 10,
        popoverOffset: 14,
        popoverClass: 'policia-guide-popover',
        showProgress: full,
        progressText: 'Paso {{current}} de {{total}}',
        nextBtnText: 'Siguiente',
        prevBtnText: 'Anterior',
        doneBtnText: full ? 'Finalizar' : 'Entendido',
        closeBtnLabel: 'Salir del recorrido',
        steps: themes.filter(Boolean).map(theme => ({
            element: theme.selector || theme.element ? () => {
                if (theme.element) return theme.element.isConnected && elementoVisible(theme.element) ? theme.element : undefined;
                return objetivoDeTema(theme);
            } : undefined,
            popover: { title: escape(theme.title), description: escape(theme.description), side: 'bottom', align: 'start' },
        })),
        onPopoverRender: (popover, { index, state }) => {
            const rect = state.activeElement?.getBoundingClientRect();
            const direction = rect && rect.width < window.innerWidth * .8 ? (rect.left < window.innerWidth / 2 ? 'izquierda' : 'derecha') : (index % 2 ? 'izquierda' : 'derecha');
            const intro = document.createElement('div');
            intro.className = 'policia-guide-intro';
            const image = document.createElement('img');
            image.className = 'policia-guide-avatar';
            image.dataset.direction = direction;
            image.src = fuenteGuia(direction);
            image.alt = ''; image.width = 66; image.height = 77;
            const badge = document.createElement('span');
            badge.className = 'policia-guide-badge';
            badge.textContent = 'CAPI · TU GUÍA INSTITUCIONAL';
            intro.append(image, badge);
            popover.wrapper.insertBefore(intro, popover.title);
        },
        onDoneClick: () => {
            if (full) try { sessionStorage.setItem(`policia:guia:${guide.id}`, 'completa'); } catch { /* opcional */ }
            close();
        },
        onDestroyStarted: close,
        onDestroyed: cleanup,
    });
    tour.drive();
    return { destroy: close };
}

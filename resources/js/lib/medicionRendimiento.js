/** Diagnóstico local optativo (?rendimiento=1). No se ejecuta en el uso normal. */
export function medirFluidez() {
    if (new URLSearchParams(window.location.search).get('rendimiento') !== '1') return;
    const root = document.getElementById('root');
    let frame, start, previous, frames = [], closed = false;
    const observer = typeof PerformanceObserver === 'function' ? new PerformanceObserver(list => {
        longTasks += list.getEntries().length;
    }) : null;
    let longTasks = 0;
    try { observer?.observe({ type:'longtask', buffered:false }); } catch { /* navegador sin soporte */ }
    const publish = () => {
        const sorted = [...frames].sort((a,b)=>a-b);
        const navigation = performance.getEntriesByType('navigation')[0];
        const scene = document.querySelector('.pb-red-canvas');
        root.dataset.rendimiento = JSON.stringify({
            ruta:window.location.pathname, muestras:frames.length,
            fps:frames.length ? +(1000*frames.length/frames.reduce((a,b)=>a+b,0)).toFixed(1) : null,
            intervaloMedianoMs:sorted[Math.floor(sorted.length*.5)]??null,
            intervaloP95Ms:sorted[Math.floor(sorted.length*.95)]??null,
            cuadrosMayores34ms:frames.filter(n=>n>34).length,
            tareasLargas:longTasks,
            primerByteMs:navigation ? +(navigation.responseStart-navigation.requestStart).toFixed(1) : null,
            escena:scene?.dataset.rendimiento ? JSON.parse(scene.dataset.rendimiento) : null,
        });
    };
    const tick = time => {
        if(closed)return;
        if(document.hidden){start=undefined;previous=undefined;frames=[];frame=requestAnimationFrame(tick);return;}
        start??=time;
        if(previous!==undefined)frames.push(time-previous);
        previous=time;
        if(time-start>=5000){publish();closed=true;observer?.disconnect();return;}
        frame=requestAnimationFrame(tick);
    };
    // Dejar terminar la compilación de sombreadores y el primer render.
    const timer=setTimeout(()=>{frame=requestAnimationFrame(tick);},2500);
    const cleanup=()=>{closed=true;clearTimeout(timer);cancelAnimationFrame(frame);observer?.disconnect();};
    window.addEventListener('pagehide',cleanup,{once:true});
    return cleanup;
}

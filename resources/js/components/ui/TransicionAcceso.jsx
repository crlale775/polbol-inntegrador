import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Escudo from './Escudo';
import '../../../css/transicion-acceso.css';

const EVENTO = 'policia:transicion-acceso';
/** Se emite cuando el velo terminó de retirarse; Capi lo usa para hacer su entrada. */
export const EVENTO_ACCESO_LISTO = 'policia:acceso-listo';
// La entrada con escudo es solo para abrir un panel (después de iniciar sesión).
// El escudo permanece un par de segundos, viaja a la barra lateral y el velo se abre.
const SELLO_PANEL = 2000;
const DURACION_SALIDA = 1600;
const LIMITE = 12000;
// Al iniciar sesión el árbol de React se vuelve a montar (SyncProvider cambia de clave),
// así que la transición en curso se guarda fuera del componente para no perderla.
let pendiente = null;
const vigente = () => (pendiente && performance.now() - pendiente.inicio < LIMITE ? pendiente : null);
const esPanel = destino => /\/dashboard\/?$/.test(destino || '');
const movimientoReducido = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function navegarConTransicion(navigate, destino, mensaje, options = {}) {
    if (esPanel(destino)) {
        pendiente = { destino, mensaje, inicio: performance.now() };
        window.dispatchEvent(new CustomEvent(EVENTO, { detail: pendiente }));
    }
    navigate(destino,options);
}

/** Hacia dónde viaja el escudo: a su lugar en la barra lateral, o al costado izquierdo si no hay barra. */
function destinoDelEscudo(sello) {
    const origen = sello?.getBoundingClientRect();
    if (!origen?.width) return { dx: 0, dy: 0, escala: 1, x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const cx = origen.left + origen.width / 2;
    const cy = origen.top + origen.height / 2;
    const marca = document.querySelector('.ofbol-shell-brand img')?.getBoundingClientRect();
    if (marca?.width && marca.right > 0 && marca.left < window.innerWidth) {
        const x = marca.left + marca.width / 2;
        const y = marca.top + marca.height / 2;
        return { dx: x - cx, dy: y - cy, escala: marca.height / origen.height, x, y };
    }
    const x = Math.max(48, window.innerWidth * 0.14);
    return { dx: x - cx, dy: 0, escala: 0.62, x, y: cy };
}

export default function TransicionAcceso() {
    const { pathname } = useLocation();
    const [transition,setTransition] = useState(vigente);
    const [paginaLista,setPaginaLista] = useState(false);
    const [salida,setSalida] = useState(null);
    const sello = useRef(null);
    useEffect(()=>{const start = e=>{setPaginaLista(false);setSalida(null);setTransition(e.detail);};window.addEventListener(EVENTO,start);return()=>window.removeEventListener(EVENTO,start);},[]);
    // Vigila el montaje de la pantalla destino; el velo no se retira antes de tiempo.
    useEffect(()=>{
        if(!transition || paginaLista)return undefined;
        let finished=false;
        const check=()=>{
            if(finished || pathname!==transition.destino)return;
            const element=document.querySelector(pathname==='/login'?'#login-usuario':pathname==='/'?'[data-pagina-lista="inicio"]':'#main-content h1, main h1');
            if(!element?.getClientRects().length)return;
            finished=true;
            setPaginaLista(true);
        };
        const observer=new MutationObserver(check);observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
        const limite=setTimeout(()=>{pendiente=null;setSalida(null);setTransition(null);},Math.max(0,LIMITE-(performance.now()-transition.inicio)));check();
        return()=>{observer.disconnect();clearTimeout(limite);};
    },[transition,pathname,paginaLista]);
    // Cumplido el tiempo del sello, el escudo se desliza al costado y el velo se abre en círculo.
    useEffect(()=>{
        if(!transition || !paginaLista || salida)return undefined;
        const timer=setTimeout(()=>{
            if(movimientoReducido()){terminar(transition.destino);return;}
            setSalida(destinoDelEscudo(sello.current));
        },Math.max(0,SELLO_PANEL-(performance.now()-transition.inicio)));
        return()=>clearTimeout(timer);
    },[transition,paginaLista,salida]);
    useEffect(()=>{
        if(!transition || !salida)return undefined;
        const timer=setTimeout(()=>terminar(transition.destino),DURACION_SALIDA);
        return()=>clearTimeout(timer);
    },[transition,salida]);
    function terminar(destino){
        pendiente=null;setSalida(null);setTransition(null);
        window.dispatchEvent(new CustomEvent(EVENTO_ACCESO_LISTO,{detail:{destino}}));
    }
    if(!transition)return null;
    const estilo=salida?{'--pb-dx':`${salida.dx}px`,'--pb-dy':`${salida.dy}px`,'--pb-escala':salida.escala,'--pb-x':`${salida.x}px`,'--pb-y':`${salida.y}px`}:undefined;
    return <div className="pb-access-transition" data-fase={salida?'salida':'sello'} style={estilo} role="status" aria-live="polite">
        <div className="pb-access-transition-centro">
            <div className="pb-access-transition-mark"><span ref={sello} className="pb-access-transition-sello"><Escudo className="pb-access-transition-escudo" /></span><span className="pb-access-transition-aro" aria-hidden="true" /></div>
            <div className="pb-access-transition-texto"><strong>Policía Boliviana</strong><p>{transition.mensaje||'Abriendo tu espacio de trabajo'}</p><div className="pb-access-transition-progress" aria-hidden="true" /></div>
        </div>
    </div>;
}

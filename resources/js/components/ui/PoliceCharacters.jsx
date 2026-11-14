import React, { memo, useEffect, useId, useRef, useState } from 'react';
import '../../../css/login-characters.css';

// Adaptación en React de los personajes de la referencia proporcionada.
// La escena recibe estado visual y longitud de usuario, nunca las credenciales.
const OFFICERS = [
    { x: 70, w: 96, h: 240, tone: '#aaa4ca', ink: '#24342d' },
    { x: 150, w: 76, h: 160, tone: '#718a91', ink: '#fff9e8' },
    { x: 215, w: 72, h: 118, tone: '#edca73', ink: '#24342d', round: true },
    { x: 0, w: 170, h: 85, tone: '#d99870', ink: '#24342d', round: true, small: true },
];

function Eye({ x, y, small = false }) {
    return <g className="pb-eye">
        <ellipse cx={x} cy={y} rx={small ? 5.5 : 8} ry={small ? 6.5 : 9} fill="#fffdf2" />
        <g className="pb-pupil"><circle cx={x + 1} cy={y + 1} r={small ? 3 : 4.2} fill="#172820" />
            <circle cx={x + 2} cy={y - .6} r="1.2" fill="#fffdf2" /></g>
    </g>;
}

function Cap({ cx, y, width }) {
    return <g>
        <path d={`M${cx-width/2} ${y+6}Q${cx-width/2} ${y-18} ${cx} ${y-18}Q${cx+width/2} ${y-18} ${cx+width/2} ${y+6}Z`} fill="#42644d" />
        <path d={`M${cx-width/2+4} ${y-2}H${cx+width/2-4}`} stroke="#223d2e" strokeWidth="8" />
        <rect x={cx-width/2-5} y={y+4} width={width+10} height="5" rx="2.5" fill="#142f24" />
        <path d={`M${cx-4} ${y-11}h8v5q-4 5-8 0z`} fill="#dec17b" />
        <path d={`M${cx-1.5} ${y-8}h3`} stroke="#795f2c" strokeWidth="1" />
    </g>;
}

function Officer({ spec: c, index, prefix, mood }) {
    const top = 310-c.h, cx = c.x+c.w/2, radius = c.round ? c.w/2 : 12;
    const ey = top+(c.small ? 30 : 44), delta = Math.min(c.w*.2,22);
    const vest = ey+(c.small ? 18 : 30), shoulder = vest+8;
    const body = `M${c.x} 310V${top+radius}A${radius} ${radius} 0 0 1 ${c.x+radius} ${top}H${c.x+c.w-radius}A${radius} ${radius} 0 0 1 ${c.x+c.w} ${top+radius}V310Z`;
    return <g className={`pb-officer pb-officer--${index}`} style={{ '--person-delay': `${index*55}ms` }}>
        <g className="pb-person-body">
            <defs><clipPath id={`${prefix}-${index}`}><path d={body} /></clipPath></defs>
            <path d={body} fill={c.tone} />
            <g clipPath={`url(#${prefix}-${index})`}>
                <rect x={c.x} y={vest} width={c.w} height={310-vest} fill="#365b43" />
                <path d={`M${cx} ${vest}V310`} stroke="#203e2d" strokeWidth="1.2" />
                <path d={`M${c.x+9} ${vest+2}H${c.x+c.w-9}`} stroke="#92a88a" strokeWidth="2" />
                <rect x={c.x+8} y={vest+(c.small?8:13)} width={c.w-16} height="5" fill="#e6ce75" />
                {!c.small && <>
                    <text x={cx} y={vest+34} textAnchor="middle" fontSize="7.5" fontWeight="750" letterSpacing=".9" fill="#fff9e8">POLICÍA</text>
                    <rect x={c.x+8} y={vest+40} width={c.w-16} height="4" fill="#e6ce75" />
                    <path d={`M${c.x+13} ${vest+55}h16v18h-16z M${c.x+c.w-29} ${vest+55}h16v18h-16z`} fill="#2b4c38" stroke="#75916e" strokeWidth=".7" />
                    <path d={`M${c.x+13} ${vest+59}h16 M${c.x+c.w-29} ${vest+59}h16`} stroke="#75916e" strokeWidth=".7" />
                </>}
                <circle cx={c.x+c.w*.27} cy={vest+5} r="3.1" fill="#dec17b" />
                {!c.small && <><rect x={c.x+c.w-18} y={vest+4} width="7" height="12" rx="1.2" fill="#1b3528" /><path d={`M${c.x+c.w-15} ${vest+4}v-6`} stroke="#1b3528" strokeWidth="1.6" /></>}
            </g>
            <g className="pb-rest-arms">
                {[c.x+5,c.x+c.w-5].map((x,i)=><g key={i}>
                    <path d={`M${x} ${shoulder}Q${x+(i?6:-6)} ${shoulder+15} ${x} ${Math.min(305,shoulder+42)}`} fill="none" stroke="#42684b" strokeWidth="9" strokeLinecap="round" />
                    <circle cx={x} cy={Math.min(310,shoulder+43)} r="6.5" fill="#f7f2df" />
                </g>)}
            </g>
            <Eye x={cx-delta} y={ey} small={c.small} /><Eye x={cx+delta} y={ey} small={c.small} />
            <g stroke={c.ink} strokeWidth="2.4" strokeLinecap="round" fill="none">
                <path className="pb-brow pb-brow--left" d={`M${cx-delta-6} ${ey-15}h12`} />
                <path className="pb-brow pb-brow--right" d={`M${cx+delta-6} ${ey-15}h12`} />
                <path d={mood==='error' ? `M${cx-6} ${ey+21}q6-5 12 0` : mood==='checking' ? `M${cx-3} ${ey+21}h6` : `M${cx-7} ${ey+20}q7 6 14 0`} />
            </g>
            <g className="pb-cover-arms">
                {[[-1,c.x+5],[1,c.x+c.w-5]].map(([side,x])=><g key={side}>
                    <path d={`M${x} ${shoulder}Q${x+side*12} ${ey+17} ${cx+side*delta} ${ey+1}`} stroke="#42684b" strokeWidth="10" strokeLinecap="round" fill="none" />
                    <ellipse cx={cx+side*delta} cy={ey+1} rx="10.5" ry="9" fill="#f7f2df" />
                    <path d={`M${cx+side*delta-4} ${ey-2}v5m4-6v6m4-5v4`} stroke="#d0cbb8" strokeWidth=".8" fill="none" />
                </g>)}
            </g>
            <Cap cx={cx} y={top} width={Math.min(c.w*.9,84)} />
        </g>
    </g>;
}

function Dog() {
    return <g className="pb-dog">
        <path className="pb-dog-tail" d="M398 296q16-6 14-26" stroke="#c58b4e" strokeWidth="7" strokeLinecap="round" fill="none" />
        <path d="M338 310V292a14 14 0 0 1 14-14h34a14 14 0 0 1 14 14V310Z" fill="#c58b4e" />
        <rect x="348" y="280" width="42" height="30" rx="2" fill="#365b43" />
        <path d="M348 289h42" stroke="#e6ce75" strokeWidth="4" />
        <text x="369" y="305" textAnchor="middle" fontSize="9" fontWeight="750" fill="#fff9e8">K9</text>
        <g className="pb-dog-head">
            <circle cx="358" cy="262" r="21" fill="#d79a58" />
            <path className="pb-dog-ear pb-dog-ear--left" d="M342 250q-14 6-10 30q10-2 16-12Z" fill="#7a4a22" />
            <path className="pb-dog-ear pb-dog-ear--right" d="M374 250q14 6 10 30q-10-2-16-12Z" fill="#7a4a22" />
            <Eye x={350} y={258} small /><Eye x={366} y={258} small />
            <ellipse cx="358" cy="272" rx="11" ry="8" fill="#ecc79a" />
            <ellipse cx="358" cy="268" rx="4" ry="3" fill="#263227" />
            <path className="pb-dog-tongue" d="M355 276v6a3 3 0 0 0 6 0v-6Z" fill="#e89d9b" />
            <g className="pb-dog-paws"><ellipse cx="349" cy="259" rx="7" ry="8" fill="#ecc79a" /><ellipse cx="367" cy="259" rx="7" ry="8" fill="#ecc79a" /></g>
            <Cap cx={358} y={240} width={31} />
        </g>
    </g>;
}

function PoliceCharacters({ focusedField='', usernameLength=0, passwordVisible=false, loading=false, error=false }) {
    const root = useRef(null);
    const prefix = `police-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`;
    const [reduced,setReduced] = useState(false);
    const [visible,setVisible] = useState(true);
    const privateMode = focusedField==='password' || passwordVisible;
    const mood = loading ? 'checking' : error ? 'error' : privateMode ? 'private' : focusedField==='usuario' ? 'attentive' : 'idle';
    const motion = !reduced && visible;

    useEffect(()=>{
        const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const updateMotion = ()=>setReduced(!!media?.matches);
        const updateVisibility = ()=>setVisible(!document.hidden);
        updateMotion(); updateVisibility();
        media?.addEventListener?.('change',updateMotion);
        document.addEventListener('visibilitychange',updateVisibility);
        return ()=>{ media?.removeEventListener?.('change',updateMotion); document.removeEventListener('visibilitychange',updateVisibility); };
    },[]);

    useEffect(()=>{
        const el = root.current;
        if (!el) return undefined;
        const aim = (x,y)=>{ el.style.setProperty('--look-x',`${x}px`); el.style.setProperty('--look-y',`${y}px`); };
        if (privateMode || !motion) { aim(0,0); return undefined; }
        if (focusedField==='usuario') { aim(1.4+Math.min(usernameLength,25)*.045,2.1); return undefined; }
        aim(0,0);
        let frame = 0;
        const move = (event)=>{
            if (event.pointerType!=='mouse' || frame) return;
            const x=event.clientX,y=event.clientY;
            frame=window.requestAnimationFrame(()=>{
                frame=0;
                const box=el.getBoundingClientRect();
                if (!box.width || !box.height) return;
                const dx=x-(box.left+box.width/2),dy=y-(box.top+box.height/2),distance=Math.hypot(dx,dy)||1;
                const amount=Math.min(3,distance/65);
                aim(dx/distance*amount,dy/distance*amount);
            });
        };
        window.addEventListener('pointermove',move,{passive:true});
        return ()=>{ window.removeEventListener('pointermove',move); if(frame) window.cancelAnimationFrame(frame); };
    },[focusedField,usernameLength,privateMode,motion]);

    const caption = loading ? 'Verificando tu acceso…' : error ? 'Revisa tus datos e inténtalo de nuevo.' : privateMode ? 'Los personajes también respetan tu privacidad.' : 'Un equipo que te acompaña en cada trámite.';
    return <figure ref={root} className="pb-characters" data-mood={mood} data-private={privateMode} data-motion={motion}>
        <svg className="pb-characters-svg" viewBox="-14 35 450 295" aria-hidden="true" focusable="false">
            <ellipse cx="204" cy="313" rx="202" ry="6" fill="#0c2c20" opacity=".42" />
            <path d="M-10 310.5H430" stroke="#9caf7b" strokeOpacity=".45" />
            {OFFICERS.map((spec,index)=><Officer key={index} spec={spec} index={index} prefix={prefix} mood={mood} />)}
            <Dog />
        </svg>
        <figcaption>{caption}</figcaption>
    </figure>;
}

export default memo(PoliceCharacters);

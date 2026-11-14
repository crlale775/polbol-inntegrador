import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Compass, ShieldCheck } from 'lucide-react';
import Modal from '../ui/Modal';
import { animacionPausada, fuenteGuia } from './preferencias';
import '../../../css/ayuda.css';

export default function PanelAyuda({ guide, onClose, onStart, loading, error }) {
    const [paused, setPaused] = useState(animacionPausada);
    useEffect(() => {
        const update = () => setPaused(animacionPausada());
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        media.addEventListener?.('change', update);
        document.addEventListener('visibilitychange', update);
        return () => { media.removeEventListener?.('change', update); document.removeEventListener('visibilitychange', update); };
    }, []);
    let completed = false;
    try { completed = sessionStorage.getItem(`policia:guia:${guide.id}`) === 'completa'; } catch { /* opcional */ }
    return <Modal open onClose={onClose} title="Ayuda de esta pantalla" size="lg">
        <div className="policia-help" data-guide-panel>
            <div className="policia-help-intro"><div><span className="policia-help-label"><ShieldCheck size={14} />Guía institucional</span><h2>{guide.title}</h2><p>{guide.summary}</p></div><img src={fuenteGuia('derecha', paused)} alt="" width="90" height="105" decoding="async" /></div>
            <button className="policia-help-start" type="button" disabled={loading} onClick={() => onStart()}><Compass size={19} />{loading ? 'Preparando recorrido…' : completed ? 'Repetir recorrido completo' : 'Iniciar recorrido guiado'}<ArrowRight size={17} /></button>
            <div className="policia-help-meta"><span>{completed ? <><CheckCircle2 size={14} />Recorrido completado</> : `${guide.topics.length + 1} pasos · Puede salir cuando lo necesite`}</span></div>
            {error && <p role="alert" className="policia-help-error">{error}</p>}
            <h3 className="policia-help-section">Ir directamente a una explicación</h3>
            <div className="policia-help-topics">{guide.topics.map((topic, index) => <button key={`${topic.title}-${index}`} type="button" disabled={loading} onClick={() => onStart(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{topic.title}</strong><ArrowRight size={16} aria-hidden="true" /></button>)}</div>
            {guide.id !== 'acceso' && guide.id !== 'registro-publico' && !guide.id.endsWith('-detalle') && <button type="button" className="policia-help-navigation" disabled={loading} onClick={() => onStart(undefined, true)}><Compass size={16} />Cómo moverme por el sistema<ArrowRight size={15} /></button>}
            {guide.tips.length > 0 && <details className="policia-help-tips"><summary>Antes de continuar</summary>{guide.tips.map(tip => <p key={tip}>{tip}</p>)}</details>}
            <p className="policia-help-footer">El recorrido explica los controles. Usted conserva la decisión sobre cada trámite.</p>
        </div>
    </Modal>;
}

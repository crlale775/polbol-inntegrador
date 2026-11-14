import React, { useState } from 'react';
import { CheckCircle2, Lightbulb, ShieldCheck } from 'lucide-react';
import Modal from './Modal';
import api from '../../lib/api';

export default function SugerenciasTipos({ items = [], onResolved }) {
    const [proposal, setProposal] = useState(null);
    const [name, setName] = useState('');
    const [accepted, setAccepted] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const decide = async decision => {
        if (!accepted || busy) return;
        setBusy(true); setError('');
        try {
            const result = await api.post('/tipos-memo/sugerencias/decision', { clave: proposal.clave, nombre: name.trim(), decision, confirmado: true });
            setProposal(null); await onResolved?.(result);
        } catch (e) { setError(e.message || 'No se pudo guardar la decisión.'); }
        finally { setBusy(false); }
    };
    return <section className="ofbol-card p-5 space-y-4" data-guide="sugerencias-tipos">
        <div className="flex items-start gap-3"><Lightbulb className="text-amber-700 shrink-0" size={22} /><div><h2 className="text-base font-extrabold text-[#192d27]">Sugerencias a partir del uso</h2><p className="text-xs text-[#53655b] mt-1 leading-relaxed">Los nombres escritos en «Otros» se proponen tras cinco remisiones registradas. Usted decide si pasan al catálogo y a los accesos directos.</p></div><span className="ml-auto shrink-0 text-xs font-bold text-amber-900 bg-amber-50 px-3 py-2 rounded-lg">{items.length} pendientes</span></div>
        {items.length ? <div className="grid sm:grid-cols-2 gap-3">{items.map(item => <article key={item.clave} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"><strong className="text-sm text-[#192d27]">{item.nombre}</strong><p className="text-xs text-[#53655b] mt-1">{item.usos} remisiones reales con este nombre.</p><button type="button" className="ofbol-btn-ghost mt-3" onClick={() => {setProposal(item);setName(item.nombre);setAccepted(false);setError('');}}>Revisar propuesta</button></article>)}</div> : <p className="flex items-center gap-2 text-xs text-[#53655b]"><CheckCircle2 size={17} className="text-[#285343]" />No hay propuestas pendientes de decisión.</p>}
        <Modal open={Boolean(proposal)} onClose={busy ? undefined : () => setProposal(null)} title="Decidir incorporación al catálogo" size="md">
            {proposal && <div className="space-y-4"><div className="flex items-center gap-2 text-sm font-bold text-[#285343]"><ShieldCheck size={19} />La decisión corresponde al Comando General</div><p className="text-sm text-[#53655b]">Se registraron <strong>{proposal.usos} usos</strong> de «{proposal.nombre}». Aprobar publicará el tipo como acceso directo; después podrá completar su formato y validaciones.</p><label className="block text-xs font-bold text-[#53655b]">Nombre institucional<input value={name} maxLength={100} disabled={busy} onChange={e => setName(e.target.value)} className="block w-full mt-2 border rounded-lg px-3 py-3 text-sm text-[#192d27]" /></label><label className="flex gap-3 p-3 border rounded-xl text-sm leading-relaxed"><input type="checkbox" checked={accepted} disabled={busy} onChange={e => setAccepted(e.target.checked)} className="mt-1 accent-[#285343]" /><span>He revisado la propuesta y confirmo que deseo guardar mi decisión.</span></label>{error && <p role="alert" className="text-sm text-red-800">{error}</p>}<div className="flex flex-wrap gap-2 justify-end"><button type="button" className="ofbol-btn-ghost" disabled={busy || !accepted} onClick={() => decide('rechazar')}>No incorporar</button><button type="button" className="ofbol-btn-primary" disabled={busy || !accepted || name.trim().length < 3} onClick={() => decide('aprobar')}>{busy ? 'Guardando…' : 'Aprobar acceso directo'}</button></div></div>}
        </Modal>
    </section>;
}

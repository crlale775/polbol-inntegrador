import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ObservacionesRemision({ documento }) {
    const revision = documento?.revision_previa;
    if (!revision?.requiere_revision_humana) return null;
    return <section className="border border-amber-300 bg-amber-50 rounded-xl p-4 text-amber-950" aria-label="Observaciones reconocidas al remitir"><h3 className="flex items-center gap-2 font-bold text-sm"><AlertTriangle size={18} />Remitido con observaciones pendientes de revisión</h3><p className="text-xs leading-relaxed mt-2">La Secretaría confirmó la remisión bajo su responsabilidad. Esta confirmación no sustituye el dictamen de revisión ni acredita la aprobación del documento.</p><ul className="text-xs mt-3 space-y-2">{revision.observaciones?.map((text,i) => <li key={i}>• {text}</li>)}</ul>{revision.confirmado_en && <p className="text-xs mt-3">Confirmación: {new Date(revision.confirmado_en).toLocaleString('es-BO')}</p>}</section>;
}

/**
 * Modal genérico reutilizable — la superficie flotante del sistema OFBOL.
 * Uso: <Modal open={open} onClose={() => setOpen(false)} title="Título">…</Modal>
 *
 * Criterio de oficio (craft R10): el borde es para la estructura y la sombra
 * para lo que flota. Un modal flota, así que lleva `.ofbol-elevated` (una sola
 * sombra, calculada) y no una tarjeta con borde + sombra apilados.
 *
 * Accesibilidad (Web Interface Guidelines):
 * - overscroll-behavior: contain (evita el encadenado de scroll)
 * - role="dialog", aria-modal, aria-labelledby
 * - Escape para cerrar y foco al primer elemento enfocable
 */
import React, { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';

const modalesAbiertos = [];

export default function Modal({ open, onClose, title, children, size = 'md' }) {
    const sizes = {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
    };

    const panelRef = useRef(null);
    const titleId = useId();
    const closeRef = useRef(onClose);
    useEffect(() => { closeRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!open) return undefined;
        const panel = panelRef.current;
        const anterior = document.activeElement;
        const overflowAnterior = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        modalesAbiertos.push(panel);
        const esActual = () => modalesAbiertos.at(-1) === panel;
        const enfocables = () => [...panel.querySelectorAll(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )].filter((el) => !el.hidden && el.getAttribute('aria-hidden') !== 'true');
        (enfocables()[0] ?? panel).focus();

        const alEnfocar = (event) => {
            // Driver.js gestiona el foco mientras explica el detalle abierto.
            if (document.body.classList.contains('driver-active')) return;
            if (esActual() && !panel.contains(event.target)) (enfocables()[0] ?? panel).focus();
        };
        const alTeclear = (event) => {
            if (document.body.classList.contains('driver-active')) return;
            if (!esActual()) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeRef.current?.();
            }
            if (event.key !== 'Tab') return;
            const elementos = enfocables();
            const primero = elementos[0];
            const ultimo = elementos.at(-1);
            if (!primero) { event.preventDefault(); panel.focus(); }
            else if (event.shiftKey && (document.activeElement === primero || document.activeElement === panel)) {
                event.preventDefault(); ultimo.focus();
            } else if (!event.shiftKey && document.activeElement === ultimo) {
                event.preventDefault(); primero.focus();
            }
        };
        document.addEventListener('keydown', alTeclear, true);
        document.addEventListener('focusin', alEnfocar);
        return () => {
            document.removeEventListener('keydown', alTeclear, true);
            document.removeEventListener('focusin', alEnfocar);
            modalesAbiertos.splice(modalesAbiertos.indexOf(panel), 1);
            document.body.style.overflow = overflowAnterior;
            if (anterior?.isConnected) anterior.focus();
        };
    }, [open]);

    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : 'Ventana de diálogo'}
        >
            {/* Velo: aísla el contexto y apaga lo de atrás sin decorar. */}
            <div
                className="absolute inset-0 ofbol-animate-fade-in"
                style={{ background: 'rgba(20, 24, 26, 0.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                ref={panelRef}
                tabIndex={-1}
                className={`ofbol-elevated ofbol-animate-scale-in relative w-full ${sizes[size] ?? sizes.md} max-h-[90vh] flex flex-col overscroll-contain`}
                style={{ borderRadius: '14px', isolation: 'isolate' }}
            >
                <div
                    className="flex items-center justify-between px-5 py-3.5 shrink-0"
                    style={{ borderBottom: '1px solid var(--ofbol-line)' }}
                >
                    <h2
                        id={titleId}
                        className="heading-balance"
                        style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '-0.01em', color: 'var(--ofbol-ink)' }}
                    >
                        {title}
                    </h2>
                    {onClose && <button
                        type="button"
                        onClick={onClose}
                        className="min-w-11 min-h-11 flex items-center justify-center rounded-lg transition-colors shrink-0"
                        style={{ color: 'var(--ofbol-slate)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ofbol-olive-wash)'; e.currentTarget.style.color = 'var(--ofbol-olive)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ofbol-slate)'; }}
                        aria-label="Cerrar"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>}
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 overscroll-contain ofbol-scroll">
                    {children}
                </div>
            </div>
        </div>, document.body
    );
}

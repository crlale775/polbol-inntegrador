/**
 * CountUp — cifra que asciende hasta su valor (componente de react-bits,
 * DavidHDev/react-bits, adaptado a JSX y a los tokens OFBOL).
 *
 * Reglas:
 *  · Solo anima valores numéricos (acepta prefijo/sufijo: "12%", "S/ 1.240").
 *  · El texto accesible es el valor final desde el primer render (aria-label),
 *    así un lector de pantalla no escucha números intermedios.
 *  · Con `prefers-reduced-motion` pinta el valor final de inmediato.
 *  · Si el valor no es numérico ("—", "Sin datos") se muestra tal cual.
 */
import React, { useEffect, useRef } from 'react';

const PATRON = /^(\D*?)(\d+(?:[.,]\d+)?)([\s\S]*)$/;

const conFrame = (cb) => (
    typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(cb)
        : setTimeout(() => cb(Date.now()), 16)
);
const sinFrame = (id) => (
    typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id)
);

export default function CountUp({ valor, duracion = 650, className = '' }) {
    const texto = valor === null || valor === undefined ? '—' : String(valor);
    const partes = texto.match(PATRON);
    const destino = partes ? Number(partes[2].replace(',', '.')) : null;
    const decimales = partes && partes[2].includes('.') ? partes[2].split('.')[1].length : 0;

    const reducir = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const cifraRef = useRef(null);
    const actual = useRef(destino === null || reducir ? destino : 0);

    useEffect(() => {
        if (destino === null || !Number.isFinite(destino)) {
            return undefined;
        }
        if (reducir) {
            actual.current = destino;
            if (cifraRef.current) cifraRef.current.textContent = destino.toFixed(decimales);
            return undefined;
        }

        const desde = actual.current ?? 0;
        const inicio = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        let frame;

        const paso = (t) => {
            const avance = Math.min(1, (t - inicio) / duracion);
            const suavizado = avance === 1 ? 1 : 1 - Math.pow(2, -10 * avance);
            const v = desde + (destino - desde) * suavizado;
            actual.current = v;
            const cifra = v.toFixed(decimales);
            if (cifraRef.current && cifraRef.current.textContent !== cifra) cifraRef.current.textContent = cifra;
            if (avance < 1) frame = conFrame(paso);
        };

        frame = conFrame(paso);
        return () => sinFrame(frame);
    }, [destino, duracion, reducir, decimales]);

    if (destino === null || !Number.isFinite(destino)) {
        return <span className={className}>{texto}</span>;
    }

    const cifra = (reducir ? destino : 0).toFixed(decimales);

    return (
        <span className={className} aria-label={texto}>
            <span aria-hidden="true">
                {partes[1]}
                <span ref={cifraRef}>{cifra}</span>
                {partes[3]}
            </span>
        </span>
    );
}

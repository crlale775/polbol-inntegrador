import React, { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Pie de una lista progresiva: carga el siguiente tramo al acercarse al final
 * y ofrece el botón por si el navegador no observa el desplazamiento.
 */
export default function MasResultados({ lista, paso = 60, como = 'div', columnas = 1 }) {
    const centinela = useRef(null);
    const { restantes, mostrarMas, mostrarTodo, visibles, total } = lista;

    useEffect(() => {
        const nodo = centinela.current;
        if (!nodo || restantes === 0 || typeof IntersectionObserver === 'undefined') return undefined;
        const observador = new IntersectionObserver((entradas) => {
            if (entradas.some((e) => e.isIntersecting)) mostrarMas();
        }, { root: nodo.closest('.ofbol-workspace'), rootMargin: '600px 0px' });
        observador.observe(nodo);
        return () => observador.disconnect();
    }, [restantes, mostrarMas]);

    if (restantes === 0) return null;

    const contenido = (
        <div ref={centinela} className="ofbol-mas-resultados">
            <span>Mostrando {visibles.length} de {total}</span>
            <button type="button" className="ofbol-btn-ghost" onClick={mostrarMas}>
                <ChevronDown size={15} aria-hidden="true" /> Mostrar {Math.min(paso, restantes)} más
            </button>
            {restantes > paso && (
                <button type="button" className="ofbol-mas-todo" onClick={mostrarTodo}>Ver todos</button>
            )}
        </div>
    );

    // Dentro de una tabla el pie ocupa una fila completa.
    if (como === 'tr') {
        return <tr><td colSpan={columnas} style={{ padding: 0 }}>{contenido}</td></tr>;
    }
    return contenido;
}

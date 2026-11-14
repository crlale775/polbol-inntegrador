import { useEffect, useMemo, useState } from 'react';

/**
 * Pinta listas largas por tramos: los primeros `paso` elementos aparecen de
 * inmediato y el resto se agrega al acercarse al final (o con el botón).
 * Ningún dato se pierde: todo sigue disponible, solo que no se dibujan
 * mil filas de golpe. Al cambiar la lista (filtros, pestañas) vuelve al inicio.
 */
export default function useListaProgresiva(lista, paso = 60) {
    const [cantidad, setCantidad] = useState(paso);

    useEffect(() => { setCantidad(paso); }, [lista, paso]);

    const total = lista?.length ?? 0;
    const visibles = useMemo(
        () => (total > cantidad ? lista.slice(0, cantidad) : lista ?? []),
        [lista, cantidad, total],
    );

    return {
        visibles,
        total,
        restantes: Math.max(0, total - visibles.length),
        mostrarMas: () => setCantidad((c) => c + paso),
        mostrarTodo: () => setCantidad(total),
    };
}

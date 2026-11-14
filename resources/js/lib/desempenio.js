/** The consolidated endpoint is an object, never the former flat list. */
export function leerDesempenio(data) {
    if (!data || !Array.isArray(data.epis) || !data.resumen_global
        || data.epis.some((epi) => !epi?.id_epi || !epi.metricas)) {
        throw new Error('No se recibió el detalle de las EPIs. Actualice para volver a consultar.');
    }
    return data;
}

export function resumenDeEpi(epi) {
    const metricas = epi.metricas ?? epi;
    return {
        total: Number(metricas.total_documentos ?? metricas.total ?? 0),
        en_revision: Number(metricas.en_revision ?? 0),
        observados: Number(metricas.observados ?? 0),
        aprobados: Number(metricas.aprobados ?? 0),
        registrados: Number(metricas.registrados ?? 0),
    };
}

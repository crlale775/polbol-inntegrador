// Contrato del servidor: los datos y el catálogo se resuelven por rol.
export const reportesPorRol = {
    unidad: [['operativo','Seguimiento de mi EPI'], ['tipos','Emisión y tipos de trámite'], ['oficiales','Documentos por oficial']],
    departamental: [['comparativo','Supervisión de EPIs'], ['calidad','Dictámenes y observaciones'], ['antiguedad','Antigüedad de pendientes']],
    nacional: [['estrategico','Balance de registro oficial'], ['tendencia','Tendencia y demanda institucional'], ['trazabilidad','Evidencia de trazabilidad']],
};
export function reporteFixture(rol) {
    const counts = { unidad: [30,22,20], departamental: [9,201,39], nacional: [86,76,32.8] }[rol];
    return {
        rol, titulo: `Reportes ${rol}`, ambito: rol === 'unidad' ? 'EPI 1 San Pedro' : 'Dependencias autorizadas',
        snapshot: '81b27429-e365-4b46-bc59-a3bdd29ddc51', generado_en: '2026-11-09T10:00:00-04:00',
        filtros: { desde: null, hasta: null, id_epi: rol === 'unidad' ? 1 : null },
        epis: [{ id_epi:1,nombre:'EPI 1 San Pedro' }, ...(rol === 'unidad' ? [] : [{ id_epi:2,nombre:'EPI 2 Sur' }])],
        reportes: reportesPorRol[rol].map(([id,title],i) => ({
            id, title, description: `Información de ${title} dentro del ámbito autorizado.`, layout: id,
            kpis: counts.map((value,n) => ({ label: ['Total','Por subsanar','Sin cierre'][n], value: value+i, unit:'' })),
            charts: [{ id:'grafica',title:`Gráfica de ${title}`,type: rol === 'unidad' ? 'donut' : rol === 'departamental' ? 'stacked' : 'column',labels:['Categoría A','Categoría B'],series:[{ name:'Documentos',values:[counts[0],counts[1]],color:'#285343' }] }],
            tables: [{ id:'detalle', title:`Detalle de ${title}`, columns:[{key:'nombre',label:'Registro',format:'text'},{key:'total',label:'Documentos',format:'number'}], rows:Array.from({length:18},(_,j)=>({nombre:`Documento ${j+1}`,total:j+1})) }],
            notes:['Los estados corresponden al corte del reporte.'],
        })),
    };
}

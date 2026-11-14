import { writeFileSync } from 'node:fs';

// HTML público solamente: no inicia sesiones de usuario ni modifica expedientes.
const report={fecha:new Date().toISOString(),nota:'Peticiones secuenciales locales; primera petición de calentamiento excluida.',servidores:{}};
for(const port of [8000,8001]){
    const muestras=[];
    for(let i=0;i<6;i++){
        const start=performance.now();
        const response=await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(10000)});
        await response.arrayBuffer();
        if(!response.ok)throw new Error(`HTTP ${response.status} en ${port}`);
        if(i)muestras.push(+(performance.now()-start).toFixed(2));
    }
    const ordenadas=[...muestras].sort((a,b)=>a-b);
    report.servidores[port]={muestrasMs:muestras,medianaMs:ordenadas[2]};
}
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

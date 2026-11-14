<?php

namespace App\Services;

use App\Models\Usuario;
use Carbon\CarbonImmutable as Fecha;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Datos de dominio separados por responsabilidad; ningún ámbito viene del cliente. */
class ReportesInstitucionales
{
    private const COLORES = ['#285343', '#ad7726', '#5e8190', '#9b5550', '#819774', '#75628a'];

    public function generar(Usuario $actor, array $filtros): array
    {
        $rol = (int) $actor->id_rol;
        abort_unless(in_array($rol, [1, 2, 3], true), 403);
        abort_if($rol === 1 && !$actor->id_epi, 403, 'La cuenta no tiene una EPI asignada.');
        $episQuery = DB::table('epis')->select('id_epi', 'nombre', 'id_comando')->orderBy('id_epi');
        if ($rol === 1) $episQuery->where('id_epi', $actor->id_epi);
        if ($rol === 2) $episQuery->where('id_comando', config('reportes.comando_departamental_id'));
        $epis = $episQuery->get();
        $seleccion = isset($filtros['id_epi']) ? (int) $filtros['id_epi'] : null;
        if ($seleccion && !$epis->contains('id_epi', $seleccion)) abort(403, 'La EPI no pertenece a su ámbito de consulta.');
        if ($rol === 1) $seleccion = (int) $actor->id_epi;
        $ids = $seleccion ? [$seleccion] : $epis->pluck('id_epi')->all();
        $base = DB::table('documentos as d')->whereIn('d.id_epi', $ids);
        if (!empty($filtros['desde'])) $base->where('d.fecha_subida', '>=', $filtros['desde'].' 00:00:00');
        if (!empty($filtros['hasta'])) $base->where('d.fecha_subida', '<', Fecha::parse($filtros['hasta'])->addDay()->toDateString());
        $historias = DB::table('historial_estados')->select('id_documento')->selectRaw('COUNT(*) as eventos')->groupBy('id_documento');
        $versiones = DB::table('versiones_documento')->select('id_documento')->selectRaw('COUNT(*) as versiones')->groupBy('id_documento');
        $docs = $base->leftJoin('estados_documento as e', 'e.id_estado', '=', 'd.estado_actual')
            ->leftJoin('tipos_documento as t', 't.id_tipo', '=', 'd.id_tipo')
            ->leftJoin('epis as ep', 'ep.id_epi', '=', 'd.id_epi')
            ->leftJoin('oficiales as o', 'o.id_oficial', '=', 'd.id_oficial')
            ->leftJoin('grados as g', 'g.id_grado', '=', 'o.id_grado')
            ->leftJoinSub($historias, 'h', 'h.id_documento', '=', 'd.id_documento')
            ->leftJoinSub($versiones, 'v', 'v.id_documento', '=', 'd.id_documento')
            ->select('d.id_documento', 'd.id_epi', 'd.id_oficial', 'd.codigo_documento', 'd.fecha_subida', 'd.hash', 'd.ruta_pdf', 'd.tipo_libre',
                'e.nombre as estado', 't.nombre as tipo', 'ep.nombre as epi', 'o.nombres', 'o.apellidos', 'g.abreviatura as grado', 'h.eventos', 'v.versiones')
            ->orderBy('d.fecha_subida')->limit(config('reportes.max_documentos') + 1)->get();
        if ($docs->count() > config('reportes.max_documentos')) throw ValidationException::withMessages(['desde' => 'El período es demasiado amplio. Acote las fechas para generar el reporte.']);
        $corte = Fecha::now();
        $docs = $docs->map(function ($d) use ($corte) {
            if ($d->tipo_libre) $d->tipo = $d->tipo_libre;
            $estado = mb_strtolower($d->estado ?? '');
            $d->grupo = str_contains($estado, 'registrad') ? 'Registrados'
                : (preg_match('/observad|devuelto|rechazad/', $estado) ? 'Por subsanar'
                : (preg_match('/aprobado|remitido al comando general/', $estado) ? 'Listos para registro' : 'En trámite'));
            $d->dias = max(0, (int) Fecha::parse($d->fecha_subida)->startOfDay()->diffInDays($corte->startOfDay()));
            $d->oficial = trim(($d->grado ?? '').' '.($d->nombres ?? '').' '.($d->apellidos ?? '')) ?: 'Sin oficial';
            $d->hash_ok = (bool) preg_match('/^[a-f0-9]{64}$/i', $d->hash ?? '');
            $d->traza_ok = $d->hash_ok && (int) $d->eventos > 0 && (int) $d->versiones > 0;
            return $d;
        });
        $estados = $this->agrupar($docs, 'estado');
        $pendientes = $docs->where('grupo', '!=', 'Registrados')->sortByDesc('dias')->values();
        $grupos = ['En trámite', 'Por subsanar', 'Listos para registro', 'Registrados'];
        $tipos = $this->agrupar($docs, 'tipo');
        $meses = $docs->groupBy(fn ($d) => substr($d->fecha_subida, 0, 7))->map(fn ($filas, $mes) => [
            'mes' => $mes, 'emitidos' => $filas->count(), 'registrados' => $filas->where('grupo', 'Registrados')->count(),
            'sin_cierre' => $filas->where('grupo', '!=', 'Registrados')->count(),
        ])->sortKeys()->values()->all();
        $porEpi = $epis->when($seleccion, fn ($c) => $c->where('id_epi', $seleccion))->map(function ($e) use ($docs, $grupos) {
            $filas = $docs->where('id_epi', $e->id_epi);
            return ['epi' => $e->nombre, 'total' => $filas->count(), 'en_tramite' => $filas->where('grupo', $grupos[0])->count(),
                'observados' => $filas->where('grupo', $grupos[1])->count(), 'por_registrar' => $filas->where('grupo', $grupos[2])->count(),
                'registrados' => $filas->where('grupo', $grupos[3])->count(), 'tasa_cierre' => $this->tasa($filas->where('grupo', $grupos[3])->count(), $filas->count())];
        })->values()->all();
        $antiguedad = collect(['0 a 2 días' => [0,2], '3 a 7 días' => [3,7], '8 a 15 días' => [8,15], 'Más de 15 días' => [16,PHP_INT_MAX]])
            ->map(fn ($r, $label) => ['nombre' => $label, 'total' => $pendientes->filter(fn ($d) => $d->dias >= $r[0] && $d->dias <= $r[1])->count()])->values()->all();
        $colsDoc = [['codigo_documento','Documento'],['epi','EPI'],['tipo','Tipo'],['estado','Estado'],['fecha','Emisión'],['dias','Días al corte','number']];
        $detallePendientes = $pendientes->map(fn ($d) => ['codigo_documento'=>$d->codigo_documento,'epi'=>$d->epi,'tipo'=>$d->tipo,'estado'=>$d->estado,'fecha'=>substr($d->fecha_subida,0,10),'dias'=>$d->dias])->all();
        $baseNota = 'El período filtra la fecha de emisión/carga. Los estados corresponden al corte indicado; no representan transiciones ocurridas durante el período.';
        $reportes = [];
        if ($rol === 1) {
            $reportes[] = $this->reporte('operativo','Seguimiento de mi EPI','Carga propia y documentos que requieren seguimiento.','operativo',[
                $this->kpi('Emitidos',$docs->count()),$this->kpi('Por subsanar',$docs->where('grupo','Por subsanar')->count()),
                $this->kpi('Sin cierre',$pendientes->count()),$this->kpi('Registrados',$docs->where('grupo','Registrados')->count()),
            ],[
                $this->grafico('estado','Estado de mis documentos','donut',$estados,'nombre',['total'=>'Documentos']),
                $this->grafico('edad','Antigüedad de mis pendientes','column',$antiguedad,'nombre',['total'=>'Pendientes']),
            ],[$this->tabla('pendientes','Documentos pendientes de mi EPI',$colsDoc,$detallePendientes)],[$baseNota,'La antigüedad cuenta días calendario desde la emisión/carga hasta hoy. No equivale a un plazo reglamentario vencido.']);
            $fin = !empty($filtros['hasta']) ? Fecha::parse($filtros['hasta']) : $corte;
            $inicio = $fin->subDays(29);
            if (!empty($filtros['desde']) && Fecha::parse($filtros['desde'])->greaterThan($inicio)) $inicio=Fecha::parse($filtros['desde']);
            $diario=[];
            for ($fecha=$inicio;$fecha->lessThanOrEqualTo($fin);$fecha=$fecha->addDay()) $diario[]=['dia'=>$fecha->toDateString(),'total'=>$docs->filter(fn($d)=>substr($d->fecha_subida,0,10)===$fecha->toDateString())->count()];
            $reportes[]=$this->reporte('tipos','Emisión y tipos de trámite','Qué emite la estación y cómo se distribuye su actividad.','emision',[
                $this->kpi('Documentos',$docs->count()),$this->kpi('Tipos utilizados',count($tipos)),$this->kpi('Días con emisión',count(array_filter($diario,fn($d)=>$d['total']>0))),
            ],[$this->grafico('tipos','Composición de mis trámites','bar',$tipos,'nombre',['total'=>'Documentos']),$this->grafico('dias','Emisión diaria · hasta 30 días','line',$diario,'dia',['total'=>'Emitidos'])],[$this->tabla('tipos','Tipos emitidos',[['nombre','Tipo'],['total','Documentos','number']],$tipos),$this->tabla('diario','Serie diaria',[['dia','Fecha'],['total','Emitidos','number']],$diario)],[$baseNota,'La serie diaria cubre como máximo los 30 días que terminan en la fecha final seleccionada. Los totales por tipo abarcan todo el período.']);
            $personas=$docs->groupBy('id_oficial')->map(fn($filas)=>['oficial'=>$filas->first()->oficial,'total'=>$filas->count(),'observados'=>$filas->where('grupo','Por subsanar')->count(),'registrados'=>$filas->where('grupo','Registrados')->count()])->sortByDesc('total')->values()->all();
            $reportes[]=$this->reporte('oficiales','Documentos por oficial','Distribución documental del personal vinculado a mi EPI.','personal',[
                $this->kpi('Oficiales con trámites',count($personas)),$this->kpi('Documentos',$docs->count()),$this->kpi('Requieren subsanación',$docs->where('grupo','Por subsanar')->count()),
            ],[$this->grafico('personal','Oficiales con mayor volumen · hasta 10','bar',array_slice($personas,0,10),'oficial',['total'=>'Documentos']),$this->grafico('subsanacion','Pendientes de subsanación · hasta 10','column',array_slice($personas,0,10),'oficial',['observados'=>'Observados/devueltos'])],[$this->tabla('personal','Detalle por oficial',[['oficial','Oficial'],['total','Documentos','number'],['observados','Por subsanar','number'],['registrados','Registrados','number']],$personas)],[$baseNota,'El volumen documental no mide el desempeño profesional del funcionario.']);
        } elseif ($rol === 2) {
            $reportes[]=$this->reporte('comparativo','Supervisión de EPIs','Distribución de carga y avance entre las estaciones del comando.','comparativo',[
                $this->kpi('EPIs del ámbito',count($porEpi)),$this->kpi('Documentos',$docs->count()),$this->kpi('En trámite',$docs->where('grupo','En trámite')->count()),$this->kpi('Por subsanar',$docs->where('grupo','Por subsanar')->count()),
            ],[$this->grafico('epis','Carga documental por EPI','stacked',$porEpi,'epi',['en_tramite'=>'En trámite','observados'=>'Por subsanar','por_registrar'=>'Listos para registro','registrados'=>'Registrados']),$this->grafico('observadas','Documentos por subsanar por EPI','bar',$porEpi,'epi',['observados'=>'Por subsanar'])],[$this->tabla('epis','Comparativo por estación',[['epi','EPI'],['total','Total','number'],['en_tramite','En trámite','number'],['observados','Por subsanar','number'],['por_registrar','Listos','number'],['registrados','Registrados','number']],$porEpi)],[$baseNota,'Se incluyen las estaciones sin emisión para hacer visible la cobertura del ámbito.']);
            $rq=DB::table('revisiones as r')->join('documentos as d','d.id_documento','=','r.id_documento')->join('usuarios as u','u.id_usuario','=','r.usuario_revisor')->leftJoin('tipos_observacion as t','t.id_tipo','=','r.id_tipo_observacion')->leftJoin('epis as ep','ep.id_epi','=','d.id_epi')->whereIn('d.id_epi',$ids)->where('u.id_rol',2);
            if(!empty($filtros['desde']))$rq->where('r.fecha','>=',$filtros['desde'].' 00:00:00');
            if(!empty($filtros['hasta']))$rq->where('r.fecha','<',Fecha::parse($filtros['hasta'])->addDay()->toDateString());
            $revisiones=$rq->select('r.estado','r.fecha','t.nombre as motivo','u.usuario','ep.nombre as epi')->limit(config('reportes.max_documentos')+1)->get();
            if($revisiones->count()>config('reportes.max_documentos'))throw ValidationException::withMessages(['desde'=>'Acote las fechas de revisión.']);
            $resultados=$this->agrupar($revisiones,'estado');
            $observadas=$revisiones->filter(fn($r)=>(bool)preg_match('/observad|devuelto|rechazad/',mb_strtolower($r->estado??'')));
            $motivos=$this->agrupar($observadas,'motivo','Sin clasificación');
            $revisores=$revisiones->groupBy('usuario')->map(fn($r,$u)=>['usuario'=>$u,'total'=>$r->count(),'observados'=>$r->filter(fn($v)=>(bool)preg_match('/observad|devuelto|rechazad/',mb_strtolower($v->estado??'')))->count()])->sortByDesc('total')->values()->all();
            $reportes[]=$this->reporte('calidad','Dictámenes y observaciones','Actividad de revisión departamental, contada por dictamen.','revision',[
                $this->kpi('Dictámenes',$revisiones->count()),$this->kpi('Con observación/devolución',$observadas->count()),$this->kpi('Revisores activos',count($revisores)),$this->kpi('Incidencia',$this->tasa($observadas->count(),$revisiones->count()),'%'),
            ],[$this->grafico('dictamenes','Resultados de revisión','donut',$resultados,'nombre',['total'=>'Dictámenes']),$this->grafico('motivos','Motivos de observación','bar',$motivos,'nombre',['total'=>'Dictámenes'])],[$this->tabla('motivos','Motivos registrados',[['nombre','Motivo'],['total','Dictámenes','number']],$motivos),$this->tabla('revisores','Carga de revisión',[['usuario','Revisor'],['total','Dictámenes','number'],['observados','Observados/devueltos','number']],$revisores)],['Aquí el período filtra la fecha del dictamen, incluso si el documento fue emitido antes. Solo se cuentan revisiones realizadas por el rol departamental.','Un documento puede tener varios dictámenes; estos totales no equivalen a documentos únicos.']);
            $cola=collect($porEpi)->map(function($e)use($pendientes){$p=$pendientes->where('epi',$e['epi']);return['epi'=>$e['epi'],'pendientes'=>$p->count(),'mas_15'=>$p->where('dias','>',15)->count()];})->all();
            $reportes[]=$this->reporte('antiguedad','Antigüedad de pendientes','Dónde se concentra el seguimiento documental del comando.','antiguedad',[
                $this->kpi('Sin cierre',$pendientes->count()),$this->kpi('Más de 15 días',$pendientes->where('dias','>',15)->count()),$this->kpi('Mayor antigüedad',$pendientes->max('dias')??0,'días'),
            ],[$this->grafico('edad','Pendientes por antigüedad','column',$antiguedad,'nombre',['total'=>'Documentos']),$this->grafico('cola','Seguimiento por EPI','bar',$cola,'epi',['mas_15'=>'Más de 15 días'])],[$this->tabla('pendientes','Documentos para seguimiento',$colsDoc,$detallePendientes)],[$baseNota,'Las bandas son días calendario al corte, no incumplimientos de un plazo legal o una evaluación disciplinaria.']);
        } else {
            $registrados=$docs->where('grupo','Registrados')->count();
            $listos=$docs->where('grupo','Listos para registro')->count();
            $avance=collect($grupos)->map(fn($g)=>['nombre'=>$g,'total'=>$docs->where('grupo',$g)->count()])->all();
            $colsEpi=[['epi','EPI'],['total','Emitidos','number'],['registrados','Registrados','number'],['por_registrar','Listos para registro','number'],['tasa_cierre','Cierre al corte','percent']];
            $reportes[]=$this->reporte('estrategico','Balance de registro oficial','Cierre institucional y documentos preparados para su registro.','institucional',[
                $this->kpi('Registrados',$registrados),$this->kpi('Listos para registro',$listos),$this->kpi('Cierre al corte',$this->tasa($registrados,$docs->count()),'%'),$this->kpi('EPIs con emisión',count(array_filter($porEpi,fn($e)=>$e['total']>0))),
            ],[$this->grafico('cierre','Balance institucional por etapa','column',$avance,'nombre',['total'=>'Documentos']),$this->grafico('registro_epi','Registro oficial por EPI','bar',$porEpi,'epi',['registrados'=>'Registrados'])],[$this->tabla('cobertura','Cobertura y cierre institucional',$colsEpi,$porEpi)],[$baseNota,'Se informa únicamente sobre las dependencias incorporadas al sistema. No se presume cobertura de todo el país.']);
            $grados=$this->agrupar($docs,'grado','Sin grado');
            $reportes[]=$this->reporte('tendencia','Tendencia y demanda institucional','Cohortes de emisión, tipologías y demanda por grado.','tendencia',[
                $this->kpi('Emitidos',$docs->count()),$this->kpi('Tipos utilizados',count($tipos)),$this->kpi('Oficiales con trámites',$docs->pluck('id_oficial')->unique()->count()),
            ],[$this->grafico('meses','Emisión y cierre de cada cohorte · hasta 24 meses','line',array_slice($meses,-24),'mes',['emitidos'=>'Emitidos','registrados'=>'Registrados al corte']),$this->grafico('tipos','Demanda por tipo de documento','column',$tipos,'nombre',['total'=>'Documentos'])],[$this->tabla('meses','Cohortes mensuales',[['mes','Mes de emisión'],['emitidos','Emitidos','number'],['registrados','Registrados al corte','number'],['sin_cierre','Sin cierre','number']],$meses),$this->tabla('grados','Demanda documental por grado',[['nombre','Grado'],['total','Documentos','number']],$grados)],[$baseNota,'La línea de registrados agrupa documentos por su mes de emisión, no por el mes en que se registraron. La demanda por grado cuenta documentos, no el total de efectivos del escalafón.']);
            $evidencias=[['nombre'=>'Con hash SHA-256 válido','total'=>$docs->where('hash_ok',true)->count()],['nombre'=>'Con historial','total'=>$docs->where('eventos','>',0)->count()],['nombre'=>'Con versión','total'=>$docs->where('versiones','>',0)->count()]];
            $traza=$docs->sortByDesc(fn($d)=>!$d->traza_ok)->map(fn($d)=>['codigo'=>$d->codigo_documento,'epi'=>$d->epi,'estado'=>$d->estado,'hash'=>$d->hash_ok?'Sí':'Pendiente','eventos'=>(int)$d->eventos,'versiones'=>(int)$d->versiones,'completo'=>$d->traza_ok?'Completo':'Revisar'])->values()->all();
            $reportes[]=$this->reporte('trazabilidad','Evidencia de trazabilidad','Cobertura de metadatos para el control institucional.','trazabilidad',[
                $this->kpi('Documentos',$docs->count()),$this->kpi('Con evidencia completa',$docs->where('traza_ok',true)->count()),$this->kpi('Para revisar',$docs->where('traza_ok',false)->count()),
            ],[$this->grafico('evidencia','Cobertura de metadatos','bar',$evidencias,'nombre',['total'=>'Documentos']),$this->grafico('completos','Expedientes con evidencia completa','donut',[['nombre'=>'Completa','total'=>$docs->where('traza_ok',true)->count()],['nombre'=>'Para revisar','total'=>$docs->where('traza_ok',false)->count()]],'nombre',['total'=>'Documentos'])],[$this->tabla('traza','Revisión de evidencia',[['codigo','Documento'],['epi','EPI'],['estado','Estado'],['hash','Hash válido'],['eventos','Eventos','number'],['versiones','Versiones','number'],['completo','Evidencia']],$traza)],[$baseNota,'Evidencia completa significa hash con formato SHA-256, al menos un evento y una versión. Este reporte no recalcula el contenido de los PDF ni certifica su autenticidad.']);
        }
        $scope=$rol===1 ? $epis->first()->nombre : ($rol===2 ? 'Comando Departamental · La Paz' : 'Comando General · dependencias del sistema');
        if($rol!==1 && $seleccion)$scope.=' · '.$epis->firstWhere('id_epi',$seleccion)->nombre;
        return ['rol'=>[1=>'unidad',2=>'departamental',3=>'nacional'][$rol], 'titulo'=>[1=>'Reportes de mi EPI',2=>'Reportes Departamentales',3=>'Reportes del Comando General'][$rol], 'ambito'=>$scope,'generado_en'=>$corte->toIso8601String(), 'filtros'=>['id_epi'=>$seleccion,'desde'=>$filtros['desde']??null,'hasta'=>$filtros['hasta']??null], 'epis'=>$epis->map(fn($e)=>['id_epi'=>$e->id_epi,'nombre'=>$e->nombre])->values()->all(),'reportes'=>$reportes];
    }

    private function tasa(int $n, int $d): ?float { return $d ? round(100*$n/$d,1) : null; }
    private function agrupar(Collection $filas, string $key, string $vacio='Sin clasificación'): array { return $filas->groupBy(fn($r)=>$r->$key?:$vacio)->map(fn($r,$n)=>['nombre'=>$n,'total'=>$r->count()])->sortByDesc('total')->values()->all(); }
    private function kpi(string $label, int|float|null $value, string $unit=''): array { return compact('label','value','unit'); }
    private function tabla(string $id,string $title,array $columns,array $rows): array { return ['id'=>$id,'title'=>$title,'columns'=>array_map(fn($c)=>['key'=>$c[0],'label'=>$c[1],'format'=>$c[2]??'text'],$columns),'rows'=>$rows]; }
    private function grafico(string $id,string $title,string $type,array $rows,string $label,array $keys): array {
        $series=[];foreach($keys as $key=>$name)$series[]=['name'=>$name,'values'=>array_map(fn($r)=>(float)($r[$key]??0),$rows),'color'=>self::COLORES[count($series)%count(self::COLORES)]];
        return compact('id','title','type','series')+['labels'=>array_column($rows,$label)];
    }
    private function reporte(string $id,string $title,string $description,string $layout,array $kpis,array $charts,array $tables,array $notes): array { return compact('id','title','description','layout','kpis','charts','tables','notes'); }
}

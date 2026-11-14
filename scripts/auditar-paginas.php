<?php
/** Verificación de GET usados por las pantallas; conexión en modo solo lectura. */
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$app->make(Illuminate\Contracts\Http\Kernel::class); // registrar grupos y alias HTTP antes de despachar rutas

use App\Models\{Documento,RegistroLink,Usuario};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Auth,DB};
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

$cases=[
    'epi'=>['sec_sanpedro',['panel/unidad','documentos','tipos-documento','estados-documento','oficiales','grados','cargos','historial-estados','plantillas','notificaciones','reportes','me']],
    'departamental'=>['revisor_lapaz',['panel/departamental','documentos','epis','tipos-documento','estados-documento','revisiones','historial-estados','desempenio-epis','usuarios?id_rol=1','notificaciones','reportes','me']],
    'general'=>['comando_general',['panel/general','documentos','epis','tipos-documento','estados-documento','tipos-memo','oficiales','grados','cargos','usuarios','roles','auditorias','registro-links','solicitudes-registro','historial-estados','notificaciones','desempenio-epis','reportes','me']],
];
$report=['fecha'=>now()->toIso8601String(),'modo'=>'Transacción PostgreSQL de solo lectura; sin login ni cambios de negocio.','resultados'=>[]];
$failed=false;
DB::beginTransaction();DB::statement('SET TRANSACTION READ ONLY');DB::enableQueryLog();
try {
    foreach($cases as $role=>[$username,$paths]){
        $actor=Usuario::where('usuario',$username)->where('estado',true)->firstOrFail();
        Auth::setUser($actor);
        $paths[]='documentos?resumen=1';
        $paths[]='historial-estados?sin_documento=1';
        $plantilla=\App\Models\Plantilla::orderBy('id_plantilla')->first();
        if($plantilla)$paths[]='plantillas/'.$plantilla->id_plantilla.'/archivo';
        $doc=Documento::when($role==='epi',fn($q)=>$q->where('id_epi',$actor->id_epi))->orderBy('id_documento')->first();
        if($doc){$paths[]='documentos/'.$doc->id_documento;$paths[]='documentos/'.$doc->id_documento.'/trazabilidad';$paths[]='revisiones?id_documento='.$doc->id_documento;$paths[]='documentos/'.$doc->id_documento.'/archivo';}
        foreach($paths as $path){
            $request=Request::create('/api/'.$path,'GET',[],[],[],['HTTP_ACCEPT'=>'application/json']);
            $request->setUserResolver(fn()=>$actor);$app->instance('request',$request);
            DB::beginTransaction();DB::flushQueryLog();$start=hrtime(true);
            try {
                $response=$app['router']->dispatch($request);
                $status=$response->getStatusCode();$bytes=$response->getContent();
                $data=is_string($bytes)?json_decode($bytes,true):null;
                $result=['rol'=>$role,'ruta'=>'/api/'.$path,'estado'=>$status,'ms'=>round((hrtime(true)-$start)/1e6,2),'consultas'=>count(DB::getQueryLog()),'bytes'=>is_string($bytes)?strlen($bytes):null,'filas'=>is_array($data)&&array_is_list($data)?count($data):null];
                if($status>=400)$failed=true;
            } catch(Throwable $e){$failed=true;$result=['rol'=>$role,'ruta'=>'/api/'.$path,'estado'=>$e instanceof HttpExceptionInterface?$e->getStatusCode():($e instanceof Illuminate\Validation\ValidationException?422:500),'ms'=>round((hrtime(true)-$start)/1e6,2),'error'=>get_class($e)];}
            finally {DB::rollBack();}
            $report['resultados'][]=$result;
        }
    }
    $report['documentos']=Documento::count();
    $report['archivos']=['existentes'=>0,'faltantes'=>[]];
    foreach(Documento::select('id_documento','ruta_pdf')->cursor() as $fileDoc){
        $path=ltrim(str_replace('\\','/',(string)$fileDoc->ruta_pdf),'/');
        if(str_starts_with($path,'storage/'))$path=substr($path,8);
        $exists=str_starts_with($path,'documentos/') && (Illuminate\Support\Facades\Storage::disk('local')->exists($path)||Illuminate\Support\Facades\Storage::disk('public')->exists($path));
        if($exists)$report['archivos']['existentes']++;
        else $report['archivos']['faltantes'][]=['id_documento'=>$fileDoc->id_documento,'ruta'=>$path];
    }
    $report['enlaces_vigentes']=RegistroLink::where('estado','activo')->where(fn($q)=>$q->whereNull('fecha_expiracion')->orWhere('fecha_expiracion','>',now()))->count();
} finally {while(DB::transactionLevel()>0)DB::rollBack();DB::disableQueryLog();}
if(isset($argv[1]))file_put_contents($argv[1],json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL);
$sorted=$report['resultados'];usort($sorted,fn($a,$b)=>$b['ms']<=>$a['ms']);
echo json_encode(['correctas'=>count(array_filter($report['resultados'],fn($r)=>$r['estado']===200)),'total'=>count($report['resultados']),'errores'=>array_values(array_filter($report['resultados'],fn($r)=>$r['estado']>=400)),'mas_lentas'=>array_slice($sorted,0,6),'documentos'=>$report['documentos']??null,'archivos'=>['existentes'=>$report['archivos']['existentes']??0,'faltantes'=>count($report['archivos']['faltantes']??[])],'enlaces_vigentes'=>$report['enlaces_vigentes']??null],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;
exit($failed?1:0);

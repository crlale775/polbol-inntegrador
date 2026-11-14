<?php
// Casos de regresión con expedientes ficticios. Rollback de negocio y limpieza de archivos propios.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$app->make(Illuminate\Contracts\Http\Kernel::class);
set_exception_handler(function (Throwable $error) { fwrite(STDERR, 'FALLO: '.$error->getMessage().PHP_EOL.$error->getTraceAsString().PHP_EOL); exit(1); });
use App\Models\{Auditoria, Documento, HistorialEstado, Oficial, Plantilla, RegistroLink, Revision, Usuario, VersionDocumento};
use App\Services\SubsanacionDocumento;
use App\Http\Controllers\{DocumentoController, RegistroLinkController, SolicitudRegistroController};
use App\Http\Middleware\PermisosInstitucionales;
use Illuminate\Support\Facades\{Cache, DB, Storage};
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Support\Str;
use Carbon\Carbon;
$results=[]; $files=[]; $keys=[];
$request=fn($actor,$data=[])=>tap(Request::create('/api/documentos','POST',$data),fn($r)=>$r->setUserResolver(fn()=>$actor));
function comprobar($name,$truth){global $results;if(!$truth)throw new RuntimeException($name);$results[]=['caso'=>$name,'correcto'=>true];echo "OK $name\n";}
function denegado($name,$status,$call){try{$call();$code=200;}catch(Illuminate\Validation\ValidationException $e){$code=422;}catch(Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $e){$code=$e->getStatusCode();}comprobar($name,$code===$status);}
$epi=Usuario::where('id_rol',1)->whereNotNull('id_epi')->firstOrFail();
$otro=Usuario::where('id_rol',1)->where('id_epi','!=',$epi->id_epi)->firstOrFail();
$dpt=Usuario::where('id_rol',2)->firstOrFail();$general=Usuario::where('id_rol',3)->firstOrFail();
$oficial=Oficial::where('id_epi',$epi->id_epi)->firstOrFail();
$original=['documentos'=>Documento::count(),'usuarios'=>Usuario::count(),'versiones'=>VersionDocumento::count(),'revisiones'=>Revision::count(),'auditoria'=>Auditoria::count(),'historial'=>HistorialEstado::count(),'plantillas'=>Plantilla::count()];
$app['request']=$request($epi);
$scope=function($actor,$method,$path,$pattern,$data=[]) use ($request){
    $r=Request::create('/api/'.$path,$method,$data);$r->setUserResolver(fn()=>$actor);
    $route=new Route([$method],'api/'.$pattern,fn()=>response()->json(['permitido'=>true]));$route->bind($r);$r->setRouteResolver(fn()=>$route);
    return (new PermisosInstitucionales)->handle($r,fn()=>response()->json(['permitido'=>true]));
};
$service=app(SubsanacionDocumento::class);$code='QA-SEG-'.strtoupper(Str::random(8));
DB::beginTransaction();
try {
    $path='documentos/'.Str::uuid().'.pdf';$files[]=$path;$bytes="%PDF-1.4\n% Fixture de regresión sin validez institucional\n%%EOF";
    Storage::disk('local')->put($path,$bytes);$hash=hash('sha256',$bytes);
    $doc=Documento::create(['id_tipo'=>1,'id_oficial'=>$oficial->id_oficial,'id_usuario'=>$epi->id_usuario,'id_epi'=>$epi->id_epi,'codigo_documento'=>$code,'referencia'=>'Fixture de seguridad sin validez institucional','ruta_pdf'=>$path,'hash'=>$hash,'fecha_subida'=>now(),'estado_actual'=>4]);
    comprobar('ID propio canónico permitido',$scope($epi,'GET','documentos/'.$doc->id_documento,'documentos/{documento}')->getStatusCode()===200);
    denegado('ID canónico de otra EPI denegado',404,fn()=>$scope($otro,'GET','documentos/'.$doc->id_documento,'documentos/{documento}'));
    foreach(['+'.$doc->id_documento,'%2B'.$doc->id_documento,'0'.$doc->id_documento,'-1','0','1e2','2147483648','abc'] as $id)
        denegado('ID no canónico '.$id,404,fn()=>$scope($epi,'GET','documentos/'.$id,'documentos/{documento}'));
    foreach([$epi,$dpt] as $u)foreach(['POST','PUT','DELETE'] as $m)
        denegado('Plantillas '.$m.' reservado a General rol'.$u->id_rol,403,fn()=>$scope($u,$m,'plantillas'.($m==='POST'?'':'/1'),'plantillas'.($m==='POST'?'':'/{plantilla}')));
    foreach(['POST','PUT','DELETE'] as $m)denegado('Versiones EPI '.$m.' no admite escritura genérica',403,fn()=>$scope($epi,$m,'versiones-documento'.($m==='POST'?'':'/1'),'versiones-documento'.($m==='POST'?'':'/{versiones_documento}')));
    denegado('EPI no sustituye ruta por PUT genérico',403,fn()=>(new DocumentoController)->update($request($epi,['ruta_pdf'=>'documentos/ajeno.pdf','estado_actual'=>2]),$doc->id_documento));
    $data=['referencia'=>'Referencia corregida de prueba','nota'=>'Se corrigió la referencia y se adjunta prueba de regresión.','ruta_pdf'=>$path];
    $prepare=function($changes=[])use($service,$request,$epi,$doc,$data,&$keys){$c=$service->preparar($request($epi,array_replace($data,$changes)),$doc->id_documento);$keys[]='subsanacion_'.$c['token_confirmacion'];return $c;};
    $c=$prepare();$send=['token_confirmacion'=>$c['token_confirmacion'],'acepto_responsabilidad'=>true];
    comprobar('Subsanación vigencia 90s',$c['vence_en']===90);
    denegado('Subsanación requiere aceptación',422,fn()=>$service->registrar($request($epi,array_replace($send,['acepto_responsabilidad'=>false])),$doc->id_documento));
    denegado('Token subsanación de otra cuenta denegado',403,fn()=>$service->registrar($request($otro,$send),$doc->id_documento));
    denegado('Token ligado al expediente',403,fn()=>$service->registrar($request($epi,$send),$doc->id_documento+1));
    Carbon::setTestNow(now()->addSeconds(90));denegado('Token vencido exactamente a90s',410,fn()=>$service->registrar($request($epi,$send),$doc->id_documento));Carbon::setTestNow();
    Storage::disk('local')->put($path,$bytes.' alterado');denegado('Bytes modificados invalidan token',422,fn()=>$service->registrar($request($epi,$send),$doc->id_documento));Storage::disk('local')->put($path,$bytes);
    $doc->update(['referencia'=>'Cambio concurrente']);denegado('Snapshot modificado invalida token',409,fn()=>$service->registrar($request($epi,$send),$doc->id_documento));$doc->update(['referencia'=>'Fixture de seguridad sin validez institucional']);
    $foreignPath='documentos/'.Str::uuid().'.pdf';$files[]=$foreignPath;Storage::disk('local')->put($foreignPath,$bytes);
    $key='archivo_emision_'.hash('sha256',$foreignPath);$keys[]=$key;Cache::put($key,['owner'=>(int)$otro->id_usuario,'epi'=>(int)$otro->id_epi,'hash'=>$hash],60);
    denegado('Archivo cargado por otra EPI rechazado',403,fn()=>$prepare(['ruta_pdf'=>$foreignPath]));
    denegado('Ruta normalizada alternativa no toma archivo ajeno',403,fn()=>$prepare(['ruta_pdf'=>'documentos/./'.basename($foreignPath)]));
    $fail=false; Revision::creating(function($r)use(&$fail,$doc){if($fail&&(int)$r->id_documento===(int)$doc->id_documento)throw new RuntimeException('Fallo deliberado de fixture');});
    $counts=[VersionDocumento::count(),HistorialEstado::count(),Revision::count(),Auditoria::count()];
    $fail=true;try{$service->registrar($request($epi,$send),$doc->id_documento);}catch(RuntimeException $e){if($e->getMessage()!=='Fallo deliberado de fixture')throw $e;}finally{$fail=false;}
    comprobar('Fallo intermedio revierte estado/versiones/historial/auditoría',$doc->fresh()->estado_actual===4 && $counts===[VersionDocumento::count(),HistorialEstado::count(),Revision::count(),Auditoria::count()]);
    $saved=$service->registrar($request($epi,$send),$doc->id_documento);
    comprobar('Subsanación completa en una transacción',$saved->estado_actual===2 && $saved->versiones()->count()===2 && $saved->revisiones()->where('estado','Reenviado')->count()===1 && $saved->historialEstados()->count()===1);
    $service->registrar($request($epi,$send),$doc->id_documento);comprobar('Reintento no duplica versiones ni revisión',$doc->versiones()->count()===2 && $doc->revisiones()->count()===1);
    $missing=$path;Storage::disk('local')->delete($missing);$doc->refresh()->update(['estado_actual'=>4]);denegado('Archivo original ausente produce mensaje422',422,fn()=>$prepare());Storage::disk('local')->put($path,$bytes);
    $doc->update(['estado_actual'=>2]);
    denegado('Departamental no registra definitivamente',403,fn()=>(new DocumentoController)->update($request($dpt,['estado_actual'=>8]),$doc->id_documento));
    $state=(new DocumentoController)->update($request($dpt,['estado_actual'=>6,'ruta_pdf'=>'documentos/ajeno.pdf','id_epi'=>$otro->id_epi]),$doc->id_documento);
    comprobar('Mando aprueba sin reemplazar archivo/identidad',$doc->fresh()->estado_actual===6 && $doc->fresh()->ruta_pdf===$path && $doc->fresh()->id_epi===$epi->id_epi);
    (new DocumentoController)->update($request($general,['estado_actual'=>8]),$doc->id_documento);comprobar('General registra desde aprobación',$doc->fresh()->estado_actual===8);
    denegado('No se reabre expediente cerrado',409,fn()=>(new DocumentoController)->update($request($dpt,['estado_actual'=>4]),$doc->id_documento));
    $link=RegistroLink::create(['token'=>Str::random(32),'id_rol'=>1,'id_epi'=>$epi->id_epi,'id_usuario_emisor'=>$general->id_usuario,'estado'=>'activo','creado_en'=>now(),'fecha_expiracion'=>now()->subSecond()]);
    comprobar('Enlace caducado GET410',(new RegistroLinkController)->publico($link->token)->getStatusCode()===410);
    comprobar('Enlace caducado POST denegado antes de archivos',(new SolicitudRegistroController)->registrarPublico($link->token,$request($epi))->getStatusCode()===404);
    $link->update(['fecha_expiracion'=>now()]);comprobar('Enlace vence en instante exacto',(new RegistroLinkController)->publico($link->token)->getStatusCode()===410);
    $link->update(['fecha_expiracion'=>null]);comprobar('Enlace activo sin caducidad conserva compatibilidad',(new RegistroLinkController)->publico($link->token)->getStatusCode()===200);
    $link->update(['estado'=>'utilizado']);comprobar('Enlace consumido no reutilizable',(new RegistroLinkController)->publico($link->token)->getStatusCode()===410);
    // Registro público real contra fixtures; la transacción exterior impide despachar IA.
    $fixtureDir=base_path('.codex-audit-tmp');
    $fixturePdf=$fixtureDir.'/seguridad-fixture.pdf';file_put_contents($fixturePdf,$bytes);
    $fixturePng=$fixtureDir.'/seguridad-fixture.png';file_put_contents($fixturePng,base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a13sAAAAASUVORK5CYII='));
    $createLink=fn()=>RegistroLink::create(['token'=>Str::random(32),'id_rol'=>1,'id_epi'=>$epi->id_epi,'id_usuario_emisor'=>$general->id_usuario,'estado'=>'activo','creado_en'=>now()]);
    $registration=function()use($fixturePdf,$fixturePng,$request,$epi){
        $r=$request($epi,['nombres'=>'Usuario Prueba','apellidos'=>'Auditoria Temporal','telefono'=>'70000000','usuario'=>'qa_'.Str::lower(Str::random(12)),'password'=>'Fixture-Prueba-2026!']);
        $r->files->set('archivo',Illuminate\Http\UploadedFile::fake()->createWithContent('fixture.pdf',file_get_contents($fixturePdf)));
        $r->files->set('foto',Illuminate\Http\UploadedFile::fake()->createWithContent('fixture.png',file_get_contents($fixturePng)));
        return $r;
    };
    $public=new SolicitudRegistroController;$invitation=$createLink();
    $accepted=$public->registrarPublico($invitation->token,$registration());$result=$accepted->getData(true);
    $files[]=$result['solicitud']['ruta_memo'];$files[]=$result['solicitud']['ruta_foto'];
    comprobar('Registro público guarda adjuntos/cuenta/solicitud y consume enlace',$accepted->getStatusCode()===201 && $invitation->fresh()->estado==='utilizado' && Usuario::findOrFail($result['solicitud']['id_usuario_creado'])->estado===false);
    comprobar('Registro público repetido no crea otra cuenta',$public->registrarPublico($invitation->token,$registration())->getStatusCode()===404);
    $broken=$createLink();$usersBefore=Usuario::count();$filesBefore=Storage::disk('local')->allFiles('solicitudes');$failure=true;
    App\Models\SolicitudRegistro::creating(function($row)use(&$failure,$broken){if($failure&&(int)$row->id_link===(int)$broken->id_link)throw new RuntimeException('Fallo registro fixture');});
    try{$public->registrarPublico($broken->token,$registration());}catch(RuntimeException $e){if($e->getMessage()!=='Fallo registro fixture')throw $e;}finally{$failure=false;}
    comprobar('Fallo de registro revierte cuenta/enlace y limpia ambos archivos',Usuario::count()===$usersBefore && $broken->fresh()->estado==='activo' && Storage::disk('local')->allFiles('solicitudes')===$filesBefore);
    $solId=$result['solicitud']['id_solicitud'];$failDecision=true;
    App\Models\SolicitudRegistro::updating(function($row)use(&$failDecision,$solId){if($failDecision&&(int)$row->id_solicitud===(int)$solId&&$row->estado_solicitud==='aprobada')throw new RuntimeException('Fallo decision fixture');});
    try{$public->aprobar($solId);}catch(RuntimeException $e){if($e->getMessage()!=='Fallo decision fixture')throw $e;}finally{$failDecision=false;}
    comprobar('Fallo de aprobación no activa cuenta parcialmente',Usuario::findOrFail($result['solicitud']['id_usuario_creado'])->estado===false);
    $public->aprobar($solId);
    denegado('Rechazo de solicitud aprobada no contradice cuenta activa',409,fn()=>$public->rechazar($solId,$request($general,['observacion'=>'Prueba terminal'])));
    denegado('Aprobación repetida de terminal controlada',409,fn()=>$public->aprobar($solId));
    @unlink($fixturePdf);@unlink($fixturePng);
    $response=(new RegistroLinkController)->store($request($general,['id_rol'=>2,'id_usuario_emisor'=>$otro->id_usuario]));
    comprobar('Enlace departamental sin EPI y emisor real',$response->getStatusCode()===201 && $response->getData(true)['id_usuario_emisor']===$general->id_usuario);
} finally {
    Carbon::setTestNow();while(DB::transactionLevel())DB::rollBack();foreach($keys as $k)Cache::forget($k);foreach($files as $f)Storage::disk('local')->delete($f);
}
$after=['documentos'=>Documento::count(),'usuarios'=>Usuario::count(),'versiones'=>VersionDocumento::count(),'revisiones'=>Revision::count(),'auditoria'=>Auditoria::count(),'historial'=>HistorialEstado::count(),'plantillas'=>Plantilla::count()];
comprobar('Registros de negocio conservados tras rollback',$after===$original);
if(isset($argv[1]))file_put_contents($argv[1],json_encode(['casos'=>$results,'antes'=>$original,'despues'=>$after],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
echo count($results)." comprobaciones correctas\n";

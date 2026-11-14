<?php
// Ejecutar con PHP desde la raíz. Requiere la migración aplicada y cuentas de dos EPIs.
// Todas las escrituras de negocio se revierten; los archivos/cachés de prueba se eliminan.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
set_exception_handler(function(Throwable $error){fwrite(STDERR,'FALLO: '.$error->getMessage().PHP_EOL);exit(1);});
use App\Models\{Documento, Oficial, TipoDocumento, Usuario};
use App\Services\{ConfirmacionEnvio, SugerenciasTipos};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Cache, DB, Storage};
use Illuminate\Support\Str;
use Carbon\Carbon;
$actor=Usuario::where('id_rol',1)->whereNotNull('id_epi')->firstOrFail();
$other=Usuario::where('id_rol',1)->where('id_epi','!=',$actor->id_epi)->firstOrFail();
$general=Usuario::where('id_rol',3)->firstOrFail();
$oficial=Oficial::where('id_epi',$actor->id_epi)->firstOrFail();
$tipo=TipoDocumento::all()->first(fn($t)=>ConfirmacionEnvio::claveTipo($t->nombre)==='otro');
$service=app(ConfirmacionEnvio::class);$suggest=app(SugerenciasTipos::class);
$suffix=strtoupper(substr(str_replace('-','',(string)Str::uuid()),0,8));
$nombre='Memo Capi Prueba '.$suffix;
$ruta='documentos/'.Str::uuid().'.pdf';
$bytes="%PDF-1.4\n% Fixture exclusivo para validar la huella del archivo.\n%%EOF";
Storage::disk('local')->put($ruta,$bytes);
$hash=hash('sha256',$bytes);$fileKey='archivo_emision_'.hash('sha256',$ruta);
Cache::put($fileKey,['owner'=>(int)$actor->id_usuario,'epi'=>(int)$actor->id_epi,'hash'=>$hash],now()->addHour());
$tokens=[];$revisions=[];$checks=0;
$req=fn($u,$data)=>tap(Request::create('/api/documentos','POST',$data,[],[],['HTTP_ACCEPT'=>'application/json']),fn($r)=>$r->setUserResolver(fn()=>$u));
function checkFeature($label,$condition){global $checks;if(!$condition)throw new RuntimeException($label);echo "OK $label".PHP_EOL;$checks++;}
function checkFailure($label,$expected,$fn){try{$fn();$status=200;}catch(Illuminate\Validation\ValidationException $e){$status=422;}catch(Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $e){$status=$e->getStatusCode();}checkFeature($label,$status===$expected);}
$original=Documento::count();
DB::beginTransaction();
try {
    $review=$service->guardarRevision($actor,$hash,['id_oficial'=>$oficial->id_oficial,'id_tipo'=>$tipo->id_tipo,'tipo_libre'=>$nombre,'archivo'=>new stdClass()],['ia_disponible'=>true,'descartado'=>true,'motivo_descarte'=>'No se reconoció el encabezado institucional.','alertas'=>['No se confirmó firma.']]);
    $revisions[]=$review['revision_id'];
    $base=['id_tipo'=>$tipo->id_tipo,'id_oficial'=>$oficial->id_oficial,'tipo_libre'=>$nombre,'codigo_documento'=>'QA-CAPI-'.$suffix,'referencia'=>'Prueba transaccional de confirmación','ruta_pdf'=>$ruta,'fecha_subida'=>now()->toDateString(),'revision_id'=>$review['revision_id']];
    $issue=function($changes=[])use($service,$req,$actor,$base,&$tokens){$response=$service->preparar($req($actor,array_replace($base,$changes)));$tokens[]=$response['token_confirmacion'];return $response;};
    $confirmation=$issue();checkFeature('Vigencia exacta de 90 segundos',$confirmation['vence_en']===90);
    checkFeature('Observaciones conservadas',count($confirmation['observaciones'])===2);
    $send=['token_confirmacion'=>$confirmation['token_confirmacion'],'acepto_responsabilidad'=>true];
    checkFailure('Casilla sin marcar',422,fn()=>$service->registrar($req($actor,array_replace($send,['acepto_responsabilidad'=>false]))));
    checkFailure('Token de otro usuario',403,fn()=>$service->registrar($req($other,$send)));
    Carbon::setTestNow(now()->addSeconds(91));
    checkFailure('Token caducado',410,fn()=>$service->registrar($req($actor,$send)));
    Carbon::setTestNow();
    $confirmation=$issue();$send['token_confirmacion']=$confirmation['token_confirmacion'];
    Storage::disk('local')->put($ruta,$bytes.'\n% modificado');
    checkFailure('PDF cambiado después de confirmar',422,fn()=>$service->registrar($req($actor,$send)));
    Storage::disk('local')->put($ruta,$bytes);
    $doc=$service->registrar($req($actor,$send));
    checkFeature('Remisión con observaciones registrada',$doc->revision_previa['requiere_revision_humana']===true && $doc->estado_actual===2 && $doc->tipo_libre===$nombre);
    checkFeature('Historial y versión atómicos',$doc->versiones()->count()===1 && $doc->historialEstados()->count()===1);
    $again=$service->registrar($req($actor,$send));
    checkFeature('Reintento no duplica el expediente',$again->id_documento===$doc->id_documento && Documento::count()===$original+1);
    for($i=1;$i<5;$i++){$c=$issue(['codigo_documento'=>'QA-CAPI-'.$suffix.'-'.$i]);$service->registrar($req($actor,['token_confirmacion'=>$c['token_confirmacion'],'acepto_responsabilidad'=>true]));}
    $clave=ConfirmacionEnvio::claveTipo($nombre);
    checkFeature('Cinco usos generan propuesta',collect($suggest->pendientes())->contains('clave',$clave));
    $decision=['clave'=>$clave,'nombre'=>$nombre,'decision'=>'aprobar','confirmado'=>true];
    checkFailure('EPI no aprueba tipos',403,fn()=>$suggest->decidir($req($actor,$decision)));
    checkFailure('Decisión sin confirmación',422,fn()=>$suggest->decidir($req($general,array_replace($decision,['confirmado'=>false]))));
    $result=$suggest->decidir($req($general,$decision));
    checkFeature('Aprobación humana publica acceso',$result['memo']->activo && $result['memo']->acceso_directo);
    checkFeature('Propuesta aprobada deja de insistir',!collect($suggest->pendientes())->contains('clave',$clave));
    $result2=$suggest->decidir($req($general,$decision));
    checkFeature('Repetir decisión no crea otro tipo',$result2['memo']->id_memo===$result['memo']->id_memo);
    $rejectedName='Propuesta rechazada '.$suffix;
    $rejectedKey=ConfirmacionEnvio::claveTipo($rejectedName);
    $addRejected=function($index)use($issue,$service,$req,$actor,$rejectedName,$suffix){$c=$issue(['codigo_documento'=>'QA-RECH-'.$suffix.'-'.$index,'tipo_libre'=>$rejectedName]);return $service->registrar($req($actor,['token_confirmacion'=>$c['token_confirmacion'],'acepto_responsabilidad'=>true]));};
    for($i=0;$i<5;$i++)$addRejected($i);
    $reject=['clave'=>$rejectedKey,'nombre'=>$rejectedName,'decision'=>'rechazar','confirmado'=>true];
    $suggest->decidir($req($general,$reject));
    checkFeature('Rechazo humano retira propuesta',!collect($suggest->pendientes())->contains('clave',$rejectedKey));
    checkFeature('Rechazar no publica tipo',!TipoDocumento::where('nombre',$rejectedName)->exists());
    checkFailure('Rechazo no se redecide sin nuevos usos',422,fn()=>$suggest->decidir($req($general,array_replace($reject,['decision'=>'aprobar']))));
    for($i=5;$i<9;$i++)$addRejected($i);
    checkFeature('Cuatro usos adicionales no insisten',!collect($suggest->pendientes())->contains('clave',$rejectedKey));
    $addRejected(9);
    checkFeature('Cinco usos adicionales permiten revisar',collect($suggest->pendientes())->contains('clave',$rejectedKey));
    checkFeature('Normalización conserva equivalencia',ConfirmacionEnvio::claveTipo('  Mémó   PLUS ')==='memo plus');
} finally {
    Carbon::setTestNow(); DB::rollBack();
    foreach($tokens as $id)Cache::forget('confirmacion_emision_'.$id);
    foreach($revisions as $id)Cache::forget('revision_emision_'.$id);
    Cache::forget($fileKey);Storage::disk('local')->delete($ruta);
}
checkFeature('Datos de negocio conservados tras rollback',Documento::count()===$original);
echo "$checks comprobaciones correctas".PHP_EOL;

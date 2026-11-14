<?php
// Regresión transaccional: no activa cuentas reales ni procesa la cola global.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$app->make(Illuminate\Contracts\Http\Kernel::class);
set_exception_handler(function(\Throwable $error){fwrite(STDERR,'FALLO: '.$error->getMessage().PHP_EOL);exit(1);});
use App\Models\{Auditoria,Epi,RegistroLink,SolicitudRegistro,Usuario};
use App\Services\{ArchivosRegistro,ColaVerificacionIA,PdfPaginas,VerificacionRegistro,VerificadorIA};
use Illuminate\Support\Facades\{Auth,Cache,DB,Storage};
use Illuminate\Http\{Request,UploadedFile};
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

// El sandbox Windows puede informar is_readable=false aunque fopen funcione.
// Solo el doble de prueba usa finfo directamente; producción conserva Symfony.
class CargaRegistroPrueba extends UploadedFile {
    public function getMimeType():?string {return (new finfo(FILEINFO_MIME_TYPE))->file($this->getPathname())?:null;}
}

class LectorRegistroDePrueba extends VerificadorIA {
    public array $memo=['firma'=>true,'sello'=>true,'coincide'=>true,'nombres'=>['Persona Prueba'],'mensaje'=>'Lectura de prueba'];
    public ?bool $rostro=true;
    public int $llamadas=0;
    public mixed $durante=null;
    public function analizar(string $rutaAbsoluta,array $esperado=[]):array {$this->llamadas++;if($this->durante)($this->durante)();return $this->memo;}
    public function analizarRostro(string $rutaAbsoluta,bool $forzar=false):array {return ['es_rostro'=>$this->rostro,'mensaje'=>'Foto de prueba'];}
}
$casos=[];$creados=[];
function comprobarRegistro(string $nombre,bool $ok):void {global $casos;$casos[]=['caso'=>$nombre,'correcto'=>$ok];if(!$ok)throw new RuntimeException($nombre);echo 'OK '.$nombre.PHP_EOL;}
function estadoErrorRegistro(Closure $accion):int {try{$accion();return 200;}catch(ValidationException){return 422;}catch(HttpExceptionInterface $error){return $error->getStatusCode();}}
$antes=['solicitudes'=>SolicitudRegistro::count(),'usuarios'=>Usuario::count(),'enlaces'=>RegistroLink::count(),'auditoria'=>Auditoria::count()];
$general=Usuario::where('usuario','comando_general')->firstOrFail();$epi=Usuario::where('id_rol',1)->firstOrFail();Auth::setUser($general);
$nombre='qa_'.bin2hex(random_bytes(12));$pdf='solicitudes/'.$nombre.'.pdf';$foto='solicitudes/fotos/'.$nombre.'.png';
Storage::disk('local')->put($pdf,"%PDF-1.4\n% prueba transaccional\n%%EOF");
Storage::disk('local')->put($foto,base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ZkAAAAASUVORK5CYII='));$creados=[$pdf,$foto];
DB::beginTransaction();
try {
    $usuario=Usuario::create(['id_rol'=>1,'id_epi'=>$epi->id_epi,'usuario'=>$nombre,'password'=>Illuminate\Support\Facades\Hash::make(bin2hex(random_bytes(20))),'correo'=>$nombre.'@example.test','estado'=>false]);
    $link=RegistroLink::create(['token'=>bin2hex(random_bytes(16)),'id_rol'=>1,'id_epi'=>$epi->id_epi,'id_usuario_emisor'=>$general->id_usuario,'estado'=>'utilizado','creado_en'=>now()]);
    $s=SolicitudRegistro::create(['id_link'=>$link->id_link,'token'=>$link->token,'id_rol'=>1,'id_epi'=>$epi->id_epi,'nombres'=>'Persona','apellidos'=>'Prueba','telefono'=>'71234567','usuario'=>$nombre,'ruta_memo'=>$pdf,'ruta_foto'=>$foto,'hash_memo'=>hash_file('sha256',Storage::disk('local')->path($pdf)),'estado_solicitud'=>'recibida','ia_estado'=>'pendiente','id_usuario_creado'=>$usuario->id_usuario,'creado_en'=>now()]);
    $reset=function()use($s,$pdf,$foto){$s->update(['estado_solicitud'=>'recibida','ia_estado'=>'pendiente','ruta_memo'=>$pdf,'ruta_foto'=>$foto,'hash_memo'=>hash_file('sha256',Storage::disk('local')->path($pdf))]);};
    $lector=new LectorRegistroDePrueba(new PdfPaginas());$archivos=new ArchivosRegistro();$servicio=new VerificacionRegistro($lector,$archivos);
    comprobarRegistro('Detecta ambos adjuntos',$archivos->estado($s)===['memo'=>true,'foto'=>true]);
    comprobarRegistro('Rechaza alias de ruta',$archivos->ruta('solicitudes/../fotos/prueba.png','foto')===null);
    $servicio->verificar($s);comprobarRegistro('Resultado conforme marca verificada',$s->fresh()->estado_solicitud==='verificada');
    comprobarRegistro('IA no activa la cuenta',$usuario->fresh()->estado===false);
    $reset();$lector->rostro=null;$servicio->verificar($s);comprobarRegistro('Rostro no concluyente requiere revisión',$s->fresh()->ia_advertencia && $s->fresh()->estado_solicitud==='recibida');
    $reset();$lector->rostro=true;$lector->memo['coincide']=null;$servicio->verificar($s);comprobarRegistro('Identidad no leída no aprueba',$s->fresh()->ia_advertencia && $s->fresh()->estado_solicitud==='recibida');
    $reset();$lector->memo['coincide']=true;$lector->memo['no_concluyente']=true;$servicio->verificar($s);comprobarRegistro('Lectura parcial no aprueba',$s->fresh()->ia_advertencia);unset($lector->memo['no_concluyente']);
    $reset();$s->update(['ruta_foto'=>'solicitudes/fotos/ausente.png']);$servicio->verificar($s);comprobarRegistro('Foto ausente conserva resultado desconocido',$s->fresh()->ia_rostro===null && $s->fresh()->ia_advertencia);
    $reset();$s->update(['ruta_memo'=>'solicitudes/ausente.pdf']);$lector->llamadas=0;
    comprobarRegistro('Memo ausente responde 422',estadoErrorRegistro(fn()=>$servicio->verificar($s))===422);
    comprobarRegistro('Memo ausente no consulta al modelo',$lector->llamadas===0);
    comprobarRegistro('Error no afirma firma ni identidad',$s->fresh()->ia_firma===null && $s->fresh()->ia_coincide===null);
    $reset();$s->update(['hash_memo'=>str_repeat('0',64)]);comprobarRegistro('Huella distinta se rechaza',estadoErrorRegistro(fn()=>$servicio->verificar($s))===422);
    $reset();$lock=Cache::lock(VerificacionRegistro::claveBloqueo($s->id_solicitud),30);$lock->get();
    try {comprobarRegistro('No duplica una verificación activa',estadoErrorRegistro(fn()=>$servicio->verificar($s))===409);}finally{$lock->release();}
    $reset();$lector->durante=fn()=>SolicitudRegistro::whereKey($s->id_solicitud)->update(['estado_solicitud'=>'aprobada']);$servicio->verificar($s);$lector->durante=null;
    comprobarRegistro('No reabre aprobación humana concurrente',$s->fresh()->estado_solicitud==='aprobada');
    $servicio->verificar($s);comprobarRegistro('Reverificar conserva resolución y cuenta',$s->fresh()->estado_solicitud==='aprobada' && !$usuario->fresh()->estado);
    $reset();(new ColaVerificacionIA($lector))->procesar($s);comprobarRegistro('La cola utiliza las mismas reglas',$s->fresh()->estado_solicitud==='verificada');
    $reset();$lector->rostro=null;(new ColaVerificacionIA($lector))->procesar($s);comprobarRegistro('La cola tampoco aprueba rostro desconocido',$s->fresh()->estado_solicitud==='recibida' && $s->fresh()->ia_advertencia);
    $controlador=app(App\Http\Controllers\SolicitudRegistroController::class);
    $nuevo=tempnam(sys_get_temp_dir(),'rg_');file_put_contents($nuevo,"%PDF-1.4\n% nuevo original de prueba\n%%EOF");
    $request=Request::create('/api/solicitudes-registro/'.$s->id_solicitud.'/adjuntos','POST',[],[],['archivo'=>new CargaRegistroPrueba($nuevo,'memo.pdf','application/pdf',null,true)]);$request->setUserResolver(fn()=>$general);
    $hashAnterior=hash_file('sha256',Storage::disk('local')->path($pdf));
    $response=$controlador->actualizarAdjuntos($s->id_solicitud,$request);$datos=$response->getData(true);$creados[]=$datos['solicitud']['ruta_memo'];
    comprobarRegistro('Recuperación guarda adjunto nuevo',$response->getStatusCode()===200 && $datos['solicitud']['adjuntos']['memo']);
    comprobarRegistro('Conserva el original previo',is_file(Storage::disk('local')->path($pdf)) && hash_equals($hashAnterior,hash_file('sha256',Storage::disk('local')->path($pdf))));
    comprobarRegistro('Reinicia evidencia sin activar cuenta',$s->fresh()->ia_firma===null && $s->fresh()->ia_estado==='pendiente' && !$usuario->fresh()->estado);
    comprobarRegistro('Deja auditoría de la sustitución',Auditoria::where('tabla','solicitudes_registro')->where('accion','actualizar_adjuntos')->where('descripcion','like','%'.$s->id_solicitud.'%')->exists());
    $request->setUserResolver(fn()=>$epi);comprobarRegistro('EPI no sustituye adjuntos del registro',estadoErrorRegistro(fn()=>$controlador->actualizarAdjuntos($s->id_solicitud,$request))===403);
    $request->setUserResolver(fn()=>$general);$s->update(['estado_solicitud'=>'aprobada']);comprobarRegistro('No cambia adjuntos de una resolución cerrada',estadoErrorRegistro(fn()=>$controlador->actualizarAdjuntos($s->id_solicitud,$request))===409);
    // Rollback y limpieza de la copia de subida, incluso si la auditoría falla.
    $reset();$contador=count(Storage::disk('local')->files('solicitudes'));$hashRuta=$s->fresh()->ruta_memo;
    Auditoria::creating(fn()=>throw new RuntimeException('Fallo de auditoría simulado'));
    try{$controlador->actualizarAdjuntos($s->id_solicitud,$request);}catch(RuntimeException){}finally{Auditoria::flushEventListeners();}
    comprobarRegistro('Fallo de auditoría revierte la ruta',$s->fresh()->ruta_memo===$hashRuta);
    comprobarRegistro('Fallo de auditoría limpia la copia nueva',count(Storage::disk('local')->files('solicitudes'))===$contador);
} finally {
    while(DB::transactionLevel())DB::rollBack();foreach(array_unique($creados) as $ruta)Storage::disk('local')->delete($ruta);
    if(isset($nuevo)&&is_file($nuevo))unlink($nuevo);
}
$despues=['solicitudes'=>SolicitudRegistro::count(),'usuarios'=>Usuario::count(),'enlaces'=>RegistroLink::count(),'auditoria'=>Auditoria::count()];
comprobarRegistro('Registros originales conservados',$antes===$despues);
if(isset($argv[1]))file_put_contents($argv[1],json_encode(['casos'=>$casos,'antes'=>$antes,'despues'=>$despues],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
echo count($casos).' comprobaciones correctas'.PHP_EOL;

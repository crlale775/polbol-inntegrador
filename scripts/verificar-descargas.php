<?php
// Genera reportes del servidor y comprueba el streaming con datos autorizados.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Http\Controllers\ReporteInstitucionalController;
use App\Models\Usuario;
use App\Services\ReportesInstitucionales;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
set_exception_handler(function(Throwable $e){fwrite(STDERR,'FALLO: '.$e->getMessage().PHP_EOL);exit(1);});
$out=$argv[1]??base_path('.codex-audit-tmp/exportaciones-seguridad');if(!is_dir($out))mkdir($out,0700,true);
$results=[];$keys=[];$controller=new ReporteInstitucionalController;
$request=fn($actor,$data=[])=>tap(Request::create('/api/reportes','GET',$data),fn($r)=>$r->setUserResolver(fn()=>$actor));
try {
    foreach([1=>'epi',2=>'departamental',3=>'general'] as $role=>$label){
        $actor=Usuario::where('id_rol',$role)->where('estado',true)->firstOrFail();
        $payload=$controller->index($request($actor),app(ReportesInstitucionales::class))->getData(true);$keys[]='reporte_snapshot_'.$payload['snapshot'];
        foreach(['pdf','xlsx'] as $format){
            $start=hrtime(true);$response=$controller->exportar($request($actor,['snapshot'=>$payload['snapshot'],'tipo'=>$payload['reportes'][0]['id'],'formato'=>$format]));
            if($response->getStatusCode()!==200)throw new RuntimeException($label.' '.$format.' HTTP'.$response->getStatusCode());
            ob_start();$response->sendContent();$bytes=ob_get_clean();
            if(!str_starts_with($bytes,$format==='pdf'?'%PDF-':'PK'))throw new RuntimeException('Formato de descarga inválido');
            $path=$out.'/'.$label.'.'.$format;file_put_contents($path,$bytes);
            $results[]=['rol'=>$label,'formato'=>$format,'bytes'=>strlen($bytes),'ms'=>round((hrtime(true)-$start)/1e6,2),'archivo'=>$path];
            echo 'OK '.$label.' '.$format.' '.strlen($bytes).' bytes'.PHP_EOL;
        }
    }
} finally {foreach($keys as $key)Cache::forget($key);}
file_put_contents($out.'/resultado.json',json_encode($results,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));

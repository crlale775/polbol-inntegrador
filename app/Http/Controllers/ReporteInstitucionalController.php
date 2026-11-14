<?php

namespace App\Http\Controllers;

use App\Services\ReportesInstitucionales;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReporteInstitucionalController extends Controller
{
    public function index(Request $request, ReportesInstitucionales $servicio): JsonResponse
    {
        $filtros=$request->validate(['id_epi'=>['nullable','integer','min:1'],'desde'=>['nullable','date_format:Y-m-d'],'hasta'=>['nullable','date_format:Y-m-d'],'actualizar'=>['nullable','boolean']]);
        if(!empty($filtros['desde'])&&!empty($filtros['hasta'])&&$filtros['desde']>$filtros['hasta'])throw ValidationException::withMessages(['hasta'=>'La fecha final debe ser igual o posterior a la inicial.']);
        $actor=$request->user();
        $firma='reportes_roles_v1_'.hash('sha256',json_encode([$actor->id_usuario,$actor->id_rol,$actor->id_epi,$filtros['id_epi']??null,$filtros['desde']??null,$filtros['hasta']??null,config('reportes.comando_departamental_id')]));
        if($request->boolean('actualizar'))Cache::forget($firma);
        $payload=Cache::remember($firma,now()->addSeconds(30),fn()=>$servicio->generar($actor,$filtros));
        // La exportación usa esta instantánea del servidor: coincide con la pantalla.
        $snapshot=(string)Str::uuid();
        Cache::put('reporte_snapshot_'.$snapshot,['owner'=>(int)$actor->id_usuario,'scope'=>[$actor->id_rol,$actor->id_epi,config('reportes.comando_departamental_id')],'payload'=>$payload],now()->addMinutes(20));
        return response()->json($payload+['snapshot'=>$snapshot])->header('Cache-Control','private, no-store');
    }

    public function exportar(Request $request): StreamedResponse|JsonResponse
    {
        $datos=$request->validate(['snapshot'=>['required','uuid'],'tipo'=>['required','string','max:40'],'formato'=>['required',Rule::in(['pdf','xlsx'])]]);
        $guardado=Cache::get('reporte_snapshot_'.$datos['snapshot']);
        abort_unless($guardado,410,'El reporte ha caducado. Actualice los datos para descargarlo.');
        $actor=$request->user();
        abort_unless($guardado['owner']===(int)$actor->id_usuario,403);
        abort_unless($guardado['scope']===[$actor->id_rol,$actor->id_epi,config('reportes.comando_departamental_id')],403);
        $payload=$guardado['payload'];
        $reporte=collect($payload['reportes'])->firstWhere('id',$datos['tipo']);
        abort_unless($reporte,403,'El reporte no corresponde a su rol.');
        unset($payload['reportes'],$payload['epis']);
        $payload['reporte']=$reporte;
        $directorio=storage_path('app/private/exportaciones');
        if(!is_dir($directorio))mkdir($directorio,0700,true);
        $archivo=$directorio.DIRECTORY_SEPARATOR.Str::uuid().'.'.$datos['formato'];
        try {
            $resultado=Process::timeout(90)->input(json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR))->run([
                config('reportes.python'),base_path('scripts/exportar_reportes.py'),'--formato',$datos['formato'],'--salida',$archivo,'--escudo',public_path('images/escudo.png'),
            ]);
            if(!$resultado->successful()||!is_file($archivo)||filesize($archivo)<100)throw new \RuntimeException('Exportador no disponible: '.mb_substr($resultado->errorOutput(),0,1200));
            $nombre='Policia_Boliviana_'.$payload['rol'].'_'.$reporte['id'].'_'.now()->format('Ymd_His').'.'.$datos['formato'];
            // Leer mediante un descriptor real evita falsos negativos de
            // is_readable/AccessCheck con ACL de Windows, sin omitir permisos OS.
            $stream=fopen($archivo,'rb');
            if($stream===false)throw new \RuntimeException('El reporte no se pudo abrir para su descarga.');
            return response()->streamDownload(function () use ($stream,$archivo): void {
                try { fpassthru($stream); }
                finally { fclose($stream); if(is_file($archivo))unlink($archivo); }
            },$nombre,['Content-Type'=>$datos['formato']==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Length'=>(string)filesize($archivo),'Cache-Control'=>'private, no-store','X-Content-Type-Options'=>'nosniff']);
        } catch (\Throwable $e) {
            if(isset($stream)&&is_resource($stream))fclose($stream);
            if(is_file($archivo))unlink($archivo);
            Log::error('No se pudo exportar un reporte institucional.',['exception'=>$e,'user_id'=>$actor->id_usuario,'formato'=>$datos['formato']]);
            return response()->json(['message'=>'No se pudo generar el archivo. Intente nuevamente o contacte al administrador.'],503);
        }
    }
}

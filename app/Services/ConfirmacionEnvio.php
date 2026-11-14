<?php

namespace App\Services;

use App\Models\{Auditoria, Documento, HistorialEstado, Oficial, TipoDocumento, TipoMemo, Usuario, VersionDocumento};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Cache, DB, Storage};
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ConfirmacionEnvio
{
    public const VIGENCIA = 90;

    public static function claveTipo(string $nombre): string
    {
        return mb_substr(mb_strtolower(Str::ascii(preg_replace('/\s+/u', ' ', trim($nombre)))),0,100);
    }

    public function guardarRevision(Usuario $actor, string $hash, array $contexto, array $resultado): array
    {
        $id = (string) Str::uuid();
        $contexto = array_intersect_key($contexto,array_flip(['id_oficial','id_tipo','tipo_libre']));
        Cache::put('revision_emision_'.$id, ['owner'=>(int)$actor->id_usuario,'hash'=>$hash,'contexto'=>$contexto,'resultado'=>$resultado], now()->addMinutes(30));
        return array_merge($resultado,['revision_id'=>$id]);
    }

    public function preparar(Request $request): array
    {
        $actor = $request->user();
        abort_unless((int)$actor->id_rol === 1 && $actor->id_epi, 403);
        $request->merge(['codigo_documento'=>trim((string)$request->input('codigo_documento')),'referencia'=>trim((string)$request->input('referencia')),'tipo_libre'=>trim((string)$request->input('tipo_libre')) ?: null]);
        $data = $request->validate([
            'id_tipo'=>['required','integer','exists:tipos_documento,id_tipo'],
            'id_oficial'=>['required','integer','exists:oficiales,id_oficial'],
            'codigo_documento'=>['required','string','max:50','unique:documentos,codigo_documento'],
            'referencia'=>['required','string','min:5','max:255'],
            'fecha_subida'=>['required','date_format:Y-m-d'],
            'ruta_pdf'=>['required','string','max:500'],
            'tipo_libre'=>['nullable','string','min:3','max:100','regex:/^[\pL\pN][\pL\pN\s.,()\/-]*$/u'],
            'revision_id'=>['nullable','uuid'],
        ]);
        if ($data['fecha_subida'] !== now()->toDateString()) throw ValidationException::withMessages(['fecha_subida'=>'La fecha oficial debe ser la de hoy.']);
        abort_unless(Oficial::where('id_oficial',$data['id_oficial'])->where('id_epi',$actor->id_epi)->exists(), 422, 'El oficial no pertenece a su EPI.');
        $archivo = Cache::get('archivo_emision_'.hash('sha256',$data['ruta_pdf']));
        abort_unless($archivo && $archivo['owner']===(int)$actor->id_usuario && $archivo['epi']===(int)$actor->id_epi, 403, 'Adjunte nuevamente el PDF desde su cuenta.');
        abort_unless(Storage::disk('local')->exists($data['ruta_pdf']), 422, 'El PDF ya no está disponible. Adjunte nuevamente el archivo.');
        $tipo = TipoDocumento::findOrFail($data['id_tipo']);
        abort_if(TipoMemo::where('id_tipo',$tipo->id_tipo)->where('activo',false)->exists(),422,'El tipo de memorándum está inactivo. Seleccione un tipo vigente.');
        $libre = trim($data['tipo_libre'] ?? '');
        if ($libre && !in_array(self::claveTipo($tipo->nombre), ['otro','otros'], true)) throw ValidationException::withMessages(['tipo_libre'=>'El nombre libre se utiliza con el tipo Otros.']);
        if (!$libre && in_array(self::claveTipo($tipo->nombre), ['otro','otros'], true)) throw ValidationException::withMessages(['tipo_libre'=>'Especifique el nombre del tipo de memorándum.']);
        $revision = !empty($data['revision_id']) ? Cache::get('revision_emision_'.$data['revision_id']) : null;
        $vigente = $revision && $revision['owner']===(int)$actor->id_usuario && hash_equals($archivo['hash'],$revision['hash'])
            && (int)($revision['contexto']['id_oficial'] ?? 0)===(int)$data['id_oficial']
            && (int)($revision['contexto']['id_tipo'] ?? 0)===(int)$data['id_tipo']
            && self::claveTipo($revision['contexto']['tipo_libre'] ?? '')===self::claveTipo($libre);
        $resultado = $vigente ? $revision['resultado'] : ['ia_disponible'=>false];
        $observaciones = [];
        if (!$vigente) $observaciones[] = 'No hay una revisión automática vigente para este archivo y estos datos.';
        elseif (($resultado['ia_disponible'] ?? true) === false) $observaciones[] = 'La verificación automática no se pudo completar. El documento requiere revisión humana.';
        else {
            if (!empty($resultado['descartado']) || ($resultado['es_memo'] ?? null) === false) $observaciones[] = $resultado['motivo_descarte'] ?? 'No se pudo reconocer el archivo como memorándum institucional.';
            if (($resultado['coincide_tipo'] ?? null) === false) $observaciones[] = 'El tipo detectado no coincide con el tipo seleccionado.';
            foreach (['alertas','advertencias'] as $key) foreach (($resultado[$key] ?? []) as $value) if (is_string($value)) $observaciones[] = mb_substr($value,0,700);
        }
        $observaciones = array_values(array_unique(array_slice($observaciones,0,40)));
        $payload = [
            'id_tipo'=>(int)$data['id_tipo'],'id_oficial'=>(int)$data['id_oficial'],'id_usuario'=>(int)$actor->id_usuario,'id_epi'=>(int)$actor->id_epi,
            'codigo_documento'=>trim($data['codigo_documento']),'referencia'=>trim($data['referencia']),'ruta_pdf'=>$data['ruta_pdf'],'hash'=>$archivo['hash'],
            'fecha_subida'=>$data['fecha_subida'],'estado_actual'=>2,'tipo_libre'=>$libre ?: null,'tipo_libre_clave'=>$libre ? self::claveTipo($libre) : null,
            'revision_previa'=>['observaciones'=>$observaciones,'requiere_revision_humana'=>count($observaciones)>0,'revision_automatica_vigente'=>(bool)$vigente,'fecha_revision'=>now()->toIso8601String()],
        ];
        $token = (string) Str::uuid();
        Cache::put('confirmacion_emision_'.$token, ['owner'=>(int)$actor->id_usuario,'epi'=>(int)$actor->id_epi,'expira'=>now()->getTimestamp()+self::VIGENCIA,'payload'=>$payload,'documento'=>null], now()->addMinutes(30));
        return ['token_confirmacion'=>$token,'vence_en'=>self::VIGENCIA,'expira_en'=>now()->addSeconds(self::VIGENCIA)->toIso8601String(),'observaciones'=>$observaciones];
    }

    public function registrar(Request $request): Documento
    {
        abort_unless((int)$request->user()->id_rol===1,403);
        $request->validate(['token_confirmacion'=>['required','uuid'],'acepto_responsabilidad'=>['required','accepted']]);
        $token = $request->string('token_confirmacion')->toString();
        return Cache::lock('lock_confirmacion_'.$token,20)->block(5,function () use ($request,$token) {
            $key = 'confirmacion_emision_'.$token;
            $confirmacion = Cache::get($key);
            abort_unless($confirmacion, 410, 'La confirmación ya no está disponible. Genere una nueva.');
            $actor = $request->user();
            abort_unless((int)$actor->id_rol===1 && $confirmacion['owner']===(int)$actor->id_usuario && $confirmacion['epi']===(int)$actor->id_epi,403);
            if ($confirmacion['documento']) return Documento::findOrFail($confirmacion['documento']);
            abort_if(now()->getTimestamp() >= $confirmacion['expira'],410,'La confirmación de 90 segundos ha caducado. Revise los datos y genérela nuevamente.');
            $data = $confirmacion['payload'];
            $path = Storage::disk('local')->path($data['ruta_pdf']);
            abort_unless(is_file($path) && hash_equals($data['hash'],hash_file('sha256',$path)),422,'El archivo cambió. Adjunte nuevamente el PDF.');
            abort_if(Documento::where('codigo_documento',$data['codigo_documento'])->exists(),409,'Este código de documento ya está registrado. Consulte Mis documentos antes de repetir el envío.');
            abort_unless(Oficial::where('id_oficial',$data['id_oficial'])->where('id_epi',$actor->id_epi)->exists(),422,'La asignación del oficial cambió. Genere una nueva confirmación.');
            $data['revision_previa']['confirmado_por'] = (int)$actor->id_usuario;
            $data['revision_previa']['confirmado_en'] = now()->toIso8601String();
            $doc = DB::transaction(function () use ($data,$actor) {
                $doc = Documento::create($data);
                HistorialEstado::create(['id_documento'=>$doc->id_documento,'estado_anterior'=>null,'estado_nuevo'=>2,'usuario'=>$actor->id_usuario,'fecha'=>now()]);
                VersionDocumento::create(['id_documento'=>$doc->id_documento,'version'=>1,'ruta_pdf'=>$doc->ruta_pdf,'subido_por'=>$actor->id_usuario,'fecha'=>now()]);
                Auditoria::create(['id_usuario'=>$actor->id_usuario,'tabla'=>'documentos','accion'=>'REMISION_CONFIRMADA','descripcion'=>'Remisión confirmada de '.$doc->codigo_documento.'. Observaciones previas: '.count($data['revision_previa']['observaciones']).'.','fecha'=>now()]);
                return $doc;
            });
            $confirmacion['documento'] = $doc->id_documento;
            Cache::put($key,$confirmacion,now()->addMinutes(30));
            return $doc;
        });
    }
}

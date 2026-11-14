<?php
namespace App\Services;

use App\Models\{Auditoria, Documento, TipoDocumento, TipoMemo};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Cache, DB};
use Illuminate\Support\Str;

/** Frecuencia observada + decisión humana. No modifica reglas por sí sola. */
class SugerenciasTipos
{
    public const UMBRAL = 5;

    public function pendientes(): array
    {
        $decisiones = DB::table('decisiones_tipos_libres')->get()->keyBy('clave');
        return Documento::whereNotNull('tipo_libre_clave')
            ->selectRaw('tipo_libre_clave AS clave, MIN(tipo_libre) AS nombre, COUNT(*) AS usos')
            ->groupBy('tipo_libre_clave')->havingRaw('COUNT(*) >= ?', [self::UMBRAL])->get()
            ->filter(function ($row) use ($decisiones) {
                $decision = $decisiones->get($row->clave);
                return !$decision || ($decision->decision === 'rechazado' && $row->usos >= $decision->usos_al_decidir + self::UMBRAL);
            })->sortByDesc('usos')->values()->map(fn($r)=>['clave'=>$r->clave,'nombre'=>$r->nombre,'usos'=>(int)$r->usos])->all();
    }

    public function decidir(Request $request): array
    {
        abort_unless((int)$request->user()->id_rol===3,403);
        $data=$request->validate(['clave'=>['required','string','max:100'],'decision'=>['required','in:aprobar,rechazar'],'nombre'=>['required','string','min:3','max:100','regex:/^[\pL\pN][\pL\pN\s.,()\/-]*$/u'],'confirmado'=>['required','accepted']]);
        $nombre=trim($data['nombre']);
        abort_if(in_array(ConfirmacionEnvio::claveTipo($nombre),['otro','otros'],true),422,'La propuesta necesita un nombre específico.');
        return Cache::lock('decision_tipo_'.hash('sha256',$data['clave']),15)->block(5,fn()=>DB::transaction(function () use($request,$data,$nombre) {
            $usos=Documento::where('tipo_libre_clave',$data['clave'])->count();
            abort_if($usos<self::UMBRAL,422,'La propuesta todavía no alcanza cinco remisiones registradas.');
            $anterior=DB::table('decisiones_tipos_libres')->where('clave',$data['clave'])->lockForUpdate()->first();
            if($anterior && $anterior->decision==='aprobado')return ['message'=>'Esta propuesta ya fue aprobada.','memo'=>TipoMemo::where('id_tipo',$anterior->id_tipo)->first()];
            abort_if($anterior && $anterior->decision==='rechazado' && $usos<$anterior->usos_al_decidir+self::UMBRAL,422,'La propuesta ya fue rechazada. Necesita cinco remisiones adicionales para una nueva decisión.');
            $tipo=null;$memo=null;
            if($data['decision']==='aprobar') {
                $tipo=TipoDocumento::all()->first(fn($t)=>ConfirmacionEnvio::claveTipo($t->nombre)===ConfirmacionEnvio::claveTipo($nombre));
                if(!$tipo)$tipo=TipoDocumento::create(['nombre'=>$nombre]);
                $codigo='MEMO_'.$tipo->id_tipo.'_'.substr(strtoupper(Str::slug($nombre,'_')),0,18);
                while(TipoMemo::where('codigo',$codigo)->exists())$codigo='MEMO_'.$tipo->id_tipo.'_'.strtoupper(Str::random(6));
                $memo=TipoMemo::firstOrCreate(['id_tipo'=>$tipo->id_tipo],[
                    'nombre'=>$tipo->nombre,'codigo'=>$codigo,'categoria'=>'Otro','descripcion'=>'Incorporado por decisión humana a partir de su uso documental.',
                    'formato'=>['secciones'=>[]],'validaciones'=>['requiere_firma'=>true,'requiere_sello'=>true],
                    'color'=>'#285343','activo'=>true,'acceso_directo'=>true,'creado_por'=>$request->user()->id_usuario,
                ]);
                $memo->update(['activo'=>true,'acceso_directo'=>true]);
            }
            DB::table('decisiones_tipos_libres')->updateOrInsert(['clave'=>$data['clave']],[
                'nombre'=>$nombre,'decision'=>$data['decision']==='aprobar'?'aprobado':'rechazado','id_tipo'=>$tipo?->id_tipo,
                'decidido_por'=>$request->user()->id_usuario,'usos_al_decidir'=>$usos,'decidido_en'=>now(),
            ]);
            Auditoria::create(['id_usuario'=>$request->user()->id_usuario,'tabla'=>'tipos_libres','accion'=>$data['decision']==='aprobar'?'SUGERENCIA_APROBADA':'SUGERENCIA_RECHAZADA','descripcion'=>'Decisión sobre '.$nombre.'; usos registrados: '.$usos.'.','fecha'=>now()]);
            return ['message'=>$memo?'Acceso aprobado. Puede completar o ajustar su formato institucional.':'Propuesta rechazada. Solo volverá a sugerirse tras cinco remisiones adicionales.','memo'=>$memo?->load('tipoDocumento')];
        }));
    }
}

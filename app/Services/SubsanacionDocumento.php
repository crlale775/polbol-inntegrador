<?php

namespace App\Services;

use App\Models\{Auditoria, Documento, HistorialEstado, Notificacion, Revision, VersionDocumento};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Cache, DB, Storage};
use Illuminate\Support\Str;

class SubsanacionDocumento
{
    private function autorizar(Request $request, Documento $doc): void
    {
        abort_unless((int) $request->user()->id_rol === 1 && (int) $doc->id_epi === (int) $request->user()->id_epi, 404);
    }

    private function archivo(Request $request, Documento $doc, string $ruta): array
    {
        // Una ruta nueva debe proceder de la carga autenticada de ESTA cuenta.
        if ($ruta !== $doc->ruta_pdf) {
            $carga = Cache::get('archivo_emision_'.hash('sha256', $ruta));
            abort_unless($carga && (int) $carga['owner'] === (int) $request->user()->id_usuario
                && (int) $carga['epi'] === (int) $request->user()->id_epi, 403, 'Adjunte el PDF desde su cuenta.');
        }
        $normal = ltrim(str_replace('\\', '/', $ruta), '/');
        if (str_starts_with($normal, 'storage/')) $normal = substr($normal, 8);
        abort_unless(preg_match('~^documentos/[A-Za-z0-9_.-]+\.pdf$~iD', $normal), 422, 'La ruta del PDF no es válida. Adjunte nuevamente el archivo.');
        $disk = Storage::disk('local');
        if (!$disk->exists($normal) && $ruta === $doc->ruta_pdf) $disk = Storage::disk('public');
        abort_unless($disk->exists($normal), 422, 'El PDF original no está disponible. Adjunte el archivo corregido.');
        return [$disk->path($normal), hash_file('sha256', $disk->path($normal))];
    }

    public function preparar(Request $request, int $id): array
    {
        $doc = Documento::findOrFail($id);
        $this->autorizar($request, $doc);
        abort_unless(in_array((int) $doc->estado_actual, [4, 5], true), 409, 'El trámite ya no está pendiente de subsanación.');
        $request->merge(['referencia' => trim((string) $request->input('referencia')), 'nota' => trim((string) $request->input('nota'))]);
        $data = $request->validate([
            'referencia' => ['required','string','min:5','max:255'],
            'nota' => ['required','string','min:10','max:2000'],
            'ruta_pdf' => ['required','string','max:500'],
            'revision_id' => ['nullable','uuid'],
        ]);
        [, $hash] = $this->archivo($request, $doc, $data['ruta_pdf']);
        $revision = !empty($data['revision_id']) ? Cache::get('revision_emision_'.$data['revision_id']) : null;
        $verificada = $revision && (int) $revision['owner'] === (int) $request->user()->id_usuario
            && hash_equals($hash, $revision['hash'])
            && (int) ($revision['contexto']['id_oficial'] ?? 0) === (int) $doc->id_oficial
            && (int) ($revision['contexto']['id_tipo'] ?? 0) === (int) $doc->id_tipo
            && ConfirmacionEnvio::claveTipo($revision['contexto']['tipo_libre'] ?? '') === ConfirmacionEnvio::claveTipo($doc->tipo_libre ?? '');
        $observaciones = $verificada ? array_merge($revision['resultado']['alertas'] ?? [], $revision['resultado']['advertencias'] ?? [])
            : ['El archivo requiere revisión humana; no hay una verificación automática vigente para estos datos.'];
        if ($verificada && (!empty($revision['resultado']['descartado']) || ($revision['resultado']['es_memo'] ?? true) === false))
            $observaciones[] = $revision['resultado']['motivo_descarte'] ?? 'No se pudo reconocer el archivo como memorándum.';
        if ($verificada && ($revision['resultado']['ia_disponible'] ?? true) === false) $observaciones[] = 'La revisión automática no está disponible.';
        if ($verificada && ($revision['resultado']['coincide_tipo'] ?? true) === false) $observaciones[] = 'El tipo detectado no coincide con el seleccionado.';
        $observaciones = array_values(array_unique(array_slice(array_map(fn ($s) => mb_substr($s, 0, 700), array_filter($observaciones, 'is_string')), 0, 40)));
        $token = (string) Str::uuid();
        Cache::put('subsanacion_'.$token, ['owner' => (int) $request->user()->id_usuario, 'epi' => (int) $doc->id_epi,
            'id_documento' => $id, 'expira' => now()->getTimestamp()+90, 'consumido' => false,
            'anterior' => ['ruta_pdf' => $doc->ruta_pdf, 'hash' => $doc->hash, 'referencia' => $doc->referencia,
                'id_tipo' => $doc->id_tipo, 'id_oficial' => $doc->id_oficial, 'tipo_libre' => $doc->tipo_libre, 'estado_actual' => $doc->estado_actual],
            'datos' => $data, 'hash' => $hash, 'observaciones' => $observaciones], now()->addMinutes(30));
        return ['token_confirmacion' => $token, 'vence_en' => 90, 'observaciones' => $observaciones,
            'resumen' => ['referencia'=>$data['referencia'],'nota'=>$data['nota'],'archivo_nuevo'=>$data['ruta_pdf'] !== $doc->ruta_pdf]];
    }

    public function registrar(Request $request, int $id): Documento
    {
        $request->validate(['token_confirmacion' => ['required','uuid'], 'acepto_responsabilidad' => ['required','accepted']]);
        $token = $request->string('token_confirmacion')->toString();
        return Cache::lock('lock_subsanacion_'.$token, 20)->block(5, function () use ($request, $id, $token) {
            $key = 'subsanacion_'.$token;
            $confirmacion = Cache::get($key);
            abort_unless($confirmacion, 410, 'La confirmación ya no está disponible. Genere otra.');
            abort_unless((int) $request->user()->id_rol === 1 && $confirmacion['owner'] === (int) $request->user()->id_usuario
                && $confirmacion['epi'] === (int) $request->user()->id_epi && $confirmacion['id_documento'] === $id, 403);
            if ($confirmacion['consumido']) {
                $doc = Documento::findOrFail($id);
                $this->autorizar($request, $doc);
                return $doc;
            }
            abort_if(now()->getTimestamp() >= $confirmacion['expira'], 410, 'La confirmación de 90 segundos venció. Genere otra.');
            $doc = DB::transaction(function () use ($request, $id, $confirmacion) {
                $doc = Documento::lockForUpdate()->findOrFail($id);
                $this->autorizar($request, $doc);
                abort_unless(in_array((int) $doc->estado_actual, [4,5], true), 409, 'El trámite ya fue procesado. Actualice la bandeja.');
                foreach ($confirmacion['anterior'] as $campo => $valor) abort_unless($doc->$campo === $valor, 409, 'El expediente cambió. Revise los datos y genere otra confirmación.');
                [, $hash] = $this->archivo($request, $doc, $confirmacion['datos']['ruta_pdf']);
                abort_unless(hash_equals($confirmacion['hash'], $hash), 422, 'El PDF cambió. Adjunte nuevamente el archivo.');
                $actor = $request->user()->id_usuario;
                $version = (int) $doc->versiones()->max('version');
                if (!$version) {
                    VersionDocumento::create(['id_documento'=>$id,'version'=>1,'ruta_pdf'=>$doc->ruta_pdf,'subido_por'=>$doc->id_usuario,'fecha'=>$doc->fecha_subida]);
                    $version = 1;
                }
                VersionDocumento::create(['id_documento'=>$id,'version'=>$version+1,'ruta_pdf'=>$confirmacion['datos']['ruta_pdf'],'subido_por'=>$actor,'fecha'=>now()]);
                $estadoAnterior = $doc->estado_actual;
                $doc->update(['referencia'=>$confirmacion['datos']['referencia'],'ruta_pdf'=>$confirmacion['datos']['ruta_pdf'],'hash'=>$hash,'estado_actual'=>2,
                    'revision_previa'=>['observaciones'=>$confirmacion['observaciones'],'requiere_revision_humana'=>count($confirmacion['observaciones'])>0,'confirmado_por'=>$actor,'confirmado_en'=>now()->toIso8601String()]]);
                HistorialEstado::create(['id_documento'=>$id,'estado_anterior'=>$estadoAnterior,'estado_nuevo'=>2,'usuario'=>$actor,'fecha'=>now()]);
                $revisores = $doc->revisiones()->where('estado','!=','Reenviado')->distinct()->pluck('usuario_revisor');
                Revision::create(['id_documento'=>$id,'usuario_revisor'=>$actor,'nivel_revision'=>'Secretaría EPI','estado'=>'Reenviado','observacion_libre'=>$confirmacion['datos']['nota'],'fecha'=>now()]);
                Auditoria::create(['id_usuario'=>$actor,'tabla'=>'documentos','accion'=>'SUBSANACION_REENVIO','descripcion'=>'Subsanación confirmada de '.$doc->codigo_documento.' (versión '.($version+1).').','fecha'=>now()]);
                foreach ($revisores as $revisor) if ($revisor && (int) $revisor !== (int) $actor) Notificacion::create(['id_usuario'=>$revisor,'id_documento'=>$id,'titulo'=>$doc->codigo_documento.' corregido y re-enviado','mensaje'=>'La EPI subsanó las observaciones: '.$confirmacion['datos']['nota'],'leido'=>false,'fecha'=>now()]);
                return $doc;
            });
            $confirmacion['consumido'] = true;
            Cache::put($key, $confirmacion, now()->addMinutes(30));
            return $doc;
        });
    }
}

<?php

namespace App\Services;

use App\Models\SolicitudRegistro;
use Illuminate\Support\Facades\Storage;

class ArchivosRegistro
{
    public function ruta(?string $ruta, string $tipo): ?string
    {
        $ruta = str_replace('\\', '/', (string) $ruta);
        $patron = $tipo === 'memo'
            ? '~\Asolicitudes/[A-Za-z0-9_-]+\.pdf\z~i'
            : '~\Asolicitudes/(?:fotos/)?[A-Za-z0-9_-]+\.(?:png|jpe?g)\z~i';
        if (!preg_match($patron, $ruta)) return null;
        foreach (['local', 'public'] as $disco) {
            if (Storage::disk($disco)->exists($ruta)) return Storage::disk($disco)->path($ruta);
        }
        return null;
    }

    public function estado(SolicitudRegistro $solicitud): array
    {
        return ['memo' => $this->ruta($solicitud->ruta_memo, 'memo') !== null,
            'foto' => $this->ruta($solicitud->ruta_foto, 'foto') !== null];
    }
}

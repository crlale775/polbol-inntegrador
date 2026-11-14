<?php

namespace App\Console\Commands;

use App\Services\VerificadorIA;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * IaDiagnostico — Comprueba de un vistazo por qué la IA local no responde.
 *
 * Uso:
 *   php artisan ia:diagnostico
 *   php artisan ia:diagnostico --pdf=storage/app/public/solicitudes/memo.pdf
 *
 * Revisa, en orden:
 *   1. Que LM Studio esté escuchando (GET /v1/models).
 *   2. Qué modelos están descargados y cuáles usa la app.
 *   3. Que cada modelo candidato REALMENTE cargue (una petición mínima: el
 *      fallo típico "Failed to load model … exitCode=3221225775" aparece aquí).
 *   4. (Opcional) El filtro de encabezado MEMORÁNDUM sobre un PDF real.
 */
class IaDiagnostico extends Command
{
    protected $signature = 'ia:diagnostico {--pdf= : Ruta de un PDF para probar el filtro de encabezado MEMORÁNDUM} {--limpiar : Olvida los modelos marcados como no cargables} {--todos : Prueba la carga de TODOS los candidatos (descarga el modelo en uso)}';

    protected $description = 'Diagnostica la IA local (LM Studio): servidor, modelos disponibles y si cargan de verdad';

    public function handle(VerificadorIA $verificador): int
    {
        if ($this->option('limpiar')) {
            foreach ((array) config('ia.modelos', []) as $modelo) {
                \Illuminate\Support\Facades\Cache::forget('ia:modelo_roto:' . $modelo);
            }
            $this->info('Modelos marcados como no cargables: olvidados.');
        }

        $this->newLine();
        $this->line('<options=bold>Policía Boliviana · Diagnóstico de la IA local</>');
        $this->line('Servidor:  ' . ($verificador->url() !== '' ? $verificador->url() : '(IA_URL vacío en .env)'));
        $this->line('Endpoint:  ' . config('ia.endpoint'));
        $this->newLine();

        if (!$verificador->disponible()) {
            $this->error('La IA local no está configurada: defina IA_URL e IA_MODEL en el archivo .env.');

            return self::FAILURE;
        }

        // 1) ¿Servidor arriba?
        $disponibles = $verificador->modelosDisponibles(true);
        if (count($disponibles) === 0) {
            $this->error('No se pudo leer /v1/models en ' . $verificador->url() . '.');
            $this->line('  • Abra LM Studio y verifique que el servidor local esté en "Running" (Developer → Local Server).');
            $this->line('  • Confirme el puerto: ' . $verificador->url());

            return self::FAILURE;
        }

        $this->info('Servidor OK. Modelos descargados (' . count($disponibles) . '):');
        foreach ($disponibles as $id) {
            $this->line('  • ' . $id);
        }
        $this->newLine();

        // 2) Configuración de la app
        $configModel = (string) config('ia.model');
        $configRapido = (string) config('ia.model_rapido');
        $this->line('Configuración de la app:');
        $this->line('  IA_MODEL        → ' . $configModel . (in_array($configModel, $disponibles, true) ? '  <fg=green>[descargado]</>' : '  <fg=red>[NO descargado]</>'));
        $this->line('  IA_MODEL_RAPIDO → ' . $configRapido . (in_array($configRapido, $disponibles, true) ? '  <fg=green>[descargado]</>' : '  <fg=red>[NO descargado]</>'));
        $this->line('  Candidatos      → ' . implode(', ', $verificador->modelosCandidatos()));
        $this->newLine();

        // 3) ¿Cargan de verdad? (esto es lo que falla con el runtime roto)
        //
        // Por defecto se prueba SOLO el modelo en uso: con 4 GB de VRAM, dejar
        // que LM Studio cargue un segundo modelo descarga el primero y la app
        // queda lenta (~20 s por consulta) hasta que se vuelva a cargar.
        // `--todos` prueba la lista completa a propósito.
        $this->line('Probando carga real del modelo en uso…');
        $fallos = 0;
        $ok = 0;

        $candidatos = $verificador->modelosCandidatos();
        if (!$this->option('todos') && count($candidatos) > 1) {
            $candidatos = [$candidatos[0]];
        }

        foreach ($candidatos as $modelo) {
            $inicio = microtime(true);

            try {
                $respuesta = Http::timeout(240)->asJson()->post(
                    $verificador->url() . '/' . ltrim((string) config('ia.endpoint'), '/'),
                    [
                        'model' => $modelo,
                        'temperature' => 0,
                        'input' => 'Responde solo con este JSON: {"ok": true}',
                    ]
                );
            } catch (Throwable $e) {
                $fallos++;
                $this->line(sprintf('  <fg=red>✗ %s</> → sin respuesta: %s', $modelo, $e->getMessage()));
                continue;
            }

            $segundos = microtime(true) - $inicio;

            if ($respuesta->successful()) {
                $ok++;
                $stats = (array) $respuesta->json('stats', []);
                $carga = $stats['model_load_time_seconds'] ?? null;
                $velocidad = $stats['tokens_per_second'] ?? null;
                $this->line(sprintf(
                    '  <fg=green>✓ %s</> → respondió en %.1f s%s%s',
                    $modelo,
                    $segundos,
                    $carga !== null ? sprintf(' (carga del modelo %.1f s)', (float) $carga) : '',
                    $velocidad !== null ? sprintf(', %.1f tok/s', (float) $velocidad) : ''
                ));
                continue;
            }

            $fallos++;
            $detalle = $respuesta->json('error.message') ?? $respuesta->body();
            $this->line(sprintf(
                '  <fg=red>✗ %s</> → HTTP %d: %s',
                $modelo,
                $respuesta->status(),
                mb_substr(is_string($detalle) ? $detalle : (string) json_encode($detalle), 0, 220)
            ));
        }

        $this->newLine();

        if ($fallos > 0 && $ok === 0) {
            $this->error('Ningún modelo pudo cargar. La app no podrá verificar documentos hasta resolverlo.');
            $this->newLine();
            $this->line('<options=bold>Qué significa</>');
            $this->line('  "Failed to load model … exited before becoming healthy, exitCode=3221225775"');
            $this->line('  (0xC000012F) = el motor de inferencia (llama-server) no arranca: un DLL del');
            $this->line('  runtime de LM Studio está corrupto o bloqueado. No es el PDF ni la app.');
            $this->newLine();
            $this->line('<options=bold>Cómo solucionarlo</>');
            $this->line('  1. LM Studio → Settings (⚙) → Runtime/Backends: borre el runtime y descárguelo otra vez.');
            $this->line('     Si acaba de actualizarse, elija una versión anterior (p. ej. 2.60.0) que sí arranque.');
            $this->line('  2. Cierre LM Studio y borre %USERPROFILE%\\.lmstudio\\extensions\\backends\\llama.cpp-*');
            $this->line('     (se vuelven a descargar solos al iniciar); excluya esa carpeta del antivirus.');
            $this->line('  3. Instale "Visual C++ Redistributable 2015-2022 x64" si el error persiste.');
            $this->line('  4. Vuelva a ejecutar: php artisan ia:diagnostico');

            return self::FAILURE;
        }

        if ($fallos > 0) {
            $this->warn('Algunos modelos no cargaron; la app usará automáticamente los que sí responden.');
        } else {
            $this->info('Todos los modelos candidatos cargaron correctamente.');
        }

        // 4) Filtro de encabezado (opcional)
        $pdf = (string) $this->option('pdf');
        if ($pdf !== '') {
            $this->newLine();
            $this->line('Probando el filtro de encabezado MEMORÁNDUM en: ' . $pdf);

            if (!is_file($pdf)) {
                $this->error('El archivo no existe.');

                return self::FAILURE;
            }

            $encabezado = $verificador->verificarEncabezado($pdf);
            $veredicto = match ($encabezado['es_memo']) {
                true => '<fg=green>MEMORÁNDUM detectado</>',
                false => '<fg=red>DESCARTADO: no dice MEMORÁNDUM</>',
                default => '<fg=yellow>no concluyente (se revisará completo)</>',
            };

            $this->line('  Método:    ' . $encabezado['metodo']);
            $this->line('  Encabezado: ' . ($encabezado['encabezado'] ?? '(no leído)'));
            $this->line('  Resultado: ' . $veredicto);
            if ($encabezado['mensaje'] !== null) {
                $this->line('  Detalle:   ' . $encabezado['mensaje']);
            }
        }

        return self::SUCCESS;
    }
}

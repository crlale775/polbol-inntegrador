<?php

namespace App\Services;

use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * PdfPaginas — Convierte las primeras páginas de un PDF a imágenes PNG
 * (data URLs base64) para que la IA de visión (qwen2-vl en LM Studio) pueda
 * analizar el memorándum.
 *
 * Orden de rasterizadores disponibles:
 *   1. Python + PyMuPDF (script database/render_pdf.py)  → recomendado
 *   2. Ghostscript  (gs / gswin64c)
 *   3. Poppler      (pdftoppm)
 */
class PdfPaginas
{
    /** Página ya preparada al leer el encabezado, solo durante esta petición. */
    protected array $paginasPreparadas = [];

    protected function clavePagina(string $ruta, int $dpi, int $maxLado): string
    {
        return hash('sha256', $ruta.'|'.filemtime($ruta).'|'.filesize($ruta).'|'.$dpi.'|'.$maxLado);
    }

    /**
     * @return array<int, array{archivo:string, data_url:string}>
     */
    public function renderizar(
        string $rutaAbsoluta,
        ?int $maxPaginas = null,
        ?int $dpi = null,
        ?int $maxLado = null,
        bool $recortes = true
    ): array {
        $maxPaginas = $maxPaginas ?? (int) config('ia.max_paginas', 1);
        $dpi = $dpi ?? (int) config('ia.dpi', 150);
        // Lado mayor de la imagen que recibe el modelo. Es el parámetro que más
        // pesa en la latencia: los tokens de visión crecen con los píxeles.
        $maxLado = $maxLado ?? (int) config('ia.max_lado', 1100);

        if (!is_file($rutaAbsoluta)) {
            throw new RuntimeException("El archivo PDF no existe: {$rutaAbsoluta}");
        }

        $clave = $this->clavePagina($rutaAbsoluta, $dpi, $maxLado);
        if ($maxPaginas === 1 && !$recortes && isset($this->paginasPreparadas[$clave])) {
            return [$this->paginasPreparadas[$clave]];
        }

        $dir = storage_path('app/ia_tmp_' . uniqid());
        @mkdir($dir, 0777, true);

        try {
            $intentos = [
                fn () => $this->conPython($rutaAbsoluta, $dir, $maxPaginas, $dpi, $maxLado, $recortes),
                fn () => $this->conGhostscript($rutaAbsoluta, $dir, $maxPaginas, $dpi),
                fn () => $this->conPoppler($rutaAbsoluta, $dir, $maxPaginas, $dpi),
            ];

            $pngs = [];
            foreach ($intentos as $intento) {
                try {
                    $pngs = $intento();
                } catch (\Throwable) {
                    $pngs = [];
                }
                if (count($pngs) > 0) {
                    break;
                }
            }

            if (count($pngs) === 0) {
                throw new RuntimeException(
                    'No fue posible convertir el PDF a imágenes para la IA de visión. ' .
                    'Instale PyMuPDF en Python:  python -m pip install pymupdf   ' .
                    '(o instale Ghostscript/Poppler). El archivo PDF no tiene capa de texto utilizable y no hay rasterizador disponible.'
                );
            }

            sort($pngs, SORT_NATURAL);

            return array_map(function (string $png) use ($maxLado) {
                [$dataUrl] = $this->prepararImagen($png, $maxLado);

                return [
                    'archivo' => basename($png),
                    'data_url' => $dataUrl,
                ];
            }, $pngs);
        } finally {
            $this->eliminarDirectorio($dir);
        }
    }

    /**
     * Lee el archivo PNG, lo reduce a `$maxLado` px de lado mayor (CALIDAD
     * LANCZOS vía GD) y devuelve [data_url, ancho, alto].
     *
     * El rasterizador de Python ya entrega la imagen al tamaño correcto; esta
     * reducción cubre los respaldos (Ghostscript/Poppler) y deja la imagen
     * dentro del presupuesto de tokens aunque el PDF venga enorme.
     *
     * @return array{0:string, 1:int, 2:int}
     */
    protected function prepararImagen(string $png, int $maxLado): array
    {
        $binario = file_get_contents($png);
        if ($binario === false) {
            throw new RuntimeException("No se pudo leer la imagen generada: {$png}");
        }

        if (!function_exists('imagecreatefromstring')) {
            return ['data:image/png;base64,' . base64_encode($binario), 0, 0];
        }

        $im = @imagecreatefromstring($binario);
        if ($im === false) {
            return ['data:image/png;base64,' . base64_encode($binario), 0, 0];
        }

        $ancho = imagesx($im);
        $alto = imagesy($im);
        $ladoMayor = max($ancho, $alto);

        if ($ladoMayor <= $maxLado) {
            imagedestroy($im);

            return ['data:image/png;base64,' . base64_encode($binario), $ancho, $alto];
        }

        $escala = $maxLado / $ladoMayor;
        $nuevoAncho = max(1, (int) round($ancho * $escala));
        $nuevoAlto = max(1, (int) round($alto * $escala));

        $nuevo = imagecreatetruecolor($nuevoAncho, $nuevoAlto);
        // Fondo blanco: los PNG con transparencia se verían negros y el modelo
        // "leería" manchas en lugar de texto.
        imagefill($nuevo, 0, 0, imagecolorallocate($nuevo, 255, 255, 255));
        imagecopyresampled($nuevo, $im, 0, 0, 0, 0, $nuevoAncho, $nuevoAlto, $ancho, $alto);
        imagedestroy($im);

        $buf = fopen('php://temp', 'r+');
        if ($buf === false) {
            imagedestroy($nuevo);

            return ['data:image/png;base64,' . base64_encode($binario), $ancho, $alto];
        }

        imagepng($nuevo, $buf, 6);
        imagedestroy($nuevo);
        rewind($buf);
        $reducido = (string) stream_get_contents($buf);
        fclose($buf);

        return ['data:image/png;base64,' . base64_encode($reducido), $nuevoAncho, $nuevoAlto];
    }

    /**
     * Lee el ENCABEZADO (franja superior) de la primera página.
     *
     * Se usa para descartar documentos que no son memorándum ANTES de gastar
     * consultas de visión:
     *   - PDF con capa de texto  → devuelve el texto (0 consultas a la IA).
     *   - PDF escaneado/foto     → devuelve la franja rasterizada en data URL
     *                              (una imagen pequeña, ~1/4 de la página).
     *
     * @return array{texto:string, imagen:?string, fuente:string, ok:bool}
     */
    public function encabezado(string $rutaAbsoluta): array
    {
        if (!is_file($rutaAbsoluta)) {
            return ['texto' => '', 'imagen' => null, 'fuente' => 'ninguna', 'ok' => false];
        }

        $script = database_path('encabezado_pdf.py');
        $dir = storage_path('app/ia_encabezado_' . uniqid());
        @mkdir($dir, 0777, true);
        $png = $dir . DIRECTORY_SEPARATOR . 'encabezado.png';
        // La franja ya es pequeña, pero se reduce igual para que el modelo no
        // reciba una imagen de 2000 px de ancho (más tokens sin más precisión).
        $maxLado = (int) config('ia.max_lado_encabezado', 900);
        $prepararPagina = !config('ia.gate_vision', false);
        $dpiPagina = (int) config('ia.dpi', 150);
        $ladoPagina = (int) config('ia.max_lado', 1280);

        try {
            if (is_file($script)) {
                foreach (['python', 'py', 'python3'] as $binario) {
                    try {
                        $proceso = Process::timeout(60)
                            ->run([$binario, $script, $rutaAbsoluta, $png,
                                $prepararPagina ? 'pagina' : 'franja', (string) $dpiPagina, (string) $ladoPagina]);
                        $json = json_decode(trim($proceso->output()), true);
                        if (!is_array($json) || !($json['ok'] ?? false)) {
                            continue;
                        }

                        $texto = trim((string) ($json['texto'] ?? ''));
                        $imagen = null;
                        if ($texto === '' && is_file($png)) {
                            if (!empty($json['pagina_completa'])) {
                                [$imagen] = $this->prepararImagen($png, $ladoPagina);
                                $this->paginasPreparadas[$this->clavePagina($rutaAbsoluta, $dpiPagina, $ladoPagina)] = [
                                    'archivo' => 'pagina_1.png', 'data_url' => $imagen,
                                ];
                            } else {
                                [$imagen] = $this->prepararImagen($png, $maxLado);
                            }
                        }

                        return [
                            'texto' => $texto,
                            'imagen' => $imagen,
                            'fuente' => (string) ($json['fuente'] ?? 'texto'),
                            'ok' => true,
                        ];
                    } catch (\Throwable) {
                        // probar el siguiente binario de Python
                    }
                }
            }

            // Sin Python: solo se puede leer PDFs con capa de texto (Poppler).
            return $this->encabezadoConPoppler($rutaAbsoluta);
        } finally {
            $this->eliminarDirectorio($dir);
        }
    }

    /**
     * Respaldo: texto del encabezado con `pdftotext` (Poppler), si está instalado.
     */
    protected function encabezadoConPoppler(string $pdf): array
    {
        try {
            $proceso = Process::timeout(45)->run(['pdftotext', '-f', '1', '-l', '1', '-layout', $pdf, '-']);
            if (!$proceso->successful()) {
                return ['texto' => '', 'imagen' => null, 'fuente' => 'ninguna', 'ok' => false];
            }

            $texto = trim($proceso->output());
            if ($texto === '') {
                return ['texto' => '', 'imagen' => null, 'fuente' => 'ninguna', 'ok' => false];
            }

            // Solo las primeras líneas (el encabezado), no el cuerpo entero.
            $lineas = preg_split('/\R/u', $texto) ?: [];
            $texto = trim(implode("\n", array_slice($lineas, 0, 14)));

            return ['texto' => $texto, 'imagen' => null, 'fuente' => 'poppler', 'ok' => $texto !== ''];
        } catch (\Throwable) {
            return ['texto' => '', 'imagen' => null, 'fuente' => 'ninguna', 'ok' => false];
        }
    }

    protected function conPython(string $pdf, string $dir, int $maxPaginas, int $dpi, int $maxLado = 1100, bool $recortes = true): array
    {
        $script = database_path('render_pdf.py');
        $errores = [];

        foreach (['python', 'py', 'python3'] as $binario) {
            try {
                $proceso = Process::timeout(180)
                    ->run([
                        $binario, $script, $pdf, $dir, (string) $maxPaginas, (string) $dpi,
                        (string) $maxLado, $recortes ? '1' : '0',
                    ]);
                $salida = trim($proceso->output());
                $json = json_decode($salida, true);

                if (is_array($json) && ($json['ok'] ?? false)) {
                    return array_map(
                        fn (string $f) => $dir . DIRECTORY_SEPARATOR . $f,
                        $json['archivos'] ?? []
                    );
                }
                $errores[] = $binario . ': ' . ($json['error'] ?? $salida);
            } catch (\Throwable $e) {
                $errores[] = $binario . ': ' . $e->getMessage();
            }
        }

        return [];
    }

    protected function conGhostscript(string $pdf, string $dir, int $maxPaginas, int $dpi): array
    {
        $binarios = ['gswin64c', 'gswin32c', 'gs'];
        foreach ($binarios as $gs) {
            try {
                $proceso = Process::timeout(180)->run([
                    $gs,
                    '-sDEVICE=png16m',
                    '-r' . $dpi,
                    '-dFirstPage=1',
                    '-dLastPage=' . $maxPaginas,
                    '-dNOPAUSE',
                    '-dBATCH',
                    '-sOutputFile=' . $dir . DIRECTORY_SEPARATOR . 'pagina-%d.png',
                    $pdf,
                ]);
                if ($proceso->successful() || $proceso->exitCode() === 0) {
                    return glob($dir . DIRECTORY_SEPARATOR . 'pagina-*.png') ?: [];
                }
            } catch (\Throwable) {
                // probar el siguiente binario
            }
        }

        return [];
    }

    protected function conPoppler(string $pdf, string $dir, int $maxPaginas, int $dpi): array
    {
        foreach (['pdftoppm', 'pdfimages'] as $binario) {
            if ($binario === 'pdftoppm') {
                try {
                    $proceso = Process::timeout(180)->run([
                        'pdftoppm', '-png', '-r', (string) $dpi,
                        '-f', '1', '-l', (string) $maxPaginas,
                        $pdf, $dir . DIRECTORY_SEPARATOR . 'pg',
                    ]);
                    if ($proceso->successful() || $proceso->exitCode() === 0) {
                        return glob($dir . DIRECTORY_SEPARATOR . 'pg-*.png') ?: [];
                    }
                } catch (\Throwable) {
                    // siguiente
                }
            } else {
                // pdfimages extrae imágenes embebidas (memo escaneado).
                try {
                    $proceso = Process::timeout(180)->run([
                        'pdfimages', '-png', '-f', '1', '-l', (string) $maxPaginas,
                        $pdf, $dir . DIRECTORY_SEPARATOR . 'img',
                    ]);
                    if ($proceso->successful() || $proceso->exitCode() === 0) {
                        return glob($dir . DIRECTORY_SEPARATOR . 'img-*.png') ?: [];
                    }
                } catch (\Throwable) {
                    // siguiente
                }
            }
        }

        return [];
    }

    protected function eliminarDirectorio(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        foreach (glob($dir . DIRECTORY_SEPARATOR . '*') ?: [] as $archivo) {
            @unlink($archivo);
        }
        @rmdir($dir);
    }
}

<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

/**
 * Catálogos en una sola respuesta.
 *
 * Cada pantalla pedía 3–5 catálogos por separado y, con un servidor PHP de un
 * solo proceso, esas peticiones se atendían en fila. Aquí se reutiliza el
 * index() de cada controlador, así el contenido es idéntico al de su ruta propia.
 */
class CatalogoController extends Controller
{
    private const CATALOGOS = [
        '/epis' => EpiController::class,
        '/tipos-documento' => TipoDocumentoController::class,
        '/estados-documento' => EstadoDocumentoController::class,
        '/tipos-observacion' => TipoObservacionController::class,
        '/grados' => GradoController::class,
        '/cargos' => CargoController::class,
        '/roles' => RolController::class,
        '/comando-departamental' => ComandoDepartamentalController::class,
    ];

    public function index(): JsonResponse
    {
        $datos = [];
        foreach (self::CATALOGOS as $ruta => $controlador) {
            $datos[$ruta] = app($controlador)->index()->getData(true);
        }

        return response()->json($datos);
    }
}

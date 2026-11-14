<?php
namespace App\Http\Controllers;
use App\Services\ConfirmacionEnvio;
use Illuminate\Http\{JsonResponse, Request};
class ConfirmacionEnvioController extends Controller
{
    public function prepararSubsanacion(Request $request, int $id, \App\Services\SubsanacionDocumento $service): JsonResponse
    {
        return response()->json($service->preparar($request, $id))->header('Cache-Control','private, no-store');
    }

    public function subsanar(Request $request, int $id, \App\Services\SubsanacionDocumento $service): JsonResponse
    {
        return response()->json($service->registrar($request, $id));
    }
    public function preparar(Request $request, ConfirmacionEnvio $service): JsonResponse
    {
        return response()->json($service->preparar($request))->header('Cache-Control','private, no-store');
    }
}

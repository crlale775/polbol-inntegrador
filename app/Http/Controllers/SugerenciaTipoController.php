<?php
namespace App\Http\Controllers;
use App\Services\SugerenciasTipos;
use Illuminate\Http\{JsonResponse, Request};
class SugerenciaTipoController extends Controller
{
    public function decidir(Request $request, SugerenciasTipos $service): JsonResponse
    {
        return response()->json($service->decidir($request));
    }
}

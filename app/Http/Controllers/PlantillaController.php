<?php

namespace App\Http\Controllers;

use App\Models\Plantilla;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlantillaController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Plantilla::all());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'nombre' => 'required|string|max:150',
            'tipo_documento' => 'required|integer|exists:tipos_documento,id_tipo',
            'ruta_archivo' => 'required|string|max:500',
        ]);

        $plantilla = Plantilla::create($validated);
        return response()->json($plantilla, 201);
    }

    public function show(string|int $id): JsonResponse
    {
        $plantilla = Plantilla::findOrFail($id);
        return response()->json($plantilla);
    }

    public function archivo(string|int $id): \Symfony\Component\HttpFoundation\Response
    {
        $plantilla = Plantilla::findOrFail($id);
        $ruta = ltrim(str_replace('\\', '/', (string) $plantilla->ruta_archivo), '/');
        if (str_starts_with($ruta, 'storage/')) $ruta = substr($ruta, 8);
        abort_unless(preg_match('~^plantillas/[A-Za-z0-9_./-]+\.pdf$~D', $ruta)
            && !in_array('..', explode('/', $ruta), true), 404);
        $disk = \Illuminate\Support\Facades\Storage::disk('local');
        if (!$disk->exists($ruta)) $disk = \Illuminate\Support\Facades\Storage::disk('public');
        abort_unless($disk->exists($ruta), 404, 'La plantilla no está disponible. Contacte al Comando General.');
        return $disk->download($ruta, basename($ruta), ['Content-Type' => 'application/pdf', 'X-Content-Type-Options' => 'nosniff']);
    }

    public function update(Request $request, string|int $id): JsonResponse
    {
        $plantilla = Plantilla::findOrFail($id);

        $validated = $request->validate([
            'nombre' => 'sometimes|required|string|max:150',
            'tipo_documento' => 'sometimes|required|integer|exists:tipos_documento,id_tipo',
            'ruta_archivo' => 'sometimes|required|string|max:500',
        ]);

        $plantilla->update($validated);
        return response()->json($plantilla);
    }

    public function destroy(string|int $id): JsonResponse
    {
        $plantilla = Plantilla::findOrFail($id);
        $plantilla->delete();
        return response()->json(['message' => 'Eliminado correctamente']);
    }
}

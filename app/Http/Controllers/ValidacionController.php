<?php

namespace App\Http\Controllers;

use App\Models\Validacion;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ValidacionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Validacion::query();
        if ((int) $request->user()->id_rol === 1) {
            $query->whereHas('documento', fn (Builder $q) => $q->where('id_epi', $request->user()->id_epi));
        }

        if ($request->filled('id_documento')) {
            $filters = $request->validate(['id_documento' => ['required', 'integer', 'exists:documentos,id_documento']]);
            $query->where('id_documento', $filters['id_documento']);
        }

        return response()->json($query->orderByDesc('fecha')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id_documento' => 'required|integer|exists:documentos,id_documento',
            'id_regla' => 'required|integer|exists:reglas,id_regla',
            'resultado' => 'required|string|max:20|in:Correcto,Advertencia,Error',
            'mensaje' => 'required|string',
            'fecha' => 'nullable|date',
        ]);

        $validacion = Validacion::create($validated);
        return response()->json($validacion, 201);
    }

    public function show(string|int $id): JsonResponse
    {
        $validacion = Validacion::findOrFail($id);
        return response()->json($validacion);
    }

    public function update(Request $request, string|int $id): JsonResponse
    {
        $validacion = Validacion::findOrFail($id);

        $validated = $request->validate([
            'id_documento' => 'sometimes|required|integer|exists:documentos,id_documento',
            'id_regla' => 'sometimes|required|integer|exists:reglas,id_regla',
            'resultado' => 'sometimes|required|string|max:20|in:Correcto,Advertencia,Error',
            'mensaje' => 'sometimes|required|string',
            'fecha' => 'nullable|date',
        ]);

        $validacion->update($validated);
        return response()->json($validacion);
    }

    public function destroy(string|int $id): JsonResponse
    {
        $validacion = Validacion::findOrFail($id);
        $validacion->delete();
        return response()->json(['message' => 'Eliminado correctamente']);
    }
}

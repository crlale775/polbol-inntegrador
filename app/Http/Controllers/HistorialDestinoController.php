<?php

namespace App\Http\Controllers;

use App\Models\HistorialDestino;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HistorialDestinoController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'id_epi' => ['sometimes', 'integer', 'exists:epis,id_epi'],
            'id_oficial' => ['sometimes', 'integer', 'exists:oficiales,id_oficial'],
        ]);
        $query = HistorialDestino::query();
        if ((int) $request->user()->id_rol === 1) {
            $query->where('id_epi', $request->user()->id_epi);
        }
        if (isset($filters['id_epi'])) $query->where('id_epi', $filters['id_epi']);
        if (isset($filters['id_oficial'])) $query->where('id_oficial', $filters['id_oficial']);

        return response()->json($query->orderByDesc('fecha_inicio')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id_oficial' => 'required|integer|exists:oficiales,id_oficial',
            'id_epi' => 'required|integer|exists:epis,id_epi',
            'fecha_inicio' => 'required|date',
            'fecha_fin' => 'nullable|date|after_or_equal:fecha_inicio',
        ]);

        $historial = HistorialDestino::create($validated);
        return response()->json($historial, 201);
    }

    public function show(string|int $id): JsonResponse
    {
        $historial = HistorialDestino::findOrFail($id);
        return response()->json($historial);
    }

    public function update(Request $request, string|int $id): JsonResponse
    {
        $historial = HistorialDestino::findOrFail($id);

        $validated = $request->validate([
            'id_oficial' => 'sometimes|required|integer|exists:oficiales,id_oficial',
            'id_epi' => 'sometimes|required|integer|exists:epis,id_epi',
            'fecha_inicio' => 'sometimes|required|date',
            'fecha_fin' => 'nullable|date|after_or_equal:fecha_inicio',
        ]);

        $historial->update($validated);
        return response()->json($historial);
    }

    public function destroy(string|int $id): JsonResponse
    {
        $historial = HistorialDestino::findOrFail($id);
        $historial->delete();
        return response()->json(['message' => 'Eliminado correctamente']);
    }
}

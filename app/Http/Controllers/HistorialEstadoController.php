<?php

namespace App\Http\Controllers;

use App\Models\HistorialEstado;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HistorialEstadoController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'id_documento' => ['sometimes', 'integer', 'exists:documentos,id_documento'],
            'sin_documento' => ['sometimes', 'boolean'],
        ]);
        $query = HistorialEstado::with([
            'estadoAnterior',
            'estadoNuevo',
            'usuarioRelacion.epi',
        ]);
        // Las pantallas ya tienen el catálogo de documentos. Evitar repetir el
        // expediente en cada cambio, manteniendo el contrato completo por defecto.
        if (!$request->boolean('sin_documento')) {
            $query->with(['documento.tipoDocumento', 'documento.oficial.grado', 'documento.epi']);
        }

        if ((int) $request->user()->id_rol === 1) {
            $query->whereHas('documento', fn ($q) => $q->where('id_epi', $request->user()->id_epi));
        }

        if (isset($filters['id_documento'])) {
            $query->where('id_documento', $filters['id_documento']);
        }

        $historial = $query->orderBy('fecha', 'desc')->get();
        return response()->json($historial);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id_documento' => 'required|integer|exists:documentos,id_documento',
            'estado_anterior' => 'nullable|integer|exists:estados_documento,id_estado',
            'estado_nuevo' => 'required|integer|exists:estados_documento,id_estado',
            'usuario' => 'required|integer|exists:usuarios,id_usuario',
            'fecha' => 'nullable|date',
        ]);

        $validated['fecha'] = $validated['fecha'] ?? now();

        $historial = HistorialEstado::create($validated);
        return response()->json($historial, 201);
    }

    public function show(string|int $id): JsonResponse
    {
        $historial = HistorialEstado::findOrFail($id);
        return response()->json($historial);
    }

    public function update(Request $request, string|int $id): JsonResponse
    {
        $historial = HistorialEstado::findOrFail($id);

        $validated = $request->validate([
            'id_documento' => 'sometimes|required|integer|exists:documentos,id_documento',
            'estado_anterior' => 'nullable|integer|exists:estados_documento,id_estado',
            'estado_nuevo' => 'sometimes|required|integer|exists:estados_documento,id_estado',
            'usuario' => 'sometimes|required|integer|exists:usuarios,id_usuario',
            'fecha' => 'nullable|date',
        ]);

        $historial->update($validated);
        return response()->json($historial);
    }

    public function destroy(string|int $id): JsonResponse
    {
        $historial = HistorialEstado::findOrFail($id);
        $historial->delete();
        return response()->json(['message' => 'Eliminado correctamente']);
    }
}

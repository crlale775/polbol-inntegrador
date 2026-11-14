<?php

namespace App\Http\Controllers;

use App\Models\Revision;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RevisionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'id_documento' => ['sometimes', 'integer', 'exists:documentos,id_documento'],
            'sin_documento' => ['sometimes', 'boolean'],
        ]);
        // Las bandejas ya tienen la lista de documentos: sin_documento evita
        // repetir el expediente completo en cada revisión (contrato por defecto intacto).
        $query = Revision::with($request->boolean('sin_documento')
            ? ['revisor', 'tipoObservacion']
            : ['documento', 'revisor', 'tipoObservacion']);
        if ((int) $request->user()->id_rol === 1) {
            $query->whereHas('documento', fn ($q) => $q->where('id_epi', $request->user()->id_epi));
        }

        if (isset($filters['id_documento'])) {
            $query->where('id_documento', $filters['id_documento']);
        }

        $revisiones = $query->orderBy('fecha', 'desc')->get();
        return response()->json($revisiones);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id_documento' => 'required|exists:documentos,id_documento',
            'usuario_revisor' => 'required|exists:usuarios,id_usuario',
            'id_tipo_observacion' => 'nullable|exists:tipos_observacion,id_tipo',
            'nivel_revision' => 'required|string|max:50',
            'estado' => 'required|string|max:50',
            'observacion_libre' => 'nullable|string',
            'fecha' => 'nullable|date',
        ]);

        $revision = Revision::create($validated);
        return response()->json($revision, 201);
    }

    public function show(string|int $id): JsonResponse
    {
        $revision = Revision::with(['documento', 'revisor', 'tipoObservacion'])->findOrFail($id);
        return response()->json($revision);
    }

    public function update(Request $request, string|int $id): JsonResponse
    {
        $revision = Revision::findOrFail($id);

        $validated = $request->validate([
            'id_documento' => 'sometimes|required|exists:documentos,id_documento',
            'usuario_revisor' => 'sometimes|required|exists:usuarios,id_usuario',
            'id_tipo_observacion' => 'nullable|exists:tipos_observacion,id_tipo',
            'nivel_revision' => 'sometimes|required|string|max:50',
            'estado' => 'sometimes|required|string|max:50',
            'observacion_libre' => 'nullable|string',
            'fecha' => 'nullable|date',
        ]);

        $revision->update($validated);
        return response()->json($revision);
    }

    public function destroy(string|int $id): JsonResponse
    {
        $revision = Revision::findOrFail($id);
        $revision->delete();
        return response()->json(['message' => 'Revisión eliminada correctamente']);
    }
}

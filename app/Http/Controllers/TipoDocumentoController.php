<?php

namespace App\Http\Controllers;

use App\Models\TipoDocumento;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TipoDocumentoController extends Controller
{
    public function index(): JsonResponse
    {
        $memos = \App\Models\TipoMemo::select('id_tipo','activo','acceso_directo')->get()->keyBy('id_tipo');
        return response()->json(TipoDocumento::orderBy('nombre')->get()->map(function($tipo) use ($memos) {
            $memo = $memos->get($tipo->id_tipo);
            return array_merge($tipo->toArray(), ['activo'=>$memo?->activo ?? true,'acceso_directo'=>$memo?->acceso_directo ?? true]);
        }));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'nombre' => 'required|string|max:100|unique:tipos_documento,nombre',
        ]);

        $tipo = TipoDocumento::create($validated);
        return response()->json($tipo, 201);
    }

    public function show(string|int $id): JsonResponse
    {
        $tipo = TipoDocumento::findOrFail($id);
        return response()->json($tipo);
    }

    public function update(Request $request, string|int $id): JsonResponse
    {
        $tipo = TipoDocumento::findOrFail($id);

        $validated = $request->validate([
            'nombre' => 'sometimes|required|string|max:100|unique:tipos_documento,nombre,' . $id . ',id_tipo',
        ]);

        $tipo->update($validated);
        return response()->json($tipo);
    }

    public function destroy(string|int $id): JsonResponse
    {
        $tipo = TipoDocumento::findOrFail($id);
        $tipo->delete();
        return response()->json(['message' => 'Eliminado correctamente']);
    }
}

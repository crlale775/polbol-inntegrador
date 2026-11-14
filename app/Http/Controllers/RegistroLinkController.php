<?php

namespace App\Http\Controllers;

use App\Models\RegistroLink;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class RegistroLinkController extends Controller
{
    /**
     * Lista de links generados (panel interno).
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'estado' => ['nullable', 'in:activo,utilizado,cancelado'],
            'resumen' => ['sometimes','boolean'],
            'limite' => ['sometimes','integer','min:1','max:50'],
            'page' => ['sometimes','integer','min:1','max:1000000'],
        ]);
        $query = $request->boolean('resumen') ? RegistroLink::with(['rol','epi'])->withCount('solicitudes')
            : RegistroLink::with(['rol', 'epi', 'emisor', 'solicitudes']);

        if (isset($filters['estado'])) {
            $query->where('estado', $filters['estado']);
        }

        if ($request->boolean('resumen')) {
            $pagina = $query->orderByDesc('id_link')->paginate((int)($filters['limite'] ?? 8),['*'],'page',(int)($filters['page'] ?? 1));
            $activos = RegistroLink::where('estado','activo')->where(fn($q)=>$q->whereNull('fecha_expiracion')->orWhere('fecha_expiracion','>',now()))->count();
            return response()->json(['data'=>$pagina->items(),
                'meta'=>['pagina'=>$pagina->currentPage(),'ultima_pagina'=>$pagina->lastPage(),'total'=>$pagina->total()],
                'estadisticas'=>['activos'=>$activos],
            ]);
        }
        $links = $query->orderByDesc('id_link')->get();

        return response()->json($links);
    }

    /**
     * Genera un link de registro. El emisor (ej. Comando General) selecciona
     * el rol que recibirá la persona y (si aplica) la EPI asignada.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id_rol' => 'required|integer|exists:roles,id_rol',
            'id_epi' => 'nullable|integer|exists:epis,id_epi',
            'id_usuario_emisor' => 'nullable|integer|exists:usuarios,id_usuario',
        ]);

        // Regla de negocio: para el rol Secretario EPI el link requiere una EPI asignada.
        if ((int) $validated['id_rol'] === 1 && empty($validated['id_epi'])) {
            return response()->json([
                'message' => 'Para el rol seleccionado debe asignar una EPI.',
                'errors' => ['id_epi' => ['Debe seleccionar la EPI asignada para este rol.']],
            ], 422);
        }

        $link = RegistroLink::create([
            'token' => Str::random(32),
            'id_rol' => $validated['id_rol'],
            'id_epi' => $validated['id_epi'] ?? null,
            'id_usuario_emisor' => $request->user()->id_usuario,
            'estado' => 'activo',
            'creado_en' => now(),
        ]);

        return response()->json($link->load(['rol', 'epi', 'emisor']), 201);
    }

    /**
     * Datos públicos del link (los consume el formulario externo, sin login).
     */
    public function publico(string $token): JsonResponse
    {
        $link = RegistroLink::with(['rol', 'epi'])
            ->where('token', $token)
            ->first();

        if (!$link) {
            return response()->json(['message' => 'El enlace de registro no existe o ya no está disponible.'], 404);
        }

        if ($link->estado !== 'activo' || ($link->fecha_expiracion && $link->fecha_expiracion->lte(now()))) {
            return response()->json([
                'message' => 'Este enlace de registro ya fue utilizado o cancelado (' . $link->estado . ').',
                'estado' => $link->estado,
            ], 410);
        }

        return response()->json([
            'token' => $link->token,
            'estado' => $link->estado,
            'rol' => $link->rol?->nombre ?? 'Usuario',
            'rol_id' => $link->id_rol,
            'epi' => $link->epi?->nombre ?? null,
            'epi_id' => $link->id_epi,
        ]);
    }

    /**
     * Cancela un link (deja de aceptar registros).
     */
    public function cancelar(string|int $id): JsonResponse
    {
        $link = RegistroLink::findOrFail($id);
        $link->estado = 'cancelado';
        $link->save();

        return response()->json(['message' => 'Enlace cancelado correctamente.', 'link' => $link]);
    }
}

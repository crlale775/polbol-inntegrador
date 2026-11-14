<?php

namespace App\Http\Controllers;

use App\Models\Usuario;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class UsuarioController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'id_rol' => ['sometimes', 'integer', 'min:1'],
            'id_epi' => ['sometimes', 'integer', 'min:1'],
            'estado' => ['sometimes', 'boolean'],
        ]);
        $query = Usuario::with(['rol', 'epi']);

        if (isset($filters['id_rol'])) {
            $query->where('id_rol', $filters['id_rol']);
        }

        if (isset($filters['id_epi'])) {
            $query->where('id_epi', $filters['id_epi']);
        }

        if (isset($filters['estado'])) {
            $query->where('estado', $filters['estado']);
        }

        $usuarios = $query->orderBy('id_usuario')->get();
        return response()->json($usuarios);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id_rol' => 'required|exists:roles,id_rol',
            'id_epi' => 'nullable|exists:epis,id_epi',
            'usuario' => 'required|string|max:50|unique:usuarios,usuario',
            'password' => ['required', 'string', Password::min(12)->letters()->mixedCase()->numbers()->symbols()],
            'correo' => 'required|email|max:100|unique:usuarios,correo',
            'foto' => 'nullable|string|max:255',
            'estado' => 'nullable|boolean',
        ]);

        $validated['password'] = Hash::make($validated['password']);
        $validated['estado'] = $validated['estado'] ?? true;
        $validated['created_at'] = now();

        $usuario = Usuario::create($validated);
        $usuario->load(['rol', 'epi']);

        return response()->json($usuario, 201);
    }

    public function show(string|int $id): JsonResponse
    {
        $usuario = Usuario::with(['rol', 'epi'])->findOrFail($id);
        return response()->json($usuario);
    }

    public function update(Request $request, string|int $id): JsonResponse
    {
        $usuario = Usuario::findOrFail($id);

        $validated = $request->validate([
            'id_rol' => 'sometimes|required|exists:roles,id_rol',
            'id_epi' => 'nullable|exists:epis,id_epi',
            'usuario' => 'sometimes|required|string|max:50|unique:usuarios,usuario,' . $id . ',id_usuario',
            'password' => ['nullable', 'string', Password::min(12)->letters()->mixedCase()->numbers()->symbols()],
            'correo' => 'sometimes|required|email|max:100|unique:usuarios,correo,' . $id . ',id_usuario',
            'foto' => 'nullable|string|max:255',
            'estado' => 'nullable|boolean',
        ]);

        if (!empty($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $usuario->update($validated);
        $usuario->load(['rol', 'epi']);

        return response()->json($usuario);
    }

    public function destroy(string|int $id): JsonResponse
    {
        // Regla institucional de negocio: NUNCA eliminar físicamente un usuario, solo desactivar
        $usuario = Usuario::findOrFail($id);
        $usuario->estado = false;
        $usuario->save();

        return response()->json([
            'message' => 'Usuario desactivado correctamente en el sistema (baja lógica)',
            'usuario' => $usuario->load(['rol', 'epi']),
        ]);
    }

    public function resetPassword(Request $request, string|int $id): JsonResponse
    {
        $usuario = Usuario::findOrFail($id);
        $validated = $request->validate([
            'password' => ['required', 'string', 'max:255', Password::min(12)->letters()->mixedCase()->numbers()->symbols()],
        ]);
        $newPassword = $validated['password'];
        
        $usuario->password = Hash::make($newPassword);
        $usuario->save();

        return response()->json([
            'message' => 'Contraseña restablecida exitosamente',
            'usuario' => $usuario->load(['rol', 'epi']),
        ]);
    }

    /**
     * Subida de foto de perfil del usuario autenticado (secretario, revisor, etc.).
     * Guarda la imagen en storage/app/public/fotos/usuarios y actualiza el campo foto.
     */
    public function subirFoto(Request $request): JsonResponse
    {
        $request->validate([
            'id_usuario' => ['required', 'integer', 'exists:usuarios,id_usuario'],
            'foto' => 'required|image|mimes:jpg,jpeg,png|max:2048',
        ]);

        $idUsuario = $request->input('id_usuario');
        if (!$idUsuario) {
            return response()->json(['message' => 'No se identificó al usuario.'], 422);
        }

        $usuario = Usuario::findOrFail($idUsuario);
        abort_unless((int) $request->user()->id_usuario === (int) $usuario->id_usuario
            || (int) $request->user()->id_rol === 3, 403, 'Solo puede actualizar su propia fotografía.');

        $archivo = $request->file('foto');
        $nombre = 'usuario_' . $usuario->id_usuario . '_' . time() . '.' . $archivo->getClientOriginalExtension();
        $ruta = $archivo->storeAs('fotos/usuarios', $nombre, 'local');

        $usuario->foto = $ruta;
        $usuario->save();

        return response()->json([
            'message' => 'Foto de perfil actualizada correctamente',
            'ruta' => $ruta,
            'usuario' => $usuario->load(['rol', 'epi']),
        ]);
    }

    /** Sirve fotos de perfiles solo a usuarios autorizados por cuenta o EPI. */
    public function foto(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $validated = $request->validate(['foto' => ['required', 'string', 'max:255']]);
        $ruta = ltrim(str_replace('\\', '/', $validated['foto']), '/');
        abort_unless(str_starts_with($ruta, 'fotos/') || str_starts_with($ruta, 'oficiales/'), 404);
        abort_unless(preg_match('/\.(?:jpe?g|png)$/i', $ruta) === 1, 404);

        $usuario = Usuario::where('foto', $ruta)->first();
        $oficial = $usuario ? null : \App\Models\Oficial::where('foto', $ruta)->first();
        abort_unless($usuario || $oficial, 404);

        $rol = (int) $request->user()->id_rol;
        if ($usuario) {
            $propio = (int) $usuario->id_usuario === (int) $request->user()->id_usuario;
            $secretarioDelMando = $rol === 2 && (int) $usuario->id_rol === 1;
            abort_unless($rol === 3 || $propio || $secretarioDelMando, 404);
        } else {
            abort_unless($rol !== 1 || (int) $oficial->id_epi === (int) $request->user()->id_epi, 404);
        }

        $disk = \Illuminate\Support\Facades\Storage::disk('local');
        if (!$disk->exists($ruta)) {
            $disk = \Illuminate\Support\Facades\Storage::disk('public');
        }
        abort_unless($disk->exists($ruta), 404);
        $mime = str_ends_with(strtolower($ruta), '.png') ? 'image/png' : 'image/jpeg';

        return $disk->response($ruta, basename($ruta), [
            'Content-Type' => $mime,
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}

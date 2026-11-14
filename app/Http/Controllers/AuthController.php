<?php

namespace App\Http\Controllers;

use App\Models\Sesion;
use App\Models\Usuario;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    /**
     * Autenticación institucional OFBOL.
     * Verifica credenciales contra la tabla usuarios (hash bcrypt),
     * rechaza cuentas desactivadas y registra la sesión en la tabla sesiones.
     */
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'usuario' => ['required', 'string', 'max:50'],
            'password' => ['required', 'string', 'max:255'],
        ]);

        $usuario = Usuario::whereRaw('LOWER(usuario) = ?', [mb_strtolower(trim($validated['usuario']))])
            ->with(['rol', 'epi'])
            ->first();

        if (! $usuario || ! Hash::check($validated['password'], $usuario->password)) {
            return response()->json(['message' => 'Usuario o contraseña incorrectos.'], 401);
        }

        if (! $usuario->estado) {
            return response()->json(['message' => 'Usuario o contraseña incorrectos.'], 401);
        }

        $sesion = Sesion::create([
            'id_usuario' => $usuario->id_usuario,
            'ip' => $request->ip() ?: '127.0.0.1',
            'fecha_inicio' => now(),
        ]);

        Auth::login($usuario);
        $request->session()->regenerate();
        $request->session()->put('ofbol_sesion_id', $sesion->id_sesion);

        return response()->json($usuario->load(['rol', 'epi']));
    }

    public function actual(Request $request): JsonResponse
    {
        return response()->json($request->user()->load(['rol', 'epi']));
    }

    public function logout(Request $request): JsonResponse
    {
        Sesion::where('id_sesion', $request->session()->get('ofbol_sesion_id'))
            ->where('id_usuario', $request->user()->id_usuario)
            ->whereNull('fecha_fin')
            ->update(['fecha_fin' => now()]);

        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Sesión cerrada correctamente.']);
    }
}

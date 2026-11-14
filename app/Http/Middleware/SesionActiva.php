<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class SesionActiva
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user() || ! $request->user()->estado) {
            if ($request->user()) {
                Auth::logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json(['message' => 'Su sesión venció. Inicie sesión nuevamente.'], 401);
        }

        return $next($request);
    }
}

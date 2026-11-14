<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        $response->headers->set('Cross-Origin-Opener-Policy', 'same-origin');
        // El visor institucional carga PDF autenticados en un iframe propio.
        // Las páginas HTML siguen sin poder incrustarse en ningún sitio.
        $pdf = str_starts_with(strtolower($response->headers->get('Content-Type', '')), 'application/pdf');
        $ancestors = $pdf ? "'self'" : "'none'";
        $response->headers->set('Content-Security-Policy', "base-uri 'self'; form-action 'self'; frame-ancestors {$ancestors}; object-src 'none'");

        if ($request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}

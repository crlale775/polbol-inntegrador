<?php
// Equivalente local de las restricciones de public/.htaccess. No modificar vendor.
$publicPath = dirname(__DIR__).'/public';
$uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
if (str_contains($uri, "\0")) { http_response_code(404); return true; }
$segments = [];
foreach (explode('/', str_replace('\\', '/', $uri)) as $part) {
    if ($part === '' || $part === '.') continue;
    if ($part === '..') { array_pop($segments); continue; }
    if (rtrim($part, '. ') !== $part) { http_response_code(404); return true; }
    $segments[] = $part;
}
$normalized = '/'.implode('/', $segments);
if (preg_match('~^/storage/(?:documentos|solicitudes|fotos|oficiales)(?:/|$)~i', $normalized)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo 'Archivo no disponible.';
    return true;
}
$resolved = realpath($publicPath.$normalized);
if ($uri !== '/' && $resolved && is_file($resolved)) {
    $inside = static fn (string $file, string $root): bool => str_starts_with(
        strtolower(str_replace('\\','/', $file)), rtrim(strtolower(str_replace('\\','/', $root)), '/').'/');
    $publicReal = realpath($publicPath);
    $templates = realpath(dirname(__DIR__).'/storage/app/public/plantillas');
    if (!$inside($resolved, $publicReal) && (!$templates || !$inside($resolved, $templates))) {
        http_response_code(404); return true;
    }
    return false;
}
require $publicPath.'/index.php';

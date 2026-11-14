param(
    [ValidateRange(1024,65535)][int]$Port = 8001,
    [string]$Php = 'C:\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe',
    [switch]$PrepararIA
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$publicRoot = Join-Path $projectRoot 'public'
$router = Join-Path $PSScriptRoot 'server-router.php'
$opcache = Join-Path (Split-Path -Parent $Php) 'ext\php_opcache.dll'
foreach($required in @($Php,$router,$opcache)) {
    if(!(Test-Path -LiteralPath $required -PathType Leaf)){throw "No se encontró el archivo requerido: $required"}
}
$listener = New-Object System.Net.Sockets.TcpClient
try { $listener.Connect('127.0.0.1',$Port); $occupied = $true } catch { $occupied = $false } finally { $listener.Dispose() }
if($occupied){throw "El puerto $Port ya está en uso. Detenga ese servidor antes de iniciar otro."}
if($PrepararIA){ & (Join-Path $PSScriptRoot 'preparar-ia.ps1') -Php $Php }
$arguments = @(
    '-d', "zend_extension=$opcache",
    '-d', 'opcache.enable_cli=1',
    '-d', 'opcache.validate_timestamps=1',
    '-d', 'opcache.revalidate_freq=0',
    '-d', 'opcache.file_update_protection=0',
    '-d', 'opcache.memory_consumption=128',
    '-d', 'opcache.max_accelerated_files=20000',
    '-S', "127.0.0.1:$Port",
    '-t', $publicRoot,
    $router
)
Write-Host "Policía Boliviana: http://127.0.0.1:$Port/ (OPcache activo; Ctrl+C para detener)"
Push-Location -LiteralPath $publicRoot
try { & $Php @arguments } finally { Pop-Location }

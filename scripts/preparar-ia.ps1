param(
    [string]$Php = 'C:\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe',
    [string]$Lms = "$env:USERPROFILE\.lmstudio\bin\lms.exe"
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
foreach($file in @($Php,$Lms)) {
    if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw "No se encontró: $file"}
}
Push-Location -LiteralPath $projectRoot
try {
    $json = & $Php -r 'require "vendor/autoload.php"; $app=require "bootstrap/app.php"; $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap(); echo json_encode(["url"=>config("ia.url"),"modelo"=>config("ia.model")]);'
    if($LASTEXITCODE -ne 0){throw 'No se pudo leer la configuración local de IA.'}
    $settings = $json | ConvertFrom-Json
    $uri = [uri]$settings.url
    if($uri.Scheme -ne 'http' -or $uri.Host -notin @('localhost','127.0.0.1','[::1]')) {
        throw 'Este asistente inicia solamente el servidor LM Studio local configurado.'
    }
    & $Lms server start --port $uri.Port
    if($LASTEXITCODE -ne 0){throw 'No se pudo iniciar LM Studio.'}
    $loaded = @((& $Lms ps --json) | ConvertFrom-Json)
    $current = $loaded | Where-Object { $_.identifier -eq $settings.modelo -or $_.modelKey -eq $settings.modelo }
    if($current) {
        Write-Host 'El modelo configurado ya está en memoria; se conserva su sesión.'
    } else {
        # load utiliza los pesos existentes. No ejecuta descargas ni cambia IA_MODEL.
        & $Lms load $settings.modelo --gpu max --context-length 4096 --parallel 1 --ttl 3600 -y
        if($LASTEXITCODE -ne 0){throw 'No se pudo cargar el modelo existente. Revise LM Studio.'}
    }
    Write-Host 'IA local preparada. La primera revisión ya no necesita cargar los pesos.'
} finally { Pop-Location }

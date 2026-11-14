[CmdletBinding(SupportsShouldProcess)]
param([string]$ManifestPath = '')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'storage\app\public'))
$targetRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'storage\app\private'))
$manifest = @()
$collisions = @()
foreach($folder in @('documentos','solicitudes','fotos','oficiales')) {
    $sourceFolder = Join-Path $sourceRoot $folder
    if(!(Test-Path -LiteralPath $sourceFolder -PathType Container)){continue}
    foreach($file in Get-ChildItem -LiteralPath $sourceFolder -Recurse -File) {
        if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'No se moverán archivos enlazados.'}
        $source = [IO.Path]::GetFullPath($file.FullName)
        if(!$source.StartsWith($sourceRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Origen fuera del almacenamiento público.'}
        $relative = $source.Substring($sourceRoot.Length+1)
        $target = [IO.Path]::GetFullPath((Join-Path $targetRoot $relative))
        if(!$target.StartsWith($targetRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Destino fuera del almacenamiento privado.'}
        if(Test-Path -LiteralPath $target){$collisions += $relative;continue}
        $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
        if($PSCmdlet.ShouldProcess($relative,'Mover al almacenamiento privado conservando el original')) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
            Move-Item -LiteralPath $source -Destination $target
            if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $hash){throw 'La verificación de integridad del archivo falló.'}
            $manifest += @{ruta=$relative;sha256=$hash;origen=$source;destino=$target}
        }
    }
}
$result = @{movidos=$manifest.Count;colisiones=$collisions;archivos=$manifest}
if($ManifestPath){$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ManifestPath -Encoding utf8}
@{movidos=$manifest.Count;colisiones=$collisions} | ConvertTo-Json -Depth 3
if($collisions.Count){throw 'Se conservaron archivos públicos por colisión de nombre. Revise el manifiesto antes de moverlos.'}

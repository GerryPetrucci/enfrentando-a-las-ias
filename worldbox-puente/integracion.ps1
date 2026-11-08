<#
.SYNOPSIS
  Compila, instala y opera la DLL unica PuenteWorldBox.dll (biblioteca W4 + integracion con WorldBox 0.51.2).

.DESCRIPTION
  Acciones:
    compilar   src\*.cs + integracion\*.cs -> salida\mod\PuenteWorldBox.dll (csc de .NET Framework, C# 5, contra las DLL del juego)
    instalar   copia la DLL a worldbox_Data\StreamingAssets\mods\ (y quita PuenteHola si esta)
    cerrar     cierra el juego (CloseMainWindow; Stop-Process solo si no cierra en 20 s)
    abrir      lanza el juego por Steam y espera a que el servidor del puente responda
    reiniciar  compilar + cerrar + instalar + abrir
    token      imprime la ruta del archivo del token (no el token)
  Nada del juego se modifica salvo anadir/quitar la DLL propia en mods\.

.PARAMETER Juego
  Carpeta de instalacion de WorldBox. Por defecto la de Steam estandar.
#>
param(
    [Parameter(Position = 0)][ValidateSet('compilar', 'instalar', 'cerrar', 'abrir', 'reiniciar', 'token')][string]$Accion = 'compilar',
    [string]$Juego = 'C:\Program Files (x86)\Steam\steamapps\common\worldbox'
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$man = Join-Path $Juego 'worldbox_Data\Managed'
$mods = Join-Path $Juego 'worldbox_Data\StreamingAssets\mods'
$datos = Join-Path $env:USERPROFILE 'AppData\LocalLow\mkarpenko\WorldBox'
$salida = Join-Path $raiz 'salida\mod'   # la misma ruta que genera construir.ps1 -Referencias
$dll = Join-Path $salida 'PuenteWorldBox.dll'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

function Compilar {
    if (-not (Test-Path -LiteralPath $csc)) { throw "No se encontro csc.exe: $csc" }
    New-Item -ItemType Directory -Force -Path $salida | Out-Null
    $fuentes = @(Get-ChildItem -LiteralPath (Join-Path $raiz 'src') -Filter '*.cs' | ForEach-Object { $_.FullName })
    $fuentes += @(Get-ChildItem -LiteralPath (Join-Path $raiz 'integracion') -Filter '*.cs' -Recurse | ForEach-Object { $_.FullName })
    $refs = 'mscorlib', 'netstandard', 'System', 'System.Core', 'UnityEngine.CoreModule', 'UnityEngine.SharedInternalsModule', 'Assembly-CSharp' |
        ForEach-Object { "/reference:$(Join-Path $man ($_ + '.dll'))" }
    & $csc /nologo /noconfig /nostdlib+ /target:library /langversion:5 /optimize+ /debug:pdbonly /warn:4 /nowarn:1701 /codepage:65001 "/out:$dll" @refs @fuentes | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Fallo la compilacion (csc salio con $LASTEXITCODE)." }
    Write-Host "OK  $dll"
}
function Cerrar {
    $p = Get-Process worldbox -ErrorAction SilentlyContinue
    if (-not $p) { Write-Host 'el juego no estaba abierto'; return }
    foreach ($x in $p) {
        [void]$x.CloseMainWindow()
        $t = 0; while (-not $x.HasExited -and $t -lt 20) { Start-Sleep 1; $t++; $x.Refresh() }
        if (-not $x.HasExited) { Stop-Process -Id $x.Id -Force; Write-Host "forzado el cierre de $($x.Id)" } else { Write-Host "cerrado en ${t}s" }
    }
}
function Instalar {
    if (-not (Test-Path -LiteralPath $dll)) { throw 'Falta compilar.' }
    Copy-Item -LiteralPath $dll -Destination (Join-Path $mods 'PuenteWorldBox.dll') -Force
    foreach ($viejo in 'PuenteHola.dll') { Remove-Item -LiteralPath (Join-Path $mods $viejo) -ErrorAction SilentlyContinue }
    Write-Host "OK instalado en $mods"
}
function Abrir {
    Remove-Item -LiteralPath (Join-Path $datos 'puente-token.txt') -ErrorAction SilentlyContinue
    Start-Process 'steam://run/1206560'
    $t = 0
    while ($t -lt 120) {
        Start-Sleep 1; $t++
        if (Test-Path -LiteralPath (Join-Path $datos 'puente-token.txt')) { break }
    }
    Write-Host "token presente a los ${t}s"
}

switch ($Accion) {
    'compilar' { Compilar }
    'instalar' { Instalar }
    'cerrar' { Cerrar }
    'abrir' { Abrir }
    'reiniciar' { Compilar; Cerrar; Instalar; Abrir }
    'token' { Write-Host (Join-Path $datos 'puente-token.txt') }
}


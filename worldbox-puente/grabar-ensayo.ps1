# Lanza una partida de ENSAYO con bots en modo grabacion (sin costo, sin API). Uso, desde la raiz del repo:
#   .\worldbox-puente\grabar-ensayo.ps1                 (ensayo corto: 6 turnos de 50 s a x3, unos 3 min)
#   .\worldbox-puente\grabar-ensayo.ps1 -Turnos 24      (partida completa con bots, unos 8 min)
#   .\worldbox-puente\grabar-ensayo.ps1 -Zoom 80        (zoom unico en lugar del automatico)
# Requisitos: WorldBox abierto con el puente (.\worldbox-puente\integracion.ps1 abrir) y `node src/servidor.js` en otra terminal.
# El token del puente se lee del archivo local y NO se imprime.
param([int]$Turnos = 6, [int]$Cuenta = 15, [string]$Velocidad = 'x3', [int]$LecturaMs = 3000, [int]$Zoom = 0, [switch]$Manual)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$archivoToken = Join-Path $env:USERPROFILE 'AppData\LocalLow\mkarpenko\WorldBox\puente-token.txt'
if (-not (Test-Path $archivoToken)) { throw 'No hay token del puente: abre WorldBox con .\worldbox-puente\integracion.ps1 abrir' }
# Borra el estado en vivo de la partida anterior: si no, la capa de OBS muestra su resultado hasta que empieza la nueva.
Remove-Item (Join-Path (Get-Location) 'data\vivo\worldbox.json') -ErrorAction SilentlyContinue
$env:WORLDBOX_PUENTE_URL = 'http://127.0.0.1:47600'
$env:WORLDBOX_PUENTE_TOKEN = (Get-Content -Raw $archivoToken).Trim()
$opciones = @('src/worldbox/correr.js', '--adaptador=http', '--participantes=bot-expansionista,bot-voraz', '--partidas=1', '--grabacion',
  "--cuenta=$Cuenta", "--turnos=$Turnos", "--velocidad=$Velocidad", "--lectura-ms=$LecturaMs", '--timeout-puente-ms=60000', '--salida=data/pruebas/worldbox/ensayo-grabacion')
if ($Zoom -gt 0) { $opciones += "--zoom=$Zoom" }
if ($Manual) { $opciones += '--manual' }
$ErrorActionPreference = 'Continue'   # node escribe sus avisos por stderr: no deben cortar el script
try { & node @opciones } finally { Remove-Item Env:\WORLDBOX_PUENTE_TOKEN, Env:\WORLDBOX_PUENTE_URL -ErrorAction SilentlyContinue }


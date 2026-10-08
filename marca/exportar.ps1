# Renderiza las plantillas de marca/plantillas a PNG en marca/exportados, con Edge o Chrome en modo headless.
#   powershell -File marca\exportar.ps1              (todas las piezas)
#   powershell -File marca\exportar.ps1 -Pieza og    (solo una)
# Necesita internet la primera vez: las tipografias (Barlow Condensed e Inter) se cargan de Google Fonts.

param([string]$Pieza = '')

$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path

$navegador = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $navegador) { throw 'No encontre Edge ni Chrome.' }

# plantilla, ancho, alto, archivo de salida
$piezas = @(
  @('avatar',         1080, 1080, 'avatar-1080.png'),
  @('banner-youtube', 2560, 1440, 'banner-youtube-2560x1440.png'),
  @('banner-x',       1500,  500, 'banner-x-1500x500.png'),
  @('og',             1200,  630, 'og-1200x630.png'),
  @('teaser',         1080, 1350, 'teaser-1080x1350.png'),
  @('portada',        1080, 1920, 'portada-ejemplo-1080x1920.png'),
  @('logo-horizontal',1600,  500, 'logo-horizontal-1600x500.png')
)

$salida = Join-Path $aqui 'exportados'
New-Item -ItemType Directory -Force $salida | Out-Null
$perfil = Join-Path ([IO.Path]::GetTempPath()) 'marca-perfil'

foreach ($p in $piezas) {
  $nombre, $w, $h, $archivo = $p
  if ($Pieza -and $Pieza -ne $nombre) { continue }
  $url = ([Uri](Join-Path $aqui "plantillas\$nombre.html")).AbsoluteUri
  $destino = Join-Path $salida $archivo
  # Edge informa por stderr ("N bytes written"); con 'Stop' PowerShell 5.1 lo toma por error.
  $ErrorActionPreference = 'Continue'
  & $navegador --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 `
    --user-data-dir=$perfil --window-size="$w,$h" --virtual-time-budget=10000 `
    --screenshot=$destino $url 2>$null | Out-Null
  $ErrorActionPreference = 'Stop'
  if (-not (Test-Path $destino)) { throw "No se genero $archivo" }
  Write-Host "  $archivo"
}

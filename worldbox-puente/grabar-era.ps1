<#
.SYNOPSIS
  Lanzador para humanos de la practica y la grabacion del formato «era» de WorldBox (sin modelos de pago, sin API).

.DESCRIPTION
  Hace por ti lo que habria que recordar: lee el token del puente SIN imprimirlo, abre o comprueba el juego, levanta el servidor de la capa
  de OBS si no esta, arma el comando de node y te explica en pantalla que va a pasar y que debes hacer tu en OBS. Guia completa:
  docs/worldbox-era-practica.md

  Modos (-Modo):
    corto        ensayo de ~4 min con bots (muro en el anio 60). Con -Respuestas usa tus respuestas guardadas en vez de bots.
    completo     partida completa de ~37 min (muro 500, limite 650). Bots, o tus respuestas con -Respuestas.
    respuestas   partida completa con las respuestas que pegaste de tus chats (-Respuestas es obligatorio). Con -Calendario corto, un ensayo.
    asistido     como "respuestas", pero la partida SE PAUSA en cada intervencion, te escribe el prompt con el estado y espera tu Enter.
    mundo        solo mirar el mapa: crea el mundo con tus parametros y lo deja pausado para explorarlo (no juega).
    verificar    revisa tus respuestas guardadas SIN abrir el juego (el error exacto de cada una).

.EXAMPLE
  .\worldbox-puente\grabar-era.ps1 -Modo corto -SinGrabacion
  .\worldbox-puente\grabar-era.ps1 -Modo respuestas -Respuestas respuestas-era\prueba1 -Calendario corto
  .\worldbox-puente\grabar-era.ps1 -Modo mundo -Tamano large -Plantilla pancake -AnchoMuro 8
  .\worldbox-puente\grabar-era.ps1 -Modo respuestas -Respuestas respuestas-era\prueba1 -Manual -Interfaz
  .\worldbox-puente\grabar-era.ps1 -Modo respuestas -Respuestas respuestas-era\prueba1 -CamaraAuto      # zoom automatico (por omision la camara es tuya)
  .\worldbox-puente\grabar-era.ps1 -Modo corto -SinGrabacion -SinVigilante -SinUnicoReino            # pruebas: sin vigilante del muro ni reino unico (por omision estan activos)
#>
param(
  [ValidateSet('corto', 'completo', 'respuestas', 'asistido', 'mundo', 'verificar')][string]$Modo = 'corto',
  [string]$Respuestas,
  [ValidateSet('', 'corto', 'completo')][string]$Calendario = '',
  [string]$ModeloA, [string]$ModeloB,
  # Nombre y color de cada reino (E10): por omision el nombre visible del modelo y el color de su paleta (web/paleta.js)
  [string]$NombreReinoA, [string]$NombreReinoB, [string]$ColorA, [string]$ColorB, [switch]$ColoresJuego, [switch]$SinCapaReinos,
  # Escenario
  [ValidateSet('', 'tiny', 'small', 'standard', 'large', 'huge')][string]$Tamano = '',
  [ValidateSet('', 'continent', 'boring_plains', 'pancake')][string]$Plantilla = '',
  [string]$MapaGuardado, [int]$AnchoMuro = -1, [int]$Minerales = 0,
  [int]$AnioMuro = 0, [int]$AnioLimite = 0, [string]$Intervenciones, [string]$IntervencionesGuerra,
  [string]$VelocidadDesarrollo, [string]$VelocidadGuerra, [int]$Semilla = 7, [int]$Anios = 0,
  # Presentacion
  [switch]$SinGrabacion, [int]$Cuenta = -1, [int]$AvisoMs = -1, [int]$LecturaMs = -1, [int]$FinMs = -1, [int]$Zoom = 0,
  [switch]$SinCamara, [switch]$CamaraAuto, [switch]$Interfaz, [switch]$Manual,
  # Proteccion del 1 vs 1 (E9): el vigilante del muro y el reino unico estan ACTIVOS por omision; solo para pruebas se apagan.
  [switch]$SinVigilante, [switch]$SinUnicoReino, [ValidateSet('', 'devolver', 'eliminar', 'observar')][string]$VigilanteModo = '',
  # Otros
  [switch]$Simulado, [switch]$IgnorarInvalidas, [switch]$SinServidor, [string[]]$Extra = @()
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$PUERTO_CAPA = 4321

function Escribe($t, $color = 'Gray') { Write-Host $t -ForegroundColor $color }
function PuertoAbierto($p) { try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); return $true } catch { return $false } }

# ---------------------------------------------------------------- 1. verificar: no necesita juego
if ($Modo -eq 'verificar') {
  if (-not $Respuestas) { throw 'Falta -Respuestas <carpeta con a\ y b\>.' }
  & node herramientas/worldbox-era-verificar.mjs "--respuestas=$Respuestas"
  exit $LASTEXITCODE
}
if (($Modo -in 'respuestas', 'asistido') -and -not $Respuestas) { throw "El modo '$Modo' necesita -Respuestas <carpeta con a\ y b\> (o la conversacion.json de una partida anterior)." }

# ---------------------------------------------------------------- 2. parametros -> opciones de node
$calendarioCorto = ($Modo -eq 'corto' -and $Calendario -ne 'completo') -or ($Calendario -eq 'corto')
$necesitaJuego = -not $Simulado
$grabando = (-not $SinGrabacion) -and ($Modo -ne 'mundo')
$comun = @()
if ($Tamano) { $comun += "--tamano=$Tamano" }
if ($Plantilla) { $comun += "--plantilla=$Plantilla" }
if ($MapaGuardado) { $comun += "--mapa-guardado=$MapaGuardado" }
if ($AnchoMuro -ge 0) { $comun += "--ancho-muro=$AnchoMuro" }
if ($Minerales -gt 0) { $comun += "--cantidad-minerales=$Minerales" }
if ($VelocidadDesarrollo) { $comun += "--velocidad-desarrollo=$VelocidadDesarrollo" }
if ($VelocidadGuerra) { $comun += "--velocidad-guerra=$VelocidadGuerra" }
if ($SinVigilante) { $comun += '--sin-vigilante' }
if ($VigilanteModo -and -not $SinVigilante) { $comun += "--vigilante-modo=$VigilanteModo" }
if ($SinUnicoReino) { $comun += '--sin-unico-reino' }
$opsCal = @()
if ($calendarioCorto) { $opsCal = @('--anio-muro=60', '--anio-limite=90', '--intervenciones=20,35,50', '--intervenciones-guerra=1,3', '--anios-espera-rasgos=5') }
if ($AnioMuro -gt 0) { $opsCal = $opsCal | Where-Object { $_ -notmatch '^--anio-muro=' }; $opsCal += "--anio-muro=$AnioMuro" }
if ($AnioLimite -gt 0) { $opsCal = $opsCal | Where-Object { $_ -notmatch '^--anio-limite=' }; $opsCal += "--anio-limite=$AnioLimite" }
if ($Intervenciones) { $opsCal = $opsCal | Where-Object { $_ -notmatch '^--intervenciones=' }; $opsCal += "--intervenciones=$Intervenciones" }
if ($IntervencionesGuerra) { $opsCal = $opsCal | Where-Object { $_ -notmatch '^--intervenciones-guerra=' }; $opsCal += "--intervenciones-guerra=$IntervencionesGuerra" }

if ($Modo -eq 'mundo') {
  $guion = 'herramientas/worldbox-era-mundo.mjs'
  $args2 = @($guion, "--adaptador=$(if ($Simulado) { 'simulado' } else { 'http' })", "--semilla=$Semilla") + $comun
  if ($Respuestas) { $args2 += "--respuestas=$Respuestas" }
  if ($Anios -gt 0) { $args2 += "--anios=$Anios" }
  if ($Zoom -gt 0) { $args2 += "--zoom=$Zoom" }
} else {
  $args2 = @('src/worldbox/correr.js', '--formato=era', "--adaptador=$(if ($Simulado) { 'simulado' } else { 'http' })", '--partidas=1', "--semilla=$Semilla") + $comun + $opsCal
  if ($Respuestas) {
    $args2 += "--respuestas=$Respuestas"
    if ($ModeloA) { $args2 += "--modelo-a=$ModeloA" }
    if ($ModeloB) { $args2 += "--modelo-b=$ModeloB" }
    if ($Modo -eq 'asistido') { $args2 += '--asistido' }
    if ($IgnorarInvalidas) { $args2 += '--ignorar-invalidas' }
  } else { $args2 += '--participantes=bot-era-militar,bot-era-economico', '--salida=data/pruebas/worldbox' }
  if ($grabando) {
    $args2 += '--grabacion'
    $args2 += "--cuenta=$(if ($Cuenta -ge 0) { $Cuenta } elseif ($calendarioCorto) { 3 } else { 15 })"
    $args2 += "--aviso-ms=$(if ($AvisoMs -ge 0) { $AvisoMs } elseif ($calendarioCorto) { 2000 } else { 6000 })"
    $args2 += "--lectura-ms=$(if ($LecturaMs -ge 0) { $LecturaMs } elseif ($calendarioCorto) { 1500 } else { 4000 })"
    $args2 += "--fin-ms=$(if ($FinMs -ge 0) { $FinMs } elseif ($calendarioCorto) { 3000 } else { 8000 })"
    # Por omision la camara es TUYA (el script no la toca). -CamaraAuto activa el zoom automatico por fase (enfoque a la faccion activa).
    if ($CamaraAuto -and $Zoom -gt 0) { $args2 += "--zoom=$Zoom" }
    if (-not $CamaraAuto) { $args2 += '--sin-camara' }
    if ($Interfaz) { $args2 += '--interfaz-visible' }
    if ($Manual) { $args2 += '--manual' }
  } elseif ($Manual -or $CamaraAuto -or $Interfaz) { Escribe 'Aviso: -Manual, -CamaraAuto e -Interfaz solo valen con grabacion (quita -SinGrabacion).' Yellow }
}
if ($NombreReinoA) { $args2 += "--nombre-reino-a=$NombreReinoA" }
if ($NombreReinoB) { $args2 += "--nombre-reino-b=$NombreReinoB" }
if ($ColorA) { $args2 += "--color-a=$ColorA" }
if ($ColorB) { $args2 += "--color-b=$ColorB" }
if ($ColoresJuego) { $args2 += '--colores-juego' }
if ($SinCapaReinos) { $args2 += '--sin-capa-reinos' }
if ($Modo -eq 'mundo') { if ($ModeloA) { $args2 += "--modelo-a=$ModeloA" }; if ($ModeloB) { $args2 += "--modelo-b=$ModeloB" } }
$args2 += $Extra

# ---------------------------------------------------------------- 3. explicar
Escribe ''
Escribe '=== Lo que voy a hacer ===' Cyan
Escribe "Modo: $Modo$(if ($Simulado) { ' (SIMULADO: no se usa el juego ni OBS)' })$(if ($calendarioCorto) { ' - calendario corto (~4 min)' } elseif ($Modo -in 'completo', 'respuestas', 'asistido') { ' - calendario completo (~37 min si nadie cae)' })"
Escribe "Comando: node $($args2 -join ' ')"
if ($Respuestas) { Escribe "Respuestas: $Respuestas  (la evidencia de la partida queda en data\era\partidas\<fecha>-<id>\ ; conversacion.json y resumen-publico.json)" }
if ($Modo -eq 'asistido') { Escribe 'ASISTIDO: la partida se pausa en cada intervencion. Te escribo el prompt en <carpeta>\_prompts\, tu lo pegas en el chat de cada modelo, guardas su respuesta en <carpeta>\a\ o b\ y pulsas Enter aqui.' Yellow }
if ($Manual -and $grabando) { Escribe 'MANUAL: la partida espera tu Enter despues de cada decision (y al caer el muro). Comenta en vivo y pulsa Enter para seguir.' Yellow }
if ($grabando -and -not $CamaraAuto) { Escribe 'CAMARA LIBRE (por omision): el script no tocara la camara; muevela tu con el raton. Para el zoom automatico por fase usa -CamaraAuto.' Yellow }
if ($grabando -and $CamaraAuto) { Escribe 'CAMARA AUTOMATICA: el script enfoca a la faccion activa y mueve el zoom por fase.' Yellow }
if ($Interfaz -and $grabando) { Escribe 'INTERFAZ VISIBLE: el script no oculta la interfaz del juego (veras sus botones y paneles).' Yellow }
if ($grabando -and $necesitaJuego) {
  Escribe ''
  Escribe '=== En OBS (antes de empezar) ===' Cyan
  Escribe ' 1. Escena a 4K (3840 x 2160): Ajustes > Video, resolucion base y de salida.'
  Escribe ' 2. Fuentes, de ABAJO hacia ARRIBA: primero la "Captura de ventana" de WorldBox (Ctrl+F para ajustar a pantalla) y, ENCIMA, la fuente "Navegador"'
  Escribe "    con la capa (ancho 3840, alto 2160, CSS vacio):  http://localhost:$PUERTO_CAPA/worldbox-vivo.html?formato=16x9"
  Escribe '    Si la capa queda ABAJO, el juego la tapa y no veras el ano, la fase ni las elecciones.'
  Escribe ' 3. Pulsa GRABAR en OBS cuando aqui diga "Listo para grabar" (los tiempos de la linea de tiempo cuentan desde ese momento).'
  Escribe ' 4. Para comentar en vivo con el juego a la vista (sin la capa): oculta la fuente Navegador (ojo) o cambia a una escena que solo tenga la captura.'
}

# ---------------------------------------------------------------- 4. juego, token y servidor de la capa
$servidorPropio = $null
$archivoToken = Join-Path $env:USERPROFILE 'AppData\LocalLow\mkarpenko\WorldBox\puente-token.txt'
try {
  if ($necesitaJuego) {
    if (-not (Get-Process worldbox -ErrorAction SilentlyContinue)) {
      Escribe 'WorldBox no esta abierto: lo abro por Steam (puede tardar un minuto)...' Yellow
      & (Join-Path $PSScriptRoot 'integracion.ps1') abrir
    }
    if (-not (Test-Path $archivoToken)) { throw 'No hay token del puente: falta instalar el mod. Ejecuta  .\worldbox-puente\integracion.ps1 reiniciar  y activa el modo experimental si el juego lo pide.' }
    $env:WORLDBOX_PUENTE_URL = 'http://127.0.0.1:47600'
    $env:WORLDBOX_PUENTE_TOKEN = (Get-Content -Raw $archivoToken).Trim()
    $listo = $false
    for ($i = 0; $i -lt 60 -and -not $listo; $i++) {
      try { $null = Invoke-RestMethod -Uri "$($env:WORLDBOX_PUENTE_URL)/v1/info" -Headers @{ 'X-Puente-Token' = $env:WORLDBOX_PUENTE_TOKEN } -TimeoutSec 5; $listo = $true } catch { Start-Sleep 2 }
    }
    if (-not $listo) { throw 'El puente no responde en 127.0.0.1:47600. Con el juego abierto y en el menu principal (no cargando), vuelve a intentar; si sigue igual: .\worldbox-puente\integracion.ps1 reiniciar' }
    Escribe 'Puente listo.' Green
    if ($grabando) { Remove-Item (Join-Path $raiz 'data\vivo\worldbox.json') -ErrorAction SilentlyContinue }   # que la capa no muestre la partida anterior
    if ($grabando -and -not $SinServidor -and -not (PuertoAbierto $PUERTO_CAPA)) {
      Escribe "Levanto el servidor de la capa (node src/servidor.js, puerto $PUERTO_CAPA); lo detengo al terminar." Yellow
      $servidorPropio = Start-Process node -ArgumentList 'src/servidor.js' -WindowStyle Minimized -PassThru
      for ($i = 0; $i -lt 20 -and -not (PuertoAbierto $PUERTO_CAPA); $i++) { Start-Sleep 1 }
    }
    if ($grabando -and (PuertoAbierto $PUERTO_CAPA)) { Escribe "Capa de OBS disponible en http://localhost:$PUERTO_CAPA/worldbox-vivo.html?formato=16x9" Green }
  }

  # ------------------------------------------------------------- 5. correr
  Escribe ''
  Escribe '=== Empieza ===' Cyan
  $ErrorActionPreference = 'Continue'   # node escribe sus avisos por stderr: no deben cortar el script
  & node @args2
  $codigo = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($Respuestas -and $Modo -ne 'mundo' -and $codigo -eq 0) {
    $ultima = Get-ChildItem (Join-Path $raiz 'data\era\partidas') -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
    if ($ultima) { Escribe "Evidencia: $($ultima.FullName)  (conversacion.json = todo, privado; resumen-publico.json = para la pagina, revisalo antes de publicar)" Green }
  }
  exit $codigo
} finally {
  Remove-Item Env:\WORLDBOX_PUENTE_TOKEN, Env:\WORLDBOX_PUENTE_URL -ErrorAction SilentlyContinue
  if ($servidorPropio -and -not $servidorPropio.HasExited) { Stop-Process -Id $servidorPropio.Id -Force; Escribe 'Servidor de la capa detenido.' }
}

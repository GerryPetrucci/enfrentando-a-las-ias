<#
.SYNOPSIS
  Compila el puente de WorldBox con el csc.exe de .NET Framework (C# 5, sin SDK).

.DESCRIPTION
  Produce en la carpeta de salida:
    PuenteWorldBox.dll  biblioteca (servidor HTTP, protocolo v1, cola del hilo principal)
    Anfitrion.exe       anfitrion de pruebas con un mundo simulado (+ --autoprueba)

  Con -Referencias <carpeta Managed del juego> ademas:
    - recompila la biblioteca contra el mscorlib/System del propio juego (comprueba que solo usa
      APIs que el Mono de WorldBox tiene);
    - si hay fuentes en integracion\, genera salida\mod\PuenteWorldBox.dll: biblioteca + integracion en UNA
      sola DLL, compilada contra UnityEngine del juego (hoy no hay fuentes: depende de W2/W5 y del cargador).

.PARAMETER Salida
  Carpeta de salida. Por defecto worldbox-puente\salida (ignorada por git).

.PARAMETER Referencias
  Carpeta Managed del juego, p. ej.
  C:\Program Files (x86)\Steam\steamapps\common\worldbox\worldbox_Data\Managed
  Solo se LEE; nunca se modifica nada del juego.

.PARAMETER Limpiar
  Borra la carpeta de salida antes de compilar.
#>
param(
    [string]$Salida,
    [string]$Referencias,
    [switch]$Limpiar
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Salida) { $Salida = Join-Path $raiz 'salida' }

function Get-CscRuta {
    $candidatos = @()
    if ($env:CSC_EXE) { $candidatos += $env:CSC_EXE }
    if ($env:WINDIR) {
        $candidatos += (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe')
        $candidatos += (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
    }
    foreach ($c in $candidatos) {
        if ($c -and (Test-Path -LiteralPath $c)) { return $c }
    }
    return $null
}

function Invoke-Csc([string]$csc, [string[]]$argumentos, [string]$que) {
    & $csc @argumentos
    if ($LASTEXITCODE -ne 0) { throw "Fallo la compilacion de $que (csc salio con $LASTEXITCODE)." }
}

$csc = Get-CscRuta
if (-not $csc) {
    Write-Error 'No se encontro csc.exe (.NET Framework 4.x). Defina CSC_EXE con su ruta.'
    exit 2
}
Write-Host "csc: $csc"

if ($Limpiar -and (Test-Path -LiteralPath $Salida)) { Remove-Item -LiteralPath $Salida -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Salida | Out-Null
$Salida = (Resolve-Path -LiteralPath $Salida).Path

$dll = Join-Path $Salida 'PuenteWorldBox.dll'
$exe = Join-Path $Salida 'Anfitrion.exe'
$fuentesLib = @(Get-ChildItem -LiteralPath (Join-Path $raiz 'src') -Filter '*.cs' | ForEach-Object { $_.FullName })
$fuentesAnf = @(Get-ChildItem -LiteralPath (Join-Path $raiz 'anfitrion') -Filter '*.cs' | ForEach-Object { $_.FullName })
if ($fuentesLib.Count -eq 0 -or $fuentesAnf.Count -eq 0) { throw 'Faltan fuentes en src\ o anfitrion\.' }

$comunes = @('/nologo', '/optimize+', '/debug:pdbonly', '/warn:4', '/warnaserror+', '/langversion:5', '/codepage:65001')

# 1. Biblioteca
$a = $comunes + @('/target:library', "/out:$dll", '/reference:System.dll', '/reference:System.Core.dll') + $fuentesLib
Invoke-Csc $csc $a 'PuenteWorldBox.dll'

# 2. Anfitrion de pruebas (el nombre del ensamblado debe ser Anfitrion: la biblioteca le abre sus internos)
$a = $comunes + @('/target:exe', "/out:$exe", "/reference:$dll", '/reference:System.dll', '/reference:System.Core.dll') + $fuentesAnf
Invoke-Csc $csc $a 'Anfitrion.exe'

Write-Host "OK  $dll"
Write-Host "OK  $exe"

# 3. Capa que depende del juego (opcional)
if ($Referencias) {
    if (-not (Test-Path -LiteralPath (Join-Path $Referencias 'UnityEngine.CoreModule.dll'))) {
        throw "La carpeta -Referencias no parece la Managed de un juego Unity (falta UnityEngine.CoreModule.dll): $Referencias"
    }
    $Referencias = (Resolve-Path -LiteralPath $Referencias).Path

    # 3a. La biblioteca contra el perfil del juego: detecta APIs que el Mono de WorldBox no tenga.
    $verif = Join-Path $Salida 'PuenteWorldBox.perfil-juego.dll'
    # /noconfig evita que csc.rsp meta de nuevo System.dll del Framework y choque con el del juego.
    $a = $comunes + @('/target:library', '/noconfig', '/nostdlib+', "/out:$verif",
        "/reference:$(Join-Path $Referencias 'mscorlib.dll')",
        "/reference:$(Join-Path $Referencias 'System.dll')",
        "/reference:$(Join-Path $Referencias 'System.Core.dll')") + $fuentesLib
    Invoke-Csc $csc $a 'PuenteWorldBox contra el perfil del juego'
    Write-Host "OK  $verif  (compila contra mscorlib/System del juego)"

    # 3b. DLL del mod: biblioteca + integracion en UNA sola PuenteWorldBox.dll (salida\mod\), que es lo que
    #     el cargador del juego lee de StreamingAssets\mods\. La integracion vive en el espacio de nombres
    #     PuenteWorldBox (clase WorldBoxMod : MonoBehaviour) y no repite AssemblyInfo.
    $fuentesInt = @(Get-ChildItem -LiteralPath (Join-Path $raiz 'integracion') -Filter '*.cs' -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
    if ($fuentesInt.Count -eq 0) {
        Write-Host 'integracion\: sin fuentes todavia (depende del lote W2/W5 y del cargador elegido); no se genera salida\mod\.'
    } else {
        $carpetaMod = Join-Path $Salida 'mod'
        New-Item -ItemType Directory -Force -Path $carpetaMod | Out-Null
        $mod = Join-Path $carpetaMod 'PuenteWorldBox.dll'
        # Mismas referencias que integracion.ps1 (las DLL de Unity piden netstandard 2.1, asi que hace falta netstandard.dll y /nostdlib+).
        $refs = @()
        foreach ($nombre in @('mscorlib.dll', 'netstandard.dll', 'System.dll', 'System.Core.dll', 'UnityEngine.CoreModule.dll', 'UnityEngine.SharedInternalsModule.dll', 'Assembly-CSharp.dll')) {
            $r = Join-Path $Referencias $nombre
            if (-not (Test-Path -LiteralPath $r)) { throw "Falta $nombre en $Referencias" }
            $refs += "/reference:$r"
        }
        # Sin /warnaserror: los avisos del codigo de integracion no deben impedir generar el mod.
        $permisivos = @($comunes | Where-Object { $_ -ne '/warnaserror+' })
        $a = $permisivos + @('/target:library', '/noconfig', '/nostdlib+', "/out:$mod", '/nowarn:1701') + $refs + $fuentesLib + $fuentesInt
        Invoke-Csc $csc $a 'salida\mod\PuenteWorldBox.dll (biblioteca + integracion)'
        Write-Host "OK  $mod  (copiar a StreamingAssets\mods\)"
    }
}
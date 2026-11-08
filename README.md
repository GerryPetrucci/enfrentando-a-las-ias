# Enfrentando a las IAs

Partidas reproducibles de **Lobo en la Aldea** entre modelos de IA, videos y sitio de resultados,
y una arena de IAs sobre **WorldBox** (ver [WorldBox](#worldbox-arena-de-ias)).

Node 20 o más nuevo, ES modules, cero dependencias y sin build.

## Arranque sin API

```powershell
node src/correr.js --juego=lobo --jugadores=agresivo,silencioso,revela,calla,rapida,guarda,mayoria,contradice --partidas=1 --destino=pruebas --seed=3
node src/marcador.js
node src/servidor.js
```

El servidor abre el sitio en `http://localhost:4321`. La partida de bots queda en
`data/pruebas/`; el marcador público solo lee `data/publicas/`.
`npm run demo` corre una partida de Lobo con controles locales y actualiza el marcador.

## Partidas con modelos

Los modelos disponibles están en `src/modelos.js`; los parámetros, en
`src/parametros.js`. Se eligen ocho o doce asientos con `--jugadores=...`.
Cada ejecución con modelos exige indicar `--modo=gratis` o `--modo=pago`.
No se llama a API pagada sin orden expresa. Antes de jugar, comprobar los IDs y
precios del proveedor con `herramientas/verificar-modelos.mjs`.

La corrida habitual es **una partida**, con `--partidas=1` explícito. Las series y
la rotación requieren una petición específica. Los bots locales no usan red.
Los resultados de práctica se guardan en `data/pruebas/`; las partidas completas
son privadas hasta aplicar la [política de publicación](docs/politica-publicacion.md).

## Voz, paquete y grabación

Después de una partida con modelos se genera su voz local y su paquete:

```powershell
node herramientas/narrar.mjs --archivo=ARCHIVO.json
node herramientas/paquete.mjs --archivo=ARCHIVO.json --partida=1
```

El paquete queda en `grabaciones/listos/lobo-en-la-aldea/<fecha>_seed-<seed>/paquete-jN`.
Su `LEEME.md` reúne las direcciones de OBS, nombres de archivo, comandos de recorte,
guion y textos de publicación. Cada parte lleva un video corto de imagen fija
«Próximamente» cuando no hay momentos puntuados para un gancho de cortes.
Piper y ffmpeg se configuran localmente; la voz y las grabaciones no se publican en git.

Ver [producción de videos](docs/produccion-videos.md) para las versiones con y sin
voz, los formatos y la revisión antes de grabar.

## WorldBox: arena de IAs

Varios modelos toman decisiones estratégicas dentro de WorldBox (Steam, versión 0.51.2, Windows):
mismo reglamento, mismo presupuesto de decisiones y registro completo de cada decisión, costo y
resultado. Un orquestador en Node habla por HTTP local con un mod propio (`worldbox-puente/`) que corre
dentro del juego; el juego no se modifica, el mod se carga con el cargador oficial de mods.
Reglas: [reglamento](docs/worldbox-reglas.md). Diseño y operación: [docs/worldbox.md](docs/worldbox.md).
Protocolo del puente: [docs/worldbox-protocolo.md](docs/worldbox-protocolo.md).

**Sin el juego** (mundo simulado, solo bots, sin red):

```powershell
node src/worldbox/correr.js --adaptador=simulado --participantes=bot-voraz,bot-aleatorio --semilla=7 --turnos=5 --presupuesto=0 --partidas=1 --salida=data/pruebas/worldbox
```

**Con WorldBox real** (requiere el juego instalado y el *modo experimental* activo en Ajustes; el juego
lo apaga tras cada actualización):

```powershell
.\worldbox-puente\integracion.ps1 compilar     # compila PuenteWorldBox.dll con csc.exe (C# 5), sin SDK
.\worldbox-puente\integracion.ps1 reiniciar    # cierra el juego, instala la DLL en mods\ y lo abre
$env:WORLDBOX_PUENTE_URL = 'http://127.0.0.1:47600'
$env:WORLDBOX_PUENTE_TOKEN = (Get-Content "$env:USERPROFILE\AppData\LocalLow\mkarpenko\WorldBox\puente-token.txt").Trim()
node src/worldbox/correr.js --adaptador=http --participantes=bot-voraz,bot-expansionista --partidas=1 --salida=data/pruebas/worldbox
```

Con bots no hay costo. Los modelos reales solo se usan con `--modo=pago` explícito y un tope
(`--presupuesto`); sin esa bandera el orquestador no importa el cliente de OpenRouter ni abre red.
Cada partida real es un mundo distinto: la semilla no controla el mapa de WorldBox. Pruebas:
`node --test src/pruebas/worldbox/` (las pruebas contra el juego abierto se activan con `WORLDBOX_VIVO=1`).
`.env.example` lista las variables sin secretos.

## Código y comprobaciones

- `src/worldbox/`: orquestador, pasarela de modelos, validador, puntuación, telemetría y reportes de la arena.
- `worldbox-puente/`: mod en C# (servidor local del puente) y anfitrión de pruebas.
- `src/juegos/lobo.js` y `src/juegos/lobo/`: reglas, estado y turnos.
- `src/arena.js`, `agentes.js`, `serie.js`, `lote.js`: ejecución común y proveedores.
- `src/publicacion.js`, `src/marcador.js`: publicación por partes y marcador.
- `web/casino/mesa-lobo.js`: escena; `web/*.html`: sitio estático.
- `herramientas/`: voz, paquetes, grabación y diagnóstico.
- `src/pruebas/`: bots y mocks; las ayudas de prueba no se registran como juegos.

```powershell
npm test
```

Durante trabajo paralelo, ejecutar las carpetas asignadas con rutas explícitas.
Las partidas guardan seed, versiones y huella del prompt; no se retocan jugadas.
Las IAs reciben su vista, y el motor valida cada acción.

Más contexto: [metodología](docs/metodologia.md), [prompts](docs/guia-de-prompts.md),
[contrato de juegos](docs/agregar-un-juego.md) e [instrucciones para asistentes](docs/contexto-eficiente.md).

# Grabar una partida de WorldBox con OBS

El mundo de WorldBox **no se puede reproducir**: no hay semilla que lo regenere ni un registro que lo vuelva a pintar. Por eso la
partida se **graba en vivo** mientras corre. El modo grabación (`--grabacion`) cambia solo el ritmo y la presentación: el
reglamento (`auge-real-1.1.0`), el prompt, la validación y la puntuación son los mismos. Es una partida normal con calma para el
espectador. La telemetría y el reporte conservan su forma; el reporte guarda la velocidad con la que se jugó
(`config.efectiva.velocidad`).

## Qué hace el modo grabación

| Cosa | Comportamiento |
|---|---|
| Cuenta atrás | Imprime `Listo para grabar: pulsa grabar en OBS` y cuenta `--cuenta` segundos (10 por omisión) antes de tocar el juego. |
| Velocidad | `x1` (tiempo real) salvo que se pase `--velocidad`. Sin `--grabacion` sigue en `x10`. |
| Pausa de lectura | Tras cada decisión espera `--lectura-ms` (4000 por omisión) para que se lea el subtítulo. Con `--manual` no hay pausa: manda tu Enter. |
| Pausa final | `--fin-ms` (8000 por omisión) con la tarjeta del resultado a la vista, antes de devolver la cámara y la interfaz. |
| Estado en vivo | Escribe `data/vivo/worldbox.json` (atómico: archivo temporal y `rename`) con cada cambio. La carpeta `data/vivo/` no se versiona. |
| Cámara | Si el puente anuncia `capacidades.camara`: **zoom por fase** (cerca sobre quien decide, medio mientras avanza el turno, lejos en la preparación y en la tarjeta final; sección «Zoom por fase»). No queda cámara libre: solo se suelta al terminar. `--zoom=N` lo reemplaza por un zoom único. |
| Interfaz | Si el puente anuncia `capacidades.interfaz`: la oculta al empezar y la vuelve a mostrar al terminar. |

Sin cámara ni interfaz en el puente se graba igual (sin ellas). Un fallo de cualquiera de las dos nunca detiene la partida.
Las esperas del modo grabación (cuenta, pausas, Enter) no cuentan contra `--tiempo-ms` ni contra los plazos del puente. A `x1`
avanzar un turno dura de verdad lo que dura en juego (50 s), así que `avanzar` tiene su propio plazo (los segundos reales más 60 s,
con tope de 120 s).

## Antes de empezar

1. WorldBox abierto con el puente instalado y el modo experimental activo (`.\worldbox-puente\integracion.ps1 abrir`).
2. Servidor del sitio, para que la fuente de navegador lea el estado:

```powershell
node src/servidor.js
```

3. Variables del puente en la sesión (el token no se imprime ni se guarda):

```powershell
$env:WORLDBOX_PUENTE_URL = 'http://127.0.0.1:47600'
$env:WORLDBOX_PUENTE_TOKEN = (Get-Content -Raw "$env:USERPROFILE\AppData\LocalLow\mkarpenko\WorldBox\puente-token.txt").Trim()
```

## Escena de OBS

1. **Captura de ventana** de WorldBox (método de captura *Windows 10 (1903 y posterior)*; con *Captura de juego* también sirve).
   Debajo de todo.
2. **Fuente de navegador** encima, con fondo transparente (deja vacío el CSS personalizado; no cambies el fondo):

```text
http://localhost:4321/worldbox-vivo.html?formato=16x9
```

   Para vertical (short, 9:16) usa el lienzo 1080 x 1920 y esta dirección:

```text
http://localhost:4321/worldbox-vivo.html?formato=9x16
```

   Tamaño de la fuente igual al del lienzo (1920 x 1080 u 1080 x 1920). Para ensayar el encuadre sin partida añade `&demo=1`.
3. Ensaya el encuadre con `&demo=1`, quítalo y empieza.
4. **Recorta la captura del juego** (clic derecho en la captura > Filtros > Recorte/Relleno): el puente oculta la barra de poderes,
   pero el juego no permite ocultar el **botón del ojo** (abajo a la izquierda), el **texto de versión** (abajo a la derecha) ni el
   **botón de pausa y la velocidad** (a la derecha). Recorta esos bordes (o cúbrelos con la capa). En vertical (9:16) recorta la
   captura a su zona central. El zoom lo maneja el modo grabación por fase (sección «Zoom por fase»).

### Micrófono y pistas de audio

- **Micrófono**: en *Ajustes > Audio* añade tu micro como *Audio de micrófono/auxiliar*. Revisa que el medidor llegue a la zona
  amarilla al hablar normal y que no toque el rojo.
- **Pistas separadas voz y juego**: en *Ajustes > Salida > Modo avanzado > Grabación* marca las pistas 1 y 2. En *Mezclador de
  audio > engranaje > Propiedades de audio avanzadas* deja el micrófono solo en la **pista 2** y el sonido del juego (y todo lo
  demás) en la **pista 1**. Así puedes editar o regrabar la voz sin tocar el juego. Formato de grabación: `mkv` (no pierde el
  archivo si se corta).
- **Narrar en vivo**: usa `--manual` (abajo) y habla mientras ves cada decisión en pantalla.
- **Narrar encima del video grabado**: graba sin hablar (con la pausa de lectura normal) y luego narra sobre el video ya
  grabado. La pausa de lectura deja aire para que la voz no se pise con las decisiones. Como el mundo no se repite, esta es la
  forma de corregir una narración sin volver a jugar: se regraba solo la pista de voz sobre el mismo `mkv`.

## Zoom por fase

Solo con `--grabacion` y un puente que anuncie `capacidades.camara`. Usa `POST /v1/camara {faccion, zoom}` en modo limpio (el
puente mueve la cámara con `setTargetZoom`, que **suaviza** el cambio; no hay salto brusco). Rango del juego: 10 (muy cerca) a
211 (todo el mapa); menor = más cerca.

| Fase | Zoom (opción, por omisión) | Sobre quién |
|---|---|---|
| Preparación (mundo recién generado) | lejos, `--zoom-lejos` = 211 | la primera facción |
| `pensando`, `decidio`, `esperando` y `aplicando` de una decisión | cerca, `--zoom-cerca` = 60 | la facción que decide |
| El mundo avanza el turno | medio, `--zoom-medio` = 110 | la última facción que decidió (o una viva si cayó) |
| Tarjeta final (`fin`) | lejos, `--zoom-lejos` = 211 | una facción viva |

La cuenta atrás ocurre antes de crear el mundo (el puente no tiene cámara todavía): el «lejos» de la preparación se aplica en cuanto el
mundo existe. Al terminar se suelta la cámara y se muestra la interfaz. `--zoom=N` es un zoom **único** (se aplica a cada
decisión, se suelta la cámara al cerrar cada turno) y desactiva el automático: con él, `--zoom-cerca`, `--zoom-medio` y
`--zoom-lejos` no se usan. Un fallo de cámara nunca detiene la partida.

Ensayo del 8-11-2026 con bots (capturas del monitor en `privado/worldbox/pruebas-vivas/v3-cerca.png`, `v3-medio.png`, `v3-lejos.png`):
el encuadre cambia de verdad en las tres fases. Las unidades son muy pequeñas: a 60 la isla se ve por regiones y a 30 casi solo
terreno. Revisa el encuadre en OBS con una partida de ensayo y ajusta `--zoom-cerca` antes de grabar en serio.

## Comando con bots (ensayo, sin costo)

```powershell
node src/worldbox/correr.js --adaptador=http --participantes=bot-expansionista,bot-voraz --partidas=1 --grabacion --cuenta=10
```

Ensayo corto de un minuto (3 turnos de 20 s):

```powershell
node src/worldbox/correr.js --adaptador=http --participantes=bot-expansionista,bot-voraz --partidas=1 --grabacion --cuenta=3 --turnos=3 --segundos-turno=20
```

## Comando con modelos (cuesta dinero: solo con orden y tope de gasto)

Los modelos reales exigen `--modo=pago`, presupuesto y tarifas por millón de tokens (una sola pareja, la más alta de los modelos
elegidos). Ejemplo con los tres económicos, tarifas del catálogo de OpenRouter del 7-11-2026 (verifícalas antes de gastar; una
partida de 24 turnos costó unos 0.07 USD):

```powershell
node src/worldbox/correr.js --adaptador=http --modelos=anthropic/claude-haiku-5.5,openai/gpt-6-luna,google/gemini-3.5-flash-lite --modo=pago --presupuesto=0.60 --presupuesto-modelo=0.30 --tarifa-entrada=0.3 --tarifa-salida=2.5 --partidas=1 --grabacion --cuenta=10
```

`x-ai/grok-4.3` no se usa en estas pruebas: razona hasta el tope de salida y una sola llamada costó 0.06 USD.

En pantalla se dice el nombre corto del modelo (`Claude Haiku`, `GPT Luna`, `Gemini Flash-Lite`), nunca el id del proveedor ni
`f1`/`f2`; si un modelo ocupa dos asientos lleva letra (`Grok A`, `Grok B`) y un tono distinto del mismo color de marca.

## Video corto (10 a 15 minutos) con dos modelos

Preajuste con **dos** modelos económicos, velocidad x3, pausa de lectura de 3 s y tope de gasto de 0.30 USD (0.15 por modelo). Las
tarifas son las del catálogo del 7-11-2026 (0.1 de entrada y 0.5 de salida por millón de tokens): verifícalas antes de gastar.

```powershell
node src/worldbox/correr.js --adaptador=http --modelos=anthropic/claude-haiku-5.5,openai/gpt-6-luna --modo=pago --presupuesto=0.30 --presupuesto-modelo=0.15 --tarifa-entrada=0.1 --tarifa-salida=0.5 --partidas=1 --grabacion --velocidad=x3 --lectura-ms=3000 --cuenta=10
```

Duración estimada de una partida de 24 turnos. Medido con bots a x3 contra el juego real (8-11-2026, 4 turnos de 50 s de juego con
lectura de 3 s): un turno dura **20.2 s** reales, de los cuales 6 s son las dos pausas de lectura y unos 14.2 s es lo que tarda el
mundo en avanzar 50 s a x3. Con modelos se suma lo que tarda cada uno en pensar (**supuesto de 6 s por decisión, no medido**: no se
llamó a ningún modelo).

Fórmula por turno: `2 x lectura + avance + 2 x pensar`; total: `24 turnos + 10 s de cuenta + 3 s de generación + 8 s de tarjeta final`.

| Caso (x3, lectura 3 s) | Turno | 24 turnos + extras | Total |
|---|---|---|---|
| Bots (pensar 0 s) | 20.2 s | 506 s | **8.4 min** |
| Modelos rápidos (pensar 4 s) | 28.2 s | 698 s | **11.6 min** |
| **Modelos, supuesto de 6 s** | 32.2 s | 794 s | **13.2 min** |
| Modelos lentos (pensar 10 s) | 40.2 s | 986 s | **16.4 min** (se pasa; sube `--velocidad` o baja `--lectura-ms`) |

Otras velocidades con modelos de 6 s (el tiempo de avance escala con la velocidad: **extrapolado**, solo x3 está medido):

| Velocidad | Avance por turno | Turno | Total |
|---|---|---|---|
| x1 | 42.6 s | 60.6 s | 24.6 min |
| **x3** (medida) | 14.2 s | 32.2 s | **13.2 min** |
| x5 | 8.5 s | 26.5 s | 11.0 min |
| x10 | 4.3 s | 22.3 s | 9.3 min |

El total real depende de lo que tarden los modelos (con prompts más largos en los turnos finales suelen tardar más) y se mide
mejor con la primera partida grabada.

## Narrar con tu voz: `--manual`

```powershell
node src/worldbox/correr.js --adaptador=http --participantes=bot-expansionista,bot-voraz --partidas=1 --grabacion --manual --cuenta=10
```

Con `--manual`, tras mostrar cada decisión la partida **se detiene con la decisión a la vista** (en el estado en vivo la fase es
`esperando`) y la consola dice:

```text
Turno 4 de 24 - Claude Haiku: Crea 5 aldeanos y bendice a su gente
Pulsa Enter para continuar
```

Narra lo que quieras y pulsa **Enter** en la consola para que la decisión se ejecute y siga el juego. La espera:

- ocurre antes de ejecutar la orden, así que el espectador ve la decisión y luego su efecto;
- no cuenta contra el tiempo máximo de la partida, ni contra los plazos del puente, ni contra el presupuesto;
- no cambia reglas ni puntuación (el motor valida y ejecuta exactamente lo mismo);
- descarta los Enter pulsados sin que nadie espere (no te saltas una decisión por un doble toque).

Si la entrada no es una consola interactiva (una tubería, una prueba), `--manual` se ignora con un aviso y se usa `--lectura-ms`.
Para cerrar sin seguir esperando, cierra la entrada (Ctrl+Z y Enter en PowerShell) o interrumpe con Ctrl+C.

## Todas las opciones del modo grabación

| Opción | Valor por omisión | Significado |
|---|---|---|
| `--grabacion` | apagado | Activa el modo. Va sin valor. Es lo único que activa las demás. |
| `--manual` | apagado | Espera un Enter por decisión (sin pausa de lectura). |
| `--cuenta=S` | 10 | Segundos de cuenta atrás (0 a 600). |
| `--lectura-ms=N` | 4000 | Pausa tras cada decisión (0 a 60000). |
| `--fin-ms=N` | 8000 | Pausa con el resultado a la vista al terminar (0 a 120000). |
| `--velocidad=xN` | `x1` | Velocidad del juego. |
| `--zoom=N` | automático por fase | Zoom **único** de la cámara (1 a 1000); desactiva el automático. |
| `--zoom-cerca=N` | 60 | Zoom sobre quien decide (10 a 211; menor = más cerca). |
| `--zoom-medio=N` | 110 | Zoom mientras el mundo avanza el turno (10 a 211). |
| `--zoom-lejos=N` | 211 | Zoom de la preparación y de la tarjeta final (10 a 211; 211 = todo el mapa). |
| `--vivo=RUTA` | `data/vivo/worldbox.json` | Dónde se escribe el estado en vivo. |

Las demás opciones (`--turnos`, `--segundos-turno`, `--semilla`, `--salida`...) valen igual que en una partida normal
(`docs/worldbox.md`). Una sola partida por corrida: `--partidas=1`.

## El estado en vivo (`data/vivo/worldbox.json`, versión 1)

```json
{
  "version": 1,
  "actualizado": "2026-11-08T05:42:00.823Z",
  "fase": "esperando",
  "turno": 4,
  "turnos": 24,
  "tiempo_juego_s": 150,
  "activo": "f1",
  "facciones": [
    { "id": "f1", "nombre": "Claude Haiku", "color": "#D97757", "poblacion": 14, "ciudades": 1, "territorio": 15, "vivo": true, "puntos": 155.8 }
  ],
  "decision": {
    "participante": "Claude Haiku",
    "texto": "Crea 5 aldeanos y bendice a su gente",
    "razon": "Crezco primero para tener ventaja antes de la guerra.",
    "acciones": [
      { "accion": "crear_unidades", "texto": "Crea 5 aldeanos" },
      { "accion": "bendecir", "texto": "Bendice a su gente" }
    ]
  },
  "ultimo_evento": "GPT Luna declara la guerra a Claude Haiku.",
  "ranking": null,
  "ganador": null
}
```

- `fase`: `preparando` (cuenta atrás y mundo), `pensando` (`activo` decide), `decidio` (decisión a la vista), `esperando` (solo con
  `--manual`, mismo contenido que `decidio`), `aplicando` (la orden ya se ejecutó), `turno` (cerró el turno) y `fin`.
- `id` y `activo` son claves para la página (colores, resaltado); lo que se **lee o se dice** es `nombre`/`participante`.
- `razon`: el `reasoning_summary` del modelo, recortado a 160 caracteres en palabra entera. Los bots llevan una razón fija
  que dice que son jugadores automáticos de prueba.
- `ranking` y `ganador` solo existen en `fin`. El ranking usa la misma regla que el reporte (el único superviviente gana); con
  empate total, `ganador` es `null`.
- La escritura es atómica y un fallo al escribir nunca detiene la partida.

## Después de grabar

La partida queda como cualquier otra en `data/pruebas/worldbox/<id>-1/` (`eventos.jsonl`, `reporte.json`). Audítala y revisa los
costos como siempre (`node src/worldbox/auditar.js <carpeta>`). Los textos públicos y los títulos siguen la regla de
`AGENTS.md`; este modo no genera voz ni paquete: la narración es la tuya.

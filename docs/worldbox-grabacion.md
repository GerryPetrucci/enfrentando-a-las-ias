# Grabar una partida de WorldBox con OBS

El mundo de WorldBox **no se puede reproducir**: no hay semilla que lo regenere ni un registro que lo vuelva a pintar. Por eso la
partida se **graba en vivo** mientras corre. El modo grabación (`--grabacion`) cambia solo el ritmo y la presentación: el
reglamento (`auge-real-1.1.0`), el prompt, la validación y la puntuación son los mismos. Es una partida normal con calma para el
espectador. La telemetría y el reporte conservan su forma; el reporte guarda la velocidad con la que se jugó
(`config.efectiva.velocidad`).

## Qué hace el modo grabación

| Cosa | Comportamiento |
|---|---|
| Preparación | Primero se prepara el mundo SIN que lo grabes (sección «Orden de preparación»); solo después imprime `Listo para grabar: pulsa grabar en OBS` y cuenta `--cuenta` segundos (15 por omisión). |
| Velocidad | `x1` (tiempo real) salvo que se pase `--velocidad`. Sin `--grabacion` sigue en `x10`. |
| Pausa de lectura | Tras cada decisión espera `--lectura-ms` (4000 por omisión) para que se lea el subtítulo. Con `--manual` no hay pausa: manda tu Enter. |
| Pausa final | `--fin-ms` (8000 por omisión) con la tarjeta del resultado a la vista, antes de devolver la cámara y la interfaz. |
| Estado en vivo | Escribe `data/vivo/worldbox.json` (atómico: archivo temporal y `rename`) con cada cambio. La carpeta `data/vivo/` no se versiona. |
| Cámara | Si el puente anuncia `capacidades.camara`: **zoom por fase** (cerca sobre quien decide, medio mientras avanza el turno, lejos en la preparación y en la tarjeta final; sección «Zoom por fase»). No queda cámara libre: solo se suelta al terminar. `--zoom=N` lo reemplaza por un zoom único. |
| Interfaz | Si el puente anuncia `capacidades.interfaz`: la oculta antes de generar el mundo y otra vez después, y la vuelve a mostrar al terminar. |

Sin cámara ni interfaz en el puente se graba igual (sin ellas). Un fallo de cualquiera de las dos nunca detiene la partida.
Las esperas del modo grabación (aviso del juego, cuenta, pausas, Enter) no cuentan contra `--tiempo-ms` ni contra los plazos del puente. A `x1`
avanzar un turno dura de verdad lo que dura en juego (50 s), así que `avanzar` tiene su propio plazo (los segundos reales más 60 s,
con tope de 120 s).

## Orden de preparación (qué grabas y qué no)

Con `--grabacion` lo primero que ocurre **no** es la cuenta atrás: el mundo se prepara antes de que pulses grabar.

1. Escribe al instante `data/vivo/worldbox.json` con `fase: preparando`. Borra antes el archivo de la partida anterior para que la
   fuente de navegador no muestre datos viejos:

```powershell
Remove-Item data\vivo\worldbox.json -ErrorAction SilentlyContinue
```

2. Oculta la interfaz del juego (el mundo anterior deja de mostrar la barra de poderes).
3. Genera el mundo nuevo y funda las facciones. Generar un mundo reinicia la interfaz del juego pero deja puesta la bandera
   «oculta», y sin un cambio de estado el juego no vuelve a ocultarla: por eso el modo la **muestra y la oculta de nuevo** (con una
   pausa de 0.3 s) y deja la cámara en zoom lejos.
4. Espera `--aviso-ms` (6000): al generar un mundo el juego muestra unos segundos el aviso **«Experimental mode is enabled»**. Con la
   espera ya no sale en la grabación.
5. Imprime `Listo para grabar: pulsa grabar en OBS`. **Pulsa grabar en este momento.**
6. Cuenta atrás de `--cuenta` segundos (15) y empieza el turno 1.

Mientras tanto el estado en vivo dice `preparando`. Nada de esto cuenta contra el tiempo máximo de la partida ni contra los plazos del
puente, y las reglas, la puntuación y la telemetría no cambian (la primera observación se captura después de la cuenta). Si la
preparación falla (el mundo no se genera), la interfaz se vuelve a mostrar. En el ensayo del 8-11-2026 con bots, durante la espera
y la cuenta atrás la barra de poderes ya no se veía y el aviso se apagó antes de «Listo para grabar»
(`privado/worldbox/pruebas-vivas/v4b-previo-temprano.png`: con el aviso, a 2 s; `v4b-previo.png`, `v4b-cuenta.png` y `v4b-turno1.png`: sin
él). Sin la pausa de «ocultar de nuevo» la barra quedaba a la vista (`v4-previo.png`, `v4-cuenta.png`, `v4-turno1.png`).

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

Medidas de la primera grabación real: el lienzo de OBS es **4K (3840 x 2160)** y la ventana de WorldBox mide **2560 x 1440** (en el
monitor secundario). Si tu lienzo o tu monitor son otros, aplica lo mismo con tus medidas.

1. **Lienzo**: *Ajustes > Video*, resolución base y de salida 3840 x 2160 (en 1080p, 1920 x 1080). Para un short vertical, el lienzo es
   2160 x 3840 (o 1080 x 1920).
2. **Captura de ventana** de WorldBox (método *Windows 10 (1903 y posterior)*; con *Captura de juego* también sirve), debajo de todo y
   con *Capturar cursor* desactivado. La ventana (2560 x 1440) es más chica que el lienzo (3840 x 2160): **hay que escalar la captura
   al lienzo**, no dejarla a tamaño nativo (se vería en un rincón, o con el resto del lienzo vacío). Clic derecho en la captura >
   *Transformar > Ajustar a pantalla* (o `Ctrl+F`). Los dos son 16:9, así que se llena sin barras. Si después aplicas un recorte,
   vuelve a pulsar `Ctrl+F`.
3. **Fuente de navegador** encima, con fondo transparente (deja vacío el CSS personalizado; no cambies el fondo). Su ancho y alto son
   **los del lienzo** (3840 x 2160); la capa se escala sola a cualquier tamaño, así que no hay que ajustarla aparte:

```text
http://localhost:4321/worldbox-vivo.html?formato=16x9
```

   Para vertical (short, 9:16), con el lienzo vertical y las medidas del lienzo en la fuente:

```text
http://localhost:4321/worldbox-vivo.html?formato=9x16
```

   Para ensayar el encuadre sin partida añade `&demo=1`; quítalo para la partida.
4. **Recorta la captura del juego** (clic derecho en la captura > Filtros > Recorte/Relleno): el puente oculta la barra de poderes,
   pero el juego no permite ocultar el **botón del ojo** (abajo a la izquierda), el **texto de versión** (abajo a la derecha), el
   **registro de mensajes del juego** (arriba a la izquierda, «¡Un nuevo reino…!») ni el **botón de pausa y la velocidad** (a la
   derecha). Recorta esos bordes (o cúbrelos con la capa). En vertical (9:16) recorta la captura a su zona central. El zoom lo maneja
   el modo grabación por fase (sección «Zoom por fase»).

### Audio: la captura de ventana no trae sonido

La primera grabación salió **muda** (-91 dB, silencio total): la *Captura de ventana* solo trae imagen. Añade el sonido del juego como
fuente de audio aparte:

1. *Fuentes > + > **Captura de audio de aplicación*** (en OBS recientes) y elige la ventana de WorldBox. Solo trae el sonido del
   juego; es la opción recomendada.
2. Alternativa: *Fuentes > + > **Captura de salida de audio*** (todo lo que suena en el equipo, notificaciones incluidas).
3. Revisa el volumen del juego en sus propios *Ajustes* (música y efectos no en cero) y en el *Mezclador de volumen* de Windows (el
   juego no silenciado).
4. En el *Mezclador de audio* de OBS el medidor de esa fuente debe moverse con el sonido del juego; que no esté silenciada (icono del
   altavoz) ni con el volumen en el mínimo.

### Colores apagados

Si los colores salen apagados en la grabación:

- *Ajustes > Avanzado*: **espacio de color sRGB** y **rango de color completo** (Full). Con rango parcial en la grabación y completo en
  el reproductor (o al revés) el negro se ve gris y todo pierde contraste.
- **HDR de Windows**: si el monitor del juego tiene HDR activado, el contenido SDR se captura lavado. Desactiva *HDR* en *Configuración >
  Sistema > Pantalla* para ese monitor mientras grabas.

### Prueba de 15 segundos antes de una partida larga

Antes de una partida larga, graba unos 15 s y revísalos **en un reproductor** (no en la vista previa de OBS). Un ensayo con bots de un
turno sirve (la cuenta y el aviso se acortan solo para la prueba):

```powershell
node src/worldbox/correr.js --adaptador=http --participantes=bot-expansionista,bot-voraz --partidas=1 --grabacion --cuenta=3 --aviso-ms=2000 --turnos=1 --velocidad=x3
```

Lista de revisión:

```text
[ ] Encuadre: el juego llena el lienzo (sin barras negras ni en un rincón) y la capa de textos se ve completa y dentro de la zona segura
[ ] Limpio: sin barra de poderes, botón del ojo, versión ni registro de mensajes del juego a la vista
[ ] Sin el aviso «Experimental mode is enabled» en el video
[ ] Audio: se oye el juego y, si narras, tu voz en la pista 2; el volumen no es silencio
[ ] Colores: el video se ve igual que el juego en pantalla (no apagado ni lavado)
[ ] Zoom: en cada decisión se ve de cerca a quien decide; ajusta --zoom-cerca si no se distingue
```

Comprobar el audio sin abrir el video (si `mean_volume` ronda -91 dB, es silencio):

```powershell
ffmpeg -i "RUTA\grabacion.mkv" -af volumedetect -vn -f null NUL
```

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

El puente no tiene cámara hasta que existe el mundo: el «lejos» de la preparación se aplica en cuanto se genera, antes de la espera del aviso
y de la cuenta atrás. Al terminar se suelta la cámara y se muestra la interfaz. `--zoom=N` es un zoom **único** (se aplica a cada
decisión, se suelta la cámara al cerrar cada turno) y desactiva el automático: con él, `--zoom-cerca`, `--zoom-medio` y
`--zoom-lejos` no se usan. Un fallo de cámara nunca detiene la partida.

Ensayo del 8-11-2026 con bots (capturas del monitor en `privado/worldbox/pruebas-vivas/v3-cerca.png`, `v3-medio.png`, `v3-lejos.png`):
el encuadre cambia de verdad en las tres fases. Las unidades son muy pequeñas: a 60 la isla se ve por regiones y a 30 casi solo
terreno. Revisa el encuadre en OBS con una partida de ensayo y ajusta `--zoom-cerca` antes de grabar en serio.

## Comando con bots (ensayo, sin costo)

```powershell
node src/worldbox/correr.js --adaptador=http --participantes=bot-expansionista,bot-voraz --partidas=1 --grabacion
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
node src/worldbox/correr.js --adaptador=http --modelos=anthropic/claude-haiku-5.5,openai/gpt-6-luna,google/gemini-3.5-flash-lite --modo=pago --presupuesto=0.60 --presupuesto-modelo=0.30 --tarifa-entrada=0.3 --tarifa-salida=2.5 --partidas=1 --grabacion
```

`x-ai/grok-4.3` no se usa en estas pruebas: razona hasta el tope de salida y una sola llamada costó 0.06 USD.

En pantalla se dice el nombre corto del modelo (`Claude Haiku`, `GPT Luna`, `Gemini Flash-Lite`), nunca el id del proveedor ni
`f1`/`f2`; si un modelo ocupa dos asientos lleva letra (`Grok A`, `Grok B`) y un tono distinto del mismo color de marca.

## Video corto (10 a 15 minutos) con dos modelos

Preajuste con **dos** modelos económicos, velocidad x3, pausa de lectura de 3 s y tope de gasto de 0.30 USD (0.15 por modelo). Las
tarifas son las del catálogo del 7-11-2026 (0.1 de entrada y 0.5 de salida por millón de tokens): verifícalas antes de gastar.

```powershell
node src/worldbox/correr.js --adaptador=http --modelos=anthropic/claude-haiku-5.5,openai/gpt-6-luna --modo=pago --presupuesto=0.30 --presupuesto-modelo=0.15 --tarifa-entrada=0.1 --tarifa-salida=0.5 --partidas=1 --grabacion --velocidad=x3 --lectura-ms=3000
```

Duración estimada de una partida de 24 turnos. Medido con bots a x3 contra el juego real (8-11-2026, 4 turnos de 50 s de juego con
lectura de 3 s): un turno dura **20.2 s** reales, de los cuales 6 s son las dos pausas de lectura y unos 14.2 s es lo que tarda el
mundo en avanzar 50 s a x3. Con modelos se suma lo que tarda cada uno en pensar (**supuesto de 6 s por decisión, no medido**: no se
llamó a ningún modelo).

Fórmula por turno: `2 x lectura + avance + 2 x pensar`; total del video: `24 turnos + 15 s de cuenta + 8 s de tarjeta final`. La generación del mundo y la espera del aviso (unos 10 s) ocurren antes de «Listo para grabar», fuera del video.

| Caso (x3, lectura 3 s) | Turno | 24 turnos + extras | Total |
|---|---|---|---|
| Bots (pensar 0 s) | 20.2 s | 508 s | **8.5 min** |
| Modelos rápidos (pensar 4 s) | 28.2 s | 700 s | **11.7 min** |
| **Modelos, supuesto de 6 s** | 32.2 s | 796 s | **13.3 min** |
| Modelos lentos (pensar 10 s) | 40.2 s | 988 s | **16.5 min** (se pasa; sube `--velocidad` o baja `--lectura-ms`) |

Otras velocidades con modelos de 6 s (el tiempo de avance escala con la velocidad: **extrapolado**, solo x3 está medido):

| Velocidad | Avance por turno | Turno | Total |
|---|---|---|---|
| x1 | 42.6 s | 60.6 s | 24.6 min |
| **x3** (medida) | 14.2 s | 32.2 s | **13.3 min** |
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
| `--aviso-ms=N` | 6000 | Espera tras generar el mundo para que se apague el aviso del juego «Experimental mode is enabled» (0 a 60000). |
| `--cuenta=S` | 15 | Segundos de cuenta atrás, después de «Listo para grabar» (0 a 600). |
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

## Partida era de ~1 hora: grabar y cortar (reglamento `era-1.0`)

El formato «era» ([`worldbox-era.md`](worldbox-era.md)) dura mucho más que `auge`: 650 años de juego. Con las velocidades por omisión (x40 el desarrollo, **x5 la guerra** desde E5) el juego
corre **≈ 10,6 min de desarrollo** más la guerra a ≈ 10 s reales por año de mundo (de 0,5 a 3 min si una civilización cae en pocos años; ≈ 25 min si llegan las dos al año 650), más las 16 llamadas a los modelos y
las pausas de lectura (16 × `--lectura-ms`, 4 s por omisión): ver las cifras medidas en `privado/revisiones/E5-entrega.md`. El montaje acelera la calma (`--calma=8`, `--calma-guerra=3`).
Para **una hora de grabación** (incluidas pausas largas de narración en vivo) usa `--velocidad-desarrollo=x20 --velocidad-guerra=x2` y `--lectura-ms=8000`. La capa de OBS, la escena y la lista de revisión son las de arriba; **cambia solo el comando**.

0. **DLL con velocidad por fase y mantenimiento de rasgos.** `.\worldbox-puente\integracion.ps1 reiniciar` compila, instala y abre el juego con `POST /v1/era/velocidad`. Si el juego tiene una DLL anterior, la partida
   se juega entera a la velocidad del escenario (queda anotado `velocidad_fija` en `fin.anomalias`; sin `era_mantener`, `sin_mantenimiento`). La guerra corre a x5 en pasos de 20 s de mundo: se ve y no se pasa la eliminación sin observarla.
1. Mismos pasos de «Antes de empezar» (juego abierto, `node src/servidor.js`, variables del puente) y `Remove-Item data\vivo\worldbox.json -ErrorAction SilentlyContinue`.
2. Ensayo con bots sin gasto (los años se pueden acortar; un ensayo corto de ~2 min):

```powershell
node src/worldbox/correr.js --formato=era --adaptador=http --participantes=bot-era-militar,bot-era-economico --partidas=1 --grabacion --cuenta=3 --aviso-ms=2000 --lectura-ms=1500 --anio-muro=60 --anio-limite=90 --intervenciones=20,35,50 --intervenciones-guerra=1,3 --anios-espera-rasgos=5
```

   (O, sin recordar parámetros: `.\privado\worldbox\era-fase0\e5\correr-era.ps1 -Modo corto`, que lee el token del archivo sin imprimirlo.)

3. Partida completa con bots (sin gasto):

```powershell
node src/worldbox/correr.js --formato=era --adaptador=http --participantes=bot-era-militar,bot-era-economico --partidas=1 --grabacion
```

4. Partida con modelos (**cuesta dinero: solo con orden expresa**; ver el costo estimado en `worldbox-era.md`):

```powershell
node src/worldbox/correr.js --formato=era --adaptador=http --modelos=anthropic/claude-haiku-5.5,openai/gpt-6-luna --modo=pago --presupuesto=0.40 --presupuesto-modelo=0.20 --tarifa-entrada=0.1 --tarifa-salida=0.5 --partidas=1 --grabacion
```

**Orden de lo que pasa y qué se graba.** Antes de «Listo para grabar»: las llamadas de la etapa 1, la generación del mundo y la espera del aviso (fuera del video). Al pulsar grabar y pasar
la cuenta atrás aparecen las elecciones de la etapa 1 (una tras otra, `--lectura-ms` cada una) y el juego corre. En cada hito los dos modelos "piensan" a la vez (la capa dice «Las dos IAs
eligen a la vez, sin ver al rival…»); después se muestra la decisión de cada uno con su frase y la cámara hace zoom cerca. Cada año la capa muestra el **año**, la **fase** (borrador, desarrollo, guerra),
el estado del muro y la velocidad, y en cada tarjeta población, ciudades, territorio, ejército, puntos y lo que eligió (raza · mineral · bioma · rasgos, cuando el reglamento ya lo revela).
Al caer el muro la capa pasa a «Guerra abierta» y la cámara sigue a una civilización y luego a la otra. Tarjeta final con resultado y ganador.

**Estado en vivo de la era.** Esquema v1 de arriba más campos aditivos: `formato:"era"`, `anio`, `anio_muro`, `anio_limite`, `fase_era` (`borrador`/`desarrollo`/`guerra`/`fin`), `etapa`, `muro:{puesto}`, `guerra`,
`velocidad`, `llamada:{numero,de,tipo,fase,...}`, `pensando:[ids]` y, en cada facción, `ejercito`, `edificios` y `elegido:{raza,mineral,bioma,rasgos:[{slot,nombre}]}` (null mientras el reglamento lo oculta).
`turno` y `turnos` valen el año y el año límite para que una página antigua siga mostrando algo. La página usa `?demo=era` para ensayar el encuadre sin partida. Sin animaciones ni transiciones CSS (fallan en el CEF de OBS).

**Cortar y acelerar.** El orquestador escribe `linea-de-tiempo.json` en la carpeta de la partida: eventos con `t_real_s` = segundos reales desde «Listo para grabar» (por eso se pulsa grabar en ese
momento: el tiempo del video coincide). Después de grabar:

```powershell
node herramientas/worldbox-cortes.mjs --linea=data/pruebas/worldbox/<corrida>/linea-de-tiempo.json --video="grabaciones\<grabacion>.mkv" --calma=8 --calma-guerra=3
```

Escribe junto a la línea de tiempo `tramos.json` (tramos con velocidad: 1× en las llamadas de los modelos, la caída del muro, la guerra, las eliminaciones y los 3 s antes/12 s después de cada evento
importante; `--calma` × en el desarrollo tranquilo y `--calma-guerra` × en la guerra tranquila), `filtro.txt` (`filter_complex` con `trim`/`setpts`/`atempo`/`concat`) y `comando-ffmpeg.txt` (`ffmpeg -i ... -filter_complex_script ...`).
Ejecuta el comando de `comando-ffmpeg.txt`. El audio del juego (pista 1) se acelera con el video; la voz de la pista 2 se graba o se regraba sobre el resultado cortado. Un tramo acelerado no lleva narración.
Estimación (no medida con OBS ni con modelos): ver las duraciones por fase medidas en `privado/revisiones/E5-entrega.md`; la guerra a x5 es lenta a propósito, por eso `--calma-guerra=3` acelera sus tramos tranquilos.

## Después de grabar

La partida queda como cualquier otra en `data/pruebas/worldbox/<id>-1/` (`eventos.jsonl`, `reporte.json`). Audítala y revisa los
costos como siempre (`node src/worldbox/auditar.js <carpeta>`). Los textos públicos y los títulos siguen la regla de
`AGENTS.md`; este modo no genera voz ni paquete: la narración es la tuya.

# Práctica y grabación de la era con tus propias respuestas

Guía para quien **no programa** y usa PowerShell. Sirve para tres cosas: (1) darle a cada modelo el prompt **a mano, en su chat**, guardar sus respuestas y que el código arme la partida en WorldBox con ellas;
(2) **repetir muchas veces la misma partida** con las mismas respuestas guardadas para ensayar la grabación (tamaño del mapa, tipo de mapa, muro, cámara...); (3) familiarizarte con el juego
para, más adelante, **comentar la partida en vivo** sin perderte. La grabación «automática» sigue existiendo y no cambia ([`worldbox-grabacion.md`](worldbox-grabacion.md)); esto es la vía manual, con más control.

Reglamento: [`worldbox-era.md`](worldbox-era.md) (`era-1.0`). Nada de esto usa API de pago ni modelos por código: los modelos solo «juegan» a través de lo que tú pegas.

## 1. El flujo, de «copio el prompt» a «veo la partida»

```text
 1. Generas los prompts            node herramientas/worldbox-era-prompts.mjs
 2. Pegas el prompt en el chat de cada modelo y guardas su respuesta TAL CUAL
       respuestas-era/prueba1/a/borrador.txt      (modelo A)
       respuestas-era/prueba1/b/borrador.txt      (modelo B)
 3. Revisas las respuestas sin abrir el juego   node herramientas/worldbox-era-verificar.mjs --respuestas=respuestas-era/prueba1
       (si algo falla te dice el campo y las opciones válidas: se lo pegas a tu modelo y guardas su corrección en borrador.correccion.txt)
 4. Lanzas la partida                      .\worldbox-puente\grabar-era.ps1 -Modo respuestas -Respuestas respuestas-era\prueba1 -ModeloA <id> -ModeloB <id>
 5. La partida corre en WorldBox y deja la evidencia en data\era\partidas\<fecha>-<id>\
 6. Repites el paso 4 las veces que quieras, cambiando tamaño, mapa, muro, cámara... con las MISMAS respuestas
```

Comandos exactos (desde la carpeta del proyecto, en PowerShell):

```powershell
node herramientas/worldbox-era-prompts.mjs
node herramientas/worldbox-era-verificar.mjs --respuestas=respuestas-era/prueba1
.\worldbox-puente\grabar-era.ps1 -Modo respuestas -Respuestas respuestas-era\prueba1 -ModeloA anthropic/claude-sonnet-5.5 -ModeloB openai/gpt-6.1-sol
```

Para **probar el flujo sin chats**, hay respuestas de ejemplo escritas a mano (claramente marcadas como ejemplo, no son de ningún modelo):

```powershell
node herramientas/worldbox-era-verificar.mjs --respuestas=docs/ejemplos/era/respuestas-ejemplo
.\worldbox-puente\grabar-era.ps1 -Modo corto -Respuestas docs\ejemplos\era\respuestas-ejemplo
```

## 2. ¿Un prompt al inicio, uno por etapa, o asistido? Qué decidí

La partida le pregunta a cada modelo **8 veces** (3 de borrador + 5 intervenciones). Tres maneras de dárselas:

| Modo | Qué haces | Cuándo sirve | Por qué |
|---|---|---|---|
| **Borrador completo al inicio** (recomendado) | Un solo mensaje por modelo: texto de sistema + las tres etapas. El modelo responde un JSON con `etapa1`, `etapa2` y `etapa3`. Las 5 intervenciones quedan en **esperar**. | **Repetir muchas partidas con las mismas respuestas** y ensayar la grabación. | El borrador ya es a ciegas y simultáneo: ni en la etapa 2 ni en la 3 el modelo ve al rival (hasta cerrar las tres). Lo único que pierde frente al modo por API es ver sus propias cifras del año 6 y 11 (a esa edad son 4 a 20 habitantes). Un chat, un mensaje, una respuesta. |
| **Por etapas** | Un chat por modelo; mandas la etapa 1 (con el sistema), luego la 2 y la 3 con `node herramientas/worldbox-era-prompts.mjs --etapa=2 --participante=a --respuestas=<carpeta>`, que arma el mensaje con las elecciones que ese modelo ya hizo. | Si un modelo se pierde con el mensaje largo y prefieres ir de a poco. | Misma información que el borrador completo; solo cambia cuántos mensajes escribes. Cada respuesta se guarda en `a/etapa1.txt`, `a/etapa2.txt`... |
| **Asistido** | La partida se **pausa** en cada intervención (años 150, 300, 450 y guerra +1 y +3), te escribe el prompt con el estado real del mundo y espera tu Enter. | Cuando quieras que los modelos jueguen **también las intervenciones** viendo el mundo. Es la única forma de que decidan con datos reales. | Lo capturado queda guardado: **la partida siguiente ya puede repetirse sin preguntar** (`-Respuestas <esa carpeta>` o su `conversacion.json`). Hace falta estar delante (la partida completa tiene 5 pausas y cada una espera a tus dos chats). |

Se pueden **combinar**: primero el borrador completo y, con `-Modo asistido`, solo se te piden las intervenciones que falten. Si el archivo de una llamada ya existe, **no se pregunta**.

**Obligatorio:** las respuestas de las etapas 1, 2 y 3 de cada modelo (sin ellas la partida no arranca). **Opcional:** cada intervención (`desarrollo-1..3`, `guerra-1..2`): sin archivo, ese modelo **espera**. Las correcciones (`*.correccion.txt`) son opcionales y solo se usan si la respuesta original es inválida.

**Costo en tokens (estimado, 3,5 bytes por token; no medido con ningún tokenizador):** texto de sistema ≈ **11 500 tokens**, `1-borrador-completo.txt` ≈ **12 200**, cada mensaje de intervención 1 000 a 3 000 (el sistema se pega **una sola vez por chat**). Son chats: no cuesta API, pero cuenta contra el límite de uso de tu plan.
El texto de sistema ya trae el catálogo completo (razas, minerales, biomas, 67 rasgos) y el formato; no hay que explicar nada más al modelo.

## 3. Carpeta de respuestas

```text
respuestas-era/prueba1/
  a/borrador.txt                modelo A: las tres etapas en un JSON    (o etapa1.txt, etapa2.txt, etapa3.txt por separado)
  a/desarrollo-1.txt            opcional: intervención 1 del desarrollo (también desarrollo-2, desarrollo-3)
  a/guerra-1.txt                opcional: intervención 1 de la guerra   (también guerra-2)
  a/borrador.correccion.txt     opcional: la respuesta corregida si la primera fue inválida (también etapa1.correccion.txt...)
  b/...                         modelo B, igual
  participantes.json            opcional: {"a":{"modelo":"openai/gpt-6.1-sol","nombre":"GPT Sol","canal":"chat web"},"b":{...}}
```

* **Pega la respuesta tal cual**, con el texto que el chat ponga alrededor, con ` ```json `, con comentarios o comas de más: el lector extrae el JSON y te avisa de lo que ignoró. Si hay varios bloques JSON usa el último.
* Los nombres no distinguen mayúsculas ni `_`/`-`/espacio (`Etapa 2.TXT` vale); `.txt`, `.json` o `.md`.
* `-ModeloA` / `-ModeloB` (o `modelo` en `participantes.json`) declaran **qué modelo es cada uno**. En pantalla se muestra el nombre corto de ese id (`anthropic/claude-sonnet-5.5` → «Claude Sonnet»; un id desconocido se muestra en título: `mi-modelo` → «Mi Modelo»). Si los dos son el mismo, llevan letra (A, B). `nombre` y `canal` solo se guardan en la evidencia.
* Las carpetas `respuestas-era/` y `data/era/` están en `.gitignore`: **no se suben por accidente**.

### Cuando una respuesta es inválida

`worldbox-era-verificar.mjs` (y el inicio de cada partida) pasan tu respuesta por **el mismo validador del motor** y dicen el error exacto, por ejemplo:

```text
  ERROR    etapa2
      mente: «cast_shield» es un rasgo de la casilla «espiritu» (etapa 2), no de «mente». Ponlo en «espiritu» o usa «ninguno» aquí.
      fisico: «stonefist» no es una opción válida. ¿Quisiste decir «stonefists»? Opciones de la casilla «fisico»: ninguno, stonefists, gaia_shield, ...
      Qué hacer: pega estas líneas en el chat del modelo y guarda su respuesta corregida en b/borrador.correccion.txt (con las tres etapas en un solo JSON)
```

Pega esas líneas al modelo («tu respuesta fue inválida: …»), guarda **su** respuesta corregida en `*.correccion.txt` y repite la revisión. Es la regla del reglamento: **una corrección sin costo**. La partida **no arranca** con una respuesta inválida sin corrección (para no jugar con una «jugada por defecto» sin querer); con `-IgnorarInvalidas` (`--ignorar-invalidas`) juega igual, aplica la corrección única y la jugada por defecto del reglamento (−1 punto por elemento inválido). En la evidencia quedan el intento original y la corrección.
Prueba el flujo con `docs/ejemplos/era/respuestas-ejemplo-con-error` (trae errores a propósito y su corrección; borra `b/borrador.correccion.txt` para ver el bloqueo).

## 4. La evidencia (para la página, futura)

Cada partida con respuestas escribe en `data\era\partidas\<AAAAMMDD-HHMM>-<id>-1\` (además de `eventos.jsonl`, `reporte.json`, `linea-de-tiempo.json`, que ya existían):

| Archivo | Qué es | ¿Se publica? |
|---|---|---|
| `conversacion.json` | **Todo**, `tipo: "conversacion-era"`, `version: 1`: modelo y nombre declarados, canal, fecha, versiones (reglas, prompt, catálogo y sus hashes, envoltura manual), escenario (tamaño, plantilla, muro, años), por cada llamada: el prompt exacto de usuario y su hash, la respuesta **cruda**, lo que se leyó, la validación del motor, la corrección si la hubo, lo aplicado, y el resultado final. `origen`: `chat-manual`, `chat-manual-asistido` o `repeticion`. | **No** (privado: prompts y texto crudo). |
| `resumen-publico.json` | Solo elecciones (raza, mineral, bioma, rasgos con su nombre en español), una frase de justificación por decisión y el resultado. Nace con `"revisado": false`. | Solo cuando **tú** lo revises y lo copies a `data/publicas/` (AGENTS.md). El repo **no** lo publica solo. |
| `prompts/sistema.txt` | El texto de sistema exacto de esa partida. | No. |

Una prueba exige que el resumen público no contenga prompts, texto crudo, rutas ni hashes. Si `conversacion.json` está marcado `"ejemplo": true`, viene de las respuestas de ejemplo.

**Repetir una partida:** `-Respuestas data\era\partidas\<id>\conversacion.json` repite las **mismas** respuestas (y correcciones). El mundo de WorldBox **no es reproducible** (semilla no controla nada): las mismas decisiones darán otra partida; lo igual es lo que los modelos «dijeron».

## 5. Parámetros: qué cambiar para cada prueba

Se pasan al lanzador (`grabar-era.ps1`) o directamente a `node src/worldbox/correr.js --formato=era ...`. «Probado» = lo corrí contra el WorldBox real el 9-11-2026 (`privado/worldbox/era-fase0/e8/`).
**Importante:** el texto que leen los modelos depende de algunos parámetros (marcados «cambia el prompt»); si los cambias al jugar respecto de cuando generaste los prompts, los modelos leyeron otras reglas (la partida te avisa si el `manifiesto.json` no coincide).

### Escenario (el mundo)

| Parámetro (PowerShell / `--opción`) | Valores válidos | Efecto en pantalla | Notas medidas |
|---|---|---|---|
| `-Tamano` / `--tamano` | `tiny` 128, `small` 192 (omisión), `standard` 256, `large` 320, `huge` 384 casillas por lado. También `--mapa=N` (N ≥ 12; el puente lo redondea al tamaño más cercano). | Isla más grande o más chica; con más espacio la guerra tarda más en llegar. | **Probado los cinco:** espejo exacto (0 diferencias) y muro completo en todos. Ver §6. No cambia el prompt, que siempre dice «192 por 192». |
| `-Plantilla` / `--plantilla` | `continent` (omisión), `boring_plains`, `pancake` (las únicas que acepta el puente) | Forma y relieve de la isla. | **Probadas las tres**, con espejo y muro. En 2 de 6 mundos de `boring_plains`/`pancake` una civilización murió antes del año 10 (el rey de una fue matado por un animal y el reino se disolvió); en 0 de 8 de `continent`. Muestra pequeña. |
| `-MapaGuardado` / `--mapa-guardado` | `NOMBRE` (carpeta `era-mapas\NOMBRE\` en los datos del juego) o `slotN` | Carga ese mapa en lugar de generar uno; misma geografía en cada partida. | **Probado** `simetrico-prueba` (192, ya simétrico: 0 casillas cambiadas; muro en x 94-97). `slotN` **no probado**. Solo lee: no toca tus ranuras de guardado. |
| `-AnchoMuro` / `--ancho-muro` | `0` (sin muro) o 2 a 16 casillas (omisión 4) | La franja gris de montaña del centro. | **Probado** 0, 4, 8 y 16 (768, 1536, 3072 casillas de muro en small). Con 0 la guerra la declara el motor igual en `anio-muro`; el prompt dirá «MURO de 0 casillas» (solo para pruebas). Cambia el prompt. |
| `-SinVigilante` / `--sin-vigilante` | — (por omisión el vigilante está **activo**) | El **vigilante del muro** devuelve a su lado (junto a su ciudad más cercana) a toda unidad que cruce o pise el muro; sin él, el muro lo cruzan unidades andando (E9: hasta 64 a la vez en huge pancake). Con este interruptor no vigila: solo para pruebas. | Medido: 0,5 ms por revisión. `-VigilanteModo observar` (`--vigilante-modo=observar`) solo cuenta lo que cruza sin tocarlo; `eliminar` las mata. |
| `-SinUnicoReino` / `--sin-unico-reino` | — (por omisión **un solo reino por civilización**) | El juego parte a veces un reino en varios (un rey muere sin heredero: cada ciudad con líder se vuelve reino); el puente reúne al instante el derivado al reino principal (mismo nombre, color y bandera). Con este interruptor se ve el 1 vs 1 «sucio» de antes: pruebas. | Medido (E9): 5 escisiones en 480 años, todas reunidas en el mismo pulso. |
| `-Minerales` / `--cantidad-minerales` | 1 a 24 depósitos por lado (omisión 8) | Puntos de mineral cerca de cada capital. | Cambia el prompt. |
| `--unidades-iniciales` | 1 a 8 (omisión 4) | Habitantes con los que empieza cada civilización. | Cambia el prompt. |
| `-VelocidadDesarrollo` / `--velocidad-desarrollo` | `xN` con N de la lista del juego: x1 x2 x3 x4 x5 x10 x15 x20 x40 (omisión **x40**) | Cuánto corre el mundo antes de la guerra. | x40 = 1,27 s reales por año (medido en 10 mundos de 20 años: igual en todos los tamaños). |
| `-VelocidadGuerra` / `--velocidad-guerra` | igual (omisión **x5**) | Cuánto corre la guerra. | x5 ≈ 10 s por año de mundo (E5). |
| `-AnioMuro` / `--anio-muro` | entero ≥ 12 (el borrador termina en el año 11); omisión **500** | Año en que cae el muro y empieza la guerra. | Cambia el prompt. |
| `-AnioLimite` / `--anio-limite` | mayor que `anio-muro`; omisión muro + 150 = **650** | Fin por puntos si siguen vivas las dos. | Cambia el prompt. |
| `-Intervenciones` / `--intervenciones` | lista creciente, entre 12 y `anio-muro − 1`, p. ej. `150,300,450` (omisión) | Años en que se pregunta a los modelos (desarrollo). | Debe ser mayor que 11 + `anios-espera-rasgos`. Cambia el prompt. |
| `-IntervencionesGuerra` / `--intervenciones-guerra` | años **después** de la caída: `1,3` (omisión) | Intervenciones de guerra. Se omiten si ya hay un solo vivo. | Cambia el prompt. |
| `--anios-borrador` | ≥ 1 (omisión 5): etapas 2 y 3 en los años 1+N y 1+2N | Cuándo se aplican los rasgos. | Cambia el prompt. |
| `--anios-espera-rasgos` | 0 a 200 (omisión 20; 0 = sin comprobación) | Plazo para rasgos pendientes. | Cambia el prompt. |
| `--revelar` | `borrador` (omisión) o `etapa` | Cuándo se ve la elección del rival. | Cambia el prompt. |
| `-Semilla` / `--semilla` | entero | Solo se registra: WorldBox no la obedece. | — |

### Presentación y grabación

| Parámetro | Valores | Efecto |
|---|---|---|
| `-SinGrabacion` | — | Sin cuenta atrás, cámara automática ni capa de estado: la partida corre sola (ensayos). |
| `-Cuenta` / `--cuenta` | 0 a 600 s (omisión 15; 3 en corto) | Cuenta atrás tras «Listo para grabar». |
| `-AvisoMs` / `--aviso-ms` | 0 a 60 000 (omisión 6 000) | Espera para que se apague el aviso «Experimental mode is enabled» antes de contar. |
| `-LecturaMs` / `--lectura-ms` | 0 a 60 000 (omisión 4 000; 1 500 en corto) | Pausa tras cada decisión para leer el subtítulo. |
| `-FinMs` / `--fin-ms` | 0 a 120 000 (omisión 8 000) | Tarjeta final a la vista. |
| `-Zoom` / `--zoom` | 1 a 1000 | Zoom **único** (anula el automático). `--zoom-cerca/-medio/-lejos` (10 a 211; menor = más cerca; 60/110/211) por `-Extra '--zoom-cerca=40'`. |
| `-CamaraAuto` | — | Activa la cámara automática (enfoque a la facción activa y zoom por fase). **Por omisión la cámara es tuya** (`--sin-camara` implícito). |
| `-Interfaz` / `--interfaz-visible` | — | **No oculta la interfaz del juego**: ves sus botones y paneles. |
| `-Manual` / `--manual` | — | **Un Enter por decisión** (y al caer el muro) en la consola; comentas y sigues cuando quieras. Pide consola interactiva. |
| `--vivo=RUTA` | ruta | Dónde se escribe el estado que lee la capa de OBS. |
| `-Extra` | texto | Cualquier otra opción de `correr.js`, p. ej. `-Extra '--zoom-lejos=150','--sin-renovar-guerra'`. |

El lanzador valida valores (y `correr.js` también: un valor inválido se rechaza con `argumento_invalido` antes de tocar el juego).

### Nombre y color de los reinos (E10)

Por omisión cada reino lleva **el nombre y el color de su modelo** (`web/paleta.js`: Claude naranja, GPT marfil...), iguales en el juego, en la capa de OBS y en la evidencia. Reglas completas: [`worldbox-era.md` §1.2](worldbox-era.md).

| Parámetro (PowerShell / `--opción`) | Valores | Efecto |
|---|---|---|
| `-NombreReinoA` / `--nombre-reino-a`, `-NombreReinoB` / `--nombre-reino-b` | 1 a 24 caracteres: letras (con acentos), dígitos, espacio, `-`, `'`, `.`; distintos entre sí | Nombre del reino en el juego (etiqueta del mapa) y en la capa («Reino: …»). Omisión: el nombre de paleta del modelo («Claude», «GPT»; el mismo modelo dos veces, «Claude A»/«Claude B»). |
| `-ColorA` / `--color-a`, `-ColorB` / `--color-b` | `#RRGGBB` | Color exacto del reino (manda sobre la paleta y sobre la regla de contraste). |
| `-ColoresJuego` / `--colores-juego` | — | No envía color: el juego pone los suyos (la capa copia el que informa el puente). |
| `-SinCapaReinos` / `--sin-capa-reinos` | — | No enciende la capa de mapa «reinos» (sin ella el mapa muestra ciudades y no se ve el color del reino). |
| `-ModeloA` / `-ModeloB` (`--modelo-a/-b`) | id del modelo | De aquí sale el color (también en `-Modo mundo`). |

* `-NombreA`/`--nombre-a` y `--nombre-b` (solo con `--respuestas`, o `nombre` en `participantes.json`) son el nombre del **modelo** en la capa y la evidencia, **no** del reino. El nombre por omisión del reino nunca copia ese nombre declarado (evita «GPT Sol (EJEMPLO)» en el mapa).
* Dos modelos de la misma familia o de colores parecidos: el segundo usa una variante de su color (ver el reglamento); `conversacion.json` y `resumen-publico.json` traen `reino`, `color` y la regla aplicada.
* El puente deja encendida la capa «reinos» (es una preferencia tuya del juego; se vuelve a cambiar desde la barra de capas). Ejemplos: `.worldbox-puentegrabar-era.ps1 -Modo respuestas -Respuestas respuestas-eraprueba1 -ModeloA anthropic/claude-sonnet-5.5 -ModeloB openai/gpt-6.1-sol -NombreReinoA "Reino del Alba" -NombreReinoB "Imperio Marfil"`, o `-ColorA '#2E86DE' -ColorB '#F5B041'`.

## 6. Tamaños y plantillas: lo que medí en vivo

Mundo creado con `herramientas/worldbox-era-mundo.mjs` (`-Modo mundo`), seed 3, 20 años a x40, juego sin OBS grabando. Capturas en `privado/worldbox/era-fase0/e8/*.png`.

| Tamaño | Casillas | Generar el mundo | Casillas espejadas | Muro (4) | Años 1-20 a x40 |
|---|---|---|---|---|---|
| tiny | 128 | 0,43 s | 4 720, 0 diferencias | 512 casillas | 1,27 s por año |
| small | 192 | 0,5 a 0,6 s (0,9 a 1,2 s en algunas) | ≈ 9 000 a 10 300, 0 diferencias | 768 | 1,27 s por año |
| standard | 256 | 0,85 s | 15 674, 0 | 1 024 | 1,27 s por año |
| large | 320 | 1,4 s | 27 334, 0 | 1 280 | 1,27 s por año |
| huge | 384 | 1,9 s | 36 799, 0 | 1 536 | 1,27 s por año |

* **El espejo y el muro funcionan en los cinco tamaños y en las tres plantillas**, con muro de 0, 4, 8 y 16 y con el mapa guardado `simetrico-prueba` (0 diferencias en las 11 configuraciones).
* Con 20 años y 4 a 60 habitantes **el tiempo por año de mundo no depende del tamaño** (mediana 1 267 a 1 272 ms). **No medí** 500 años en mapas grandes (más población y edificios sí podrían costar más) ni FPS con OBS grabando.
* A zoom 211 el mapa entero cabe en pantalla, pero **no queda centrado** (la cámara sigue a una civilización): en `huge` el centro del continente queda a la derecha y el borde inferior se corta. Con `-CamaraAuto` pasa esto; por omisión la cámara es tuya.
* Un mundo puede acabar muy pronto: lo vi 2 veces de 14 (año 7 y 10, plantillas `pancake` y `boring_plains`). Es azar del juego (animales, hambre), no del código; si pasa, repite.

## 7. Recetas listas para copiar

Todas desde la carpeta del proyecto. `-Respuestas` es opcional: sin él juegan bots de prueba. Añade `-SinGrabacion` si no vas a grabar.

```powershell
# Ensayo rápido de ~4 min (muro en el año 60, límite 90), con tus respuestas y con la capa de OBS
.\worldbox-puente\grabar-era.ps1 -Modo corto -Respuestas respuestas-era\prueba1

# Ensayo rápido de bots, sin OBS ni capa
.\worldbox-puente\grabar-era.ps1 -Modo corto -SinGrabacion

# Partida completa de ~37 min (muro 500, límite 650), con tus respuestas
.\worldbox-puente\grabar-era.ps1 -Modo respuestas -Respuestas respuestas-era\prueba1

# Mapa grande (ensayo corto)
.\worldbox-puente\grabar-era.ps1 -Modo corto -Respuestas respuestas-era\prueba1 -Tamano huge

# Sin muro (ensayo corto): la guerra la declara el motor en el año 60 igual
.\worldbox-puente\grabar-era.ps1 -Modo corto -Respuestas respuestas-era\prueba1 -AnchoMuro 0

# Solo mirar el mapa: crea el mundo y lo deja pausado para explorarlo (Enter suelta el juego)
.\worldbox-puente\grabar-era.ps1 -Modo mundo -Tamano large -Plantilla pancake -AnchoMuro 8
.\worldbox-puente\grabar-era.ps1 -Modo mundo -Respuestas respuestas-era\prueba1 -Anios 30      # además avanza 30 años y mide

# Comentar EN VIVO: cámara tuya, interfaz del juego a la vista y un Enter por decisión
.\worldbox-puente\grabar-era.ps1 -Modo respuestas -Respuestas respuestas-era\prueba1 -Calendario corto -Manual -Interfaz

# Modo asistido: la partida se pausa en cada intervención y te pide el prompt
.\worldbox-puente\grabar-era.ps1 -Modo asistido -Respuestas respuestas-era\prueba1

# Repetir una partida anterior con las mismas respuestas
.\worldbox-puente\grabar-era.ps1 -Modo respuestas -Respuestas data\era\partidas\<id>\conversacion.json
```

Duraciones (con la velocidad por omisión): corto ≈ 4 min; completo ≈ 37 min si ninguna civilización cae (medido con bots en E5: 11,2 min de desarrollo + 25,6 min de guerra a x5), de 12 a 15 min si cae una pronto; `mundo` ≈ lo que tardes tú. Con `-Manual` y `-Asistido` el tiempo lo pones tú.
**Probado en vivo el 9-11-2026** (juego real, sin OBS grabando, respuestas de ejemplo): «ensayo rápido con tus respuestas» 136 s (la civilización B cayó en el año 62, partida terminada por eliminación); «mapa grande» (`huge`) 161 s (eliminación en el año 64); «sin muro» 163 s (eliminación en el año 64); «ensayo de bots sin grabar» 173 s (eliminación en el año 69); «solo mirar el mapa» (`large`, `pancake`, muro 8) mundo creado en 1,3 s. Con las respuestas de ejemplo gana siempre A porque B pierde pronto: es azar y respuestas de ejemplo, no una conclusión. Detalle en `privado/revisiones/E8-entrega.md`.

## 8. OBS: el orden de las fuentes

1. Escena a 4K (3840 × 2160), como en [`worldbox-grabacion.md`](worldbox-grabacion.md).
2. Fuentes **de abajo hacia arriba**: «Captura de ventana» de WorldBox (Ctrl+F para ajustar a pantalla) y **encima** la fuente «Navegador» con `http://localhost:4321/worldbox-vivo.html?formato=16x9` (3840 × 2160, CSS vacío). Si la capa queda **debajo**, el juego la tapa y no ves el año, la fase ni las elecciones.
3. Pulsa **grabar** cuando la consola diga «Listo para grabar» (la línea de tiempo cuenta desde ahí).
4. Para comentar con el juego a la vista sin la capa: oculta la fuente Navegador (el ojo) o ten una segunda escena solo con la captura. La capa y el juego son **dos fuentes de la misma escena**; no hay que reiniciar nada para alternar.

`grabar-era.ps1` imprime este recordatorio, levanta `node src/servidor.js` (puerto 4321) si no está y lo detiene al terminar (si ya estaba abierto, no lo toca).

## 9. Qué mirar mientras comentas en vivo

### En la capa de OBS (`worldbox-vivo.html`)

Año de juego y **fase** (Borrador, Desarrollo, Guerra), estado del **muro** y velocidad; por civilización: población, ciudades, territorio, ejército y puntos, y lo que eligió (raza · mineral · bioma · rasgos) **cuando el reglamento ya lo revela** (tras cerrar las tres etapas); en cada decisión, la acción en una frase y la **justificación** del modelo (máximo 160 caracteres); «Las dos IAs eligen a la vez, sin ver al rival…» mientras piensan; tarjeta final con ganador. Con `-Manual` la decisión queda a la vista hasta tu Enter.

### En el juego (verificado con capturas de esta tarea, interfaz en español, WorldBox 0.51.2)

| Qué quieres ver | Dónde | Visto |
|---|---|---|
| **Año, era y población total** | Barra inferior: «Año N» y la era («Era de la Esperanza»), y a su derecha el cuadro «Población Sapiente / Criaturas / Fallecimientos totales / Infectados / Edificios / Vegetación». | Sí (`small-continent.png`). |
| **Información del mundo** | Icono del globo con lupa en el bloque de iconos de la izquierda de la barra inferior: ventana con el nombre del mundo y «Antigüedad mundial», «Población Sapiente», «Edificios», «Islas», «Criaturas nacidas»... | Sí (`ui-globo.png`). |
| **Estadísticas** | Icono de barras de colores (segunda fila de iconos): ventana «Estadísticas» con «Tiempo de juego total», «Criaturas creadas», «Subespecies creadas/extintas»... Son cifras **acumuladas de toda la sesión del juego**, no de esta partida. | Sí (`ui-barras.png`). |
| **Cultura de una civilización** | **Clic en la etiqueta** con el nombre del pueblo (p. ej. «Kraszastaw 29», el número es su población) en el mapa: se resalta su territorio y abajo sale el panel de cultura con «Rasgos», nombres de habitantes y varias cifras de esa cultura. La ventanita dice «Fundado en», «Reinos», «Pueblos», «Libros», «Feliz», «Adultos/Niños», «Reyes/Líderes», «Muertes». | Sí (`ui-ciudad.png`). |
| **Territorio de cada lado** | Al seleccionar la cultura se tiñe su territorio en el mapa. | Sí. |
| **El muro** | La franja gris vertical del centro; desaparece al caer. | Sí. |
| **Registro de mensajes** | Arriba a la izquierda: «El reino X ha sido fundado», «El rey … ha sido asesinado por …», «El reino X ha sido disuelto». Es donde se ven reinos que nacen y caen. | Sí (`small-pancake.png`). |
| **Información de reino, de ciudad, de subespecie, mapa político y capas** | Existen en el juego (pestañas de la barra superior de iconos y paneles al seleccionar una ciudad o un habitante), pero **no abrí esas ventanas ni vi sus nombres exactos**: no los afirmo. | **No verificado** |

Cuando abres una ventana, la barra de iconos de abajo se pasa a una columna a la izquierda; para cerrarla, la **X roja** de su esquina superior derecha. Con `-Interfaz` todo esto es clicable; sin esa opción el script oculta la interfaz y **ninguna de estas ventanas está disponible** (para grabar limpio).

**Eventos que buscar** (todos salen en el registro de mensajes y en la línea de tiempo): `guerra` y `muro_cae` (año del muro), `ciudad_conquistada`, `reino_partido` («Nace un reino nuevo dentro de…»), `reino_cae`, `paz` (el motor vuelve a declarar la guerra), `eliminacion`. Hambre y rebeliones: las rebeliones y desastres están **apagados** por reglamento; un reino puede disolverse igual (lo vi: un rey asesinado por un animal y reino disuelto en el año 7).

## 10. Si algo falla

| Síntoma | Qué hacer |
|---|---|
| `No hay token del puente` | `.\worldbox-puente\integracion.ps1 reiniciar` (compila, instala la DLL y abre el juego; activa el modo experimental si lo pide). |
| `El puente no responde` | Con el juego en el menú principal (no cargando) vuelve a intentar. |
| `respuestas_invalidas` | Lee el informe de arriba, corrige con tu modelo y guarda `*.correccion.txt`. |
| El mundo termina en 7-10 años | Azar del juego (ver §6); repite. |
| `asistido_requiere_consola` | `-Modo asistido` y `-Manual` necesitan una consola interactiva (no una tubería). |
| La capa no muestra nada | El orden de fuentes en OBS (la capa **arriba**) y que `node src/servidor.js` esté corriendo. |

## 11. Lo que esta guía **no** afirma

* Los modelos reales no han jugado: el flujo se probó con respuestas de ejemplo escritas a mano, bots y el simulador. `-Modo asistido` y `-Manual` están **probados con pruebas automáticas** (consola simulada), **no en una consola real**.
* La partida completa de 37 min con respuestas guardadas **no se volvió a correr** en esta tarea; sí el ensayo corto, los mundos de todos los tamaños y plantillas y las recetas de «mapa grande», «sin muro», «bots sin grabar» y «solo mirar el mapa» (§7).
* Rendimiento con OBS grabando, FPS y mapas grandes a 500 años: no medidos.
* Cambiar el tamaño, la plantilla o el muro **no cambia el prompt** de tamaño (dice «192 por 192» y «muro de N casillas»): los modelos pueden razonar sobre un mapa que no es el que se juega. Para una partida oficial, usa los valores por omisión.
* Un **ajuste de robustez** en el reglamento: si una respuesta sigue inválida tras la corrección y trae una errata (una raza, un mineral o un rasgo que no existe), la jugada por defecto ahora **descarta ese valor** en vez de enviarlo al juego (antes la partida se caía al crear el mundo). No cambia ninguna regla de una partida válida ni sube `rules_version`.

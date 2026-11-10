# Formato «era» sobre el WorldBox real — `era-1.0`

Versión de reglas: **`rules_version = era-1.0`**. Versión del texto que reciben los modelos: **`prompt_version = era-1.0`**. Es un reglamento
NUEVO, hermano de `auge-real-1.1.0` ([`worldbox-reglas.md`](worldbox-reglas.md)), que sigue funcionando sin cambios. Dos modelos arman una
civilización por etapas, a ciegas y a la vez, y luego dejan que el juego corra 500 años en un mapa simétrico separado por un muro; al caer el
muro el motor declara la guerra. Gana la última civilización viva o, tras 150 años de guerra, la de más puntos. Cada llamada a un modelo es una
decisión puntual: **8 llamadas por modelo** en toda la partida.

Todo lo que sigue sale de mediciones en el juego real (`privado/revisiones/E1-entrega.md`, `E2-entrega.md`, y la investigación de efectos de E3 en
`privado/worldbox/era-fase0/e3/rasgos-efecto.json`) o es una **decisión de diseño** y así se dice. Cambiar una cifra de este documento, del
catálogo (`src/worldbox/era/catalogo-era.json`) o de `src/worldbox/era/reglas-era.js` es cambiar el reglamento: se sube `rules_version` (y
`prompt_version` si cambia el texto), y los resultados de versiones distintas no se comparan como equivalentes. Las pruebas
(`src/pruebas/worldbox/era-*.test.js`) fijan cada cifra.

**Edición en sitio (E5, 8-11-2026).** `era-1.0` no se había jugado nunca con modelos reales, así que E5 la corrigió **sin subir `rules_version` ni `prompt_version`**: catálogo `era-1.0.catalogo-2`
regenerado sobre el JSON final de E3, mantenimiento de rasgos (sección 4.1), guerra lenta con intervenciones relativas a la caída del muro (secciones 1 y 2) y tope de rasgos «fuertes». Cualquier resultado de
una partida anterior a E5 (solo hubo ensayos con bots) **no es comparable**. A partir de la primera partida con modelos, cada cambio sube la versión.

**Segunda edición en sitio (E6, 9-11-2026).** Tras una tanda de bots por raza y una arena de dones en el juego real (sección 4.2), siguen sin subir `rules_version` ni `prompt_version` porque `era-1.0` aún no se ha jugado con modelos: **3 razas podadas** (`civ_beetle`, `civ_piranha`, `civ_candy_man`: quedan 36 ofrecidas de 39), los textos de cuatro dones de conducta y de `enhanced_strength` citan su medición, y los motivos de exclusión de los dones de combate llevan la cifra medida. Ningún costo cambió. Evidencia: `privado/revisiones/E6-entrega.md`.

## 1. Partida

| Cosa | Valor | De dónde |
|---|---|---|
| Civilizaciones | 2, ids `f1` y `f2` (solo en el log y el motor; el modelo nunca los ve como asientos) | decisión |
| Mapa | `small` 192×192, plantilla `continent`, **simétrico**: la mitad izquierda es el espejo exacto de la derecha (terreno, flora, sitio de la capital, calidad de sitio idéntica) | E2 (0 diferencias en 18 432 pares) |
| Muro | franja de montaña de 4 casillas (ancho par 2..16) que cruza el mapa de **borde a borde**, agua y océano profundo incluidos, con un **vigilante** que devuelve a su lado a toda unidad que lo cruce (sección 1.1); **cae por código en el año 500** (`POST /v1/era/muro`); el resto del mapa queda idéntico | E1, E2, E9 |
| Tiempo | 1 año = 60 s de mundo; el año es `1 + ⌊t/60⌋` | E1 |
| Inicio | 1 ciudad y 4 habitantes por civilización | W5 |
| Velocidad | desarrollo (años 1–499) **x40**, guerra **x5** (lenta, para que se vea; E5); configurables (`--velocidad-desarrollo`, `--velocidad-guerra`). El puente cambia la velocidad entre avances con `POST /v1/era/velocidad` (E4); sin esa capacidad, toda la partida va a la del escenario y queda anotado | E1 (x40 estable 376 años, x20 354), E3 (x40 = 1,27 s reales por año; la guerra elimina a una civilización en ~3 años de mundo en 3 de 4 corridas) |
| Paso de avance | 60 s de mundo (1 año) en el desarrollo; **20 s en la guerra** (`--segundos-avance-guerra`): el orquestador mira el estado tres veces por año y no deja pasar una eliminación sin observarla | E5 |
| Edad del mundo | fija en `age_hope` y pausada | E2 |
| Leyes del mundo | **rebeliones, desastres naturales y otros desastres apagados**; el resto, como las trae el juego | decisión (sección 8) |
| Fin por años | año **650** (muro + 150), parametrizable (`--anio-limite`) | decisión |

Años por minuto real (E1, E3, E5): x40 = 47 años/min (1,27 s por año), x20 = 23,7 años/min, **x5 ≈ 6 años/min (≈ 10 s por año)**. Duración de una partida por omisión **medida en el juego real con bots** (E5, `privado/revisiones/E5-entrega.md`): **11,2 min hasta la caída del muro** (499 años a x40, con las 3 etapas y las 3 intervenciones de desarrollo con
`--lectura-ms=1500`) y **25,6 min de guerra a x5 hasta el año 650** (10,2 s por año): **36,8 min en total** cuando no cae ninguna civilización; más las llamadas a los modelos y las pausas de lectura de la grabación; la **guerra a x5** dura ≈ 10 s reales por año
de mundo: si una civilización cae en pocos años (3 de 4 corridas de E3: ~3 años), son de 0,5 a 3 min; si las dos llegan al año 650 (150 años de guerra) serían **≈ 25 min**. Por eso `worldbox-cortes` acelera la calma de la guerra (sección 12).

**Una civilización es la suma de todos los reinos derivados de su fundación** (rebeliones, escisiones): población, ciudades, territorio, ejército,
edificios y `vivo` suman el reino fundador y todos los que nazcan de él (`contar_derivados`, ya soportado por el puente; E2 lo probó con una
rebelión forzada y una escisión espontánea). Una civilización queda eliminada solo cuando muere el último de sus reinos. Que caiga el reino
fundador no es una derrota.

### 1.1 Muro total, vigilante y un solo reino por civilización (E9, 9-11-2026)

Un jugador (huge, pancake, muro de 6, x1) vio unidades al otro lado del muro entre los años 400 y 500, y reinos subdivididos. Medido en el juego real, con bots, sin API de pago, sin rasgos
(evidencia: `privado/worldbox/era-fase0/e9/`, informe `privado/revisiones/E9-entrega.md`):

* **El muro nunca se rompió; lo cruzan las unidades.** El muro ya cubría las 384 filas de punta a punta (océano profundo incluido: la casilla pasa a `mountains`, capa `Block`, que no deja pasar barcos),
  y en 480 años no se rompió ninguna casilla (0 en cada comprobación). Lo que ocurre es que **unidades de las dos civilizaciones aparecen al otro lado**: a los ~30 años ya hay una **sobre** la montaña,
  y entre los años 100 y 480 cruzan unas 85 unidades distintas por siglo (huge pancake: 409 en 480 años; hasta 64 al mismo tiempo del lado contrario). Todas eran humanos en tierra (ninguna voladora, ni barco, ni en agua
  salvo 2 casos); la mayoría se movió menos de 25 casillas entre dos revisiones (10 s de mundo) y se vio antes sobre su lado correcto o sobre el muro. Es decir, **cruzan andando por encima de la montaña** (probablemente
  los movimientos en línea recta hacia un objetivo, que no usan el buscador de caminos); el mecanismo exacto del juego no se aisló. No es una casilla rota ni un hueco del muro: por eso no se arregla ensanchándolo.
* **Vigilante (activo por omisión):** mientras exista el muro, cada 0,25 s reales revisa las unidades vivas de las dos civilizaciones; la que está sobre el muro o del lado contrario se **devuelve** junto a la ciudad
  más cercana de su civilización (`cancelAllBeh` + `spawnOn`; barcos o sin ciudad: se eliminan) y el evento `muro_vigilante` queda en la línea de tiempo con la cantidad y la causa. Cada 5 s también repara cualquier casilla
  del muro que pierda su tipo. Resultado con el mismo mapa: **sin vigilante hasta 64 unidades del lado contrario (47 al final, 409 distintas en 480 años); con vigilante, 1 como máximo en las 96 comprobaciones independientes
  (sonda cada 5 años) y 0 en las demás**. Costo: 0,5 ms por revisión (máximo 1,8 ms) en una partida de 480 años con hasta 4 000 unidades; no cambia los FPS. `observar` solo cuenta; `eliminar` las mata.
* **Un solo reino por civilización (activo por omisión).** Las escisiones salen del propio juego: al morir un rey sin heredero de su clan real, `checkKingdomChaos` convierte cada ciudad con líder en su propio reino
  («el reino se desmorona»); otras causas son `shattered_crown` (rasgo de cultura), el hechizo `useInspire` y un colono que funda una ciudad. Apagar `world_law_rebellions` no las evita (E2, E3), y no hay ley que lo impida.
  Por eso el puente **reúne de inmediato** (en el siguiente pulso de 0,25 s reales) todo reino derivado al reino principal de su civilización con `City.joinAnotherKingdom`; las ciudades toman el nombre, color y bandera del
  principal. Sin vigilante ni reino único (`--sin-vigilante --sin-unico-reino`) la partida es la de antes: sin reino único, la civilización B de un ensayo se partió en 4 reinos en el año 294 y siguió así 186 años.
  Una ciudad capturada en la guerra no se revierte (ya pertenece, por linaje, a la civilización que la tiene). El prompt de `era-1.0` **no cambia**: sigue siendo cierto que «los reinos nuevos siguen siendo tuyos» si algo falla.
* **Cómo apagarlos para pruebas:** `grabar-era.ps1 -SinVigilante -SinUnicoReino` (o `-VigilanteModo observar|eliminar`), CLI `--sin-vigilante --sin-unico-reino --vigilante-modo=...`, API `opciones.era.vigilante` / `unico_reino`
  (protocolo, «Control del 1 vs 1»). `era-1.0` no se ha jugado con modelos: no sube `rules_version` (edición en sitio, como E6).

### 1.2 Nombre y color de los reinos (E10, 9-11-2026)

Cada civilización se presenta con el **nombre de su reino** y el **color de su modelo**, iguales en el juego, en la capa de OBS (`web/worldbox-vivo.html`) y en la evidencia. No toca las reglas ni el prompt de los modelos (`era-1.0` sigue sin jugarse con modelos: edición en sitio, sin subir `rules_version`/`prompt_version`).

* **Color por modelo** (`src/worldbox/era/presentacion-era.js`). La fuente es `web/paleta.js` (claude `#D97757`, gpt `#F4F4F2`, gemini `#4285F4`, grok, mistral, qwen, glm, kimi, minimax, llama, deepseek...): el id del modelo se traduce a su clave de paleta (tabla exacta de `src/worldbox/vivo.js` y, para ids nuevos, el proveedor: `anthropic`→claude, `openai`→gpt, `google`→gemini, `x-ai`→grok, `mistralai`→mistral...). El juego admite colores propios exactos: el reino queda con **el hex de la paleta, sin aproximar** (comprobado: `color_aplicado` = pedido).
* **Dos modelos de la misma familia, o colores que se parecen** (separación en Lab CIE76 < 30, la métrica de `src/pruebas/paleta.test.js`): el reino A conserva el color de marca y el B usa una **variante del color de su familia** mezclada con negro o con blanco (la que más lo separe, con la primera proporción que llegue a 30): claude/claude → B `#774130` (marrón); gpt/gpt → B `#9F9F9D` (gris); la separación mínima queda en 30 y la tabla se imprime en la evidencia (`regla_color`: `marca`, `familia`, `parecido`, `manual`, `neutro`, `juego`). Haiku frente a Sonnet o Luna frente a Sol cuentan como la misma familia. Mistral frente a Claude (dos naranjas, separación 35,7) no necesitan variante.
* **Modelos fuera de la paleta y bots**: colores neutros distintos por posición (`#7FA6C9`, `#C9A27F`).
* **A mano:** `--color-a=#RRGGBB --color-b=#RRGGBB` mandan sobre todo. **`--colores-juego`** no envía color: el juego pone los suyos y la capa adopta el color que el puente informa.
* **Nombre del reino:** por omisión el nombre de paleta del modelo («Claude», «GPT»; el mismo modelo dos veces: «Claude A»/«Claude B»). `--nombre-reino-a=... --nombre-reino-b=...`: 1 a 24 caracteres, letras (con acentos), dígitos, espacio, `-`, `'`, `.`; no pueden ser iguales entre sí (sin distinguir mayúsculas). **No se confunden tres nombres:** `--nombre-a/-b` (con `--respuestas`) es el nombre del **modelo** en la capa y en la evidencia («Claude Sonnet»); `--nombre-reino-a/-b` es el nombre del **reino** (lo que dice el mapa del juego y la línea «Reino: …» bajo el nombre del modelo en la capa); `--modelo-a/-b` es el id real, del que sale el color.
* **Lo que se ve en el juego:** WorldBox muestra por omisión el mapa de **ciudades** (etiquetas con el nombre de cada ciudad, que genera el juego, y banderas de colores propios): el color y el nombre del reino solo aparecen en la capa de mapa «reinos». Con colores/nombres el puente la enciende (`opciones.era.mapa_reinos`, `--sin-capa-reinos` la deja como esté); entonces el territorio se tiñe y la etiqueta dice, p. ej., «Reino de Claude 190» (el número es su población). Las ciudades conservan su nombre propio.
* **Persistencia:** el puente reaplica color y nombre al reino principal en cada pulso, así que sobreviven a la reunificación por `unico_reino` y a la caída del fundador; una ciudad conquistada pasa al color del conquistador (esperado). La reunificación **no se forzó en vivo** en esta tarea (no ocurrió en las partidas medidas): está cubierta por el código y la prueba de la lógica, no por una captura.
* **Contraste con el terreno:** medido con capturas del juego real (`privado/worldbox/era-fase0/e10/`): el naranja de Claude y el azul de Gemini se leen sobre pasto, montaña y arena; el **marfil de GPT** se ve como territorio claro y translúcido, bien sobre pasto y montaña pero **flojo sobre arena y nieve**; la variante marrón oscura (#774130) pierde contraste sobre bosque rojizo. El territorio es translúcido y la etiqueta añade el nombre; si una partida lo necesita, `--color-a/--color-b` lo corrige. No se añadió contorno propio: el borde lo dibuja el juego.

## 2. Calendario (8 llamadas por modelo)

| N.º | Año (omisión) | Hito | Qué decide el modelo |
|---:|---:|---|---|
| 1 | antes del año 1 | **Etapa 1** | raza, mineral y bioma (opcional) |
| 2 | 6 (= 1 + 5) | **Etapa 2** | un rasgo por casilla: cognitivo, mente, espíritu, físico, apariencia |
| 3 | 11 (= 1 + 2×5) | **Etapa 3** | un rasgo por casilla: arquitectura, plano, edificios, política, sucesión, impuestos |
| 4 | 150 | Intervención 1 (desarrollo) | hasta 3 acciones |
| 5 | 300 | Intervención 2 (desarrollo) | hasta 3 acciones |
| 6 | 450 | Intervención 3 (desarrollo) | hasta 3 acciones |
| — | 31 (etapa 3 + 20) | **Comprobación de rasgos pendientes** (no es una llamada; E5) | nada |
| — | **500** | **Cae el muro; el motor declara la guerra; la velocidad pasa a x5** | nada |
| 7 | 501 (muro + 1) | Intervención 1 (guerra) | hasta 3 acciones, con poderes contra el rival |
| 8 | 503 (muro + 3) | Intervención 2 (guerra) | ídem |
| — | 650 | Fin por puntos (si siguen vivas las dos) | nada |

Las intervenciones de guerra son **relativas a la caída del muro** (`--intervenciones-guerra=1,3`: años 501 y 503; E3 vio la eliminación de una civilización en ~3 años). **Si cuando toca una intervención ya hay una
sola civilización viva, se omite** (evento `intervencion_omitida`, sin llamar a nadie): una partida puede tener menos de 8 llamadas por modelo. La comprobación de rasgos pendientes
(`--anios-espera-rasgos=20`) debe caer antes de la primera intervención. Los años entre etapas (`--anios-borrador`, 5), los de las intervenciones (`--intervenciones=150,300,450`, `--intervenciones-guerra=1,3`), el del
muro (`--anio-muro`) y el del límite (`--anio-limite`) se pasan por la línea de comandos y se validan (`validarPartida`: el borrador termina antes
de la primera intervención, las intervenciones van en orden y la guerra cabe antes del límite).

**Revelado (`--revelar`, por omisión `borrador`).** El borrador es **a ciegas y simultáneo**: los dos modelos reciben la misma etapa a la vez y
ninguno ve la elección del otro. Con `borrador` el rival (sus cifras y sus elecciones) queda oculto hasta cerrarse **las tres** etapas; con `etapa`,
cada etapa se revela al cerrarse. En las intervenciones se ve todo. Decisión de diseño pendiente de confirmar (E4-entrega).

## 3. Orden de resolución

1. **Etapa 1** (sin mundo todavía): los dos eligen a la vez. El motor valida (sección 4) y crea el mundo con `POST /v1/escenario/reiniciar`
   y `opciones.era`: espejo, muro, biomas, **8 depósitos del mineral de cada civilización** (mismas posiciones espejadas, radio 14), leyes, edad
   fija y velocidad de desarrollo. Si el juego no encuentra sitio (`error_interno`), se genera otro mapa, hasta 3 veces; si no, no hay partida.
2. Corren los años. Cada `avanzar` de 60 s de mundo (1 año) va seguido de una lectura del estado de la era.
3. En cada hito del calendario las llamadas a los dos modelos son **simultáneas**. Cada respuesta se valida; si es inválida, **una corrección**
   (sección 9); luego se aplica con el juego pausado: rasgos de las etapas 2 y 3 por `POST /v1/era/rasgos` (un POST por tipo y civilización, con
   `parcial:true`: lo que el juego rechaza no se aplica; cultura, idioma, religión y clan van además con `mantener:true`, sección 4.1), y las acciones de las intervenciones **en el orden del arreglo, un
   participante tras otro** (el orden rota con la intervención).
4. Año 500: se quita el muro, la velocidad pasa a la de guerra (x5), el avance baja a pasos de 20 s, el motor ejecuta `declarar_guerra` (de `f1` a `f2`; si el juego la rechaza, de
   `f2` a `f1`) y se registra. **Si una guerra termina en paz, el motor la vuelve a declarar** al año siguiente (`ya_en_guerra` si sigue abierta);
   `--sin-renovar-guerra` lo apaga.
5. Fin: una sola civilización viva (confirmada por `estado-terminal`) o año 650.

## 4. Borrador: costos y presupuestos

Decisión de diseño: cada opción tiene un **costo en puntos** y cada etapa un **presupuesto**; elegir "ninguno" en una casilla ahorra sus puntos.
Los números son una **primera calibración sin partidas con modelos**: salen de la rareza del juego y de la intensidad medida, no de un estudio de
equilibrio.

**Etapa 1 — presupuesto 4** (mineral + bioma; la raza no cuesta):

* Raza: 39 especies civilizadas en el catálogo (`human`, `elf`, `orc`, `dwarf` y 35 `civ_*`), **36 ofrecidas** tras la poda de E6 (sección 4.2: `civ_beetle`, `civ_piranha` y `civ_candy_man` siguen en el catálogo con `ofrecible:false` y su motivo). **No están equilibradas**: E6 midió 246 guerras contra el humano a los 40 años de desarrollo y 49 a los 120; a los 40 años destacan `civ_fox`, `civ_armadillo`, `civ_hyena`, `civ_unicorn` (6 de 6 victorias) y a los 120 años `civ_fox` (población ×2,5 la del humano), y varias razas (elfo, lobo, capibara, liliar…) arrancan lento y se recuperan; ver la tabla de E6.
* Mineral (costo): stone 0, gems 0, metals 1, gold 1, silver 2, bones 2, mythril 3, adamantine 4. Un depósito es **de un solo uso** y su efecto es
  **pequeño** (E2: 1 pieza de equipo por depósito; 8 depósitos ≈ ≤8 piezas en una población de cientos). El prompt lo dice.
* Bioma (opcional): 21. Costo 0, salvo `biome_celestial` y `biome_infernal` (1: el juego dice que en ellos crecen solos el mythril y el adamantino;
  no medido). Medido (E2): el bioma decide qué razas pueden fundar, la velocidad de paso (desierto 0,7; permafrost 0,8; pantano 0,6) y qué mineral
  crece; **no se pudo demostrar ventaja** (el ruido entre partidas es del orden de ±30 habitantes).
* **Compatibilidad raza-bioma** (E2, `GET /v1/era/catalogo?tipo=compatibilidad`): 15 biomas aceptan cualquier raza (grass, savanna, jungle, lemon,
  crystal, enchanted, candy, mushroom, birch, maple, rocklands, garlic, flower, celestial, clover); los otros 6 solo algunas (desierto:
  `civ_scorpion`, `civ_seal`; permafrost: `civ_bear`, `civ_penguin`, `civ_crystal_golem`, `civ_seal`; pantano: `civ_turtle`, `civ_crocodile`,
  `civ_snake`, `civ_frog`, `civ_seal`; corrupto: `civ_seal`; infernal: `civ_crystal_golem`, `civ_seal`; yermo: `civ_acid_gentleman`, `civ_seal`). El prompt trae
  la tabla; una combinación inválida se detecta antes de crear el mundo y recibe la corrección (con la lista válida de esa raza).

**Etapas 2 y 3 — presupuestos 10 y 4.** Costo de un rasgo: «efecto medido» = base de rareza + intensidad; «conducta (efecto no medido)» = 1; «sabor» = 0. Base de rareza: R0 = 1, R1 = 2,
R2 = 3, R3 = 4. Intensidad: 0 efecto pequeño, 1 moderado, 2 grande (≥ ×2 o +40 % a una estadística de combate). **Etiquetas** (campo `etiqueta` del catálogo, las que ve el modelo; `clase` interna
`medido`/`conducta`/`cosmetico`): **efecto medido** (E2/E3 vieron en el juego cuánto cambia una estadística; el texto da los números; no se demostró que decida una guerra), **conducta (efecto no medido)**
(cambia lo que hacen las unidades o la cultura, p. ej. caminos, torres, hechizos; su efecto en la partida NO se midió; 1 punto) y **sabor** (solo se ve, o no se distinguió del ruido; 0 puntos).
`!` = rasgo **fuerte** (valor muy grande según E3, «acotar»): a lo sumo UNO por civilización entre el borrador y los extras (código `rasgo_fuerte_excedido`). El texto de cada opción dice **a quién** afecta:
los de *clan* solo a los miembros del clan del rey (3 a 20 individuos en poblaciones de cientos, E3), los de *subespecie* a todos los individuos, *idioma* a quienes lo hablan, *cultura* a las ciudades, *religión* a los
seguidores (hechizos). El catálogo `era-1.0.catalogo-2` ofrece **67 rasgos**: **39 en la etapa 2** y **28 en la etapa 3** (27 de efecto medido, 26 de conducta, 14 de sabor); M = efecto medido, C = conducta, S = sabor.

| Casilla | Etapa | Opciones (id: costo etiqueta) |
|---|---:|---|
| cognitivo | 2 | gift_of_water: 1 C, gift_of_life: 1 C, gift_of_harmony: 1 C, gift_of_air: 1 C |
| mente | 2 | silver_tongues: 2 M, iron_will: 2 M, combat_instincts: 5 M, hyper_intelligence: 3 M!, telepathic_link: 1 C, inquisitive_nature: 1 C, fast_builders: 4 M, masters_of_propaganda: 1 C, strict_spelling: 3 M, enlightening_script: 3 M |
| espiritu | 2 | elegant_words: 3 M, gods_chosen: 4 M!, deathbound: 2 M, blood_pact: 1 C, magic_blood: 4 M, spawn_vegetation: 1 C, cast_shield: 1 C, cast_cure: 1 C, cast_grass_seeds: 1 C |
| fisico | 2 | stonefists: 4 M!, gaia_shield: 3 M, bonebreakers: 5 M, flesh_weavers: 3 M, blood_of_sea: 1 C, long_lifespan: 2 M, high_fecundity: 6 M!, exoskeleton: 2 M, enhanced_strength: 6 M!, accelerated_healing: 1 C |
| apariencia | 2 | phenotype_skin_toxic_green: 0 S, phenotype_skin_skin_blue: 0 S, phenotype_skin_skin_purple: 0 S, phenotype_skin_skin_pink: 0 S, phenotype_skin_magical: 0 S, phenotype_skin_infernal: 0 S |
| arquitectura | 3 | roads: 1 C |
| plano | 3 | city_layout_rings: 0 S, city_layout_parallels: 0 S, city_layout_cross: 0 S, city_layout_stone_garden: 0 S, city_layout_diamond: 0 S, city_layout_pebbles: 0 S |
| edificios | 3 | tower_lovers: 1 C, statue_lovers: 0 S, buildings_spread: 0 S, dense_dwellings: 3 M, hive_society: 6 M! |
| politica | 3 | expansionists: 1 C, tiny_legends: 1 C, conscription_male_only: 1 C, conscription_female_only: 1 C, weaponsmith_mastery: 1 C, fast_learners: 3 M, training_potential: 3 M |
| sucesion | 3 | warriors_ascension: 1 C, diplomatic_ascension: 1 C, golden_rule: 1 C, fames_crown: 1 C, unbroken_chain: 1 C |
| impuestos | 3 | tax_rate_local_low: 2 M, tax_rate_local_high: 2 M, tax_rate_tribute_low: 2 M, tax_rate_tribute_high: 2 M |

Minerales: stone 0, gems 0, metals 1, gold 1, silver 2, bones 2, mythril 3, adamantine 4. Biomas de costo 1: infernal, celestial. Un rasgo que cuesta más que el presupuesto de su etapa (hoy
`hive_society`, 6 en la etapa 3 que da 4) **solo puede obtenerse como `rasgo_extra`**, con toda la reserva.

La lista se **regenera** con `node herramientas/worldbox-era-catalogo.mjs` a partir de la evidencia: exige que cada rasgo ofrecido tenga su fila en el JSON final de E3
(`privado/worldbox/era-fase0/e3/rasgos-efecto.json`, 301 filas) y escribe el texto en español con lo que E3 midió o leyó en el código del juego.

**Quedan fuera (catálogo `excluidos`, con su motivo):** lo que E3 marca `no_ofrecer` (las 4 religiones «armonía», inertes: ningún método del juego lee las estadísticas de una religión); los **valores absurdos**
(`blood_of_eons` vida +10⁹, `eternal_text` +500 años, `endurance_of_titans` aguante ×3-×4, `bioproduct_gold` oro ×4 a ×14, `repeated_sentences`, `death_grow_mythril`, `dreamweavers`); los **letales o
autodestructivos** (`unmoving` población −90 %, `population_minimal/small/moderate/large/expansive` topes de 50 a 3000 habitantes, `rapid_aging`, `hydrophobia`, `genetic_psychosis`, `voracious`, `slow_builders`,
`prolonged_rest`, `foolish_glyphs`, `scribble`, `diet_cannibalism`, `solitude_seekers`, `shattered_crown`, `patriarchy`/`matriarchy` que restan 50 de lealtad si reina el otro sexo, `join_or_die`, `hovering` cuyo cruce
del muro no se verificó); y los **dones de combate** de la subespecie (`gift_of_fire`, `thunder`, `death`, `void`, `blood`; medidos en E6, sección 4.2: ninguno de fuego, trueno, vacío ni sangre se distingue del azar y el de muerte infla la población con esqueletos) y los hechizos
de combate de religión (`cast_curse`, `cast_blood_rain`, aún sin medir). `gift_of_water` (escudo-burbuja) y `gift_of_air` (tornado) siguen en la casilla «cognitivo» como «conducta», y E6 los midió: tampoco se distinguen del azar. Cualquier cambio de esta lista cambia el reglamento.

### 4.1 Mantenimiento de rasgos (E5)

E3 midió que el juego **reemplaza** los objetos cultura, idioma y religión de un reino: aplicados en el año 0 los rasgos de cultura e idioma se pierden en 2 o 3 años; con el reino aún sin esos objetos (años ~3 a
~16) el juego rechaza el rasgo; después, un reino puede cambiar de cultura y perder lo aplicado. Los rasgos de clan, subespecie y reino persisten. Como las etapas 2 y 3 usan justo cultura, idioma y religión,
el puente los **mantiene** (`mantener:true` en `POST /v1/era/rasgos`, contrato en [`worldbox-protocolo.md`](worldbox-protocolo.md)): lo aplicado queda como deseado y el puente lo reaplica cada vez que el juego lo
pierde; lo que no puede aplicar todavía porque el objeto no existe queda **pendiente** y se aplica en cuanto existe (la religión se crea si falta). Qué hace el orquestador:

1. En el borrador pide con `mantener` los tipos `cultura`, `idioma`, `religion` y `clan` (`tiposMantenidos`; `reino` y `subespecie` persisten solos). Un rasgo pendiente se anota en `tus_elecciones.rasgos_pendientes`.
2. A los **20 años de la etapa 3** (año 31; `--anios-espera-rasgos`) el motor comprueba cada pendiente: si ya está activo, queda aplicado (evento `rasgo_diferido`); si no, lo **suelta** del puente y lo anota como
   **no aplicado** con su motivo (`objeto_ausente`: el reino no tuvo ese objeto en todo el plazo; `no_aplicado`: el juego lo rechazó) en `tus_elecciones.rasgos_no_aplicados` (`casilla`, `id`, `motivo`,
   `puntos_devueltos`, `etapa`) y en el registro (`rasgo_no_aplicado`). Lo que el juego rechaza en el acto (`no_aplicado`, `ya_presente`, `rasgo_opuesto`…) se informa igual.
3. **Se devuelven los puntos** de lo que no se aplicó por motivos ajenos al modelo (`objeto_ausente`, `no_aplicado`): su costo se suma a la **reserva de rasgos extra**, que el modelo ve en `presupuesto`. Lo que
   falló por su elección (opuesto, ya lo tenía, tope) no se devuelve: de lo contrario, elegir a propósito rasgos que se rechazan convertiría puntos de etapa en puntos de reserva.
4. Un rasgo aplicado que más tarde se pierde se reaplica sin avisar al modelo; los contadores (`perdidas`, `reaplicaciones`) quedan en el registro: cada 10 años (`anio`) y en `fin`.
5. Si el puente no anuncia `capacidades.era_mantener`, se juega como antes (sin `mantener`) y la partida lleva la anomalía `sin_mantenimiento`; los rechazos se informan igual.
6. Un `rasgo_extra` de un tipo mantenido viaja con `mantener`; si el objeto no existe, se suelta y cuenta como rechazado (infracción, como antes).

Costo de rendimiento y persistencia medida en el juego real: ver `privado/revisiones/E5-entrega.md` (resumen en la sección 13).

### 4.2 Razas y dones de combate medidos (E6)

Medido en el juego real con bots, sin API, sobre un mapa guardado y espejado (`simetrico-prueba`, pasto en las dos mitades, muro de 4 casillas, rebeliones y desastres apagados, 4 unidades iniciales), alternando lados. Detalle, tablas y scripts: `privado/revisiones/E6-entrega.md`.

* **Razas** (tanda por raza contra el humano como referencia): 39 autofundaciones (todas viables), 246 guerras a los 40 años de desarrollo (muro fuera y guerra declarada en el año 41) y 49 a los 120 años. La guerra la decide casi siempre quien llega con más población (a los 120 años,
  28 de 31 guerras decididas). A los 40 años el humano es de las razas más lentas (población propia 49, la menor salvo la piraña) y varias razas de arranque lento (elfo 0 de 10, lobo, capibara, liliar…) se igualan o lo superan a los 120 años; el 500 de la partida real queda fuera de lo medido.
  **Podadas (`ofrecible:false`):** `civ_beetle` (0 de 14 guerras y extinción temprana en 3 de 16 partidas, el humano 1 de 308), `civ_piranha` (1 de 16; población 35 a 55 % menor que la del humano a los 40 y a los 120 años) y `civ_candy_man` (1 de 16 con población parecida a la del humano a los 120 años). **Marcada, no podada:** `civ_fox` (6 de 6 a los
  40 años y población ×2,5 la del humano a los 120). Todas las razas fundan en pasto; el bioma restringe la raza como dice la sección 4 (no se midió qué raza rinde más en sus biomas exclusivos).
* **Dones de combate** (arena: dos humanos, rasgo de subespecie aplicado al año 6 con `mantener`, 30 años de desarrollo con muro, guerra declarada; ≥ 12 duelos pareados por don y 24 de control sin rasgo): solo `enhanced_strength` (11 de 12; control sin rasgo 12 de 24) tiene un efecto de combate claro (cuota de bajas causadas 0,76). `gift_of_death` gana 10 de 12, pero porque
  sus esqueletos cuentan como población y soldados del reino (21 de 50 unidades a los 30 años): infla el puntaje, por eso sigue fuera. Fuego (13 de 24), trueno (13 de 24), sangre (13 de 24), vacío (6 de 12), agua (14 de 24), aire (14 de 24), vida (15 de 24) y armonía (5 de 12) no se distinguen del azar con esta potencia (intervalos de Wilson de ±0,18 a ±0,25); no se
  vio daño propio (muertes por fuego propias y edificios iguales a los del rival).

**Reserva de rasgos extra: 6 puntos por civilización para toda la partida** (intervenciones; sección 5).

## 5. Intervenciones

Hasta **3 acciones y 4 puntos de acción** por llamada (no se acumulan). Son las acciones ya verificadas del reglamento `auge` (mismos esquemas, que el
puente debe anunciar `verificada:true` para que existan), sin cooldowns ni puertas de turno:

| Acción | Puntos | Fase | Topes de la partida |
|---|---:|---|---|
| `crear_unidades {cantidad 1-5}` | 2 | desarrollo y guerra | 10 unidades **confirmadas** por el juego (todo o nada) |
| `donar_recursos {recurso, cantidad 1-10}` | 1 | ídem | 100 unidades donadas |
| `bendecir {gotas 1-3}` | 1 | ídem | 10 poderes (bendecir + maldecir + incendiar) |
| `maldecir {objetivo, gotas}` / `incendiar {objetivo, gotas}` | 2 | **solo guerra** | ídem |
| `rasgo_extra {id}` | 0 | ídem | 1 por llamada; solo rasgos de «efecto medido» que no se tengan ni choquen con un opuesto; no más de 1 rasgo fuerte en total; se paga de la reserva (6 + lo devuelto, sección 4.1) |
| `esperar` | 0 | ídem | — |

No hay `declarar_guerra` ni `pedir_paz`: la guerra es del motor. Son palancas pequeñas frente a civilizaciones de cientos de habitantes (E1/W5 las
midieron sobre unidades sueltas): el prompt lo dice. Cada llamada incluye `reasoning_summary` (0–240 caracteres): una frase corta de justificación que
se muestra como subtítulo (recortada a 160 en la capa de OBS).

## 6. Fin y puntaje del desempate

1. **Una sola civilización viva** (confirmada por el estado terminal del puente, que espera a que muera el último derivado): gana, aunque tenga menos puntos.
2. **Año 650 con las dos vivas**: gana quien tenga más **puntos**. Si ambas mueren a la vez no hay ganador.
3. Corte de seguridad (presupuesto de dinero, tokens, tiempo, o fallo del puente): partida **incompleta**, con su último estado confirmado y sin infracción.

```text
puntos = 100 · (0,40·cuota_población + 0,20·cuota_territorio + 0,10·cuota_ciudades + 0,15·cuota_edificios + 0,15·cuota_ejército) − 1·infracciones
cuota_X = X propia / (X de las dos civilizaciones vivas)      (si X vale 0 para las dos: ½ cada una)
```

Las dos puntuaciones suman 100 menos las infracciones; la civilización eliminada puntúa 0. Desempates: más población, luego más territorio; si no, comparten puesto.

**Por qué así (decisión de diseño):** (a) con cifras tan distintas a las de `auge` (cientos de habitantes y miles de edificios) un puntaje por unidades
dependería de la escala del mapa; las **cuotas** son comparables entre partidas y se explican en una frase. (b) La **población** pesa más porque es lo
que E1/E2 siguen y lo que decide una guerra de desgaste; territorio y ciudades miden expansión; edificios, desarrollo; ejército, fuerza militar. (c) Los
pesos NO se calibraron con partidas de modelos (no las hay): son una primera propuesta y el usuario debe confirmarlos. (d) `salud_media`, `comida` y `recursos`
quedan fuera: ruido (SNR bajo en `auge`) o no comparables entre razas.

## 7. Qué ve cada modelo

Texto de sistema idéntico para los dos modelos y para las 8 llamadas (`construirSistemaEra`, ≈ 9 000 tokens, cacheable): el juego entero, las
cifras de este documento, el catálogo completo, la sintaxis de cada orden con ejemplo de valores inventados, los errores frecuentes y el formato de
respuesta. Todas las cifras salen del motor (una prueba las contrasta). Usuario por llamada (`construirUsuarioEra`): `llamada`, `anio`, `presupuesto`,
`observation` (su civilización: especie, vivo, población, ciudades, territorio, ejército, edificios, reinos vivos, almacén, depósitos que quedan; el rival
cuando corresponde; muro; guerra; puntaje), `tus_elecciones`, `elecciones_del_rival`, `correccion`. No ve decisiones actuales del rival, su
razonamiento, el RNG, ni los rechazos (salvo la corrección). **Los modelos no ven ni piden** muro, velocidad, minerales, biomas ni la declaración de guerra:
son controles de escenario del motor.

## 8. Leyes del mundo: qué se apaga y por qué

Evidencia: E2 comprobó que **apagar `world_law_rebellions` no evita los reinos partidos** (apareció una escisión con la ley apagada, año 71), de modo que
el conteo por civilización es obligatorio de todos modos; apagarla solo quita una causa de variabilidad. Con las leyes por defecto E1 vio una rebelión que
eliminó a una facción (año 92–116). Decisión: **apagar rebeliones y los dos tipos de desastres** (`world_law_disasters_nature`, `world_law_disasters_other`: el
dragón y la invasión alienígena pueden matar facciones enteras, E1) para comparabilidad; las escisiones que aparezcan igual cuentan para su civilización.
`world_law_*` lo cambia la lista `leyes` de `PERFIL_ERA.partida` (versionada). El juego restaura las leyes en el siguiente `reiniciar` y en `cerrar`.

## 9. Infracciones y corrección

* **Respuesta inválida** (JSON roto o cortado, esquema, valor fuera de lista, presupuesto excedido, combinación raza-bioma inválida, acción no permitida en
  la fase, tope de partida): **una corrección sin costo** — una segunda llamada con el mismo texto y un bloque `correccion` (qué falló, qué es válido). Es
  una decisión de diseño distinta de `auge` (donde el contenido inválido no se reintenta): con 8 llamadas por modelo y una grabación larga, perder una
  etapa entera por un error de formato destruiría la partida.
* Si la respuesta corregida sigue inválida: **jugada por defecto determinista** y **−1 punto por cada elemento inválido**. Etapa 1: se conserva lo válido
  (raza; mineral; bioma si es compatible y cabe) y, si no cabe, `human` + `mineral_stone` sin bioma. Etapas 2 y 3: se descartan rasgos desde la última casilla
  hasta cumplir el presupuesto. Intervención: cada orden inválida se sustituye por `esperar`.
* **Respuesta con una errata** (E8): si tras la corrección sigue inválida y trae un valor que no existe en las listas (raza, mineral, bioma o rasgo; o un rasgo en otra casilla), la jugada por defecto **descarta ese valor** (human / piedra / sin bioma, o sin rasgo en esa casilla) en lugar de enviarlo al juego; antes la partida se caía al crear el mundo. No cambia ninguna partida válida.
* Una orden aceptada por el motor que el **juego rechaza** (p. ej. `objetivo_invalido`, o `rasgo_extra` que el juego no aplica) cuenta una infracción. Los
  rasgos de las etapas 2 y 3 que el juego rechaza (`ya_presente`, opuestos, tope de 6 por tipo) **no** cuentan: el modelo no podía saberlo. Con el mantenimiento, un opuesto que el juego
  puso por azar no rechaza la elección: se quita (sección 4.1). Elegir más de un rasgo **fuerte** es una respuesta inválida (`rasgo_fuerte_excedido`).
* **Fallo técnico** (proveedor, tiempo, 429, circuito): se pierde la llamada, jugada por defecto, sin infracción y sin corrección. Presupuesto, tokens o tiempo
  agotados: la partida se detiene incompleta.

## 10. Registro, auditoría y línea de tiempo

Cada ejecución escribe en `data/pruebas/worldbox/<id>-1/` (ignorada por git):

* `eventos.jsonl` (fuente de verdad): `inicio` (configuración completa, calendario, presupuestos, hashes del catálogo y del sistema), `decision` (los 23 campos
  de siempre + `llamada`, `intento`, `correccion`, `errores`, `anio`; una por llamada **y por corrección**), `rasgos_aplicados`, `etapa`, `intervencion`,
  `muro`, `guerra`, `velocidad`, `rasgo_no_aplicado`, `rasgo_diferido`, `intervencion_omitida`, `anio` (una foto cada 10 años, con el resumen del mantenimiento de rasgos), `fin` (con `anio_caida_muro`,
  `mantenimiento` y `rasgos_mantenidos` por civilización y tipo).
* `reporte.json` (reconstruido solo desde el log), `ranking.csv`, `modelos.csv`, `llamadas.csv`, `serie-anual.csv`.
* `linea-de-tiempo.json`: eventos importantes con `anio`, `t_juego_s`, **`t_real_s` (segundos reales desde «Listo para grabar»)**, `tipo`,
  `importancia` (alta/media/baja) y `descripcion` (las llamadas traen `frase`). Sirve para cortar y acelerar el video (sección 12).

```powershell
node src/worldbox/era/auditar-era.js data/pruebas/worldbox/<corrida>     # sale con código 1 si algo no cuadra
```

La auditoría reconstruye el texto de sistema (`sistema_hash`) y el prompt de cada llamada, **vuelve a validar cada respuesta** con el validador de la
versión, recalcula costos, puntaje y ranking, y exige que `reporte.json` sea idéntico al reconstruido. Con el juego real **no se promete reproducir la partida**
(el mundo no es reproducible, `docs/worldbox.md`): se audita lo registrado.

## 11. Cómo correr

Sin API (bots, simulado; el simulador de la era **no es WorldBox**: es un modelo grueso con la forma exacta de las respuestas del puente):

```powershell
node src/worldbox/correr.js --formato=era --adaptador=simulado --participantes=bot-era-militar,bot-era-economico --semilla=7 --partidas=1 --salida=data/pruebas/worldbox
```

Bots de la era: `bot-era-militar`, `bot-era-economico`, `bot-era-aleatorio`, `bot-era-roto` (prueba la corrección) y `bot-era-terco` (prueba la jugada
por defecto). Ensayo corto contra el juego real (muro en el año 60, límite 90; ver `docs/worldbox-grabacion.md`):

```powershell
node src/worldbox/correr.js --formato=era --adaptador=http --participantes=bot-era-militar,bot-era-economico --partidas=1 --anio-muro=60 --anio-limite=90 --intervenciones=20,35,50 --intervenciones-guerra=1,3 --anios-espera-rasgos=5 --velocidad-guerra=x5
```

(El plazo de los rasgos pendientes, 20 años por omisión, no cabe antes de una primera intervención en el año 20: en el ensayo corto se baja a 5.)

Con modelos (**cuesta dinero: solo con orden expresa y tope de gasto**; `--modo=pago`, presupuesto y tarifas, como en `auge`):

```powershell
node src/worldbox/correr.js --formato=era --adaptador=http --modelos=anthropic/claude-haiku-5.5,openai/gpt-6-luna --modo=pago --presupuesto=0.40 --presupuesto-modelo=0.20 --tarifa-entrada=0.1 --tarifa-salida=0.5 --partidas=1 --grabacion --lectura-ms=4000
```

Opciones propias: `--formato=era`, `--anio-muro`, `--anio-limite`, `--anios-borrador`, `--intervenciones=A,B,C`, `--intervenciones-guerra=X,Y`, `--velocidad-desarrollo=xN`,
`--velocidad-guerra=xN` (por omisión x5), `--revelar=borrador|etapa`, `--segundos-avance` (1–120; por omisión 60), `--segundos-avance-guerra` (1–120; por omisión 20), `--anios-espera-rasgos` (por omisión 20; 0 = sin comprobación),
`--cantidad-minerales`, `--ancho-muro`, `--sin-renovar-guerra`. Valen también `--semilla`,
`--salida`, `--mapa`, `--unidades-iniciales`, `--presupuesto*`, `--tarifa-*`, `--max-tokens`, `--tiempo-ms`, `--timeout-ms`, `--timeout-puente-ms` y las del modo grabación
(`--grabacion`, `--cuenta`, `--aviso-ms`, `--lectura-ms`, `--fin-ms`, `--zoom*`, `--vivo`). No admite `--reglas`, `--manual` ni los parámetros por turno de `auge`.
**Una sola partida por corrida** (`--partidas=1`).

### Costo estimado de una partida con modelos (no se llamó a ninguna API)

`node src/worldbox/era/estimar-costo-era.js <carpeta de una corrida con bots> --modelo=id,entrada,salida[,cache] --salidas=500,2000,6000,16000 --correcciones=0.25` reconstruye el prompt exacto de
cada llamada del log, lo mide (3,5 bytes por token, supuesto declarado) y calcula el costo. Medido así: ≈ 9 000 tokens de sistema (idénticos, cacheables) + 1 000–3 000 de usuario por llamada,
**≈ 76 000 tokens de entrada por modelo** (8 llamadas, con 25 % de correcciones). Con tarifas de 0,1 / 0,5 USD por millón (Haiku 5.5 y GPT Luna, catálogo del 7-11-2026; **verificar antes de gastar**):
salida de 500 / 2 000 / 6 000 / 16 000 tokens por llamada ⇒ **0,012 / 0,020 / 0,040 / 0,090 USD por modelo**; la partida de dos modelos ≈ **0,04 USD** con 2 000 tokens de salida y ≈ **0,18 USD** en el peor caso
(16 000 de salida en todas las llamadas). Una corrección repite la llamada completa. Estimación: no se llamó a ninguna API.

## 12. Grabación

**Práctica manual (E8, 9-11-2026):** guía para jugar la era con respuestas pegadas a mano desde chats, repetir partidas con las mismas respuestas, probar tamaños/plantillas/muro y comentar en vivo: [`worldbox-era-practica.md`](worldbox-era-practica.md) (opciones nuevas del CLI: `--respuestas`, `--asistido`, `--tamano`, `--plantilla`, `--mapa-guardado`, `--ancho-muro=0`, `--sin-camara`, `--interfaz-visible`, `--manual`; evidencia en `data/era/partidas/`).

Ver [`worldbox-grabacion.md`](worldbox-grabacion.md), sección «Partida era de ~1 hora». El estado en vivo (`data/vivo/worldbox.json`) conserva el esquema v1 y añade campos de
la era; la capa de OBS (`web/worldbox-vivo.html`) muestra el año, la fase, las elecciones y la frase de justificación, en 16:9 y 9:16.

## 13. Historial y lo que este reglamento NO afirma

* `era-1.0` (E4, 8-11-2026): primera versión. Prompt `era-1.0`.
* `era-1.0` editada en sitio (E5, 8-11-2026, sin subir versión porque no se había jugado con modelos): catálogo `catalogo-2` desde el JSON final de E3 (67 rasgos con etiqueta, tope de 1 rasgo fuerte, valores absurdos y letales
  fuera, dones de combate fuera), mantenimiento de rasgos en el puente (`mantener`, `soltar`, reemplazo de opuestos del juego, reembolso a la reserva), guerra a x5 en pasos de 20 s, intervenciones de guerra a +1 y +3 años de la
  caída del muro y omitidas si la partida ya se decidió, comprobación de rasgos pendientes a los 20 años de la etapa 3.
* `era-1.0` editada en sitio otra vez (E6, 9-11-2026, tampoco se había jugado con modelos): 3 razas podadas, textos de dones medidos, motivos de exclusión de los dones de combate con su cifra (sección 4.2). Sin cambios de costo ni de puente.
* No hay evaluación con modelos reales del prompt ni del equilibrio de razas, biomas, rasgos o costos (E6 midió razas y dones con bots, a 40 y 120 años de desarrollo, no a los 500 de la partida real). Solo `enhanced_strength` se demostró decisivo en una guerra (E6); ningún bioma lo es (E1: n=4; E2: ±30
  habitantes de ruido). La guerra tras el muro es impredecible (E2: de 10 a 82 años después, o inmediata y devastadora): por eso la declara el motor, pero su desenlace no es controlable.
* Los depósitos de mineral son de un solo uso y de efecto pequeño. Sin vigilante, el muro lo cruzan unidades que caminan sobre la montaña (E2: 1 de 12 forzadas; E3: hasta 33; E9: 409 en 480 años, huge pancake); con el vigilante activo por omisión quedan del lado contrario ≤ 1 en cada comprobación (sección 1.1). Barcos y voladores: ver el informe E9 (no hay especies de la era que vuelen ni naveguen sin construir barcos).
* Rendimiento medido sin OBS grabando (60 FPS, 1 143 unidades, 2 644 edificios, x20). Con OBS no se midió.
* El simulador de la era sirve para probar el motor, no para medir el juego.
* **Persistencia medida (E5, juego real, x40, 175 años, dos corridas con bots).** Con `mantener`, de 18 rasgos elegidos (16 de tipos mantenidos y 2 de subespecie) el sondeo final por la ruta pública encontró **18 de 18 puestos a los 175 años**
  en las dos corridas; en las 156 fotos anuales posteriores al año 20 estaban todos activos. Pérdidas reales reaplicadas: 1 en la primera corrida (idioma) y 326 en la segunda (cultura): en esa corrida el juego cambió el objeto cultura
  unas dos veces por año durante ~16 años (años 74 a 90) y luego se estabilizó; cada pérdida se reaplicó en ≤ 0,25 s reales. Costo: 0,04 ms por comprobación (344 ms en 8 754 comprobaciones durante una partida de 650 años), sin cambio
  en el tiempo de `avanzar` (mediana 1 269 ms por 60 s de mundo a x40 con y sin mantenimiento; E3: 1 273 ms). Sin el reemplazo de opuestos, un plano de ciudad elegido (`city_layout_*`) chocaba con el que el juego pone por azar
  a cada cultura nueva y quedaba pendiente para siempre (4 de 18 rasgos); por eso el puente quita el opuesto que el juego puso y que no es otro deseado.
* **Guerra lenta medida:** una corrida completa a x5 con bots duró 150 años de guerra (el muro cayó en el año 500; las dos civilizaciones llegaron vivas al 650: 67,6 contra 32,4 puntos) y 25,6 min reales; en el ensayo corto la guerra
  eliminó a una civilización 6 años después de la caída (≈ 1 min). La guerra a x5 se ve (ciudades conquistadas, reinos nuevos) y el orquestador la observa cada 20 s de mundo.

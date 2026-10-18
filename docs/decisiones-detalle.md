# Decisiones por juego y por escena (detalle)

> Movido tal cual desde `CLAUDE.md` el 17 de octubre de 2026 para que cada sesion cargue menos contexto: `CLAUDE.md` tiene el resumen y las reglas que no se reabren;
> aqui esta el detalle de cada juego, de las escenas, de la voz y del lote. **Leelo solo si vas a tocar ese juego o esa escena.** Si cambias una decision, actualiza este
> archivo y el resumen de `CLAUDE.md`.

### Razonamiento de los modelos: siempre medio, nunca el maximo (decidido el 9 de octubre de 2026)

Todos los modelos se llaman con el razonamiento en nivel **medio** (`reasoning.effort = "medium"` en OpenRouter) o, si el
modelo no lo permite, con su valor por defecto. **Nunca el maximo** (`high`, `xhigh`): cuesta mucho mas en los modelos
caros (el razonamiento oculto se cobra como salida) y no cambia lo que se mide. Es igual para todas las IAs y se congela
junto con el prompt y los demas parametros de llamada. **Estado: implementado** en `src/parametros.js` (`PARAMETROS` y `cuerpoDeLlamada`). Cada contendiente declara en `src/modelos.js`
su campo `razonamiento` (`"medium"` si el modelo admite ese nivel, `null` si no tiene niveles) y
`node herramientas/verificar-modelos.mjs` lo compara con el catalogo de OpenRouter: correrlo antes de cada temporada y antes
de gastar. Claude Sonnet 5.5 razona en `high` por defecto, por eso se le manda `medium` explicito. Segun el catalogo del 9 de
octubre de 2026, Claude (Sonnet y Haiku 5.5) y GPT-6 ignoran `temperature`: el 0.7 se manda igual a todos, pero con ellos no
tiene efecto. Lo que se le mando a cada modelo queda en `parametros` de cada resultado. Medido el 10 de octubre de 2026: con
`max_tokens` 2000 y razonamiento medio, GPT Luna se corto en 3 de 4 jugadas (el razonamiento se comio 1,919-2,000 tokens). El
usuario decidio subir `max_tokens` a 4000 (el razonamiento sigue en medio); si aun asi se cortan, se mide y se decide con el
usuario: no se sube el razonamiento para "darles espacio".

### Juego 3: La Fuga (decidido el 10 de octubre de 2026)

El Dilema era demasiado plano (un bit por ronda, pagos fijos y conocidos, sin azar), asi que se agrego un juego nuevo **al
lado**: el Dilema se queda como juego de control con sus estrategias clasicas. En **La Fuga**, dos IAs son prisioneros que creen
que deben escapar juntos y enfrentan 9 situaciones con riesgo oculto; cada ronda eligen una **postura** hacia el companero
(ayudar, avanzar, sacrificarse, separarse) y un **metodo** (sigilo, fuerza, engano, esperar), y hay tentaciones (un botin, la
oferta de un guardia) que premian traicionar. **Regla oculta:** si se separan, cada uno puede escapar por su cuenta; las IAs no
lo saben y el prompt nunca afirma lo contrario (calla). Se publica en `docs/metodologia.md` y el reproductor la muestra.
Categoria propia ("Lealtad bajo riesgo") porque el marcador promedia los puntos de todos los juegos de una categoria. La
historia publica la escribe el codigo (sin llamadas extra) y se guarda en los datos junto con lo `oculto` de cada ronda
(probabilidades reales y dados). Una llamada por IA y situacion: 18 por partida. **Salida anticipada (enmienda del 10 de octubre de 2026):** quien se
separa y pasa la situacion puede escapar de inmediato por su ruta propia (probabilidad oculta segun la fase) y cobra 7; el que
queda solo falla algo mas (x1.15) pero encuentra mas botin (la oferta del guardia se vuelve botin) y, si escapa despues, cobra 9.
Una partida suelta nunca se publica: siempre una
serie con asientos rotados (mismas situaciones y mismos dados). **Estado:** motor, bots de control y pruebas listos y escena de
la sala de control lista (`web/escena.html`, ver su decision arriba); falta la primera corrida con modelos. **Reglas de puntaje (10 de octubre de 2026):** los
extras de botin y delacion solo cuentan si escapas (capturado vale 0 en total) y la delacion solo agrava al delatado si ya estaba
herido; el prompt lo dice asi. Balance con bots cerrado ese dia: escapan los dos 48 %, el traidor gana al leal 57 % y a toma y daca
58 % de las partidas decididas (`privado/prototipos/herramientas/fuga-balance.mjs`). **Vocabulario suave (11 de octubre de 2026):** el prompt,
la vista y la narracion evitan las palabras duras (delatar, abandonar, traicion): la oferta del guardia es "contarle al guardia lo que
planea el companero", quien queda atras "se queda atras" y el bot `traidor` se muestra como "Por su cuenta"; los identificadores
internos no cambian (los lee el marcador). **Escena del reproductor (decidido el 11 de octubre de 2026):** episodio de ~2.5 minutos
que se segmenta en piezas cortas para Reels y TikTok (9:16 y 16:9 sobre la hoja maestra 4K).

### Juego 4: El numero solitario (decidido el 11 de octubre de 2026)

Cinco IAs, un mazo de 8 cartas cada una y 12 rondas. Cada ronda tiene dos decisiones simultaneas: primero cada una elige en secreto una
**pareja** de cartas; se revelan todas las parejas; despues cada una **marca** cual de las dos juega. Si dos o mas juegan el mismo
numero, esas cartas se anulan; gana la ronda el **menor numero que nadie mas jugo** y recibe puntos iguales al numero y una ficha de
victoria. La carta jugada se descarta y la otra queda bloqueada una ronda; al terminar la ronda 6 hay mazo nuevo. Al final de las
rondas 3 y 6 queda a salvo (y sale) el de mas puntos; en la ronda 12 los 3 que quedan: el mejor gana la pieza, el ultimo es eliminado.
Puntos del marcador: pieza 4, a salvo 3, en medio 2, eliminado 0. **No tiene regla oculta**: lo unico secreto es lo que se decide a la
vez. Categoria propia ("Estrategia de eliminación"). Cada ronda son **dos turnos** de la arena: **90 llamadas y 24 turnos** por
partida (dentro del presupuesto, sin excepcion); por lote seria impractico, asi que se corre **en vivo**. Una respuesta ilegal se
reemplaza por una legal con azar sorteado de antemano y se mide como fallo. Bots de control: `bajo`, `azar`, `medio`, `lector`,
`escalera`. Al final de cada serie la consola imprime y guarda una **evaluacion** (cinco caracteristicas por IA: obediencia, lectura de la mesa, audacia,
punteria y constancia, con frases por umbrales fijos, y un comentario del resultado; `evaluar` en el contrato de un juego, ver
`docs/agregar-un-juego.md`). **Estado:** motor, bots, evaluacion y pruebas listos; la escena de casino esta lista (`web/escena.html`, ver su decision arriba); falta la prueba con modelos (diseno en
`privado/spec/numero-solitario-diseno.md`, plan en `privado/planes/plan-solitario-motor.md`).

### Juego 5: Subasta de tiempo (decidido el 11 de octubre de 2026)

Cinco IAs (el original tiene seis), cada una con un banco de 10 minutos (600.0 segundos) y 19 subastas. En cada subasta todas responden cuantos
segundos mantienen su apuesta (0 = retirarse). **Todas las apuestas se pagan** (salen del banco, ganes o pierdas); gana la apuesta mas alta y
recibe una ficha; si dos o mas **empatan en la apuesta mas alta** (a la decima) la subasta se anula y el tiempo se pierde igual; si todos se
retiran nadie gana. Quien agota su banco ya no apuesta (no cuesta llamadas); pedir mas de lo que queda es apostar todo el banco; una respuesta
ilegible equivale a retirarse y se mide como fallo. Al final, mas fichas = pieza (desempata el tiempo que conservas; si tambien empatan, nadie la
obtiene) y menos fichas = eliminado (desempata quien conserva menos tiempo; si tambien empatan, nadie). Puntos del marcador: pieza 4, sobrevive 2,
eliminado 0. **Informacion oculta, no regla oculta:** nadie ve el banco ni las apuestas de los demas (solo se anuncia quien gana); el prompt lo dice,
la `vista` no lo filtra (prueba de no interferencia) y el publico lo ve despues de cada subasta (`oculto`). Una subasta = un turno de la arena:
**19 turnos y hasta 95 llamadas** (sin excepcion), en vivo. Categoria "Estrategia de eliminación" (la misma de El numero solitario). Bots de control:
`retirado`, `parejo`, `azar`, `gastador`, `cuentagotas`. Evaluacion al final de la serie con cinco caracteristicas (obediencia, ritmo de gasto,
prudencia, eficiencia y constancia). **Estado:** motor, bots, evaluacion y pruebas listos; la escena de casino esta lista (`web/escena.html`, ver su decision arriba); falta la prueba con modelos
(diseno en `privado/spec/subasta-tiempo-diseno.md`, plan en `privado/planes/plan-subasta-motor.md`).

### Juego 6: Mayor o menor (decidido el 11 de octubre de 2026)

Dos IAs, 11 cartas del 0 al 10 y 10 fichas cada una, 18 rondas. El crupier tiene dos mazos independientes de 9 cartas (1 al 9), uno por jugador; en cada ronda revela la
siguiente de **su** mazo, el **jugador activo** juega una carta boca abajo y el **predictor** apuesta de 1 a todas sus fichas a que sera mayor o menor, a la vez. Si la carta es
mayor, el activo gana la diferencia; el predictor gana o pierde lo apostado (carta igual: la apuesta se devuelve); las fichas salen de la banca. Los papeles se alternan; termina
en la ronda 18 o antes si alguien queda sin fichas; gana quien tiene mas. Puntos del marcador: ganador 4, perdedor 0, empate 2 y 2. **No tiene regla oculta**: lo secreto es lo que el
rival decide a la vez y el orden del crupier. Categoria "Estrategia de eliminación". **18 turnos y 36 llamadas** por partida (sin excepcion), en vivo. Bots de control: `azar`,
`prudente`, `contador`, `temerario`, `contrario`. Evaluacion al final de la serie con cinco caracteristicas (obediencia, lectura, audacia, provecho y constancia). **Estado:** motor,
bots, evaluacion y pruebas listos; faltan la prueba con modelos y la escena del reproductor con voz (diseno en `privado/spec/mayor-o-menor-diseno.md`, plan en
`privado/planes/plan-mayormenor-motor.md`).

### Juego 7: Triple dado (decidido el 11 de octubre de 2026)

Cuatro IAs y 4 rondas. En cada ronda cada una predice en secreto su puntuacion con una tarjeta (ZERO, MIN, MORE o MAX; **cada tarjeta se usa una sola vez en la
partida**) antes de lanzar los dados; se lanzan 11 dados por jugador (9 blancos visibles y 2 ocultos, rojo y azul) y se juegan 3 enfrentamientos de tres dados
(triple > escalera > doble > sencillo; desempate por el dado blanco que sobra; 6 / 3 / 1 / 0 puntos, con el promedio de las posiciones en los empates). Acertar la
tarjeta da un premio: ZERO (exactamente 0) paga 40; MIN (mas de 0 y menos de 7), MORE (de 7 a menos de 11) y MAX (11 o mas) duplican; fallar no resta. Al final,
pieza para el mas alto en solitario y eliminado el mas bajo en solitario (un empate deja a nadie). Puntos del marcador: pieza 4, sobrevive 2, eliminado 0.
**No tiene regla oculta**: lo secreto es el valor de los dados ocultos sin usar, lo que los demas eligen a la vez y las tarjetas de la ronda en curso. Los puntos se
guardan como enteros en doceavos de punto para que los repartos por empate (3.33, 4.5) sean exactos y una tarjeta no cambie de categoria por coma flotante. Categoria
"Estrategia de eliminación". **16 turnos y 60 llamadas** por partida (la tarjeta de la ronda 4 se pone sola y no cuesta llamada), sin excepcion, en vivo. Bots de
control: `azar`, `goloso`, `reservado`, `tanque`, `calculador`. Evaluacion al final de la serie con cinco caracteristicas (obediencia, punteria, riesgo, uso de ocultos y
constancia). **Hallazgo con 5,000 partidas de bots:** tirarse a proposito por el ZERO (jugar siempre la peor combinacion) lo logra el 79 % de las veces contra rivales que
buscan puntos y se lleva la pieza el 67 %; con rivales que tambien lo intentan los empates lo vuelven mucho menos fiable. Es lo que dicen las reglas dictadas: con modelos hay
que volver a medir. **Estado:** motor, bots, evaluacion y pruebas listos; la escena de casino esta lista (`web/escena.html`, ver su decision arriba); falta la prueba con modelos (diseno en
`privado/spec/triple-dado-diseno.md`, plan en `privado/planes/plan-tripledado-motor.md`).

### Juego 8: Duda y apuesta (decidido el 11 de octubre de 2026)

Cuatro IAs, un mazo de 60 cartas (10 de cada uno de cinco colores y 10 arcoiris, que cuentan como cualquier color) y **una sola eliminacion**. Es **el unico juego por turnos**: un turno es
una decision de un solo jugador (`activos` devuelve solo a quien le toca) y cuesta una llamada. Cada mano, quien abre anuncia "hay al menos N cartas de un color entre todos" y apuesta; el siguiente
**acepta** (haciendo un anuncio mayor) o **duda**; quien duda puede subir la apuesta y quien anuncio **iguala** (se revelan las cartas de todos: gana quien anuncio si hay al menos lo anunciado) o
**se retira** (pierde lo apostado y no se revela nada). Cada jugador tiene **3 fichas de juego** (su vida), 4 fichas de espacio y 5 espacios para cartas (espacios = fichas de espacio + 1: perder
una ficha de espacio es perder una carta). Maximo 4 anuncios por mano; nunca se apuesta mas de lo que tiene quien responde; al terminar las manos 15, 20... todos pagan una ficha a la banca (salvo que la mano ya haya dejado a alguien sin fichas: ahi la partida termina y no se cobra); la
partida termina cuando alguien se queda sin fichas de juego o tras la mano 16. Puntos del marcador: pieza 4 (mas fichas en solitario), sobrevive 2, eliminado 0. Categoria nueva **"Engaño y deducción"**.
**No tiene regla oculta**: lo secreto son las cartas de los demas hasta que se revelan. **Hasta 96 turnos (= llamadas) por partida**: en este juego el limite de 30 turnos se cuenta en llamadas por
ser secuencial; se corre **en vivo**. Las **fichas iniciales (3; respaldo 4)** viven en una sola constante (`FICHAS` en `src/juegos/dudaapuesta/constantes.js`; con 4 pasan todas las pruebas, que fijan 3 en sus datos de partida) y se vuelven a medir con modelos. Se corre solo en vivo: la consola niega `--lote` (`soloEnVivo`) y estima las llamadas con `llamadasMax` (96 por partida). Bots de
control: `azar`, `calculador`, `farolero`, `retador`, `prudente`. Evaluacion al final de la serie con cinco caracteristicas (obediencia, ojo para dudar, farol, riesgo y constancia). **Hallazgos con
5,000 partidas de bots:** el `retador` (duda en cuanto puede) gana la pieza el 95 % contra bots que suben anuncios, porque aceptar obliga a subir; con 4 `azar` el asiento que abre la mano 1 gana la pieza
el 24 % contra 16-19 % de los demas (la serie rota los asientos); 12-24 % de las partidas quedan sin pieza por empate en fichas; una partida entre calculadores dura ~6 manos (21 llamadas). **Estado:**
motor, bots, evaluacion y pruebas listos; faltan la prueba con modelos y la escena del reproductor con voz (diseno en `privado/spec/duda-y-apuesta-diseno.md`, plan en `privado/planes/plan-dudaapuesta-motor.md`).

### Escena de casino de Duda y apuesta (decidido el 15 de octubre de 2026)

Primera escena "de casino" del reproductor y estreno del **kit común** (`web/casino/`: mesa de fieltro verde muy oscuro, cartas con forma y letra por color, dorso Noche con el logo, fichas, placas, sonido). Se abre con `web/escena.html?archivo=...` (formatos 9:16, 16:9 y `hoja` de 3840×2160) y es independiente de `replay.html`. **Cámara oculta:** el público ve las cartas reales de dos jugadores al azar por mano (seed de la partida); de los otros dos nada hasta el recuento. Dados vistos desde arriba (solo la cara que cuenta) para la escena de Triple dado, que tendrá su propio spec. Sonido: 10 muestras CC0 de Kenney (licencia verificada el 16 de octubre de 2026; `web/audio/LICENCIAS.txt`) con respaldo sintetizado. **Los videos se graban siempre desde el equipo de desarrollo** (decidido el 16 de octubre de 2026): ahi estan instaladas Barlow Condensed e Inter (licencia OFL), y ademas viajan en `web/fonts/` por si acaso. Lo puro (cámara, diseño, línea de tiempo, parámetros, sonido) se prueba en Node; el DOM se verifica con `node herramientas/capturar-escena.mjs`. La web no puede importar de `src/` ni de `herramientas/` (el sitio publica solo `web/` y `data/`): lo repetido (azar, medidas de formatos, tope de manos) lo vigila una prueba. **Pendiente:** la prueba con modelos reales (al final, por decisión del usuario). El generador de la voz (`herramientas/narrar.mjs`) ya existe y guarda en cada audio el texto que narró (`fuente`): la escena no usa un audio en un momento que diga otra cosa. Spec: `privado/spec/escena-duda-y-apuesta-diseno.md`; plan: `privado/planes/plan-escena-duda-apuesta.md`.

### Escenas de Mayor o menor, El número solitario, Triple dado, Subasta de tiempo y La Fuga (16 de octubre de 2026)

Plataforma común y cinco escenas nuevas (Triple dado: spec `privado/spec/escena-triple-dado-diseno.md`, plan `privado/planes/plan-escena-triple-dado.md`), en las ramas `escenas-mayormenor` (fase A y B) y `escenas-solitario` (fase C). **Arquitectura:** una sola página `web/escena.html` + `web/casino/escena.js` (armazón: parámetros, lista de partidas, reproducción, voz, sonido) que reconoce el juego de cada partida; un **registro** por juego en `web/casino/lineas.js` (nombre, jugadores, cámara por defecto, unidad del clip, línea de tiempo y mesa); `mesa-base.js` (tiempos con velocidad, sonido, subtítulos, volteo, fichas que viajan) y una mesa por juego (`mesa-duda.js`, `mesa-mayormenor.js`...) con `static METODOS` (tipo de beat → método: una prueba exige que cada beat real tenga el suyo). Kit con cartas numéricas, tira de números y placa de un solo grupo de fichas. La herramienta de capturas es genérica por juego y ahora cuenta como error los `console.error` de la escena (Chrome los escribe como INFO: antes pasaban por limpios). **Mayor o menor: hecha** (cámara 1 de 2 jugadores: la carta jugada se ve de antemano en las rondas que sortea el seed: en promedio la mitad; tira de números; `ronda=` es sinónimo de `mano=` en la URL). **El número solitario: hecha** (cinco filas en 9:16 y cinco columnas en 16:9; las parejas se revelan siempre juntas, sin cámara; la cámara le ve la marca a 2 de los que SIGUEN jugando en cada ronda, no de los 5 asientos: un asiento a salvo no marca nada; las líneas de una jugada del juego se reescriben para no atribuirla a la IA; panel del corte y de la final; los nombres largos se achican antes de la elipsis). Una partida entera dura ~7 min sin voz (~9 con ella): se publica por clips de rondas. **Triple dado: hecha** (mesa azul; cuatro filas en 9:16 y cuatro columnas en 16:9; los dados ruedan con rebote y giro con el resultado fijado de antemano por `web/casino/dados.js`, que no sortea nada; cámara 2 de 4 sobre las tarjetas; dados rojo y azul ocultos hasta usarse o al cierre; efecto de sonido de dados con dos muestras CC0 de Kenney). Una partida dura ~7 min sin voz (~10 con ella): se publica por clips de rondas. **Subasta de tiempo: hecha** (consola oscura; cinco filas en 9:16 y a la derecha de la consola en 16:9; sin cámara oculta: el público ve los bancos; el contador de `web/casino/reloj.js` empieza normal, se acelera y termina normal, y es una función pura del tiempo de pantalla; tira de las 19 subastas con el color de cada ganador; el registro de este juego lleva `campo: 'subasta'` porque sus registros numeran la unidad con ese nombre). Una partida dura ~9 min sin voz (~12 con ella): se publica por clips de subastas. **La Fuga: hecha, y no es de casino** (sala de control: una cámara verde por prisionero con la silueta del color de su IA y una **mini escena distinta por cada una de las 24 situaciones**, armadas con piezas SVG de `web/casino/escenarios-fuga.js`; las acciones de la silueta son funciones puras de `web/casino/siluetas.js`; sin cámara oculta: el público ve lo que las IAs no, la alarma, la cohesión y el riesgo real; las decisiones de los dos salen todas juntas y sin decir quién quiere la tentación, y el botín o la oferta se avisan solo en la consecuencia, con la alarma, la cohesión y los puntos moviéndose al terminar la situación; escena final con las cuatro reglas de puntaje (10 / 7 / 9 / 0) y la que se cumplió para cada IA; la escena reproduce **una** partida: la serie son dos entradas). Una partida dura ~4.5 min sin voz (~5.5 con ella). **Cada juego se publica en DOS partes** (decidido el 17 de octubre de 2026, y vale para todos los juegos: más videos en las páginas): `node herramientas/partes.mjs --archivo=... [--voz=...]` las calcula con `dividirEnDos` (clips de rondas contiguos, duración lo más pareja posible, el final en la segunda); no se recorta la narración del motor. Con `razon=1` las razones de las IAs salen al final de cada situación, junto con la consecuencia (decidido el 17 de octubre de 2026). Spec: `privado/spec/escena-fuga-diseno.md`; plan: `privado/planes/plan-escena-fuga.md`. Spec: `privado/spec/escenas-mayormenor-solitario-diseno.md`; plan: `privado/planes/plan-escenas-mayormenor-solitario.md`.

### Voz narradora con IA (decidido el 11 de octubre de 2026)

El usuario no narra los videos: la voz es **sintetizada por IA** en todas las grabaciones. Lo que se graba con OBS es el reproductor
leyendo una partida ya guardada, asi que la voz se genera **antes** de grabar y la escena espera a que termine cada frase: el video
sale completo en una sola toma, sin post-produccion de audio, y la linea de tiempo se exporta para poder re-doblarlo en otro idioma.
Nada de voz en tiempo real. Hay dos capas de texto: los **hechos** (los escribe el codigo, siempre verdaderos) y el **comentario** (la
capa editorial; nunca cambia ni oculta una jugada). La voz se declara como contenido generado por IA donde la plataforma lo pida y
no imita a ninguna persona real. Motor de voz: **gratuito y local** (decidido el 11 de octubre de 2026). **Elegido el 16 de octubre de 2026** entre 7 voces de 3 motores: Piper (MIT) con una voz en español de México (Apache-2.0; su nombre técnico no se muestra en público: ver `privado/terminos/voz-narradora.md`, con licencias, cuidados y el respaldo Kokoro). **Estado:** `herramientas/narrar.mjs` hecho: genera un audio por momento y un `voz.json` en `data/voz/` (ignorado por git), y la escena lo usa con `?voz=`. Detalle en `privado/planes/plan-voz-narradora.md`.

### Prioridad de desarrollo: juegos de concurso de eliminacion (decidido el 11 de octubre de 2026)

Despues de La Fuga, la prioridad de desarrollo son juegos de estrategia por rondas con la estructura de los concursos de eliminacion
(decisiones secretas simultaneas, subastas, faroles, roles ocultos, alianzas, fichas como moneda). Se implementan los que se pueda,
**con nombres y personajes propios y las mismas reglas**; nunca el nombre, el arte ni la estetica de ningun programa. Cada juego
respeta el presupuesto de llamadas (hasta 5 jugadores; mas requiere aprobacion expresa) y sigue el flujo de siempre (catalogo, spec,
plan, ejecucion, balance con bots, prueba con modelos). El catalogo con la fuente, el orden por oleadas y la nota de autoria viven en
`privado/planes/plan-juegos-de-concurso.md`. **Estado (11 de octubre de 2026):** la oleada 1 esta completa: El numero solitario, Subasta de tiempo, Mayor o menor, Triple dado y Duda y apuesta (motor, bots, evaluacion y pruebas;
faltan las pruebas con modelos y las escenas). La oleada 2 se elige entre el catalogo de `privado/planes/plan-juegos-de-concurso.md`.

**Sin torneo general (decidido el 11 de octubre de 2026):** cada juego se evalua por si mismo, para evitar complejidad. No hay un
meta-juego que encadene los juegos ni fichas que pasen de uno a otro. En su lugar, **al final de cada juego (o de su serie)** se evaluan las
caracteristicas de las IAs que ese juego mide (por ejemplo, lectura de la mesa, audacia, constancia, obediencia al formato) y se da un
comentario del resultado segun ellas. Lo escribe el codigo a partir de los datos guardados (sin llamadas extra), nunca cambia ni oculta una
jugada, y alimenta la capa de comentario de la voz narradora. Las caracteristicas de cada juego se definen en su spec. **Estado:** decidido;
las de El numero solitario se proponen al terminar su motor.

### Lote (Batch API): mitad de precio, sin prisa (decidido el 9 de octubre de 2026)

Nada de esto es en vivo: la partida se graba con OBS despues. Por eso `node src/correr.js ... --modo=pago --lote --tope=DOLARES`
manda las jugadas por la Batch API de OpenRouter, con **50% de descuento** (variantes `:batch` del catalogo) a cambio de esperar:
segun OpenRouter, en el beta la mediana fue de 7 minutos y el 90% terminaba en menos de una hora (el maximo es 24). Las tres banderas son
obligatorias juntas; sin `--tope` o sin saldo suficiente no sale ningun lote. No cambia el prompt ni los parametros: es el mismo
texto al mismo modelo. Todas las partidas de la serie corren a la vez, turno por turno, y cada turno es un lote por modelo
(`src/coordinador-lote.js`); `arena.js` no sabe nada del lote. Los modelos sin variante de lote (Llama, DeepSeek, los gratis) se
llaman normal dentro de la misma corrida. El tope se revisa antes de cada lote nuevo contra el gasto ya informado por OpenRouter (lo enviado y aun en espera no se
cuenta, asi que el gasto puede pasar un poco del tope; una guardia exige que la primera ronda quepa en el tope): si se alcanza, no
salen mas lotes y la serie incompleta se guarda en `data/pruebas/`. Si un envio o una espera falla, la serie se detiene (fail-closed), se
avisa con el id del lote y cada evento queda en `data/pruebas/*.lotes.jsonl`. El costo y los tokens vienen por lote, no por peticion: el reparto por reino es
una aproximacion. Un lote enviado no se reintenta (no hay llave de idempotencia: reenviar cobraria dos veces). Si la corrida se
interrumpe a media espera, el lote sigue en OpenRouter y se cobra: la consola imprime su id al enviarlo y
`node herramientas/ver-lote.mjs ID` muestra en que quedo (no retoma la serie).

**Modelos economicos de practica:** `haiku`, `luna` y `flash-lite` (la gama baja de cada proveedor, marcados `practica: true`) para
ensayar por lote por centavos (medido el 10 de octubre de 2026: ~$0.12 por partida de 4 reinos al tamano del turno 1). Sus resultados son de practica, nunca de torneo: la consola los
manda a `data/pruebas/` y se niega a mandarlos a `--destino=oficial`. No se juegan en la misma partida que su version de gama
media (comparten color).

**Estado:** implementado y probado con lotes falsos (`npm test`) y con dos ensayos reales (10 y 11 de octubre de 2026, `conquista`, 1 turno,
4 partidas, tope $0.10): 16 de 16 respuestas validas (12 por lote y 4 normales), 0 errores de API, gasto informado $0.0158; el mismo
turno en vivo tambien dio 4 de 4 validas. Espera del turno 1: Flash-Lite 6 min, Haiku 12 min, **Luna 7.7 h**. Cada turno espera al lote
mas lento, asi que una serie de 30 turnos con Luna adentro puede tardar dias: para series largas por lote conviene dejarla fuera o
usar juegos de pocos turnos (La Fuga tiene 9). La serie completa (paso 6 de la tarea 8 de `privado/planes/plan-lote-openrouter.md`) **se salto por decision del usuario el 11 de octubre
de 2026: el costo de una partida entera NO esta confirmado** (solo se midio el turno 1; los prompts crecen en los turnos tardios).

### Estado actual

Hecho:
- Motor generico (`arena.js`), prompt unico versionado, RNG con seed
- Cliente de OpenRouter + registro de contendientes
- Juego 1: Dilema del Prisionero Negociado (categoria "Traición y confianza")
- Juego 3: **La Fuga** (categoria "Lealtad bajo riesgo"): motor, bots de control, narracion guardada en los datos y pruebas
  listos y **escena de la sala de control** (`web/escena.html`, ver su decision arriba); falta la primera corrida con modelos (diseno en `privado/spec/fuga-diseno.md`)
- Juego 4: **El numero solitario** (categoria "Estrategia de eliminación"): motor, bots de control, narracion guardada en los datos y
  pruebas y **escena de casino** listos; falta la prueba con modelos (diseno en `privado/spec/numero-solitario-diseno.md`)
- Juego 5: **Subasta de tiempo** (categoria "Estrategia de eliminación"): motor, bots de control, evaluacion, pruebas y **escena de casino** (`web/escena.html`, ver su decision arriba) listos; falta la
  prueba con modelos (diseno en `privado/spec/subasta-tiempo-diseno.md`)
- Juego 6: **Mayor o menor** (categoria "Estrategia de eliminación"): motor, bots de control, evaluacion, pruebas y **escena de casino** (`web/escena.html`, ver su decision arriba) listos; falta la
  prueba con modelos (diseno en `privado/spec/mayor-o-menor-diseno.md`)
- Juego 7: **Triple dado** (categoria "Estrategia de eliminación"): motor, bots de control, evaluacion, pruebas y **escena de casino** (`web/escena.html`, ver su decision arriba) listos; falta la
  prueba con modelos (diseno en `privado/spec/triple-dado-diseno.md`)
- Juego 8: **Duda y apuesta** (categoria "Engaño y deducción"): motor por turnos, bots de control, narracion guardada en los datos, evaluacion, pruebas y **escena de casino** (`web/escena.html`, ver su decision arriba) listos; falta la
  prueba con modelos (diseno en `privado/spec/duda-y-apuesta-diseno.md`)
- CLI de duelos, agregador de marcador, servidor estatico
- Sitio con marcador por categoria + reproductor vertical para OBS
- Reproductor: clips por URL (`partida`, `ronda`, `hasta`, `vel`), razon de cada IA
  visible (`razon=1`) y etiqueta fija de contenido generado por IA
- Pipeline probado de punta a punta con estrategias de control
- Arena con jugadores activos, contador de llamadas y ritmo; consola con series de rotación y `data/pruebas/`;
  marcador con obediencia; prueba de humo gratuita (`src/humo.js`, aún sin correr con modelos reales)

Pendiente:
- [x] IDs de modelo verificados el 9 de octubre de 2026 (gama media vigente de cada
      proveedor; DeepSeek V3.2 porque las V4 razonan sin limite y se cortan). Parametros
      de llamada iguales para todas (temperatura 0.7, max_tokens 4000 desde el 10 de octubre
      de 2026; antes 2000) y congelados junto con el prompt desde el 22 de octubre. Los IDs cambian cada pocos meses:
      volver a verificarlos en <https://openrouter.ai/models> antes de cada temporada.
- [ ] Primer duelo real con modelos y grabar el episodio 1
- [x] Serie completa por lote (paso 6 de la tarea 8 del plan del lote): **saltada por el usuario el 11 de octubre de 2026**; los
      ensayos de 1 turno ya se hicieron (10 y 11 de octubre). Costo de una partida entera: no confirmado
- [ ] Kit de marca hecho (`marca/`). Falta: plan de contenido, registrar dominio y
      cuentas, sitio multilenguaje + imagen para links (`marca/exportados/og-1200x630.png`)
- [ ] Juego 2: **Guerra de territorios**, de 2 a 5 reinos, con alianzas y traiciones, **control
      tactico** (ordenes por region cada turno), **mapa de pixel art dividido en regiones cuyo
      tamano crece con los reinos** (26/39/52/65 regiones para 2/3/4/5), recursos aleatorios
      por region (6 tipos) y siempre un unico ganador (muerte subita al final + desempate).
      Reglas extra aprobadas (sin llamadas extra): mensajes privados, comercio, edificios,
      maravilla, honor y nota de plan. Motor y reglas implementados en `src/mapa.js` y `src/juegos/conquista/`
      con pruebas (plan 1); arena, consola, marcador y prueba de humo listos con bots de control (plan 2);
      falta la escena del video (plan 3). **Prueba de humo con modelos gratis corrida el 17 de octubre de 2026**
      (2 reinos, 10 turnos, 40 llamadas): Nemotron Ultra 15 % con JSON y 31 % de órdenes válidas (sobrecarga del
      proveedor y cortes por `max_tokens`), Nemotron Super 40 % y 46 %. Igual que el 9 de octubre: los modelos gratis
      no sirven para calibrar este juego; la prueba con modelos reales (de pago, práctica por lote) va AL FINAL.
      **Decisiones del 17 de octubre de 2026 (brainstorming de la escena y del mapa, aún sin spec):**
      - *Enfrentamientos:* tarjeta de fuerzas sobre el mapa para todas las batallas (variante A de las maquetas
        `privado/prototipos/maqueta-conquista-batalla-*.png`) y pantalla VS (variante C) solo para las decisivas;
        el turno dura 5 s normal y 7.5 s con una decisiva, máximo 3 tarjetas por turno.
      - *Alianzas y traiciones:* los mensajes privados no se muestran con su texto al enviarse (en el feed solo
        «X le escribió en privado a Y»); se revelan junto a la traición como un flashback con candado, o en la
        pantalla final si nunca hubo traición. La escena solo retrasa cuándo se ve; nunca oculta ni cambia nada.
      - *Mapa variable (HECHO el 17 de octubre de 2026):* 4 biomas que cambian solo forma y aspecto (`continente`,
        `arido`, `mares` e `interior` = mar interior); las reglas de recursos, combate y hambre no cambian y el
        prompt tampoco. `crearMapa(seed, k, { bioma })` en `src/mapa.js` (el continente sale idéntico a antes: una
        prueba fija 12 huellas); el bioma sale del seed con `biomaDeSeed` (rng propio, no mueve el de la partida; una
        serie de rotación conserva el mapa) y se fuerza con `--bioma=` en `src/correr.js` (valida antes de correr y
        solo vale para `--juego=conquista`). `resultadoDe` guarda `partida.mapa` (`serializarMapa`: terreno como
        cadena de dígitos, regiones, vecinas, inicio y `bioma`; 9-25 KB en JSON compacto, unas 3.6 veces más con la
        sangría con que `correr.js` escribe el archivo; `restaurarMapa` lo devuelve o da `null` si está roto) porque
        la web no puede importar de `src/`. Si un seed no da tierra suficiente se sube el sesgo de costa en pasos de
        0.02; nunca se cambia de bioma en silencio, y si ni así alcanza falla claro al crear la partida (0 errores en
        9 600 mapas). Hallazgo: `garantizarCapitales` podía pisar el nodo de un recurso que estaba en el mínimo (visto
        con `interior`, 5 reinos, seed 24); `reponerMinimos` lo repone. Revisión final: el árido con tierra ancha y
        pareja pasaba el tope de tokens del prompt (4,450) en 7 % de los seeds de 5 reinos por tener más vecinas por
        región; se ajustó (`sesgo -0.02`, `esc 1.5`: costa más quebrada, 26 % de agua contra 35 % del continente) y
        una prueba revisa los cuatro biomas con 100 seeds (peor caso medido en 2 000 seeds: 4,439 tokens). Balance
        con bots (4 reinos, rotación, 400 partidas por bioma): ningún asiento pasa de 31.3 % en ningún bioma (criterio
        50 %) y el árido ya termina por Maravilla como el continente (16.7 % contra 15.8 % con la mezcla económica).
        Medición: `privado/prototipos/herramientas/biomas-balance.mjs`. Maquetas: `privado/prototipos/mapas-biomas-hoja2.png`.
      - *Pendiente:* quinto bioma «cordillera» (no se distinguía del continente con el tinte de los reinos); la
        paleta de cada bioma la decide la escena a partir de `mapa.bioma`.
- [ ] Modo "bot escrito" para correr miles de partidas
- [x] Publicar el sitio — GitHub Pages, <https://gerrypetrucci.github.io/enfrentando-a-las-ias/>.
      Se despliega solo (`.github/workflows/pages.yml`) en cada push a `main` que
      toque `web/` o `data/`. Para publicar un episodio: commitear `data/*.json` y
      el `web/marcador.json` regenerado.
- [x] Subir el repo a GitHub — publico, <https://github.com/GerryPetrucci/enfrentando-a-las-ias>

### Por que el Dilema del Prisionero fue el primer juego

Es el mejor contenido por linea de codigo. La mecanica clave: cada ronda el
jugador decide su jugada **y** se compromete publicamente a lo que hara en la
ronda siguiente. El rival ve la promesa antes de decidir.

Eso vuelve la traicion **medible al 100%** — se compara un campo contra otro, sin
interpretar texto libre. De ahi sale la metrica **fiabilidad**, que le da sentido
a la categoria y titulo al video: *"prometio cooperar y traiciono en la ronda
siguiente"*, con la promesa en pantalla.

### Ideas de formato que quedaron en la banca

Por si el torneo de IAs no engancha, o como contenido de relleno entre episodios:

- **Carreras de canicas hiperlocales** — estados de Mexico, alcaldias, equipos de
  Liga MX, taquerias. Lo local comenta mucho mas que "Brasil vs Alemania".
  Motor: Matter.js.
- **Ultimo sobreviviente** — 100 canicas, el mapa las elimina. 60-90 segundos, el
  publico cuenta cuantas quedan.
- **Evolucion** — carritos que aprenden una pista con algoritmo genetico.
  Generacion 1 se estrella, generacion 40 vuela. Muy buena retencion.
- **Simulaciones "que pasaria si"** — contagio, hormigas, incendio, 1000 rojos vs
  1000 azules. Celdas en canvas, nada de fisica.
- **Bracket con nombres del publico** — "comenta tu nombre y entras al torneo del
  viernes". No es un formato, es un motor de comentarios: se pega encima de
  cualquiera de los anteriores.

Idea para el sitio que sigue viva: que el visitante **corra su propia partida** en
el navegador y la comparta por URL con el seed (`?seed=84712`). Convierte la
pagina en producto, no en archivo de videos.

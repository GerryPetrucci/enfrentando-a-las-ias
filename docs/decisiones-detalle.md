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
`node herramientas/verificar-modelos.mjs` lo compara con el catalogo de OpenRouter: correrlo antes de cada corrida con modelos y antes
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
bots, evaluacion, pruebas y escena listos, y primera corrida con modelos reales hecha (abajo); diseno en `privado/spec/mayor-o-menor-diseno.md`, plan en
`privado/planes/plan-mayormenor-motor.md`.

**Reglas 2.0.0 (21 de octubre de 2026): que cualquiera pueda ganar.** Con las dos partidas reales (GPT 161-70 y 226-56) se vio que el juego era de apostar (88 % de las fichas), que la apuesta se leia (87 % de aciertos), que apostar todo no tenia riesgo (0 de 12 perdidas), que la carta igual era un escudo gratis (36 % de las rondas) y que no habia remontada. Se midieron las perillas con bots (`herramientas/medir-mayormenor.mjs`, gratis; `src/juegos/mayormenor/constantes.js`: `REGLAS_1_0`, `REGLAS_2_0`) y se adopto **tope fijo de 6 fichas por apuesta + carta igual cuenta como menor + mano oculta + 3 rondas dobles**, con 10 fichas y 18 rondas. Detalle: **tope** (`TOPE_APUESTA`; el tope por el rival se descarto: con los dos parejos deja apostar todo); **carta igual = menor** (el activo solo gana si es estrictamente mayor; el registro trae `igual: true` y el `veredicto` es siempre mayor o menor); **mano oculta** (mazo de 33 cartas, 3 de cada numero; cada jugador recibe 11 al azar en secreto, con repetidas; la vista muestra solo cuantas le quedan al rival, cuales ya jugo y las cartas desconocidas; una prueba de no interferencia cambia la mano del rival y exige la misma vista y la misma respuesta de los bots); **rondas dobles** (una por franja 3-6, 8-12 y 14-18, sorteadas con el seed y dichas desde la ronda 1; las ganancias se pagan al doble, lo que se pierde no). Lo nuevo se sortea DESPUES de lo viejo: el mundo de un seed (mazos del crupier, reemplazos, narracion) no cambia. Con bots (300 partidas por pareja): margen final 54 % -> 25 %, partidas que terminan antes de la ronda 18 30 % -> 5 %, remontadas 1.30 -> 1.79 por partida, el bot peor le gana al mejor 9 % -> 31 %; el que va arriba en la ronda 12 gana 82 % (el puro azar da ~80 %). La metrica «ventaja» solo se lee contra esa referencia. Las reglas 1.0.0 siguen como configuracion para las pruebas del motor general y para reproducir las 2 partidas reales (que no se publican). **Escena:** la apertura de la ronda dice si es doble («RONDA 4 / 18 · DOBLE ×2», brilla), la tira de cada jugador muestra su mano repartida con repetidas (`htmlTiraMano` en `kit.js`; la linea de tiempo trae `manoInicial`), la carta igual sale como «igual = menor» y la apuesta al tope como «¡Máximo!». **Descripcion inicial del video** (`web/casino/textos-juego.js`, tarjeta de arranque y textos del paquete): cartas secretas, apuesta hasta 6 fichas, 3 rondas dobles y carta igual como menor; una prueba compara esos numeros con el motor. Las 2 partidas reales con modelos ya se corrieron (abajo).

**Serie real con las reglas 2.0.0 (21 de octubre de 2026, con orden expresa y tope):** Claude contra GPT, 2 partidas (72 llamadas), $0.46 segun el saldo; GPT gano las dos pero parejo (fichas 62-85 y 60-48; en la partida 2 el que iba arriba cambio 5 veces). Se graba la partida 2 (`paquete-j2`; la 1 no se graba y en el sitio quedara «por publicarse» con solo su seed).

**Ajustes de la escena tras la primera grabacion (21 de octubre de 2026):** (1) la caja «X apuesta N fichas a que sera M», el sello y la flecha se quedaban en pantalla hasta empezar la ronda siguiente. Ahora `pagar` programa `quitarResolucion` (a `momentoDeLimpieza`: con las fichas pagadas y los contadores al dia y dejados leer ~1 s, con tiempo de que el fundido de 350 ms termine antes del final del beat) y solo apaga lo que `visibles` dice que esta a la vista; en modo `rapido` (las capturas que se detienen en un beat) no apaga nada, para que la captura del resultado conserve lo que se ve. Una animacion de entrada con `fill: 'forwards'` le gana al estilo en linea, asi que al terminar el fundido se cancelan TODAS las animaciones del nodo (se vio solo en vivo). (2) `nuevaRonda` corta lo que quedara de la apuesta y cambia en el mismo instante cabecera, papeles y fichas (antes esperaba 320 ms y la voz decia «Ronda 3» sobre una cabecera de la 2); las cartas viejas se apagan con un fundido y la etiqueta «Camara» se quita al revelar. (3) `terminar` no deja papeles («Predictor · apuesta»), carta dorada de la tira, apuesta ni cartas. (4) Narracion: ya no dice «apuesta el maximo permitido» (con el tope de 6 casi toda apuesta lo es: el motor ya no lo escribe y la linea de tiempo lo omite en las partidas guardadas el 21 de octubre), «lo apuesta todo» solo cuando de verdad juega TODAS sus fichas, y el aviso «¡Ronda doble!» se dice al abrir la ronda (es una regla de esa ronda; antes salia al final con los comentarios del resultado, ya empezada la siguiente). (5) En vertical «RONDA 18 / 18 · DOBLE ×2» le quitaba lugar al titulo (se leia «MAYOR O MEN…»): en 9:16 la ronda doble usa 38 px y menos espaciado; `estadoVisible()` informa `tituloCortado` y `--estado` lo exige (`node herramientas/capturar-escena.mjs --archivo=... --estado --manos=17` revisa todas las rondas; el numero de beat de la pagina lleva uno de mas por la tarjeta de arranque). (6) **Papeles a la vista (pedido del 21 de octubre de 2026):** el papel de cada jugador («Activo · juega una carta», «Predictor · apuesta») era un texto gris de 18 px bajo el nombre; ahora es una pastilla verde (degradado del verde de la marca, texto oscuro) en el centro de su barra, entre el nombre y las fichas, para que el publico vea quien hace que: una linea en vertical y dos en horizontal (la barra mide 560 px). Vive en `htmlEstado` y el sexto parametro de `htmlPlaca` (`kit.js`), `ESTADOS` (`mesa-mayormenor.js`; el `rol` de cada asiento guarda su clave) y `.estado-pill` (`mesa.css`). Si la jugada la puso el juego, la pastilla conserva el papel, dice «carta del juego» o «apuesta del juego» y va en dorado (con el borde punteado de la barra de siempre). El final no deja pastillas. **Quien actua en ese momento** (el activo mientras juega su carta, el predictor mientras apuesta) tiene su pastilla brillando (clase `ahora`: mas clara, con aro blanco y resplandor, y un destello al encenderse; `actuaAhora` en la mesa); en la apertura, el crupier, el revelado y el resultado no brilla nadie, y `--estado` exige `brillos` en 0 al empezar cada ronda. El nombre se acorta con puntos suspensivos antes de apretar la pastilla (un nombre de mas de ~10 letras se corta en horizontal cuando esa IA es la activa, que lleva la pastilla mas ancha); `estadoVisible()` informa `papeles`, `nombreCortado` y `barraDesbordada` y `--estado` los exige. Cambio solo de aspecto: no toca el texto de ningun beat, asi que la voz y los paquetes siguen valiendo. (7) **La caja de la apuesta, en su momento (pedido del 21 de octubre de 2026 tras otra grabacion):** sale cuando el activo juega su carta, al terminar de aparecer el «¿mayor o menor?» (`APUESTA_MS`, 900 ms), porque ahi es cuando el predictor tiene que adivinar: el paso `pregunta` del beat de la jugada trae la apuesta del predictor y `mostrarApuesta` dibuja la caja, pasa el brillo al predictor y manda sus fichas. La voz la dice despues, en el beat de la apuesta, que ya no la repite (`apostar` solo la dibuja si no habia salido). Se va en cuanto salen de ella las fichas al repartirse (a quien acerto o a la banca: `pagar` la apaga a la hora del primer paso `devuelve` o `paga`), antes que el sello y la flecha, que siguen esperando a que se lean los contadores (`quitarResolucion` recibe la lista de piezas a apagar). Solo cambia CUANDO se ve: ningun texto ni duracion de beat, asi que la voz y los paquetes siguen valiendo. **Como se verifica lo que dura en pantalla:** las capturas con tiempo virtual de Chrome (`--virtual-time-budget`) desincronizan las animaciones de los temporizadores y engañan; esto se encontro con capturas en tiempo real por el protocolo de depuracion de Chrome (una pagina real, a los segundos pedidos), con un script descartable. Como cada audio de la voz guarda el texto que narro (`fuente`) y la escena no usa un audio cuyo texto cambio, **cualquier cambio de texto de un beat obliga a regenerar la voz** (`herramientas/narrar.mjs`) y a regrabar lo ya grabado.

**Primera corrida con modelos reales (18 de octubre de 2026, con orden expresa y tope de $2; reglas 1.0.0, quedan como ensayo):** Claude (`anthropic/claude-sonnet-5.5`) contra GPT (`openai/gpt-6.1-sol`), razonamiento medio, en vivo
(en vivo la consola no tiene `--tope`: se corrio con un vigilante que lee el saldo cada 15 s y corta el comando si el gasto pasa del tope). Un ensayo de 2 rondas (4 llamadas, $0.021) y una serie de
2 partidas (72 llamadas, 145,156 tokens); gasto total **$0.45** segun el saldo de la cuenta (el vigilante midio $0.377: el saldo de OpenRouter tarda en reflejar las ultimas llamadas, asi que un vigilante
subestima ~15 %). Resultado guardado en `data/2026-10-18-mayormenor-claude-vs-gpt.json` (oficial). Medido por llamada: Claude ~2,170 tokens de
entrada y ~205 de salida, GPT ~1,470 y ~190 (el razonamiento medio da pocos tokens de salida), o sea ~$0.007 y ~$0.005: una partida cuesta ~$0.21 (lo estimado era $0.43). Una de 36 respuestas de
Claude no trajo JSON valido y se reemplazo por una jugada legal. GPT gano las dos partidas (fichas 161-70 y 226-56) sin ser superado en fichas en ninguna ronda; igualo la carta del crupier 10 veces
para anular las apuestas del predictor y aposto todo 7 veces cuando contaba que no podia perder. Con voz, cada partida dura ~7:56 (casi 4:00 por parte): no cabe como Short ni como Reel.

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

### Narracion interpretada de Guerra de territorios y fundidos de grabacion (decidido el 18 de octubre de 2026)

Durante la prueba de la primera publicacion el usuario pidio dos cosas y dijo «hazlo por tu cuenta, confio en ti»; las decisiones son del asistente y se revisan en el diff de la rama `narracion-y-fundidos`. Spec: `privado/spec/narracion-y-fundidos-diseno.md`; plan: `privado/planes/plan-narracion-y-fundidos.md`.

**Narracion.** La voz leia listas («Agresivo manda 9 tropas de R17 a R07», siete veces «X toma R07»). Ahora cada beat de ordenes y resolucion trae `dicho` (lo que se oye y se subtitula; `texto` es eso unido; `dichoDe(beat)` en `linea-comun.js` es el accesor) y `mudas`; `lineas` sigue con los hechos que el beat sabe contar (resolucion: todos; ordenes: los 2 ataques mas grandes, los 2 primeros privados del turno, los avisos y los mensajes citados) y el resto sigue en pantalla (feed, mapa, flechas), asi que no se oculta ninguna jugada; una prueba exige que cada clave de `lineas` se diga, la cubra una frase de contexto (`cubre`) o este en `mudas`. Tres registros (`web/casino/narracion-conquista.js`, ajustes arriba): **literal** (privados, traiciones, batallas, pactos, caidas, conquistas, Maravilla, final), **contexto** (frase tipo `comentario`, en cursiva) y **silencio**. Como cada juego se publica en dos partes y en clips, **ninguna frase presupone algo que quien ve solo esa parte no vio** («vuelve a», «sigue», «igual que en el turno N» estan prohibidos por una prueba). Reglas: la racha de expansion se dice una vez («salen a expandirse»; una racha nueva se dice completa otra vez; «todos» solo si se sabe quienes siguen en pie); los ataques contra otro reino por parejas (hasta 2) o contados (todos, no solo los 10 que se dibujan; dos movimientos de un reino a la MISMA region son un solo ataque, porque el motor los junta en un bando y da una batalla, asi que se cuentan objetivos y no movimientos; cada frase cubre solo SUS hechos y los de la racha de expansion que se calla quedan en `mudas`); un mensaje publico por turno citado tal cual, del reino menos citado; las tomas sin dueño por reino y «todavia no hay una sola batalla» solo si es verdad; el hambre en escalones («pasa hambre», «por segundo turno seguido», «lleva tres turnos...»; callada desde el cuarto turno seguido, salvo cada cinco); comercios contados; panorama en los turnos 5, 10, 15... (no en el ultimo de una partida terminada) y, si ninguna region cambio de dueño desde el panorama anterior, «Turno 25: ninguna región cambia de dueño desde hace N turnos» una sola vez (solo habla de los dueños, no de las tropas, que si se mueven) y luego calla hasta que algo cambie; un estado ilegible nunca se da por «sin cambios» (el conteo empieza donde se vuelve a ver el mapa) y un reino caido no entra al panorama. Sin modelos: reglas sobre los registros. En la partida de bots de ejemplo el turno 1 pasa de 29 s a ~23 s de voz; la partida entera dura casi lo mismo (239 s contra 241 s). Los otros 6 juegos no cambian (el mecanismo `dicho` queda disponible). Limite conocido: la memoria del narrador es de toda la partida y las partes se publican por ventanas, asi que una parte puede abrir en silencio o con una racha ya empezada; no se puede re-narrar por ventana (la voz se genera una vez por partida).

**Fundidos de grabacion.** `grabar=1` (con `auto=1` y sin `detener=`) en la direccion de cada pieza (`direccionDeGrabacion` en `escena-config.js`, compartida por el paquete y `partes.mjs`): la pagina nace cubierta de negro, espera 2 s, se aclara en 0.5 s, **despues** cuenta la pieza (voz y efectos incluidos), se funde a negro en 0.5 s y se queda en negro; los margenes no se escalan con `vel` (son del grabador); `data-fundido` y `data-cierre` lo dicen y `node herramientas/capturar-escena.mjs --archivo=... --grabar` lo verifica (estado y pixeles). El paquete usa `hoja` por omision, cada pieza trae su `plan` y su LEEME cuenta el procedimiento real; `recortar-formatos.mjs` detecta el negro (blackdetect, umbral 0.03 calibrado con una captura real; el minimo de un margen sale de `FUNDIDOS`) y recorta de 0.15 s antes de que se aclare a 0.15 s despues de que quede negro. Politica de los margenes: la **salida** es el negro largo que llega al final del video; la **entrada** es el ULTIMO negro largo antes de la salida (la pieza es lo que hay justo antes), asi que un negro anterior es de otra pasada de la pagina que quedo en el mismo archivo (se pego la direccion, que se reproduce una sola vez, y se grabo durante ella): se avisa y se recorta; sin salida (se detuvo antes del fundido final) la entrada es el ultimo negro largo y el final no se recorta; sin margenes no recorta y lo dice; un video todo negro no se toca. La duracion que usa es la del formato menos su `start_time` (un MKV de OBS puede no empezar en 0 y blackdetect da tiempos absolutos; la primera grabacion real, el 18 de octubre de 2026, parte 1 de la partida de ejemplo, tuvo `start_time` 0: negros de 0 a 1.53 s y de 123.97 a 126.9 s, el recorte dejo 0.13 s de negro y el fundido de entrada al inicio, termino en negro y el primer sonido llego a los 0.76 s; el MP4 dura 2:02.8 contra 2:01 de pieza, la diferencia son los dos fundidos y el negro de las orillas). Si el audio no se prepara en 3 s (sin un clic un navegador puede negarse; el de OBS no) la pieza sigue sin sonido en vez de quedarse en negro para siempre, y un error en grabacion se escribe sobre el negro (`errorEnNegro`) en vez de dejar la pantalla negra para siempre. El paquete y `partes.mjs` avisan si la voz generada no cubre todos los momentos con texto (se narro antes de un cambio del texto: `momentosSinVoz`) y el paquete si la pieza no es `hoja`.

### Guerra de territorios: primera corrida con modelos reales (18 de octubre de 2026)

Con orden expresa («Autorizo Guerra con Claude, GPT, Gemini y DeepSeek, 2 partidas, tope $3»), en vivo y con el vigilante de saldo (la consola no tiene `--tope` en vivo): un ensayo de 3 turnos (12 llamadas,
$0.089, sin errores) y la serie de 2 partidas (99 llamadas, 355,438 tokens); gasto total **$1.03** de $3 segun el saldo de la cuenta (el vigilante midio $1.017). Guardada en `data/2026-10-18-conquista-claude-vs-gpt-vs-gemini-vs-deepseek.json` (oficial).
Medido: ~26 s por turno en vivo y ~$0.035 por turno de 4 llamadas; por llamada, Claude ~3,600 tokens de entrada y ~280 de salida, GPT ~2,400 y ~1,000, Gemini ~2,200 y ~1,800 (el de mas salida), DeepSeek ~2,600 y ~300.
Las dos partidas terminaron por Maravilla antes del turno 30: la 1 en 10 turnos (gana GPT, 5-3-1-0 para GPT, Gemini, DeepSeek, Claude) y la 2 en 16 (gana Gemini tras conquistar la Maravilla de GPT, que cayo en el turno
11; DeepSeek rompio tres veces su pacto con Claude y quedo con 1 de honor). Serie: Gemini 8, GPT 5, DeepSeek 4, Claude 1 (2 partidas con 4 jugadores: serie desbalanceada, mismo mapa). **Respuestas cortadas por
`max_tokens` (4000): 5 de 99, todas de Gemini** (3 seguidas en los turnos 7 a 9 de la partida 1 y 2 en la 2; 5 de sus 26 llamadas); el juego las reemplaza por «pasa el turno» y se dice en el video. La regla de CLAUDE.md
(se mide y se decide con el usuario, sin subir el razonamiento) queda en manos del usuario: mantener 4000 (parametros congelados e iguales para todos) o subirlo y repetir la serie.
Con voz: partida 1 = 5:25 (partes de 2:44 y 2:41, caben en Shorts, Reels y TikTok) y partida 2 = 7:50 (partes de 4:05 y 3:45, pasan de 3 minutos). Los modelos hablan de los reinos por su nombre de color (Azur,
Ambar, Violeta, Rosa, Marfil: asiento 0 a 4): el marcador de la escena los muestra junto al nombre del modelo (`web/casino/reinos-conquista.js`; en 16:9 la columna de recursos empieza en 240 px). Revision de contenido:
325 textos de las IAs escaneados con una lista de palabras ofensivas sin resultados y leidos a mano (el mas duro: «No te muevas o serás el siguiente», de DeepSeek en la partida 2).

### Guerra de territorios: reglas 1.1.0 (decidido el 18 de octubre de 2026, tras la primera corrida real)

**Maravilla: costo x1.5 y cuenta de 8 turnos** (antes 10 Roca + 8 Madera + 6 Hierro + 6 Oro y 5 turnos; ahora 15 + 12 + 9 + 9). Con modelos reales decidio 2 de 2 partidas: GPT la pago hacia el turno 4 (son 30 recursos y
la produccion normal mas algun trueque alcanzan) y 5 turnos no dan tiempo a una coalicion (en la partida 1 DeepSeek y Claude reaccionaron con 3 turnos por delante y no llegaron; en la 2 Gemini capturo la capital en el
turno 11). Con bots no se puede calibrar: con el motor actual solo la construyen 5-8 % de las partidas y ninguna combinacion de costo y duracion cambia nada. La unica forma de medirlo es una serie de modelos reales
(objetivo: que decida como maximo 1 de cada 4 partidas; si no, se ajusta). `versionReglas` pasa a `conquista-1.1.0` y el texto del prompt lee los numeros de `constantes.js`. Cada juego es independiente: no hay temporadas,
solo la version de reglas de cada juego (las partidas jugadas con otra version no se comparan con las nuevas).

**Nombre de reino por modelo** (`src/juegos/conquista/nombres.js`): los modelos ven su reino con un nombre de color y lo usan en sus mensajes («Azur propone paz a Violeta»), pero antes el nombre dependia del asiento y
rotaba: GPT era blanco y se llamaba Ambar. Ahora Claude = Ambar (naranja), GPT = Marfil (blanco), DeepSeek = Azur (azul), Llama = Rosa (magenta) y Gemini = Iris (multicolor; nombre nuevo, decidido por el asistente y facil de
cambiar); los modelos de practica comparten el de su familia y los demas jugadores (bots, repetidos) toman los que sobran en el orden de siempre, asi que una partida solo de bots queda igual que antes. La arena le pide
al juego los nombres segun quien se sienta (`opcionesDeAgentes`), el estado los guarda, la lectura de ordenes (`normalizar(respuesta, estado)`), la vista, el resumen del turno y los bots los usan, la partida guarda `reinos` y
el marcador de la escena lo muestra junto al nombre del modelo, con acento (`web/casino/reinos-conquista.js`); una partida vieja sin `reinos` cae a los nombres por asiento.

### Guerra de territorios: evaluacion y fichas al final (decidido el 19 de octubre de 2026)

Cada juego es independiente y al final se analizan las caracteristicas de todos los modelos; Guerra de territorios no la tenia y ninguna escena la mostraba en el video. Cinco caracteristicas aprobadas por el
usuario (`web/casino/evaluacion-conquista.js`, un solo modulo puro que importan la escena y el motor; `juego.evaluar` para la serie): **obediencia** (ordenes legales sobre las totales y turnos sin respuesta; notable
por debajo de 0.75 o con un turno perdido), **palabra** (pactos rotos y honor), **negociacion** (pactos y comercios por turno; notable con 0.8 o mas, 0.2 o menos o nada), **conquista** (regiones, conquistas a otros
reinos, batallas ganadas, si cayo; notable si cayo, conquisto 3 o mas o no ataco a nadie en 8 turnos o mas) y **camino a la victoria** (Maravilla completada, tomada, perdida o construida, o ganar por territorio). Hasta 3
destacadas por IA, en ese orden de prioridad; todo sale de lo guardado, sin llamadas extra, y nunca cambia ni oculta una jugada. En el video: despues de la ultima resolucion (que ya dice quien gana) viene una ficha por IA,
en el orden del ranking (beat `rasgos`: pantalla con las cinco filas y las notables resaltadas, y la voz dice las destacadas, precedida de «Así jugó cada una.»), y el video cierra con el ranking (`final`). Una partida
cortada no tiene fichas. Las escenas de los otros juegos todavia no muestran su evaluacion.

### Guerra de territorios 2.0.0 (22 de octubre de 2026, construida en la rama `guerra-2.0.0` y fusionada a `main` el mismo dia por orden expresa del usuario)

Se construyo con el usuario dormido y las decisiones delegadas («toma las decisiones que creas necesarias»); cada una vive en una constante o una regla y se puede revertir. Reglas completas, huecos cerrados y
mediciones: `privado/spec/guerra-2.0.0-diseno.md` y `-medicion.md`; plan y registro por etapas: `privado/planes/plan-guerra-2.0.0.md` y `-ledger.md`. Version de reglas `conquista-2.0.0` (las partidas 1.x quedan como ensayo).

**Que cambia** (el motor vive en `src/juegos/conquista/`; cada pieza con su prueba que fallaba antes y una mutacion):
- **Unidades por region y por reino** (`E.uni`): cuatro tipos, Lancero (fuerza 1), Arquero (2), Jinete (3; el unico que llega a 2 regiones, y solo por regiones propias, libres o aliadas) e Ingenio (3.5 atacando y 1
  defendiendo; solo se recluta en una region con cuartel; si 1/4 de los atacantes son Ingenios la fortaleza cuenta la mitad y con 1/2 no cuenta). **Dominio x2** de un solo lado: Lancero > Jinete, Arquero > Lancero,
  Jinete > Arquero e Ingenio; contra una mezcla cuenta en proporcion a las unidades de cada tipo. `mejorar TIPO` (+25 % por nivel, 2 niveles, hace falta un cuartel) reemplaza a `armar`. `batalla.js` es un resolutor
  puro de bandos (coaliciones); las ordenes aceptan `L4 A2`, `todo` y el prompt dice que debe quedar 1 unidad en la region de origen (el 78 % de las ordenes descartadas de la serie del 18 de octubre eran esa regla).
- **Alianzas** (las reglas que dicto el usuario): con pacto vigente entras de visita al territorio de tu aliado (no a su capital) y lo cruzas; tus tropas visitantes defienden con las del dueno (con su fortaleza y su
  terreno) y quien es aliado de los dos bandos no participa; dos aliados que atacan la misma region pelean juntos. Al terminar o romper un pacto las tropas de visita pasan a hostiles: pueden irse, **atacar donde estan**
  (`atacar REGION`: la «traicion desde dentro») o quedarse sin pelear; el dueno tambien puede atacarlas. **Tierra ajena:** quien pelea en la region de un reino sin pacto con el rinde x0.85 (decision del usuario:
  «siempre»). Los turnos 29 y 30 no hay pactos.
- **Suministro:** una region sin camino a su capital (por regiones propias, libres o aliadas) queda **aislada**: no produce ni cuenta para la cosecha base y ahi no se recluta, fortifica ni construye (el «incomunicado»
  del usuario).
- **Equilibrio** (medido con bots, `privado/spec/guerra-2.0.0-medicion.md`): el **Hegemon** (el reino con mas regiones desde 35 % de las regiones con dueno hasta que baje de 30 %) recibe el ataque de los demas con
  +50 %; **6 eventos del mundo** (turnos 5, 9, 13, 17, 21 y 25; Sequia, Peste, Cosecha y Caravana; el calendario sale del seed del mapa y se anuncia un turno antes: Presagio); la **Maravilla** cuesta 21 Roca + 17 Madera
  + 13 Hierro + 13 Oro y se cuenta 9 turnos (antes decidia 28-39 % de las partidas entre bots, ahora 16-27 %). La Reconquista y la Patria se probaron y se quitaron: la ablacion no las justificaba. Resultado con bots de
  estrategia: el reino que va arriba en regiones en el turno 10/15/20 gana 41-61 / 50-70 / 53-77 % de las partidas (en 1.1.0, 90 / 95 / 98 %) y hay 1.96-3.2 cambios de lider por partida (antes 0.59).
- **Vista y prompt:** el MAPA (fijo) va primero (prefijo cacheable por los proveedores) y despues lo que cambia; la vista trae composicion por tipo, tropas de visita, regiones aisladas, Hegemon, Presagio, **CAPACIDAD**
  (cuanto puedes reclutar de cada tipo) y **FRENTES** (tu ataque con lo que puedes mover contra la defensa visible, calculado con la misma formula que el motor y solo con datos publicos: las mejoras ajenas cuentan 0). Tope
  de entrada **6,500 tokens** (era 4,450; decision delegada por el usuario, que propuso subir tokens para sostener la complejidad): peor caso de 5 reinos medido 6,229 y 6,171-6,249 en los 8 biomas x 100 seeds; costo
  por partida de 4 IAs **$1.50 blando / $2.00 duro**. Una llamada por reino por turno, 30 turnos.
- **Evaluacion y publicacion:** siguen las cinco caracteristicas aprobadas; dos frases se enriquecen con lo que guardan las partidas 2.0.0 (`estado.uni`): `palabra` dice cuantas rupturas fueron «atacando desde
  dentro» y `conquista`, con que ejercito peleo (los tipos con al menos 5 unidades en algun turno; notable con 3 tipos o mas). Una partida de formato anterior se ve como siempre. La rejugada que reconstruye los
  prompts para el sitio (`replay.js`) compara tambien las unidades de cada reino por region antes de dar un prompt por fiel (60 partidas de bots de todos los tipos y los 8 biomas, 30 con tropas de visita: 0 no fieles).
- **Bots de control** (`src/juegos/conquista-bots-v2.js`): `lancero-masa`, `arquero-defensivo`, `jinete-relampago`, `mixto-adaptativo`, `traidor` y `leal` (se suman a los 4 de siempre) y la herramienta
  `node herramientas/medir-conquista.mjs` (asientos rotados, ablacion con `--sin=`, `--bioma=`, victorias por asiento).
- **Escena (etapa 11, 22 de octubre de 2026):** el mapa dibuja la composicion de cada region (barra proporcional de L/A/J/I cuando hay algo mas que Lanceros), puntos con el color del reino visitante donde hay tropas
  de visita, un anillo punteado en las regiones aisladas y una corona en el Hegemon (en el marcador y sobre su capital); una leyenda `L A J I` va en la esquina del mapa. El marcador cuenta las unidades totales del reino
  (las de visita tambien); la tarjeta de batalla muestra la composicion de cada bando junto al terreno (`L15 A5`), los aliados de una coalicion y la voz y el feed cuentan el Hegemon (entra y sale), el duelo entre dos
  aliados y cada evento del mundo (Presagio incluido). Todo se lee de `estado.uni` y del registro guardado, sin llamadas extra, y una partida de formato anterior se ve como siempre (sin barra, sin puntos). El dibujo
  esta en `web/casino/mapa-dibujo.js` (`pintarFichas`, `pintarCorona`, `pintarLeyendaUnidades`; puro salvo el canvas), las constantes copiadas en `conquista-datos.js` y la linea de tiempo en
  `linea-de-tiempo-conquista.js`; `herramientas/capturar-escena.mjs` corre ahora como root (agrega `--no-sandbox` cuando es root, como en la nube).
- **Pendiente:** la serie con modelos reales (AL FINAL, con orden y tope), `cache_control` para Claude, grabar y publicar la serie 2.0.0 esperan orden del usuario. El juego nuevo de civilizaciones tiene spec
  (`privado/spec/civilizaciones-diseno.md`); el plan y la construccion esperan aprobacion.

**Primera partida con modelos reales y reglas 2.0.0 (22 de octubre de 2026, orden expresa: una sola partida, sin tope pero cuidando el saldo).** Ensayo de 3 turnos ($0.10, 12 llamadas, 1 corte de Gemini) y partida completa en vivo con el vigilante
de saldo: Claude, GPT, Gemini y DeepSeek en ese orden de asientos, seed 1704202488, bioma **peninsulas**, 68 llamadas, 327,448 tokens, **$0.88** (saldo $16.18 -> $15.16 con el ensayo). Tamanos medidos: entrada por llamada Claude ~5,050, GPT ~3,480,
Gemini ~2,690, DeepSeek ~3,560; salida Claude ~265, GPT ~1,280, Gemini ~2,100, DeepSeek ~215. **Gana GPT por Maravilla en el turno 20** (5-3-1-0 para GPT, Gemini, Claude, DeepSeek): la construyo en el 11 y Gemini (Hegemon desde el 11, 29 regiones al final,
11 batallas ganadas de 15) intento contenerla en los turnos 13 a 15 y despues **se corto por `max_tokens` en los turnos 16 a 20 seguidos** (6 cortes en sus 20 llamadas): no pudo atacarla. Claude: 59 de 89 ordenes legales, nunca ataco; DeepSeek: 15 de 53, cayo en el
turno 8 (Gemini). Con las 5 partidas reales (4 de las reglas 1.x y esta) la Maravilla decidio las 5: el objetivo de CLAUDE.md (que decida como maximo 1 de cada 4) sigue sin cumplirse con modelos reales, aunque aqui la causa visible es el corte de Gemini. Decision del
usuario del 18 de octubre vigente: `max_tokens` 4000 sin subir el razonamiento (los cortes se dicen en el video). Voz de 12:18 (partes de 6:41 y 5:37, pasan de 3 minutos), paquete `paquete-j3` con gancho, 2 partes y 3 clips. Revision de contenido: 205 textos de las IAs
escaneados con la lista de palabras ofensivas, sin resultados (`revision/j3-textos.txt` de la serie). Escena verificada: reproduccion completa con voz (738 s medidos = linea de tiempo), modo grabar (negro-contenido-negro), cero errores de consola y capturas 9:16 y 16:9
de apertura, ordenes, resolucion, batalla, fichas y final.

**Triple dado y Duda y apuesta: primeras partidas con modelos reales (22 de octubre de 2026, orden expresa: dos juegos distintos de Mayor o menor y Guerra, sin tope de gasto; el asistente eligio estos dos).** Una partida de cada uno, en vivo y en paralelo, Claude, GPT, Gemini y DeepSeek en ese orden, sin ensayo previo ni errores de API ni jugadas invalidas; costo de las dos **$0.46** (saldo $15.16 -> $14.70). **Triple dado:** seed 3671365445, 60 llamadas, 164,551 tokens, gana GPT 2-4-2-0, voz de 10:51 (partes de 5:25 y 5:38; sin gancho en ninguna: menos de 2 cortes que quepan; clips de 2:36 y 2:38, hay que recortarlos al editar). **Duda y apuesta:** seed 3684180910, 23 llamadas, 57,165 tokens, gana GPT 2-4-2-0 y DeepSeek es el eliminado, voz de 5:15 (partes de 2:42 y 2:46, caben en Shorts, Reels y TikTok; gancho solo para la parte 2). Escenas verificadas (reproduccion completa con voz = linea de tiempo, modo grabar, cero errores de consola, captura 9:16), 327 lineas de texto de las IAs escaneadas sin palabras ofensivas (`revision/j1-textos.txt` de cada serie); respaldo en `privado/datos-oficiales/`.

**Mapas: ocho biomas** (etapa 9). A `continente`, `arido`, `mares` e `interior` se suman cuatro con una `forma` propia (`FORMAS` en `src/mapa.js`; cada una sube o baja la elevacion segun el centro del mapa y donde estan las
capitales, asi que se reparte igual entre los reinos): **cordillera** (cadenas de montana del centro a la costa entre cada par de capitales vecinas, cortadas por un paso a media distancia; el doble o mas de montana que el
continente y concentrada en el centro), **istmo** (dos masas de tierra unidas por un cuello de 4 a 13 celdas), **golfo** (una bahia grande que entra por un borde) y **peninsulas** (un cuerpo central con un brazo de tierra hacia
cada capital). Cada capital tiene su «comarca» (alrededor de su salida la tierra nunca es mar ni montana). El continente sigue siendo bit a bit el de siempre (la huella de 12 mapas no cambio). `biomaDeSeed(seed, k)` sortea
entre los ocho; **el istmo no sale por sorteo con 3 o 5 reinos** (medido con bots: con 3 reinos el solitario de la masa norte ganaba 74 % y con 5, 2 %) pero se puede forzar con `--bioma=istmo`. Balance con 4 bots
adaptativos iguales (400 partidas por bioma, `node herramientas/medir-conquista.mjs --bioma=X`; imprime las victorias por asiento): ningun asiento sale de 18-32 % en ningun bioma (los cuatro viejos tambien: arido 18-32),
y el que va arriba en el turno 10/15/20 gana 40-56 / 49-60 / 62-68 %. Con ellos el peor caso del prompt de 5 reinos mide 6,171-6,249 tokens sobre 100 seeds (tope 6,500). La escena pinta cada uno con su paleta
(`web/casino/conquista-datos.js`). Los mapas por seed cambian (el sorteo es entre ocho): las partidas guardadas no se ven afectadas porque traen su mapa.

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
- Juego 6: **Mayor o menor** (categoria "Estrategia de eliminación"): motor, bots de control, evaluacion, pruebas y **escena de casino** (`web/escena.html`, ver su decision arriba) listos; primera
  corrida con modelos reales el 18 de octubre de 2026 (Claude vs GPT, ver arriba) (diseno en `privado/spec/mayor-o-menor-diseno.md`)
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
      volver a verificarlos en <https://openrouter.ai/models> antes de cada corrida con modelos.
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
      escena del video lista (plan 3, 17 de octubre de 2026; falta la prueba con modelos reales, AL FINAL). **Prueba de humo con modelos gratis corrida el 17 de octubre de 2026**
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
      - *La escena (HECHA el 17 de octubre de 2026):* `web/casino/` trae `conquista-datos.js` (constantes y lector del
        mapa guardado, `leerMapa`/`estadoInicial`), `linea-de-tiempo-conquista.js` (beats puros: apertura, ordenes,
        traicion, batalla, resolucion y final), `layout-conquista.js` (9:16 y 16:9), `mapa-dibujo.js` (terreno, reinos,
        fichas, flechas y estallido en canvas), `mesa-conquista.js` y `.css`, y el registro `conquista` en `lineas.js`
        (unidad `turno`, sin camara oculta, `comprobar` que apaga con «formato anterior» las partidas sin mapa legible
        o con combates sin `bandos`). El motor guarda ahora, aditivamente, `combates[].bandos` (con tropas, fuerza,
        armas y fortaleza de cada bando; `terr`, `fort`, `resultado` y `quedan` del combate) y el evento `pacto_cumplido`;
        `resumenPublico` ignora tipos de evento que no conoce, y 3 huellas sha1 de las `vistas` fijan que el prompt no
        cambió. Decisiva (pantalla VS): cae una capital, las dos fuerzas más altas difieren menos del 10 %, hay 3 o más
        bandos, o se ataca tras romper un pacto con el defensor ese turno; máximo 3 tarjetas por turno, por importancia;
        flechas: todas las de ataque y las 5 más importantes de las demás (máximo 10). Privados: «X le escribió en
        privado a Y» al enviarse; su texto sale en el `flashback` de la traición (el último de ese reino a su víctima,
        incluso del mismo turno), en el `cumplido` de un pacto (hasta 2) o en el panel final (los 3 más recientes sin
        revelar). Con `razon=1` las razones salen con la resolución. Pruebas con partidas reales de bots elegidas por
        búsqueda (`src/pruebas/escena/ayudas-conq.js`, seeds 18, 61 y 94), no con guiones. Hallazgo de la revisión visual:
        el marcador salió vacío en las primeras capturas (se desestructuraba `ancho`/`alto` de un canvas, que solo
        tiene `width`/`height`) y ninguna prueba de Node lo veía; ahora `estadoVisible()` informa `reinos` y
        `filasMarcador` y `erroresDeEstado` (`--estado`) lo exige. Una partida de 30 turnos dura unos 4 minutos sin voz.
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

## Sitio y publicacion por partes (18 de octubre de 2026)

La politica esta en CLAUDE.md («Publicacion de resultados»); aqui el como.

- **Archivos:** `src/publicacion.js` (puro: `esParteFinal`, `partidaParcial`, `registrarParte`, `armarSeriePublica`), `src/publicar.js` + `herramientas/publicar.mjs` (la orden), `src/marcador.js` (arma `web/marcador.json` solo con lo publicado, una tabla por juego), `web/catalogo.js` (juegos, partidas y buscador puros), `web/menu.js` (barra), `web/propuestas.js`, `web/index.html`, `web/juego.html`, `web/partida.html`, `web/metodo.html`, `web/proponer.html` (`serie.html` solo redirige a `partida.html`), `web/sitio.css`.
- **Datos:** el JSON completo vive en `data/*.json` (ignorado por git) y se respalda en `privado/datos-oficiales/`. Lo publico es `data/publicas/<serie>.json` (la serie con cada partida cortada hasta el ultimo turno subido; `truncada: true`, sin resultado ni evaluacion) y `data/publicas/registro.json` (que parte se subio, hasta que turno, si fue la final).
- **Prompts por turno:** `reconstruirPrompts` (`src/juegos/conquista/replay.js`) repite la partida con su seed y las respuestas guardadas y vuelve a armar el prompt de cada IA en cada turno; si el repaso no coincide con el estado guardado, no publica prompts y avisa. Hoy verificado (`fiel`) para las 4 partidas reales de Guerra.
- **Buscador (landing):** una sola caja de texto libre: cada palabra debe cuadrar con el nombre del juego, su categoria o una IA, y las numericas con un seed (desde 3 digitos acepta una parte, un seed corto solo si coincide entero); la busqueda viaja en la URL (`?q=...`) y los enlaces viejos `?seed=...` (el comentario fijado de cada video lleva `?seed=<seed de la partida>`) siguen sirviendo. La pagina de un juego filtra sus partidas por IA, estado y seed (`?id=juego&ia=&estado=&seed=`).
- **Sin series (21 de octubre de 2026):** `src/marcador.js` agrega `partidas` a `web/marcador.json`: lista plana, la mas reciente primero (`serie` = archivo de `data/publicas/` y `n` = partida dentro de el, solo para armar el enlace). `episodios` se mantiene por compatibilidad y el sitio ya no lo usa. La landing muestra un cuadro por juego y las ultimas partidas; el menu lista los juegos del marcador.
- **Redes y cache (21 de octubre de 2026):** `web/redes.js` guarda los enlaces e iconos (dibujos propios, no logos oficiales); la landing y el pie los pintan de ahi. Facebook: <https://www.facebook.com/profile.php?id=61595387681724> (pagina sin nombre de usuario todavia). GitHub Pages deja cada archivo 10 min en cache del navegador, y una pagina nueva con un `catalogo.js` viejo fallo con «does not provide an export named...»: por eso los `import` y el CSS llevan `?v=__V__` y `pages.yml` lo cambia por el commit (`sed` sobre los `.html` y `.js` de la raiz de `web/`).
- **Propuestas:** el sitio es estatico, asi que cada propuesta es un Issue de GitHub del repo publico (`web/propuestas.js`: `REPO`, `urlDePropuesta`). Quien propone necesita cuenta de GitHub y queda publica; se lista con sus apoyos (👍) desde la API publica (60 consultas por hora por IP; si falla, el sitio enlaza a los Issues). Alternativa futura si se quiere sin cuenta: un formulario con backend (Supabase o similar), que rompe el «sin servidor»; no se hizo.
- **Mayor o menor** (serie del 18 de octubre, 2 IAs reales): aun no se publica; su respaldo esta en `privado/datos-oficiales/`. Se publica con `publicar.mjs` cuando se suba su video.

## Formato vertical: zona segura para todos y subtitulos que se apagan (20 de octubre de 2026)

- **Por que:** en TikTok, Reels y Shorts la interfaz de la red tapa lo de arriba (titulo, busqueda) y lo de abajo (descripcion, comentarios, botones). La zona segura del 9:16 ya existia (`FORMATOS_ESCENA['9x16'].zona`: x 60, y 285, 890 x 1215) pero Guerra de territorios dibujaba cabecera, mapa y marcador en todo el lienzo (y 20 a 1900). Los otros 6 juegos ya cumplian.
- **Regla:** `src/pruebas/escena/layoutzona.test.js` falla si cualquier pieza de cualquier juego (todos los tamanos de mapa de Guerra) se sale de la zona en 9:16; solo las bandas VS van de lado a lado (a lo alto caben).
- **Guerra en 9:16:** cabecera (76 px) y aviso de IA arriba de la zona; el marcador pegado al pie (38 px por reino); el mapa con la celda entera mas grande en lo que queda (con 4 reinos 12 px en vez de 20, con 5 reinos 10; la prueba exige >= 10); feed y subtitulos sobre el pie del mapa, uno junto al otro; cartel, flashback, tarjetas, bandas VS y panel final empiezan debajo de la cabecera. El panel final se «aprieta» (clase `apretado`: letra y espacios mas chicos) solo si el contenido no cabe en la altura menor. Las piezas ya grabadas (parte 1 y clip 1 del piloto de Guerra) salieron con el diseno anterior.
- **Subtitulos verticales:** `MesaBase.mostrarSubtitulos(beat, ms)` pinta (`pintarSubtitulos`, que sobrescriben Guerra y La Fuga) y, solo en 9:16, hace aparecer el cuadro y programa su salida: se queda `1 s + 70 ms por caracter` (minimo 3.5 s, sin pasar del final del beat menos el fundido de 350 ms). En las capturas (`rapido`) queda a la vista. En 16:9 sigue fijo.

## Carpetas de grabaciones y nombres de los videos (20 de octubre de 2026)

- **Por que:** con muchas piezas por serie (2 partes + 3 clips, en 3 formatos) un nombre como `2026-10-19-conquista-claude-vs-gpt-...-p1-parte-1_9x16.mp4` no deja ver a que red va ni que falta subir.
- **Nombre del video:** `jN_PIEZA_FORMATO_REDES.mp4`, p. ej. `j1_pt1_9x16_fb-ig-tk-yt.mp4` (sin fecha desde el 20 de octubre: `jN` es el numero de juego, una partida empaquetada; sube de uno en uno en la carpeta del juego aunque cambie la serie; `paquete.json` de cada `paquete-jN` guarda su partida para conservar el numero al regenerar; `--juego=N` lo fija a mano). Pieza: `hkN` gancho, `ptN` parte, `clpN` clip. Redes en orden alfabetico con las siglas de `REDES` (`fb`, `ig`, `tk`, `x`, `yt`); salen de `redes` en `FORMATOS` (`herramientas/formatos.mjs`). La grabacion original lleva el mismo nombre sin formato ni redes (`j1_pt1.mkv`). La fecha solo queda en el nombre de la carpeta de la serie. Todo en `herramientas/nombres.mjs` (puro, con `src/pruebas/nombres.test.js`).
- **Redes por formato:** 9x16 -> Facebook, Instagram, TikTok y YouTube (Reels y Shorts); 16x9 -> Facebook, X y YouTube. **El 4x5 se quito el mismo dia**: Instagram publica hoy todo video como Reels y las guias de 2026 no coinciden en 4:5 para Facebook y X, asi que ninguna red lo necesitaba (se borraron su formato, su guia en la carta de ajuste y los archivos `_4x5` pendientes). Confirmar las cifras en la pantalla de subida de cada red.
- **Carpeta de la serie:** `grabaciones/listos/<juego>/<AAAA-MM-DD>_seed-<seedBase>/` con `originales/`, `por-subir/`, `subidos/`, `revision/` y `paquete-j<N>/`. `paquete.mjs` la crea (su `--salida` es esa carpeta); `recortar-formatos.mjs` recibe `--carpeta=<serie>/por-subir`. Al avisar el usuario de una subida, los archivos pasan de `por-subir/` a `subidos/`.
- **Facebook:** el paquete genera `<pieza>-facebook.txt` (como el de Instagram, con el enlace al marcador y 3 hashtags). Pagina creada el 20 de octubre de 2026.
- **Limpieza (20 de octubre):** se borraron las carpetas de capturas, los paquetes y revisiones del ensayo con reglas 1.0.0, las comparaciones de regresion de visuales y las voces y motores de voz descartados. De `grabaciones/voz/` quedan solo Piper y la voz elegida (`voz-narradora`), que usa `narrar.mjs`.

## Cierre de cada video: frase de la voz, logo, redes y pagina de resultados (21 de octubre de 2026)

- **Que es:** el ultimo beat (`tipo: 'cierre'`, id `cierre-N`) de toda pieza grabada: parte, clip y gancho. La voz dice una de 12 frases (`FRASES_CIERRE` en `web/casino/cierre.js`: «No olvides seguirnos y reaccionar.», «Síguenos y reacciona para no perderte la próxima partida.»...) y la tarjeta (a pantalla completa dentro de la zona segura, 9:16 y 16:9) muestra el logo, la frase, una fila por red con icono y @ (TikTok, Instagram, YouTube, Facebook y X; de `web/redes.js`) y la pagina de resultados.
- **Al azar, pero siempre igual:** la frase sale de `indiceDeCierre(clave)` (hash del seed, la partida del archivo y las unidades de la pieza o el numero de gancho): cada video dice una distinta y el mismo video es siempre el mismo (el `rng` con seed de siempre, nunca `Math.random`).
- **Voz:** `narrar.mjs` genera un audio por frase (todas) junto a los de la partida; la pagina usa el de la frase que toca (`entradaDeVoz` por id y fuente). Para una partida ya narrada, `--solo-cierres` los agrega a su `voz.json`. En el gancho `vozSoloCierre` deja pasar solo los `cierre-N` (los cortes no se narran).
- **Donde se agrega:** `escena.js` con `cierre=1` (la agregan `direccionDeGrabacion` y `direccionDeGancho`); `MesaBase.ejecutarCierre` la dibuja (`.cierre-juego` en `mesa.css`). Dura al menos 6.5 s (hay que leer los @) o lo que dure la voz; el paquete lo suma a cada pieza (`duracionDeCierre`) y los clips siguen siendo de 20 a 40 s de contenido. Al grabar con OBS, despues del cierre viene el fundido a negro de siempre.
- **Verificado** con una partida de cada uno de los 7 juegos reproducida entera con `cierre=1` (sin errores, la cabecera no cambia) y el gancho; el cierre queda dentro de la zona segura (60, 285, 890 x 1215).

## Gancho «Próximamente» (aprobado e implementado el 20 de octubre de 2026)

- **Que es:** una pieza nueva del paquete, la que se sube ANTES de la parte: `hk1` es el gancho de la parte 1, `hk2` el de la parte 2 (un juego corto de un solo video lleva un gancho, el video y los clips; orden de subida: gancho, parte, clips). Nombre: `26-10-19_p1_hk1_9x16_fb-ig-tk-yt.mp4`. El id interno de la pieza es `gancho-N`.
- **Como se ve (20 a 25 s):** tarjeta de apertura (2.5 s) «PRÓXIMAMENTE» con «<Juego> · Partida N · Parte M de K» y el logo; 4 a 6 cortes rapidos de ~2.5 s de momentos de ESA parte, con una etiqueta corta cada uno (los mismos momentos destacados que eligen los clips); tarjeta de cierre (3 s) «Parte M de K · No te la pierdas» y «Síguenos para ver cómo termina».
- **Reglas:** sin spoilers (solo momentos de esa parte, nunca el ultimo turno, que trae el resultado; el gancho de la parte 2 tampoco anuncia al ganador); sin voz narradora en los cortes y sin musica (el usuario pone la musica al subir; nada con derechos; solo suena la frase del cierre, ver «Cierre de cada video»); dice «Próximamente», no «mañana»; el paquete genera su texto por red con `[GANCHO: ...]` y sin resultado; las tarjetas pasan por la misma prueba de zona segura.
- **Como esta hecho:** `web/casino/gancho.js` (puro): `elegirCortes` toma las destacadas de la parte (`destacadasDe`, el paquete pide 40) con puntos > 0, sin la primera ni la ultima unidad de la partida, de mejor a peor mientras quepan en 20 s (con etiquetas); cada corte es una unidad entera acelerada para durar ~3.5 s (1x a 8x; no entra si ni asi baja de 6 s); con menos de 2 cortes esa parte sale sin gancho y el paquete lo advierte. `armarGancho` arma los beats (tarjetas `tarjeta-gancho` + copias con `vel`); `MesaBase.ejecutarTarjetaGancho` las dibuja dentro de la zona segura y `escena.js` pone la velocidad de cada corte (`gancho=1&cortes=10,6,14&parte=1&de=2`; `direccionDeGancho`). `marcarTiempos` suma lo que dura de verdad cada beat con su `vel`. Verificacion visual: `node herramientas/capturar-escena.mjs --archivo=... --gancho=auto --parte=1` (tarjetas y primer momento de cada corte) y con `--completa --vel=1` se comprueba que dura lo que dice el plan (17.8 s medidos contra 17.8 s del plan en el piloto).


## Diez modelos nuevos tras la prueba de humo (25 de octubre de 2026)

- **Que se hizo:** `herramientas/prueba-de-humo-modelos.mjs` llama a cada candidato 3 veces (Dilema, Lobo de noche, Lobo de dia) con el prompt de produccion y valida con el motor real; sin `--ejecutar` solo estima. De 11 candidatos de OpenRouter pasaron 10 (gasto total $0.23 en 43 llamadas). Plan y resultados: `privado/planes/plan-probar-modelos-nuevos.md`; respuestas completas en `privado/pruebas/humo-modelos-2026-10-25*.json`.
- **Registrados** (`src/modelos.js`, colores en `web/paleta.js`): de gama media `mistral`, `grok`, `qwen`, `minimax`, `glm`, `kimi`; economicos de practica `ministral`, `qwen-flash`, `glm-flash`, `phi4`. Los economicos de una familia comparten su color (como Haiku con Claude); Phi-4 lleva el suyo. Los 7 colores se eligieron con un optimizador con la metrica de `paleta.test.js` (Lab sobre cada terreno) repartidos por tono y con luminosidad de fondo oscuro, y se revisaron a ojo.
- **Cohere (Command A+) queda fuera:** su razonamiento solo se enciende o apaga (sin niveles) y se comio los 4000 tokens sin escribir una respuesta. Se reabre si `cuerpoDeLlamada` aprende a mandar `reasoning: {enabled: false}`.
- **Razonamiento «low» para GLM y Kimi (excepcion de la regla «medium»):** no ofrecen «medium» y arrancan en «max»; con «max» las llamadas largas gastaron los 4000 tokens pensando y no contestaron (rechazados). Con «low» pasaron 3/3. Sigue siendo «nunca mas que medium» (`razonamientoDe` en la herramienta; `parametros.test.js` lo acepta solo para esos tres). Sin niveles utiles (Mistral, MiniMax, Qwen Flash, Ministral, Phi-4) se usa el defecto del modelo.
- **Lo que NO se probo:** esto confirma el FORMATO, no que jueguen bien ni que aguanten una partida completa (Lobo hasta 100 llamadas): antes de grabar con uno, una partida completa de prueba. Phi-4 tiene contexto de 16K. Qwen Flash y Kimi tardan (20-125 s por llamada con razonamiento). `lote: false` en todos: el catalogo trae variante `:batch` de Mistral, Grok, GLM, Ministral y GLM Flash pero no se probo, y en GLM la variante de lote es mas cara que la normal.

## Partidas con modelos de práctica y llamadas inválidas siempre analizables (25 de octubre de 2026)

- **Regla del usuario: una partida con modelos de práctica (económicos) se da por buena, siempre.** Si sale bien sirve de contenido aunque mezcle modelos de práctica con los de gama media (la primera partida real de Lobo mezcló 8 familias, una de ellas Phi-4). `correr.js` la deja en `data/pruebas/` y el marcador no la lee, pero `herramientas/publicar.mjs` acepta cualquier archivo de `data/`, así que se puede publicar sin trabas.
- **Cada llamada inválida se puede analizar:** por qué, de qué modelo y con qué texto. Lobo (`src/juegos/lobo/turno.js`) guarda en `privado.acciones` de cada respuesta inválida el `motivo` (`motivoInvalido`: qué campo falló y qué se recibió, p. ej. `voto debe ser un asiento entero (recibió "3")`) y los primeros 400 caracteres del texto crudo, igual que ya hacían Guerra, Duda y apuesta y La Fuga. La arena (`src/arena.js`) conserva ahora el texto, el motivo de fin y los tokens de las respuestas cortadas por `max_tokens` o sin JSON (antes se perdían: no se veía qué contestó el modelo y su costo no se contaba; MiniMax figuraba con 4052 tokens de salida aunque dos llamadas se cortaron en 4000).
- **Se ve siempre:** `src/correr.js` imprime al terminar cada partida cuántas llamadas inválidas tuvo cada modelo y por qué; `node herramientas/analizar-invalidas.mjs --archivo=pruebas/NOMBRE.json` lista cada una con turno, fase, causa y texto crudo (`src/invalidas.js` lee el dato de cada juego). Las partidas guardadas antes de este cambio no traen el motivo ni el texto de Lobo (la de Phi-4 del 25-10 quedó «sin motivo registrado»).
- **Corrección de la arena y de `correr.js` con Lobo:** los registros de Lobo no traían `errores` y la primera corrida real se perdió al resumirla; la arena completa `errores` si el juego no los guarda y el resumen entiende resultados por bando.

## Gancho en imagen para los juegos sin gancho en video (25 de octubre de 2026)

- **Regla del usuario:** donde no se pueda generar el gancho «Próximamente» en video, se genera en imagen: texto «Próximamente» (o similar), número de juego y número de parte, con imágenes de la aldea o de algún personaje a elección de quien lo diseña. Aplica a todos los juegos; está en `AGENTS.md`.
- **Cómo funciona:** `construirPaquete` (web/casino/paquete-textos.js) crea una pieza `gancho-imagen` en cada parte con menos de 2 cortes buenos (`elegirCortes`); `herramientas/paquete.mjs` genera los PNG con `herramientas/gancho-imagen.mjs` (servidor de `web/` en un puerto libre + Chrome/Edge sin cabeza sobre `web/gancho-imagen.html`) en `por-subir/jN/` con el nombre de los videos (`j1_hk1_9x16_fb-ig-tk-yt.png`, `j1_hk1_16x9_fb-x-yt.png`). El LEEME la lista antes de su parte (no se graba), con vista previa y comando para regenerarla; `textos/gancho-N.txt` trae título y descripción.
- **Diseño:** marca del sitio (Barlow Condensed e Inter locales, `--oro`, `--hueso`, `--noche`), todo dentro de la zona segura del formato, etiqueta de IA y «Juego N · Parte M de K» (N = el jN del paquete, no el número de partida). Arte por juego en `ARTE_GANCHO` (`web/casino/gancho-imagen.js`): Lobo lleva el panorama de la aldea y sus seis personajes en pose de acción; un juego sin entrada lleva solo la marca. La página se autocomprueba (`data-fuera` = elementos fuera de la zona, debe ser 0) y una prueba con navegador lo verifica en ambos formatos, con y sin arte.
- **Detalle técnico a recordar:** el navegador se lanza con `spawn` asíncrono; con `spawnSync` el servidor del mismo proceso se congela mientras el navegador le pide la página y todo se queda esperando.

## Guerra de territorios 2.1.1: correcciones de la auditoría (25 de octubre de 2026)

Una auditoría independiente (62 400 partidas con bots, sin API) encontró un bug del motor y varias reglas que el motor aplicaba y el texto no decía. Versión de reglas `conquista-2.1.1`; el cerco de la Maravilla (2.1.0) no cambia.

- **Extinción mutua (bug).** Si los últimos reinos caen en el mismo turno, la partida seguía vacía hasta el turno 30 y declaraba ganador a un reino muerto. Ahora termina en ese turno (`src/juegos/conquista/turno/cierre.js`), gana el que tenía más regiones al caer (luego el sorteo con seed, el orden de los caídos de `clasificar`) y el resultado guarda `extincionMutua: true`. Frecuencia medida: 1 de cada 800 partidas con bots.
- **Registro de combate.** Cada combate guarda `bajas`: todas las unidades que desaparecen. `perdidas` conserva su significado (el duelo de los dos bandos más fuertes; un tercer bando eliminado sin pelear no cuenta ahí, y `batalla.test.js` lo fija).
- **Texto de reglas.** Ahora dice los puntos (5 al 1.º, 3 al 2.º, 1 al 3.º), los desempates (unidades, almacén y sorteo), la extinción mutua, que la producción y el hambre van antes de gastar (el almacén y «Puedes reclutar hasta» son los de antes) y que deserta el 10 % de cada pila con mínimo 1. El tope de 6 500 tokens del prompt no se tocó: para que cupiera se recortaron frases redundantes (el cerco ya no repite «no hace falta tomar la capital»; se quitó el ejemplo de `mover` y «el dueño también puede atacarlas»).
- **Lo que se dejó fuera del prompt por el tope y se documenta aquí:** si dos reinos construyen la Maravilla en el mismo turno gana el primero de la lista de reinos (el otro no paga; ocurre en el 0 % de las partidas de tipos y todos, 0.25 % en diplomacia y 4.3 % en el espejo de leales); los empates de combate (el dueño que pelea se queda con 1 unidad; si no, ambos lados desaparecen); con tres o más bandos pelean los dos más fuertes; con solo 2 reinos no hay pactos. Para neutralizar la prioridad por asiento habría que sortear el orden con la seed; no se hizo porque los gastos se resuelven en el orden en que se escriben.
- **Decidido el 25-10-2026 (el usuario):** la prioridad por asiento de la Maravilla simultánea se acepta como está (arriba); la voz y los subtítulos del final cuentan la extinción mutua («…los últimos reinos cayeron a la vez y era el que más regiones tenía», `linea-de-tiempo-conquista.js`, y «Ganó X tras una extinción mutua» en los textos del paquete); el panel del final no la marca (ocurre 1 de cada 800 partidas con bots; marcarla pide capturas 9:16 y 16:9).
- **Pendiente de decidir (no aplicado):** cerco 3 queda como está (ningún umbral cumple el objetivo del 25 % en las cuatro mezclas: la Maravilla decide el 61 % del espejo de leales); Reconquista sigue apagada (su perjuicio histórico no se demostró).
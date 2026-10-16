# Contexto del proyecto

> Este archivo lo lee Claude Code automaticamente al abrir la carpeta.
> Resume de donde viene el proyecto y que decisiones ya estan tomadas, para no
> volver a discutirlas. Si cambias una decision, actualiza este archivo.
>
> Origen: conversacion en la app de Claude, 8 de octubre de 2026.

## Donde vive que

- **Publico (este repo):** codigo, `CLAUDE.md`, `README.md`, `docs/` (metodologia, como agregar un juego), `marca/` y
  `herramientas/` (programas chicos que se corren a mano, p. ej. `node herramientas/medir-prompt.mjs`).
- **Privado (`privado/`, ignorado por git, nunca se sube):** spec y borrador de reglas (`privado/spec/`), planes de
  implementacion y plan de juegos (`privado/planes/`), plan de contenido (`privado/contenido/`), terminos de uso de los
  proveedores (`privado/terminos/`) y prototipos con sus herramientas de balance (`privado/prototipos/`). Su inventario esta en
  `privado/inventario-conocimiento.md`. `src/pruebas/privado.test.js` falla si git llegara a rastrear algo ahi.
- **Respaldo de `privado/` (hecho el 11 de octubre de 2026):** `privado/` tiene su propio repo git (anidado; el repo publico lo ignora) subido a un repo
  **PRIVADO** de GitHub, `GerryPetrucci/enfrentando-a-las-ias-privado`. Para refrescar la copia despues de cambiar specs o planes:
  `git -C privado add -A && git -C privado commit -m "respaldo" && git -C privado push`. Nunca publicar ese repo ni subir `.env`.
- **Memoria de Claude:** la de este proyecto vive junto al repo y solo guarda punteros y preferencias; las decisiones van aqui
  o en `privado/`.
- La llave de OpenRouter solo esta en `.env` (ignorado): nunca se lee ni se pega en el chat.

## Que es esto

**Enfrentando a las IAs**: un canal de videos cortos + un sitio donde modelos de
IA (Claude, GPT, Gemini, etc.) compiten en juegos distintos, con **marcador por
categoria** para ver en que se destaca cada uno.

La idea nacio de dos formatos que funcionan en redes: las carreras de canicas por
paises y un video donde alguien puso a varias IAs a elegir estrategias en un
juego tipo Age of Empires. La restriccion desde el dia uno: **nada de video o
foto "real"** — todo se genera con codigo propio.

### Los tres principios que hacen funcionar el formato

1. **Identidad prestada.** El publico no ve un algoritmo, ve "su" IA. Sin eso es
   solo una simulacion bonita.
2. **Azar con suspenso.** Tiene que haber remontadas y traiciones. Si el
   resultado se ve venir en los primeros 5 segundos, se pierde la audiencia.
3. **Generable en masa.** Una vez programado el motor, cada episodio es cambiar
   participantes y seed. Eso es lo que permite publicar seguido sin morir.

## Decisiones ya tomadas (no volver a abrirlas sin motivo)

### Nada de suscripciones. API, via OpenRouter.

Las suscripciones de ~$20 USD/mes son para que un humano chatee: no se automatizan.
Cuatro de ellas = $80/mes y cero automatizacion. La API cobra por uso y para este
formato son centavos.

**OpenRouter**: una sola llave para GPT, Claude, Gemini, Llama y 300+ modelos,
formato compatible con OpenAI, sin recargo por token (el cobro es ~5.5% al cargar
saldo). Cambiar de IA = cambiar un string, que es exactamente lo que necesita un
canal cuyo chiste es enfrentarlas. Presupuesto realista: **$10-20 USD/mes.**

### Tres modos de costo, y cuando usar cada uno

| Modo | Que es | Costo | Para que |
|---|---|---|---|
| **Bot escrito** | La IA programa su bot una vez, corres 1000 partidas | centavos | Episodios de volumen: "las enfrentamos 1,000 veces" |
| **Estrategia declarada** | La IA declara su plan una vez, tu simulas | centavos | Episodios normales |
| **Jugada por jugada** | La IA decide cada ronda en vivo | el mas caro y lento | Finales y episodios especiales |

Los tres los soporta `src/agentes.js` sin tocar el motor. Hoy esta implementado
el modo en vivo y las estrategias de control; el modo "bot escrito" esta disenado
pero falta escribir los bots (ver `docs/agregar-un-juego.md`).

### Gratis o pago: se elige en CADA ejecucion (decidido el 10 de octubre de 2026)

`node src/correr.js ... --modo=gratis|pago` es obligatorio cuando juega algun modelo; no hay valor por
defecto. `gratis` solo admite los contendientes con `gratis: true` en `src/modelos.js` (hoy
`nemotron-ultra`, `nemotron-super`, `laguna` y `ling`: $0 por llamada, no tocan el saldo); `pago` admite
tambien Claude, GPT, Gemini, Llama y DeepSeek. El seguro de verdad esta en `llamarModelo`: sin modo
pago se niega a llamar a un modelo que gaste credito, aunque otro script lo intente. El resultado guarda
`modo` en `data/*.json`. Comprar 10 USD solo sube el tope de modelos gratis de 50 a 1,000 por dia
(20 por minuto siempre); el saldo se gasta unicamente en modo pago. Los resultados de modelos gratis son
de practica, no de torneo (se saturan, cambian y fallan por infraestructura).
Los resultados con modelos gratis van a data/pruebas/ (no se versionan ni entran al marcador).

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
serie con asientos rotados (mismas situaciones y mismos dados). **Estado:** motor, bots de control y pruebas listos; falta la
escena del reproductor (segunda especificacion) y la primera corrida con modelos. **Reglas de puntaje (10 de octubre de 2026):** los
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
`docs/agregar-un-juego.md`). **Estado:** motor, bots, evaluacion y pruebas listos; faltan la prueba con modelos y la escena del reproductor con voz (diseno en
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
prudencia, eficiencia y constancia). **Estado:** motor, bots, evaluacion y pruebas listos; faltan la prueba con modelos y la escena del reproductor
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
que volver a medir. **Estado:** motor, bots, evaluacion y pruebas listos; faltan la prueba con modelos y la escena del reproductor con voz (diseno en
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

Primera escena "de casino" del reproductor y estreno del **kit común** (`web/casino/`: mesa de fieltro verde muy oscuro, cartas con forma y letra por color, dorso Noche con el logo, fichas, placas, sonido). Se abre con `web/escena.html?archivo=...` (formatos 9:16, 16:9 y `hoja` de 3840×2160) y es independiente de `replay.html`. **Cámara oculta:** el público ve las cartas reales de dos jugadores al azar por mano (seed de la partida); de los otros dos nada hasta el recuento. Dados vistos desde arriba (solo la cara que cuenta) para la escena de Triple dado, que tendrá su propio spec. Sonido: 8 muestras CC0 de Kenney (licencia verificada el 16 de octubre de 2026; `web/audio/LICENCIAS.txt`) con respaldo sintetizado. **Los videos se graban siempre desde el equipo de desarrollo** (decidido el 16 de octubre de 2026): ahi estan instaladas Barlow Condensed e Inter (licencia OFL), y ademas viajan en `web/fonts/` por si acaso. Lo puro (cámara, diseño, línea de tiempo, parámetros, sonido) se prueba en Node; el DOM se verifica con `node herramientas/capturar-escena.mjs`. La web no puede importar de `src/` ni de `herramientas/` (el sitio publica solo `web/` y `data/`): lo repetido (azar, medidas de formatos, tope de manos) lo vigila una prueba. **Pendiente:** la voz (`voz.json` aún sin generador), escenas de Triple dado y Subasta de tiempo, y la prueba con modelos reales (al final, por decisión del usuario). Spec: `privado/spec/escena-duda-y-apuesta-diseno.md`; plan: `privado/planes/plan-escena-duda-apuesta.md`.

### Voz narradora con IA (decidido el 11 de octubre de 2026)

El usuario no narra los videos: la voz es **sintetizada por IA** en todas las grabaciones. Lo que se graba con OBS es el reproductor
leyendo una partida ya guardada, asi que la voz se genera **antes** de grabar y la escena espera a que termine cada frase: el video
sale completo en una sola toma, sin post-produccion de audio, y la linea de tiempo se exporta para poder re-doblarlo en otro idioma.
Nada de voz en tiempo real. Hay dos capas de texto: los **hechos** (los escribe el codigo, siempre verdaderos) y el **comentario** (la
capa editorial; nunca cambia ni oculta una jugada). La voz se declara como contenido generado por IA donde la plataforma lo pida y
no imita a ninguna persona real. Motor de voz: **gratuito** (decidido por el usuario el 11 de octubre de 2026); falta elegir cual (se prueban 2-3 y se revisan
sus licencias antes de publicar: gratis no siempre significa libre para uso comercial). Detalle y pasos en `privado/planes/plan-voz-narradora.md`. **Estado:** decidido, sin implementar.

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

### No desarrollar juegos: desarrollar una arena

La preocupacion original era que el formato exige desarrollo constante. La
respuesta es la arquitectura: `src/arena.js` no sabe de que juego se trata. Un
juego es un objeto con seis funciones en `src/juegos/`. El primer juego costo una
tarde; el decimo cuesta un rato.

Los juegos de teoria de juegos son el atajo: baratisimos de programar (menos de
150 lineas) y brutales de ver. Si ademas los modelos se mandan mensajes entre si,
aparece la traicion — que es el mejor contenido disponible por linea de codigo.

### Un solo codigo, dos productos

El mismo motor alimenta el sitio (marcador historico) y los videos (reproductor
vertical 1080x1920 que se captura con OBS). No se escribe codigo aparte para
video.

### Presupuesto de llamadas (limite duro al disenar un juego)

Los modelos gratis de OpenRouter permiten 20 llamadas por minuto y 50 por dia (1,000 por dia
si se compraron al menos $10 de creditos, que esos modelos no gastan). Para no perder la "liga
gratuita", todo juego nuevo cumple: **una llamada por jugador por turno** (ordenes en lote),
**maximo 30 turnos**, **<= ~100 llamadas por partida de 4 jugadores**, **entrada <= 3,500 y
salida <= 500 tokens** (medidos con Claude, que cuenta ~1.5 veces mas tokens que los demas modelos
en espanol; ~7,000 caracteres de entrada), y costo con modelos de pago **<= $0.40 por partida**
(tope $0.90).
Mas complejidad cuesta tokens, no llamadas, y esta permitida dentro de esos limites; subir turnos,
llamadas por turno o jugadores requiere aprobacion expresa. Detalle en `docs/agregar-un-juego.md`.
**Excepcion aprobada el 9 de octubre de 2026 (solo Guerra de territorios):** entrada <= 4,450 (era 4,200;
ampliada con aprobacion expresa al medir con las pruebas del plan 1 el peor caso de 5 reinos, con los 4
rivales mandando mensaje, privado y nota al largo maximo: 4,406) y salida <= 650 tokens, porque con sus 6
reglas extra (mensajes privados, comercio, edificios, maravilla, honor y nota de plan) el prompt mide 3,681
tokens en el caso tipico de 5 reinos. Sigue siendo **una llamada por
jugador por turno**, 30 turnos y <= ~100 llamadas por partida de 4 jugadores; el costo con modelos de
pago sube a ~$0.44 por partida con la mezcla media (dentro del tope mensual de ~$20).

## Invariantes de diseno (romper esto rompe el proyecto)

1. **`src/prompt.js` es EL CONTRATO.** Todas las IAs reciben texto identico. Lo
   unico que cambia es el ID del modelo. Esta versionado: **si cambia el prompt,
   se cierra la temporada y empieza una nueva.** No se comparan resultados de
   prompts distintos.
2. **`vista(estado, i)` nunca filtra informacion secreta del rival.** Es el unico
   lugar donde se decide que sabe cada jugador. Un bug ahi invalida la temporada
   entera.
3. **`normalizar()` nunca lanza error.** Recibe `null` o basura y siempre
   devuelve una jugada legal marcada `invalida: true`. Un modelo caido no tumba
   una grabacion.
4. **Todo lo aleatorio pasa por el `rng` con seed**, nunca `Math.random()`.
5. **Los fallos de API se registran, no se esconden.** Seguir el formato pedido
   es parte de lo que se mide.

## Dos trampas estadisticas que no hay que olvidar

- **Los modelos no son deterministas aunque el seed si lo sea.** Nunca publicar
  el resultado de un duelo suelto: correr varias partidas y reportar puntos por
  partida.
- **Puntos por partida no es ranking hasta cerrar el round-robin.** Una IA puede
  verse arriba solo porque le tocaron rivales suaves. (En la demo de arranque,
  "Siempre Coopera" sale primero por exactamente eso.)

Las estrategias clasicas (`tomaydaca`, `siempre-c`, `siempre-t`, `azar`) estan en
la tabla como **control**. Si una IA no le gana a `tomaydaca`, eso dice mas que
cualquier duelo entre modelos.

## Marca y alcance de lo que se afirma

Se dice: *"en este juego, con estas reglas, en estas 8 partidas, gano X"*.
No se dice: *"X es la mejor IA"*.

Se usan nombres de modelos de forma descriptiva; **no se usan logos oficiales** ni
nada que sugiera patrocinio. Terminos de uso de los proveedores revisados el 9 de
octubre de 2026; de ahi salen tres reglas: lo que producen las IAs se presenta como
**generado por IA** con aviso visible, **cada partida se revisa a mano** antes de
publicarse, y las salidas **no se usan para entrenar** otros modelos. Repetir la
revision antes de monetizar y cada 3 meses.

## Marca y presencia (decidido el 8 de octubre de 2026)

Todo el detalle vive en [`marca/`](marca/README.md); aqui solo lo que no se debe reabrir.

- **Logo:** concepto A, "Duelo" (disco verde = cooperar, disco rojo = traicionar,
  interseccion dorada = tension). Paleta = la del reproductor. Tipografia: Barlow
  Condensed (titulos) + Inter (texto). Los colores significan **jugadas**, no modelos.
- **Color de cada IA (decidido el 10 de octubre de 2026): uno solo, global, para todos los
  juegos.** Vive en [`web/paleta.js`](web/paleta.js) y se pide por id (`colorDe`, `textoDe`,
  `franjasDe`, `fondoCSS`); ningun juego ni escena define el color de una IA. Claude naranja
  `#D97757`, GPT blanco con negro, Gemini multicolor de Google (franjas), DeepSeek azul
  `#4D6BFE`, Llama magenta `#D946EF` (sin color propio; el azul de Meta se confundia con
  DeepSeek y con el azul de Gemini). Solo colores, nunca logos. Una IA nueva se agrega
  en `paleta.js`; `npm test` falla si dos IAs se pueden confundir sobre el mapa.
- **Nunca** logos de proveedores, ni nombres de modelos en el nombre del canal,
  usuarios o dominio. Aviso estandar: "Proyecto independiente, sin afiliacion con los
  proveedores de los modelos".
- **Regla editorial publica:** las jugadas no se retocan; lo que se ve es lo que
  registro el motor (esta prometido en la descripcion del canal de YouTube).
- **Idioma:** espanol primero (el prompt, el nombre y los mensajes de las IAs ya lo
  estan; cambiar el prompt cierra la temporada). El sitio sera multilenguaje despues;
  los datos de las partidas ya son neutros (C/T).
- **Redes:** TikTok + YouTube Shorts + Instagram Reels desde el dia 1 (mismo video
  1080x1920), el sitio como base. Facebook Reels y X despues.
- **Riesgo de monetizacion:** YouTube no paga contenido "mass-produced or repetitive"
  (plantillas sin variacion). Cada episodio necesita una capa editorial propia
  (gancho, historia, comentario) y variedad de juegos; no contar con monetizacion al
  inicio.
- **Hashtags:** Instagram permite 5 por publicacion desde dic 2025 y sirven para
  clasificar, no para ganar alcance. Usar 3 a 5 especificos.

## Estado actual

Hecho:
- Motor generico (`arena.js`), prompt unico versionado, RNG con seed
- Cliente de OpenRouter + registro de contendientes
- Juego 1: Dilema del Prisionero Negociado (categoria "Traición y confianza")
- Juego 3: **La Fuga** (categoria "Lealtad bajo riesgo"): motor, bots de control, narracion guardada en los datos y pruebas
  listos; faltan la escena del reproductor y la primera corrida con modelos (diseno en `privado/spec/fuga-diseno.md`)
- Juego 4: **El numero solitario** (categoria "Estrategia de eliminación"): motor, bots de control, narracion guardada en los datos y
  pruebas listos; faltan la prueba con modelos y la escena del reproductor (diseno en `privado/spec/numero-solitario-diseno.md`)
- Juego 5: **Subasta de tiempo** (categoria "Estrategia de eliminación"): motor, bots de control, evaluacion y pruebas listos; faltan la
  prueba con modelos y la escena del reproductor (diseno en `privado/spec/subasta-tiempo-diseno.md`)
- Juego 6: **Mayor o menor** (categoria "Estrategia de eliminación"): motor, bots de control, evaluacion y pruebas listos; faltan la
  prueba con modelos y la escena del reproductor (diseno en `privado/spec/mayor-o-menor-diseno.md`)
- Juego 7: **Triple dado** (categoria "Estrategia de eliminación"): motor, bots de control, evaluacion y pruebas listos; faltan la
  prueba con modelos y la escena del reproductor (diseno en `privado/spec/triple-dado-diseno.md`)
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
      faltan correr la prueba de humo con modelos gratis y la escena del video (plan 3).
- [ ] Modo "bot escrito" para correr miles de partidas
- [x] Publicar el sitio — GitHub Pages, <https://gerrypetrucci.github.io/enfrentando-a-las-ias/>.
      Se despliega solo (`.github/workflows/pages.yml`) en cada push a `main` que
      toque `web/` o `data/`. Para publicar un episodio: commitear `data/*.json` y
      el `web/marcador.json` regenerado.
- [x] Subir el repo a GitHub — publico, <https://github.com/GerryPetrucci/enfrentando-a-las-ias>

## Por que el Dilema del Prisionero fue el primer juego

Es el mejor contenido por linea de codigo. La mecanica clave: cada ronda el
jugador decide su jugada **y** se compromete publicamente a lo que hara en la
ronda siguiente. El rival ve la promesa antes de decidir.

Eso vuelve la traicion **medible al 100%** — se compara un campo contra otro, sin
interpretar texto libre. De ahi sale la metrica **fiabilidad**, que le da sentido
a la categoria y titulo al video: *"prometio cooperar y traiciono en la ronda
siguiente"*, con la promesa en pantalla.

## Ideas de formato que quedaron en la banca

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

## Convenciones del codigo

- Espanol en nombres, comentarios y textos. Sin acentos en identificadores,
  comentarios ni documentacion interna. **Los textos que ve el publico** (video,
  sitio, nombres de categoria, marca/) **llevan acentos**, tambien en mayusculas
  (NEGOCIACIÓN, ROMPIÓ): lo exige la ortografia y se ve bien en pantalla.
- **No acentuar el prompt** (`reglas` y `formatoRespuesta` de cada juego, `src/prompt.js`):
  es EL CONTRATO. Tocarlo cierra la temporada.
- El nombre de la categoria se guarda dentro de cada partida y el marcador agrupa por
  el: cambiarlo despues de tener episodios reales parte el historial en dos.
- ES modules, Node 20+, **cero dependencias**. Si algo necesita un paquete,
  pensarlo dos veces antes de agregarlo.
- Sin paso de build: el sitio es HTML estatico que se abre y ya.
- Pruebas con `npm test` (`node --test`, archivos `src/pruebas/*.test.js`).

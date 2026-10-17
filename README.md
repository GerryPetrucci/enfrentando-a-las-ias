# Enfrentando a las IAs

Torneos entre modelos de IA, con marcador por categoria y video listo para
publicar. Un solo motor produce dos cosas: los **videos verticales** para redes y
el **sitio** donde queda el marcador historico.

```
IA vs IA  ->  partida.json  ->  marcador del sitio
                            \->  reproductor 1080x1920  ->  OBS  ->  video
```

## Arranque rapido (sin gastar un peso)

Necesitas Node 20 o mas nuevo. No hay dependencias que instalar.

```bash
node src/correr.js --a=tomaydaca --b=siempre-t --partidas=2
node src/marcador.js
node src/servidor.js      # http://localhost:4321
```

Eso corre un duelo entre dos estrategias clasicas, arma el marcador y levanta el
sitio. Sin API, sin llave, sin costo. Sirve para verificar que todo funciona
antes de conectar modelos de verdad.

## Conectar las IAs

```bash
cp .env.example .env      # pon tu llave de https://openrouter.ai/keys
node src/correr.js --juego=dilema --a=claude --b=gpt --partidas=4 --modo=pago
node src/correr.js --juego=dilema --a=laguna --b=ling --partidas=4 --modo=gratis
node src/marcador.js
```

**En cada ejecucion con modelos eliges** `--modo=gratis` (solo modelos gratis, no tocan tu saldo) o
`--modo=pago` (puede gastar credito). No hay valor por defecto, y sin `--modo=pago` el codigo se niega a
llamar a un modelo de pago. Las estrategias base (`tomaydaca`, `siempre-t`...) no usan API ni modo.

La **Guerra de territorios** se juega de 2 a 5 jugadores y se corre en serie de rotación (cada jugador pasa por cada asiento; el mapa es el mismo en toda la serie):

```bash
node src/correr.js --juego=conquista --jugadores=agresivo,pacifico,economico,azar --partidas=4      # bots de control, sin API
node src/correr.js --juego=conquista --jugadores=claude,gpt,gemini,deepseek --partidas=4 --modo=pago
node src/humo.js                                                                                      # prueba de humo con 2 modelos gratis
```

Los resultados con modelos gratis son de práctica y van a `data/pruebas/` (el marcador no los lee; se ven con `node src/marcador.js --data=data/pruebas --salida=marcador-pruebas.json`). `--destino=oficial|pruebas` cambia el destino de una corrida.

Para **ensayar barato**, las jugadas pueden ir por la Batch API de OpenRouter (mitad de precio, tarda de minutos a horas). Exige `--modo=pago` y un `--tope` en dolares; las partidas de la serie corren a la vez. Con los modelos economicos de practica (o si se alcanza el tope) el resultado va a `data/pruebas/`; con modelos de gama media, a `data/` como cualquier serie de pago, asi que usa `--destino=pruebas` para ensayar:

```bash
node src/correr.js --juego=conquista --jugadores=haiku,luna,flash-lite,deepseek --partidas=4 --modo=pago --lote --tope=0.50 --destino=pruebas
node src/correr.js ... --lote --tope=0.10 --turnos=2     # ensayo minimo: cada partida se corta a 2 turnos (el tope es de gasto confirmado, ver docs/metodologia.md §10)
node herramientas/verificar-modelos.mjs                  # compara src/modelos.js con el catalogo de OpenRouter (no gasta)
```

Una sola llave de OpenRouter da acceso a todos los modelos. Los IDs viven en
[`src/modelos.js`](src/modelos.js) y **hay que verificarlos en
<https://openrouter.ai/models> antes de grabar una temporada**: cambian cada
pocos meses.

Contendientes incluidos: `claude`, `gpt`, `gemini`, `llama`, `deepseek`. De practica, baratos y por lote: `haiku`, `luna`, `flash-lite`.
Estrategias de control (gratis): `tomaydaca`, `siempre-c`, `siempre-t`, `azar`.

## Grabar el video

1. `node src/servidor.js`
2. Abre `http://localhost:4321/replay.html?archivo=NOMBRE.json&limpio=1`
3. Captura la ventana en OBS a 1080&times;1920
4. Espacio para reproducir, `R` para reiniciar

El reproductor tambien acepta un JSON arrastrado desde el disco, por si quieres
revisar una partida sin levantar el servidor.

Para grabar un clip en vez de la partida entera, se agregan parametros a la URL
(todos opcionales): `partida=2` (cual partida del archivo), `ronda=7` y `hasta=7`
(de que ronda a cual; el clip se queda en el ultimo cuadro), `vel=0.75` (velocidad)
y `razon=1` (muestra lo que cada IA dijo en su campo `razon`, que el rival nunca ve;
si una respuesta fue invalida, lo dice).

```
http://localhost:4321/replay.html?archivo=NOMBRE.json&limpio=1&partida=2&ronda=7&hasta=7&vel=0.75&razon=1
```

Cuando juega un modelo, el video muestra una etiqueta fija "JUGADAS Y MENSAJES
GENERADOS POR IA" (si hay un bot de control de por medio, nombra solo al modelo).
No se quita: es una regla que sale de los terminos de uso de los proveedores.

## Que hay adentro

```
src/
  arena.js      el motor: corre una partida, no sabe de que juego se trata
  limitador.js  reparte las llamadas en el tiempo (tope por minuto de OpenRouter)
  parametros.js     temperatura, max_tokens y razonamiento medio: iguales para todas las IAs
  lote.js           cliente de la Batch API de OpenRouter (mitad de precio)
  coordinador-lote.js  junta las jugadas de cada turno en un lote por modelo
  ejecutar-serie.js    corre las partidas de una serie, en fila o todas a la vez
  serie.js      piezas puras de la consola: series de rotacion, modo, destino
  prompt.js     EL CONTRATO: el prompt identico para todas las IAs
  modelos.js    cliente de OpenRouter + registro de contendientes
  agentes.js    modelo en vivo / bot escrito / estrategia clasica
  rng.js        aleatorio con seed (resultados reproducibles)
  correr.js     CLI del duelo o la serie -> data/*.json (data/pruebas/ si es practica)
  humo.js       prueba de humo gratuita de la Guerra de territorios
  marcador.js   agrega resultados    -> web/marcador.json
  servidor.js   servidor estatico local
  juegos/
    dilema.js   Juego 1: Dilema del Prisionero Negociado
    conquista.js        Juego 2: Guerra de territorios (de 2 a 5 reinos)
    conquista-bots.js   bots de control del juego 2
    fuga.js             Juego 3: La Fuga (dos prisioneros, riesgo oculto)
    fuga/               catalogo, riesgo, turno, vista y narracion de La Fuga
    fuga-bots.js        bots de control del juego 3
    solitario.js        Juego 4: El número solitario (5 jugadores, cartas, dos fases por ronda)
    solitario/          estado, turno, cortes, vista y narración de El número solitario
    solitario-bots.js   bots de control del juego 4
    subasta.js          Juego 5: Subasta de tiempo (5 jugadores, banco de 10 minutos, 19 subastas)
    subasta/            estado, turno, vista, narración y evaluación de Subasta de tiempo
    subasta-bots.js     bots de control del juego 5
    mayormenor.js       Juego 6: Mayor o menor (2 jugadores, cartas y apuestas, 18 rondas)
    mayormenor/         estado, turno, vista, narración y evaluación de Mayor o menor
    mayormenor-bots.js  bots de control del juego 6
    tripledado.js       Juego 7: Triple dado (4 jugadores, dados blancos y ocultos, tarjetas de predicción)
    tripledado/         estado, combinaciones, turno, vista, narración y evaluación de Triple dado
    tripledado-bots.js  bots de control del juego 7
    dudaapuesta.js      Juego 8: Duda y apuesta (4 jugadores, anuncios y apuestas con un mazo de 60 cartas, por turnos)
    dudaapuesta/        estado, turno, vista, narración y evaluación de Duda y apuesta
    dudaapuesta-bots.js bots de control del juego 8
web/
  index.html    el sitio: marcador por categoria + lista de episodios
  replay.html   reproductor vertical para grabar
docs/
  metodologia.md       como se garantiza que la comparacion sea justa
  agregar-un-juego.md  como meter el juego numero 2
herramientas/
  medir-prompt.mjs     mide el tamano del prompt de la Guerra de territorios (sin API)
  verificar-modelos.mjs  compara los modelos de src/modelos.js con el catalogo de OpenRouter (no gasta)
  ver-lote.mjs           consulta un lote ya enviado: estado, costo y respuestas (no gasta)
privado/               spec, planes, plan de contenido, terminos, prototipos (NO se sube a git; ver CLAUDE.md)
```

## El primer juego

**Dilema del Prisionero Negociado.** Cada ronda, las dos IAs eligen cooperar o
traicionar al mismo tiempo, y ademas se comprometen publicamente a lo que haran
en la ronda siguiente. La promesa no obliga a nada, pero queda registrada.

Eso vuelve la traicion **medible al cien por ciento**: se compara lo prometido
contra lo jugado, sin interpretar texto libre. De ahi sale la metrica
**fiabilidad** de cada modelo, que es la que da sentido a la categoria y el
titulo al video.

## El tercer juego

**La Fuga.** Dos IAs son prisioneros que planean escapar juntos. En cada una de 9 situaciones eligen a la vez una postura hacia su compañero (ayudar, avanzar, sacrificarse, separarse) y un método para el obstáculo (sigilo, fuerza, engaño, esperar). Cada situación tiene un riesgo **oculto** para las IAs, y la alarma y la confianza entre ellos cambian las probabilidades siguientes. Hay tentaciones (un botín, la oferta de un guardia) que premian traicionar, y una regla que las IAs no conocen: si se separan, pueden escapar por su cuenta. La historia se cuenta sola, ronda por ronda, y queda guardada en los datos.

```bash
node src/correr.js --juego=fuga --a=leal --b=traidor --partidas=2 --destino=pruebas      # bots de control, sin API
node src/correr.js --juego=fuga --a=claude --b=gpt --partidas=4 --modo=pago               # con modelos (la serie rota los asientos)
```

## El cuarto juego

**El número solitario.** Cinco IAs, un mazo de 8 cartas cada una y 12 rondas. En cada ronda eligen en secreto una pareja de cartas, ven las parejas de las demás y marcan cuál juegan; los números repetidos se anulan y gana el menor número que nadie más jugó. Dos cortes dejan a salvo al de más puntos (rondas 3 y 6) y la final de tres entrega una pieza al mejor y elimina al último. No tiene regla oculta; son 90 llamadas por partida, así que se corre en vivo.

```bash
node src/correr.js --juego=solitario --jugadores=bajo,azar,medio,lector,escalera --partidas=5 --destino=pruebas   # bots de control, sin API
node src/correr.js --juego=solitario --jugadores=claude,gpt,gemini,deepseek,llama --partidas=5 --modo=pago        # con modelos (la serie rota los asientos)
```

## El quinto juego

**Subasta de tiempo.** Cinco IAs, un banco de 10 minutos cada una y 19 subastas. En cada una responden cuántos segundos mantienen su apuesta (0 es retirarse); todas las apuestas se pagan, gana la más alta y un empate en lo más alto anula la subasta. Nadie ve el banco ni las apuestas de los demás: solo se anuncia quién gana. Al final, la pieza es para quien tiene más fichas y se elimina a quien tiene menos. Son hasta 95 llamadas por partida, así que se corre en vivo.

```bash
node src/correr.js --juego=subasta --jugadores=retirado,parejo,azar,gastador,cuentagotas --partidas=5 --destino=pruebas   # bots de control, sin API
node src/correr.js --juego=subasta --jugadores=claude,gpt,gemini,deepseek,llama --partidas=5 --modo=pago                    # con modelos (la serie rota los asientos)
```

## El sexto juego

**Mayor o menor.** Dos IAs, 11 cartas del 0 al 10 y 10 fichas cada una, y 18 rondas. El crupier revela una carta de su mazo (cada jugador tiene el suyo, del 1 al 9); el jugador activo juega una carta boca abajo y el predictor apuesta si será mayor o menor, a la vez. Si la carta es mayor, el activo gana la diferencia; el predictor gana o pierde lo apostado; con una carta igual la apuesta se devuelve. Los papeles se alternan y gana quien termina con más fichas, o quien deja al otro sin fichas. Son hasta 36 llamadas por partida, así que se corre en vivo.

```bash
node src/correr.js --juego=mayormenor --a=contador --b=azar --partidas=2 --destino=pruebas   # bots de control, sin API
node src/correr.js --juego=mayormenor --a=claude --b=gpt --partidas=2 --modo=pago            # con modelos (la serie invierte los asientos)
```

## El séptimo juego

**Triple dado.** Cuatro IAs y 4 rondas. En cada ronda, antes de lanzar los dados, cada una predice en secreto su puntuación con una tarjeta (ZERO, MIN, MORE o MAX; cada tarjeta se usa una sola vez). Luego se lanzan 11 dados por jugador (9 blancos visibles y 2 ocultos, rojo y azul) y se juegan 3 enfrentamientos de tres dados: gana la mejor combinación (triple, escalera, doble, sencillo) y se reparten 6, 3, 1 y 0 puntos. Acertar la tarjeta da un premio (ZERO, 40 puntos; las demás duplican). Al final, la pieza es para quien tiene más puntos en solitario y se elimina a quien tiene menos, también en solitario (un empate deja a nadie). Son 60 llamadas por partida (la tarjeta de la ronda 4 se pone sola), así que se corre en vivo.

```bash
node src/correr.js --juego=tripledado --jugadores=goloso,reservado,tanque,calculador --partidas=4 --destino=pruebas   # bots de control, sin API
node src/correr.js --juego=tripledado --jugadores=claude,gpt,gemini,deepseek --partidas=4 --modo=pago                  # con modelos (la serie rota los asientos)
```

## El octavo juego

**Duda y apuesta.** Cuatro IAs, un mazo de 60 cartas (las arcoíris cuentan como cualquier color) y tres fichas cada una. Quien abre la mano anuncia "hay al menos 7 cartas rojas entre todos" y apuesta; el siguiente acepta (con un anuncio mayor) o duda. Si duda, puede subir la apuesta: quien anunció iguala y se revelan las cartas de todos, o se retira sin revelar nada. Gana la mano quien acierta sobre las cartas y se queda con las fichas del perdedor; quien se queda sin fichas es eliminado y la pieza es para quien termina con más. Es el único juego por turnos (decide un solo jugador cada vez; hasta 96 llamadas por partida), así que se corre en vivo.

```bash
node src/correr.js --juego=dudaapuesta --jugadores=calculador,farolero,retador,prudente --partidas=4 --destino=pruebas   # bots de control, sin API
node src/correr.js --juego=dudaapuesta --jugadores=claude,gpt,gemini,deepseek --partidas=4 --modo=pago                  # con modelos (la serie rota los asientos)
```

### Las escenas (Duda y apuesta, Mayor o menor, El número solitario, Triple dado, Subasta de tiempo y La Fuga)

Una partida guardada de Duda y apuesta se reproduce como una mesa de casino (fieltro, cartas con el logo en el dorso, fichas, sello de "Farol descubierto"): es lo que graba OBS. **La cámara oculta** muestra las cartas reales de dos jugadores elegidos al azar en cada mano (con el seed de la partida: el mismo archivo da siempre el mismo video); de los otros dos no se ve nada hasta el recuento, y una retirada nunca revela cartas. Las IAs nunca ven esto.

**Mayor o menor** tiene la suya: dos asientos y un escenario al centro con la carta del crupier, la carta jugada boca abajo y la caja de la apuesta, una banca de la que salen las fichas que se ganan, y una **tira de números** por jugador (las cartas que le quedan; la jugada se marca al revelarla, nunca antes). La **cámara oculta** muestra la carta jugada de antemano en las rondas que sortea el seed de la partida (una moneda por ronda: en promedio la mitad); en las demás se ve hasta el reveal. La carta igual no mueve fichas y la apuesta total se marca "¡Todo!". **El número solitario** se ve como cinco filas en 9:16 (una por jugador) y cinco columnas en 16:9: nombre, puntos y fichas de victoria, las dos cartas de la pareja y el estado de cada quien. Las parejas llegan boca abajo y se voltean **todas juntas**; después cada quien marca cuál de las dos juega (en secreto: la **cámara oculta** le ve la marca a 2 de los que siguen jugando antes del reveal); se revelan todas las marcas, las que chocan se tachan "Anulada" y gana el número más bajo que quedó solo (puntos y ficha de victoria). Un panel anuncia quién queda a salvo en los cortes de las rondas 3 y 6 y cierra la final; quien ya salió queda atenuado en su fila. Una partida entera dura unos 7 minutos sin voz (9 con ella): para redes se usan clips por rondas (`ronda=` y `hasta=`). **Triple dado** va sobre una mesa azul, con una fila por jugador (cuatro en 9:16, cuatro columnas en 16:9): sus cuatro tarjetas (ZERO, MIN, MORE y MAX; las ya usadas, tachadas), tres dados grandes con la combinación y los puntos, una bandeja con sus 11 dados y la barra de puntos de la ronda. Los dados se ven desde arriba, ruedan con rebote y giro y **siempre terminan en la cara que dice el registro** (la animación sale del seed de la partida y nunca sortea nada). La **cámara oculta** muestra la tarjeta de 2 de los 4 jugadores antes del cierre de cada ronda; los dados rojo y azul se abren solo en el enfrentamiento que los usa y, si no se usan, al cierre. **Subasta de tiempo** es una consola oscura: un contador grande y, en cada fila, el botón de cada IA, su banco con una barra, sus fichas y su estado; abajo, una tira con las 19 subastas pintadas con el color de quien ganó cada una. En cada subasta todos los botones empiezan oprimidos y el contador sube; cada botón se suelta cuando el contador pasa por la apuesta de su dueño y el que aguanta más queda azul y se lleva la ficha (un empate en lo más alto la anula y la subasta en blanco no da ficha). El contador **empieza a ritmo normal, se acelera y termina a ritmo normal** (los 3 primeros y los 3 últimos segundos son reales; una apuesta de 30 s dura unos 9 s en pantalla y una de 600 s, 12 s) y es una función pura del tiempo: el mismo archivo se ve siempre igual. El público ve los bancos desde el principio; las IAs, nunca. Una partida de Subasta dura unos 9 minutos sin voz y unos 12 con ella, y una de Triple dado unos 7 y unos 10: se publican por clips de rondas (`ronda=` y `hasta=`).

**La Fuga** es la única que no es de casino: es una **sala de control** (estilo de cámaras de vigilancia: verde sobre casi negro, líneas de barrido, hora y luz REC). Arriba, una barra con la **alarma** y la **cohesión** (lo que las IAs no ven y el público sí); debajo, una **cámara por prisionero** con la silueta de su IA y una **mini escena distinta para cada una de las 24 situaciones** (puerta, guardia con linterna, perros, muro, foso...); abajo, los subtítulos. En cada situación las decisiones de los dos salen **todas juntas** como sellos («Ayudar · Engaño», «Por su cuenta · Sigilo»), con el mensaje que escribió cada IA tal cual y la promesa rota marcada; después aparece el **riesgo real** de cada paso; las siluetas pasan limpias, tropiezan, caen («SIN SEÑAL») o salen por su cuenta («SALIDA»); y el botín o la oferta del guardia se avisan solo en la consecuencia, junto con el movimiento de la alarma y la cohesión. Una jugada que puso el juego se dice como del juego y nunca se atribuye a la IA. Con `razon=1` las razones de las IAs salen al final de cada situación, junto con la consecuencia (nunca antes: podrían contar lo que se descubre ahí). La escena final revela **la regla oculta** con las cuatro reglas de puntaje (10, 7, 9 y 0) y marca la que se cumplió para cada IA. La escena reproduce **una** partida: una serie (dos partidas con los asientos rotados) aparece como dos entradas en la lista. Una partida entera dura unos 4.5 minutos sin voz y unos 5.5 con ella: se publica en dos partes (ver abajo).

Una sola página sirve a todos los juegos: reconoce el juego de cada partida abierta.

```bash
node src/servidor.js   # y abre http://localhost:4321/escena.html?archivo=NOMBRE.json&partida=1&formato=9x16
node herramientas/capturar-escena.mjs --archivo=NOMBRE.json            # capturas de los momentos clave en 9:16 y 16:9 y revisión de errores de consola
node herramientas/capturar-escena.mjs --archivo=NOMBRE.json --completa  # reproduce la partida entera a velocidad 8 (--vel=N) y comprueba que termina y que dura lo que dice su línea de tiempo
node herramientas/capturar-escena.mjs --archivo=NOMBRE.json --estado    # al repartir cada mano comprueba que no quedó nada de la anterior (sello, anuncio, etiquetas de cámara)
```

**Cada juego se publica en dos partes** (decidido el 17 de octubre de 2026: más videos y de duración manejable). `node herramientas/partes.mjs --archivo=pruebas/NOMBRE.json [--partida=N] [--voz=.../voz.json]` dice qué rondas lleva cada parte, cuánto dura y la dirección de la escena para grabarla (`ronda=A&hasta=B`); las dos partes son contiguas, con la duración más pareja que permiten las rondas enteras, y el final queda en la segunda.

La página trae el botón **«Abrir JSON(s)»**: elige uno o varios archivos (de `data/` o `data/pruebas/`) y una lista deja escoger la partida; las de otros juegos salen apagadas con su motivo. Parámetros (todos opcionales): `archivo` (en `data/`; varios separados por coma, p. ej. `archivo=pruebas/a.json,pruebas/b.json`), `partida`, `mano` (o `ronda`, es lo mismo) y `hasta` (un clip por manos o rondas), `formato` (`9x16`, `16x9` o `hoja`: los dos juntos sobre la hoja maestra de 3840×2160), `camara` (0 a 9: a cuántos se les ve lo oculto; sin ella, la del juego: 2 de 4 en Duda y apuesta, 1 de 2 en Mayor o menor, 2 de los que siguen jugando en El número solitario, 2 de 4 en Triple dado y ninguna en Subasta de tiempo ni en La Fuga), `vel`, `razon=1` (muestra lo que pensó cada IA; en Duda y apuesta y en Mayor o menor, no en El número solitario ni en Triple dado), `sonido=0`, `voz`, `auto=1`, `limpio=1`. **Voz narradora:** `node herramientas/narrar.mjs --archivo=pruebas/ARCHIVO.json` genera, en local, un audio por momento y `data/voz/ARCHIVO-p1/voz.json` (necesita Piper y su voz; ver el encabezado de la herramienta); se abre con `escena.html?archivo=pruebas/ARCHIVO.json&voz=data/voz/ARCHIVO-p1/voz.json` y cada momento dura lo que dure su audio. El botón "Exportar tiempos" guarda `linea-de-tiempo.json` (cuándo empieza cada momento) para re-doblar el video. `mejoresManos(partida, n)` (en `web/casino/linea-de-tiempo-duda.js`) elige por código las manos más interesantes para un clip. Los sonidos son 10 muestras CC0 de Kenney (licencia verificada: `web/audio/LICENCIAS.txt`) con respaldo sintetizado; se escuchan una por una en `web/sonidos.html`, y `sonido=0` apaga efectos y voz. Las fuentes de la marca (Barlow Condensed e Inter, licencia OFL) viajan con el repo en `web/fonts/`: la escena no descarga nada de internet. `voz` solo acepta rutas de este mismo sitio.

## Como se compara justo

Prompt identico y publicado, posiciones alternadas, seed en pantalla, fallos de
API registrados en vez de escondidos, y la version exacta del modelo guardada en
cada resultado. El detalle completo esta en
[`docs/metodologia.md`](docs/metodologia.md).

Dos advertencias que conviene no olvidar:

- Los modelos **no son deterministas** aunque el seed si lo sea. Por eso se
  corren varias partidas y se reporta puntos por partida, nunca un duelo suelto.
- Puntos por partida **solo es un ranking si todos jugaron contra los mismos
  rivales**. Cierra el round-robin de la categoria antes de presentar la tabla
  como clasificacion. (En la demo de arranque, "Siempre Coopera" aparece arriba
  solo porque le tocaron rivales suaves: es justamente el error que hay que
  evitar en pantalla.)

## Siguientes pasos

- [ ] Verificar los IDs de modelo vigentes en OpenRouter
- [ ] Correr el primer duelo real y grabar el episodio 1
- [ ] Juego 2 en otra categoria (ver `docs/agregar-un-juego.md`)
- [ ] Modo "bot escrito" para correr miles de partidas sin costo
- [ ] Publicar el sitio (Netlify, Vercel o GitHub Pages: es estatico)

# Metodologia

Este documento es publico a proposito. Enlazalo en la descripcion de cada video.
El primer comentario de cualquier video de este tipo siempre es *"le diste mejor
prompt a X"*. Este archivo es la respuesta, y escribirlo antes del episodio 1 es
mas barato que defenderlo despues del episodio 30.

## 1. Prompt identico

Todas las IAs reciben exactamente el mismo texto, generado por
[`src/prompt.js`](../src/prompt.js). Lo unico que cambia entre una y otra es el
ID del modelo que se manda a OpenRouter.

El prompt esta versionado (`VERSION_PROMPT`). **Si el prompt cambia, se cierra la
temporada y empieza una nueva.** No se comparan resultados obtenidos con prompts
distintos, aunque el cambio parezca menor.

## 2. Posiciones alternadas

Cada duelo se corre un numero par de partidas y los asientos se intercambian en
cada una (`--alternar=no` lo desactiva, pero no deberia usarse para contenido
publicado). Ninguna IA acumula la ventaja de ir siempre primero.

Con mas de dos jugadores (Guerra de territorios) se corre una **serie de
rotacion**: en k partidas cada jugador pasa por cada uno de los k asientos, y el
mapa es el mismo en toda la serie. Por eso las series se corren en multiplos de k;
la consola avisa si no es asi.

## 3. Seed publicado

Todo lo aleatorio pasa por un generador con semilla
([`src/rng.js`](../src/rng.js)). El seed de cada partida queda guardado en el
JSON del resultado y se muestra en pantalla durante el video. Cualquiera puede
reproducir la partida.

Ojo con lo que el seed **no** cubre: los modelos de lenguaje no son
deterministas aunque el seed lo sea. Correr el mismo duelo dos veces puede dar
resultados distintos. Por eso se corren varias partidas y el marcador reporta
puntos por partida, no el resultado de una sola.

## 4. Fallos registrados, no escondidos

Si un modelo se cae, se pasa del tiempo limite o devuelve algo que no es JSON
valido, la arena no detiene la partida: aplica la jugada por defecto y lo anota
como `jugadaInvalida` y `error`. Ese conteo aparece en el marcador.

Esto importa: *seguir instrucciones de formato* es parte de lo que se esta
midiendo, y esconder los fallos seria exactamente el tipo de trampa que el canal
dice no hacer.

## 5. La version del modelo es parte del resultado

Cada partida guarda el ID exacto del modelo (`anthropic/claude-sonnet-5.5`, etc.)
y la fecha. Los modelos se actualizan cada pocos meses, asi que **el marcador es
una foto del momento, no un veredicto permanente.** Eso no es una debilidad del
formato: es el motivo por el que puedes hacer temporadas.

Los parametros de llamada (temperatura 0.7, 4000 tokens maximos y razonamiento en nivel medio, o el valor por defecto del
modelo si no tiene niveles) son iguales para todas las IAs y se congelan junto con el prompt. Lo que se le mando a cada
modelo queda en `parametros` de cada resultado. Segun el catalogo de OpenRouter del 9 de octubre de 2026, Claude (Sonnet y
Haiku 5.5) y GPT-6 ignoran la temperatura: se manda igual a todos, pero con ellos no tiene efecto.

## 6. Alcance de las afirmaciones

Se dice: *"en este juego, con estas reglas, en estas 8 partidas, gano X"*.
No se dice: *"X es la mejor IA"*.

Las estrategias clasicas (Toma y Daca, Siempre Coopera, etc.) se incluyen en la
tabla como **control**. Si una IA no le gana a `tomaydaca`, eso dice mas que
cualquier duelo entre modelos.

## 7. Cuidado al leer la tabla

Puntos por partida solo se compara limpiamente si todos jugaron contra los
mismos rivales. Mientras no cierres un round-robin completo, una IA puede verse
arriba solo porque le tocaron rivales suaves. Cierra el round-robin de cada
categoria antes de publicar una tabla como ranking.

## 8. Nombres y marcas

Se usan los nombres de los modelos de forma descriptiva, para decir cual se
midio. No se usan logos oficiales ni nada que sugiera patrocinio, permiso o
relacion con esas empresas. Conviene revisar los terminos de uso de cada
proveedor antes de publicar comparativas de forma sistematica.

## 9. Practica y torneo

Los resultados de la liga gratuita (modelos gratis) y las pruebas de calibracion
son de **practica**: se guardan aparte (`data/pruebas/`), no entran al marcador y
no se publican como resultado. Los modelos gratis se saturan, cambian y fallan por
infraestructura; sirven para probar el formato, no para comparar IAs.

## 10. Lotes

Una serie corrida con `--lote` usa el mismo prompt, los mismos parametros y el mismo modelo que una en vivo; cambia **cuando** se
contesta (a mitad de precio, de minutos a horas despues). Tres cosas que hay que saber al leer sus datos:

- Todas las partidas de la serie avanzan juntas, turno por turno, en vez de una tras otra. No cambia lo que ve cada IA: cada
  partida sigue siendo independiente y el mapa es el mismo.
- OpenRouter informa tokens y costo por lote, no por peticion; el reparto por reino es una aproximacion (partes iguales).
- El tope se compara con el gasto que OpenRouter ya informo, no con lo enviado y aun en espera: el gasto final puede pasar un poco
  del tope. Si se alcanza, o si un envio o una espera falla, la serie queda incompleta y se guarda como practica. Los turnos que no
  se pudieron pedir quedan anotados como error de API, no escondidos, y cada evento del lote queda en un registro `.lotes.jsonl`.
- Una serie es un mundo: todas sus partidas comparten el seed base (en juegos con `mismoSeedEnSerie`, como La Fuga y Guerra de territorios, el escenario
  es identico en cada partida y solo cambian las decisiones). Para ver mas escenarios se corren varias series con distinto `--seed`.

## 11. Reglas ocultas

La Fuga tiene una regla que las IAs no conocen: si los prisioneros se separan, cada uno puede escapar por su cuenta (y eso vale
menos que escapar juntos). El prompt nunca afirma lo contrario: dice que planean salir juntos, que hay detalles de la prision que
no conocen, y calla sobre lo que pasa si solo uno sale. Se publica aqui y el reproductor la muestra, porque lo que se mide es que
hacen las IAs creyendo que deben salir juntos. Tambien son ocultos, y quedan guardados en cada ronda (`oculto`): el peligro real
de cada situacion, que metodo funciona mejor, si la pista decia la verdad y los dados. Las IAs nunca los ven; el publico si,
despues de cada ronda. Si alguien se separa puede, ademas, escapar de inmediato por su ruta propia (una probabilidad oculta que
depende de la fase) y deja la partida; quien se queda atras sigue solo, falla algo mas pero encuentra mas botin, y si logra
escapar despues cobra mas que el que se fue primero.

## 12. Juegos sin regla oculta

El número solitario no tiene ninguna regla oculta: el prompt cuenta todo (cartas, fases, anulación, cortes, final, desempates y el
puntaje por puesto) y la vista solo calla lo que los demás deciden a la vez. Lo único que no se ve de antemano es el azar de reemplazo
(qué jugada legal se pone si una IA responde mal) y el sorteo de un desempate total; los dos se sortean al crear la partida con el seed (así
se pueden reproducir), no dependen de lo que decidan las IAs, y en el registro queda su efecto: la jugada marcada como inválida con su motivo
y el criterio de desempate que se usó. Una respuesta ilegal se mide como fallo (obediencia), no se esconde. Cada ronda son
dos turnos y 90 llamadas por partida, por eso este juego se corre en vivo y no por lote.

## 13. Información oculta sin regla oculta: la Subasta de tiempo

La Subasta de tiempo no esconde ninguna regla: el prompt cuenta todo, incluido que nadie ve el banco ni las apuestas de los demás. Lo que sí es
secreto durante la partida es esa información, y es el corazón del juego. La `vista` solo muestra lo propio (banco, apuestas y fichas) y lo público
(las fichas de todos y quién ganó cada subasta); una prueba cambia el banco y las apuestas ajenas y exige que la vista de cada jugador no cambie. Después
de cada subasta el público sí ve cuánto apostó cada uno (queda en `oculto` de cada registro). El tiempo se guarda en décimas enteras para no
arrastrar errores de decimales. Una respuesta ilegible equivale a retirarse y se mide como fallo (obediencia), no se esconde. Cada subasta es un turno:
hasta 95 llamadas por partida, por eso se corre en vivo y no por lote.

## 14. Decisiones a la vez con papeles distintos: Mayor o menor

Mayor o menor no esconde ninguna regla: el prompt cuenta todo, incluido que nadie ve lo que el rival decide en la misma ronda ni el orden en que saldrán las cartas
del crupier. En cada ronda el jugador activo (que juega una carta boca abajo) y el predictor (que apuesta sin verla) deciden a la vez; como el activo compromete su carta
antes de que el predictor apueste, es equivalente a que sean simultáneos, y por eso la arena pide las dos respuestas en el mismo turno. El orden de los dos mazos del crupier
y las jugadas de reemplazo se sortean al crear la partida con el seed (una serie de dos partidas con los asientos invertidos repite el mismo mundo), y la `vista` solo
lee de esos mazos la carta de la ronda en curso; una prueba reordena el futuro del crupier y exige que la vista de cada jugador no cambie. Una respuesta ilegal se
reemplaza por una jugada legal sorteada de antemano y se mide como fallo (obediencia), no se esconde: el prompt lo cuenta y el historial que ven los dos la marca como [reemplazo]. Cada ronda son dos llamadas, 36 por partida como máximo, por eso se corre en vivo.

## 15. Dos tipos de turno y puntos exactos: Triple dado

Triple dado no esconde ninguna regla: el prompt cuenta todo, incluido que los dados de la ronda se lanzan después de elegir la tarjeta y qué se ve y qué no de los dados ocultos.
Una partida alterna dos tipos de turno (predicción y enfrentamiento) en el mismo juego; la predicción de la ronda 4 no se pregunta, porque a cada jugador solo le queda una tarjeta
(cada una se usa una vez), así que ese turno no cuesta llamadas (60 por partida en vez de 64). Todos los dados de las cuatro rondas y los reemplazos se sortean al crear la partida
con el seed (una serie de cuatro partidas con los asientos rotados repite los mismos dados por asiento). Los repartos por empate dan tercios y mitades (tres empatados cobran 3.33),
así que los puntos se guardan como enteros en doceavos de punto y solo se convierten a decimales al mostrarlos: la frontera de una tarjeta (MORE empieza en exactamente 7) no depende de errores
de coma flotante. La `vista` solo muestra de los dados ocultos ajenos los que ya se usaron (su valor se revela al comparar) y en la fase de predicción ningún dado; una prueba cambia los dados
no lanzados, los ocultos ajenos sin usar y las tarjetas ajenas en curso y exige que la vista de cada jugador no cambie. Una respuesta ilegal se reemplaza por una jugada legal sorteada de antemano,
se mide como fallo (obediencia) y el historial que ven los cuatro la marca como [reemplazo]. El registro guarda los puntos de cada enfrentamiento de dos formas: decimales para mostrar
(3 × 3.33 = 9.99) y doceavos enteros exactos (`puntosD`, `puntosRondaD`) para cualquier cuenta.

## 16. Un juego por turnos: Duda y apuesta

Duda y apuesta no esconde ninguna regla: el prompt cuenta todo, incluido que las cartas de los demás son secretas hasta que se revelan en un enfrentamiento. Es el único juego del proyecto donde decide **un solo jugador por turno**: la arena le pregunta únicamente a quien le toca (`activos`), así que cada turno es una llamada y una partida cuesta como máximo 96 llamadas (el tope de 16 manos y de 4 anuncios por mano lo garantiza; con bots, unas 21 en promedio). Las cartas de las 16 manos se reparten de antemano por asiento con el seed: una serie de cuatro partidas con los asientos rotados repite las mismas cartas por asiento aunque las decisiones cambien. La `vista` solo muestra las cartas propias; el historial muestra de cada enfrentamiento cuántas cartas del color anunciado tenía cada jugador, y nada de las manos donde alguien se retiró. Una respuesta ilegal se reemplaza por una jugada legal sorteada de antemano, se mide como fallo (obediencia) y el historial la marca con `*`. Los anuncios que no se cumplen (faroles) se calculan después, desde las cartas guardadas en el registro, para la evaluación; ninguna jugada se cambia.

## 17. La escena de Duda y apuesta: qué se muestra y qué no

La escena de casino lee una partida **ya guardada** y no cambia ni oculta ninguna jugada: lo que se ve es lo que registró el motor. Hay una sola decisión editorial de imagen, la **cámara oculta**: en cada mano el público ve las cartas reales de dos de los cuatro jugadores (elegidos al azar con el seed de la partida y el número de mano, así que es reproducible) y de los otros dos nada hasta el recuento; si alguien se retira, no se revela ninguna carta. Es solo una decisión de qué mostrar al espectador: las IAs reciben exactamente el mismo texto de siempre (el prompt y la `vista` no cambian) y no saben nada de la cámara. La capa de comentario y los subtítulos salen de la narración que el código guardó en la partida; con `razon=1` se muestra también lo que cada IA dijo que pensó. Las jugadas que el juego puso por una respuesta ilegal se marcan como tales (borde punteado y "Jugada del juego") y nunca se le atribuyen a la IA. Los clips para redes se eligen por reglas fijas (`puntuarManos`: eliminación, mano justa, farol descubierto, retirada tras una subida, cambio de líder) y no a mano, para que no dependan del gusto de quien edita. Todo video lleva la etiqueta "Contenido generado por IA · Proyecto independiente".

## 18. La escena de Mayor o menor: qué se muestra y qué no

Igual que la de Duda y apuesta, la escena de Mayor o menor lee una partida **ya guardada** y no cambia ni oculta ninguna jugada. La información pública del juego (la carta del crupier, las cartas que le quedan a cada jugador, la apuesta y el lado) se muestra tal cual. Lo único secreto es la **carta que juega el activo, boca abajo**: la **cámara oculta** la muestra al público de antemano en las rondas que sortea el seed de la partida (se sortea cada ronda con el seed y su número, así que es reproducible y, en promedio, es la mitad) y en las demás se queda oculta hasta el reveal. Es solo una decisión de qué mostrar al espectador: las IAs reciben el mismo texto de siempre y no saben nada de la cámara. En la tira de números de cada jugador, la carta jugada solo se marca cuando se revela. Las fichas que se mueven salen de lo que registró el motor (nunca se recalculan): quien juega cobra de la banca la diferencia solo si su carta es mayor que la del crupier; el predictor que acierta recupera su apuesta y cobra otro tanto igual, el que falla la paga a la banca y, si la carta es igual a la del crupier, la apuesta solo se devuelve. Los comentarios de la narración (por ejemplo "lo apuesta todo" o "pasa al frente") se dicen al final del resultado de su ronda para no adelantar nada. Una carta o una apuesta que el juego puso por una respuesta ilegal se marca como tal y nunca se le atribuye a la IA. Los clips para redes se eligen por reglas fijas (`puntuarRondas`: apuesta total, apuesta grande, cambio de líder, carta igual, regalar la ronda, caída de golpe, final).

## 19. La escena de El número solitario: qué se muestra y qué no

La escena de El número solitario lee una partida **ya guardada** y no cambia ni oculta ninguna jugada: puntos, fichas de victoria, choques, ganador y cortes salen de lo que registró el motor (nunca se recalculan). Las **parejas** se eligen en secreto y se muestran **todas juntas**, sin cámara: nadie las ve antes que los demás. Las **marcas** (cuál de las dos cartas juega cada quien) también son simultáneas; la **cámara oculta** le muestra al público la marca de 2 de los jugadores que siguen en la ronda, elegidos con el seed de la partida y el número de ronda (reproducible), antes del reveal, con la etiqueta "Cámara"; de los demás no se ve nada hasta que todas se revelan a la vez. Es solo una decisión de qué mostrar al espectador: las IAs reciben el mismo texto de siempre y no saben nada de la cámara. Cuando dos o más marcan el mismo número esas cartas se tachan como "Anulada"; gana el número más bajo que nadie más jugó (si todos chocan, es una ronda en blanco y nadie puntúa). Quien queda a salvo en un corte (rondas 3 y 6) sale de la partida y su fila se atenúa. Los comentarios de la narración (por ejemplo "toma la delantera" o "choque de 5") se dicen al final del resultado de su ronda; los que siguen al anuncio de un corte se dicen con el corte. Una pareja o una marca que el juego puso por una respuesta ilegal se marca con borde punteado y "Jugada del juego", y ni la pantalla ni la voz dicen que la eligió la IA. Los clips para redes se eligen por reglas fijas (`puntuarRondas`: choque de tres o más, ronda en blanco, el que toma la delantera, premio alto, corte y final).

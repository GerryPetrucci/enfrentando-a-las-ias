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

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

Los parametros de llamada (temperatura 0.7 y 2000 tokens maximos) son iguales para
todas las IAs y se congelan junto con el prompt.

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

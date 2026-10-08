# Como agregar un juego

El motor no sabe de que juego se trata. Para agregar uno solo necesitas un
archivo en `src/juegos/` que exporte este objeto, y una linea en
`src/juegos/index.js`.

```js
export default {
  id: 'subasta',                    // nombre en la linea de comandos
  nombre: 'Subasta a Ciegas',       // lo que sale en pantalla
  categoria: 'Negociacion',         // agrupa el marcador
  jugadores: 2,
  reglas: `...`,                    // va dentro del prompt, igual para todos
  formatoRespuesta: `{"oferta": numero, "mensaje": "texto"}`,

  crear(rng)                  -> estado inicial
  terminado(estado)           -> true/false
  vista(estado, i)            -> lo que ve el jugador i (sin info secreta del rival)
  normalizar(respuesta)       -> jugada valida SIEMPRE, con .invalida si venia mal
  aplicar(estado, jugadas, rng) -> muta el estado y devuelve el registro de la ronda
  resultado(estado)           -> { puntos, ganador, empate, metricas }
}
```

Tres reglas que no conviene romper:

1. **`vista` nunca filtra informacion secreta.** Es el unico lugar donde se
   decide que sabe cada jugador. Un bug aqui invalida la temporada entera.
2. **`normalizar` nunca lanza error.** Recibe `null`, texto basura o un objeto
   mal formado y siempre devuelve una jugada legal, marcada con `invalida: true`.
   Un modelo caido no debe tumbar la grabacion.
3. **Todo lo aleatorio pasa por el `rng` que recibes**, nunca por `Math.random()`.
   Si no, el seed deja de reproducir la partida.

## Categorias sugeridas

Tener varias categorias es lo que hace interesante el marcador: ninguna IA gana
todas, y ahi esta la discusion.

| Categoria | Juegos baratos de programar |
|---|---|
| Traicion y confianza | Dilema del prisionero negociado (ya esta), juego de la confianza |
| Negociacion | Reparto de un pastel, subasta a ciegas, ultimatum |
| Engano | Mentiroso, adivina quien miente, poker simplificado |
| Recursos | Blotto (reparte tropas en frentes), carrera por un recurso que se agota |
| Cooperacion | Bien publico, cazar el ciervo |
| Improvisacion | Juego con reglas secretas que deben deducir jugando |

Los de la columna derecha son todos de menos de 150 lineas. La variedad del
marcador no cuesta trabajo de programacion: cuesta elegir bien los juegos.

## Modo "bot escrito" (para correr miles de partidas gratis)

El modo caro es que la IA decida en cada ronda. El modo barato es pedirle **una
sola vez** que escriba su bot en JavaScript, guardarlo en `src/bots/` y correrlo
sin costo:

```js
// src/bots/dilema-claude.js
export default function (vista) {
  return { jugada: 'C', promesa: 'C', mensaje: '...', razon: '...' };
}
```

Luego registra un `agenteBot('claude-bot', fn, { nombre: 'Claude (bot)' })` en
`src/agentes.js`. La arena los trata igual que a los modelos en vivo, asi que el
marcador y el reproductor funcionan sin cambios.

Esto es lo que te deja publicar *"los enfrentamos 1,000 veces"* por el costo de
cinco llamadas a la API.

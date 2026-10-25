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

Tres extensiones que usa la Guerra de territorios (el Dilema no las necesita):
- `crear(rng, opciones)` recibe opciones (por ejemplo `{ jugadores: 4 }`); sin opciones usa los valores por defecto.
- `vista(estado, i)` puede devolver un **texto** ya armado en vez de un objeto: `construirUsuario` lo usa tal cual (para un
  objeto sigue mostrando el JSON, igual que antes, byte a byte).
- `activos(estado)` devuelve un arreglo de booleanos con los jugadores a los que hay que preguntarles (un reino caido deja de
  costar llamadas). La arena lo usa: a los asientos inactivos no les pregunta y le pasa `null` a `aplicar`.

Lo que la consola y la arena usan si el juego lo ofrece (todo opcional):
- `minJugadores` y `maxJugadores`: cuantos jugadores admite (`--jugadores=a,b,c`); sin ellos, vale `jugadores`.
- `mismoSeedEnSerie: true`: una serie de rotacion conserva el mapa (mismo seed); sin esto, cada partida usa otro seed.
- `bots`: `{ id: { nombre, color, fn(estado, asiento, rng) } }`, los bots de control que la consola acepta por nombre. Leen el
  estado completo, nunca lo modifican y usan solo el `rng` que reciben.
- `rondas`: la arena corta con un error una partida que no termina despues de `rondas + 2` rondas.
- El registro de cada ronda puede traer `narracion: [{ tipo, texto }]` (la historia publica; usa `{0}` y `{1}` en vez de los
  nombres, que el reproductor reemplaza con `resolverNombres`) y `oculto` (lo que ni las IAs ven ni la `vista` debe filtrar; el
  reproductor lo muestra). `resultado` puede traer `epilogo` con el mismo formato. Ver `src/juegos/fuga/` como ejemplo.
- `metricas[i]` con las claves `traiciones`, `promesasHechas`, `promesasRotas`, `jugadasInvalidas` y, si el juego tiene ordenes
  en texto, `ordenesValidas` y `ordenesTotal`: el marcador las suma sin conocer el juego.
- El registro de cada ronda debe traer `errores: (string|null)[]`, un error de API por jugador.
- `evaluar(partidas)`: la evaluacion al final de una serie (no hay torneo general: cada juego se evalua por si mismo). Recibe las partidas
  de la serie y devuelve `{ partidas, jugadores: [{ id, nombre, caracteristicas, destacadas, ... }], comentario: [{ tipo, texto }] }`. La consola
  imprime el `comentario` y guarda todo en la serie (`evaluacion`); si falla, la serie se guarda igual. Lo calcula el codigo desde los datos
  (sin llamadas extra), nunca cambia una jugada, y el texto es publico (lleva acentos). Ver `src/juegos/solitario/evaluacion.js`.

Tres reglas que no conviene romper:

1. **`vista` nunca filtra informacion secreta.** Es el unico lugar donde se
   decide que sabe cada jugador. Un bug aqui invalida todas las partidas de ese juego.
2. **`normalizar` nunca lanza error.** Recibe `null`, texto basura o un objeto
   mal formado y siempre devuelve una jugada legal, marcada con `invalida: true`.
   Un modelo caido no debe tumbar la grabacion.
3. **Todo lo aleatorio pasa por el `rng` que recibes**, nunca por `Math.random()`.
   Si no, el seed deja de reproducir la partida.

## La escena vertical no sale de la zona segura (obligatorio, decidido el 20 de octubre de 2026)

En 9:16 las redes tapan arriba (285 px) y abajo (420 px) con su propia interfaz. Todo lo que dibuje la escena de tu juego (cabecera, mesa, fichas, subtitulos, tarjetas, pantalla final) va dentro de `ZONA_SEGURA` (`herramientas/formatos.mjs`; el layout la recibe como `L.zona`). Al agregar un juego:

1. Agrega su funcion de layout a `JUEGOS` en `src/pruebas/escena/layoutzona.test.js`, una entrada por cada tamano de mesa que pueda tener (Guerra de territorios prueba sus 4 mapas). Si lo olvidas, otra prueba de ese archivo falla.
2. Revisa a ojo una captura 9:16 del caso mas grande con `node herramientas/capturar-escena.mjs --formato=9x16` (el mas cargado: mas jugadores, mensajes mas largos, pantalla final).
3. Solo una banda que cubre todo el ancho a proposito (como las bandas VS de Guerra) puede ir de lado a lado, y aun asi dentro de la zona a lo alto.

## Gancho «Próximamente» del juego (regla del 25 de octubre de 2026)

Todo juego tiene gancho en cada parte: en video si sus partidas dan al menos 2 momentos con puntos (`destacadasDe`) y, si no, **en imagen** (`herramientas/gancho-imagen.mjs`: «Próximamente», el juego, «Juego N · Parte M de K»). No hace falta hacer nada para que funcione. Si el juego tiene arte que su escena ya usa (un panorama, personajes), registralo en `ARTE_GANCHO` (`web/casino/gancho-imagen.js`) para que la imagen lo lleve; sin eso sale solo con la marca. Detalle en `docs/produccion-videos.md`.
## Colores de las IAs (global, no se definen por juego)

El color de cada IA vive en [`web/paleta.js`](../web/paleta.js) y es el mismo en todos los juegos, el sitio y el
reproductor. Tu juego y su escena nunca escriben un color de IA: lo piden por id.

```js
import { colorDe, textoDe, franjasDe, fondoCSS } from './paleta.js';   // en una pagina
colorDe(j.id, j.color)   // relleno liso (j.color es el respaldo para estrategias base)
textoDe(j.id, j.color)   // el mismo color, legible sobre fondo oscuro (nombres, avisos)
franjasDe(j.id)          // null, o los colores de Gemini para pintar a franjas
fondoCSS(j.id, j.color)  // valor de `background:` en CSS
```

`web/replay.html` ya lo hace asi (`tintaIA` pinta el degradado de Gemini). Los colores usan solo la identidad
de color de cada proveedor, nunca sus logos. `npm test` comprueba que dos IAs no se confundan sobre el mapa.

## Presupuesto de llamadas (limite duro al disenar un juego)

OpenRouter limita los modelos gratis a **20 llamadas por minuto y 50 por dia**; con al menos
$10 de creditos comprados (que los modelos gratis no gastan) el tope sube a **1,000 por dia**.
Ese tope es lo que permite una "liga gratuita" para practicar y depurar, asi que todo juego
nuevo lo respeta. Con modelos de pago no hay tope de plataforma, pero cada llamada cuesta.

| Concepto | Limite |
|---|---|
| Llamadas por jugador por turno | **Una** (ordenes en lote). Nunca una por region o por unidad |
| Turnos maximos | **30** |
| Llamadas por partida de 4 jugadores | **<= 100** (~25 por jugador). Asi caben ~10 partidas al dia en modo gratis |
| Tokens por llamada | Entrada **<= 3,500**, salida **<= 500** (`max_tokens` 4000 incluye el razonamiento) |
| Costo con modelos de pago (mezcla de los 5) | Objetivo **<= $0.40** por partida (caso base), tope duro **$0.90** |
| Reintentos | Cuentan como llamadas (`reintentos: 2` por defecto): presupuestar +10% |
| Medicion | Cada partida imprime sus llamadas y tokens y avisa si pasa el presupuesto |

**Mas complejidad** (reglas, mapa, recursos) cuesta tokens, no llamadas: esta permitida mientras la
entrada no pase de 3,500 tokens y se cumpla el tope de costo. Subir los turnos, las llamadas por
turno o el numero de jugadores por encima de lo anterior requiere aprobacion expresa.

**Excepcion aprobada (9 oct 2026):** la Guerra de territorios puede usar hasta 4,450 tokens de entrada (ampliado
desde 4,200 con aprobacion expresa: el peor caso de 5 reinos de las pruebas del plan 1 mide 4,406) y 650 de salida
por llamada; con sus 6 reglas extra mide 3,681 tokens de entrada tipicos en 5 reinos. Los demas limites
(una llamada por jugador y turno, 30 turnos, ~100 llamadas por partida de 4 jugadores) no cambian. Medirlo con
`node herramientas/medir-prompt.mjs` (no hace llamadas: mide el texto real del juego con los caracteres por token medidos)
antes de aceptar mas reglas; `npm test` vigila el mismo tope.

**Ampliada (22 oct 2026, Guerra 2.0.0):** hasta 6,500 tokens de entrada en el peor caso de 5 reinos (6,000 al empezar la rama) y 700 de salida visible (14 ordenes), por decision delegada
del usuario para sostener mas complejidad. Una partida completa de 4 reinos ronda $1.0-1.25 con 1.1.0 (medido: ~$0.0104 por llamada); con 2.0.0 el tope es $1.50 blando / $2.00 duro.

Antes de implementar, estimar llamadas y costo con los precios vigentes de OpenRouter.

**Los tokens se miden con Claude**, que para el mismo texto en espanol cuenta ~1.5 veces mas tokens que
GPT, Gemini, DeepSeek y Llama (medido el 10 oct 2026: ~2.0 caracteres por token contra ~2.9). Si un
prompt cabe en 3,500 tokens de Claude, cabe en todos. Regla practica: **entrada <= ~7,000 caracteres**.

**Tamano medido de un mapa** (borrador del juego 2, codificacion compacta): un mapa de pixel art dividido en
regiones (26, 39, 52 o 65 para 2, 3, 4 o 5 reinos), cada region con su terreno, recurso y TODAS sus vecinas,
mas las reglas completas y el estado de mitad de partida, ocupa ~1,770 / 2,010 / 2,240 / 2,480 tokens de Claude
(51-71% del presupuesto). La salida de 8 ordenes ocupa ~100-160 tokens. Cada region cuesta ~25-30 tokens,
y listar las vecinas de cada region completas (no una sola vez por pareja) evita que la IA tenga que cruzar listas
y dar ordenes invalidas. Codificar compacto es parte del diseno.

(Pendiente: el contador de llamadas por partida se agrega con el juego 2; hoy solo se cuentan tokens.)

### Un juego nuevo ya funciona por lote

El lote (`--lote`) no le pide nada al juego: usa las mismas funciones y respeta el mismo presupuesto de llamadas. Lo que junta
en cada envio son las jugadas del mismo turno de todas las partidas de la serie (una por jugador y por partida), no las de
distintos jugadores de una misma partida.

## Categorias sugeridas

Tener varias categorias es lo que hace interesante el marcador: ninguna IA gana
todas, y ahi esta la discusion.

| Categoria | Juegos baratos de programar |
|---|---|
| Traición y confianza | Dilema del prisionero negociado (ya esta), juego de la confianza |
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

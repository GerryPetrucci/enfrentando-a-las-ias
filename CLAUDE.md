# Contexto del proyecto

> Este archivo lo lee Claude Code automaticamente al abrir la carpeta.
> Resume de donde viene el proyecto y que decisiones ya estan tomadas, para no
> volver a discutirlas. Si cambias una decision, actualiza este archivo.
>
> Origen: conversacion en la app de Claude, 8 de octubre de 2026.

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
nada que sugiera patrocinio. Pendiente: revisar los terminos de uso de cada
proveedor sobre publicar comparativas.

## Estado actual

Hecho:
- Motor generico (`arena.js`), prompt unico versionado, RNG con seed
- Cliente de OpenRouter + registro de contendientes
- Juego 1: Dilema del Prisionero Negociado (categoria "Traicion y confianza")
- CLI de duelos, agregador de marcador, servidor estatico
- Sitio con marcador por categoria + reproductor vertical para OBS
- Pipeline probado de punta a punta con estrategias de control

Pendiente:
- [ ] **Verificar los IDs de modelo vigentes** en <https://openrouter.ai/models>.
      Los de `src/modelos.js` son de mayo 2026 y cambian cada pocos meses.
- [ ] Primer duelo real con modelos y grabar el episodio 1
- [ ] Juego 2 en otra categoria (Negociacion o Engano)
- [ ] Modo "bot escrito" para correr miles de partidas
- [ ] Publicar el sitio (es estatico: Netlify, Vercel o GitHub Pages)
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

- Espanol en nombres, comentarios y textos. Sin acentos en el codigo.
- ES modules, Node 20+, **cero dependencias**. Si algo necesita un paquete,
  pensarlo dos veces antes de agregarlo.
- Sin paso de build: el sitio es HTML estatico que se abre y ya.

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
node src/correr.js --juego=dilema --a=claude --b=gpt --partidas=4
node src/marcador.js
```

Una sola llave de OpenRouter da acceso a todos los modelos. Los IDs viven en
[`src/modelos.js`](src/modelos.js) y **hay que verificarlos en
<https://openrouter.ai/models> antes de grabar una temporada**: cambian cada
pocos meses.

Contendientes incluidos: `claude`, `gpt`, `gemini`, `llama`, `deepseek`.
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
  prompt.js     EL CONTRATO: el prompt identico para todas las IAs
  modelos.js    cliente de OpenRouter + registro de contendientes
  agentes.js    modelo en vivo / bot escrito / estrategia clasica
  rng.js        aleatorio con seed (resultados reproducibles)
  correr.js     CLI del duelo        -> data/*.json
  marcador.js   agrega resultados    -> web/marcador.json
  servidor.js   servidor estatico local
  juegos/
    dilema.js   Juego 1: Dilema del Prisionero Negociado
web/
  index.html    el sitio: marcador por categoria + lista de episodios
  replay.html   reproductor vertical para grabar
docs/
  metodologia.md       como se garantiza que la comparacion sea justa
  agregar-un-juego.md  como meter el juego numero 2
```

## El primer juego

**Dilema del Prisionero Negociado.** Cada ronda, las dos IAs eligen cooperar o
traicionar al mismo tiempo, y ademas se comprometen publicamente a lo que haran
en la ronda siguiente. La promesa no obliga a nada, pero queda registrada.

Eso vuelve la traicion **medible al cien por ciento**: se compara lo prometido
contra lo jugado, sin interpretar texto libre. De ahi sale la metrica
**fiabilidad** de cada modelo, que es la que da sentido a la categoria y el
titulo al video.

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

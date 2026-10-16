# Muestras de sonido de las escenas

La escena de casino suena con las muestras grabadas de esta carpeta. Si alguna falta, ese efecto suena con un **respaldo sintetizado** (WebAudio): nunca queda muda.
Para escucharlas una por una (y compararlas con el respaldo) abre `web/sonidos.html` (con `node src/servidor.js`: <http://localhost:4321/sonidos.html>).

## De donde salen y su licencia

Las 15 muestras salen de tres paquetes de **Kenney** (kenney.nl), todos con licencia **Creative Commons Zero (CC0)**: dominio publico, se pueden usar en proyectos
personales y comerciales y redistribuir, y el credito (Kenney o www.kenney.nl) es agradable pero no obligatorio. El texto de licencia de cada paquete esta en
`LICENCIAS.txt`, sin cambios.

Revision de la licencia: 16 de octubre de 2026, contra la pagina de cada paquete (kenney.nl/assets/casino-audio, /interface-sounds y /music-jingles), la pagina de soporte
de Kenney ("uso comercial: si; atribucion: no obligatoria") y el archivo de licencia de cada zip. Repetir cada 3 meses y antes de monetizar, como con todo lo que
viene de afuera. Las muestras se llevaron a un nivel comun (volumen medio -20 dB, pico -1 dB) y se guardaron como OGG con `herramientas/preparar-sonidos.mjs`.

## Que archivo es cada efecto

| Efecto | Archivos | Origen (paquete / archivo original) |
|---|---|---|
| Repartir una carta | `carta-1.ogg`, `carta-2.ogg`, `carta-3.ogg` | Casino Audio / card-slide-1, 2 y 3 |
| Voltear las cartas | `voltear-1.ogg`, `voltear-2.ogg` | Casino Audio / card-place-1 y 2 |
| Ficha | `ficha-1.ogg`, `ficha-2.ogg`, `ficha-3.ogg` | Casino Audio / chip-lay-1, 2 y 3 |
| Cuenta (tic del contador) | `tic-1.ogg`, `tic-2.ogg` | Interface Sounds / tick_001 y tick_002 |
| Anuncio (campanilla) | `anuncio-1.ogg` | Interface Sounds / bong_001 |
| Duda | `duda-1.ogg` | Interface Sounds / question_002 |
| Gana (sello dorado) | `gana-1.ogg`, `gana-2.ogg` | Music Jingles / Hit jingles / HIT11 y HIT03 |
| Pierde (sello rojo) | `pierde-1.ogg` | Interface Sounds / error_003 |

Cuando un efecto tiene varias muestras, la escena elige una con el azar con seed de la partida (mismo video, mismos sonidos).

## Cambiar una muestra

Los paquetes no estan en el repo (se bajan de kenney.nl). Edita `MAPA` en `herramientas/preparar-sonidos.mjs`, corre
`node herramientas/preparar-sonidos.mjs --paquetes=CARPETA` (con las subcarpetas `casino/`, `interface/` y `jingles/`, cada una con su `Audio/`) y escucha el
resultado en `web/sonidos.html`. Se apagan todos los efectos con `?sonido=0`.

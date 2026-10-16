# Muestras de sonido de las escenas

La escena de casino suena con las muestras grabadas de esta carpeta. Si alguna falta, ese efecto suena con un **respaldo sintetizado** (WebAudio): nunca queda muda.
Para escucharlas una por una (y compararlas con el respaldo) abre `web/sonidos.html` (con `node src/servidor.js`: <http://localhost:4321/sonidos.html>).

## De donde salen y su licencia

Las 8 muestras salen de tres paquetes de **Kenney** (kenney.nl), todos con licencia **Creative Commons Zero (CC0)**: dominio publico, se pueden usar en proyectos
personales y comerciales y redistribuir, y el credito (Kenney o www.kenney.nl) es agradable pero no obligatorio. El texto de licencia de cada paquete esta en
`LICENCIAS.txt`, sin cambios.

Revision de la licencia: 16 de octubre de 2026, contra la pagina de cada paquete (kenney.nl/assets/casino-audio, /interface-sounds y /music-jingles), la pagina de soporte
de Kenney ("uso comercial: si; atribucion: no obligatoria") y el archivo de licencia de cada zip. Repetir cada 3 meses y antes de monetizar, como con todo lo que
viene de afuera. Las muestras se llevaron a un nivel comun (volumen medio -20 dB, pico -1 dB) y se guardaron como OGG con `herramientas/preparar-sonidos.mjs`.

## Que archivo es cada efecto

El usuario las escucho en `web/sonidos.html` y escogio una por efecto (16 de octubre de 2026). Los numeros de los nombres son los de la prueba de sonidos.

| Efecto | Archivo | Origen (paquete / archivo original) |
|---|---|---|
| Repartir una carta | `carta-2.ogg` | Casino Audio / card-slide-2 |
| Voltear las cartas | `voltear-1.ogg` | Casino Audio / card-place-1 |
| Ficha | `ficha-3.ogg` | Casino Audio / chip-lay-3 |
| Cuenta (tic del contador) | `tic-1.ogg` | Interface Sounds / tick_001 |
| Anuncio (campanilla) | `anuncio-1.ogg` | Interface Sounds / bong_001 |
| Duda | `duda-1.ogg` | Interface Sounds / question_002 |
| Gana (sello dorado) | `gana-1.ogg` | Music Jingles / Hit jingles / HIT11 |
| Pierde (sello rojo) | `pierde-1.ogg` | Interface Sounds / error_003 |

## Cambiar una muestra

Los paquetes no estan en el repo (se bajan de kenney.nl). Edita `MAPA` en `herramientas/preparar-sonidos.mjs` (y `muestras` del efecto en `web/casino/sonido.js`),
corre `node herramientas/preparar-sonidos.mjs --paquetes=CARPETA` (con las subcarpetas `casino/`, `interface/` y `jingles/`, cada una con su `Audio/`) y escucha el
resultado en `web/sonidos.html`. Se apagan todos los efectos con `?sonido=0`.

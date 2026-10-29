# Muestras de sonido de las escenas

La escena de casino suena con las muestras grabadas de esta carpeta. Si alguna falta, ese efecto suena con un **respaldo sintetizado** (WebAudio): nunca queda muda.
Para escucharlas una por una (y compararlas con el respaldo) abre `web/sonidos.html` (con `node src/servidor.js`: <http://localhost:4321/sonidos.html>).

## De donde salen y su licencia

Hay dos fuentes, las dos con licencia **Creative Commons Zero (CC0)**: dominio publico, se pueden usar en proyectos personales y comerciales y redistribuir, y el credito es
agradable pero no obligatorio.

1. **Kenney** (kenney.nl), tres paquetes (Casino Audio, Interface Sounds y Music Jingles): las cartas, las fichas, los dados y los avisos (8 muestras). El texto de licencia de
   cada paquete esta en `LICENCIAS.txt`, sin cambios.
2. **Grabaciones reales** de **Freesound** (freesound.org), agregadas el 28 de octubre de 2026 (13 muestras): multitudes que aplauden, vitorean, suspiran y abuchean; la carga de una tropa gritando;
   tres espadazos; un cuerno de guerra y un gong. El autor, la pagina y el sonido original de cada una estan en `LICENCIAS.txt`.

Revision de la licencia: 16 de octubre de 2026, contra la pagina de cada paquete (kenney.nl/assets/casino-audio, /interface-sounds y /music-jingles), la pagina de soporte
de Kenney ("uso comercial: si; atribucion: no obligatoria") y el archivo de licencia de cada zip.

Revision de las grabaciones reales: 28 de octubre de 2026, contra la pagina de CADA sonido (el programa que las bajo se niega a bajar uno cuya pagina no diga CC0 1.0, dominio
publico). Solo se uso CC0 a proposito: el repositorio es publico, y una licencia que pida credito o prohiba redistribuir no sirve aqui. Repetir cada 3 meses
y antes de monetizar, como con todo lo que viene de afuera. Las muestras se recortaron, se llevaron a un nivel (volumen medio -20 dB por omision, pico -1 dB) y se guardaron como OGG con
`herramientas/preparar-sonidos.mjs`; las grabaciones reales van en mono.

## Que archivo es cada efecto

El usuario escucha las muestras en `web/sonidos.html` y escoge. Cuando un efecto tiene varias, la escena elige una con el azar de la escena (la misma escena siempre suena igual).
Las de gana y pierde son **opciones para elegir de oido** (la escena usa una al azar): las que no gusten se quitan de `muestras` en `web/casino/sonido.js` y de `MAPA`, y se borra su archivo. La batalla y la Maravilla
son las que escogio el usuario (28 de octubre de 2026). La batalla es un **paisaje**: durante el zoom de una disputa suenan las cinco a la vez (`sfx.batalla(ms)`); en `web/sonidos.html` el boton «todas juntas» la reproduce.

| Efecto | Archivo | Origen |
|---|---|---|
| Repartir una carta | `carta-2.ogg` | Kenney, Casino Audio / card-slide-2 |
| Voltear las cartas | `voltear-1.ogg` | Kenney, Casino Audio / card-place-1 |
| Ficha | `ficha-3.ogg` | Kenney, Casino Audio / chip-lay-3 |
| Cuenta (tic del contador) | `tic-1.ogg` | Kenney, Interface Sounds / tick_001 |
| Anuncio (campanilla) | `anuncio-1.ogg` | Kenney, Interface Sounds / bong_001 |
| Duda | `duda-1.ogg` | Kenney, Interface Sounds / question_002 |
| Dados que ruedan (Triple dado), dos para alternar | `dado-1.ogg`, `dado-2.ogg` | Kenney, Casino Audio / dice-throw-1 y die-throw-2 |
| **Gana** (sello dorado, captura, la Maravilla de otro juego...) | `gana-aplauso.ogg`, `gana-vitoreo.ogg`, `gana-ovacion.ogg` | Freesound: aplauso de una multitud, un grupo vitoreando, aplausos y silbidos al aire libre |
| **Pierde** (sello rojo, ataque que no captura) | `pierde-suspiro.ogg`, `pierde-trombon.ogg`, `pierde-abucheo.ogg` | Freesound: la multitud suspira decepcionada, un trombon triste, una multitud abucheando |
| **Batalla**, el paisaje del zoom de una disputa de regiones: dos CAMAS que se repiten todo el zoom (el grito a 1.35 y la multitud a 0.55 de fondo: `volumenCamas` en `sonido.js`) | `batalla-grito.ogg`, `batalla-multitud.ogg` | Freesound: la carga de una tropa gritando (florianreichelt) y una multitud vitoreando (Jofae) |
| **Batalla**, tres ESPADAZOS: de 6 a 7 en 6 s, por turnos entre los tres, a intervalos irregulares y NUNCA dos a la vez (no van al compas de las espadas dibujadas) | `choque-1.ogg`, `choque-2.ogg`, `choque-3.ogg` | Freesound: JohnBuhr, Christopherderp y spycrah; cortos (0.5-0.6 s) y nivelados por la fuerza de sus 100 ms mas fuertes (`rms`), no por la media del archivo |
| **Obra** de la Maravilla (suena cada turno que esta en obra) | `maravilla-cuerno.ogg` | Freesound: un cuerno de guerra lejano (DeVern) |
| **Construida** (la Maravilla acaba su obra) | `maravilla-gong.ogg` | Freesound: un gong grande (JensZygar) |

## Cambiar una muestra

Ni los paquetes ni las fuentes estan en el repo. Edita `MAPA` en `herramientas/preparar-sonidos.mjs` (y `muestras` del efecto en `web/casino/sonido.js`) y corre
`node herramientas/preparar-sonidos.mjs`, con:

- `--paquetes=CARPETA` para las de Kenney (con las subcarpetas `casino/`, `interface/` y `jingles/`, cada una con su `Audio/`; se bajan de kenney.nl);
- `--fuentes=CARPETA` (por omision `grabaciones/audio-fuentes`) para las reales: `freesound/` con las vistas previas de calidad alta (MP3) y su `fuentes.json` (autor, pagina y licencia verificada de cada una).

`--solo=NOMBRE.ogg,...` prepara solo esas. Cada entrada de `MAPA` dice de donde sale (`paquete`, `origen`), el recorte (`desde`, `dur`), el fundido de salida (`fundido`) y el nivel (`nivel`).
Escucha el resultado en `web/sonidos.html`. Se apagan todos los efectos con `?sonido=0`.

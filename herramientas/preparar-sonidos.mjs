#!/usr/bin/env node
// Prepara las muestras de sonido de las escenas (web/audio/*.ogg) a partir de tres paquetes de Kenney (licencia CC0): Casino Audio, Interface Sounds y Music Jingles.
// Elige un archivo por efecto (ver MAPA), lo lleva a un nivel comun y lo guarda con el nombre que espera web/casino/sonido.js. Es lo que se corrio una vez;
// queda aqui para poder repetirlo o cambiar una muestra (los paquetes no se guardan en el repo: se bajan de kenney.nl).
//
//   node herramientas/preparar-sonidos.mjs --paquetes=CARPETA        (CARPETA con las subcarpetas casino/, interface/ y jingles/, cada una con su Audio/)
//   opciones: --ffmpeg=RUTA (por defecto ffmpeg del PATH)  --salida=web/audio
//
// Para cambiar una muestra: edita MAPA, corre esto y escucha el resultado en web/sonidos.html.

import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// destino (en web/audio) -> de que paquete y que archivo sale. Escogidas por nombre y duracion (cartas y fichas del paquete de casino; el resto, de los otros dos).
export const MAPA = {
  'carta-2.ogg': { paquete: 'casino', origen: 'card-slide-2.ogg' },
  'voltear-1.ogg': { paquete: 'casino', origen: 'card-place-1.ogg' },
  'ficha-3.ogg': { paquete: 'casino', origen: 'chip-lay-3.ogg' },
  'dado-1.ogg': { paquete: 'casino', origen: 'dice-throw-1.ogg' },
  'dado-2.ogg': { paquete: 'casino', origen: 'die-throw-2.ogg' },
  'tic-1.ogg': { paquete: 'interface', origen: 'tick_001.ogg' },
  'anuncio-1.ogg': { paquete: 'interface', origen: 'bong_001.ogg' },
  'duda-1.ogg': { paquete: 'interface', origen: 'question_002.ogg' },
  'gana-1.ogg': { paquete: 'jingles', origen: 'Hit jingles/jingles_HIT11.ogg' },
  'pierde-1.ogg': { paquete: 'interface', origen: 'error_003.ogg' },
};

export const NIVEL_OBJETIVO_DB = -20; // volumen medio al que se lleva cada muestra (el maestro de sonido.js las baja ~12 dB bajo la voz)
export const PICO_MAXIMO_DB = -1; // y el pico no pasa de aqui, para que no distorsione

// Cuantos dB hay que subir o bajar una muestra con esa medida (volumedetect: volumen medio y pico). Una medida ilegible no cambia nada.
export function gananciaPara(mediaDb, picoDb) {
  if (!Number.isFinite(mediaDb) || !Number.isFinite(picoDb)) return 0;
  return Math.min(NIVEL_OBJETIVO_DB - mediaDb, PICO_MAXIMO_DB - picoDb);
}

function medir(ffmpeg, archivo) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', archivo, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const media = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr ?? '');
  const pico = /max_volume: (-?[\d.]+) dB/.exec(r.stderr ?? '');
  return { media: media ? Number(media[1]) : NaN, pico: pico ? Number(pico[1]) : NaN };
}

function principal() {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.join('=')]; }));
  if (!a.paquetes) { console.error('Falta --paquetes=CARPETA (con casino/, interface/ y jingles/, cada una con su Audio/).'); process.exit(1); }
  const ffmpeg = a.ffmpeg || 'ffmpeg';
  const salida = resolve(a.salida || 'web/audio');
  mkdirSync(salida, { recursive: true });
  let fallos = 0;
  for (const [destino, { paquete, origen }] of Object.entries(MAPA)) {
    const fuente = join(resolve(a.paquetes), paquete, 'Audio', origen);
    if (!existsSync(fuente)) { console.error(`  FALTA ${fuente}`); fallos++; continue; }
    const { media, pico } = medir(ffmpeg, fuente);
    const g = gananciaPara(media, pico);
    const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', fuente, '-af', `volume=${g.toFixed(2)}dB,alimiter=limit=0.89`, '-c:a', 'libvorbis', '-q:a', '4', '-ar', '44100', join(salida, destino)], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(`  FALLO ${destino}: ${r.stderr}`); fallos++; continue; }
    console.log(`  ok ${destino.padEnd(14)} <- ${paquete}/${origen}  (medio ${media} dB, pico ${pico} dB, ${g >= 0 ? '+' : ''}${g.toFixed(1)} dB)`);
  }
  process.exit(fallos ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();

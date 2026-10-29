#!/usr/bin/env node
// Prepara las muestras de sonido de las escenas (web/audio/*.ogg) a partir de sonidos con licencia CC0: tres paquetes de Kenney (Casino Audio, Interface Sounds y Music Jingles) y, desde el 28 de octubre de 2026,
// grabaciones REALES de Freesound y OpenGameArt (aplausos y vitoreos, suspiros y abucheos de multitud, choques de espadas, gritos de guerra, un gong y un cuerno). Elige un archivo por muestra (ver MAPA), lo recorta
// (desde, dur, con fundido de salida), lo lleva a un nivel y lo guarda con el nombre que espera web/casino/sonido.js. Queda aqui para poder repetirlo o cambiar una muestra: ni los paquetes ni las fuentes estan en el repo.
//
//   node herramientas/preparar-sonidos.mjs [--paquetes=CARPETA] [--fuentes=CARPETA]
//     --paquetes   CARPETA con casino/, interface/ y jingles/, cada una con su Audio/ (los paquetes de Kenney, de kenney.nl)
//     --fuentes    CARPETA con freesound/ (las vistas previas de calidad alta, con fuentes.json) y oga-starninjas/ (los zip de OpenGameArt desempacados); por omision grabaciones/audio-fuentes
//   opciones: --ffmpeg=RUTA (por defecto ffmpeg del PATH)  --salida=web/audio  --solo=NOMBRE.ogg[,NOMBRE.ogg]
//
// Lo que no tenga su carpeta de origen se salta (se dice). Para cambiar una muestra: edita MAPA (y `muestras` del efecto en web/casino/sonido.js), corre esto y escucha el resultado en web/sonidos.html.

import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// De donde sale cada origen: [argumento de la linea de comandos, subcarpeta]. Kenney guarda sus audios en <paquete>/Audio.
export const RAICES = {
  casino: ['paquetes', 'casino/Audio'], interface: ['paquetes', 'interface/Audio'], jingles: ['paquetes', 'jingles/Audio'],
  freesound: ['fuentes', 'freesound'],
};

// destino (en web/audio) -> de que fuente y que archivo sale. Opcional: desde y dur (segundos: el recorte), fundido (segundos de fundido de salida), nivel (volumen medio en dB; por omision NIVEL_OBJETIVO_DB).
// Las de Kenney se escogieron por nombre y duracion. Las REALES se recortaron donde esta la energia (perfiles de volumen de cada audio) y quedan para elegir de oido en web/sonidos.html.
export const MAPA = {
  'carta-2.ogg': { paquete: 'casino', origen: 'card-slide-2.ogg' },
  'voltear-1.ogg': { paquete: 'casino', origen: 'card-place-1.ogg' },
  'ficha-3.ogg': { paquete: 'casino', origen: 'chip-lay-3.ogg' },
  'dado-1.ogg': { paquete: 'casino', origen: 'dice-throw-1.ogg' },
  'dado-2.ogg': { paquete: 'casino', origen: 'die-throw-2.ogg' },
  'tic-1.ogg': { paquete: 'interface', origen: 'tick_001.ogg' },
  'anuncio-1.ogg': { paquete: 'interface', origen: 'bong_001.ogg' },
  'duda-1.ogg': { paquete: 'interface', origen: 'question_002.ogg' },
  // GANA: multitudes reales (antes, un jingle de Kenney)
  'gana-aplauso.ogg': { paquete: 'freesound', origen: '875909_CAT-FOX_ALEX.mp3', desde: 0.6, dur: 3.8, fundido: 1.0 }, // aplauso de una multitud: arranca fuerte y se apaga
  'gana-vitoreo.ogg': { paquete: 'freesound', origen: '353185_Jofae.mp3', desde: 0.3, dur: 4.0, fundido: 1.0 }, // un grupo vitoreando
  'gana-ovacion.ogg': { paquete: 'freesound', origen: '455659_kyles.mp3', desde: 0.3, dur: 4.2, fundido: 1.2 }, // aplauso y silbidos de una multitud al aire libre
  // PIERDE: reacciones reales (antes, un sonido de error de Kenney)
  'pierde-suspiro.ogg': { paquete: 'freesound', origen: '764106_ShangusBurger.mp3', desde: 0.9, dur: 3.2, fundido: 1.0 }, // la multitud suspira decepcionada (grabacion muy baja: se sube)
  'pierde-trombon.ogg': { paquete: 'freesound', origen: '175409_kirbydx.mp3', desde: 0.0, dur: 4.4, fundido: 0.4 }, // el trombon triste de siempre, grabado
  'pierde-abucheo.ogg': { paquete: 'freesound', origen: '264378_HowardV.mp3', desde: 0.3, dur: 3.2, fundido: 1.0 }, // una multitud abucheando
  // BATALLA (el zoom de una disputa de regiones): las cinco grabaciones que escogio el usuario (28-10-2026), sonando A LA VEZ durante el zoom (calendario en web/casino/sonido.js: `paisaje`).
  // Dos CAMAS largas que se repiten con cruce todo el zoom, y tres ESPADAZOS cortos que caen al azar y separados.
  'batalla-grito.ogg': { paquete: 'freesound', origen: '563011_florianreichelt.mp3', desde: 0.6, dur: 9.0, fundido: 0.5, nivel: -24 }, // la carga de una tropa gritando (florianreichelt)
  'batalla-multitud.ogg': { paquete: 'freesound', origen: '353185_Jofae.mp3', desde: 0.3, dur: 8.2, fundido: 0.5, nivel: -25 }, // una multitud vitoreando (Jofae)
  // Los tres espadazos son CORTOS (de 0.5 a 0.6 s) para que quepan 6 o 7 en 6 s sin encimarse, y se nivelan por la fuerza de sus 100 ms mas fuertes (`rms`), no por la media del archivo: asi el clink seco de JohnBuhr no
  // suena 10 dB mas bajo que el golpe ancho de spycrah (antes parecia que solo se oia uno).
  'choque-1.ogg': { paquete: 'freesound', origen: '326868_JohnBuhr.mp3', desde: 0.0, dur: 0.5, fundido: 0.2, rms: -14 }, // espadazo seco (JohnBuhr)
  'choque-2.ogg': { paquete: 'freesound', origen: '364531_Christopherderp.mp3', desde: 0.0, dur: 0.6, fundido: 0.25, rms: -14 }, // espadazo con algo de resonancia (Christopherderp)
  'choque-3.ogg': { paquete: 'freesound', origen: '471095_spycrah.mp3', desde: 0.95, dur: 0.6, fundido: 0.25, rms: -14 }, // espadazo ancho (spycrah)
  // MARAVILLA (el zoom al construirla): DeVern suena cada turno que esta en obra; JensZygar, cuando queda construida
  'maravilla-cuerno.ogg': { paquete: 'freesound', origen: '512490_DeVern.mp3', desde: 0.8, dur: 4.4, fundido: 0.8, nivel: -19 }, // un cuerno de guerra lejano (DeVern)
  'maravilla-gong.ogg': { paquete: 'freesound', origen: '486629_JensZygar.mp3', desde: 0.0, dur: 6.0, fundido: 2.0, nivel: -19 }, // un gong grande con su resonancia (JensZygar)
};

export const NIVEL_OBJETIVO_DB = -20; // volumen medio al que se lleva cada muestra (el maestro de sonido.js las baja ~12 dB bajo la voz)
export const PICO_MAXIMO_DB = -1; // y el pico no pasa de aqui, para que no distorsione

// Cuantos dB hay que subir o bajar una muestra con esa medida (volumedetect: volumen medio y pico) para llevarla a `nivel` sin pasar del pico permitido. Una medida ilegible no cambia nada.
export function gananciaPara(mediaDb, picoDb, nivel = NIVEL_OBJETIVO_DB) {
  if (!Number.isFinite(mediaDb) || !Number.isFinite(picoDb)) return 0;
  return Math.min(nivel - mediaDb, PICO_MAXIMO_DB - picoDb);
}

// La fuerza de un trozo de audio por sus 100 ms MAS FUERTES (rms, en dB): la mayor raiz del promedio de los cuadrados en una ventana de `ventanaMs` que avanza de a la mitad. `muestras`: Float32Array mono. Silencio o
// algo ilegible: -Infinity. La media de todo el archivo (volumedetect) engana con un golpe: un clink seco dura 20 ms y casi no pesa, aunque su pico sea el mas alto.
export function rmsMaximoDb(muestras, hz, ventanaMs = 100) {
  if (!muestras || !(muestras.length > 0) || !(hz > 0)) return -Infinity;
  const n = Math.max(1, Math.min(muestras.length, Math.round((hz * ventanaMs) / 1000))), salto = Math.max(1, Math.floor(n / 2));
  const acumulado = new Float64Array(muestras.length + 1);
  for (let i = 0; i < muestras.length; i++) acumulado[i + 1] = acumulado[i] + muestras[i] * muestras[i];
  let mejor = 0;
  for (let i = 0; i + n <= muestras.length; i += salto) mejor = Math.max(mejor, (acumulado[i + n] - acumulado[i]) / n);
  return mejor > 0 ? 10 * Math.log10(mejor) : -Infinity;
}

// Cuantos dB hay que subir o bajar un golpe para que sus 100 ms mas fuertes queden en `objetivoDb`; sin subir mas de `maxSubida` (un clink muy flojo no se amplifica hasta romperse). Una medida ilegible no cambia nada.
export const gananciaPorRms = (rmsDb, objetivoDb, maxSubida = 14) => (Number.isFinite(rmsDb) && Number.isFinite(objetivoDb) ? Math.min(maxSubida, objetivoDb - rmsDb) : 0);

// Los argumentos de ffmpeg para el recorte de una muestra (antes de -i): desde y dur, si los tiene.
export const recorteDe = ({ desde, dur } = {}) => [...(Number.isFinite(desde) && desde > 0 ? ['-ss', String(desde)] : []), ...(Number.isFinite(dur) && dur > 0 ? ['-t', String(dur)] : [])];

// El filtro de ffmpeg de una muestra: la ganancia, un fundido de entrada cortisimo (sin clic) y, si lo pide, el de salida al final del recorte; y el limitador.
export function filtroDe(ganancia, { fundido, dur, rms } = {}) {
  const f = [`volume=${ganancia.toFixed(2)}dB`];
  if (Number.isFinite(dur) && dur > 0) f.push('afade=t=in:d=0.01');
  if (Number.isFinite(fundido) && fundido > 0 && Number.isFinite(dur) && dur > fundido) f.push(`afade=t=out:st=${(dur - fundido).toFixed(3)}:d=${fundido.toFixed(3)}`);
  f.push(rms !== undefined ? 'alimiter=limit=0.89:attack=0.5:release=20' : 'alimiter=limit=0.89'); // un golpe nivelado por rms se amplifica con un limitador rapido: su pico no se rompe
  return f.join(',');
}

function medir(ffmpeg, archivo, recorte = []) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostats', ...recorte, '-i', archivo, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const media = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr ?? '');
  const pico = /max_volume: (-?[\d.]+) dB/.exec(r.stderr ?? '');
  return { media: media ? Number(media[1]) : NaN, pico: pico ? Number(pico[1]) : NaN };
}

// El rms mas fuerte (100 ms) del trozo recortado de un archivo: ffmpeg lo decodifica a mono de 22 kHz y se mide aqui.
function medirRms(ffmpeg, archivo, recorte = []) {
  const r = spawnSync(ffmpeg, ['-v', 'error', ...recorte, '-i', archivo, '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) return -Infinity;
  return rmsMaximoDb(new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.byteLength / 4)), 22050, 100);
}

function principal() {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.join('=')]; }));
  const raices = { paquetes: a.paquetes ? resolve(a.paquetes) : null, fuentes: resolve(a.fuentes || 'grabaciones/audio-fuentes') };
  const ffmpeg = a.ffmpeg || 'ffmpeg';
  const salida = resolve(a.salida || 'web/audio');
  const solo = a.solo ? new Set(a.solo.split(',')) : null;
  mkdirSync(salida, { recursive: true });
  let fallos = 0, saltadas = 0;
  for (const [destino, entrada] of Object.entries(MAPA)) {
    if (solo && !solo.has(destino)) continue;
    const { paquete, origen } = entrada, [argumento, subcarpeta] = RAICES[paquete];
    if (!raices[argumento]) { saltadas++; continue; }
    const fuente = join(raices[argumento], subcarpeta, origen);
    if (!existsSync(fuente)) { console.error(`  FALTA ${fuente}`); fallos++; continue; }
    const recorte = recorteDe(entrada), { media, pico } = medir(ffmpeg, fuente, recorte);
    const rms = entrada.rms !== undefined ? medirRms(ffmpeg, fuente, recorte) : undefined; // con `rms`, la ganancia sale de los 100 ms mas fuertes y no de la media
    const g = rms !== undefined ? gananciaPorRms(rms, entrada.rms) : gananciaPara(media, pico, entrada.nivel ?? NIVEL_OBJETIVO_DB);
    const real = paquete === 'freesound' || paquete === 'oga-starninjas'; // las grabaciones reales van en mono y un poco mas comprimidas: pesan menos en el repo
    const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...recorte, '-i', fuente, '-af', filtroDe(g, entrada), ...(real ? ['-ac', '1', '-q:a', '3'] : ['-q:a', '4']), '-c:a', 'libvorbis', '-ar', '44100', join(salida, destino)], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(`  FALLO ${destino}: ${r.stderr}`); fallos++; continue; }
    console.log(`  ok ${destino.padEnd(22)} <- ${paquete}/${origen}${recorte.length ? ` [${entrada.desde ?? 0} s +${entrada.dur ?? '...'} s]` : ''}  (medio ${media} dB, pico ${pico} dB${rms !== undefined ? `, rms ${rms.toFixed(1)} dB -> ${entrada.rms}` : ''}, ${g >= 0 ? '+' : ''}${g.toFixed(1)} dB)`);
  }
  if (saltadas) console.log(`  (${saltadas} muestra(s) saltadas: falta ${raices.paquetes ? '' : '--paquetes=CARPETA'})`);
  process.exit(fallos ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();

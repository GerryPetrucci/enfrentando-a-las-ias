#!/usr/bin/env node
// Recorta la grabacion maestra de OBS (hoja de 3840x2160) en un archivo por formato, en UNA sola pasada de ffmpeg:
// NOMBRE_9x16_fb-ig-tk-yt.mp4 y NOMBRE_16x9_fb-x-yt.mp4: el nombre dice el formato y las redes a las que sirve (herramientas/nombres.mjs; las redes salen de formatos.mjs).
// Las medidas salen de herramientas/formatos.mjs. Necesita ffmpeg y ffprobe en el PATH.
//
//   node herramientas/recortar-formatos.mjs GRABACION.mkv 26-10-19_p1_pt1
//   node herramientas/recortar-formatos.mjs GRABACION.mkv 26-10-19_p1_pt1 --carpeta=salida --crf=17 --inicio=3.5
//
// Una grabacion hecha con la direccion del paquete (grabar=1) trae negro al empezar y al terminar: se detecta y se recorta solo, dejando los fundidos (mas abajo, NEGRO). Si no encuentra
// uno de los dos margenes (una grabacion vieja, la carta de ajuste) no recorta ese lado y lo dice.
//
// --inicio=SEGUNDOS  salta el principio (manda sobre el inicio detectado)
// --manual           no detecta el negro: solo recorta lo que pidas con --inicio
// --crf=N            calidad de H.264: 17 casi sin perdida (por defecto); sube a 20 si los archivos pesan demasiado

import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOJA, FORMATOS } from './formatos.mjs';
import { nombreDeVideo } from './nombres.mjs';
import { FUNDIDOS } from '../web/casino/escena-config.js';

// [0:v]split=N[s0]..[sN];[s0]crop=ancho:alto:x:y[f0];...
export function filtro(formatos = FORMATOS) {
  const claves = Object.keys(formatos);
  const partes = [`[0:v]split=${claves.length}${claves.map((_, i) => `[s${i}]`).join('')}`];
  claves.forEach((k, i) => {
    const f = formatos[k];
    partes.push(`[s${i}]crop=${f.ancho}:${f.alto}:${f.x}:${f.y}[f${i}]`);
  });
  return partes.join(';');
}

// ---- El negro de los margenes de la grabacion --------------------------------------------------------------------------------------------------
// Una grabacion hecha con la direccion del paquete (grabar=1) empieza con unos segundos de negro, se aclara, cuenta la pieza, se funde a negro y se queda en negro hasta que se detiene la grabacion.
// Esos margenes son para grabar sin perder el principio ni adivinar el final: en el video que se publica sobran (los primeros 3 segundos deciden la retencion). Se detectan con blackdetect de ffmpeg
// y se recorta de un poco antes de que se aclare a un poco despues de que quede negro, para que el video empiece y termine DENTRO de los fundidos.
// Calibrado el 18 de octubre de 2026 con una captura real de la hoja y fundidos de media onda senoidal: con umbral 0.03 el negro termina ~0.07 s despues de empezar el fundido de entrada y empieza ~0.03 s antes de acabar el de salida.
// El minimo de un margen sale de FUNDIDOS (escena-config.js): tres cuartos del mas corto de los dos que espera la pagina (1.5 s con los tiempos de hoy); un negro mas corto no es margen.
export const NEGRO = {
  umbral: 0.03, // blackdetect: cuanto cuenta como negro un pixel (fraccion del rango de luma)
  minimo: (0.75 * Math.min(FUNDIDOS.margenMs, FUNDIDOS.colaMs)) / 1000, // s
  antes: 0.15, despues: 0.15, // holguras: se corta 0.15 s antes de que se aclare y 0.15 s despues de que quede negro (los fundidos se quedan)
  tolerancia: 0.25, // blackdetect termina en el ultimo cuadro, no en la duracion
};
const redondear = (x) => Math.round(x * 1000) / 1000;

// Los intervalos [{ inicio, fin }] (segundos) que escribe blackdetect en la salida de ffmpeg. Cualquier otra cosa -> [].
export function negrosDe(texto) {
  if (typeof texto !== 'string') return [];
  return [...texto.matchAll(/black_start:(-?[\d.]+)\s+black_end:(-?[\d.]+)/g)].map((m) => ({ inicio: Number(m[1]), fin: Number(m[2]) }));
}

// De que segundo a que segundo queda el contenido. El margen de SALIDA es el negro largo que llega al final del video (el contenido acaba donde empieza). El de ENTRADA es el ULTIMO negro largo antes
// de la salida (o, sin salida, el ultimo de todos): la pieza es lo que hay justo antes de la salida, asi que lo anterior es de otra pasada de la pagina que quedo en el mismo archivo (se pego la
// direccion, que se reproduce una vez sola, y se grabo durante ella) y se va; la hoja nunca tiene 1.5 s de negro dentro de la pieza (media hoja es el fondo del tapiz). `inicio` o `fin` en null = ese
// lado no se recorta; `avisos` dice por que.
export function ventanaDeContenido(negros, duracion, { minimo = NEGRO.minimo } = {}) {
  const sin = (avisos) => ({ inicio: null, fin: null, avisos });
  if (!Array.isArray(negros) || !Number.isFinite(duracion) || duracion <= 0) return sin(['No pude medir la grabacion: no recorto el negro.']);
  const largos = negros.filter((n) => n && Number.isFinite(n.inicio) && Number.isFinite(n.fin) && n.fin - n.inicio >= minimo).sort((a, b) => a.inicio - b.inicio);
  const alInicio = (n) => n.inicio <= NEGRO.tolerancia, alFinal = (n) => n.fin >= duracion - NEGRO.tolerancia;
  if (largos.length === 1 && alInicio(largos[0]) && alFinal(largos[0])) return sin(['La grabacion es toda negra: ¿esta bien la fuente de OBS? No recorto nada.']);
  const salida = largos.findLast(alFinal) ?? null; // el negro que llega al final
  const previos = largos.filter((n) => n !== salida && (!salida || n.fin <= salida.inicio));
  const entrada = previos.at(-1) ?? null; // el ultimo negro largo antes de la salida
  const avisos = [];
  if (previos.length > 1) avisos.push(`Hay negro antes del margen de entrada (${previos.slice(0, -1).map((n) => `${n.inicio.toFixed(1)} s a ${n.fin.toFixed(1)} s`).join(', ')}): es de una pasada anterior de la pagina en el mismo archivo; lo recorto.`);
  if (!entrada) avisos.push('No encontre el negro de entrada: ¿grabaste con la direccion del paquete (lleva grabar=1)? No recorto el inicio.');
  if (!salida) avisos.push(`No encontre el negro de salida (hace falta que la grabacion termine con al menos ${NEGRO.minimo} s de negro): ¿detuviste la grabacion antes de que terminara el fundido final, o sin esperar esos segundos de negro? No recorto el final.`);
  return { inicio: entrada ? redondear(Math.max(0, entrada.fin - NEGRO.antes)) : null, fin: salida ? redondear(Math.min(duracion, salida.inicio + NEGRO.despues)) : null, avisos };
}

export function argumentosFfmpeg({ entrada, nombre, carpeta, crf = 17, inicio = null, duracion = null, formatos = FORMATOS }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (inicio !== null) args.push('-ss', String(inicio));
  if (duracion !== null) args.push('-t', String(duracion)); // opcion de entrada: lo que se lee desde `inicio`
  args.push('-i', entrada, '-filter_complex', filtro(formatos));
  Object.keys(formatos).forEach((k, i) => {
    args.push(
      '-map', `[f${i}]`, '-map', '0:a?',
      '-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
      join(carpeta, `${nombreDeVideo(nombre, k)}.mp4`)
    );
  });
  return args;
}

function salir(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

function medidasDe(entrada) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', entrada], { encoding: 'utf8' });
  if (r.error) salir('No encuentro ffprobe. Instala ffmpeg (por ejemplo: winget install Gyan.FFmpeg) y abre una terminal nueva.');
  if (r.status !== 0) salir(`No pude leer el video: ${r.stderr.trim() || entrada}`);
  return r.stdout.trim();
}

// Lo que dura el video contado desde su primer cuadro: ffprobe da el instante en que TERMINA (duration) y el instante en que EMPIEZA (start_time; un MKV de OBS puede no empezar en 0), y blackdetect
// cuenta los tiempos desde el primer cuadro, asi que se resta.
function duracionDe(entrada) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,start_time', '-of', 'default=noprint_wrappers=1', entrada], { encoding: 'utf8' });
  const lee = (clave) => Number(new RegExp(`${clave}=([\\d.]+)`).exec(String(r.stdout))?.[1]);
  return lee('duration') - (lee('start_time') || 0); // start_time=N/A -> 0
}

// Detecta los negros sobre una copia reducida (no hace falta el 4K para saber si un cuadro es negro) y devuelve el contenido: { inicio, fin, avisos, duracion }.
function contenidoDe(entrada) {
  const duracion = duracionDe(entrada);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', entrada, '-an', '-vf', `scale=480:270:flags=neighbor,blackdetect=d=0.5:pix_th=${NEGRO.umbral}`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ...ventanaDeContenido(negrosDe(r.stderr), duracion), duracion };
}

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const posicionales = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const opciones = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
  const [entrada, nombre] = posicionales;
  if (!entrada || !nombre) salir('Uso: node herramientas/recortar-formatos.mjs GRABACION.mkv NOMBRE [--carpeta=salida] [--crf=17] [--inicio=segundos] [--manual]');
  if (!existsSync(entrada)) salir(`El archivo no existe: ${entrada}`);

  const esperado = `${HOJA.ancho}x${HOJA.alto}`;
  const real = medidasDe(entrada);
  if (real !== esperado) salir(`La grabacion mide ${real} y la hoja maestra debe medir ${esperado}. En OBS: Ajustes > Video, resolucion base y de salida en ${esperado}.`);

  const carpeta = resolve(typeof opciones.carpeta === 'string' ? opciones.carpeta : '.');
  mkdirSync(carpeta, { recursive: true });
  let inicio = typeof opciones.inicio === 'string' ? Number(opciones.inicio) : null, duracion = null;
  if (opciones.manual !== true) {
    // el negro de los margenes (grabar=1): --inicio manda sobre el inicio detectado; --manual apaga la deteccion
    const c = contenidoDe(entrada);
    for (const aviso of c.avisos) console.log(`  AVISO: ${aviso}`);
    if (inicio === null && c.inicio !== null) inicio = c.inicio;
    if (c.fin !== null) duracion = Math.max(0.1, redondear(c.fin - (inicio ?? 0)));
    if (c.inicio !== null || c.fin !== null) console.log(`  Recorto el negro de los margenes: me quedo con ${inicio === null ? 'el inicio' : `desde ${inicio} s`}${duracion === null ? ' hasta el final' : ` durante ${duracion} s`} (de ${c.duracion.toFixed(1)} s grabados).`);
  }
  const args = argumentosFfmpeg({
    entrada, nombre, carpeta, inicio, duracion,
    crf: typeof opciones.crf === 'string' ? Number(opciones.crf) : 17,
  });
  console.log(`\n  Recortando ${entrada} en ${Object.keys(FORMATOS).length} formatos...`);
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.error) salir('No encuentro ffmpeg. Instala ffmpeg (por ejemplo: winget install Gyan.FFmpeg) y abre una terminal nueva.');
  if (r.status !== 0) salir('ffmpeg fallo (mira el mensaje de arriba).');
  for (const [k, f] of Object.entries(FORMATOS)) console.log(`  ${join(carpeta, `${nombreDeVideo(nombre, k)}.mp4`)}   ${f.ancho}x${f.alto}   ${f.uso}`);
  console.log('');
}

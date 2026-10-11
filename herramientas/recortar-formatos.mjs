#!/usr/bin/env node
// Recorta la grabacion maestra de OBS (hoja de 3840x2160) en un archivo por formato, en UNA sola pasada de ffmpeg:
// NOMBRE_9x16.mp4 (TikTok, Reels, Shorts), NOMBRE_4x5.mp4 (Instagram) y NOMBRE_16x9.mp4 (YouTube, X, el sitio).
// Las medidas salen de herramientas/formatos.mjs. Necesita ffmpeg y ffprobe en el PATH.
//
//   node herramientas/recortar-formatos.mjs GRABACION.mkv ep01
//   node herramientas/recortar-formatos.mjs GRABACION.mkv ep01 --carpeta=salida --crf=17 --inicio=3.5
//
// --inicio=SEGUNDOS  salta el principio (la cuenta regresiva de la escena antes de que empiece la partida)
// --crf=N            calidad de H.264: 17 casi sin perdida (por defecto); sube a 20 si los archivos pesan demasiado

import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOJA, FORMATOS } from './formatos.mjs';

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

export function argumentosFfmpeg({ entrada, nombre, carpeta, crf = 17, inicio = null, formatos = FORMATOS }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (inicio !== null) args.push('-ss', String(inicio));
  args.push('-i', entrada, '-filter_complex', filtro(formatos));
  Object.keys(formatos).forEach((k, i) => {
    args.push(
      '-map', `[f${i}]`, '-map', '0:a?',
      '-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
      join(carpeta, `${nombre}_${k}.mp4`)
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

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const posicionales = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const opciones = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
  const [entrada, nombre] = posicionales;
  if (!entrada || !nombre) salir('Uso: node herramientas/recortar-formatos.mjs GRABACION.mkv NOMBRE [--carpeta=salida] [--crf=17] [--inicio=segundos]');
  if (!existsSync(entrada)) salir(`El archivo no existe: ${entrada}`);

  const esperado = `${HOJA.ancho}x${HOJA.alto}`;
  const real = medidasDe(entrada);
  if (real !== esperado) salir(`La grabacion mide ${real} y la hoja maestra debe medir ${esperado}. En OBS: Ajustes > Video, resolucion base y de salida en ${esperado}.`);

  const carpeta = resolve(typeof opciones.carpeta === 'string' ? opciones.carpeta : '.');
  mkdirSync(carpeta, { recursive: true });
  const args = argumentosFfmpeg({
    entrada, nombre, carpeta,
    crf: typeof opciones.crf === 'string' ? Number(opciones.crf) : 17,
    inicio: typeof opciones.inicio === 'string' ? Number(opciones.inicio) : null,
  });
  console.log(`\n  Recortando ${entrada} en ${Object.keys(FORMATOS).length} formatos...`);
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.error) salir('No encuentro ffmpeg. Instala ffmpeg (por ejemplo: winget install Gyan.FFmpeg) y abre una terminal nueva.');
  if (r.status !== 0) salir('ffmpeg fallo (mira el mensaje de arriba).');
  for (const [k, f] of Object.entries(FORMATOS)) console.log(`  ${join(carpeta, `${nombre}_${k}.mp4`)}   ${f.ancho}x${f.alto}   ${f.uso}`);
  console.log('');
}

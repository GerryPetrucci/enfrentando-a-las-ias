// El recortador saca un archivo por formato de la grabacion maestra. Se prueba con un video maestro SINTETICO de colores
// (sin OBS): cada zona tiene su color, asi se comprueba de donde sale cada pixel y no solo el tamano.
// Si ffmpeg no esta instalado, las pruebas que lo necesitan se saltan.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filtro, argumentosFfmpeg } from '../../herramientas/recortar-formatos.mjs';
import { FORMATOS } from '../../herramientas/formatos.mjs';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const saltar = !hayFfmpeg && 'ffmpeg no esta instalado';

test('el filtro parte la hoja en un recorte por formato, con las medidas de formatos.mjs', () => {
  const f = filtro();
  assert.match(f, /^\[0:v\]split=3\[s0\]\[s1\]\[s2\];/);
  assert.ok(f.includes('crop=1080:1920:0:0[f0]'));
  assert.ok(f.includes('crop=1080:1350:0:284[f1]'));
  assert.ok(f.includes('crop=1920:1080:1080:0[f2]'));
});

test('los argumentos de ffmpeg dan un archivo por formato, con el audio opcional y sin pedir confirmacion', () => {
  const a = argumentosFfmpeg({ entrada: 'g.mkv', nombre: 'ep01', carpeta: 'sal', crf: 18, inicio: 3.5 });
  assert.deepEqual(a.slice(0, 4), ['-hide_banner', '-loglevel', 'error', '-y']);
  assert.ok(a.join(' ').includes('-ss 3.5 -i g.mkv'));
  for (const k of Object.keys(FORMATOS)) assert.ok(a.includes(join('sal', `ep01_${k}.mp4`)), k);
  assert.equal(a.filter((x) => x === '0:a?').length, 3);
  assert.ok(a.includes('18'));
});

// color de un pixel (x, y) de un video, leyendo un solo cuadro como RGB crudo
function pixel(archivo, x, y) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', archivo, '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 });
  assert.equal(r.status, 0, String(r.stderr));
  return [...r.stdout.subarray(0, 3)];
}
const es = (rgb, esperado) => rgb.every((v, i) => Math.abs(v - esperado[i]) <= 24); // tolerancia por la compresion
const medidas = (archivo) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', archivo], { encoding: 'utf8' });
  return r.stdout.trim();
};

test('recortar-formatos saca de la hoja el 9x16, el 4x5 y el 16x9 desde el lugar correcto', { skip: saltar }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'recorte-'));
  try {
    const maestro = join(dir, 'maestro.mkv');
    // hoja negra; banda verde en las 284 filas de arriba del vertical; resto del vertical rojo; zona del 16x9 azul
    const dibujo = 'drawbox=x=0:y=0:w=1080:h=1920:color=red:t=fill,drawbox=x=0:y=0:w=1080:h=284:color=lime:t=fill,drawbox=x=1080:y=0:w=1920:h=1080:color=blue:t=fill';
    const g = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=3840x2160:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-vf', dibujo, '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '12', '-c:a', 'aac', maestro]);
    assert.equal(g.status, 0, String(g.stderr));

    const r = spawnSync(process.execPath, ['herramientas/recortar-formatos.mjs', maestro, 'ep', `--carpeta=${dir}`], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);

    const v = join(dir, 'ep_9x16.mp4'), ig = join(dir, 'ep_4x5.mp4'), h = join(dir, 'ep_16x9.mp4');
    assert.deepEqual([medidas(v), medidas(ig), medidas(h)], ['1080x1920', '1080x1350', '1920x1080']);
    assert.ok(es(pixel(v, 540, 100), [0, 255, 0]), 'el 9x16 empieza en la banda verde de arriba');
    assert.ok(es(pixel(v, 540, 1000), [255, 0, 0]), 'el 9x16 es rojo en el medio');
    assert.ok(es(pixel(ig, 540, 10), [255, 0, 0]), 'el 4x5 ya no incluye la banda verde (empieza en y=284)');
    assert.ok(es(pixel(h, 960, 540), [0, 0, 255]), 'el 16x9 sale de la region azul');
    // el audio se conserva en los tres
    for (const f of [v, ig, h]) {
      const a = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', f], { encoding: 'utf8' });
      assert.equal(a.stdout.trim(), 'aac', f);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recortar-formatos rechaza un video que no es la hoja de 3840x2160, y un archivo que no existe', { skip: saltar }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'recorte-'));
  try {
    const chico = join(dir, 'chico.mkv');
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', chico]);
    let r = spawnSync(process.execPath, ['herramientas/recortar-formatos.mjs', chico, 'ep', `--carpeta=${dir}`], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /3840x2160/);
    assert.equal(existsSync(join(dir, 'ep_9x16.mp4')), false);

    r = spawnSync(process.execPath, ['herramientas/recortar-formatos.mjs', join(dir, 'nada.mkv'), 'ep'], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no existe/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

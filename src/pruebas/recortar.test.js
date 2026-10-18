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
import { filtro, argumentosFfmpeg, negrosDe, ventanaDeContenido } from '../../herramientas/recortar-formatos.mjs';
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

// ---- el negro de los margenes de la grabacion (grabar=1): se detecta y se recorta, dejando los fundidos ----

test('negrosDe lee los intervalos que escribe blackdetect, en segundos, y ignora el resto de la salida de ffmpeg', () => {
  const salida = [
    'ffmpeg version 9.0.1 Copyright (c) 2000-2026 the FFmpeg developers',
    '[blackdetect @ 000001bb826ca140] black_start:0 black_end:2.0333 black_duration:2.0333',
    'frame=  100 fps=0.0 q=-0.0 size=N/A time=00:00:03.30 bitrate=N/A speed=33x',
    '[blackdetect @ 000001bb826ca140] black_start:8.2 black_end:10.5 black_duration:2.3',
  ].join('\n');
  assert.deepEqual(negrosDe(salida), [{ inicio: 0, fin: 2.0333 }, { inicio: 8.2, fin: 10.5 }]);
  for (const nada of ['', 'sin negros', undefined, null, 7]) assert.deepEqual(negrosDe(nada), [], String(nada));
});

test('ventanaDeContenido: de donde acaba el negro de entrada a donde empieza el de salida (con una holgura que deja los fundidos), y nada si no hay margenes', () => {
  const v = (negros, duracion) => ventanaDeContenido(negros, duracion);
  // los dos margenes: se recorta por los dos lados, 0.15 s antes de que se aclare y 0.15 s despues de que quede negro
  assert.deepEqual(v([{ inicio: 0, fin: 2.05 }, { inicio: 6.45, fin: 8.5 }], 8.5), { inicio: 1.9, fin: 6.6, avisos: [] });
  // se grabo algo antes de refrescar la pagina: el negro de entrada no empieza en 0 y lo anterior se va
  assert.deepEqual(v([{ inicio: 1, fin: 3.2 }, { inicio: 9, fin: 11 }], 11), { inicio: 3.05, fin: 9.15, avisos: [] });
  // solo el de entrada (se detuvo la grabacion antes del fundido final), solo el de salida (se empezo tarde) y ninguno (una grabacion vieja): se dice, y lo que no se encuentra no se recorta
  const soloEntrada = v([{ inicio: 0, fin: 2.05 }], 8.5);
  assert.deepEqual([soloEntrada.inicio, soloEntrada.fin], [1.9, null]);
  assert.match(soloEntrada.avisos.join(' '), /salida/);
  const soloSalida = v([{ inicio: 6.45, fin: 8.5 }], 8.5);
  assert.deepEqual([soloSalida.inicio, soloSalida.fin], [null, 6.6]);
  assert.match(soloSalida.avisos.join(' '), /entrada/);
  const ninguno = v([], 8.5);
  assert.deepEqual([ninguno.inicio, ninguno.fin], [null, null]);
  assert.equal(ninguno.avisos.length, 2);
});

test('ventanaDeContenido ignora los negros cortos, no se confunde con un negro suelto en medio ni con una grabacion toda negra, y nunca se sale del video', () => {
  const v = (negros, duracion) => ventanaDeContenido(negros, duracion);
  for (const corto of [[{ inicio: 3, fin: 3.4 }], [{ inicio: 0, fin: 0.4 }], [{ inicio: 7.6, fin: 8 }], [{ inicio: 0, fin: 1.4 }, { inicio: 6.6, fin: 8 }]]) {
    assert.deepEqual([v(corto, 8).inicio, v(corto, 8).fin], [null, null], `un negro de menos de 1.5 s no es un margen: ${JSON.stringify(corto)}`);
  }
  const enMedio = v([{ inicio: 4, fin: 6.5 }], 10);
  assert.deepEqual([enMedio.inicio, enMedio.fin], [null, null], 'un solo negro en medio no es ni entrada ni salida');
  assert.match(enMedio.avisos.join(' '), /medio/);
  const todo = v([{ inicio: 0, fin: 8.5 }], 8.5);
  assert.deepEqual([todo.inicio, todo.fin], [null, null]);
  assert.match(todo.avisos.join(' '), /toda negra|todo negro/);
  const conMedio = v([{ inicio: 0, fin: 2 }, { inicio: 5, fin: 7 }, { inicio: 9, fin: 11 }], 11);
  assert.deepEqual([conMedio.inicio, conMedio.fin], [1.85, 9.15], 'cuentan el primero y el ultimo');
  assert.match(conMedio.avisos.join(' '), /medio/, 'avisa del negro del medio');
  assert.equal(v([{ inicio: 0, fin: 1.6 }], 5).inicio, 1.45);
  assert.equal(v([{ inicio: 0, fin: 1.55 }, { inicio: 3, fin: 5 }], 5).inicio, 1.4);
  // con un minimo mas chico (no es el caso normal) la holgura no se sale del video por ningun lado
  const justo = ventanaDeContenido([{ inicio: 0, fin: 0.1 }, { inicio: 4.95, fin: 5 }], 5, { minimo: 0.01 });
  assert.deepEqual([justo.inicio, justo.fin], [0, 5], 'ni antes del inicio ni despues del final');
  for (const basura of [null, undefined, 'x', [null], [{ inicio: NaN, fin: 3 }], [{ inicio: 'a', fin: 'b' }]]) assert.deepEqual([ventanaDeContenido(basura, 8).inicio, ventanaDeContenido(basura, 8).fin], [null, null], String(basura));
  assert.deepEqual([ventanaDeContenido([{ inicio: 0, fin: 2 }], NaN).inicio, ventanaDeContenido([{ inicio: 0, fin: 2 }], undefined).fin], [null, null], 'sin duracion no se recorta');
});

test('ventanaDeContenido: un negro largo en medio nunca se toma por el margen de salida (la salida tiene que llegar al final del video), ni por el de entrada sin una salida detras', () => {
  const v = (negros, duracion) => ventanaDeContenido(negros, duracion);
  // se detuvo la grabacion antes del fundido final y hay un negro de 2 s en medio: sin negro de salida, no se corta el video por la mitad
  const detuvoAntes = v([{ inicio: 0, fin: 2 }, { inicio: 5, fin: 7 }], 10);
  assert.deepEqual([detuvoAntes.inicio, detuvoAntes.fin], [1.85, null]);
  assert.match(detuvoAntes.avisos.join(' '), /medio/);
  assert.match(detuvoAntes.avisos.join(' '), /salida/);
  // dos negros que no tocan ni el inicio ni el final: no son margenes
  const sueltos = v([{ inicio: 1, fin: 3 }, { inicio: 5, fin: 7 }], 10);
  assert.deepEqual([sueltos.inicio, sueltos.fin], [null, null]);
  assert.match(sueltos.avisos.join(' '), /medio/);
  // lo que antes de refrescar la pagina ya se grababa (el negro de entrada no empieza en 0) sigue valiendo si detras hay un negro que llega al final
  const conPrevio = v([{ inicio: 1, fin: 3.2 }, { inicio: 9, fin: 11 }], 11);
  assert.deepEqual([conPrevio.inicio, conPrevio.fin], [3.05, 9.15]);
});

test('los argumentos de ffmpeg limitan la duracion de lo que se lee cuando se pide (despues de -ss y antes de -i), y sin ella no cambian', () => {
  const con = argumentosFfmpeg({ entrada: 'g.mkv', nombre: 'ep01', carpeta: 'sal', inicio: 1.9, duracion: 4.7 }).join(' ');
  assert.ok(con.includes('-ss 1.9 -t 4.7 -i g.mkv'), con);
  const sin = argumentosFfmpeg({ entrada: 'g.mkv', nombre: 'ep01', carpeta: 'sal', inicio: 1.9 }).join(' ');
  assert.ok(sin.includes('-ss 1.9 -i g.mkv') && !sin.includes('-t '), sin);
  assert.ok(!argumentosFfmpeg({ entrada: 'g.mkv', nombre: 'ep01', carpeta: 'sal' }).includes('-t'));
});

// una grabacion sintetica como la de OBS con grabar=1: negro 2 s, fundido de 0.5 s, 3.5 s de contenido, fundido de 0.5 s y 2 s de negro (8.5 s en total), con audio
function grabacionConMargenes(dir, nombre = 'conmargenes.mkv') {
  const maestro = join(dir, nombre);
  const g = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=3840x2160:r=30:d=8.5', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:d=8.5',
    '-vf', 'fade=t=in:st=2:d=0.5,fade=t=out:st=6:d=0.5,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'veryfast', '-c:a', 'aac', maestro]);
  assert.equal(g.status, 0, String(g.stderr));
  return maestro;
}
const duracionDe = (archivo) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', archivo], { encoding: 'utf8' }).stdout.trim());
// brillo medio (0 a 255) del cuadro mas cercano al segundo `t`
const brilloEn = (archivo, t) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', archivo, '-frames:v', '1', '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 20 });
  assert.equal(r.status, 0, String(r.stderr));
  const px = [...r.stdout];
  return px.reduce((s, x) => s + x, 0) / px.length;
};

test('recortar-formatos quita el negro de los margenes de una grabacion hecha con grabar=1 y deja los fundidos: dura ~4.8 s, abre y cierra en negro, y conserva el audio', { skip: saltar }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'recorte-'));
  try {
    const maestro = grabacionConMargenes(dir);
    const r = spawnSync(process.execPath, ['herramientas/recortar-formatos.mjs', maestro, 'ep', `--carpeta=${dir}`], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    for (const k of Object.keys(FORMATOS)) {
      const f = join(dir, `ep_${k}.mp4`), d = duracionDe(f);
      assert.ok(d > 4.4 && d < 5.3, `${k}: dura ${d} (esperado ~4.8: 0.15 de negro + fundido + 3.5 de contenido + fundido + 0.15 de negro)`);
      assert.ok(brilloEn(f, 0) < 30, `${k}: abre en negro (brillo ${brilloEn(f, 0)})`);
      assert.ok(brilloEn(f, d - 0.05) < 30, `${k}: cierra en negro`);
      assert.ok(brilloEn(f, d / 2) > 40, `${k}: en medio hay contenido`);
      const a = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', f], { encoding: 'utf8' });
      assert.equal(a.stdout.trim(), 'aac', `${k}: conserva el audio`);
    }
    assert.match(r.stdout, /negro/i, 'cuenta que recorto');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recortar-formatos no recorta lo que no tiene negro de margenes (la carta de ajuste, las grabaciones viejas) y lo dice; --manual apaga la deteccion y --inicio sigue mandando', { skip: saltar }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'recorte-'));
  try {
    const sin = join(dir, 'sin.mkv');
    const g = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=3840x2160:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '14', '-preset', 'veryfast', sin]);
    assert.equal(g.status, 0, String(g.stderr));
    let r = spawnSync(process.execPath, ['herramientas/recortar-formatos.mjs', sin, 'sin', `--carpeta=${dir}`], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.ok(Math.abs(duracionDe(join(dir, 'sin_9x16.mp4')) - 3) < 0.3, 'sin negro no se recorta nada');
    assert.match(r.stdout, /no encontr/i, 'avisa que no encontro los margenes');

    const maestro = grabacionConMargenes(dir);
    r = spawnSync(process.execPath, ['herramientas/recortar-formatos.mjs', maestro, 'manual', `--carpeta=${dir}`, '--manual'], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.ok(Math.abs(duracionDe(join(dir, 'manual_9x16.mp4')) - 8.5) < 0.3, '--manual deja la grabacion entera');
    r = spawnSync(process.execPath, ['herramientas/recortar-formatos.mjs', maestro, 'inicio', `--carpeta=${dir}`, '--manual', '--inicio=2'], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.ok(Math.abs(duracionDe(join(dir, 'inicio_9x16.mp4')) - 6.5) < 0.3, '--inicio=2 salta los 2 primeros segundos');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

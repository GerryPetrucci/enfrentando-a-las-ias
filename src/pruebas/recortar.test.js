// El recortador saca un archivo por formato de la grabacion maestra. Se prueba con un video maestro SINTETICO de colores
// (sin OBS): cada zona tiene su color, asi se comprueba de donde sale cada pixel y no solo el tamano.
// Si ffmpeg no esta instalado, las pruebas que lo necesitan se saltan.
//
//   npm test

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filtro, argumentosFfmpeg, negrosDe, ventanaDeContenido, NEGRO } from '../../herramientas/recortar-formatos.mjs';
import { FORMATOS } from '../../herramientas/formatos.mjs';
import { FUNDIDOS } from '../../web/casino/escena-config.js';

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
  const todo = v([{ inicio: 0, fin: 8.5 }], 8.5);
  assert.deepEqual([todo.inicio, todo.fin], [null, null]);
  assert.match(todo.avisos.join(' '), /toda negra|todo negro/);
  assert.equal(v([{ inicio: 0, fin: 1.6 }], 5).inicio, 1.45);
  assert.equal(v([{ inicio: 0, fin: 1.55 }, { inicio: 3, fin: 5 }], 5).inicio, 1.4);
  // con un minimo mas chico (no es el caso normal) la holgura no se sale del video por ningun lado
  const justo = ventanaDeContenido([{ inicio: 0, fin: 0.1 }, { inicio: 4.95, fin: 5 }], 5, { minimo: 0.01 });
  assert.deepEqual([justo.inicio, justo.fin], [0, 5], 'ni antes del inicio ni despues del final');
  for (const basura of [null, undefined, 'x', [null], [{ inicio: NaN, fin: 3 }], [{ inicio: 'a', fin: 'b' }]]) assert.deepEqual([ventanaDeContenido(basura, 8).inicio, ventanaDeContenido(basura, 8).fin], [null, null], String(basura));
  assert.deepEqual([ventanaDeContenido([{ inicio: 0, fin: 2 }], NaN).inicio, ventanaDeContenido([{ inicio: 0, fin: 2 }], undefined).fin], [null, null], 'sin duracion no se recorta');
});

test('ventanaDeContenido: la salida es el negro que llega al final y la entrada es el ULTIMO negro largo antes de ella (la pieza es lo que hay justo antes de la salida: lo anterior es de una pasada vieja de la pagina)', () => {
  const v = (negros, duracion) => ventanaDeContenido(negros, duracion);
  // se pego la direccion y se grabo durante su primera pasada: negro de esa pasada, un trozo de ella, y despues el margen de la pieza de verdad y su salida
  const primeraPasada = v([{ inicio: 0, fin: 2.3 }, { inicio: 8, fin: 10.4 }, { inicio: 130, fin: 133 }], 133);
  assert.deepEqual([primeraPasada.inicio, primeraPasada.fin], [10.25, 130.15], 'la pieza empieza donde acaba el ULTIMO negro antes de la salida, no el primero');
  assert.match(primeraPasada.avisos.join(' '), /antes del margen de entrada/, 'se dice que habia una pasada anterior en el archivo');
  // algo se grababa antes de refrescar (el negro de entrada no empieza en 0): sigue valiendo
  const conPrevio = v([{ inicio: 1, fin: 3.2 }, { inicio: 9, fin: 11 }], 11);
  assert.deepEqual([conPrevio.inicio, conPrevio.fin], [3.05, 9.15]);
  assert.deepEqual(conPrevio.avisos, [], 'un solo negro antes de la salida: nada que avisar');
  // se detuvo antes del fundido final (sin salida): la entrada es el ultimo negro largo (los de antes son de otras pasadas) y el final no se recorta
  const detuvoAntes = v([{ inicio: 0, fin: 2 }, { inicio: 5, fin: 7 }], 10);
  assert.deepEqual([detuvoAntes.inicio, detuvoAntes.fin], [6.85, null]);
  assert.match(detuvoAntes.avisos.join(' '), /salida/);
  assert.match(detuvoAntes.avisos.join(' '), /antes del margen de entrada/);
  // un solo negro que no toca el inicio ni el final (se empezo a grabar con la pagina ya en marcha): es la entrada; lo de antes se va
  const suelto = v([{ inicio: 4, fin: 6.5 }], 10);
  assert.deepEqual([suelto.inicio, suelto.fin], [6.35, null]);
  // una grabacion con dos negros y sin salida, ninguno al inicio: el ultimo es la entrada
  assert.equal(v([{ inicio: 1, fin: 3 }, { inicio: 5, fin: 7 }], 10).inicio, 6.85);
  // blackdetect no encima intervalos, pero con una lista armada a mano un negro que empieza cuando la salida ya empezo nunca es la entrada: la ventana no se invierte
  const encimado = v([{ inicio: 2, fin: 4 }, { inicio: 10, fin: 20 }, { inicio: 15, fin: 18 }], 20);
  assert.deepEqual([encimado.inicio, encimado.fin], [3.85, 10.15]);
  assert.deepEqual(encimado.avisos, [], 'el negro encimado no cuenta como una pasada anterior');
});

test('los argumentos de ffmpeg limitan la duracion de lo que se lee cuando se pide (despues de -ss y antes de -i), y sin ella no cambian', () => {
  const con = argumentosFfmpeg({ entrada: 'g.mkv', nombre: 'ep01', carpeta: 'sal', inicio: 1.9, duracion: 4.7 }).join(' ');
  assert.ok(con.includes('-ss 1.9 -t 4.7 -i g.mkv'), con);
  const sin = argumentosFfmpeg({ entrada: 'g.mkv', nombre: 'ep01', carpeta: 'sal', inicio: 1.9 }).join(' ');
  assert.ok(sin.includes('-ss 1.9 -i g.mkv') && !sin.includes('-t '), sin);
  assert.ok(!argumentosFfmpeg({ entrada: 'g.mkv', nombre: 'ep01', carpeta: 'sal' }).includes('-t'));
});

test('el minimo de un margen sale de FUNDIDOS (tres cuartos del mas corto): si la pagina cambia sus tiempos, el recortador sigue buscando los margenes de verdad', () => {
  assert.equal(NEGRO.minimo, 1.5, 'con 2 s de margen y de cola, un negro de 1.5 s o mas es un margen');
  assert.equal((0.75 * Math.min(FUNDIDOS.margenMs, FUNDIDOS.colaMs)) / 1000, NEGRO.minimo);
});

// ---- con ffmpeg de verdad (se saltan sin ffmpeg): una grabacion sintetica como la de OBS con grabar=1, con los tiempos de FUNDIDOS ----
// margen de negro, fundido de entrada, un poco de contenido, fundido de salida y cola de negro, con audio. Se arma UNA vez para todas las pruebas de abajo y se borra al final (codificar 4K cuesta).
const M = FUNDIDOS.margenMs / 1000, F = FUNDIDOS.fundidoMs / 1000, C = FUNDIDOS.colaMs / 1000, CONTENIDO = 1.5, TOTAL = M + F + CONTENIDO + F + C;
let montaje = null;
const dirDeMontaje = () => (montaje ??= mkdtempSync(join(tmpdir(), 'recorte-')));
after(() => { if (montaje) rmSync(montaje, { recursive: true, force: true }); });
function grabacionConMargenes() {
  const maestro = join(dirDeMontaje(), 'conmargenes.mkv');
  if (existsSync(maestro)) return maestro;
  const g = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=3840x2160:r=30:d=${TOTAL}`, '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:d=${TOTAL}`,
    '-vf', `fade=t=in:st=${M}:d=${F},fade=t=out:st=${M + F + CONTENIDO}:d=${F},format=yuv420p`, '-c:v', 'libx264', '-crf', '14', '-preset', 'veryfast', '-c:a', 'aac', maestro]);
  assert.equal(g.status, 0, String(g.stderr));
  return maestro;
}
const recortar = (...args) => spawnSync(process.execPath, ['herramientas/recortar-formatos.mjs', ...args, `--carpeta=${dirDeMontaje()}`], { cwd: RAIZ, encoding: 'utf8' });
const duracionDe = (archivo) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', archivo], { encoding: 'utf8' }).stdout.trim());
// brillo medio (0 a 255) del cuadro mas cercano al segundo `t`
const brilloEn = (archivo, t) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', archivo, '-frames:v', '1', '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 20 });
  assert.equal(r.status, 0, String(r.stderr));
  const px = [...r.stdout];
  return px.reduce((s, x) => s + x, 0) / px.length;
};

test('recortar-formatos quita el negro de los margenes de una grabacion hecha con grabar=1 y deja los fundidos: abre y cierra en negro, con contenido en medio, y conserva el audio', { skip: saltar }, () => {
  const r = recortar(grabacionConMargenes(), 'ep');
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const esperado = 2 * F + CONTENIDO + NEGRO.antes + NEGRO.despues; // los dos fundidos, el contenido y un poco de negro de holgura a cada lado
  for (const k of Object.keys(FORMATOS)) {
    const f = join(dirDeMontaje(), `ep_${k}.mp4`), d = duracionDe(f), alAbrir = brilloEn(f, 0);
    assert.ok(Math.abs(d - esperado) < 0.4, `${k}: dura ${d} (esperado ~${esperado})`);
    assert.ok(alAbrir < 30, `${k}: abre en negro (brillo ${alAbrir})`);
    assert.ok(brilloEn(f, d - 0.05) < 30, `${k}: cierra en negro`);
    assert.ok(brilloEn(f, d / 2) > 40, `${k}: en medio hay contenido`);
    const a = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', f], { encoding: 'utf8' });
    assert.equal(a.stdout.trim(), 'aac', `${k}: conserva el audio`);
  }
  assert.match(r.stdout, /negro/i, 'cuenta que recorto');
});

test('recortar-formatos no recorta lo que no tiene negro de margenes (la carta de ajuste, las grabaciones viejas) y lo dice; --manual apaga la deteccion y --inicio sigue mandando', { skip: saltar }, () => {
  const sin = join(dirDeMontaje(), 'sin.mkv');
  const g = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=3840x2160:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '14', '-preset', 'veryfast', sin]);
  assert.equal(g.status, 0, String(g.stderr));
  let r = recortar(sin, 'sin');
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.ok(Math.abs(duracionDe(join(dirDeMontaje(), 'sin_9x16.mp4')) - 2) < 0.3, 'sin negro no se recorta nada');
  assert.match(r.stdout, /no encontr/i, 'avisa que no encontro los margenes');

  r = recortar(grabacionConMargenes(), 'manual', '--manual');
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.ok(Math.abs(duracionDe(join(dirDeMontaje(), 'manual_9x16.mp4')) - TOTAL) < 0.3, '--manual deja la grabacion entera');
  r = recortar(sin, 'inicio', '--manual', '--inicio=1');
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.ok(Math.abs(duracionDe(join(dirDeMontaje(), 'inicio_9x16.mp4')) - 1) < 0.3, '--inicio=1 salta el primer segundo');
});

test('recortar-formatos recorta bien un MKV cuyos tiempos no empiezan en 0 (blackdetect da tiempos absolutos y la duracion de ffprobe no incluye ese desfase)', { skip: saltar }, () => {
  const desfasado = join(dirDeMontaje(), 'desfasado.mkv');
  const g = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', grabacionConMargenes(), '-c', 'copy', '-output_ts_offset', '7', desfasado]);
  assert.equal(g.status, 0, String(g.stderr));
  const empieza = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=start_time', '-of', 'csv=p=0', desfasado], { encoding: 'utf8' }).stdout.trim());
  assert.ok(empieza > 6.5, `precondicion: el archivo de prueba empieza en ${empieza} s y no en 0`);
  const r = recortar(desfasado, 'desfasado');
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const esperado = 2 * F + CONTENIDO + NEGRO.antes + NEGRO.despues;
  const f = join(dirDeMontaje(), 'desfasado_9x16.mp4'), d = duracionDe(f);
  assert.ok(Math.abs(d - esperado) < 0.4, `dura ${d} y deberia durar ~${esperado} (si no recorto los dos lados, el desfase confundio a la deteccion)`);
  assert.ok(brilloEn(f, 0) < 30 && brilloEn(f, d - 0.05) < 30 && brilloEn(f, d / 2) > 40, 'el recorte cae donde toca: abre y cierra en negro con el contenido en medio (-ss tambien cuenta desde el primer cuadro)');
  assert.doesNotMatch(r.stdout, /AVISO/, 'encuentra los dos margenes');
});


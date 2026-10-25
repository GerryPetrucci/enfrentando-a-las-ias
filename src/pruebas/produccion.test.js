import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { argumentosFfmpeg } from '../../herramientas/recortar-formatos.mjs';
import { nombreDeVideo } from '../../herramientas/nombres.mjs';
import { publicacionDePieza, ordenDePublicacion } from '../../web/casino/editorial-paquete.js';
import { crearReproductorDeVoz, leerParametros } from '../../web/casino/escena-config.js';
import { crearSonido } from '../../web/casino/sonido.js';
import { construirPaquete } from '../../web/casino/paquete-textos.js';
import { armarLinea, destacadasDe } from '../../web/casino/lineas.js';
import { guionDePaquete, escribirPaquete } from '../../herramientas/paquete.mjs';
import { jugarMM } from './escena/ayudas-mm.js';
import { organizarGrabaciones } from '../../herramientas/organizar-grabaciones.mjs';

test('la publicacion cambia con hechos de la pieza y no toma mensajes, razones ni rondas futuras', () => {
  const pieza = { id: 'clip-1', tipo: 'clip', parte: 1, grabar: { desde: 2, hasta: 2, url: 'escena.html' } };
  const beats = [{ mano: 2, tipo: 'resultado', lineas: [{ tipo: 'resultado', texto: 'Claude pierde seis fichas.' }, { tipo: 'privado', texto: 'SECRETO' }, { tipo: 'razon', texto: 'RAZON' }] }, { mano: 3, tipo: 'resultado', lineas: [{ tipo: 'resultado', texto: 'FUTURO' }] }];
  const contexto = { beats, nombres: ['Claude', 'GPT'], seed: 123, juego: 'Mayor o menor' };
  const a = publicacionDePieza(pieza, contexto);
  assert.match(a.descripcion, /Claude pierde seis fichas/);
  assert.doesNotMatch(JSON.stringify(a), /SECRETO|RAZON|FUTURO/);
  beats[0].lineas[0].texto = 'GPT recupera cuatro fichas.';
  const b = publicacionDePieza(pieza, contexto);
  assert.notEqual(a.titulo, b.titulo); assert.notEqual(a.descripcion, b.descripcion);
  assert.ok(b.titulo.length <= 100 && b.descripcion.length <= 280);
});

test('la organizacion separa j1 y j2, conserva archivos y rutas del LEEME y es idempotente', async () => {
  const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'produccion-orden-')), serie = join(dir, 'juego', 'serie');
  try {
    for (const estado of ['por-subir', 'subidos']) { mkdirSync(join(serie, estado), { recursive: true }); writeFileSync(join(serie, estado, 'j1_pt1_9x16.mp4'), 'UNO'); writeFileSync(join(serie, estado, 'j2_pt1_9x16.mp4'), 'DOS'); }
    mkdirSync(join(serie, 'paquete-j2'));
    const leeme = join(serie, 'paquete-j2', 'LEEME.md');
    writeFileSync(leeme, 'MIS NOTAS\noriginales/j2_pt1.mkv --carpeta=serie/por-subir');
    const plan = organizarGrabaciones(dir);
    assert.equal(plan.movimientos.length, 4);
    assert.ok(existsSync(join(serie, 'subidos', 'j2_pt1_9x16.mp4')), 'simular no mueve nada');
    organizarGrabaciones(dir, { aplicar: true });
    assert.equal(readFileSync(join(serie, 'subidos', 'j2', 'j2_pt1_9x16.mp4'), 'utf8'), 'DOS');
    assert.equal(readFileSync(join(serie, 'por-subir', 'j1', 'j1_pt1_9x16.mp4'), 'utf8'), 'UNO');
    assert.equal(readFileSync(leeme, 'utf8'), 'MIS NOTAS\noriginales/j2/j2_pt1.mkv --carpeta=serie/por-subir/j2');
    assert.equal(organizarGrabaciones(dir, { aplicar: true }).movimientos.length, 0);
  } finally { assert.ok(dir.startsWith(join(tmpdir(), 'produccion-orden-'))); rmSync(dir, { recursive: true, force: true }); }
});

test('una colision de archivos impide toda la organizacion antes de mover nada', async () => {
  const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'produccion-colision-')), estado = join(dir, 'juego', 'serie', 'por-subir');
  try {
    mkdirSync(join(estado, 'j2'), { recursive: true });
    for (const archivo of ['j1_pt1.mkv', 'j2_pt1.mkv', 'j2/j2_pt1.mkv']) writeFileSync(join(estado, archivo), archivo);
    assert.throws(() => organizarGrabaciones(dir, { aplicar: true }), /Ya existe el destino/);
    assert.ok(existsSync(join(estado, 'j1_pt1.mkv')), 'no se movio ni el primer archivo');
    assert.equal(readFileSync(join(estado, 'j2', 'j2_pt1.mkv'), 'utf8'), 'j2/j2_pt1.mkv');
  } finally { assert.ok(dir.startsWith(join(tmpdir(), 'produccion-colision-'))); rmSync(dir, { recursive: true, force: true }); }
});

test('clips confinados a su parte, cupo configurable y guion con cierre en el mismo orden del LEEME', async () => {
  const partida = await jugarMM(3), beats = await armarLinea('mayormenor', partida);
  const destacadas = await destacadasDe('mayormenor', partida, 40);
  const paquete = construirPaquete({ partida, beats, destacadas, archivo: 'prueba.json', clipsPorParte: [2, 0] });
  const partes = paquete.piezas.filter((p) => p.tipo === 'parte');
  for (const c of paquete.piezas.filter((p) => p.tipo === 'clip')) {
    const p = partes[c.parte - 1];
    assert.equal(c.parte, 1); assert.ok(c.grabar.desde >= p.grabar.desde && c.grabar.hasta <= p.grabar.hasta);
  }
  const orden = ordenDePublicacion(paquete.piezas);
  assert.deepEqual(orden.map((p) => p.id), paquete.ordenPublicacion);
  assert.ok(orden.findIndex((p) => p.id === 'parte-2') > orden.findLastIndex((p) => p.tipo === 'clip' && p.parte === 1));
  const guion = guionDePaquete(paquete, beats, { seed: partida.seed });
  let anterior = -1;
  for (const p of orden) { const i = guion.indexOf(`## ${p.id} ·`); assert.ok(i > anterior); anterior = i; }
  assert.match(guion, /cierre/);
  const t = beats.find((b) => b.tipo !== 'intro' && b.texto).texto;
  assert.ok(guion.includes(t));
  assert.deepEqual(construirPaquete({ partida, beats, clipsPorParte: [5, 1] }).piezas, []);
});

test('el archivo unico y el guion se generan, y los textos de redes anteriores se apartan al regenerar', async () => {
  const { writeFileSync, existsSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'produccion-paquete-'));
  try {
    const partida = await jugarMM(9), beats = await armarLinea('mayormenor', partida);
    const p = construirPaquete({ partida, beats, archivo: 'x.json' });
    escribirPaquete(p, dir, { guion: guionDePaquete(p, beats, { seed: partida.seed }) });
    writeFileSync(join(dir, 'textos', 'parte-1-facebook.txt'), 'MIS NOTAS');
    escribirPaquete(p, dir, { guion: guionDePaquete(p, beats, { seed: partida.seed }) });
    assert.ok(!existsSync(join(dir, 'textos', 'parte-1-facebook.txt')));
    const { readdirSync } = await import('node:fs');
    const archivo = readdirSync(join(dir, 'textos', 'anteriores'))[0];
    assert.equal(readFileSync(join(dir, 'textos', 'anteriores', archivo), 'utf8'), 'MIS NOTAS');
    assert.match(readFileSync(join(dir, 'textos', 'parte-1.txt'), 'utf8'), /^TÍTULO\n[\s\S]*DESCRIPCIÓN\n[\s\S]*COMENTARIO FIJADO/);
  } finally { assert.ok(dir.startsWith(join(tmpdir(), 'produccion-paquete-'))); rmSync(dir, { recursive: true, force: true }); }
});

test('voz y efectos se enrutan a lados opuestos y se libera la fuente al detener', async () => {
  const anterior = globalThis.AudioContext, nodos = [];
  class Contexto {
    destination = {};
    createStereoPanner() { const nodo = { pan: { value: 0 }, connect() {} }; nodos.push(nodo); return nodo; }
    createMediaElementSource() { const nodo = { connect() {}, disconnect() { this.liberado = true; } }; nodos.push(nodo); return nodo; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    resume() { return Promise.resolve(); }
  }
  globalThis.AudioContext = Contexto;
  try {
    const voz = crearReproductorDeVoz(() => ({ play() {}, pause() {} }), { separado: true });
    voz.sonar('a.ogg');
    assert.equal(nodos[0].pan.value, -1);
    voz.detener(); assert.equal(nodos[1].liberado, true);
    const sfx = crearSonido({ separado: true, activo: true });
    await sfx.preparar();
    assert.equal(nodos.at(-1).pan.value, 1);
    assert.equal(leerParametros('?audio=separado').audioSeparado, true);
  } finally { if (anterior === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = anterior; }
});

const ffmpeg = (args) => spawnSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: 8 * 1024 * 1024 });
const hayFfmpeg = ffmpeg(['-version']).status === 0;
test('ffmpeg produce ambas versiones en una pasada: sinvoz conserva el tono de efectos y elimina el de voz', { skip: !hayFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'produccion-audio-')), entrada = join(dir, 'maestra.mkv');
  try {
    const original = ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=25:d=0.4', '-f', 'lavfi', '-i', 'aevalsrc=0.2*sin(2*PI*440*t)|0.2*sin(2*PI*880*t):s=48000:d=0.4', '-c:v', 'libx264', '-c:a', 'pcm_s16le', '-shortest', entrada]);
    assert.equal(original.status, 0, original.stderr?.toString());
    const args = argumentosFfmpeg({ entrada, nombre: 'j1_pt1', carpeta: dir, audioSeparado: true, formatos: { '9x16': { ancho: 320, alto: 180, x: 0, y: 0 } } });
    const salida = ffmpeg(args); assert.equal(salida.status, 0, salida.stderr?.toString());
    const energia = (archivo, frecuencia) => {
      const r = ffmpeg(['-i', archivo, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']);
      assert.equal(r.status, 0, r.stderr?.toString());
      let seno = 0, coseno = 0;
      const n = r.stdout.length / 4;
      for (let i = 0; i < n; i++) { const v = r.stdout.readFloatLE(i * 4), fase = 2 * Math.PI * frecuencia * i / 48000; seno += v * Math.sin(fase); coseno += v * Math.cos(fase); }
      return Math.hypot(seno, coseno) / n;
    };
    const con = join(dir, `${nombreDeVideo('j1_pt1_convoz', '9x16')}.mp4`), sin = join(dir, `${nombreDeVideo('j1_pt1_sinvoz', '9x16')}.mp4`);
    assert.ok(energia(con, 440) > 0.02 && energia(con, 880) > 0.02);
    assert.ok(energia(sin, 880) > 0.02);
    assert.ok(Math.abs(energia(sin, 880) - energia(con, 880)) < 0.005, 'los efectos conservan su nivel en ambas versiones');
    assert.ok(energia(sin, 440) < energia(sin, 880) / 30, 'la voz no se filtra a la version de efectos');
  } finally { assert.ok(dir.startsWith(join(tmpdir(), 'produccion-audio-'))); rmSync(dir, { recursive: true, force: true }); }
});

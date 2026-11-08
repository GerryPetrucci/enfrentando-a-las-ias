// Generador de la voz narradora (herramientas/narrar.mjs): lo puro de el. Piper y ffmpeg no se prueban aqui: se prueban corriendo la herramienta de verdad.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { textoParaVoz, planDeNarracion, carpetaDeVoz, armarVoz, argumentosDePiper, argumentosDeFfmpeg, VOZ } from '../../../herramientas/narrar.mjs';
import { lineaDe, juegosConEscena, armarLinea } from '../../../web/casino/lineas.js';
import { esRutaRelativa, duracionDeBeat } from '../../../web/casino/escena-config.js';
import { urlDeCaptura } from '../../../herramientas/capturar-escena.mjs';
import { jugarLobo } from './ayudas-lobo.js';
// La linea que narra la herramienta: la de Lobo con su tarjeta de arranque delante (lineas.js), de una partida de bots de varias rondas.
const linea = () => armarLinea('lobo', jugarLobo(4));

test('la voz elegida es Piper (decision del usuario, 16 de octubre de 2026) y su nombre tecnico no esta en ningun archivo publico del repo', () => {
  assert.match(VOZ.archivoModelo, /voz-narradora\.onnx$/);
  const nombre = ['es_MX-', 'clau', 'de'].join('');
  const archivos = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter((f) => f && !/\.(png|woff2|ogg|jpg|svg|ico)$/.test(f));
  for (const f of archivos) if (existsSync(f)) assert.ok(!readFileSync(f, 'utf8').includes(nombre), `${f} nombra la voz`);
  assert.match(VOZ.piper, /piper(\.exe)?$/);
});

test('textoParaVoz limpia el texto y aplica el diccionario de pronunciacion palabra por palabra', () => {
  assert.equal(textoParaVoz('  Mano 1  de 16.\nEmpieza   Calculador. '), 'Mano 1 de 16. Empieza Calculador.');
  const pron = [['GPT', 'ge pe té'], ['DeepSeek', 'dip sik']];
  assert.equal(textoParaVoz('GPT duda y DeepSeek se retira. GPTX no cambia.', pron), 'ge pe té duda y dip sik se retira. GPTX no cambia.');
  for (const nada of [null, undefined, '', '   ']) assert.equal(textoParaVoz(nada), '');
  assert.equal(textoParaVoz(7), '7');
});

test('el plan de narracion tiene un audio por momento que se dice en voz alta, con su texto y un nombre de archivo propio', async () => {
  const beats = await linea();
  const plan = planDeNarracion(beats);
  assert.equal(plan.length, beats.filter((b) => textoParaVoz(b.texto)).length);
  assert.ok(plan.length > 20 && plan.length < beats.length, 'los momentos mudos (los mensajes sin texto que decir) no llevan audio');
  assert.equal(new Set(plan.map((p) => p.id)).size, plan.length);
  for (const p of plan) {
    assert.equal(p.archivo, `${p.id}.ogg`);
    assert.ok(p.texto.length > 0 && p.texto === textoParaVoz(p.texto));
    assert.ok(beats.some((b) => b.id === p.id), 'el audio es de un beat que existe');
    assert.ok(esRutaRelativa(p.archivo), p.archivo);
  }
  const mudos = beats.filter((b) => !textoParaVoz(b.texto));
  assert.ok(mudos.length > 0, 'la partida tiene momentos mudos');
  assert.ok(!plan.some((p) => mudos.some((b) => b.id === p.id)), 'un momento mudo no lleva audio');
  assert.ok(plan.some((p) => beats.find((b) => b.id === p.id).tipo === 'intro'), 'la tarjeta de arranque se narra');
  assert.deepEqual(planDeNarracion(null), []);
});

test('la carpeta de la voz sale del archivo y la partida, y es una ruta relativa valida', () => {
  assert.equal(carpetaDeVoz('pruebas/escena-bots.json', 1), 'data/voz/pruebas-escena-bots-p1');
  assert.equal(carpetaDeVoz('2026-10-16-lobo en la aldea.json', 3), 'data/voz/2026-10-16-lobo-en-la-aldea-p3');
  for (const a of ['pruebas/escena-bots.json', 'x.json', 'raro ñandú!.json']) assert.ok(esRutaRelativa(carpetaDeVoz(a, 2)), a);
});

test('voz.json: lo que dura cada audio mas una pausa para respirar, y el archivo dentro de la carpeta', () => {
  const voz = armarVoz([{ id: 'm1-0-apertura', duracionS: 2.3456 }, { id: 'm1-2-anuncio', duracionS: 4 }, { id: 'malo', duracionS: NaN }, { id: 'peor', duracionS: -1 }], { carpeta: 'data/voz/x-p1', pausaMs: 350 });
  assert.deepEqual(voz, {
    'm1-0-apertura': { ms: 2696, archivo: 'data/voz/x-p1/m1-0-apertura.ogg' },
    'm1-2-anuncio': { ms: 4350, archivo: 'data/voz/x-p1/m1-2-anuncio.ogg' },
  });
  assert.equal(armarVoz([{ id: 'a', duracionS: 1 }], { carpeta: 'c' }).a.ms, 1000 + VOZ.pausaMs, 'la pausa por defecto es la de VOZ');
  assert.deepEqual(armarVoz(null, { carpeta: 'c' }), {});
});

test('la escena usa voz.json tal como lo arma el generador: el beat dura lo que dura su audio si es mas largo que su minimo', async () => {
  const beats = await linea();
  const noche = beats.find((b) => b.tipo === 'noche' && b.texto);
  assert.ok(noche.minMs < 6350, 'precondicion: el audio dura mas que su minimo');
  const voz = armarVoz([{ id: noche.id, duracionS: 6 }], { carpeta: 'data/voz/x-p1', pausaMs: 350 });
  assert.equal(duracionDeBeat(noche, voz, 1), 6350);
  assert.equal(duracionDeBeat(noche, voz, 2), 3175);
  assert.ok(esRutaRelativa(voz[noche.id].archivo));
  const corto = armarVoz([{ id: noche.id, duracionS: 0.5 }], { carpeta: 'data/voz/x-p1', pausaMs: 350 });
  assert.equal(duracionDeBeat(noche, corto, 1), noche.minMs, 'un audio mas corto que su minimo no lo acorta');
});

test('los argumentos de Piper y de ffmpeg llevan la voz, el nivel comun (-18 LUFS) y el formato OGG', () => {
  assert.deepEqual(argumentosDePiper({ modelo: 'm.onnx', salida: 's.wav', lengthScale: 1.1 }), ['--model', 'm.onnx', '--output_file', 's.wav', '--length_scale', '1.1']);
  const f = argumentosDeFfmpeg('a.wav', 'a.ogg');
  assert.ok(f.includes('loudnorm=I=-18:TP=-1.5:LRA=7') && f.includes('libvorbis') && f.at(-1) === 'a.ogg' && f[f.indexOf('-i') + 1] === 'a.wav');
});

test('hay una linea de tiempo por juego con escena; un juego sin escena da un error que dice cuales hay', async () => {
  assert.ok(juegosConEscena().includes('lobo'));
  assert.equal(typeof await lineaDe('lobo'), 'function');
  await assert.rejects(() => lineaDe('ausente'), /no hay escena.*"ausente".*lobo/);
  await assert.rejects(() => lineaDe(undefined), /no hay escena/);
});

test('el audio generado no se versiona (data/voz/ esta en .gitignore) y la herramienta de capturas puede probar con voz', () => {
  assert.match(readFileSync(new URL('../../../.gitignore', import.meta.url), 'utf8'), /^data\/voz\/$/m);
  const u = new URL(urlDeCaptura({ base: 'http://x', archivo: 'a.json', formato: '9x16', voz: 'data/voz/x-p1/voz.json' }));
  assert.equal(u.searchParams.get('voz'), 'data/voz/x-p1/voz.json');
  assert.equal(new URL(urlDeCaptura({ base: 'http://x', archivo: 'a.json', formato: '9x16' })).searchParams.has('voz'), false);
});

test('la voz de una partida incluye TODAS las frases del cierre (cada video usa una distinta), con la pronunciacion aplicada', async () => {
  const { planDeCierres, combinarVoz } = await import('../../../herramientas/narrar.mjs');
  const { FRASES_CIERRE } = await import('../../../web/casino/cierre.js');
  const plan = planDeCierres([['IAs', 'i a s']]);
  assert.equal(plan.length, FRASES_CIERRE.length);
  plan.forEach((p, i) => { assert.equal(p.id, `cierre-${i}`); assert.equal(p.archivo, `cierre-${i}.ogg`); assert.equal(p.fuente, FRASES_CIERRE[i], 'la fuente es el texto del beat, sin pronunciacion: asi la escena la reconoce'); });
  assert.ok(plan.some((p) => p.texto !== p.fuente) || FRASES_CIERRE.every((f) => !f.includes('IAs')), 'el texto leido lleva la pronunciacion');
  // --solo-cierres: se agregan a la voz que ya existe sin tocar lo demas
  assert.deepEqual(combinarVoz({ intro: { ms: 1, archivo: 'a' } }, { 'cierre-0': { ms: 2, archivo: 'b' } }), { intro: { ms: 1, archivo: 'a' }, 'cierre-0': { ms: 2, archivo: 'b' } });
  const { planDeVoz } = await import('../../../herramientas/narrar.mjs');
  const beatsEj = [{ id: 'intro', texto: 'Hola.' }, { id: 'mano-1', texto: 'Algo pasa.' }, { id: 'mudo', texto: '' }];
  assert.deepEqual(planDeVoz(beatsEj).map((p) => p.id), ['intro', 'mano-1', ...FRASES_CIERRE.map((_, i) => `cierre-${i}`)], 'la partida y TODAS las frases del cierre (los momentos mudos no llevan voz)');
  assert.deepEqual(planDeVoz(beatsEj, [], { soloCierres: true }).map((p) => p.id), FRASES_CIERRE.map((_, i) => `cierre-${i}`), '--solo-cierres: solo las frases');
  assert.deepEqual(combinarVoz(null, { x: 1 }), { x: 1 });
  assert.deepEqual(combinarVoz({ 'cierre-0': { ms: 1 } }, { 'cierre-0': { ms: 9 } }), { 'cierre-0': { ms: 9 } }, 'lo nuevo reemplaza');
});

test('el servidor local sirve el audio y las fuentes con su tipo (la voz y la escena los piden)', () => {
  const servidor = readFileSync(new URL('../../servidor.js', import.meta.url), 'utf8');
  for (const [ext, tipo] of [['.ogg', 'audio/ogg'], ['.mp3', 'audio/mpeg'], ['.woff2', 'font/woff2']]) assert.ok(servidor.includes(`'${ext}': '${tipo}'`), `${ext} deberia servirse como ${tipo}`);
});

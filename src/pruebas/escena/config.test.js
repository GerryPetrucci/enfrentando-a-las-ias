// Lo puro del reproductor de la escena: parametros de la URL, recorte del clip por manos, duracion de cada beat (con o sin voz) y marcas de tiempo
// para re-doblar. Sin DOM ni navegador.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerParametros, recortarClip, duracionDeBeat, marcarTiempos, hayVoz, etiquetaDeApuesta, entradaDeVoz, resumenDeVoz, fuenteDeVoz, crearReproductorDeVoz } from '../../../web/casino/escena-config.js';
import { construirLineaDeTiempo as lineaMM } from '../../../web/casino/linea-de-tiempo-mayormenor.js';
import { planDeNarracion, armarVoz } from '../../../herramientas/narrar.mjs';
import { jugarMM } from './ayudas-mm.js';
import { POSICION_EN_HOJA } from '../../../web/casino/layout.js';
import { construirLineaDeTiempo } from '../../../web/casino/linea-de-tiempo-duda.js';
import { FORMATOS } from '../../../herramientas/formatos.mjs';
import { jugar, CASOS } from './ayudas.js';

test('los parametros de la URL traen valores por defecto sensatos', () => {
  assert.deepEqual(leerParametros(''), { archivo: null, partida: 1, mano: 1, hasta: Infinity, formato: '9x16', camara: null, sonido: true, vel: 1, razon: false, auto: false, grabar: false, detener: null, limpio: false, voz: null, escala: 'ajustar', gancho: null });
  assert.deepEqual(leerParametros(undefined), leerParametros(''));
});

test('los parametros se leen y se validan: lo ilegible vuelve al valor por defecto, nada lanza', () => {
  const p = leerParametros('?archivo=duda-1.json&partida=3&mano=4&hasta=9&formato=16x9&camara=4&sonido=0&vel=2.5&razon=1&auto=1&limpio=1&voz=voz.json&escala=1');
  assert.deepEqual(p, { archivo: 'duda-1.json', partida: 3, mano: 4, hasta: 9, formato: '16x9', camara: 4, sonido: false, vel: 2.5, razon: true, auto: true, grabar: false, detener: null, limpio: true, voz: 'voz.json', escala: 1, gancho: null });
  assert.equal(leerParametros('formato=hoja').formato, 'hoja');
  for (const [q, esperado] of [
    ['formato=1x1', { formato: '9x16' }], ['formato=4x5', { formato: '9x16' }],
    ['camara=10', { camara: null }], ['camara=-1', { camara: null }], ['camara=x', { camara: null }], ['camara=0', { camara: 0 }], ['camara=9', { camara: 9 }],
    ['ronda=4', { mano: 4 }], ['turno=7', { mano: 7 }], ['turno=0', { mano: 1 }], ['turno=x', { mano: 1 }], ['turno=3&hasta=6', { mano: 3, hasta: 6 }], ['mano=2&turno=9', { mano: 2 }], ['ronda=2&turno=9', { mano: 2 }], ['mano=2&ronda=5', { mano: 2 }], ['ronda=0', { mano: 1 }], ['ronda=3&hasta=6', { mano: 3, hasta: 6 }],
    ['vel=0', { vel: 1 }], ['vel=abc', { vel: 1 }], ['vel=100', { vel: 8 }], ['vel=0.01', { vel: 0.25 }],
    ['partida=0', { partida: 1 }], ['partida=-3', { partida: 1 }], ['partida=x', { partida: 1 }],
    ['mano=0', { mano: 1 }], ['mano=x', { mano: 1 }],
    ['mano=5&hasta=3', { mano: 5, hasta: Infinity }], ['hasta=x', { hasta: Infinity }],
    ['sonido=1', { sonido: true }], ['razon=0', { razon: false }], ['razon=false', { razon: false }], ['auto=', { auto: false }],
    ['escala=x', { escala: 'ajustar' }], ['escala=0', { escala: 'ajustar' }], ['escala=ajustar', { escala: 'ajustar' }],
  ]) {
    const p2 = leerParametros(q);
    for (const [k, v] of Object.entries(esperado)) assert.equal(p2[k], v, `${q}: ${k}`);
  }
});

test('gancho=1 pide el gancho «Próximamente»: sus cortes (unidades, sin repetir, en el orden pedido), la parte que anuncia y de cuantas; lo ilegible vuelve a lo sensato', () => {
  assert.deepEqual(leerParametros('gancho=1&cortes=10,6,14&parte=2&de=2').gancho, { cortes: [10, 6, 14], parte: 2, de: 2 });
  assert.deepEqual(leerParametros('gancho=1&cortes=3').gancho, { cortes: [3], parte: 1, de: 2 }, 'parte y de tienen valor por omision');
  assert.deepEqual(leerParametros('gancho=1&cortes=5,5,x,0,-2,7,,8&parte=0&de=x').gancho, { cortes: [5, 7, 8], parte: 1, de: 2 });
  assert.deepEqual(leerParametros('gancho=1&cortes=1,2,3,4,5,6,7,8,9,10').gancho.cortes, [1, 2, 3, 4, 5, 6, 7, 8], 'a lo mas 8 cortes');
  assert.deepEqual(leerParametros('gancho=1').gancho, { cortes: [], parte: 1, de: 2 }, 'sin cortes la pagina lo dice, no lo adivina');
  for (const q of ['', 'cortes=3', 'gancho=0&cortes=3', 'gancho=false']) assert.equal(leerParametros(q).gancho, null, q);
});

test('el clip por manos recorta los beats y no inventa final ni se cuelga con un rango fuera de la partida', async () => {
  const p = await jugar(...CASOS.retirada);
  const beats = construirLineaDeTiempo(p);
  const ultima = p.rondas.at(-1).mano;
  assert.deepEqual(recortarClip(beats, 1, Infinity), beats, 'todo el rango = todos los beats');
  const medio = recortarClip(beats, 2, 3);
  assert.ok(medio.length > 0 && medio.every((b) => b.mano >= 2 && b.mano <= 3));
  assert.equal(medio[0].tipo, 'apertura', 'un clip empieza al abrir la mano');
  assert.ok(medio.every((b) => b.tipo !== 'final'), 'un clip del medio no lleva el final');
  const hastaElFinal = recortarClip(beats, ultima, ultima);
  assert.equal(hastaElFinal.at(-1).tipo, 'final', 'el clip de la ultima mano si lleva el final');
  assert.deepEqual(recortarClip(beats, ultima + 1, ultima + 5), []);
  assert.deepEqual(recortarClip(beats, 5, 2), []);
  for (const basura of [null, undefined, 'x', 7]) assert.deepEqual(recortarClip(basura, 1, 3), []);
});

test('un beat dura lo que dura su voz si es mas larga que lo minimo, y lo minimo si no hay voz o es mas corta; la velocidad lo acorta', () => {
  const beat = { id: 'm1-3-anuncio', minMs: 2000 };
  assert.equal(duracionDeBeat(beat, null, 1), 2000);
  assert.equal(duracionDeBeat(beat, {}, 1), 2000);
  assert.equal(duracionDeBeat(beat, { 'm1-3-anuncio': { ms: 1500 } }, 1), 2000, 'voz mas corta: manda el minimo');
  assert.equal(duracionDeBeat(beat, { 'm1-3-anuncio': { ms: 3500 } }, 1), 3500, 'voz mas larga: el beat espera a la voz');
  assert.equal(duracionDeBeat(beat, { 'm1-3-anuncio': { ms: 3500 } }, 2), 1750);
  assert.equal(duracionDeBeat(beat, null, 4), 500);
  for (const mala of [{ 'm1-3-anuncio': { ms: -5 } }, { 'm1-3-anuncio': { ms: 'x' } }, { 'm1-3-anuncio': null }, { 'm1-3-anuncio': {} }, 'texto', 7]) {
    assert.equal(duracionDeBeat(beat, mala, 1), 2000, `voz ilegible: ${JSON.stringify(mala)}`);
  }
  assert.equal(duracionDeBeat(beat, null, 0), 2000, 'velocidad ilegible vale 1');
  assert.equal(duracionDeBeat(beat, null, NaN), 2000);
  assert.equal(hayVoz({ a: { ms: 100 } }), true);
  for (const nada of [null, undefined, {}, 'x', 7]) assert.equal(hayVoz(nada), false);
});

test('las marcas de tiempo (para re-doblar) son contiguas, parten de cero y suman lo que dura el clip', async () => {
  const p = await jugar(...CASOS.retirada);
  const beats = construirLineaDeTiempo(p);
  const voz = { [beats[3].id]: { ms: 9000 } };
  const marcas = marcarTiempos(beats, voz, 1);
  assert.equal(marcas.length, beats.length);
  assert.equal(marcas[0].inicioMs, 0);
  marcas.forEach((m, i) => {
    assert.equal(m.id, beats[i].id);
    assert.equal(m.finMs - m.inicioMs, duracionDeBeat(beats[i], voz, 1), m.id);
    if (i > 0) assert.equal(m.inicioMs, marcas[i - 1].finMs, 'sin huecos ni solapes');
    assert.deepEqual(Object.keys(m).sort(), ['finMs', 'id', 'inicioMs', 'mano', 'texto', 'tipo']);
  });
  assert.equal(marcas[3].finMs - marcas[3].inicioMs, 9000);
  const rapido = marcarTiempos(beats, null, 2);
  assert.ok(rapido.at(-1).finMs < marcarTiempos(beats, null, 1).at(-1).finMs);
  assert.deepEqual(marcarTiempos(null, null, 1), []);
});

test('la posicion de cada formato en la hoja maestra de la escena es la de herramientas/formatos.mjs', () => {
  for (const f of ['9x16', '16x9']) assert.deepEqual(POSICION_EN_HOJA[f], { x: FORMATOS[f].x, y: FORMATOS[f].y }, f);
});

import { listaDeArchivos, catalogarPartidas, primeraValida } from '../../../web/casino/escena-config.js';
import { PRUDENTES } from './ayudas.js';

test('listaDeArchivos separa por coma, recorta los espacios y quita vacios y repetidos', () => {
  assert.deepEqual(listaDeArchivos('a.json, b.json,,a.json '), ['a.json', 'b.json']);
  assert.deepEqual(listaDeArchivos('pruebas/x.json'), ['pruebas/x.json']);
  for (const nada of [null, undefined, '', '  ,  ', 7]) assert.deepEqual(listaDeArchivos(nada), []);
});

test('catalogarPartidas: una entrada por partida de cada archivo; solo valen las de Duda y apuesta que tienen rondas, y las demas dicen por que no', async () => {
  const p1 = await jugar(1), p2 = await jugar(2, PRUDENTES);
  const cargados = [
    { nombre: 'a.json', datos: { juego: p1.juego, partidas: [p1, p2] } },
    { nombre: 'dilema.json', datos: { juego: { id: 'dilema' }, partidas: [{ jugadores: [{ nombre: 'A' }, { nombre: 'B' }], rondas: [{ mano: 1 }] }] } },
    { nombre: 'roto.json', datos: null, error: 'JSON invalido' },
    { nombre: 'vacio.json', datos: { partidas: [] } },
    { nombre: 'sinrondas.json', datos: { juego: { id: 'dudaapuesta' }, partidas: [{ jugadores: [], rondas: [] }] } },
    { nombre: 'sinpartidas.json', datos: { algo: 1 } },
  ];
  const c = catalogarPartidas(cargados);
  assert.equal(c.length, 7);
  assert.equal(new Set(c.map((e) => e.clave)).size, 7, 'claves unicas');
  assert.deepEqual(c.slice(0, 2).map((e) => [e.clave, e.archivo, e.numero, e.valida]), [['a.json#1', 'a.json', 1, true], ['a.json#2', 'a.json', 2, true]]);
  assert.equal(c[0].partida, p1);
  assert.deepEqual(c.slice(0, 3).map((e) => e.juego), ['dudaapuesta', 'dudaapuesta', 'dilema']);
  const manos = Math.max(...p1.rondas.map((r) => r.mano));
  assert.equal(c[0].manos, manos);
  assert.equal(c[0].titulo, `a.json · Partida 1 — Calculador vs Farolero vs Retador vs Prudente · ${manos} manos`);
  assert.match(c[1].titulo, /Partida 2 — Prudente vs Prudente vs Prudente vs Prudente/);
  const [sin, roto, vacio, sinRondas, sinPartidas] = c.slice(2);
  assert.deepEqual([sin.valida, sin.partida], [false, null]);
  assert.match(sin.motivo, /dilema/);
  assert.match(roto.motivo, /JSON invalido/);
  assert.match(vacio.motivo, /no trae partidas/);
  assert.match(sinPartidas.motivo, /no trae partidas/);
  assert.match(sinRondas.motivo, /sin rondas/);
  for (const e of [sin, roto, vacio, sinRondas, sinPartidas]) assert.equal(e.valida, false, e.clave);
  assert.deepEqual(catalogarPartidas(null), []);
  assert.deepEqual(catalogarPartidas([null, 7, {}]).map((e) => e.valida), [false, false, false], 'entradas basura no lanzan');
});

test('catalogarPartidas marca las partidas cortadas', async () => {
  const corta = await jugar(3, undefined, { maxRondas: 10 });
  const [e] = catalogarPartidas([{ nombre: 'c.json', datos: { juego: corta.juego, partidas: [corta] } }]);
  assert.equal(e.valida, true);
  assert.match(e.titulo, / · cortada$/);
});

test('primeraValida elige la partida pedida si sirve y, si no, la primera que sirva', async () => {
  const p = await jugar(1);
  const c = catalogarPartidas([
    { nombre: 'otro.json', datos: { juego: { id: 'dilema' }, partidas: [{ rondas: [{}] }] } },
    { nombre: 'a.json', datos: { juego: p.juego, partidas: [p, p] } },
    { nombre: 'b.json', datos: { juego: p.juego, partidas: [p] } },
  ]);
  assert.equal(primeraValida(c).clave, 'a.json#1');
  assert.equal(primeraValida(c, { archivo: 'a.json', numero: 2 }).clave, 'a.json#2');
  assert.equal(primeraValida(c, { archivo: 'b.json', numero: 1 }).clave, 'b.json#1');
  assert.equal(primeraValida(c, { archivo: 'otro.json', numero: 1 }).clave, 'a.json#1', 'la pedida no sirve: la primera valida');
  assert.equal(primeraValida(c, { archivo: 'a.json', numero: 9 }).clave, 'a.json#1');
  assert.equal(primeraValida([]), null);
  assert.equal(primeraValida(null), null);
  assert.equal(primeraValida(c.slice(0, 1)), null);
});

test('el texto de la caja de la apuesta: una apuesta del juego no se le atribuye a la IA', () => {
  assert.deepEqual(etiquetaDeApuesta({ reemplazo: false }, 'Claude'), { titulo: 'Claude apuesta' });
  assert.deepEqual(etiquetaDeApuesta({ reemplazo: true }, 'Caido'), { titulo: 'El juego apuesta por Caido' });
  for (const raro of [null, undefined, {}, 7]) assert.equal(typeof etiquetaDeApuesta(raro, 'X').titulo, 'string');
});

test('la voz solo vale para el beat cuyo texto se narro: un voz.json con otra partida no suena ni cambia los tiempos', async () => {
  const p1 = await jugarMM(1), p2 = await jugarMM(2);
  const b1 = lineaMM(p1), b2 = lineaMM(p2);
  // los ids de Mayor o menor no dependen de la partida: el mismo id existe en las dos
  assert.ok(b1.filter((b) => b2.some((x) => x.id === b.id)).length > 10, 'precondicion: hay ids compartidos');
  const resultados = planDeNarracion(b1).map((x) => ({ id: x.id, duracionS: 30, fuente: x.fuente }));
  const voz1 = armarVoz(resultados, { carpeta: 'data/voz/x-p1' });
  // la misma partida: toda la voz sirve
  const propia = resumenDeVoz(b1, voz1);
  assert.equal(propia.desacordes, 0);
  assert.equal(propia.usados, resultados.length);
  for (const b of b1) if (voz1[b.id]) assert.deepEqual(entradaDeVoz(voz1, b), voz1[b.id]);
  // otra partida: lo que dice distinto no se usa (dura su minimo y no suena), lo que dice igual si
  const ajena = resumenDeVoz(b2, voz1);
  assert.ok(ajena.desacordes > 0, 'hay momentos con otro texto');
  let distintos = 0;
  for (const b of b2) {
    const e = entradaDeVoz(voz1, b);
    const mismoTexto = voz1[b.id] && voz1[b.id].fuente === fuenteDeVoz(b.texto);
    if (voz1[b.id] && !mismoTexto) { distintos++; assert.equal(e, null, b.id); assert.equal(duracionDeBeat(b, voz1, 1), b.minMs, `${b.id}: dura su minimo`); }
    if (mismoTexto) assert.deepEqual(e, voz1[b.id], b.id);
  }
  assert.equal(distintos, ajena.desacordes);
});

test('una voz sin fuente (escrita a mano o de antes) sigue valiendo; la fuente ignora espacios y saltos; basura no lanza', () => {
  const beat = { id: 'a', texto: '  Hola   mundo\n', minMs: 1000 };
  assert.deepEqual(entradaDeVoz({ a: { ms: 5000, archivo: 'x/a.ogg' } }, beat), { ms: 5000, archivo: 'x/a.ogg' });
  assert.deepEqual(entradaDeVoz({ a: { ms: 5000, archivo: 'x/a.ogg', fuente: 'Hola mundo' } }, beat).ms, 5000);
  assert.equal(entradaDeVoz({ a: { ms: 5000, archivo: 'x/a.ogg', fuente: 'Otra cosa' } }, beat), null);
  for (const voz of [null, undefined, 7, 'x', [], { a: null }, { a: 3 }, JSON.parse('{"__proto__": {"ms": 9}}')]) assert.equal(entradaDeVoz(voz, beat), null);
  assert.equal(entradaDeVoz({ a: { ms: 1 } }, null), null);
  assert.deepEqual(resumenDeVoz(null, null), { usados: 0, desacordes: 0 });
});

test('dividirEnDos parte una partida en dos clips de rondas contiguos que cubren todo, con duraciones parecidas; el final va en la segunda parte', async () => {
  const { dividirEnDos, recortarClip, duracionDeBeat } = await import('../../../web/casino/escena-config.js');
  const { construirLineaDeTiempo: lineaFuga } = await import('../../../web/casino/linea-de-tiempo-fuga.js');
  const { construirLineaDeTiempo: lineaSub } = await import('../../../web/casino/linea-de-tiempo-subasta.js');
  const { jugarFuga } = await import('./ayudas-fuga.js');
  const { jugarSub } = await import('./ayudas-sub.js');
  for (const beats of [lineaFuga(await jugarFuga(1)), lineaFuga(await jugarFuga(3, ['azar', 'azar'])), lineaSub(await jugarSub(2))]) {
    const d = dividirEnDos(beats);
    const manos = [...new Set(beats.map((b) => b.mano))];
    assert.equal(d.parte1.mano, manos[0]);
    assert.equal(d.parte2.hasta, manos.at(-1));
    assert.equal(d.parte2.mano, d.parte1.hasta + 1, 'las dos partes son contiguas');
    assert.equal(recortarClip(beats, d.parte1.mano, d.parte1.hasta).length + recortarClip(beats, d.parte2.mano, d.parte2.hasta).length, beats.length, 'no se pierde ni se repite un beat');
    assert.ok(recortarClip(beats, d.parte2.mano, d.parte2.hasta).some((b) => b.tipo === 'final'), 'el final queda en la segunda parte');
    const ms = (a, b) => recortarClip(beats, a, b).reduce((s, x) => s + duracionDeBeat(x, null, 1), 0);
    assert.equal(d.parte1.ms, ms(d.parte1.mano, d.parte1.hasta));
    assert.equal(d.parte2.ms, ms(d.parte2.mano, d.parte2.hasta));
    const mayorMano = Math.max(...manos.map((m) => ms(m, m)));
    assert.ok(Math.abs(d.parte1.ms - d.parte2.ms) <= mayorMano, 'la division es la mas pareja que permiten las rondas enteras');
  }
  assert.equal(dividirEnDos([]), null);
  assert.equal(dividirEnDos(null), null);
  assert.equal(dividirEnDos([{ mano: 1, tipo: 'apertura', minMs: 1000, texto: '' }]), null, 'con una sola ronda no hay como partir');
});

// Un audio falso: anota lo que le hacen. `play` puede devolver una promesa rechazada.
const audioFalso = (src, { playFalla = false } = {}) => ({ src, playbackRate: 1, pausado: false, jugado: false, pause() { this.pausado = true; }, play() { this.jugado = true; return playFalla ? Promise.reject(new Error('bloqueado')) : Promise.resolve(); } });

test('el reproductor de voz: sonar() corta la voz anterior, detener() pausa la actual y la velocidad llega al audio', () => {
  const creados = [];
  const voz = crearReproductorDeVoz((src) => { const a = audioFalso(src); creados.push(a); return a; });
  voz.sonar('a.ogg', 2);
  assert.equal(creados[0].jugado, true);
  assert.equal(creados[0].playbackRate, 2);
  voz.sonar('b.ogg', 1);
  assert.equal(creados[0].pausado, true, 'la anterior se corta al sonar la siguiente');
  assert.equal(creados[1].pausado, false);
  voz.detener();
  assert.equal(creados[1].pausado, true, 'detener pausa la que suena');
  assert.doesNotThrow(() => voz.detener(), 'detener sin nada sonando no hace nada');
});

test('el reproductor de voz no propaga errores: ni de la fabrica, ni de play() (el navegador puede bloquear el audio)', async () => {
  const quienLanza = crearReproductorDeVoz(() => { throw new Error('sin audio'); });
  assert.doesNotThrow(() => quienLanza.sonar('a.ogg', 1));
  const bloqueado = crearReproductorDeVoz((src) => audioFalso(src, { playFalla: true }));
  assert.doesNotThrow(() => bloqueado.sonar('a.ogg', 1));
  await new Promise((listo) => setImmediate(listo)); // si la promesa rechazada no estuviera atendida, Node la reportaria como error sin atender
  assert.doesNotThrow(() => bloqueado.detener());
});

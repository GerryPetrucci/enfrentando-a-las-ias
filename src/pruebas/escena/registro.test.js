// El registro de escenas (web/casino/lineas.js): que juegos tienen escena de casino y que sabe la pagina de cada uno.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { juegosConEscena, escenaDe, lineaDe, motivoDeNoReproducible } from '../../../web/casino/lineas.js';
import { catalogarPartidas } from '../../../web/casino/escena-config.js';
import { jugarMM } from './ayudas-mm.js';
import { jugarSol } from './ayudas-sol.js';
import { jugarTD } from './ayudas-td.js';
import { jugarSub } from './ayudas-sub.js';
import { jugarFuga } from './ayudas-fuga.js';
import { jugarLobo } from './ayudas-lobo.js';
import { jugarConqBots, ESCENARIOS } from './ayudas-conq.js';

test('el registro dice de cada juego con escena su nombre, cuantos jugadores, la camara por defecto y la unidad de un clip', () => {
  assert.ok(juegosConEscena().includes('dudaapuesta'));
  const e = escenaDe('dudaapuesta');
  assert.equal(e.nombre, 'Duda y apuesta');
  assert.equal(e.jugadores, 4);
  assert.equal(e.camaraPorDefecto, 2);
  assert.equal(e.unidad, 'mano');
  assert.equal(typeof e.linea, 'function');
  assert.equal(typeof e.mesa, 'function');
});

test('todos los juegos registrados traen sus datos completos y una camara por defecto que no pasa de sus jugadores', () => {
  for (const id of juegosConEscena()) {
    const e = escenaDe(id);
    assert.ok(typeof e.nombre === 'string' && e.nombre.length > 0, id);
    assert.ok(Number.isInteger(e.jugadores) && e.jugadores >= 2 && e.jugadores <= 12, `${id}: jugadores`);
    assert.ok(Number.isInteger(e.camaraPorDefecto) && e.camaraPorDefecto >= 0 && e.camaraPorDefecto <= e.jugadores, `${id}: camara por defecto`);
    assert.ok(['mano', 'ronda', 'turno'].includes(e.unidad), `${id}: unidad`);
  }
});

test('un juego sin escena da un error que dice cuales hay', async () => {
  assert.throws(() => escenaDe('dilema'), /no hay escena.*"dilema".*dudaapuesta/);
  for (const raro of [undefined, null, '', 7, 'toString', '__proto__']) assert.throws(() => escenaDe(raro), /no hay escena/, String(raro));
  await assert.rejects(() => lineaDe('dilema'), /no hay escena/);
});

test('el catalogo de partidas usa el registro: un juego registrado vale y uno sin escena no, diciendo por que', async () => {
  // Triple dado exige los datos que usa su escena (comprobar en lineas.js): su partida de juguete trae un registro de prediccion completo; la Guerra de territorios, una partida real con su mapa
  const real = await jugarConqBots(ESCENARIOS[0].seed, ESCENARIOS[0].bots);
  const partida = (id) => (id === 'lobo' ? jugarLobo() : id === 'conquista' ? real : { juego: { id }, jugadores: [{ nombre: 'A' }, { nombre: 'B' }], rondas: [id === 'tripledado' ? { fase: 'prediccion', oculto: { tarjetas: [] }, lanzamiento: { blancos: [] } } : id === 'subasta' ? { subasta: 1, oculto: { apuestas: [], bancos: [] } } : id === 'fuga' ? { ronda: 1, oculto: { alarmaAntes: 0, cohesionAntes: 0, fallo: [0, 0] }, ilegibles: [[], []] } : { mano: 1 }] });
  const c = catalogarPartidas([
    ...juegosConEscena().map((id) => ({ nombre: `${id}.json`, datos: { partidas: [partida(id)] } })),
    { nombre: 'dilema.json', datos: { partidas: [partida('dilema')] } },
  ]);
  for (const e of c.filter((x) => x.archivo !== 'dilema.json')) assert.equal(e.valida, true, e.archivo);
  const sin = c.find((x) => x.archivo === 'dilema.json');
  assert.equal(sin.valida, false);
  assert.match(sin.motivo, /dilema/);
  assert.equal(sin.juego, 'dilema');
});

test('la linea de tiempo de cada juego registrado exporta lo que la herramienta de capturas necesita: construirla y comprobar el estado de su escena', async () => {
  for (const id of juegosConEscena()) {
    const linea = await escenaDe(id).linea();
    for (const f of ['construirLineaDeTiempo', 'beatsDeEstado', 'erroresDeEstado']) assert.equal(typeof linea[f], 'function', `${id}: falta ${f}`);
    assert.deepEqual(linea.beatsDeEstado(null, 3), [], `${id}: beatsDeEstado con basura no lanza`);
    assert.ok(linea.erroresDeEstado(null, { id: 'x' }).length > 0, `${id}: una escena que no informa su estado es un error`);
  }
});

test('la lista cuenta las rondas de una partida real de Mayor o menor (sus registros traen ronda, no mano) y usa la palabra de su unidad', async () => {
  const p = await jugarMM(1);
  const [e] = catalogarPartidas([{ nombre: 'mm.json', datos: { partidas: [p] } }]);
  assert.equal(e.valida, true);
  assert.equal(e.manos, p.rondas.at(-1).ronda);
  assert.ok(e.manos > 1);
  assert.match(e.titulo, new RegExp(` · ${e.manos} rondas`));
  const una = structuredClone(p); una.rondas = una.rondas.slice(0, 1);
  assert.match(catalogarPartidas([{ nombre: 'mm.json', datos: { partidas: [una] } }])[0].titulo, / · 1 ronda$/);
});

test('El numero solitario esta registrado: cinco jugadores, camara 2, unidad ronda; la lista cuenta sus 12 rondas (dos registros por ronda)', async () => {
  const e = escenaDe('solitario');
  assert.deepEqual([e.nombre, e.jugadores, e.camaraPorDefecto, e.unidad], ['El número solitario', 5, 2, 'ronda']);
  const p = await jugarSol(1);
  const [entrada] = catalogarPartidas([{ nombre: 'sol.json', datos: { partidas: [p] } }]);
  assert.equal(entrada.valida, true);
  assert.equal(entrada.manos, 12);
  assert.match(entrada.titulo, / · 12 rondas$/);
  assert.equal(typeof (await lineaDe('solitario')), 'function');
});

test('Triple dado esta registrado: cuatro jugadores, camara 2, unidad ronda; la lista cuenta sus 4 rondas (16 registros)', async () => {
  const e = escenaDe('tripledado');
  assert.deepEqual([e.nombre, e.jugadores, e.camaraPorDefecto, e.unidad], ['Triple dado', 4, 2, 'ronda']);
  const p = await jugarTD(1);
  const [entrada] = catalogarPartidas([{ nombre: 'td.json', datos: { partidas: [p] } }]);
  assert.equal(entrada.valida, true);
  assert.equal(entrada.manos, 4);
  assert.match(entrada.titulo, / · 4 rondas$/);
  assert.equal(typeof (await lineaDe('tripledado')), 'function');
});

test('una partida de Triple dado guardada con el motor anterior (sin doceavos ni datos de los dados ocultos) sale apagada en la lista con el motivo "formato anterior"', async () => {
  const p = await jugarTD(1);
  const buena = catalogarPartidas([{ nombre: 'td.json', datos: { partidas: [p] } }])[0];
  assert.equal(buena.valida, true);
  for (const quitar of [(x) => { for (const r of x.rondas) delete r.puntosD; }, (x) => { for (const r of x.rondas) if (r.oculto) delete r.oculto.sinUsar; }, (x) => { for (const r of x.rondas) delete r.combos; }]) {
    const vieja = structuredClone(p); quitar(vieja);
    const e = catalogarPartidas([{ nombre: 'vieja.json', datos: { partidas: [vieja] } }])[0];
    assert.equal(e.valida, false);
    assert.match(e.motivo, /formato anterior/);
    assert.equal(e.partida, null);
  }
  // un juego sin comprobacion de formato sigue valiendo como antes
  const sol = catalogarPartidas([{ nombre: 'sol.json', datos: { partidas: [await jugarSol(1)] } }])[0];
  assert.equal(sol.valida, true);
});

test('Subasta de tiempo esta registrada: cinco jugadores, sin camara, unidad ronda; la lista cuenta sus 19 subastas', async () => {
  const e = escenaDe('subasta');
  assert.deepEqual([e.nombre, e.jugadores, e.camaraPorDefecto, e.unidad], ['Subasta de tiempo', 5, 0, 'ronda']);
  const p = await jugarSub(1);
  const [entrada] = catalogarPartidas([{ nombre: 'sub.json', datos: { partidas: [p] } }]);
  assert.equal(entrada.valida, true);
  assert.equal(entrada.manos, 19);
  assert.match(entrada.titulo, / · 19 rondas$/);
  assert.equal(typeof (await lineaDe('subasta')), 'function');
});

test('una partida de Subasta sin los datos ocultos de las apuestas (guardada con un motor anterior) sale apagada con el motivo "formato anterior"', async () => {
  const p = structuredClone(await jugarSub(1));
  for (const r of p.rondas) delete r.oculto;
  const e = catalogarPartidas([{ nombre: 'vieja.json', datos: { partidas: [p] } }])[0];
  assert.equal(e.valida, false);
  assert.match(e.motivo, /formato anterior/);
});

test('La Fuga esta registrada: dos jugadores, sin camara, unidad ronda; la lista cuenta sus 9 situaciones, y la serie (dos partidas) aparece como dos entradas', async () => {
  const e = escenaDe('fuga');
  assert.deepEqual([e.nombre, e.jugadores, e.camaraPorDefecto, e.unidad], ['La Fuga', 2, 0, 'ronda']);
  const a = await jugarFuga(1), b = await jugarFuga(1, ['traidor', 'tomaydaca']);
  const lista = catalogarPartidas([{ nombre: 'fuga.json', datos: { partidas: [a, b] } }]);
  assert.equal(lista.length, 2);
  assert.ok(lista.every((x) => x.valida === true));
  assert.equal(lista[0].manos, a.rondas.length);
  assert.match(lista[0].titulo, new RegExp(` · ${a.rondas.length} rondas$`));
  assert.equal(typeof (await lineaDe('fuga')), 'function');
});

test('una partida de La Fuga guardada con el motor anterior (sin la alarma de antes, el riesgo real ni los campos ilegibles) sale apagada con el motivo "formato anterior"', async () => {
  const p = await jugarFuga(1);
  assert.equal(catalogarPartidas([{ nombre: 'fuga.json', datos: { partidas: [p] } }])[0].valida, true);
  for (const quitar of [(x) => { for (const r of x.rondas) delete r.oculto.alarmaAntes; }, (x) => { for (const r of x.rondas) delete r.oculto.cohesionAntes; }, (x) => { for (const r of x.rondas) delete r.oculto.fallo; }, (x) => { for (const r of x.rondas) delete r.ilegibles; }]) {
    const vieja = structuredClone(p); quitar(vieja);
    const e = catalogarPartidas([{ nombre: 'vieja.json', datos: { partidas: [vieja] } }])[0];
    assert.equal(e.valida, false);
    assert.match(e.motivo, /formato anterior/);
  }
});

test('Guerra de territorios esta registrada: cinco jugadores, sin camara, unidad turno; la lista cuenta sus turnos y la palabra "turnos"', async () => {
  const e = escenaDe('conquista');
  assert.deepEqual([e.nombre, e.jugadores, e.camaraPorDefecto, e.unidad], ['Guerra de territorios', 5, 0, 'turno']);
  assert.equal(typeof e.linea, 'function');
  assert.equal(typeof e.mesa, 'function');
  const p = await jugarConqBots(ESCENARIOS[1].seed, ESCENARIOS[1].bots);
  const [entrada] = catalogarPartidas([{ nombre: 'guerra.json', datos: { partidas: [p] } }]);
  assert.equal(entrada.valida, true, entrada.motivo);
  assert.equal(entrada.manos, p.rondas.length);
  assert.match(entrada.titulo, new RegExp(` · ${p.rondas.length} turnos$`));
  assert.equal(typeof (await lineaDe('conquista')), 'function');
});

test('una partida de Guerra de territorios sin mapa, con un mapa roto o con combates sin bandos (motor anterior) sale apagada con "formato anterior"; los combates sin bandos solo importan si hay combates', async () => {
  const p = await jugarConqBots(ESCENARIOS[0].seed, ESCENARIOS[0].bots);
  assert.equal(motivoDeNoReproducible('conquista', p), null);
  const viejas = [
    (x) => { delete x.mapa; },
    (x) => { x.mapa = { ancho: 3, alto: 3 }; },
    (x) => { x.mapa.terreno = x.mapa.terreno.slice(1); },
    (x) => { for (const r of x.rondas) for (const c of r.combates ?? []) delete c.bandos; },
    (x) => { const c = x.rondas.flatMap((r) => r.combates ?? [])[0]; c.bandos = 'x'; },
    (x) => { x.rondas[0].combates = { a: 1 }; }, // no es una lista: sale apagada y no tumba la lista de partidas
  ];
  for (const [i, quitar] of viejas.entries()) {
    const vieja = structuredClone(p); quitar(vieja);
    const e = catalogarPartidas([{ nombre: 'vieja.json', datos: { partidas: [vieja] } }])[0];
    assert.equal(e.valida, false, `caso ${i}`);
    assert.match(e.motivo, /formato anterior/, `caso ${i}`);
    assert.equal(e.partida, null);
  }
  // un turno sin combates no necesita bandos: quitar los combates de TODOS los turnos no apaga la partida
  const sinCombates = structuredClone(p);
  for (const r of sinCombates.rondas) r.combates = [];
  assert.equal(motivoDeNoReproducible('conquista', sinCombates), null);
  for (const raro of [null, undefined, 7, {}]) assert.equal(typeof motivoDeNoReproducible('conquista', raro), 'string');
});

test('motivoDeNoReproducible dice por que una partida no se puede reproducir: otro juego, sin rondas, formato anterior; una buena da null', async () => {
  const buena = await jugarSub(1);
  assert.equal(motivoDeNoReproducible('subasta', buena), null);
  assert.match(motivoDeNoReproducible('dilema', buena), /dilema.*no tiene escena/);
  assert.match(motivoDeNoReproducible(undefined, buena), /otro juego.*no tiene escena/);
  assert.equal(motivoDeNoReproducible('subasta', { ...buena, rondas: [] }), 'sin rondas');
  const vieja = structuredClone(buena);
  for (const r of vieja.rondas) delete r.oculto;
  assert.match(motivoDeNoReproducible('subasta', vieja), /formato anterior/);
  for (const raro of [null, undefined, 7, {}]) assert.equal(typeof motivoDeNoReproducible('subasta', raro), 'string');
});

test('narrar.mjs, capturar-escena.mjs y partes.mjs se niegan con "formato anterior" ante una partida que la escena no puede reproducir', async () => {
  const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));
  const vieja = structuredClone(await jugarSub(1));
  for (const r of vieja.rondas) delete r.oculto;
  const carpeta = mkdtempSync(join(tmpdir(), 'vieja-'));
  try {
    const archivo = join(carpeta, 'vieja.json');
    writeFileSync(archivo, JSON.stringify({ juego: vieja.juego, partidas: [vieja] }));
    const falso = process.execPath; // existe: pasa las comprobaciones de Piper y de Chrome; la herramienta debe negarse antes de usarlos
    const herramientas = [['narrar.mjs', [`--piper=${falso}`, `--modelo=${falso}`]], ['capturar-escena.mjs', [`--chrome=${falso}`]], ['partes.mjs', []]];
    for (const [herramienta, extra] of herramientas) {
      // cwd en la raiz del repo, como las demas pruebas de herramientas: si la comprobacion faltara, lo que la herramienta escribiera caeria ahi y no en el directorio de quien corra la suite
      const r = spawnSync(process.execPath, [join(RAIZ, 'herramientas', herramienta), `--archivo=${archivo}`, ...extra], { encoding: 'utf8', timeout: 20000, cwd: RAIZ });
      assert.equal(r.status, 1, `${herramienta}: ${r.error ?? ''}${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /formato anterior/, herramienta);
    }
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
});

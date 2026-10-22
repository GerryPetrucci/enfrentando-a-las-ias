// Los datos y las partidas de ejemplo de la escena de la Guerra de territorios (web/casino/conquista-datos.js y src/pruebas/escena/ayudas-conq.js). Sin DOM ni red.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESCENARIOS, ESCENARIOS_NECESARIOS, partidasDeEjemplo, escenariosDe, jugarConqBots, jugarConqConCaido } from './ayudas-conq.js';
import * as web from '../../../web/casino/conquista-datos.js';
import * as motor from '../../juegos/conquista/constantes.js';
import { crearMapa, serializarMapa, restaurarMapa, BIOMAS } from '../../mapa.js';
import { crearEstado, instantanea } from '../../juegos/conquista/estado.js';
import { crearRng } from '../../rng.js';
import { nuevoEstado, contexto, fijarTropas } from '../conquista/ayudas.js';

test('las partidas de ejemplo son reales del motor y entre todas cubren los escenarios que necesita la escena', async () => {
  const partidas = await partidasDeEjemplo();
  assert.equal(partidas.length, ESCENARIOS.length);
  const vistos = new Set();
  partidas.forEach((p, i) => {
    const cubre = escenariosDe(p);
    for (const c of ESCENARIOS[i].cubre) assert.ok(cubre.has(c), `${ESCENARIOS[i].id} ya no cubre "${c}": el motor cambio, hay que volver a buscar los seeds`);
    cubre.forEach((c) => vistos.add(c));
    assert.ok(Array.isArray(p.rondas) && p.rondas.length > 0 && p.mapa && p.mapa.bioma, `${ESCENARIOS[i].id}: no trae rondas y mapa`);
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(p))).length, JSON.stringify(p).length, 'la partida se guarda sin perder nada');
  });
  for (const necesario of ESCENARIOS_NECESARIOS) assert.ok(vistos.has(necesario), `ninguna partida de ejemplo cubre "${necesario}"`);
});

test('las partidas de ejemplo son deterministas (mismo seed y bots, mismo JSON salvo la duracion)', async () => {
  const sinTiempo = ({ duracionMs, ...resto }) => resto;
  const [a] = await partidasDeEjemplo();
  const b = await jugarConqBots(ESCENARIOS[0].seed, ESCENARIOS[0].bots);
  assert.deepEqual(sinTiempo(b), sinTiempo(a));
});

test('cada llamada recibe su propia copia de la partida: estropear una no afecta a la siguiente', async () => {
  const { seed, bots } = ESCENARIOS[0];
  const a = await jugarConqBots(seed, bots);
  const turnos = a.rondas.length;
  a.rondas.length = 0; a.mapa.bioma = 'roto';
  const b = await jugarConqBots(seed, bots);
  assert.equal(b.rondas.length, turnos);
  assert.notEqual(b.mapa.bioma, 'roto');
});

test('jugarConqBots corre de 2 a 5 reinos con bots de control, y un reino caido de la API (jugarConqConCaido) deja errores y respuestas invalidas', async () => {
  for (const k of [2, 3, 4, 5]) {
    const p = await jugarConqBots(5, ['agresivo', 'pacifico', 'economico', 'azar', 'agresivo'].slice(0, k));
    assert.equal(p.jugadores.length, k);
    assert.equal(p.mapa.k, k);
  }
  const p = await jugarConqConCaido(5, 4, 1);
  assert.ok(p.rondas.some((r) => r.errores[1] && r.respuestas[1].invalida === true), 'el reino 1 debia quedar con error y respuesta invalida');
  assert.ok(p.rondas.every((r) => r.errores[0] === null));
});

// ---- web/casino/conquista-datos.js: lo que la web copia del motor ----

test('las constantes que usa la escena son las del motor (la web no puede importarlo)', () => {
  assert.equal(web.TURNOS_TOPE, motor.TURNOS);
  assert.equal(web.TROPAS_CAPITAL, motor.TROPAS_CAPITAL);
  assert.equal(web.TROPAS_VECINA, motor.TROPAS_VECINA);
  assert.deepEqual(web.ALMACEN_INICIAL, motor.ALMACEN_INICIAL);
  assert.equal(web.HONOR_INICIAL, motor.HONOR.inicial);
  assert.equal(web.HONOR_MAXIMO, motor.HONOR.maximo);
  assert.equal(web.HONOR_ROTURA, motor.HONOR.rotura);
  assert.equal(web.PACTO_TURNOS, motor.PACTO_TURNOS);
  assert.equal(web.MARAVILLA_TURNOS, motor.MARAVILLA.turnos);
  assert.deepEqual(web.TERRENO, motor.TERRENO);
  assert.equal(web.BONO_ARMAS, motor.ARMAS.bono);
  assert.deepEqual(web.PUNTOS_POSICION, motor.PUNTOS_POSICION);
  assert.deepEqual(web.RECURSOS, motor.RECURSOS);
  assert.deepEqual(web.LETRA_DE_EDIFICIO, Object.fromEntries(Object.entries(motor.EDIFICIOS).map(([nombre, e]) => [e.letra, nombre])));
});

test('los multiplicadores que muestra la tarjeta son los de las formulas del combate del motor (armas, fortaleza y terreno)', () => {
  const E = nuevoEstado(4), ctx = contexto(E);
  const r = E.mapa.regs.find((x) => x.terr === 'mo')?.id ?? 0;
  E.mapa.regs[r].terr = 'mo'; E.dueno[r] = 0; fijarTropas(E, r, 8); E.fort[r] = 2;
  assert.equal(ctx.defensa(r), 8 * web.multiplicadorDeFortaleza(2) * web.TERRENO.mo);
  E.reinos[0].armas = 2;
  assert.equal(ctx.ataque(0, 10), 10 * web.multiplicadorDeArmas(2));
  assert.equal(web.multiplicadorDeArmas(0), 1);
  assert.equal(web.multiplicadorDeFortaleza(0), 1);
});

test('leerMapa devuelve lo mismo que restaurarMapa del motor para los 4 biomas y 4 tamanos, y null ante un mapa roto', () => {
  for (const bioma of BIOMAS) for (const k of [2, 3, 4, 5]) {
    const guardado = JSON.parse(JSON.stringify(serializarMapa(crearMapa(7, k, { bioma }))));
    assert.deepStrictEqual(web.leerMapa(guardado), restaurarMapa(guardado), `${bioma} k=${k}`);
  }
  const bueno = JSON.parse(JSON.stringify(serializarMapa(crearMapa(7, 3, { bioma: 'mares' }))));
  const estropear = [
    (m) => { m.regs[0] = null; }, (m) => { delete m.regs[0].vecinos; }, (m) => { m.terreno = m.terreno.slice(1); }, (m) => { m.region = m.region.slice(1); },
    (m) => { m.terreno = 'x' + m.terreno.slice(1); }, (m) => { m.terreno = '9' + m.terreno.slice(1); }, (m) => { delete m.ancho; }, (m) => { m.inicio = { capitales: [] }; },
  ];
  for (const f of estropear) { const m = structuredClone(bueno); f(m); assert.equal(web.leerMapa(m), null); }
  for (const raro of [null, undefined, 7, 'x', {}, []]) assert.equal(web.leerMapa(raro), null);
});

test('estadoInicial(partida) es el estado con el que el motor empieza la partida (duenos, tropas, fortaleza, almacen, honor)', async () => {
  for (const k of [2, 3, 4, 5]) {
    const p = await jugarConqBots(9, ['agresivo', 'pacifico', 'economico', 'azar', 'agresivo'].slice(0, k));
    const esperado = instantanea(crearEstado(crearRng(p.seed), { jugadores: k, mapa: restaurarMapa(p.mapa) }));
    assert.deepStrictEqual(web.estadoInicial(p), esperado, `${k} reinos`);
  }
  assert.equal(web.estadoInicial(null), null);
  assert.equal(web.estadoInicial({ mapa: { terreno: 5 } }), null);
});

test('cada estadoInicial es independiente: gastar el almacen de un reino no toca el de otro ni la constante', async () => {
  const p = await jugarConqBots(9, ['agresivo', 'pacifico', 'economico', 'azar']);
  const e = web.estadoInicial(p);
  e.stock[0].Comida = 99;
  assert.equal(e.stock[1].Comida, 6);
  assert.equal(web.ALMACEN_INICIAL.Comida, 6);
  assert.equal(web.estadoInicial(p).stock[0].Comida, 6);
});

test('paletaDe da 6 colores hex distintos para cada bioma, los biomas se distinguen entre si y uno desconocido usa el del continente', () => {
  const paletas = BIOMAS.map((b) => web.paletaDe(b));
  for (const p of paletas) { assert.equal(p.length, 6); assert.ok(p.every((c) => /^#[0-9a-f]{6}$/i.test(c))); assert.equal(new Set(p).size, 6); }
  assert.notDeepEqual(web.paletaDe('arido'), web.paletaDe('continente'));
  assert.deepEqual(web.paletaDe('raro'), web.paletaDe('continente'));
  assert.deepEqual(Object.keys(web.NOMBRES_BIOMA), BIOMAS);
  assert.ok(web.TINTE_DE_REINO > 0 && web.TINTE_DE_REINO < 0.5);
});

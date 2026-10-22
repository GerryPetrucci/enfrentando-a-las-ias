// Guerra 2.0.0, etapa 5: suministro. Una region tuya sin camino hasta tu capital (por regiones tuyas, libres o de un aliado con pacto vigente) esta AISLADA: no produce, no cuenta para la
// cosecha base y ahi no se recluta, fortifica ni construye; sus tropas siguen comiendo. La capital nunca esta aislada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoEstado, contexto, R, capital, fijarTropas } from './ayudas.js';
import { regionesDe, instantanea, limpiarRegion } from '../../juegos/conquista/estado.js';
import { regionesAisladas } from '../../juegos/conquista/suministro.js';
import { vistaTexto } from '../../juegos/conquista/vista.js';
import { lineasDeCapacidad } from '../../juegos/conquista/frentes.js';
import { recoleccion, hambre, ordenesEconomicas } from '../../juegos/conquista/turno/economia.js';
import { eventosDelMundo } from '../../juegos/conquista/turno/mundo.js';

const vaciar = (E, s, extra = {}) => { E.reinos[s].stock = { Comida: 0, Madera: 0, Roca: 0, Hierro: 0, Oro: 0, Caballos: 0, ...extra }; };
const pacto = (E, a, b, hasta = 30) => { E.reinos[a].pactos[b] = E.reinos[b].pactos[a] = hasta; };

// Un mapa donde todo es libre salvo las capitales: asi el camino por tierra libre existe y cada prueba arma solo lo que necesita.
function mapaAbierto(k = 4) {
  const E = nuevoEstado(k), capitales = E.reinos.map((r) => r.capital);
  for (let r = 0; r < E.dueno.length; r++) if (!capitales.includes(r)) { limpiarRegion(E, r); E.dueno[r] = -1; E.fort[r] = 0; E.edif[r] = null; E.dan[r] = 0; E.mapa.regs[r].rec = null; }
  return E;
}
// Una region x (no capital, sin capitales vecinas) para el reino 0, rodeada por regiones del reino `rodeo`. Devuelve { x, anillo }.
function rodeada(E, rodeo = 1) {
  const capitales = E.reinos.map((r) => r.capital);
  const x = E.mapa.regs.find((r) => !capitales.includes(r.id) && r.vecinos.length >= 2 && r.vecinos.every((v) => !capitales.includes(v)) && r.vecinos.every((v) => !E.mapa.regs[E.reinos[0].capital].vecinos.includes(v))).id;
  E.dueno[x] = 0; fijarTropas(E, x, 3);
  const anillo = [...E.mapa.regs[x].vecinos];
  for (const v of anillo) { E.dueno[v] = rodeo; fijarTropas(E, v, 3); }
  return { x, anillo };
}

test('una region rodeada por otro reino esta aislada; las demas del reino y su capital no', () => {
  const E = mapaAbierto(), { x } = rodeada(E);
  const otra = E.mapa.regs[E.reinos[0].capital].vecinos[0];
  E.dueno[otra] = 0; fijarTropas(E, otra, 2);
  assert.deepEqual(regionesAisladas(E, 0, 1), [x]);
  assert.deepEqual(regionesAisladas(E, 1, 1), [], 'el anillo del reino 1 esta conectado a su capital por tierra libre');
});

test('la tierra libre conecta: una region que toca tierra libre no esta aislada', () => {
  const E = mapaAbierto(), { x, anillo } = rodeada(E);
  E.dueno[anillo[0]] = -1; limpiarRegion(E, anillo[0]); // un hueco libre en el anillo
  assert.deepEqual(regionesAisladas(E, 0, 1), []);
  assert.ok(x >= 0);
});

test('un aliado con pacto vigente conecta; el pacto vencido o roto, no', () => {
  const E = mapaAbierto(), { x } = rodeada(E);
  pacto(E, 0, 1, 5);
  assert.deepEqual(regionesAisladas(E, 0, 5), [], 'el ultimo turno del pacto todavia cuenta');
  assert.deepEqual(regionesAisladas(E, 0, 6), [x], 'sin pacto vigente, el anillo del reino 1 bloquea otra vez');
});

test('la capital nunca esta aislada, aunque la rodeen: lo que queda sin camino a ella es lo aislado', () => {
  const E = mapaAbierto(), c = E.reinos[0].capital, vecinas = E.mapa.regs[c].vecinos;
  for (const v of vecinas) { E.dueno[v] = 1; fijarTropas(E, v, 3); }
  const lejos = E.mapa.regs.find((r) => r.id !== c && !vecinas.includes(r.id) && E.dueno[r.id] === -1 && !E.reinos.some((q) => q.capital === r.id)).id;
  E.dueno[lejos] = 0; fijarTropas(E, lejos, 2);
  assert.deepEqual(regionesAisladas(E, 0, 1), [lejos]);
  assert.ok(!regionesAisladas(E, 0, 1).includes(c));
});

test('un reino caido o sin capital propia no tiene regiones aisladas', () => {
  const E = mapaAbierto(); rodeada(E);
  E.reinos[0].vivo = false;
  assert.deepEqual(regionesAisladas(E, 0, 1), []);
});

test('ctx.aisladas marca las regiones aisladas de todos los reinos al empezar el turno y la instantanea las lista para el siguiente', () => {
  const E = mapaAbierto(), { x } = rodeada(E);
  const ctx = contexto(E);
  assert.equal(ctx.aisladas[x], 1);
  assert.equal(ctx.aisladas.reduce((s, v) => s + v, 0), 1);
  assert.deepEqual(instantanea(E).aisladas, [x]);
});

test('la vista dice cuales son TUS regiones aisladas y que no producen; las de otros reinos no se anuncian', () => {
  const E = mapaAbierto(), { x } = rodeada(E);
  const linea = `Tus regiones aisladas (sin camino a tu capital: no producen y ahi no se recluta, fortifica ni construye): ${R(x)}`;
  assert.ok(vistaTexto(E, 0).includes(linea), vistaTexto(E, 0).split('\n').find((l) => l.includes('aisladas')));
  assert.ok(!vistaTexto(E, 1).includes('aisladas'));
  assert.ok(!vistaTexto(mapaAbierto(), 0).includes('aisladas'), 'sin regiones aisladas no hay linea');
  pacto(E, 0, 1);
  assert.ok(!vistaTexto(E, 0).includes('aisladas'), 'con el camino abierto por un aliado deja de estarlo');
});

// ---- Efectos ----

test('una region aislada no produce recursos ni edificios y no cuenta para la cosecha base', () => {
  const E = mapaAbierto(), { x } = rodeada(E); // el reino 0 tiene su capital y la region aislada x
  E.mapa.regs[x].rec = 'Hierro'; E.edif[x] = 'granja';
  vaciar(E, 0);
  recoleccion(contexto(E));
  assert.equal(E.reinos[0].stock.Hierro, 0, 'el nodo de la region aislada no rinde');
  assert.equal(E.reinos[0].stock.Comida, 0, 'solo cuenta la capital: floor(1 / 2) = 0 de cosecha base, y la granja aislada no da');
  // con el camino abierto vuelve a producir
  vaciar(E, 0); pacto(E, 0, 1);
  recoleccion(contexto(E));
  assert.equal(E.reinos[0].stock.Hierro, 2);
  assert.equal(E.reinos[0].stock.Comida, 2 + 1, 'granja +2 y cosecha de 2 regiones (floor(2 / 2) = 1)');
});

test('el evento Cosecha (+1 Comida por region) no cuenta las regiones aisladas', () => {
  const E = mapaAbierto(); rodeada(E); // capital + una region aislada
  E.calendario = [{ t: 1, tipo: 'cosecha' }]; vaciar(E, 0);
  const ctx = contexto(E);
  eventosDelMundo(ctx); recoleccion(ctx);
  assert.equal(E.reinos[0].stock.Comida, 0 + 1, 'floor(1 / 2) de base + 1 por la unica region conectada');
});

test('en una region aislada no se recluta, no se contratan mercenarios, no se fortifica ni se construye; el motivo lo dice y no se paga nada', () => {
  const E = mapaAbierto(), { x } = rodeada(E);
  vaciar(E, 0, { Comida: 20, Madera: 20, Roca: 20, Hierro: 20, Oro: 20 });
  const antes = JSON.stringify(E.reinos[0].stock);
  const ctx = contexto(E, { 0: { ordenes: [`reclutar ${R(x)} L3`, `mercenarios ${R(x)} 2`, `fortificar ${R(x)}`, `construir ${R(x)} granja`] } });
  ordenesEconomicas(ctx);
  assert.deepEqual(ctx.descartes[0].map((d) => d.motivo), Array(4).fill('la region esta aislada de tu capital'));
  assert.equal(JSON.stringify(E.reinos[0].stock), antes);
  assert.equal(E.edif[x], null);
  assert.equal(E.fort[x], 0);
});

test('las ordenes en la capital y en regiones conectadas siguen valiendo con regiones aisladas en el reino', () => {
  const E = mapaAbierto(), c = E.reinos[0].capital; rodeada(E);
  vaciar(E, 0, { Comida: 20 });
  const ctx = contexto(E, { 0: { ordenes: [`reclutar ${R(c)} L3`] } });
  ordenesEconomicas(ctx);
  assert.deepEqual(ctx.descartes[0], []);
});

test('mejorar exige un cuartel propio que no este aislado', () => {
  const E = mapaAbierto(), c = E.reinos[0].capital, { x } = rodeada(E);
  E.edif[x] = 'cuartel'; // el unico cuartel esta aislado
  vaciar(E, 0, { Hierro: 10, Oro: 10 });
  let ctx = contexto(E, { 0: { ordenes: ['mejorar L'] } });
  ordenesEconomicas(ctx);
  assert.equal(ctx.descartes[0][0].motivo, 'hace falta un cuartel para mejorar');
  E.edif[c] = 'cuartel';
  ctx = contexto(E, { 0: { ordenes: ['mejorar L'] } });
  ordenesEconomicas(ctx);
  assert.deepEqual(ctx.descartes[0], []);
  assert.equal(E.reinos[0].mejoras[0], 1);
});

test('CAPACIDAD no cuenta un cuartel aislado: la linea «En tu cuartel» solo sale si el cuartel esta conectado', () => {
  const E = mapaAbierto(), { x } = rodeada(E);
  E.edif[x] = 'cuartel'; vaciar(E, 0, { Comida: 10, Madera: 4, Roca: 3, Hierro: 2 });
  assert.equal(lineasDeCapacidad(E, 0).length, 1, 'el unico cuartel esta aislado');
  pacto(E, 0, 1);
  assert.equal(lineasDeCapacidad(E, 0).length, 2, 'con el camino abierto el cuartel vuelve a contar');
});

test('las tropas de una region aislada siguen comiendo', () => {
  const E = mapaAbierto(), c = E.reinos[0].capital, { x } = rodeada(E);
  fijarTropas(E, x, 8); fijarTropas(E, c, 8);
  vaciar(E, 0, { Comida: 10 });
  hambre(contexto(E));
  assert.equal(E.reinos[0].stock.Comida, 10 - Math.ceil(16 / 4));
  assert.equal(regionesDe(E, 0).length, 2);
});

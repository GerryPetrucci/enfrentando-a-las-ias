// La arena corre cualquier juego sin conocerlo. Estas pruebas usan un juego falso y agentes falsos: no hay red ni API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../arena.js';
import { agenteBase } from '../agentes.js';
import dilema from '../juegos/dilema.js';

// Juego de 3 asientos y 3 rondas: el asiento 2 "cae" al terminar la ronda 1 y deja de ser consultado.
const juegoFalso = ({ rondas = 3, termina = true } = {}) => ({
  id: 'falso', nombre: 'Juego falso', categoria: 'Pruebas', jugadores: 3, rondas,
  crear: (rng, opciones) => ({ k: opciones.jugadores, extra: opciones.extra ?? null, ronda: 0, vivos: Array(opciones.jugadores).fill(true) }),
  terminado: (E) => termina && E.ronda >= rondas,
  activos: (E) => E.vivos,
  vista: (E, i) => `vista ${i}`,
  normalizar: (r) => ({ valor: r?.valor ?? 0, invalida: !r }),
  aplicar: (E, jugadas) => {
    E.ronda++;
    if (E.ronda === 1) E.vivos[2] = false;
    return { ronda: E.ronda, jugadas: jugadas.map((j) => (j ? j.valor : null)), errores: jugadas.map((j) => j?.error ?? null) };
  },
  resultado: (E) => ({ puntos: [0, 0, 0], ganador: null, empate: true, metricas: [{ k: E.k, extra: E.extra }] }),
});

const USO = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
const agente = (id, valor = 1, extra = {}) => ({
  id, nombre: id, color: '#000000', inicial: id[0].toUpperCase(), tipo: 'bot', modelo: null,
  async jugar() { return { respuesta: { valor }, crudo: null, uso: USO }; },
  ...extra,
});
const tres = () => [agente('a'), agente('b'), agente('c')];

test('solo pregunta a los jugadores activos y cuenta las llamadas', async () => {
  const r = await correrPartida({ juego: juegoFalso(), agentes: tres(), seed: 1 });
  assert.equal(r.llamadas, 3 + 2 + 2);
  assert.deepEqual(r.usoPorJugador.map((u) => u.llamadas), [3, 3, 1]);
  assert.deepEqual(r.rondas[1].jugadas, [1, 1, null]);
  assert.equal(r.usoPorJugador[0].tokensEntrada, 30);
  assert.equal(r.usoPorJugador[0].tokensSalida, 15);
  assert.equal(r.tokensUsados, 7 * 15);
});

test('crear recibe el numero de jugadores y las opciones del juego', async () => {
  const r = await correrPartida({ juego: juegoFalso(), agentes: tres(), seed: 1, opciones: { extra: 'x' } });
  assert.deepEqual(r.metricas, [{ k: 3, extra: 'x' }]);
});

test('avisa una sola vez al pasar el limite de llamadas y no corta la partida', async () => {
  const avisos = [];
  const r = await correrPartida({ juego: juegoFalso(), agentes: tres(), seed: 1, limiteLlamadas: 4, alAvisar: (a) => avisos.push(a) });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /4/);
  assert.deepEqual(r.avisos, avisos);
  assert.equal(r.llamadas, 7);
  assert.equal(r.rondas.length, 3);
});

test('maxRondas corta la partida y la marca como truncada', async () => {
  const completa = await correrPartida({ juego: juegoFalso(), agentes: tres(), seed: 1 });
  const corta = await correrPartida({ juego: juegoFalso(), agentes: tres(), seed: 1, maxRondas: 2 });
  assert.equal(completa.truncada, false);
  assert.equal(corta.truncada, true);
  assert.equal(corta.rondas.length, 2);
});

test('un juego que nunca termina se detiene con un error en vez de gastar llamadas sin fin', async () => {
  await assert.rejects(correrPartida({ juego: juegoFalso({ termina: false }), agentes: tres(), seed: 1 }), /no termina/);
});

test('un agente que falla juega el valor por defecto, queda anotado y no tumba la partida', async () => {
  const roto = agente('roto', 1, { async jugar() { throw new Error('se cayo la red'); } });
  const r = await correrPartida({ juego: juegoFalso(), agentes: [roto, agente('b'), agente('c')], seed: 1 });
  assert.equal(r.rondas[0].jugadas[0], 0);
  assert.match(r.rondas[0].errores[0], /se cayo la red/);
  assert.equal(r.rondas[0].errores[1], null);
});

test('solo los agentes que lo piden reciben el estado completo; los demas, solo su vista y su propio rng', async () => {
  const entradas = {};
  const espia = (id, extra = {}) => agente(id, 1, { async jugar(entrada) { entradas[id] = entrada; return { respuesta: { valor: 1 }, crudo: null, uso: null }; }, ...extra });
  await correrPartida({ juego: juegoFalso({ rondas: 1 }), agentes: [espia('a', { necesitaEstado: true }), espia('b'), espia('c')], seed: 1 });
  assert.equal(entradas.a.estado.k, 3);
  assert.equal(entradas.a.i, 0);
  assert.equal('estado' in entradas.b, false);
  assert.equal(entradas.b.vista, 'vista 1');
  assert.equal(typeof entradas.b.rng, 'function');
});

test('cada asiento tiene su propio rng con seed: misma semilla, mismas jugadas; otra semilla, otras', async () => {
  const sorteo = (id) => agente(id, 1, { async jugar({ rng }) { return { respuesta: { valor: Math.floor(rng() * 1e9) }, crudo: null, uso: null }; } });
  const correr = (seed) => correrPartida({ juego: juegoFalso(), agentes: [sorteo('a'), sorteo('b'), sorteo('c')], seed });
  const x = await correr(5), y = await correr(5), z = await correr(6);
  assert.deepEqual(x.rondas.map((q) => q.jugadas), y.rondas.map((q) => q.jugadas));
  assert.notDeepEqual(x.rondas.map((q) => q.jugadas), z.rondas.map((q) => q.jugadas));
  assert.notEqual(x.rondas[0].jugadas[0], x.rondas[0].jugadas[1]);
});

test('con limitador, cada llamada espera su turno antes de salir', async () => {
  let esperas = 0;
  const r = await correrPartida({ juego: juegoFalso(), agentes: tres(), seed: 1, limitador: { esperar: async () => { esperas++; } } });
  assert.equal(esperas, r.llamadas);
});

test('el Dilema no cambia: mismo resultado de siempre con estrategias base', async () => {
  const r = await correrPartida({ juego: dilema, agentes: [agenteBase('tomaydaca'), agenteBase('siempre-t')], seed: 5 });
  assert.deepEqual(r.puntos, [9, 14]);
  assert.equal(r.ganador, 1);
  assert.equal(r.rondas.length, 10);
  assert.equal(r.llamadas, 20);
  assert.deepEqual(r.jugadores.map((j) => j.id), ['tomaydaca', 'siempre-t']);
  assert.equal(r.truncada, false);
  assert.ok(r.rondas.every((x) => Array.isArray(x.errores)));
});

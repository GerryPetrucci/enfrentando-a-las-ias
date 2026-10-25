import test from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida, comprobarPresupuestoLlamadas } from '../../arena.js';
import { estimarLlamadas } from '../../serie.js';
import { crearRng } from '../../rng.js';
import lobo from '../../juegos/lobo.js';
import { CONFIGURACIONES } from '../../juegos/lobo/constantes.js';
import { simular } from '../../../herramientas/medir-lobo.mjs';
import { agenteModelo } from '../../agentes.js';
import { decidirBot } from '../../juegos/lobo-bots.js';

function estadoDoce() {
  const E = lobo.crear(crearRng(10), { jugadores: 12 });
  E.roles = ['lobo', 'lobo', 'lobo', 'vidente', 'bruja', 'cazador', 'cupido', ...Array(5).fill('aldeano')];
  E.maxRondas = 8;
  return E;
}
const juegoExperimental = (extra = {}) => ({ ...lobo, crear: () => estadoDoce(), ...extra });
const controlDoce = () => Array.from({ length: 12 }, (_, i) => ({ id: `control-${i}`, necesitaEstado: true,
  async jugar({ estado: E }) {
    const vivos = E.vivos.flatMap((v, i) => v ? [i] : []);
    const respuesta = {
      cupido: { enamorados: [7, 8] },
      lobos: { accion: 'matar', objetivo: E.ronda === 8 ? 5 : 7 + i },
      bruja: { salvar: false, matar: null },
      vidente: { accion: 'inspeccionar', objetivo: 0 },
      cazador: { accion: 'disparar', objetivo: 9 },
      dia: { mensaje: '', voto: vivos[(vivos.indexOf(i) + 1) % vivos.length] },
    }[E.fase];
    return { respuesta };
  },
}));

test('guardian soporta ocho rondas y cazador tardío: 34 pasos, sin cambiar los topes aceptados', async () => {
  assert.equal(CONFIGURACIONES[8].rondas, 6); assert.equal(CONFIGURACIONES[12].rondas, 6);
  assert.equal(lobo.crear(crearRng(1), { jugadores: 12 }).maxRondas, 6);
  // Diagnóstico gratuito sin corte: permite verificar el guardián por separado.
  const r = await correrPartida({ juego: juegoExperimental({ limiteLlamadasDuro: null }), agentes: controlDoce(), seed: 10 });
  assert.equal(r.truncada, false); assert.equal(r.rondasJugadas, 8);
  assert.equal(r.rondas.length, 34); assert.equal(r.rondas[32].fase, 'cazador');
  assert.ok(lobo.rondas - r.rondas.length >= 10);
  assert.equal(r.empate, true); assert.equal(r.motivoFin, 'tope');
  assert.equal(r.llamadas, 136); assert.ok(r.metricas.every((m) => !m.jugadasInvalidas));
});

test('corte vivo reserva toda la votación antes de Promise.all: no consulta parcialmente los asientos', async () => {
  const registros = [], avisos = [];
  const r = await correrPartida({ juego: juegoExperimental(), agentes: controlDoce(), seed: 10,
    limiteLlamadas: 1000, alRegistrar: (r) => registros.push(r), alAvisar: (a) => avisos.push(a) });
  assert.equal(r.llamadas, 91); assert.equal(r.cortePorLlamadas.necesarias, 12);
  assert.equal(r.cortePorLlamadas.restantes, 9); assert.equal(r.cortePorLlamadas.limite, 100);
  assert.equal(r.rondas.at(-1).fase, 'dia'); assert.equal(r.rondas.at(-1).ronda, 6);
  assert.equal(r.metricas.reduce((n, m) => n + m.acciones, 0), 91);
  assert.equal(r.usoPorJugador.reduce((n, u) => n + u.llamadas, 0), 91);
  assert.ok(r.metricas.every((m) => !m.jugadasInvalidas));
  assert.equal(r.truncada, false); assert.equal(r.empate, true); assert.equal(r.motivoFin, 'llamadas');
  assert.equal(r.ganadorBando, null); assert.deepEqual(r.ganadores, []);
  assert.equal(registros.length, r.rondas.length); assert.equal(avisos.length, 1);
  assert.deepEqual(r.rondas.at(-1).privado.acciones, []);
  assert.ok(r.rondas.at(-1).invalidas.every((i) => i === null));
});

test('la reacción del cazador también exige presupuesto; sin disparo no se inventa una victoria', async () => {
  const E = estadoDoce(); E.vivos.fill(false); E.vivos[3] = true;
  E.fase = 'cazador'; E.cazadoresPendientes = [5];
  let consultas = 0;
  const agentes = Array.from({ length: 12 }, () => ({ async jugar() { consultas++; throw new Error('No debía llamar'); } }));
  const r = await correrPartida({ juego: juegoExperimental({ crear: () => E, limiteLlamadasDuro: 0 }), agentes, seed: 1 });
  assert.equal(consultas, 0); assert.equal(r.llamadas, 0);
  assert.equal(r.empate, true); assert.equal(r.ganadorBando, null);
  assert.equal(r.motivoFin, 'llamadas'); assert.ok(r.puntos.every((p) => p === 0));
  assert.equal(E.vivos[3], true); assert.ok(!E.eventos.some((e) => e.tipo === 'disparo'));
});

const pruebaArena = (limite, turnos = 4) => ({
  id: 'presupuesto', rondas: 60, limiteLlamadasDuro: limite,
  crear: () => ({ turnos: 0, fin: false }), terminado: (E) => E.fin,
  activos: () => [true, true], vista: () => '', normalizar: (r) => r ?? {},
  aplicar: (E) => { E.turnos++; E.fin = E.turnos === turnos; return { turno: E.turnos }; },
  resultado: () => ({ puntos: [0, 0] }),
});

test('100 exactas permitidas; si la última fase termina no agrega un corte artificial', async () => {
  let consultas = 0;
  const agentes = Array.from({ length: 2 }, () => ({ async jugar() { consultas++; return { respuesta: {} }; } }));
  const r = await correrPartida({ juego: pruebaArena(100, 50), agentes, seed: 1 });
  assert.equal(consultas, 100); assert.equal(r.llamadas, 100);
  assert.equal(r.cortePorLlamadas, undefined); assert.equal(r.truncada, false);
});

test('fallos de agentes consumen presupuesto; nunca consulta un asiento extra tras agotarlo', async () => {
  let consultas = 0, esperas = 0;
  const agentes = Array.from({ length: 2 }, () => ({ async jugar() { consultas++; throw new Error('Red caída'); } }));
  const r = await correrPartida({ juego: pruebaArena(4), agentes, seed: 1, limitador: { async esperar() { esperas++; } } });
  assert.equal(consultas, 4); assert.equal(esperas, 4); assert.equal(r.llamadas, 4);
  assert.equal(r.cortePorLlamadas.restantes, 0); assert.equal(r.truncada, true); // Juego genérico sin hook de cierre.
  assert.equal(r.rondas.length, 2);
});

test('límite se valida antes de consultar; no se activa en juegos que no lo declaran', async () => {
  let consultas = 0;
  const agentes = Array.from({ length: 2 }, () => ({ async jugar() { consultas++; return { respuesta: {} }; } }));
  for (const limite of [-1, 1.5, Infinity, '100']) {
    await assert.rejects(correrPartida({ juego: pruebaArena(limite), agentes, seed: 1 }), /inválido/);
  }
  assert.equal(consultas, 0);
  const r = await correrPartida({ juego: pruebaArena(undefined), agentes, seed: 1, limiteLlamadas: 1 });
  assert.equal(r.llamadas, 8); assert.equal(r.truncada, false); assert.equal(r.avisos.length, 1);
  assert.equal(comprobarPresupuestoLlamadas(lobo, 98, [true, true]), null);
  assert.equal(comprobarPresupuestoLlamadas(lobo, 99, [false, true]), null);
  assert.equal(comprobarPresupuestoLlamadas(lobo, 99, [true, true]).necesarias, 2);
});

test('estimación de series usa la cota dura actual, no el anterior 80', () => {
  assert.equal(lobo.llamadasMax, 100); assert.equal(lobo.limiteLlamadasDuro, 100);
  assert.equal(estimarLlamadas(lobo, 12, 7), 700);
  assert.equal(estimarLlamadas(lobo, 8, 7), 700);
});

test('agente de modelo con corte duro desactiva reintentos HTTP ocultos; otros juegos conservan sus opciones', async () => {
  const opciones = [];
  const agente = agenteModelo('claude', { llamar: async (o) => { opciones.push(o); return { texto: '{"voto":1,"mensaje":""}', uso: null }; } });
  await agente.jugar({ juego: lobo, vista: '{}' });
  assert.equal(opciones[0].reintentos, 0);
  await agente.jugar({ juego: { id: 'otro', nombre: 'Otro', reglas: '', formatoRespuesta: '' }, vista: '{}' });
  assert.equal(Object.hasOwn(opciones[1], 'reintentos'), false);
});

test('medición experimental usa el mismo corte que la arena y no modifica la configuración', () => {
  const perfil = { lobo: 'silencioso', vidente: 'calla', bruja: 'guarda', aldeano: 'contradice' };
  for (let seed = 20261024; seed < 20261044; seed++) {
    const config = { jugadores: 12, seed, perfil, rondas12: 8 };
    const con = simular(config), sin = simular({ ...config, limiteLlamadasDuro: null });
    assert.ok(con.llamadas <= 100); assert.ok(con.pasos <= 35); assert.ok(sin.pasos <= 34);
    if (sin.llamadas <= 100) { assert.equal(con.ganador, sin.ganador); assert.equal(con.llamadas, sin.llamadas); }
    else { assert.equal(con.motivo, 'llamadas'); assert.equal(con.ganador, 'empate'); }
  }
  assert.equal(CONFIGURACIONES[12].rondas, 6); assert.equal(CONFIGURACIONES[8].rondas, 6);
});

test('una partida con corte medido reproduce llamadas, resultado y puntos en la arena viva', async () => {
  const perfil = { lobo: 'silencioso', vidente: 'calla', bruja: 'guarda', aldeano: 'contradice' };
  let medida;
  for (let seed = 20261024; seed < 20261124; seed++) {
    const r = simular({ jugadores: 12, seed, perfil, rondas12: 8 });
    if (r.cortePorLlamadas) { medida = r; break; }
  }
  assert.ok(medida, 'La muestra contiene un corte real de presupuesto.');
  const juego = { ...lobo, crear: (rng, opciones) => { const E = lobo.crear(rng, opciones); E.maxRondas = 8; return E; } };
  const agentes = Array.from({ length: 12 }, (_, i) => ({ id: `control-${i}`, async jugar({ vista, rng }) {
    const v = JSON.parse(vista);
    return { respuesta: decidirBot(v, perfil[v.rol] ?? 'mayoria', rng) };
  } }));
  const viva = await correrPartida({ juego, agentes, seed: medida.seed });
  assert.equal(viva.llamadas, medida.llamadas); assert.equal(viva.motivoFin, medida.motivo);
  assert.deepEqual(viva.cortePorLlamadas, medida.cortePorLlamadas);
  assert.deepEqual(viva.puntos, medida.puntos); assert.equal(viva.rondas.length, medida.pasos);
});

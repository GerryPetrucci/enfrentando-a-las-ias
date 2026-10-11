// El agente en lote y una serie completa de la Guerra de territorios corrida con lotes FALSOS (sin red ni gasto): las partidas de
// una serie avanzan juntas, turno por turno, y cada ronda sale en UN lote por modelo.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agenteModeloEnLote } from '../agentes.js';
import { correrPartida } from '../arena.js';
import { crearCoordinador } from '../coordinador-lote.js';
import { planDeSerie } from '../serie.js';
import { clienteFalso } from './ayudas-lote.js';
import conquista from '../juegos/conquista.js';
import dilema from '../juegos/dilema.js';
import { fijarModo } from '../modelos.js';

fijarModo('pago');

const JUGADA = '{"ordenes": [], "pacto_con": null, "mensaje": "", "privados": [], "razon": "paso el turno"}';

test('el agente en lote pide al coordinador con el razonamiento medio y el texto del juego, y entiende la respuesta', async () => {
  const pedidos = [];
  const coordinador = { pedir: async (p) => { pedidos.push(p); return { texto: '```json\n{"jugada":"T","promesa":"C","mensaje":"hola","razon":"x"}\n```', finishReason: 'stop', uso: { total_tokens: 9 } }; } };
  const agente = agenteModeloEnLote('claude', coordinador);
  assert.equal(agente.id, 'claude');
  assert.equal(agente.tipo, 'modelo');
  const r = await agente.jugar({ juego: dilema, vista: { ronda: 1 } });
  assert.equal(r.respuesta.jugada, 'T');
  assert.deepEqual(r.uso, { total_tokens: 9 });
  const [p] = pedidos;
  assert.equal(p.modelo, 'anthropic/claude-sonnet-5.5');
  assert.equal(p.usaLote, true);
  assert.equal(p.razonamiento, 'medium');
  assert.ok(p.sistema.includes(dilema.reglas));
  assert.ok(p.usuario.includes('"ronda": 1'));
});

test('un modelo sin variante de lote pide la llamada normal; los gratis tampoco usan lote', async () => {
  const pedidos = [];
  const coordinador = { pedir: async (p) => { pedidos.push(p); return { texto: '{}', finishReason: 'stop', uso: null }; } };
  await agenteModeloEnLote('llama', coordinador).jugar({ juego: dilema, vista: {} });
  await agenteModeloEnLote('laguna', coordinador).jugar({ juego: dilema, vista: {} });
  assert.deepEqual(pedidos.map((p) => [p.usaLote, p.razonamiento]), [[false, null], [false, null]]);
});

test('sin jugada utilizable se lanza el motivo, igual que con la llamada normal', async () => {
  const con = (r) => agenteModeloEnLote('gpt', { pedir: async () => r }).jugar({ juego: dilema, vista: {} });
  await assert.rejects(con({ texto: '', finishReason: 'length' }), /cortada por max_tokens/);
  await assert.rejects(con({ texto: 'solo texto', finishReason: 'stop' }), /JSON válido/);
  await assert.rejects(con({ texto: '', finishReason: 'stop' }), /vacía/);
});

// Serie de 4 partidas (rotacion de asientos, mismo mapa) con 3 modelos de lote y 1 sin lote, 3 turnos cada una.
async function correrSerie(cliente, { sincronoFalso } = {}) {
  const coordinador = crearCoordinador({
    cliente, ventanaMs: 5, cadaMs: 1,
    sincrono: sincronoFalso ?? (async () => ({ texto: JUGADA, finishReason: 'stop', uso: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })),
  });
  const claves = ['claude', 'gpt', 'gemini', 'llama'];
  const agentes = new Map(claves.map((c) => [c, agenteModeloEnLote(c, coordinador)]));
  const plan = planDeSerie({ claves, partidas: 4, seedBase: 7, mismoSeed: true });
  const resultados = await Promise.all(plan.map((p) => correrPartida({ juego: conquista, agentes: p.claves.map((c) => agentes.get(c)), seed: p.seed, maxRondas: 3 })));
  return { resultados, coordinador, plan };
}

test('las 4 partidas de una serie avanzan juntas: cada ronda es UN lote por modelo con las 4 partidas adentro', async () => {
  const cliente = clienteFalso({ responder: () => ({ texto: JUGADA }) });
  const { resultados, coordinador } = await correrSerie(cliente);
  assert.equal(resultados.length, 4);
  for (const r of resultados) {
    assert.equal(r.rondas.length, 3);
    assert.equal(r.truncada, true);
    assert.equal(r.llamadas, 12);
    assert.ok(r.rondas.every((x) => x.errores.every((e) => e === null)));
    assert.ok(r.usoPorJugador.every((u) => u.llamadas === 3));
  }
  // 3 rondas x 3 modelos con lote = 9 lotes, cada uno con las 4 partidas; el modelo sin lote hizo 3 x 4 llamadas normales
  assert.equal(cliente.enviados.length, 9);
  assert.ok(cliente.enviados.every((e) => e.n === 4), `tamanos de lote: ${cliente.enviados.map((e) => e.n)}`);
  const est = coordinador.estadisticas();
  assert.equal(est.lotes, 9);
  assert.equal(est.sincronas, 12);
  assert.equal(+est.gasto.toFixed(4), 0.09);
});

test('el uso de tokens de cada reino sale del lote repartido, y el de los modelos normales de su propia respuesta', async () => {
  const { resultados } = await correrSerie(clienteFalso({ responder: () => ({ texto: JUGADA }) }));
  const r = resultados[0]; // asientos: claude, gpt, gemini, llama
  assert.deepEqual(r.jugadores.map((j) => j.id), ['claude', 'gpt', 'gemini', 'llama']);
  assert.deepEqual(r.usoPorJugador.map((u) => [u.tokensEntrada, u.tokensSalida]), [[300, 150], [300, 150], [300, 150], [30, 15]]);
});

test('una peticion que falla queda anotada como error de ese reino y la partida sigue', async () => {
  const cliente = clienteFalso({ responder: (c, modelo) => (modelo.includes('gpt') ? { error: 'proveedor caido' } : { texto: JUGADA }) });
  const { resultados } = await correrSerie(cliente);
  for (const r of resultados) {
    const asientoGpt = r.jugadores.findIndex((j) => j.id === 'gpt');
    for (const ronda of r.rondas) {
      assert.match(ronda.errores[asientoGpt], /proveedor caido/);
      assert.equal(ronda.errores.filter(Boolean).length, 1);
      assert.equal(ronda.respuestas[asientoGpt].invalida, true);
    }
    assert.equal(r.rondas.length, 3, 'la partida no se detuvo');
  }
});

test('con el tope de gasto, la serie se detiene sin gastar mas y lo que no se pudo pedir queda como error', async () => {
  const cliente = clienteFalso({ costoPorLote: 0.02 });
  const coordinador = crearCoordinador({ cliente, ventanaMs: 5, cadaMs: 1, tope: 0.05, sincrono: async () => ({ texto: JUGADA, finishReason: 'stop', uso: null }) });
  const claves = ['claude', 'gpt', 'gemini', 'llama'];
  const agentes = new Map(claves.map((c) => [c, agenteModeloEnLote(c, coordinador)]));
  const plan = planDeSerie({ claves, partidas: 2, seedBase: 7, mismoSeed: true });
  const resultados = await Promise.all(plan.map((p) => correrPartida({ juego: conquista, agentes: p.claves.map((c) => agentes.get(c)), seed: p.seed, maxRondas: 5 })));
  const est = coordinador.estadisticas();
  assert.equal(est.topeAlcanzado, true);
  assert.ok(est.gasto >= 0.05 && est.gasto <= 0.05 + 0.06, `gasto ${est.gasto}`); // se pasa a lo sumo por los lotes de una ronda
  assert.ok(cliente.enviados.length < 15, 'no envio los 15 lotes de 5 rondas');
  const errores = resultados.flatMap((r) => r.rondas.flatMap((x) => x.errores.filter(Boolean)));
  assert.ok(errores.some((e) => /tope de gasto/.test(e)));
});

test('mismo seed y mismas respuestas: la misma serie, turno por turno', async () => {
  const a = await correrSerie(clienteFalso({ responder: () => ({ texto: JUGADA }) }));
  const b = await correrSerie(clienteFalso({ responder: () => ({ texto: JUGADA }) }));
  assert.equal(JSON.stringify(a.resultados.map((r) => r.rondas)), JSON.stringify(b.resultados.map((r) => r.rondas)));
});

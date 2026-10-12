// El coordinador junta en UN lote por modelo todas las peticiones que llegan a la vez (las de todas las partidas de una serie),
// espera el lote y le entrega a cada peticion su resultado. Se prueba con un cliente de lote FALSO: sin red ni gasto.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCoordinador } from '../coordinador-lote.js';
import { clienteFalso } from './ayudas-lote.js';

const VENTANA = 5; // ms de silencio que el coordinador espera antes de cerrar un lote (corto para las pruebas)

const pet = (modelo, n, extra = {}) => ({ modelo, usaLote: true, sistema: 'S', usuario: `${modelo}-${n}`, razonamiento: 'medium', ...extra });
const nuevo = (cliente, extra = {}) => crearCoordinador({ cliente, ventanaMs: VENTANA, cadaMs: 1, ...extra });

test('junta en un solo lote por modelo todo lo que llega a la vez y le da a cada peticion SU resultado', async () => {
  const cliente = clienteFalso();
  const c = nuevo(cliente);
  const r = await Promise.all([c.pedir(pet('m/a', 1)), c.pedir(pet('m/b', 1)), c.pedir(pet('m/a', 2)), c.pedir(pet('m/b', 2))]);
  assert.deepEqual(r.map((x) => x.texto), ['eco:m/a-1', 'eco:m/b-1', 'eco:m/a-2', 'eco:m/b-2']);
  assert.equal(cliente.enviados.length, 2);
  assert.deepEqual(cliente.enviados.map((e) => [e.modelo, e.n]).sort(), [['m/a', 2], ['m/b', 2]]);
  assert.ok(r.every((x) => x.finishReason === 'stop'));
});

test('lo que llega en otra tanda (la ronda siguiente) va en otro lote', async () => {
  const cliente = clienteFalso();
  const c = nuevo(cliente);
  await Promise.all([c.pedir(pet('m/a', 1)), c.pedir(pet('m/a', 2))]);
  await Promise.all([c.pedir(pet('m/a', 3)), c.pedir(pet('m/a', 4))]);
  assert.deepEqual(cliente.enviados.map((e) => e.n), [2, 2]);
});

test('cada peticion recibe su parte del uso y del costo del lote', async () => {
  const c = nuevo(clienteFalso({ costoPorLote: 0.004 }));
  const [x, y] = await Promise.all([c.pedir(pet('m/a', 1)), c.pedir(pet('m/a', 2))]);
  assert.deepEqual(x.uso, { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, costo: 0.002 });
  assert.deepEqual(y.uso, x.uso);
});

test('un modelo sin variante de lote usa la llamada normal y no crea lotes', async () => {
  const cliente = clienteFalso();
  const llamadas = [];
  const c = nuevo(cliente, { sincrono: async (p) => { llamadas.push(p); return { texto: 'directo', uso: { total_tokens: 7 }, finishReason: 'stop' }; } });
  const r = await c.pedir(pet('m/sin-lote', 1, { usaLote: false }));
  assert.equal(r.texto, 'directo');
  assert.equal(cliente.enviados.length, 0);
  assert.deepEqual(llamadas.map((l) => [l.modelo, l.razonamiento]), [['m/sin-lote', 'medium']]);
  assert.equal(c.estadisticas().sincronas, 1);
});

test('una peticion fallida rechaza solo a ella; las demas del lote siguen', async () => {
  const c = nuevo(clienteFalso({ responder: (cu) => (cu.messages[1].content.endsWith('-2') ? { error: 'proveedor caido' } : { texto: 'bien' }) }));
  const r = await Promise.allSettled([c.pedir(pet('m/a', 1)), c.pedir(pet('m/a', 2)), c.pedir(pet('m/a', 3))]);
  assert.deepEqual(r.map((x) => x.status), ['fulfilled', 'rejected', 'fulfilled']);
  assert.match(r[1].reason.message, /proveedor caido/);
});

test('si el envio del lote falla, todas sus peticiones rechazan con la causa', async () => {
  const c = nuevo(clienteFalso({ falloDeEnvio: 'OpenRouter 402: sin credito' }));
  const r = await Promise.allSettled([c.pedir(pet('m/a', 1)), c.pedir(pet('m/a', 2))]);
  assert.ok(r.every((x) => x.status === 'rejected' && /402/.test(x.reason.message)));
});

test('si el lote termina vencido o fallido, las peticiones sin resultado rechazan con el estado', async () => {
  const c = nuevo(clienteFalso({ estado: 'expired', sinResultadoPara: () => true }));
  const [r] = await Promise.allSettled([c.pedir(pet('m/a', 1))]);
  assert.equal(r.status, 'rejected');
  assert.match(r.reason.message, /expired/);
});

test('el tope de gasto frena el envio de lotes nuevos en cuanto se alcanza', async () => {
  const cliente = clienteFalso({ costoPorLote: 0.01 });
  const c = nuevo(cliente, { tope: 0.015 });
  await c.pedir(pet('m/a', 1));            // gasto 0.01: aun hay margen
  await c.pedir(pet('m/a', 2));            // gasto 0.02: ya paso el tope
  await assert.rejects(c.pedir(pet('m/a', 3)), /tope de gasto/);
  assert.equal(cliente.enviados.length, 2, 'no se envio un tercer lote');
  const e = c.estadisticas();
  assert.equal(e.topeAlcanzado, true);
  assert.equal(+e.gasto.toFixed(4), 0.02);
});

test('parte en varios lotes lo que pasa del maximo por lote', async () => {
  const cliente = clienteFalso();
  const c = nuevo(cliente, { maxPorLote: 2 });
  await Promise.all([1, 2, 3, 4, 5].map((n) => c.pedir(pet('m/a', n))));
  assert.deepEqual(cliente.enviados.map((e) => e.n), [2, 2, 1]);
});

test('avisa cada lote enviado y terminado, y lleva la cuenta', async () => {
  const eventos = [];
  const c = nuevo(clienteFalso({ costoPorLote: 0.003 }), { alEvento: (e) => eventos.push(e) });
  await Promise.all([c.pedir(pet('m/a', 1)), c.pedir(pet('m/b', 1))]);
  assert.deepEqual(eventos.filter((e) => e.tipo === 'enviado').map((e) => [e.modelo, e.n]).sort(), [['m/a', 1], ['m/b', 1]]);
  const listos = eventos.filter((e) => e.tipo === 'listo');
  assert.equal(listos.length, 2);
  assert.ok(listos.every((e) => e.estado === 'completed' && e.costo === 0.003 && typeof e.segundos === 'number'));
  const est = c.estadisticas();
  assert.equal(est.lotes, 2);
  assert.equal(est.peticiones, 2);
  assert.deepEqual(Object.keys(est.porModelo).sort(), ['m/a', 'm/b']);
});

// ---------- huecos que encontro la revision independiente (10 de octubre de 2026) ----------
test('si falla el seguimiento de un lote YA enviado, no sale ningun lote nuevo y queda anotado (ese lote sigue cobrandose)', async () => {
  const cliente = clienteFalso({ falloDeEsperar: 'red caida' });
  const eventos = [];
  const c = nuevo(cliente, { alEvento: (e) => eventos.push(e) });
  await assert.rejects(c.pedir(pet('m/a', 1)), /red caida/);
  // el turno siguiente NO envia otro lote (antes si lo enviaba: 30 lotes con gasto 0)
  await assert.rejects(c.pedir(pet('m/a', 2)), /envios detenidos/);
  await assert.rejects(c.pedir(pet('m/s', 1, { usaLote: false })), /envios detenidos/);
  assert.equal(cliente.enviados.length, 1);
  const e = c.estadisticas();
  assert.equal(e.fallosDeSeguimiento, 1);
  assert.match(e.detenido, /lote-1/);
  assert.ok(eventos.some((ev) => ev.tipo === 'aviso' && /lote-1/.test(ev.texto)), 'avisa el id para poder consultarlo despues');
});

test('un lote que termina sin costo informado se entrega, pero detiene los envios nuevos: el tope no puede vigilar lo que no ve', async () => {
  const cliente = clienteFalso({ sinCosto: true });
  const c = nuevo(cliente, { tope: 0.5 });
  const r = await c.pedir(pet('m/a', 1));
  assert.equal(r.texto, 'eco:m/a-1');
  await assert.rejects(c.pedir(pet('m/a', 2)), /costo/);
  assert.equal(cliente.enviados.length, 1);
  assert.equal(c.estadisticas().costoNoInformado, 1);
});

test('un costo que llega como texto se suma como numero, no se concatena', async () => {
  const c = nuevo(clienteFalso({ costoPorLote: '0.004' }));
  await c.pedir(pet('m/a', 1));
  assert.equal(typeof c.estadisticas().gasto, 'number');
  assert.equal(c.estadisticas().gasto, 0.004);
});

test('resultados malformados no cuelgan ni tumban el proceso: todas las peticiones rechazan y los envios se detienen', async () => {
  const c = nuevo(clienteFalso({ resultadosRotos: true }));
  const espera = new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('colgado: una peticion nunca se resolvio')), 2000));
  const r = await Promise.race([Promise.allSettled([c.pedir(pet('m/a', 1)), c.pedir(pet('m/a', 2))]), espera]);
  assert.ok(r.every((x) => x.status === 'rejected'));
  await assert.rejects(c.pedir(pet('m/a', 3)), /envios detenidos/);
});

test('las llamadas normales suman al gasto de su modelo, y cada lote enviado queda en la lista de ids', async () => {
  const cliente = clienteFalso({ costoPorLote: 0.004 });
  const c = nuevo(cliente, { sincrono: async () => ({ texto: 'x', finishReason: 'stop', uso: { cost: 0.002 } }) });
  await Promise.all([c.pedir(pet('m/a', 1)), c.pedir(pet('m/s', 1, { usaLote: false }))]);
  const e = c.estadisticas();
  assert.equal(+e.porModelo['m/s'].gasto.toFixed(4), 0.002);
  assert.equal(+e.gasto.toFixed(4), 0.006);
  assert.deepEqual(e.ids, [{ id: 'lote-1', modelo: 'm/a', n: 1 }]);
});

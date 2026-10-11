// Cliente de la Batch API de OpenRouter, probado con un OpenRouter FALSO (sin red, sin llave, sin gastar nada).
// La forma de las respuestas sigue la documentacion oficial de OpenRouter (batch-quickstart) y se confirma con una sonda real
// (tarea 8 del plan del lote).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteLote, leerResultados, repartirUso } from '../lote.js';
import { fijarModo, CONTENDIENTES } from '../modelos.js';

const MODELO = CONTENDIENTES.claude.modelo;
const cuerpo = (n) => ({ max_tokens: 2000, temperature: 0.7, messages: [{ role: 'user', content: `hola ${n}` }], reasoning: { effort: 'medium' } });
const respuesta = (status, json) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(json) });

// OpenRouter falso: guarda lo que recibe y contesta con guiones preparados (el ultimo se repite)
function falso({ post = [respuesta(202, { id: 'lote-1', status: 'validating' })], get = [] } = {}) {
  const llamadas = [];
  const colaPost = [...post], colaGet = [...get];
  const fetchFn = async (url, init = {}) => {
    llamadas.push({ url, metodo: init.method ?? 'GET', cuerpo: init.body ? JSON.parse(init.body) : null, auth: init.headers?.Authorization });
    const fila = init.method === 'POST' ? colaPost : colaGet;
    const r = fila.length > 1 ? fila.shift() : fila[0];
    if (r instanceof Error) throw r;
    return r;
  };
  return { fetchFn, llamadas };
}
const sinPausa = async () => {};

test('enviar exige modo pago antes de tocar la red (el lote siempre gasta credito)', async () => {
  const f = falso();
  const cliente = crearClienteLote({ clave: 'k', fetchFn: f.fetchFn, pausa: sinPausa });
  await assert.rejects(cliente.enviar({ modelo: MODELO, peticiones: [{ id: 'a', cuerpo: cuerpo(1) }] }), /gasta credito/);
  assert.equal(f.llamadas.length, 0);
  fijarModo('pago');
});

test('enviar manda endpoint, modelo y peticiones en ESE orden (si "requests" va primero, OpenRouter responde 400)', async () => {
  const f = falso();
  const cliente = crearClienteLote({ clave: 'k-secreta', fetchFn: f.fetchFn, pausa: sinPausa });
  const lote = await cliente.enviar({ modelo: MODELO, peticiones: [{ id: 'p1', cuerpo: cuerpo(1) }, { id: 'p2', cuerpo: cuerpo(2) }] });
  assert.equal(lote.id, 'lote-1');
  const [l] = f.llamadas;
  assert.equal(l.metodo, 'POST');
  assert.equal(l.url, 'https://openrouter.ai/api/v1/batches');
  assert.equal(l.auth, 'Bearer k-secreta');
  assert.deepEqual(Object.keys(l.cuerpo), ['endpoint', 'model', 'requests']);
  assert.equal(l.cuerpo.endpoint, '/v1/chat/completions');
  assert.equal(l.cuerpo.model, MODELO, 'el modelo va sin el sufijo :batch');
  assert.deepEqual(l.cuerpo.requests.map((r) => r.custom_id), ['p1', 'p2']);
  assert.deepEqual(l.cuerpo.requests[0].body.reasoning, { effort: 'medium' });
  assert.equal('model' in l.cuerpo.requests[0].body, false);
});

test('un error al enviar se lanza con mensaje corto y sin datos de la cuenta, y NO se reintenta (podria duplicar el gasto)', async () => {
  const f = falso({ post: [respuesta(402, { error: { message: 'Insufficient credits user_id: user_abc123' } })] });
  const cliente = crearClienteLote({ clave: 'k', fetchFn: f.fetchFn, pausa: sinPausa });
  await assert.rejects(cliente.enviar({ modelo: MODELO, peticiones: [{ id: 'a', cuerpo: cuerpo(1) }] }), (e) => /402/.test(e.message) && !/user_abc123/.test(e.message));
  assert.equal(f.llamadas.length, 1);
});

test('consultar reintenta los errores del servidor y de red (leer es seguro) y se rinde despues de 3 intentos', async () => {
  const lote = { id: 'lote-1', status: 'in_progress' };
  const f = falso({ get: [respuesta(503, { error: { message: 'busy' } }), new Error('red caida'), respuesta(200, lote)] });
  const cliente = crearClienteLote({ clave: 'k', fetchFn: f.fetchFn, pausa: sinPausa });
  assert.deepEqual(await cliente.consultar('lote-1'), lote);
  assert.equal(f.llamadas.length, 3);
  const g = falso({ get: [respuesta(500, {})] });
  await assert.rejects(crearClienteLote({ clave: 'k', fetchFn: g.fetchFn, pausa: sinPausa }).consultar('lote-1'), /500/);
  assert.equal(g.llamadas.length, 3);
});

test('esperar consulta hasta un estado final, avisa cada cambio de estado y respeta el tiempo maximo', async () => {
  const final = { id: 'lote-1', status: 'completed', results: [] };
  const f = falso({ get: [respuesta(200, { status: 'validating' }), respuesta(200, { status: 'in_progress' }), respuesta(200, { status: 'in_progress' }), respuesta(200, final)] });
  const pausas = [], estados = [];
  const cliente = crearClienteLote({ clave: 'k', fetchFn: f.fetchFn, pausa: async (ms) => { pausas.push(ms); } });
  const r = await cliente.esperar('lote-1', { cadaMs: 15000, alCambiar: (e) => estados.push(e) });
  assert.equal(r.status, 'completed');
  assert.deepEqual(estados, ['validating', 'in_progress', 'completed']);
  assert.deepEqual(pausas, [15000, 15000, 15000]);

  // tiempo maximo con reloj falso: cada pausa adelanta el reloj
  let t = 0;
  const g = falso({ get: [respuesta(200, { status: 'in_progress' })] });
  const c2 = crearClienteLote({ clave: 'k', fetchFn: g.fetchFn, pausa: async (ms) => { t += ms; }, ahora: () => t });
  await assert.rejects(c2.esperar('lote-1', { cadaMs: 1000, maxMs: 3500 }), /se acabo la espera/);
});

test('esperar tolera un 404 al principio (el lote recien creado aun no se ve), se rinde si dura demasiado, y consultar suelto no lo reintenta', async () => {
  // visto el 10 oct 2026: GET /batches/ID dio 404 justo despues de crear 3 lotes que existian (20 s despues estaban in_progress)
  const noEsta = respuesta(404, { error: { message: 'Batch job lote-1 not found.' } });
  const final = { id: 'lote-1', status: 'completed', results: [] };
  const f = falso({ get: [noEsta, noEsta, respuesta(200, final)] });
  const pausas = [];
  const cliente = crearClienteLote({ clave: 'k', fetchFn: f.fetchFn, pausa: async (ms) => { pausas.push(ms); } });
  assert.equal((await cliente.esperar('lote-1', { cadaMs: 15000 })).status, 'completed');
  assert.equal(f.llamadas.length, 3);
  assert.deepEqual(pausas, [15000, 15000]);

  // si el 404 no se quita dentro del margen, falla con el 404 (un id equivocado no espera para siempre)
  let t = 0;
  const g = falso({ get: [noEsta] });
  const c2 = crearClienteLote({ clave: 'k', fetchFn: g.fetchFn, pausa: async (ms) => { t += ms; }, ahora: () => t });
  await assert.rejects(c2.esperar('lote-1', { cadaMs: 1000, graciaMs: 3500 }), /404/);
  assert.equal(g.llamadas.length, 5, 'consulta mientras dura el margen y una vez mas al vencer');

  // consultar suelto (ver-lote.mjs) no reintenta el 404: un id mal escrito debe fallar rapido
  const h = falso({ get: [noEsta] });
  await assert.rejects(crearClienteLote({ clave: 'k', fetchFn: h.fetchFn, pausa: sinPausa }).consultar('lote-1'), /404/);
  assert.equal(h.llamadas.length, 1);
});

test('leerResultados devuelve el texto de cada peticion y la causa de cada fallo', () => {
  const ok = (id, texto, fin = 'stop') => ({ id: `r-${id}`, custom_id: id, error: null, response: { status_code: 200, request_id: 'x', body: { choices: [{ index: 0, message: { role: 'assistant', content: texto }, finish_reason: fin }] } } });
  const lote = {
    results: [
      ok('a', '{"ok":true}'),
      ok('b', '', 'length'),
      { custom_id: 'c', response: null, error: { message: 'proveedor caido', code: 502 } },
      { custom_id: 'd', error: null, response: { status_code: 429, body: { error: { message: 'limite' } } } },
      { custom_id: 'e', error: null, response: { status_code: 200, body: { choices: [{ message: { content: 'x' }, finish_reason: 'error' }] } } },
    ],
  };
  const m = leerResultados(lote);
  assert.deepEqual(m.get('a'), { texto: '{"ok":true}', finishReason: 'stop' });
  assert.deepEqual(m.get('b'), { texto: '', finishReason: 'length' });
  assert.match(m.get('c').error, /proveedor caido/);
  assert.match(m.get('d').error, /429/);
  assert.match(m.get('e').error, /finish_reason=error/);
  assert.equal(m.has('zzz'), false);
  assert.equal(leerResultados({ results: null }).size, 0);
});

test('repartirUso reparte el uso y el costo del lote (que viene por lote, no por peticion) entre las peticiones que se cobraron', () => {
  const lote = { request_counts: { total: 4, completed: 3, failed: 1 }, usage: { prompt_tokens: 3000, completion_tokens: 900, total_tokens: 3900, cost: 0.003 } };
  assert.deepEqual(repartirUso(lote), { prompt_tokens: 1000, completion_tokens: 300, total_tokens: 1300, costo: 0.001 });
  assert.deepEqual(repartirUso({ request_counts: { total: 2, completed: 0, failed: 2 }, usage: null }), { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, costo: 0 });
});

test('credito lee el saldo de OpenRouter', async () => {
  const f = falso({ get: [respuesta(200, { data: { total_credits: 10, total_usage: 2.5 } })] });
  const cliente = crearClienteLote({ clave: 'k', fetchFn: f.fetchFn, pausa: sinPausa });
  assert.deepEqual(await cliente.credito(), { total: 10, usado: 2.5, restante: 7.5 });
  assert.equal(f.llamadas[0].url, 'https://openrouter.ai/api/v1/credits');
});

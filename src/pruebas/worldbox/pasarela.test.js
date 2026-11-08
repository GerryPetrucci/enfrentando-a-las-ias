import test from 'node:test';
import assert from 'node:assert/strict';
import { crearPasarela, llamarReal } from '../../worldbox/pasarela.js';
import { crearLimitador } from '../../limitador.js';

const texto = JSON.stringify({ actions: [{ action: 'esperar', parameters: {} }], reasoning_summary: '' });
const llamada = { modelo: 'falso', sistema: 'reglas', usuario: 'estado' };
const base = { presupuesto: 1, presupuestoModelo: 1, tarifas: { falso: { entrada: 1, salida: 2 } }, maxTokens: 20, timeoutMs: 100, limitador: { esperar: async () => {} } };
test('costo reportado incluso cero y uso exacto; no guarda razonamiento ni claves', async () => {
  for (const cost of [0, 0.02]) {
    const p = crearPasarela({ ...base, llamar: async o => { assert.equal(o.reintentos, 0); return { texto, uso: { prompt_tokens: 10, completion_tokens: 4, cost }, razonamiento: 'privado', finishReason: 'stop' }; } });
    const r = await p.decidir(llamada);
    assert.equal(r.error_type, null); assert.equal(r.cost, cost); assert.equal(r.cost_source, 'reportado');
    assert.equal(r.input_tokens, 10); assert.equal(r.output_tokens, 4); assert.ok(r.request_id); assert.equal(r.razonamiento, undefined);
    assert.ok(Math.abs(p.consumo().total - cost) < 1e-12);
  }
});
test('sin costo usa tarifa y tokens; sin uso reserva conservadora marcada', async () => {
  const p = crearPasarela({ ...base, llamar: async () => ({ texto, uso: { prompt_tokens: 10, completion_tokens: 4 } }) });
  const r = await p.decidir(llamada); assert.equal(r.cost, 18 / 1e6); assert.equal(r.cost_source, 'estimado');
  const sinUso = await crearPasarela({ ...base, llamar: async () => ({ texto }) }).decidir(llamada);
  assert.equal(sinUso.input_tokens, Buffer.byteLength('reglasestado') + 256); assert.equal(sinUso.output_tokens, 20); assert.equal(sinUso.cost_source, 'estimado');
});
test('reserva por modelo y competencia bloquea ANTES de llamar; tarifas obligatorias', async () => {
  let llamadas = 0; const llamar = async () => { llamadas++; return { texto }; };
  for (const config of [{ presupuesto: 0 }, { presupuestoModelo: 0 }, { tarifas: {} }]) {
    const p = crearPasarela({ ...base, ...config, llamar });
    assert.ok(['presupuesto', 'tarifa_requerida'].includes((await p.decidir(llamada)).error_type));
  }
  assert.equal(llamadas, 0);
});
test('reintenta 429 y registra todos los intentos y costo incierto', async () => {
  let llamadas = 0;
  const p = crearPasarela({ ...base, llamar: async () => { if (!llamadas++) throw Object.assign(new Error('429 cuenta secreta'), { status: 429 }); return { texto, uso: { cost: 0.01, prompt_tokens: 10, completion_tokens: 5 } }; } });
  const r = await p.decidir(llamada);
  assert.equal(llamadas, 2); assert.equal(r.retry_count, 1); assert.equal(r.error_type, null); assert.equal(r.intentos[0].error_type, '429');
  assert.ok(r.cost > 0.01); assert.equal(r.cost_source, 'estimado'); assert.ok(!JSON.stringify(r).includes('secreta'));
});
test('contenido invalido (cortado, vacio, JSON roto, esquema malo) NO se reintenta: una llamada, costo contado, texto guardado y circuito intacto', async () => {
  for (const [fallo, esperado] of [[{ texto, finishReason: 'length' }, 'respuesta_incompleta'], [{ texto: '{invalido', finishReason: 'stop' }, 'json_invalido'], [{ texto: '', finishReason: 'stop' }, 'respuesta_incompleta'],
    [{ texto: '{"actions":[],"reasoning_summary":""}', finishReason: 'stop' }, 'respuesta_invalida'], [{ texto: '{roto', finishReason: 'length' }, 'respuesta_incompleta']]) {
    let n = 0;
    const p = crearPasarela({ ...base, umbralCircuito: 1, llamar: async () => { n++; return { ...fallo, uso: { cost: 0.01, prompt_tokens: 5, completion_tokens: 3 } }; } });
    const r = await p.decidir(llamada);
    assert.equal(n, 1, esperado); assert.equal(r.retry_count, 0); assert.equal(r.cost, 0.01); assert.equal(r.error_type, esperado); assert.equal(r.input_tokens, 5);
    assert.equal(r.intentos.length, 1); assert.equal(r.intentos[0].texto, fallo.texto); assert.equal(r.intentos[0].tipo_error, 'contenido'); assert.equal(r.texto, fallo.texto);
    // El proveedor SI contesto: ni abre el circuito (umbral 1) ni se vuelve a perdonar la siguiente decision.
    assert.equal((await p.decidir(llamada)).error_type, esperado); assert.equal(n, 2);
  }
});
test('los fallos TECNICOS si se reintentan (error del proveedor a media respuesta, 5xx, red) y guardan el texto de cada intento', async () => {
  let n = 0;
  const p = crearPasarela({ ...base, llamar: async () => { n++; if (n === 1) return { texto: 'parcial', finishReason: 'error', uso: { cost: 0.01 } }; if (n === 2) throw Object.assign(new Error('503 upstream'), { status: 503 }); return { texto, uso: { cost: 0.01, prompt_tokens: 5, completion_tokens: 3 }, razonamiento_efectivo: 'medium' }; }, reintentos: 2 });
  const r = await p.decidir(llamada);
  assert.equal(n, 3); assert.equal(r.error_type, null); assert.equal(r.retry_count, 2);
  assert.deepEqual(r.intentos.map(i => [i.error_type, i.tipo_error]), [['proveedor', 'tecnico'], ['proveedor', 'tecnico'], [null, null]]);
  assert.deepEqual(r.intentos.map(i => i.texto), ['parcial', '', texto], 'texto de CADA intento en la traza privada');
  assert.equal(r.razonamiento_efectivo, 'medium'); assert.equal(r.intentos[2].razonamiento_efectivo, 'medium'); assert.equal(r.intentos[0].razonamiento_efectivo, null);
  // Una respuesta enorme se acota en la traza (20 000) y en el resultado (100 000).
  const q = crearPasarela({ ...base, llamar: async () => ({ texto: 'x'.repeat(150000), finishReason: 'stop' }) });
  const g = await q.decidir(llamada); assert.equal(g.intentos[0].texto.length, 20000); assert.equal(g.texto.length, 100000);
});
test('timeout cancela, no duplica solicitud y conserva reserva; circuito por modelo', async () => {
  let abortada = false, llamadas = 0;
  const p = crearPasarela({ ...base, timeoutMs: 10, umbralCircuito: 1, llamar: ({ signal }) => { llamadas++; signal.addEventListener('abort', () => { abortada = true; }); return new Promise(() => {}); } });
  const r = await p.decidir(llamada);
  assert.equal(r.error_type, 'tiempo_agotado'); assert.ok(abortada); assert.equal(llamadas, 1); assert.ok(r.cost > 0);
  assert.equal((await p.decidir(llamada)).error_type, 'circuito_abierto'); assert.equal(llamadas, 1);
});
test('sin presupuesto no se espera al limitador ni se llama: el corte es inmediato', async () => {
  let esperas = 0, llamadas = 0;
  const p = crearPasarela({ ...base, presupuesto: 0, limitador: { esperar: async () => { esperas++; } }, llamar: async () => { llamadas++; return { texto }; } });
  assert.equal((await p.decidir(llamada)).error_type, 'presupuesto'); assert.deepEqual([esperas, llamadas], [0, 0]);
});
test('limite de tokens evita llamar y la tarifa insuficiente detiene al sobrepasar', async () => {
  let n = 0;
  const p = crearPasarela({ ...base, llamar: async () => { n++; return { texto, uso: { cost: 2 } }; } });
  assert.equal((await p.decidir({ ...llamada, limiteTokens: 10 })).error_type, 'limite_tokens'); assert.equal(n, 0);
  assert.equal((await p.decidir(llamada)).error_type, 'presupuesto_excedido'); assert.equal(n, 1);
  assert.equal((await p.decidir(llamada)).error_type, 'presupuesto'); assert.equal(n, 1);
});
test('rate limit reutiliza limitador; reserva concurrente no permite sobregasto', async () => {
  let reloj = 0, esperas = [], llamadas = 0;
  const limitador = crearLimitador({ porMinuto: 20, ahora: () => reloj, pausa: async ms => { esperas.push(ms); reloj += ms; } });
  const p = crearPasarela({ ...base, limitador, llamar: async () => ({ texto, uso: { cost: 0 } }) });
  await p.decidir(llamada); await p.decidir(llamada); assert.deepEqual(esperas, [3000]);
  const q = crearPasarela({ ...base, presupuesto: 0.0004, presupuestoModelo: 0.0004, llamar: async () => { llamadas++; await new Promise(r => setTimeout(r, 10)); return { texto }; } });
  const respuestas = await Promise.all([q.decidir(llamada), q.decidir(llamada)]);
  assert.equal(llamadas, 1); assert.equal(respuestas.filter(r => r.error_type === 'presupuesto').length, 1);
});
test('la entrada real exige pago explicito al construir', () => {
  assert.throws(() => crearPasarela({ ...base }), /pago_no_autorizado/);
  assert.throws(() => crearPasarela({ ...base, modo: 'gratis' }), /pago_no_autorizado/);
  assert.doesNotThrow(() => crearPasarela({ ...base, modo: 'pago' }));
  // La llamada real se niega ANTES de arrancar un worker o tocar la red si el modo no es pago.
  for (const modo of [undefined, 'gratis', 'Pago', '']) assert.throws(() => llamarReal({ modelo: 'lab/uno', sistema: 's', usuario: 'u', modo }), /pago_no_autorizado/);
});
test('configuracion invalida de la pasarela se rechaza al construir', () => {
  for (const mal of [{ presupuesto: -1 }, { presupuesto: NaN }, { presupuestoModelo: -1 }, { maxTokens: 0 }, { maxTokens: 10 ** 9 }, { timeoutMs: 0 }, { reintentos: 4 }, { reintentos: 1.5 }, { umbralCircuito: 0 }]) {
    assert.throws(() => crearPasarela({ ...base, llamar: async () => ({ texto }), ...mal }), /solicitud_invalida/, JSON.stringify(mal));
  }
});
test('la configuracion registrada incluye limites y tarifas pero ninguna clave', () => {
  const p = crearPasarela({ ...base, llamar: async () => ({ texto }) });
  assert.deepEqual(Object.keys(p.configuracion).sort(), ['maxTokens', 'presupuesto', 'presupuestoModelo', 'recuperacionMs', 'reintentos', 'tarifas', 'temperatura', 'timeoutMs', 'umbralCircuito']);
  assert.ok(!/key|token_?secreto|authorization/i.test(JSON.stringify(Object.keys(p.configuracion))));
});
test('una respuesta que no contesta con texto se cuenta como incompleta y consume presupuesto', async () => {
  const p = crearPasarela({ ...base, reintentos: 0, llamar: async () => ({ texto: undefined, uso: { cost: 0.25, prompt_tokens: 5, completion_tokens: 0 }, finishReason: 'stop' }) });
  const r = await p.decidir(llamada);
  assert.equal(r.error_type, 'respuesta_incompleta'); assert.equal(r.cost, 0.25); assert.equal(r.texto, '');
  assert.ok(Math.abs(p.consumo().total - 0.25) < 1e-12);
});
test('el consumo por modelo y total suma lo gastado en cada decision', async () => {
  const p = crearPasarela({ ...base, tarifas: { a: { entrada: 1, salida: 1 }, b: { entrada: 1, salida: 1 } }, llamar: async () => ({ texto, uso: { cost: 0.125, prompt_tokens: 1, completion_tokens: 1 } }) });
  await p.decidir({ ...llamada, modelo: 'a' }); await p.decidir({ ...llamada, modelo: 'a' }); await p.decidir({ ...llamada, modelo: 'b' });
  const c = p.consumo();
  assert.ok(Math.abs(c.total - 0.375) < 1e-12 && Math.abs(c.modelos.a - 0.25) < 1e-12 && Math.abs(c.modelos.b - 0.125) < 1e-12); assert.deepEqual(Object.keys(c.modelos), ['a', 'b']);
});

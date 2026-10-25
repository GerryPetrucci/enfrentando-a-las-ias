// herramientas/prueba-de-humo-modelos.mjs llama a modelos de verdad (con --ejecutar), asi que NO corre en npm test.
// Aqui se prueba todo lo demas con una funcion `llamar` falsa y catalogos inventados: las vistas, la validacion del motor,
// los veredictos, los topes de llamadas y de dolares, y que sin --ejecutar nunca se llame a nada.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANDIDATOS, IDS_PRUEBAS, LLAMADAS_MAX, armarMesa, construirPruebas, resolverCandidatos, estimarModelo,
  ejecutarPrueba, veredicto, correrPrueba, costoDeUso, razonamientoDe,
} from '../../herramientas/prueba-de-humo-modelos.mjs';
import { CONTENDIENTES } from '../modelos.js';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const mesa = armarMesa();
const pruebas = construirPruebas(mesa);
const prueba = (id) => pruebas.find((p) => p.id === id);
const candidato = { clave: 'x', nombre: 'X', modelo: 'p/x', razonamiento: 'medium', precio: { entrada: 1, salida: 4 } };

// Un asiento vivo distinto del que responde, que no sea lobo (objetivo valido para matar, inspeccionar o votar).
const ajenoNoLobo = (E, yo) => E.roles.findIndex((r, i) => i !== yo && E.vivos[i] && r !== 'lobo');

test('las 3 pruebas se arman con el motor real: fases, asientos y prompt de produccion', () => {
  assert.deepEqual(pruebas.map((p) => p.id), IDS_PRUEBAS);
  assert.equal(mesa.noche.fase, 'lobos');
  assert.equal(mesa.dia.fase, 'dia');
  assert.equal(mesa.noche.roles[mesa.asientoLobo], 'lobo');
  assert.equal(mesa.dia.roles[mesa.asientoVidente], 'vidente');
  assert.ok(mesa.dia.vivos[mesa.asientoVidente]);
  assert.match(prueba('dilema').sistema, /Dilema del Prisionero Negociado/);
  assert.match(prueba('dilema').usuario, /"ronda": 3/);
  assert.match(prueba('lobo-noche').sistema, /Lobo en la aldea/);
  assert.match(prueba('lobo-noche').usuario, /"fase":"lobos"/);
  assert.match(prueba('lobo-noche').usuario, /"manada"/);
  assert.match(prueba('lobo-dia').usuario, /"fase":"dia"/);
  assert.match(prueba('lobo-dia').usuario, /"inspecciones":\[\{/);
  assert.match(prueba('lobo-dia').sistema, /afirmaRol/);
});

test('las fixtures son reproducibles: dos armados dan exactamente los mismos prompts', () => {
  const otra = construirPruebas(armarMesa());
  assert.deepEqual(otra.map((p) => [p.sistema, p.usuario]), pruebas.map((p) => [p.sistema, p.usuario]));
});

test('la vista de la noche no filtra roles ajenos que la IA no debe ver', () => {
  const vista = JSON.parse(prueba('lobo-noche').usuario.split('\n\n')[1]);
  const conRol = vista.jugadores.filter((j) => j.rol);
  assert.deepEqual(conRol.map((j) => j.rol), ['cupido'], 'en la noche 1 nadie ha muerto: el unico rol publico es Cupido, revelado por regla');
  assert.equal(vista.manada.length, 2);
});

test('dilema: acepta una jugada valida y rechaza una fuera de C/T', () => {
  const { evaluar } = prueba('dilema');
  assert.equal(evaluar({ jugada: 'C', promesa: 'T', mensaje: 'hola', razon: 'x' }).ok, true);
  assert.equal(evaluar({ jugada: 'T', promesa: 'C' }).ok, true);
  const mala = evaluar({ jugada: 'cooperar', mensaje: 1 });
  assert.equal(mala.ok, true, 'cooperar empieza con C: el motor la lee como C');
  const rota = evaluar({ jugada: 'X', promesa: 'C' });
  assert.equal(rota.ok, false);
  assert.match(rota.motivo, /jugada:string/);
  assert.match(evaluar({ jugada: 'C' }).notas[0], /promesa ausente/);
});

test('lobo-noche: matar a un no lobo es valido; matar a la manada, un objetivo en texto o la accion equivocada, no', () => {
  const { evaluar } = prueba('lobo-noche');
  const yo = mesa.asientoLobo, presa = ajenoNoLobo(mesa.noche, yo);
  const companero = mesa.noche.roles.findIndex((r, i) => r === 'lobo' && i !== yo);
  assert.equal(evaluar({ accion: 'matar', objetivo: presa }).ok, true);
  assert.equal(evaluar({ accion: 'matar', objetivo: companero }).ok, false, 'un lobo no puede matar a su manada');
  assert.equal(evaluar({ accion: 'matar', objetivo: yo }).ok, false);
  assert.equal(evaluar({ accion: 'matar', objetivo: String(presa) }).ok, false, 'el objetivo debe ser un entero, no texto');
  assert.equal(evaluar({ accion: 'inspeccionar', objetivo: presa }).ok, false);
  assert.equal(evaluar({ objetivo: presa }).ok, false);
  assert.match(evaluar({ accion: 'matar', objetivo: String(presa) }).motivo, /objetivo:string/);
});

test('lobo-dia: voto + mensaje validos; autovoto, voto en texto y afirmaRol inexistente no; afirmaRol valido queda anotado', () => {
  const { evaluar } = prueba('lobo-dia');
  const yo = mesa.asientoVidente, voto = ajenoNoLobo(mesa.dia, yo);
  assert.deepEqual(evaluar({ mensaje: 'Sospecho de alguien.', voto }), { ok: true, notas: [] });
  assert.deepEqual(evaluar({ mensaje: 'Soy vidente.', voto, afirmaRol: 'vidente' }).notas, ['declaró rol: vidente']);
  assert.equal(evaluar({ mensaje: 'x', voto: yo }).ok, false, 'no se puede votar a si mismo');
  assert.equal(evaluar({ mensaje: 'x', voto: String(voto) }).ok, false);
  assert.equal(evaluar({ mensaje: 'x', voto, afirmaRol: 'rey' }).ok, false);
  assert.equal(evaluar({ mensaje: 'x'.repeat(1001), voto }).ok, false);
  assert.equal(evaluar({ voto }).ok, false, 'sin mensaje el motor la marca invalida');
});

test('ejecutarPrueba: cada forma de fallar queda con su motivo; las buenas respuestas pasan', async () => {
  const p = prueba('dilema');
  const con = (r) => ejecutarPrueba({ candidato, prueba: p, llamar: async () => r });
  const uso = { prompt_tokens: 1000, completion_tokens: 200 };

  const ok = await con({ texto: '```json\n{"jugada":"C","promesa":"C","mensaje":"a","razon":"b"}\n```', uso, finishReason: 'stop' });
  assert.equal(ok.ok, true);
  assert.equal(ok.tokensEntrada, 1000);
  assert.equal(ok.costo, (1000 * 1 + 200 * 4) / 1e6);

  assert.match((await con({ texto: '{"jugada":"C"', uso, finishReason: 'length' })).motivo, /max_tokens/);
  assert.match((await con({ texto: '{"jugada":"C","promesa":"C"}', uso, finishReason: 'length' })).motivo, /max_tokens/, 'cortada por length falla aunque el JSON parsee');
  assert.match((await con({ texto: '', uso, finishReason: 'stop' })).motivo, /vacía/);
  assert.match((await con({ texto: 'Cooperare, gracias.', uso, finishReason: 'stop' })).motivo, /JSON válido/);
  assert.match((await con({ texto: '{"jugada":"?"}', uso, finishReason: 'stop' })).motivo, /fuera de C\/T/);

  const roto = await ejecutarPrueba({ candidato, prueba: p, llamar: async () => { throw new Error('OpenRouter 404: no endpoints'); } });
  assert.equal(roto.ok, false);
  assert.match(roto.motivo, /error de la llamada: OpenRouter 404/);
  assert.equal(roto.fatal, false);
  const sinCredito = await ejecutarPrueba({ candidato, prueba: p, llamar: async () => { throw new Error('OpenRouter 402: Insufficient credits'); } });
  assert.equal(sinCredito.fatal, true);
});

test('costoDeUso: prefiere el costo que informa el proveedor; si no, tokens x precio del catalogo; sin datos completos, null', () => {
  const precio = { entrada: 2, salida: 10 };
  assert.equal(costoDeUso({ cost: 0.0123, prompt_tokens: 1, completion_tokens: 1 }, precio), 0.0123);
  assert.equal(costoDeUso({ prompt_tokens: 1000, completion_tokens: 100 }, precio), (1000 * 2 + 100 * 10) / 1e6);
  assert.equal(costoDeUso(null, precio), null);
  assert.equal(costoDeUso({}, precio), null, 'un uso vacio no es gasto cero');
  assert.equal(costoDeUso({ prompt_tokens: 1000 }, precio), null, 'un uso parcial tampoco');
  assert.equal(costoDeUso({ prompt_tokens: 'mil', completion_tokens: 5 }, precio), null);
  assert.equal(costoDeUso({ cost: -1, prompt_tokens: 10, completion_tokens: 10 }, precio), (10 * 2 + 10 * 10) / 1e6, 'un cost no valido se ignora');
  assert.equal(costoDeUso({ prompt_tokens: 10, completion_tokens: 10 }, { entrada: 2 }), null, 'sin precio de salida no se puede calcular');
});

test('ejecutarPrueba: manda reintentos 0 (una llamada contada = una solicitud) y distingue errores que no cobran de los que si pudieron', async () => {
  const p = prueba('dilema');
  let recibido;
  await ejecutarPrueba({ candidato, prueba: p, llamar: async (args) => { recibido = args; return { texto: '{"jugada":"C"}', uso: null, finishReason: 'stop' }; } });
  assert.equal(recibido.reintentos, 0);
  assert.equal(recibido.modelo, 'p/x');
  assert.equal(recibido.razonamiento, 'medium');

  const falla = (mensaje) => ejecutarPrueba({ candidato, prueba: p, llamar: async () => { throw new Error(mensaje); } });
  assert.equal((await falla('OpenRouter 404: No endpoints found')).costo, 0, 'un 4xx se rechaza antes de procesar');
  assert.equal((await falla('OpenRouter 429: rate limited')).costo, 0);
  assert.equal((await falla('OpenRouter 502: upstream')).costo, null, 'un 5xx pudo cobrarse');
  assert.equal((await falla('El proveedor interrumpió la respuesta con un error (finish_reason=error).')).costo, null);
  assert.equal((await falla('fetch failed')).costo, null);
});

test('veredicto: 3/3 aprueba, 1 falla es dudoso si su repeticion sale bien, 2 o mas rechaza; lo cortado queda incompleto', () => {
  const ok = (prueba) => ({ prueba, ok: true });
  const mal = (prueba) => ({ prueba, ok: false });
  assert.equal(veredicto([ok('a'), ok('b'), ok('c')]), 'aprobado');
  assert.equal(veredicto([ok('a'), mal('b'), ok('c')], ok('b')), 'dudoso');
  assert.equal(veredicto([ok('a'), mal('b'), ok('c')], mal('b')), 'rechazado');
  assert.equal(veredicto([mal('a'), mal('b'), ok('c')]), 'rechazado');
  assert.equal(veredicto([mal('a'), mal('b'), { prueba: 'c', ok: false, omitida: true }]), 'rechazado');
  assert.equal(veredicto([mal('a'), mal('b')]), 'rechazado', 'dos fallas confirmadas rechazan aunque la corrida se corte');
  assert.equal(veredicto([ok('a'), ok('b')]), 'incompleto', 'si el tope corto la prueba, no se aprueba');
  assert.equal(veredicto([mal('a')]), 'incompleto', 'una falla y la corrida cortada: no se juzga al modelo');
  assert.equal(veredicto([ok('a'), mal('b'), ok('c')]), 'incompleto', 'falta la repeticion obligatoria: no es dudoso todavia');
});

// Un modelo falso que contesta bien (o no) segun el id de la prueba que reconoce por su prompt.
function modeloFalso({ fallan = [], uso = { prompt_tokens: 1000, completion_tokens: 100 } } = {}) {
  const llamadas = [];
  const llamar = async ({ modelo, sistema, usuario }) => {
    const id = sistema.includes('Dilema del Prisionero') ? 'dilema' : usuario.includes('"fase":"lobos"') ? 'lobo-noche' : 'lobo-dia';
    llamadas.push({ modelo, id });
    if (fallan.includes(id)) return { texto: 'no puedo ayudar', uso, finishReason: 'stop' };
    const respuesta = {
      dilema: { jugada: 'C', promesa: 'C', mensaje: 'hola', razon: 'x' },
      'lobo-noche': { accion: 'matar', objetivo: ajenoNoLobo(mesa.noche, mesa.asientoLobo) },
      'lobo-dia': { mensaje: 'hola', voto: ajenoNoLobo(mesa.dia, mesa.asientoVidente) },
    }[id];
    return { texto: JSON.stringify(respuesta), uso, finishReason: 'stop' };
  };
  return { llamar, llamadas };
}
const cand = (clave) => ({ ...candidato, clave, nombre: clave, modelo: `p/${clave}` });

test('correrPrueba: un modelo que contesta bien hace 3 llamadas y queda aprobado', async () => {
  const { llamar, llamadas } = modeloFalso();
  const r = await correrPrueba({ candidatos: [cand('a')], pruebas, llamar, topeUsd: 1 });
  assert.equal(r.modelos[0].veredicto, 'aprobado');
  assert.deepEqual(llamadas.map((l) => l.id), IDS_PRUEBAS);
  assert.equal(r.llamadas, 3);
  assert.equal(r.detenido, null);
  assert.equal(r.modelos[0].tokensEntrada, 3000);
  assert.ok(Math.abs(r.gastado - 3 * (1000 * 1 + 100 * 4) / 1e6) < 1e-12);
});

test('correrPrueba: una sola falla se repite UNA vez esa prueba y queda dudoso', async () => {
  const { llamar, llamadas } = modeloFalso({ fallan: ['lobo-noche'] });
  const r = await correrPrueba({ candidatos: [cand('a')], pruebas, llamar, topeUsd: 1 });
  assert.equal(r.modelos[0].veredicto, 'rechazado', 'la repeticion tambien falla con este modelo falso');
  assert.deepEqual(llamadas.map((l) => l.id), ['dilema', 'lobo-noche', 'lobo-dia', 'lobo-noche']);
  assert.equal(r.modelos[0].repeticion.prueba, 'lobo-noche');
  assert.equal(r.llamadas, 4);

  // Si la repeticion sale bien, queda dudoso.
  let n = 0;
  const flojo = async (args) => (args.usuario.includes('"fase":"lobos"') && n++ === 0 ? { texto: 'hmm', uso: null, finishReason: 'stop' } : modeloFalso().llamar(args));
  const r2 = await correrPrueba({ candidatos: [cand('a')], pruebas, llamar: flojo, topeUsd: 1 });
  assert.equal(r2.modelos[0].veredicto, 'dudoso');
  assert.equal(r2.modelos[0].repeticion.ok, true);
});

test('correrPrueba: con 2 fallas seguidas se omite la tercera llamada (rechazado sin gastar mas)', async () => {
  const { llamar, llamadas } = modeloFalso({ fallan: ['dilema', 'lobo-noche'] });
  const r = await correrPrueba({ candidatos: [cand('a')], pruebas, llamar, topeUsd: 1 });
  assert.equal(r.modelos[0].veredicto, 'rechazado');
  assert.equal(llamadas.length, 2);
  assert.equal(r.modelos[0].intentos[2].omitida, true);
});

test('correrPrueba: el tope en dolares detiene la corrida antes de la siguiente llamada', async () => {
  const { llamar } = modeloFalso({ uso: { prompt_tokens: 1000000, completion_tokens: 0 } }); // cada llamada cuesta $1
  const r = await correrPrueba({ candidatos: [cand('a'), cand('b')], pruebas, llamar, topeUsd: 2 });
  assert.equal(r.llamadas, 2, 'despues de gastar $2 no hace la tercera');
  assert.match(r.detenido, /tope de \$2/);
  assert.equal(r.modelos.length, 1, 'el segundo modelo ni se empieza');
  assert.equal(r.modelos[0].veredicto, 'incompleto');
});

test('correrPrueba: el tope fijo de llamadas manda aunque el dinero sobre', async () => {
  const { llamar } = modeloFalso();
  const r = await correrPrueba({ candidatos: [cand('a'), cand('b')], pruebas, llamar, topeUsd: 100, maxLlamadas: 4 });
  assert.equal(r.llamadas, 4);
  assert.match(r.detenido, /4 llamadas/);
});

test('correrPrueba: un error de llave o de credito (401/402) detiene todo', async () => {
  let n = 0;
  const llamar = async () => { n++; throw new Error('OpenRouter 402: Insufficient credits'); };
  const r = await correrPrueba({ candidatos: [cand('a'), cand('b')], pruebas, llamar, topeUsd: 1 });
  assert.equal(n, 1);
  assert.match(r.detenido, /impide seguir/);
});

test('sin costo conocido (uso ausente, vacio o parcial, o un fallo que pudo cobrarse) se reserva el peor caso', async () => {
  const peor = (prueba('dilema').sistema.length + prueba('dilema').usuario.length) / 3 * 1 / 1e6 + 4000 * 4 / 1e6;
  const bien = '{"jugada":"C","promesa":"C"}';
  for (const uso of [null, {}, { prompt_tokens: 1000 }]) {
    const llamar = async () => ({ texto: bien, uso, finishReason: 'stop' });
    const r = await correrPrueba({ candidatos: [cand('a')], pruebas: [prueba('dilema')], llamar, topeUsd: 100 });
    assert.ok(r.gastado >= peor * 0.999, `uso ${JSON.stringify(uso)}: cuenta los max_tokens enteros`);
    assert.equal(r.modelos[0].intentos[0].costoReservado, true);
  }
  const cae = async () => { throw new Error('OpenRouter 502: upstream'); };
  const r5 = await correrPrueba({ candidatos: [cand('a')], pruebas: [prueba('dilema')], llamar: cae, topeUsd: 100 });
  assert.ok(r5.gastado >= peor * 0.999, 'un 5xx pudo cobrarse: se reserva');
  const noCobra = async () => { throw new Error('OpenRouter 404: nada'); };
  assert.equal((await correrPrueba({ candidatos: [cand('a')], pruebas: [prueba('dilema')], llamar: noCobra, topeUsd: 100 })).gastado, 0);
});

test('el tope alcanzado por reservas de costo desconocido detiene la corrida', async () => {
  const { llamar: buena } = modeloFalso();
  const sinUso = async (args) => ({ ...(await buena(args)), uso: {} });
  const r = await correrPrueba({ candidatos: [cand('a'), cand('b')], pruebas, llamar: sinUso, topeUsd: 0.015 });
  assert.match(r.detenido, /tope de \$0\.015/);
  assert.ok(r.llamadas < 6);
});

test('correrPrueba se niega a empezar con un tope o un precio que dejarian el gasto sin control', async () => {
  const { llamar } = modeloFalso();
  for (const topeUsd of [0, -1, NaN, undefined, Infinity, '1']) {
    await assert.rejects(correrPrueba({ candidatos: [cand('a')], pruebas, llamar, topeUsd }), /Tope en dólares inválido/, `tope ${topeUsd}`);
  }
  for (const precio of [null, {}, { entrada: 1 }, { entrada: NaN, salida: 1 }, { entrada: 1, salida: -2 }]) {
    await assert.rejects(correrPrueba({ candidatos: [{ ...cand('a'), precio }], pruebas, llamar, topeUsd: 1 }), /sin precio válido/);
  }
});

test('correrPrueba: una falla y la corrida cortada por el tope deja el modelo incompleto, no dudoso ni rechazado', async () => {
  // Cada llamada cuesta $1 y el tope es $2: la 1.a falla, la 2.a pasa, y no hay una 3.a.
  const uso = { prompt_tokens: 1000000, completion_tokens: 0 };
  const { llamar } = modeloFalso({ fallan: ['dilema'], uso });
  const r = await correrPrueba({ candidatos: [cand('a')], pruebas, llamar, topeUsd: 2 });
  assert.equal(r.modelos[0].veredicto, 'incompleto');
  assert.equal(r.llamadas, 2);
});

test('correrPrueba: si el tope impide la repeticion obligatoria, queda incompleto', async () => {
  // 3 llamadas de $1: la del medio falla; con tope $3 ya no hay presupuesto para repetirla.
  const uso = { prompt_tokens: 1000000, completion_tokens: 0 };
  const { llamar, llamadas } = modeloFalso({ fallan: ['lobo-noche'], uso });
  const r = await correrPrueba({ candidatos: [cand('a')], pruebas, llamar, topeUsd: 3 });
  assert.equal(llamadas.length, 3);
  assert.equal(r.modelos[0].repeticion, null);
  assert.equal(r.modelos[0].veredicto, 'incompleto');
  assert.match(r.detenido, /tope de \$3/);
});

test('correrPrueba: un error de credito despues de una falla no se confunde con un rechazo del modelo', async () => {
  let n = 0;
  const llamar = async () => {
    if (n++ === 0) return { texto: 'no', uso: { prompt_tokens: 1, completion_tokens: 1 }, finishReason: 'stop' };
    throw new Error('OpenRouter 402: Insufficient credits');
  };
  const r = await correrPrueba({ candidatos: [cand('a'), cand('b')], pruebas, llamar, topeUsd: 1 });
  assert.equal(n, 2);
  assert.equal(r.modelos[0].veredicto, 'incompleto', 'el error de credito no cuenta como segunda falla del modelo');
  assert.equal(r.modelos[0].intentos[1].omitida, true);
  assert.match(r.modelos[0].intentos[1].motivo, /402/, 'pero queda anotado para el informe');
  assert.match(r.detenido, /impide seguir/);
  assert.equal(r.modelos.length, 1);
});

test('resolverCandidatos: un precio ausente o negativo en el catalogo es un problema, no un 0 que anule el tope', () => {
  const base = { context_length: 200000 };
  const catalogo = { data: [
    { id: 'x-ai/grok-4.3', ...base },
    { id: 'z-ai/glm-5.3', ...base, pricing: { prompt: '-1', completion: '-1' } },
    { id: 'qwen/qwen3.8-max-0902', ...base, pricing: { prompt: '0', completion: '0' } },
  ] };
  const [grok, glm, qwen] = resolverCandidatos(catalogo, ['grok', 'glm', 'qwen']);
  assert.match(grok.problema, /precio válido/);
  assert.equal(grok.precio, null);
  assert.match(glm.problema, /precio válido/);
  assert.equal(qwen.problema, null, 'un 0 explicito (gratis) si es un precio valido');
  assert.deepEqual(qwen.precio, { entrada: 0, salida: 0 });
});

test('resolverCandidatos: razonamiento "medium" solo si lo admite; avisa contexto corto y modelos ausentes', () => {
  const m = (id, extra = {}) => ({ id, pricing: { prompt: '0.000001', completion: '0.000004' }, context_length: 200000, ...extra });
  const catalogo = { data: [
    m('mistralai/mistral-medium-3-5', { reasoning: { supported_efforts: ['low', 'medium', 'high'] } }),
    m('x-ai/grok-4.3', { reasoning: { supported_efforts: ['low', 'high'] } }),
    m('microsoft/phi-4', { context_length: 16384, expiration_date: '2027-01-01' }),
  ] };
  const [mistral, grok, phi, glm] = resolverCandidatos(catalogo, ['mistral', 'grok', 'phi4', 'glm']);
  assert.equal(mistral.razonamiento, 'medium');
  assert.deepEqual(mistral.precio, { entrada: 1, salida: 4 });
  assert.equal(grok.razonamiento, null);
  assert.equal(phi.razonamiento, null);
  assert.equal(phi.avisos.length, 2);
  assert.match(phi.avisos[0], /16384 tokens/);
  assert.match(glm.problema, /no está en el catálogo/);
});

test('estimarModelo: el peor caso cuenta max_tokens enteros en 3 llamadas + la repeticion mas cara', () => {
  const e = estimarModelo(candidato, pruebas);
  const entradas = pruebas.map((p) => Math.ceil((p.sistema.length + p.usuario.length) / 3));
  const llamada = (n) => (n * 1 + 4000 * 4) / 1e6;
  assert.equal(e.tokensEntrada, entradas.reduce((a, b) => a + b, 0));
  assert.ok(Math.abs(e.peorCaso - (entradas.map(llamada).reduce((a, b) => a + b, 0) + Math.max(...entradas.map(llamada)))) < 1e-12);
  assert.ok(e.tipico < e.peorCaso);
  assert.ok(e.peorLlamada <= e.peorCaso / 3);
});

test('razonamientoDe: medium si lo ofrece; low si no y su defecto esta por encima; si no, null (su defecto)', () => {
  assert.equal(razonamientoDe({ supported_efforts: ['low', 'medium', 'high'], default_effort: 'high' }), 'medium');
  assert.equal(razonamientoDe({ supported_efforts: ['max', 'high', 'low'], default_effort: 'max' }), 'low', 'GLM 5.3');
  assert.equal(razonamientoDe({ supported_efforts: ['max', 'high', 'low', 'none'], default_effort: 'max' }), 'low', 'Kimi K3.1');
  assert.equal(razonamientoDe({ supported_efforts: ['high', 'none'], default_effort: 'high' }), null, 'sin "low" no se inventa un nivel');
  assert.equal(razonamientoDe({ supported_efforts: ['low', 'high'] }), null, 'sin defecto conocido no se adivina');
  assert.equal(razonamientoDe({ supported_efforts: ['low', 'high'], default_effort: 'low' }), null, 'si el defecto ya es bajo no hace falta mandar nada');
  assert.equal(razonamientoDe({ mandatory: false }), null);
  assert.equal(razonamientoDe(null), null);
});

test('un candidato que ya es contendiente apunta al mismo modelo (una clave, un modelo) y el maximo de llamadas cubre una repeticion por candidato', () => {
  for (const [clave, c] of Object.entries(CANDIDATOS)) {
    if (clave in CONTENDIENTES) assert.equal(CONTENDIENTES[clave].modelo, c.modelo, `${clave}: la clave del candidato y la del contendiente no coinciden`);
  }
  assert.ok(LLAMADAS_MAX >= Object.keys(CANDIDATOS).length * (IDS_PRUEBAS.length + 1));
});

// --- el programa: nunca debe llamar a nada sin --ejecutar, y siempre con catalogo guardado (sin red) ---
function programa(args, catalogo = { data: [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'humo-modelos-'));
  const archivo = join(dir, 'catalogo.json');
  writeFileSync(archivo, JSON.stringify(catalogo));
  try {
    return spawnSync(process.execPath, ['herramientas/prueba-de-humo-modelos.mjs', `--archivo=${archivo}`, ...args], { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, OPENROUTER_API_KEY: '' } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const catalogoCon = (...ids) => ({ data: ids.map((id) => ({ id, pricing: { prompt: '0.000001', completion: '0.000004' }, context_length: 200000, reasoning: { supported_efforts: ['medium'] } })) });

test('programa: sin --ejecutar solo estima y avisa que no llamo a ningun modelo', () => {
  const r = programa(['--modelos=grok,glm'], catalogoCon('x-ai/grok-4.3', 'z-ai/glm-5.3'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /grok\s+x-ai\/grok-4\.3/);
  assert.match(r.stdout, /peor caso/);
  assert.match(r.stdout, /NO llamó a ningún modelo/);
});

test('programa: un candidato ausente del catalogo se informa y la salida es 1 (nada que probar)', () => {
  const r = programa(['--modelos=grok']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PROBLEMA: x-ai\/grok-4\.3 no está en el catálogo/);
});

test('programa: --ejecutar exige lista explicita y tope en dolares, y un candidato desconocido se rechaza', () => {
  const sinLista = programa(['--ejecutar', '--tope-usd=1']);
  assert.equal(sinLista.status, 1);
  assert.match(sinLista.stderr, /lista explícita/);
  const sinTope = programa(['--ejecutar', '--modelos=grok']);
  assert.equal(sinTope.status, 1);
  assert.match(sinTope.stderr, /tope de gasto/);
  const ceroTope = programa(['--ejecutar', '--modelos=grok', '--tope-usd=0']);
  assert.equal(ceroTope.status, 1);
  const desconocido = programa(['--modelos=gpt-9']);
  assert.equal(desconocido.status, 1);
  assert.match(desconocido.stderr, /Candidato desconocido: gpt-9/);
});

// Examen de ingreso de modelos por juego (herramientas/examen-modelos.mjs). Todo con bots y llamadas falsas: nunca toca la red ni gasta credito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { escenariosDeConquista, escenariosDePartida, compararConReal, conVariante, parsearVariante, conSistema, leerSistema, veredictoDeExamen, correrExamen, candidatosDeContendientes, filaDeAptitud, fusionarAptitud } from '../../herramientas/examen-modelos.mjs';
import { PARAMETROS } from '../parametros.js';
import { correrPartida } from '../arena.js';
import { resolverAgente } from '../agentes.js';
import { construirSistema } from '../prompt.js';
import conquista from '../juegos/conquista.js';
import { reconstruirPrompts } from '../juegos/conquista/replay.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OPCIONES = { jugadores: 3, seed: 2970899132, bioma: 'cordillera', turnos: [2, 8, 15] };

test('los escenarios de Guerra salen del motor real, en los turnos pedidos y con prompts de produccion', () => {
  const escenarios = escenariosDeConquista(OPCIONES);
  assert.deepEqual(escenarios.map((e) => e.turno), [2, 8, 15]);
  assert.deepEqual(escenarios.map((e) => e.id), ['conquista-t2', 'conquista-t8', 'conquista-t15']);
  for (const e of escenarios) {
    assert.ok(e.sistema.length > 500, `${e.id}: sistema vacio`);
    assert.ok(e.usuario.length > 200, `${e.id}: usuario vacio`);
    assert.ok(e.tokensEstimados > 0);
    // El numero del escenario es el que lee el modelo en su prompt (y el de r.turno en una partida guardada), no el contador interno del motor.
    assert.match(e.usuario, new RegExp(`Turno ${e.turno} de `), `${e.id}: el prompt dice otro turno`);
  }
  // El historial crece: el prompt del turno 15 es mas largo que el del 2.
  assert.ok(escenarios[2].usuario.length > escenarios[0].usuario.length);
});

test('el mismo seed da los mismos prompts (el examen es reproducible)', () => {
  const a = escenariosDeConquista(OPCIONES).map((e) => [e.sistema, e.usuario]);
  const b = escenariosDeConquista(OPCIONES).map((e) => [e.sistema, e.usuario]);
  assert.deepEqual(a, b);
});

test('un turno que la partida de bots no alcanza es un error claro, no un escenario vacio', () => {
  assert.throws(() => escenariosDeConquista({ ...OPCIONES, turnos: [2, 99] }), /turno 99/);
});

// Hallazgo del primer examen real (28-oct): en la mesa de 4 reinos el asiento 0 cae antes del turno 15, y los escenarios de un reino muerto
// no tienen ninguna orden posible: el examen decia «no apto» por culpa del escenario, no del modelo.
const MESA_DE_4 = { jugadores: 4, seed: 2970899132, bioma: 'cordillera', turnos: [2, 8, 15, 22] };

test('el asiento examinado sigue vivo en todos los escenarios: por defecto se elige el reino mas grande del ultimo turno', () => {
  const escenarios = escenariosDeConquista(MESA_DE_4);
  assert.equal(new Set(escenarios.map((e) => e.asiento)).size, 1, 'el mismo asiento en todos los escenarios');
  assert.notEqual(escenarios[0].asiento, 0, 'en esta mesa el asiento 0 cae antes del turno 15');
  for (const e of escenarios) assert.ok(e.regiones > 0, `${e.id}: el reino del asiento ${e.asiento} no tiene regiones`);
  const ultimo = escenarios.at(-1);
  const r = ultimo.evaluar(ultimo.jugadaDeReferencia);
  assert.equal(r.ok, true, `${ultimo.id}: ${r.motivo}`);
});

test('pedir un asiento que ya cayo, o que no existe, es un error claro', () => {
  assert.throws(() => escenariosDeConquista({ ...MESA_DE_4, asiento: 0 }), /asiento 0.*eliminado.*turno (9|1\d|2\d)/);
  assert.throws(() => escenariosDeConquista({ ...MESA_DE_4, asiento: 7 }), /asiento 7.*no existe/);
});

test('evaluar acepta una jugada legal del motor y cuenta sus ordenes', () => {
  const [e] = escenariosDeConquista({ ...OPCIONES, turnos: [8] });
  const r = e.evaluar(e.jugadaDeReferencia);
  assert.equal(r.ok, true);
  assert.ok(r.ordenes.total > 0, 'la jugada de referencia trae ordenes');
  assert.equal(r.ordenes.validas, r.ordenes.total, 'la jugada del bot es toda legal');
});

test('evaluar rechaza lo que no es una jugada: lo que no es un objeto y el objeto sin la lista de ordenes', () => {
  const [e] = escenariosDeConquista({ ...OPCIONES, turnos: [8] });
  const lista = e.evaluar([1, 2]);
  assert.equal(lista.ok, false);
  assert.match(lista.motivo, /objeto JSON/);
  // El motor acepta un objeto sin "ordenes" (turno en blanco), pero para el examen eso es un formato mal entendido, no una decision.
  const sinCampo = e.evaluar({ hola: 'mundo' });
  assert.equal(sinCampo.ok, false);
  assert.match(sinCampo.motivo, /lista "ordenes"/);
  assert.deepEqual(sinCampo.ordenes, { validas: 0, total: 1 });
});

test('pasar el turno a proposito ("ordenes": []) es una jugada valida, no un fallo del modelo', () => {
  // Hallazgo del 28-10-2026: con el prompt nuevo GLM Flash razono que su 2o puesto estaba asegurado en el turno 30 y no ordeno nada.
  const [e] = escenariosDeConquista({ ...OPCIONES, turnos: [8] });
  const pasa = e.evaluar({ ordenes: [], nota: 'Mantengo posiciones.' });
  assert.equal(pasa.ok, true);
  assert.deepEqual(pasa.ordenes, { validas: 0, total: 0 });
});

test('evaluar cuenta las ordenes ilegales sin invalidar el resto', () => {
  const [e] = escenariosDeConquista({ ...OPCIONES, turnos: [8] });
  // Una orden que no existe en el motor: la respuesta se lee, pero la orden no es legal.
  const mezclada = e.evaluar({ ...e.jugadaDeReferencia, ordenes: [...e.jugadaDeReferencia.ordenes, 'conquistar la luna con 9999 lanceros'] });
  assert.equal(mezclada.ordenes.total, mezclada.ordenes.validas + 1);
});

// ---------- escenarios de una partida REAL guardada ----------
// Una partida de bots en la que el reino 0 (agresivo) se queda sin respuesta (corte por max_tokens) en sus llamadas 3 y 5, tal como en la partida de GLM Flash.
const CORTE = 'Respuesta cortada por max_tokens (finish_reason=length): el modelo se quedó sin espacio antes de dar su jugada.';
async function crudoReal() {
  const base = resolverAgente('agresivo', conquista);
  let llamadas = 0;
  const cortable = { ...base, async jugar(entrada) {
    llamadas++;
    if (llamadas === 3 || llamadas === 5) throw Object.assign(new Error(CORTE), { crudo: null, finishReason: 'length', uso: null });
    return base.jugar(entrada);
  } };
  const agentes = [cortable, ...['pacifico', 'economico', 'azar'].map((id) => resolverAgente(id, conquista))];
  const partida = await correrPartida({ juego: conquista, agentes, seed: 18 });
  return { etiqueta: 'prueba', prompt: { version: 'v', reglas: conquista.versionReglas, hash: createHash('sha256').update(construirSistema(conquista)).digest('hex') }, partidas: [partida] };
}

test('los escenarios de una partida real llevan el prompt que vio el reino y lo que paso en su llamada real', async () => {
  const crudo = await crudoReal();
  const escenarios = escenariosDePartida(crudo, { jugador: 'agresivo', turnos: [2, 3, 5] });
  assert.deepEqual(escenarios.map((e) => e.id), ['real-t2', 'real-t3', 'real-t5']);
  const reconstruidos = reconstruirPrompts(crudo.partidas[0]);
  for (const e of escenarios) {
    assert.equal(e.usuario, reconstruidos.turnos.find((t) => t.turno === e.turno).prompts[e.asiento]);
    assert.match(e.usuario, new RegExp(`Turno ${e.turno} de `));
    assert.equal(e.sistema, construirSistema(conquista));
    assert.ok(e.tokensEstimados > 0);
  }
  assert.deepEqual(escenarios.map((e) => e.real.cortada), [false, true, true]);
  assert.match(escenarios[1].real.error, /max_tokens/);
  assert.equal(escenarios[0].real.error, null);
});

test('sin pedir turnos se examinan todos los que el reino jugo', async () => {
  const crudo = await crudoReal();
  const jugados = reconstruirPrompts(crudo.partidas[0]).turnos.filter((t) => t.prompts[0] !== null).length;
  const escenarios = escenariosDePartida(crudo, { jugador: 'agresivo' });
  assert.equal(escenarios.length, jugados);
  assert.deepEqual(escenarios.filter((e) => e.real.cortada).map((e) => e.turno), [3, 5]);
});

test('una partida que no se puede reconstruir con fidelidad, con otro prompt o con datos que no existen se rechaza', async () => {
  const crudo = await crudoReal();
  const manipulada = structuredClone(crudo);
  manipulada.partidas[0].rondas[2].estado.dueno[0] = manipulada.partidas[0].rondas[2].estado.dueno[0] === 3 ? 2 : 3;
  assert.throws(() => escenariosDePartida(manipulada, { jugador: 'agresivo' }), /no coincide/);
  assert.throws(() => escenariosDePartida({ ...crudo, prompt: { ...crudo.prompt, hash: 'otro' } }, { jugador: 'agresivo' }), /otro prompt/);
  assert.throws(() => escenariosDePartida(crudo, { jugador: 'gpt-9' }), /Jugador desconocido.*agresivo.*pacifico/);
  assert.throws(() => escenariosDePartida(crudo, { jugador: 'agresivo', turnos: [99] }), /no jugó el turno 99/);
  assert.throws(() => escenariosDePartida(crudo, { jugador: 'agresivo', partida: 4 }), /partida 4/);
});

test('evaluar aplica la respuesta del modelo con las jugadas reales de los demas reinos', async () => {
  const crudo = await crudoReal();
  const ronda = crudo.partidas[0].rondas.find((r) => r.turno > 5 && r.respuestas[0]?.ordenes?.length);
  const [e] = escenariosDePartida(crudo, { jugador: 'agresivo', turnos: [ronda.turno] });
  const bien = e.evaluar({ ordenes: ronda.respuestas[0].ordenes });
  assert.equal(bien.ok, true);
  assert.ok(bien.ordenes.total > 0);
  assert.equal(e.evaluar([1]).ok, false);
  assert.equal(e.evaluar({ nada: 1 }).ok, false);
  // evaluar no gasta la mesa: se puede repetir con el mismo resultado.
  assert.deepEqual(e.evaluar({ ordenes: ronda.respuestas[0].ordenes }), bien);
});

// ---------- variante de prompt (experimento en memoria, sin tocar el juego) ----------
test('una variante cambia un texto del prompt de usuario de cada escenario, en memoria, y conserva todo lo demas', async () => {
  const crudo = await crudoReal();
  const originales = escenariosDePartida(crudo, { jugador: 'agresivo', turnos: [2, 3] });
  const antes = originales.map((e) => e.usuario);
  const leyenda = 'OCUPACION (g = granja, m = mercado, c = cuartel; region(unidades';
  const variantes = conVariante(originales, 'OCUPACION (region(unidades', leyenda);
  assert.deepEqual(originales.map((e) => e.usuario), antes, 'los escenarios originales no se tocan');
  for (const [i, v] of variantes.entries()) {
    assert.ok(v.usuario.includes(leyenda));
    assert.ok(!v.usuario.includes('OCUPACION (region(unidades'));
    assert.equal(v.sistema, originales[i].sistema, 'el prompt de sistema no cambia');
    assert.ok(v.tokensEstimados > originales[i].tokensEstimados, 'los tokens se recalculan');
    assert.equal(v.variante, true);
    assert.deepEqual(v.real, originales[i].real);
    assert.equal(typeof v.evaluar, 'function');
    assert.equal(v.id, originales[i].id);
  }
});

test('una variante cuyo texto no aparece en algun prompt es un error (no un experimento que no cambia nada)', async () => {
  const crudo = await crudoReal();
  const escenarios = escenariosDePartida(crudo, { jugador: 'agresivo', turnos: [2] });
  assert.throws(() => conVariante(escenarios, 'texto que no existe', 'x'), /no aparece en el prompt de real-t2/);
});

// ---------- prompt de sistema distinto (para probar un texto nuevo contra los estados reales de una partida) ----------
test('conSistema cambia el prompt de sistema de cada escenario y conserva el de usuario, la evaluacion y lo que paso en la real', async () => {
  const crudo = await crudoReal();
  const originales = escenariosDePartida(crudo, { jugador: 'agresivo', turnos: [2, 3] });
  const nuevos = conSistema(originales, 'REGLAS NUEVAS Y MUCHO MAS LARGAS '.repeat(3000)); // mas largo que cualquier prompt real
  for (const [i, n] of nuevos.entries()) {
    assert.ok(n.sistema.startsWith('REGLAS NUEVAS'));
    assert.equal(n.usuario, originales[i].usuario);
    assert.ok(n.tokensEstimados > originales[i].tokensEstimados);
    assert.equal(n.sistemaDistinto, true);
    assert.deepEqual(n.real, originales[i].real);
    assert.equal(typeof n.evaluar, 'function');
  }
  assert.ok(originales[0].sistema.length > 100 && !originales[0].sistema.startsWith('REGLAS NUEVAS'), 'los originales no se tocan');
});

test('un prompt de sistema distinto exige decirlo: sin eso, una partida jugada con otro prompt se sigue rechazando', async () => {
  const crudo = await crudoReal();
  const otroHash = { ...crudo, prompt: { ...crudo.prompt, hash: 'otro' } };
  assert.throws(() => escenariosDePartida(otroHash, { jugador: 'agresivo' }), /otro prompt/);
  const escenarios = escenariosDePartida(otroHash, { jugador: 'agresivo', turnos: [2], sistemaDistinto: true });
  assert.equal(escenarios.length, 1, 'con sistemaDistinto la comprobacion del hash se salta a proposito');
});

test('leerSistema solo lee archivos de texto dentro de privado/ y nunca llaves ni .env', () => {
  assert.throws(() => leerSistema('web/index.html'), /dentro de privado/);
  assert.throws(() => leerSistema('.env'), /dentro de privado/);
  assert.throws(() => leerSistema('privado/../.env'), /dentro de privado/);
  assert.throws(() => leerSistema('privado/spec/no-existe-12345.txt'), /No pude leer/);
  assert.throws(() => leerSistema('privado/.env'), /no se leen llaves/);
  assert.match(leerSistema('privado/spec/guerra-prompt-2.3.0-borrador.txt'), /Guerra de territorios/);
});

test('parsearVariante separa «texto viejo=>texto nuevo» en el primer =>', () => {
  assert.deepEqual(parsearVariante('a b=>c d'), { de: 'a b', a: 'c d' });
  assert.deepEqual(parsearVariante('a=>b=>c'), { de: 'a', a: 'b=>c' });
  assert.deepEqual(parsearVariante('quitar=>'), { de: 'quitar', a: '' });
  assert.throws(() => parsearVariante('sin separador'), /=>/);
  assert.throws(() => parsearVariante('=>nuevo'), /vacío/);
});

test('compararConReal cuenta cuantos turnos cortados en la partida real se vuelven a cortar, y cuantos de los buenos tambien', () => {
  const escenarios = [
    { id: 'real-t3', real: { cortada: true } }, { id: 'real-t4', real: { cortada: true } },
    { id: 'real-t5', real: { cortada: false } }, { id: 'real-t6', real: { cortada: false } },
  ];
  const corte = { ok: false, finishReason: 'length' };
  const intentos = [{ escenario: 'real-t3', ...corte }, { escenario: 'real-t3', ok: true }, { escenario: 'real-t4', ok: true }, { escenario: 'real-t5', ...corte }, { escenario: 'real-t6', ok: true }];
  assert.deepEqual(compararConReal(intentos, escenarios), { cortadosEnReal: { llamadas: 3, cortes: 1 }, buenosEnReal: { llamadas: 2, cortes: 1 } });
});

// ---------- veredicto ----------
const TOPE_TOKENS = 8000;
// Un intento tal como lo deja la corrida: 4 escenarios x 2 repeticiones.
const intento = (escenario, extra = {}) => ({ escenario, ok: true, motivo: null, finishReason: 'stop', tokensSalida: 1500, ordenes: { validas: 3, total: 3 }, costo: 0.001, ms: 5000, ...extra });
const bateria = (cambios = () => ({})) => ['t2', 't8', 't15', 't22'].flatMap((e) => [1, 2].map((r) => intento(e, cambios(e, r) ?? {})));
const corte = { ok: false, motivo: 'cortada por max_tokens (finish_reason=length)', finishReason: 'length', tokensSalida: TOPE_TOKENS, ordenes: { validas: 0, total: 1 } };

test('veredicto: sin fallas, con salida holgada y ordenes legales, el modelo es apto', () => {
  const v = veredictoDeExamen(bateria(), { maxTokens: TOPE_TOKENS });
  assert.equal(v.veredicto, 'apto');
  assert.deepEqual(v.motivos, []);
  assert.equal(v.metricas.llamadas, 8);
  assert.equal(v.metricas.fallas, 0);
  assert.equal(v.metricas.ordenesLegales, 1);
});

test('veredicto: un corte aislado deja al modelo con reservas, y dice cual', () => {
  const v = veredictoDeExamen(bateria((e, r) => (e === 't15' && r === 1 ? corte : {})), { maxTokens: TOPE_TOKENS });
  assert.equal(v.veredicto, 'con reservas');
  assert.equal(v.metricas.cortes, 1);
  assert.match(v.motivos.join(' '), /1 de 8.*cortada/);
});

test('veredicto: la mitad de las llamadas fallidas, o un escenario que falla siempre, es no apto', () => {
  // GLM Flash en la partida del 27-oct: bien hasta el turno 6, cortado casi siempre despues.
  const comoGlm = veredictoDeExamen(bateria((e) => (e === 't2' ? {} : corte)), { maxTokens: TOPE_TOKENS });
  assert.equal(comoGlm.veredicto, 'no apto');
  // Solo 2 de 8 fallan (25 %), pero las dos son el mismo escenario: ahi el modelo no puede jugar.
  const siempreEnUno = veredictoDeExamen(bateria((e) => (e === 't22' ? corte : {})), { maxTokens: TOPE_TOKENS });
  assert.equal(siempreEnUno.veredicto, 'no apto');
  assert.match(siempreEnUno.motivos.join(' '), /t22/);
});

test('veredicto: con una sola repeticion por escenario, una falla suelta no es «falla siempre» (diagnostico sobre turnos reales)', () => {
  // 30 turnos de una partida real, una llamada cada uno: una sola falla es un 3 %, no un modelo que no puede jugar ese turno.
  const turnos = Array.from({ length: 30 }, (_, i) => `real-t${i + 1}`);
  const una = turnos.map((e, i) => intento(e, i === 29 ? { ok: false, motivo: 'JSON invalido', finishReason: 'stop', ordenes: { validas: 0, total: 1 } } : {}));
  const v = veredictoDeExamen(una, { maxTokens: TOPE_TOKENS });
  assert.equal(v.veredicto, 'con reservas');
  assert.ok(!v.motivos.join(' ').includes('en todas sus repeticiones'));
});

test('veredicto: pasar el turno a proposito (cero ordenes) no baja el porcentaje de ordenes legales', () => {
  const v = veredictoDeExamen(bateria((e, r) => (e === 't22' && r === 1 ? { ordenes: { validas: 0, total: 0 } } : {})), { maxTokens: TOPE_TOKENS });
  assert.equal(v.veredicto, 'apto');
  assert.equal(v.metricas.ordenesLegales, 1);
});

test('veredicto: gastar mas de la mitad del tope de tokens, o dar pocas ordenes legales, deja con reservas', () => {
  const pesado = veredictoDeExamen(bateria(() => ({ tokensSalida: 5200 })), { maxTokens: TOPE_TOKENS });
  assert.equal(pesado.veredicto, 'con reservas');
  assert.match(pesado.motivos.join(' '), /mitad del tope/);
  const ilegal = veredictoDeExamen(bateria(() => ({ ordenes: { validas: 1, total: 4 } })), { maxTokens: TOPE_TOKENS });
  assert.equal(ilegal.veredicto, 'con reservas');
  assert.match(ilegal.motivos.join(' '), /órdenes son legales/);
});

test('veredicto: un error de la API cuenta como falla, y sin intentos no se juzga', () => {
  const v = veredictoDeExamen(bateria((e, r) => (e === 't8' && r === 2 ? { ok: false, motivo: 'error de la llamada: OpenRouter 502', finishReason: null, tokensSalida: null, ordenes: { validas: 0, total: 1 } } : {})), { maxTokens: TOPE_TOKENS });
  assert.equal(v.metricas.fallas, 1);
  assert.equal(v.metricas.cortes, 0);
  assert.equal(v.veredicto, 'con reservas');
  assert.equal(veredictoDeExamen([], { maxTokens: TOPE_TOKENS }).veredicto, 'incompleto');
});

// ---------- corredor ----------
// Asiento 0: ahi el bot de referencia juega todas sus ordenes legales (en el 2 su bot pasivo se queda sin jugadas y el fixture no seria "un modelo que juega bien").
const escenariosChicos = () => escenariosDeConquista({ ...OPCIONES, asiento: 0, turnos: [2, 8] });
const candidato = (extra = {}) => ({ clave: 'x', nombre: 'Modelo X', modelo: 'proveedor/x', razonamiento: 'low', precio: { entrada: 1, salida: 1 }, ...extra });
// Un "modelo" que contesta con la jugada del bot de referencia de cada escenario (indexado por el usuario del prompt).
const respondeBien = (escenarios, uso = { prompt_tokens: 4000, completion_tokens: 1500, cost: 0.001 }) => async ({ usuario }) => {
  const e = escenarios.find((x) => x.usuario === usuario);
  return { texto: JSON.stringify(e.jugadaDeReferencia), uso, finishReason: 'stop', razonamiento: 'pienso un poco' };
};

test('el corredor llama cada escenario las veces pedidas, con la configuracion de produccion, y juzga al modelo', async () => {
  const escenarios = escenariosChicos();
  const llamadas = [];
  const llamar = async (args) => { llamadas.push(args); return respondeBien(escenarios)(args); };
  const r = await correrExamen({ candidatos: [candidato()], escenarios, repeticiones: 2, llamar, topeUsd: 1 });
  assert.equal(llamadas.length, 4);
  for (const l of llamadas) {
    assert.equal(l.modelo, 'proveedor/x');
    assert.equal(l.razonamiento, 'low');
    assert.equal(l.reintentos, 0, 'una llamada contada es una solicitud HTTP');
    assert.equal(l.maxTokens, undefined, 'usa el tope de produccion (PARAMETROS.maxTokens), no uno propio');
  }
  assert.equal(r.modelos[0].veredicto, 'apto');
  assert.equal(r.modelos[0].intentos.length, 4);
  assert.deepEqual(r.modelos[0].intentos.map((i) => [i.escenario, i.repeticion]), [['conquista-t2', 1], ['conquista-t2', 2], ['conquista-t8', 1], ['conquista-t8', 2]]);
  assert.equal(r.maxTokens, PARAMETROS.maxTokens);
  assert.equal(r.llamadas, 4);
});

test('un tope de tokens pedido se manda a cada llamada, se usa para el peor caso y para juzgar si el modelo gasta mas de la mitad', async () => {
  const escenarios = ['a', 'b'].map((id) => ({ id, sistema: 'S', usuario: 'U', tokensEstimados: 5000, evaluar: () => ({ ok: true, motivo: null, ordenes: { validas: 1, total: 1 } }) }));
  const recibidos = [];
  const salida = Math.round(PARAMETROS.maxTokens * 0.9), pedido = PARAMETROS.maxTokens * 3; // el modelo gasta el 90 % del tope de siempre
  const llamar = async (args) => { recibidos.push(args); return { texto: '{"ordenes":["x"]}', uso: { prompt_tokens: 4000, completion_tokens: salida, cost: 0.001 }, finishReason: 'stop' }; };
  const r = await correrExamen({ candidatos: [candidato()], escenarios, repeticiones: 1, llamar, topeUsd: 1, maxTokens: pedido });
  assert.ok(recibidos.every((a) => a.maxTokens === pedido), 'cada llamada lleva el tope pedido');
  assert.equal(r.maxTokens, pedido);
  assert.equal(r.modelos[0].veredicto, 'apto', 'el 30 % del tope pedido no pasa de la mitad');
  const conTopeDeSiempre = await correrExamen({ candidatos: [candidato()], escenarios, repeticiones: 1, llamar, topeUsd: 1 });
  assert.equal(conTopeDeSiempre.maxTokens, PARAMETROS.maxTokens);
  assert.equal(conTopeDeSiempre.modelos[0].veredicto, 'con reservas', 'el 90 % del tope de siempre si pasa de la mitad');
});

test('el corredor cuenta como falla un corte, un error de red y un texto que no es JSON, y guarda el razonamiento', async () => {
  const escenarios = escenariosChicos();
  const respuestas = [
    { texto: '', finishReason: 'length', razonamiento: 'Primero reviso el mapa. Primero reviso el mapa.', uso: { prompt_tokens: 4000, completion_tokens: PARAMETROS.maxTokens, cost: 0.002 } },
    new Error('OpenRouter 502: mala puerta de enlace'),
    { texto: 'no se me ocurre nada', finishReason: 'stop', uso: { prompt_tokens: 4000, completion_tokens: 50, cost: 0.001 } },
    null, // este si juega bien
  ];
  let n = 0;
  const llamar = async (args) => {
    const r = respuestas[n++];
    if (r instanceof Error) throw r;
    return r ?? respondeBien(escenarios)(args);
  };
  const r = await correrExamen({ candidatos: [candidato()], escenarios, repeticiones: 2, llamar, topeUsd: 1 });
  const [corte, red, texto, bien] = r.modelos[0].intentos;
  assert.match(corte.motivo, /max_tokens/);
  assert.equal(corte.razonamiento, 'Primero reviso el mapa. Primero reviso el mapa.');
  assert.match(red.motivo, /error de la llamada.*502/);
  assert.match(texto.motivo, /JSON/);
  assert.equal(bien.ok, true);
  assert.equal(r.modelos[0].veredicto, 'no apto');
});

test('el corredor no empieza una llamada que, en el peor caso, pasaria del tope: el modelo queda incompleto', async () => {
  // Escenarios sinteticos de 5000 tokens estimados (no el prompt real, para que la prueba no dependa de su tamano).
  const escenarios = ['a', 'b'].map((id) => ({ id, sistema: 'S', usuario: 'U', tokensEstimados: 5000, evaluar: () => ({ ok: true, motivo: null, ordenes: { validas: 1, total: 1 } }) }));
  // Peor caso por llamada: (5000 x 1.1 de entrada + PARAMETROS.maxTokens de salida) a $10 por millon; la primera cuesta $0.15 de verdad, mas de la mitad del tope.
  const peor = ((5000 * 1.1 + PARAMETROS.maxTokens) * 10) / 1e6, tope = +(peor * 1.4).toFixed(3);
  const llamar = async () => ({ texto: '{"ordenes":["x"]}', uso: { prompt_tokens: 4000, completion_tokens: 3000, cost: peor * 0.7 }, finishReason: 'stop' });
  const r = await correrExamen({ candidatos: [candidato({ precio: { entrada: 10, salida: 10 } })], escenarios, repeticiones: 2, llamar, topeUsd: tope });
  assert.equal(r.llamadas, 1, 'la primera cabe en el tope (peor caso); la segunda ya no: gastado + peor caso > tope');
  assert.ok(r.gastado <= tope, `gasto ${r.gastado}`);
  assert.match(r.detenido, /tope/);
  assert.equal(r.modelos[0].veredicto, 'incompleto');
});

test('con llamadas en paralelo el gasto sigue sin pasar del tope y se acaban todas las tareas si caben', async () => {
  const escenarios = escenariosChicos();
  let enVuelo = 0, maxEnVuelo = 0;
  const llamar = async (args) => {
    enVuelo++; maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
    await new Promise((res) => setTimeout(res, 5));
    enVuelo--;
    return respondeBien(escenarios)(args);
  };
  const r = await correrExamen({ candidatos: [candidato()], escenarios, repeticiones: 2, llamar, topeUsd: 1, paralelo: 3 });
  assert.equal(r.llamadas, 4);
  assert.ok(maxEnVuelo > 1 && maxEnVuelo <= 3, `en vuelo a la vez: ${maxEnVuelo}`);
  assert.equal(r.modelos[0].veredicto, 'apto');
});

test('un error de llave o de credito detiene el examen entero y no se le achaca al modelo', async () => {
  const escenarios = escenariosChicos();
  const llamar = async () => { throw new Error('OpenRouter 402: credito insuficiente'); };
  const r = await correrExamen({ candidatos: [candidato(), candidato({ clave: 'y' })], escenarios, repeticiones: 2, llamar, topeUsd: 1 });
  assert.match(r.detenido, /402/);
  assert.equal(r.llamadas, 1);
  assert.equal(r.modelos.length, 1, 'no sigue con el siguiente modelo');
  assert.equal(r.modelos[0].veredicto, 'incompleto');
});

// ---------- candidatos y tabla de aptitud ----------
const catalogo = { data: [
  { id: 'z-ai/glm-5.3-flash', pricing: { prompt: '0.00000015', completion: '0.0000005' } },
  { id: 'sin/precio', pricing: { prompt: null, completion: null } },
] };

test('los candidatos del examen salen de los contendientes: su modelo y su razonamiento reales, con el precio del catalogo', () => {
  const [glm] = candidatosDeContendientes(catalogo, ['glm-flash']);
  assert.equal(glm.clave, 'glm-flash');
  assert.equal(glm.modelo, 'z-ai/glm-5.3-flash');
  assert.equal(glm.razonamiento, 'low', 'el razonamiento es el que usa la partida, no el que sugiere el catalogo');
  assert.deepEqual(glm.precio, { entrada: 0.15, salida: 0.5 });
  assert.equal(glm.problema, null);
  assert.throws(() => candidatosDeContendientes(catalogo, ['no-existe']), /Contendiente desconocido.*no-existe/);
});

test('un contendiente fuera del catalogo o sin precio valido queda marcado con su problema', () => {
  const faltante = candidatosDeContendientes({ data: [] }, ['glm-flash'])[0];
  assert.match(faltante.problema, /no está en el catálogo/);
  assert.equal(faltante.precio, null);
  const sinPrecio = candidatosDeContendientes({ data: [{ id: 'z-ai/glm-5.3-flash', pricing: {} }] }, ['glm-flash'])[0];
  assert.match(sinPrecio.problema, /precio válido/);
});

const modeloJuzgado = (extra = {}) => ({
  clave: 'glm-flash', nombre: 'GLM Flash', modelo: 'z-ai/glm-5.3-flash', veredicto: 'no apto', motivos: ['fallan 6 de 8 llamadas (la mitad o más)'],
  metricas: { llamadas: 8, fallas: 6, cortes: 6, ordenesLegales: 0.8333, salidaMediana: 8000, msMediano: 90000, costo: 0.0312 }, ...extra,
});
const CONTEXTO = { juego: 'conquista', reglas: 'conquista-2.2.0', maxTokens: 8000, fecha: '2026-10-27' };

test('la fila de aptitud resume el veredicto con su contexto (reglas, tope de tokens y fecha), porque caduca si cambian', () => {
  const f = filaDeAptitud(modeloJuzgado(), CONTEXTO);
  assert.deepEqual(f, {
    clave: 'glm-flash', juego: 'conquista', celdas: ['GLM Flash (`glm-flash`)', 'conquista', 'no apto', '2/8', '6', '83 %', '8000', '$0.0312', 'conquista-2.2.0', '8000', '2026-10-27', 'fallan 6 de 8 llamadas (la mitad o más)'],
  });
});

test('fusionarAptitud crea la tabla, reemplaza la fila del mismo modelo y juego, y conserva las demas', () => {
  const vacia = fusionarAptitud('', [filaDeAptitud(modeloJuzgado(), CONTEXTO)]);
  assert.match(vacia, /^# Aptitud de modelos por juego/);
  assert.match(vacia, /\| Modelo \| Juego \| Veredicto \|/);
  assert.equal(vacia.split('\n').filter((l) => l.startsWith('| GLM Flash')).length, 1);

  const con2 = fusionarAptitud(vacia, [filaDeAptitud(modeloJuzgado({ clave: 'haiku', nombre: 'Claude Haiku', veredicto: 'apto', motivos: [], metricas: { llamadas: 8, fallas: 0, cortes: 0, ordenesLegales: 1, salidaMediana: 2100, msMediano: 9000, costo: 0.02 } }), CONTEXTO)]);
  assert.equal(con2.split('\n').filter((l) => /^\| (GLM Flash|Claude Haiku)/.test(l)).length, 2);

  // Un examen nuevo de GLM Flash (otra fecha, ahora apto) reemplaza su fila y deja la de Haiku.
  const nuevo = fusionarAptitud(con2, [filaDeAptitud(modeloJuzgado({ veredicto: 'apto', motivos: [], metricas: { llamadas: 8, fallas: 0, cortes: 0, ordenesLegales: 1, salidaMediana: 3000, msMediano: 20000, costo: 0.01 } }), { ...CONTEXTO, fecha: '2026-11-02' })]);
  const filas = nuevo.split('\n').filter((l) => /^\| (GLM Flash|Claude Haiku)/.test(l));
  assert.equal(filas.length, 2);
  assert.ok(filas.some((l) => l.includes('2026-11-02') && l.includes('| apto |')));
  assert.equal(filas.filter((l) => l.startsWith('| GLM Flash')).length, 1, 'la fila vieja de GLM Flash ya no esta');
  // Misma clave en otro juego es otra fila.
  const otroJuego = fusionarAptitud(nuevo, [filaDeAptitud(modeloJuzgado(), { ...CONTEXTO, juego: 'lobo', reglas: 'lobo-1.3.0' })]);
  assert.equal(otroJuego.split('\n').filter((l) => l.startsWith('| GLM Flash')).length, 2);
});

// ---------- el programa: nunca llama a nada sin --ejecutar, y estas pruebas siempre con catalogo guardado y sin llave (sin red) ----------
function programa(args, catalogo = { data: [{ id: 'z-ai/glm-5.3-flash', pricing: { prompt: '0.00000015', completion: '0.0000005' } }] }) {
  const dir = mkdtempSync(join(tmpdir(), 'examen-modelos-'));
  const archivo = join(dir, 'catalogo.json');
  writeFileSync(archivo, JSON.stringify(catalogo));
  try {
    return spawnSync(process.execPath, ['herramientas/examen-modelos.mjs', `--archivo=${archivo}`, ...args], { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, OPENROUTER_API_KEY: '' } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('programa: sin --ejecutar solo estima el costo y avisa que no llamo a ningun modelo', () => {
  const r = programa(['--juego=conquista', '--modelos=glm-flash']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /glm-flash\s+z-ai\/glm-5\.3-flash/);
  assert.match(r.stdout, /peor caso/);
  assert.match(r.stdout, /conquista-t22/);
  assert.match(r.stdout, /NO llamó a ningún modelo/);
});

test('programa: con --partida examina los turnos de una partida real guardada y marca los que se cortaron en la real', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'examen-partida-'));
  const archivo = join(dir, 'partida.json');
  writeFileSync(archivo, JSON.stringify(await crudoReal()));
  try {
    const r = programa(['--juego=conquista', '--modelos=glm-flash', `--partida=${archivo}`, '--jugador=agresivo', '--turnos=2,3,5']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /partida real/);
    assert.match(r.stdout, /real-t3 \(.*cortada en la partida real/);
    assert.match(r.stdout, /NO llamó a ningún modelo/);
    assert.match(programa(['--juego=conquista', '--modelos=glm-flash', `--partida=${archivo}`]).stderr, /--jugador/);
    // Variante en memoria: se anuncia, y un texto que no aparece o un formato roto se rechazan sin llamar a nada.
    const base = ['--juego=conquista', '--modelos=glm-flash', `--partida=${archivo}`, '--jugador=agresivo', '--turnos=2'];
    const conLeyenda = programa([...base, '--reemplazar=OCUPACION (region(unidades=>OCUPACION (g = granja, m = mercado, c = cuartel; region(unidades']);
    assert.equal(conLeyenda.status, 0, conLeyenda.stderr);
    assert.match(conLeyenda.stdout, /Variante de prompt en memoria/);
    assert.match(conLeyenda.stdout, /NO llamó a ningún modelo/);
    assert.match(programa([...base, '--reemplazar=no existe=>x']).stderr, /no aparece en el prompt de real-t2/);
    assert.match(programa([...base, '--reemplazar=sin separador']).stderr, /=>/);
    // Prompt de sistema distinto: se anuncia, y fuera de privado/ se rechaza.
    const conSis = programa([...base, '--sistema=privado/spec/guerra-prompt-2.3.0-borrador.txt']);
    assert.equal(conSis.status, 0, conSis.stderr);
    assert.match(conSis.stdout, /Prompt de sistema DISTINTO/);
    assert.match(programa([...base, '--sistema=web/index.html']).stderr, /dentro de privado/);
    assert.match(programa(['--juego=conquista', '--modelos=glm-flash', '--partida=no-existe.json', '--jugador=agresivo']).stderr, /No pude leer la partida/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('programa: exige juego y lista de modelos, y rechaza juegos y modelos desconocidos', () => {
  assert.match(programa(['--modelos=glm-flash']).stderr, /--juego/);
  assert.match(programa(['--juego=conquista']).stderr, /--modelos/);
  assert.match(programa(['--juego=ajedrez', '--modelos=glm-flash']).stderr, /Juego sin examen: ajedrez/);
  const desconocido = programa(['--juego=conquista', '--modelos=gpt-9']);
  assert.equal(desconocido.status, 1);
  assert.match(desconocido.stderr, /Contendiente desconocido: "gpt-9"/);
});

test('programa: --ejecutar exige un tope en dolares y un modelo presente en el catalogo', () => {
  const sinTope = programa(['--juego=conquista', '--modelos=glm-flash', '--ejecutar']);
  assert.equal(sinTope.status, 1);
  assert.match(sinTope.stderr, /tope de gasto/);
  const ceroTope = programa(['--juego=conquista', '--modelos=glm-flash', '--ejecutar', '--tope-usd=0']);
  assert.equal(ceroTope.status, 1);
  const ausente = programa(['--juego=conquista', '--modelos=glm-flash'], { data: [] });
  assert.equal(ausente.status, 1);
  assert.match(ausente.stdout, /PROBLEMA: z-ai\/glm-5\.3-flash no está en el catálogo/);
});

test('el corredor se niega con un tope o un precio invalidos (sin ellos no hay control del gasto)', async () => {
  const escenarios = escenariosChicos();
  const llamar = respondeBien(escenarios);
  await assert.rejects(correrExamen({ candidatos: [candidato()], escenarios, llamar, topeUsd: 0 }), /Tope/);
  await assert.rejects(correrExamen({ candidatos: [candidato()], escenarios, llamar, topeUsd: NaN }), /Tope/);
  await assert.rejects(correrExamen({ candidatos: [candidato({ precio: null })], escenarios, llamar, topeUsd: 1 }), /precio/);
});

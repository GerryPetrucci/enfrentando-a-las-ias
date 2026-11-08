import test from 'node:test';
import assert from 'node:assert/strict';
import { crearAdaptadorHttp } from '../../worldbox/adaptador-http.js';
import { crearAdaptadorSimulado } from '../../worldbox/adaptador-simulado.js';
import { comprobarAdaptador } from '../../worldbox/adaptador.js';
import { correrCompetencia } from '../../worldbox/orquestador.js';
import { crearBot } from '../../worldbox/bots.js';
import { servidor, servirPuente } from './ayudas.js';

test('HTTP habla protocolo v1 con token y normaliza todas las operaciones', async t => {
  const sim = crearAdaptadorSimulado(), peticiones = [];
  const url = await servidor(t, async (req, b) => {
    assert.equal(req.headers['x-puente-token'], 'token-local');
    if (b) { assert.equal(b.protocolo, 1); assert.ok(b.id_solicitud); }
    peticiones.push(req.url);
    let r;
    if (req.url === '/v1/info') r = await sim.info();
    else if (req.url === '/v1/escenario/reiniciar') r = await sim.reiniciarEscenario(b);
    else if (req.url.startsWith('/v1/observacion?')) r = await sim.observar(new URL(req.url, url).searchParams.get('faccion'));
    else if (req.url === '/v1/accion') r = await sim.ejecutar(b);
    else if (req.url === '/v1/avanzar') r = await sim.avanzar(b);
    else if (req.url === '/v1/estado-terminal') r = await sim.estadoTerminal();
    else if (req.url === '/v1/cerrar') r = await sim.cerrar();
    return { body: { ...r, protocolo: 1, ok: true, objeto_unity: { secreto: 'NO_EXPOSICION' } } };
  });
  const a = crearAdaptadorHttp({ url, token: 'token-local' });
  const info = await comprobarAdaptador(a, { escenario: { semilla: 1, tamano_mapa: 64, facciones: [{ id: 'a' }, { id: 'b' }] } });
  assert.ok(!JSON.stringify(info).includes('NO_EXPOSICION'));
  assert.equal(info.origen, 'puente', 'el origen lo fija el cliente, no el servidor');
  assert.equal((await a.observar('a')).faccion.id, 'a');
  await a.cerrar();
  assert.ok(peticiones.includes('/v1/accion')); assert.ok(peticiones.includes('/v1/avanzar'));
});
test('reintento de mutacion mantiene id_solicitud e idempotencia tras perdida de respuesta', async t => {
  const ids = [], cache = new Map(); let mutaciones = 0;
  const url = await servidor(t, async (req, b) => {
    ids.push(b.id_solicitud);
    if (!cache.has(b.id_solicitud)) { mutaciones++; cache.set(b.id_solicitud, { protocolo: 1, ok: true, resultado: 'ejecutada', codigo: 'ok' }); req.socket.destroy(); return null; }
    return { body: cache.get(b.id_solicitud) };
  });
  const a = crearAdaptadorHttp({ url, token: 'x', reintentos: 1 });
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'esperar', parametros: {} })).resultado, 'ejecutada');
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]); assert.equal(mutaciones, 1);
  // Dos acciones distintas llevan ids distintos.
  await a.ejecutar({ faccion: 'a', accion: 'x', parametros: {} }); assert.notEqual(ids.at(-1), ids[0]);
});
test('rechaza no-loopback, credenciales, rutas y redirecciones', async t => {
  for (const url of ['http://example.com', 'http://0.0.0.0:47600', 'http://localhost:47600', 'https://127.0.0.1', 'http://usuario:clave@127.0.0.1', 'http://127.0.0.1/ruta', 'http://127.0.0.1:1?x=1', 'http://[::1]:1']) assert.throws(() => crearAdaptadorHttp({ url, token: 'x' }), /solo_loopback/, url);
  for (const token of [undefined, '', 'a\nb', 5]) assert.throws(() => crearAdaptadorHttp({ url: 'http://127.0.0.1:1', token }), /no_autorizado/);
  let llamados = 0;
  const url = await servidor(t, async () => { llamados++; return { status: 302, headers: { Location: 'https://example.com' }, body: {} }; });
  await assert.rejects(() => crearAdaptadorHttp({ url, token: 'x', reintentos: 0 }).info(), /conexion/);
  assert.equal(llamados, 1);
});
test('protocolo incompatible y autenticacion no se reintentan ni filtran mensaje remoto', async t => {
  let n = 0;
  const url = await servidor(t, async () => { n++; return { body: { protocolo: 2, ok: true } }; });
  await assert.rejects(() => crearAdaptadorHttp({ url, token: 'x' }).info(), /protocolo_incompatible/); assert.equal(n, 1);
  const url2 = await servidor(t, async () => ({ status: 401, body: { protocolo: 1, ok: false, error: { codigo: 'no_autorizado', mensaje: 'TOKEN-SECRETO' } } }));
  await assert.rejects(() => crearAdaptadorHttp({ url: url2, token: 'x' }).info(), e => e.codigo === 'no_autorizado' && !e.message.includes('SECRETO'));
  // Un codigo desconocido del servidor se normaliza; ni el mensaje ni el codigo crudo llegan al cliente.
  const url3 = await servidor(t, async () => ({ status: 500, body: { protocolo: 1, ok: false, error: { codigo: 'codigo_raro_con_secreto', mensaje: 'SECRETO' } } }));
  await assert.rejects(() => crearAdaptadorHttp({ url: url3, token: 'x', reintentos: 0 }).info(), e => e.codigo === 'error_interno' && !e.message.includes('SECRETO'));
});
test('TODA respuesta debe declarar protocolo 1, tambien las de accion, avance y error', async t => {
  for (const cuerpo of [{ ok: true, resultado: 'ejecutada', codigo: 'ok', tiempo_juego_s: 1, terminal: false }, { protocolo: 2, ok: true, resultado: 'ejecutada', codigo: 'ok', tiempo_juego_s: 1, terminal: false },
    { protocolo: '1', ok: true, resultado: 'ejecutada', codigo: 'ok', tiempo_juego_s: 1, terminal: false }, { protocolo: 2, ok: false, error: { codigo: 'no_listo' } }]) {
    let n = 0;
    const url = await servidor(t, async () => { n++; return { body: cuerpo }; });
    const a = crearAdaptadorHttp({ url, token: 'x' });
    await assert.rejects(() => a.ejecutar({ faccion: 'a', accion: 'x', parametros: {} }), /protocolo_incompatible/);
    await assert.rejects(() => a.avanzar({ segundos_juego: 1 }), /protocolo_incompatible/);
    assert.equal(n, 2, 'sin reintentos');
  }
});
test('respuestas rotas se rechazan sin reintentar: JSON invalido, cuerpo enorme, campos de otro tipo', async t => {
  let n = 0;
  const raro = await servidor(t, async () => { n++; return { body: { protocolo: 1, ok: true, estado: 'listo', capacidades: 'x', acciones: [], limites: {} } }; });
  await assert.rejects(() => crearAdaptadorHttp({ url: raro, token: 'x' }).info(), /respuesta_invalida/); assert.equal(n, 1);
  // Una respuesta por lo demas VALIDA, pero de mas de 1 MB, se rechaza; con 100 KB de relleno se acepta.
  const valida = relleno => ({ protocolo: 1, ok: true, estado: 'listo', capacidades: { reiniciar: true, avanzar: true, terminal: true, multi_faccion: true }, acciones: [], limites: { max_segundos_avance: 1 }, relleno: 'x'.repeat(relleno) });
  const enorme = await servidor(t, async () => ({ body: valida(1_100_000) })), mediano = await servidor(t, async () => ({ body: valida(100_000) }));
  await assert.rejects(() => crearAdaptadorHttp({ url: enorme, token: 'x' }).info(), /respuesta_invalida/);
  assert.equal((await crearAdaptadorHttp({ url: mediano, token: 'x' }).info()).estado, 'listo');
  const avance = await servidor(t, async () => ({ body: { protocolo: 1, ok: true, tiempo_juego_s: 'x', terminal: false } }));
  await assert.rejects(() => crearAdaptadorHttp({ url: avance, token: 'x' }).avanzar({ segundos_juego: 1 }), /respuesta_invalida/);
  const reinicio = await servidor(t, async () => ({ body: { protocolo: 1, ok: true, escenario_id: 'e', hash_mundo: 1, facciones: [] } }));
  await assert.rejects(() => crearAdaptadorHttp({ url: reinicio, token: 'x' }).reiniciarEscenario({ semilla: 1, facciones: [] }), /respuesta_invalida/);
});
test('timeout abre circuito y recuperacion permite volver a probar', async t => {
  let n = 0, reloj = 0;
  const url = await servidor(t, async () => { n++; return null; });
  const a = crearAdaptadorHttp({ url, token: 'x', timeoutMs: 30, umbralCircuito: 1, recuperacionMs: 100, ahora: () => reloj });
  await assert.rejects(() => a.info(), /tiempo_agotado/);
  await assert.rejects(() => a.info(), /circuito_abierto/); assert.equal(n, 1);
  reloj = 101; await assert.rejects(() => a.info(), /tiempo_agotado/); assert.equal(n, 2);
});

// ---- el orquestador contra un puente falso con SU PROPIO catalogo de acciones (no el del simulador) ----
const participantes = (...ids) => ids.map((id, i) => ({ id, modelo: `bot-${i}`, decidir: crearBot('bot-aleatorio', 3 + i) }));
const JSON_ACCION = (action, parameters = {}) => JSON.stringify({ actions: [{ action, parameters }], reasoning_summary: '' });

test('el catalogo del juego sale de lo que el puente anuncia: lo no verificado no existe y esperar no viaja', async t => {
  const puente = await servirPuente(t, { semilla: false });
  const adaptador = crearAdaptadorHttp({ url: puente.url, token: puente.token });
  const { reporte, eventos } = await correrCompetencia({ reglas: 'generico', adaptador, participantes: participantes('f1', 'f2', 'f3'), semilla: 4, turnos: 6, maxAcciones: 3 });
  assert.equal(reporte.completo, true); assert.equal(reporte.origen, 'puente');
  assert.deepEqual(eventos[0].config.acciones_habilitadas, ['esperar', 'reunir', 'construir']);
  assert.equal(eventos[0].config.rules_version, 'puente-observacion-1.0.0');
  const acciones = puente.peticiones.filter(p => p.url === '/v1/accion');
  assert.ok(acciones.length > 0);
  assert.ok(acciones.every(p => ['reunir', 'construir'].includes(p.cuerpo.accion)), 'nada fuera de lo anunciado, ni esperar, llega al puente');
  assert.equal(new Set(acciones.map(p => p.cuerpo.id_solicitud)).size, acciones.length, 'cada orden lleva su propio id_solicitud');
  for (const p of puente.peticiones) assert.equal(p.cuerpo === null || p.cuerpo.protocolo === 1, true);
  // El prompt que vieron los modelos describe las acciones del puente, no las del simulador.
  const d = eventos.find(e => e.tipo === 'decision'); assert.ok(d.prompt_hash);
  assert.ok(puente.peticiones.some(p => p.url === '/v1/cerrar'), 'cierra el escenario al terminar');
});
test('sin semilla en el puente la partida se marca NO reproducible y se registra lo pedido y el hash del mundo', async t => {
  const sin = await servirPuente(t, { semilla: false, hashMundo: 'mundo-A' }), con = await servirPuente(t, { semilla: true, hashMundo: 'mundo-B' });
  const correr = puente => correrCompetencia({ reglas: 'generico', adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), participantes: participantes('f1', 'f2'), semilla: 21, turnos: 2 });
  const a = (await correr(sin)).reporte, b = (await correr(con)).reporte;
  assert.equal(a.determinista, false); assert.equal(a.config.adaptador.determinista, false);
  assert.deepEqual([a.escenario.semilla_pedida, a.escenario.semilla_usada, a.escenario.hash_mundo], [21, null, 'mundo-A']);
  assert.equal(b.determinista, 'desconocido', 'el puente dice soportar semilla pero Node no puede verificar la trayectoria');
  assert.deepEqual([b.escenario.semilla_usada, b.escenario.hash_mundo], [21, 'mundo-B']);
  assert.match(a.escenario.hash_estado_inicial, /^[0-9a-f]{64}$/);
  assert.equal(a.escenario.hash_estado_inicial, b.escenario.hash_estado_inicial, 'mismo estado inicial observado');
});
test('rechazos del juego real penalizan y cuentan; el estado del juego manda sobre el propio', async t => {
  const puente = await servirPuente(t, { semilla: false });
  const ps = [{ id: 'f1', modelo: 'a', decidir: async () => JSON_ACCION('construir', { tipo: 'torre', nivel: 3 }) }, { id: 'f2', modelo: 'b', decidir: async () => JSON_ACCION('reunir') }];
  const { reporte, eventos } = await correrCompetencia({ reglas: 'generico', adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), participantes: ps, turnos: 2, maxAcciones: 2 });
  const f1 = reporte.ranking.find(r => r.participant_id === 'f1'), f2 = reporte.ranking.find(r => r.participant_id === 'f2');
  // Construir nivel 3 cuesta 15 y f1 tiene 10: el juego la rechaza en cada turno (una infraccion cada vez).
  assert.equal(f1.acciones_rechazadas, 2); assert.equal(f1.penalizaciones, 2); assert.equal(f2.penalizaciones, 0);
  assert.equal(f2.recursos, 20); assert.equal(f2.territorio, 2);
  const ejecucion = eventos.find(e => e.tipo === 'decision').execution_result;
  assert.deepEqual(ejecucion.map(x => [x.resultado, x.codigo]), [['rechazada', 'recursos_insuficientes']]); assert.match(ejecucion[0].id_solicitud, /^[0-9a-f-]{36}$/, 'el id de la solicitud al puente queda en la traza');
});
test('el cooldown anunciado por el puente se aplica en Node antes de molestar al juego', async t => {
  const puente = await servirPuente(t, { semilla: false });
  const construir = JSON_ACCION('construir', { tipo: 'muro', nivel: 1 });
  const ps = [{ id: 'f1', modelo: 'a', decidir: async ({ observation }) => observation.turno_juego === 0 ? JSON.stringify({ actions: [{ action: 'reunir', parameters: {} }, { action: 'construir', parameters: { tipo: 'muro', nivel: 1 } }], reasoning_summary: '' }) : construir }, { id: 'f2', modelo: 'b', decidir: async () => JSON_ACCION('reunir') }];
  const { reporte } = await correrCompetencia({ reglas: 'generico', adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), participantes: ps, turnos: 3, maxAcciones: 3 });
  const construidas = puente.peticiones.filter(p => p.url === '/v1/accion' && p.cuerpo.accion === 'construir');
  // Turno 1 ejecuta (cooldown anunciado 1 => vuelve en el turno 3); turno 2 se descarta SIN llegar al puente; turno 3 ejecuta.
  assert.equal(construidas.length, 2);
  assert.equal(reporte.ranking.find(r => r.participant_id === 'f1').acciones_invalidas, 1);
});
test('un puente que falla a mitad de partida deja el reporte incompleto con el ultimo estado confirmado', async t => {
  let puente;
  puente = await servirPuente(t, { semilla: false, gancho: async req => (req.url === '/v1/avanzar' && puente.estado()?.turno >= 2 ? { status: 500, body: { protocolo: 1, ok: false, error: { codigo: 'error_interno', mensaje: 'SECRETO' } } } : null) });
  const log = [];
  const { reporte, eventos } = await correrCompetencia({ reglas: 'generico', adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token, reintentos: 0 }), participantes: participantes('f1', 'f2'), turnos: 10, telemetria: { eventos: log, registrar: async e => { log.push(e); } } });
  assert.equal(reporte.completo, false); assert.equal(reporte.razon, 'puente_error_interno'); assert.equal(reporte.turnos, 2);
  assert.ok(!JSON.stringify(eventos).includes('SECRETO'));
  assert.equal(reporte.ranking.length, 2);
});
test('token incorrecto o protocolo incompatible abortan antes de empezar y sin dejar log', async t => {
  const puente = await servirPuente(t, { semilla: false });
  const log = [];
  const telemetria = { eventos: log, registrar: async e => { log.push(e); } };
  await assert.rejects(() => correrCompetencia({ reglas: 'generico', adaptador: crearAdaptadorHttp({ url: puente.url, token: 'otro' }), participantes: participantes('f1', 'f2'), telemetria }), /no_autorizado/);
  const viejo = await servidor(t, async () => ({ body: { protocolo: 2, ok: true } }));
  await assert.rejects(() => correrCompetencia({ reglas: 'generico', adaptador: crearAdaptadorHttp({ url: viejo, token: 'x' }), participantes: participantes('f1', 'f2'), telemetria }), /protocolo_incompatible/);
  assert.equal(log.length, 0);
});

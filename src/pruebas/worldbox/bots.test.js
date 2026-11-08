import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBot, BOTS } from '../../worldbox/bots.js';
import { validarRespuesta, validarAccion, accionesHabilitadas, registrarUso, CATALOGO } from '../../worldbox/contrato-acciones.js';
import { normalizarInfo } from '../../worldbox/adaptador.js';
import { crearAdaptadorSimulado } from '../../worldbox/adaptador-simulado.js';
import { PERFILES } from '../../worldbox/reglas.js';
import { ACCIONES_PUENTE, ACCIONES_REAL_ANUNCIADAS } from './ayudas.js';

const fac = (id, extra = {}) => ({ id, vivo: true, poblacion: 20, ciudades: 1, territorio: 3, recursos: 20, objetivos: 0, cooldowns: {}, ...extra });
const vista = (turno_juego = 0, yo = {}, libres = 55) => ({ origen: 'simulado', turno_juego, tiempo_juego_s: turno_juego, faccion: fac('f1', yo), rivales: [fac('f2'), fac('f3')], mundo: { tamano_mapa: 64, libres } });
const simuladas = async () => accionesHabilitadas(await crearAdaptadorSimulado().info());
const puente = () => accionesHabilitadas(normalizarInfo({ protocolo: 1, origen: 'puente', estado: 'listo', capacidades: { reiniciar: true, avanzar: true, terminal: true, multi_faccion: true }, acciones: ACCIONES_PUENTE, limites: { max_segundos_avance: 1 } }));
const jugada = async (bot, observation, acciones) => JSON.parse(await bot({ observation, acciones })).actions[0];

test('solo existen los cinco bots y uno desconocido se rechaza', () => {
  assert.deepEqual(BOTS, ['bot-aleatorio', 'bot-pasivo', 'bot-voraz', 'bot-roto', 'bot-expansionista']);
  assert.throws(() => crearBot('bot-inexistente'), /bot_desconocido/); assert.throws(() => crearBot('constructor'), /bot_desconocido/);
});
test('bot-pasivo siempre espera', async () => {
  const bot = crearBot('bot-pasivo'), acciones = await simuladas();
  for (let t = 0; t < 5; t++) assert.deepEqual(await jugada(bot, vista(t), acciones), { action: 'esperar', parameters: {} });
});
test('bot-voraz: fundar, luego expandir, luego recolectar, y respeta cooldowns y existencias', async () => {
  const acciones = await simuladas(), bot = crearBot('bot-voraz');
  assert.equal((await jugada(bot, vista(0), acciones)).action, 'fundar');
  assert.deepEqual(await jugada(bot, vista(0, { cooldowns: { fundar: 3 } }), acciones), { action: 'expandir', parameters: { cantidad: 1 } });
  assert.equal((await jugada(bot, vista(0, { recursos: 14 }), acciones)).action, 'expandir');
  assert.equal((await jugada(bot, vista(0, { recursos: 14, ciudades: 3 }), acciones)).action, 'expandir');
  assert.equal((await jugada(bot, vista(0, { recursos: 5 }), acciones)).action, 'recolectar');
  assert.equal((await jugada(bot, vista(0, { recursos: 20, cooldowns: { fundar: 3, expandir: 3 } }), acciones)).action, 'recolectar');
  assert.equal((await jugada(bot, vista(0, { recursos: 20 }, 0), acciones.filter(a => a.nombre !== 'fundar')))?.action, 'recolectar', 'sin celdas libres no expande');
  assert.equal((await jugada(bot, vista(2, { cooldowns: { fundar: 3 } }), acciones)).action, 'fundar', 'el cooldown vence cuando turno >= valor');
  assert.equal((await jugada(bot, vista(0), puente())).action, 'esperar', 'con un catalogo sin sus acciones solo espera');
});
test('bot-aleatorio: reproducible por semilla, distinto con otra, y SIEMPRE valido para cualquier catalogo', async () => {
  const secuencia = async (semilla, acciones, n = 60) => { const bot = crearBot('bot-aleatorio', semilla), s = []; for (let t = 0; t < n; t++) s.push(await bot({ observation: vista(t % 5), acciones })); return s; };
  const sim = await simuladas();
  assert.deepEqual(await secuencia(3, sim), await secuencia(3, sim));
  assert.notDeepEqual(await secuencia(3, sim), await secuencia(4, sim));
  for (const acciones of [sim, puente()]) {
    for (const texto of await secuencia(9, acciones, 300)) {
      const v = validarRespuesta(texto); assert.equal(v.ok, true, texto);
      const r = validarAccion(v.acciones[0], { acciones, turno: 1, puntos: 9 });
      // Las unicas "invalidas" posibles son las de contexto (atacar a si mismo no existe en el esquema, asi que ninguna).
      assert.equal(r.ok, true, `${texto} -> ${r.error}`);
    }
  }
  // Nunca elige una accion en cooldown.
  const bot = crearBot('bot-aleatorio', 1), enCooldown = { ...Object.fromEntries(sim.map(a => [a.nombre, 99])), esperar: 0, recolectar: 0 };
  const elegidas = new Set();
  for (let i = 0; i < 60; i++) elegidas.add((await jugada(bot, vista(0, { cooldowns: enCooldown }), sim)).action);
  assert.deepEqual([...elegidas].sort(), ['esperar', 'recolectar']);
});
test('bot-aleatorio no llama a la red ni a otros modulos de modelos', async () => {
  const antes = globalThis.fetch; let llamadas = 0; globalThis.fetch = () => { llamadas++; throw new Error('RED'); };
  try { const bot = crearBot('bot-aleatorio', 5); for (let i = 0; i < 20; i++) await bot({ observation: vista(), acciones: await simuladas() }); } finally { globalThis.fetch = antes; }
  assert.equal(llamadas, 0);
});
const real = () => accionesHabilitadas(normalizarInfo({ protocolo: 1, origen: 'puente', estado: 'listo', capacidades: { reiniciar: true, avanzar: true, terminal: true, multi_faccion: true }, acciones: ACCIONES_REAL_ANUNCIADAS, limites: { max_segundos_avance: 120 } }), CATALOGO, PERFILES.real);
const vistaReal = (extra = {}) => ({ ...vista(0), faccion: fac('f1', { cooldowns: {}, ...extra }), rivales: [fac('f2'), fac('f3', { vivo: false })] });
const turnoReal = async (nombre, turno, usos = {}, cooldowns = {}, puntosTurno = 4) => JSON.parse(await crearBot(nombre)({ observation: vistaReal(), acciones: real(), turno, usos, cooldowns, puntosTurno, maxAcciones: 3 })).actions.map(a => a.action);
test('bot-expansionista (juego real): unidades hasta el tope, donar y bendecir; nunca ataca', async () => {
  assert.deepEqual(await turnoReal('bot-expansionista', 1), ['crear_unidades', 'donar_recursos', 'bendecir']);
  assert.deepEqual(await turnoReal('bot-expansionista', 2, {}, { crear_unidades: 3, bendecir: 3 }), ['donar_recursos'], 'respeta los cooldowns que el orquestador le entrega');
  const tope = { crear_unidades: { veces: 2, acumulado: 10 } };
  assert.ok(!(await turnoReal('bot-expansionista', 5, tope)).includes('crear_unidades'), 'tope de unidades');
  const poderes = { 'grupo:poderes': { veces: 10 }, bendecir: { veces: 10 } };
  assert.ok(!(await turnoReal('bot-expansionista', 5, poderes)).includes('bendecir'), 'tope compartido de poderes');
  assert.deepEqual(await turnoReal('bot-expansionista', 5, { ...tope, ...poderes, donar_recursos: { veces: 10, acumulado: 100 } }), ['esperar']);
  assert.ok(!(await turnoReal('bot-expansionista', 8)).some(a => ['declarar_guerra', 'incendiar', 'maldecir'].includes(a)));
  assert.deepEqual(await turnoReal('bot-expansionista', 1, {}, {}, 2), ['crear_unidades'], 'no pasa del presupuesto de puntos');
});
test('bot-voraz (juego real): crece hasta el turno 5, declara la guerra en el 6 y luego usa poderes contra rivales VIVOS', async () => {
  assert.deepEqual(await turnoReal('bot-voraz', 2), ['crear_unidades'], 'antes del turno 6 el reglamento no deja atacar');
  const t6 = JSON.parse(await crearBot('bot-voraz')({ observation: vistaReal(), acciones: real(), turno: 6, usos: {}, cooldowns: {}, puntosTurno: 4, maxAcciones: 3 })).actions;
  assert.deepEqual(t6.map(a => a.action), ['declarar_guerra']);
  const t7 = JSON.parse(await crearBot('bot-voraz')({ observation: vistaReal(), acciones: real(), turno: 7, usos: { declarar_guerra: { veces: 1, acumulado: 0 } }, cooldowns: { declarar_guerra: 12 }, puntosTurno: 4, maxAcciones: 3 })).actions;
  assert.deepEqual(t7.map(a => a.action), ['incendiar', 'maldecir']); assert.ok(t7.every(a => a.parameters.objetivo === 'f2'), 'solo contra rivales VIVOS');
  assert.ok(!(await turnoReal('bot-voraz', 9, { declarar_guerra: { veces: 1, acumulado: 0 } }, { declarar_guerra: 12 })).includes('declarar_guerra'));
  // Sin rival vivo no hay a quien atacar.
  const solo = { ...vistaReal(), rivales: [fac('f2', { vivo: false })] };
  assert.deepEqual(JSON.parse(await crearBot('bot-voraz')({ observation: solo, acciones: real(), turno: 6, usos: {}, cooldowns: {} })).actions.map(a => a.action), ['esperar']);
});
test('toda jugada de los bots del juego real valida contra el reglamento durante 24 turnos', async () => {
  for (const nombre of ['bot-aleatorio', 'bot-voraz', 'bot-expansionista']) {
    const acciones = real(), bot = crearBot(nombre, 4), usos = {}, cooldowns = {};
    for (let turno = 1; turno <= 24; turno++) {
      const v = validarRespuesta(await bot({ observation: vistaReal(), acciones, turno, usos, cooldowns, puntosTurno: 4, maxAcciones: 3 }), { maxAcciones: 3 });
      assert.equal(v.ok, true, nombre);
      let puntos = 4;
      for (const a of v.acciones) {
        const r = validarAccion(a, { acciones, turno, cooldowns, puntos, usos });
        assert.equal(r.ok, true, `${nombre} T${turno} ${JSON.stringify(a)} -> ${r.error}`);
        if (a.action === 'esperar') continue;
        puntos -= r.regla.puntos; if (r.regla.cooldown) cooldowns[a.action] = turno + r.regla.cooldown + 1; registrarUso(usos, r.regla, a.parameters);
      }
    }
  }
});
test('bot-roto falla de cuatro maneras distintas y cada una pierde exactamente una decision', async () => {
  const bot = crearBot('bot-roto'), acciones = await simuladas(), errores = [];
  for (let i = 0; i < 8; i++) {
    const texto = await bot({ observation: vista(), acciones }), v = validarRespuesta(texto, { maxAcciones: 3 });
    if (!v.ok) { errores.push(v.error); continue; }
    errores.push(validarAccion(v.acciones[0], { acciones, puntos: 3 }).error);
  }
  assert.deepEqual(errores, ['json_invalido', 'accion_no_permitida', 'parametros_invalidos', 'respuesta_invalida', 'json_invalido', 'accion_no_permitida', 'parametros_invalidos', 'respuesta_invalida']);
});

// Arreglos X1 (revision independiente R1): cada prueba FALLA sin su arreglo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { servirPuenteReal } from './ayudas.js';
import { correrCompetencia } from '../../worldbox/orquestador.js';
import { crearAdaptadorHttp } from '../../worldbox/adaptador-http.js';
import { crearAdaptadorSimulado } from '../../worldbox/adaptador-simulado.js';
import { crearPasarela } from '../../worldbox/pasarela.js';
import { reconstruirReporte } from '../../worldbox/reporte.js';
import { ranking } from '../../worldbox/puntuacion.js';
import { registrarUso, accionesHabilitadas, CATALOGO } from '../../worldbox/contrato-acciones.js';
import { normalizarInfo } from '../../worldbox/adaptador.js';
import { PERFILES } from '../../worldbox/reglas.js';
import { ACCIONES_REAL_ANUNCIADAS } from './ayudas.js';
import { auditarEventos } from '../../worldbox/auditar.js';

const A = (action, parameters = {}) => ({ action, parameters });
const ESPERAR = [A('esperar')];
// Participante con guion: una lista de acciones por turno; turno sin lista (o vacia) = esperar. Captura el prompt de sistema si se pide.
const guion = (turnos = [], capturas = null) => async ({ turno, prompt }) => { capturas?.push(prompt.sistema); return JSON.stringify({ actions: turnos[turno - 1]?.length ? turnos[turno - 1] : ESPERAR, reasoning_summary: '' }); };
async function jugar(t, guiones, { puente: opcionesPuente, config = {}, adaptador: opcionesAdaptador = {} } = {}) {
  const puente = await servirPuenteReal(t, opcionesPuente);
  const r = await correrCompetencia({ adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token, reintentos: 0, ...opcionesAdaptador }), participantes: guiones.map((g, i) => ({ id: `f${i + 1}`, modelo: `bot-${i + 1}`, decidir: g })), ...config });
  return { ...r, puente };
}
const decision = (eventos, turno, id = 'f1') => eventos.find(e => e.tipo === 'decision' && e.turn_number === turno && e.participant_id === id);
const accionesAlPuente = puente => puente.peticiones.filter(p => p.url === '/v1/accion');

// ---------------------------------------------------------------- hallazgo 1
test('X1-1: pedir_paz contra un id que no existe NO aborta la competencia: infraccion de contenido y nunca llega al puente', async t => {
  const f1 = guion([[A('pedir_paz', { objetivo: 'fantasma' })], [A('pedir_paz', { objetivo: 'f1' })], [A('pedir_paz', { objetivo: 'f2' })]]);
  const { reporte, eventos, puente } = await jugar(t, [f1, guion()], { config: { turnos: 4 } });
  assert.equal(reporte.completo, true); assert.equal(reporte.turnos, 4);
  assert.deepEqual([1, 2].map(n => decision(eventos, n).error_type), ['objetivo_invalido', 'objetivo_invalido']);
  // El turno 3 apunta a un rival valido: SI viaja al puente (el juego lo rechaza porque no hay guerra) y tambien es infraccion.
  assert.equal(decision(eventos, 3).error_type, 'sin_guerra');
  assert.equal(reporte.ranking.find(r => r.participant_id === 'f1').penalizaciones, 3);
  assert.deepEqual(accionesAlPuente(puente).map(p => p.cuerpo.parametros.objetivo), ['f2']);
  // La auditoria tambien conoce los rivales vivos: dar por «validada» una orden contra un id inexistente se detecta.
  assert.deepEqual((await auditarEventos(eventos)).problemas, []);
  const falso = structuredClone(eventos), d = decision(falso, 1);
  Object.assign(d, { action_validated: [A('pedir_paz', { objetivo: 'fantasma' })], execution_result: [{ resultado: 'sin_efecto', codigo: 'ok' }], acciones_invalidas: 0, penalizaciones: 0, error_type: null });
  assert.ok((await auditarEventos(falso)).problemas.some(p => /action_validated no corresponde/.test(p)));
});
test('X1-1: un 400 solicitud_invalida del puente en una orden = accion rechazada con infraccion y la partida CONTINUA; otros errores del puente la dejan incompleta', async t => {
  const gancho = (accion, respuesta) => async (req, body) => (req.url === '/v1/accion' && body?.accion === accion ? respuesta : null);
  const e400 = { status: 400, body: { protocolo: 1, ok: false, error: { codigo: 'solicitud_invalida', mensaje: 'detalle interno' } } };
  const a = await jugar(t, [guion([[A('bendecir', { gotas: 1 })], [A('bendecir', { gotas: 1 })], [], [A('bendecir', { gotas: 1 })]]), guion()], { puente: { gancho: gancho('bendecir', e400) }, config: { turnos: 4 } });
  assert.equal(a.reporte.completo, true); assert.equal(a.reporte.turnos, 4);
  assert.deepEqual([1, 2, 4].map(n => decision(a.eventos, n).execution_result.map(x => x.resultado + '/' + x.codigo)), [['rechazada/solicitud_invalida'], ['rechazada/solicitud_invalida'], ['rechazada/solicitud_invalida']]);
  assert.equal(a.reporte.ranking.find(r => r.participant_id === 'f1').penalizaciones, 3); assert.equal(a.reporte.ranking.find(r => r.participant_id === 'f1').acciones_rechazadas, 3);
  assert.ok(!JSON.stringify(a.eventos).includes('detalle interno'), 'el mensaje del servidor no se registra');
  // 503 no_listo: no es contenido del modelo; politica tecnica actual (cierre incompleto).
  const b = await jugar(t, [guion([[A('bendecir', { gotas: 1 })]]), guion()], { puente: { gancho: gancho('bendecir', { status: 503, body: { protocolo: 1, ok: false, error: { codigo: 'no_listo', mensaje: 'x' } } }) }, config: { turnos: 4 } });
  assert.equal(b.reporte.completo, false); assert.equal(b.reporte.razon, 'puente_no_listo'); assert.equal(b.reporte.ranking.find(r => r.participant_id === 'f1').penalizaciones, 0);
});

test('X1-2: un log de OTRA version de reglas (1.0.0) no se reproduce con las reglas vigentes: coherencia basica y aviso, sin falsos problemas', async t => {
  const { eventos } = await jugar(t, [guion([[A('crear_unidades', { cantidad: 5 })]]), guion()], { config: { turnos: 3 } });
  const viejo = structuredClone(eventos).map(e => e.tipo === 'inicio' ? { ...e, config: { ...e.config, rules_version: 'auge-real-1.0.0' } } : e.tipo === 'decision' ? { ...e, rules_version: 'auge-real-1.0.0' } : e);
  const a = await auditarEventos(viejo);
  assert.deepEqual(a.problemas, []); assert.equal(a.resumen.decisiones_reproducidas, 0); assert.equal(a.resumen.prompts_verificados, 0);
  assert.ok(a.avisos.some(x => /OTRA version de reglas \(auge-real-1\.0\.0/.test(x)));
  assert.equal((await auditarEventos(eventos)).resumen.decisiones_reproducidas, 6);
});

// ---------------------------------------------------------------- hallazgo 3
test('X1-3: el UNICO superviviente gana aunque las infracciones lo dejen por debajo del eliminado (reglas 1.1.0)', async t => {
  const inventadas = [A('inventada'), A('inventada')];
  const f1 = guion(Array.from({ length: 24 }, (_, i) => i === 0 ? [A('crear_unidades', { cantidad: 5 }), ...inventadas] : i === 2 ? [A('crear_unidades', { cantidad: 5 }), ...inventadas] : i === 5 ? [A('declarar_guerra', { objetivo: 'f2' }), ...inventadas] : [...inventadas, A('inventada')]));
  const f2 = guion([[A('crear_unidades', { cantidad: 5 })]]);
  const { reporte, eventos } = await jugar(t, [f1, f2]);
  assert.equal(reporte.razon, 'supervivencia'); assert.equal(reporte.completo, true);
  const [primero, segundo] = reporte.ranking;
  assert.deepEqual([primero.participant_id, primero.puesto, primero.vivo, segundo.participant_id, segundo.puesto, segundo.vivo], ['f1', 1, true, 'f2', 2, false]);
  assert.ok(primero.puntos < segundo.puntos, `el superviviente tiene ${primero.puntos} y el eliminado ${segundo.puntos}: los puntos solos los ordenarian al reves`);
  assert.deepEqual(reporte.versiones, { rules_version: 'auge-real-1.1.0', prompt_version: 'worldbox-1.2.0' }); assert.equal(reporte.victoria_supervivencia, true);
  assert.equal(eventos.find(e => e.tipo === 'decision').rules_version, 'auge-real-1.1.0');
  // Reconstruido con las reglas 1.0.0 (sin la marca en el log) el orden seria el de solo puntos: la regla viaja con el log.
  const antiguo = eventos.map(e => e.tipo === 'inicio' ? { ...e, config: { ...e.config, victoria_supervivencia: undefined } } : e);
  assert.equal(reconstruirReporte(antiguo).ranking[0].participant_id, 'f2');
});
test('X1-3: ranking con supervivencia: un solo vivo gana; dos vivos, cero vivos o la regla apagada, solo puntos', () => {
  const fila = (participant_id, vivo, puntos, poblacion = 1, territorio = 1) => ({ participant_id, vivo, puntos, poblacion, territorio });
  const filas = [fila('a', false, 0), fila('b', true, -50), fila('c', false, 10), fila('d', false, 10)];
  assert.deepEqual(ranking(filas, { supervivencia: true }).map(f => [f.participant_id, f.puesto]), [['b', 1], ['c', 2], ['d', 2], ['a', 4]]);
  assert.deepEqual(ranking(filas).map(f => f.participant_id)[0], 'c', 'sin la regla manda el puntaje');
  assert.deepEqual(ranking([fila('a', true, -5), fila('b', true, 20)], { supervivencia: true }).map(f => f.participant_id), ['b', 'a']);
  assert.deepEqual(ranking([fila('a', false, 3), fila('b', false, 9)], { supervivencia: true }).map(f => [f.participant_id, f.puesto]), [['b', 1], ['a', 2]]);
  assert.deepEqual(ranking([fila('solo', true, -9)], { supervivencia: true }).map(f => f.puesto), [1]);
});

// ---------------------------------------------------------------- hallazgo 5
test('X1-5: respuesta rota o cortada = decision perdida con UNA infraccion, UNA sola llamada, y el texto de cada intento queda en la traza', async t => {
  const llamadas = [];
  const llamar = async o => { llamadas.push(o.modelo); return o.modelo === 'cortado' ? { texto: '{"actions":[{"action":"esper', finishReason: 'length', uso: { cost: 0.001, prompt_tokens: 10, completion_tokens: 8 } }
    : { texto: '{roto', finishReason: 'stop', uso: { cost: 0.001, prompt_tokens: 10, completion_tokens: 8 }, razonamiento_efectivo: 'low' }; };
  const tarifas = { cortado: { entrada: 1, salida: 1 }, roto: { entrada: 1, salida: 1 } };
  const pasarela = crearPasarela({ presupuesto: 10, tarifas, maxTokens: 100, llamar, limitador: { esperar: async () => {} } });
  const { reporte, eventos } = await correrCompetencia({ adaptador: crearAdaptadorSimulado(), participantes: [{ id: 'f1', modelo: 'cortado' }, { id: 'f2', modelo: 'roto' }], pasarela, presupuesto: 10, turnos: 2 });
  assert.deepEqual(llamadas, ['cortado', 'roto', 'roto', 'cortado'], 'sin reintentos de contenido: una llamada por decision (el orden de actuacion rota)');
  assert.deepEqual(reporte.ranking.map(r => [r.participant_id, r.penalizaciones]).sort(), [['f1', 2], ['f2', 2]]);
  const d = decision(eventos, 1, 'f1'), r = decision(eventos, 1, 'f2');
  assert.equal(d.error_type, 'respuesta_incompleta'); assert.equal(r.error_type, 'json_invalido'); assert.equal(d.retry_count, 0);
  assert.equal(d.intentos[0].texto, '{"actions":[{"action":"esper'); assert.equal(r.intentos[0].texto, '{roto'); assert.equal(r.razonamiento_efectivo, 'low');
  assert.deepEqual(d.action_validated, [{ action: 'esperar', parameters: {} }]);
});

// ---------------------------------------------------------------- hallazgo 6
test('X1-6: el prompt describe la configuracion EFECTIVA (orc, 8 unidades, x1), no los valores por omision del perfil, y la auditoria lo reconstruye', async t => {
  const capturas = [];
  const { reporte, eventos } = await jugar(t, [guion([], capturas), guion([], capturas)], { config: { turnos: 2, especie: 'orc', opcionesEscenario: { unidades_iniciales: 8, velocidad: 'x1' } } });
  const sistema = capturas[0];
  assert.ok(sistema.includes('misma especie (orc)') && sistema.includes('1 ciudad y 8 habitantes') && sistema.includes('velocidad x1'), sistema.slice(sistema.indexOf('Reglas del juego real'), sistema.indexOf('Reglas del juego real') + 700));
  assert.ok(!sistema.includes('(human)') && !sistema.includes('4 habitantes') && !sistema.includes('velocidad x10'), 'nada de los valores por omision');
  assert.ok(sistema.includes('Mapa: plantilla continent, tamano small, 192 por 192 casillas'));
  assert.deepEqual(eventos[0].config.efectiva, { especies: ['orc'], unidadesIniciales: 8, velocidad: 'x1', plantilla: 'continent', tamano: 'small', ancho: 192, alto: 192 });
  assert.equal(reporte.config.efectiva.especies[0], 'orc');
  const auditoria = await auditarEventos(eventos);
  assert.deepEqual(auditoria.problemas, []); assert.equal(auditoria.resumen.prompts_verificados, 4);
  // Si la auditoria usara los valores por omision, el prompt reconstruido NO coincidiria: se altera la configuracion efectiva guardada.
  const cambiado = eventos.map(e => e.tipo === 'inicio' ? { ...e, config: { ...e.config, efectiva: { ...e.config.efectiva, velocidad: 'x10' } } } : e);
  assert.ok((await auditarEventos(cambiado)).problemas.some(p => /texto de sistema reconstruido/.test(p)));
});
test('X1-6: si el puente informa algo distinto de lo pedido (especie, velocidad, unidades, plantilla) la partida NO empieza y no deja log', async t => {
  for (const puente of [{ mundoReinicio: { velocidad: 'x5' } }, { mundoReinicio: { unidades_iniciales: 3 } }, { mundoReinicio: { plantilla: 'pancake' } }, { especiesReinicio: { f1: 'elf' } }]) {
    const log = [];
    await assert.rejects(() => jugar(t, [guion(), guion()], { puente, config: { telemetria: { eventos: log, registrar: async e => { log.push(e); } } } }), /configuracion_no_aplicada/, JSON.stringify(puente));
    assert.equal(log.length, 0);
  }
});

// ---------------------------------------------------------------- hallazgo 7
test('X1-7: crear_unidades es todo o nada y el cupo solo descuenta lo que el puente CONFIRMA en efecto.creadas', async t => {
  const pide5 = [A('crear_unidades', { cantidad: 5 })];
  // Se piden 5 y el juego confirma 1: el cupo baja 1, no 5.
  const parcial = await jugar(t, [guion([pide5, [], pide5, [], pide5]), guion()], { puente: { creadasEfecto: () => 1 }, config: { turnos: 6 } });
  assert.deepEqual([1, 3, 5].map(n => decision(parcial.eventos, n).usos.crear_unidades.acumulado), [1, 2, 3]);
  assert.deepEqual(decision(parcial.eventos, 6).estado_orquestador.restricciones.crear_unidades, { acumulado: 3, maximo_acumulado: 10 });
  assert.deepEqual(decision(parcial.eventos, 1).execution_result[0].efecto, { pedidas: 5, creadas: 1, poblacion_antes: 4, poblacion_despues: 9 });
  // Sin `efecto.creadas` en la respuesta: descuenta 0 y deja la anomalia registrada.
  const sinEfecto = await jugar(t, [guion([pide5]), guion()], { puente: { creadasEfecto: () => null }, config: { turnos: 2 } });
  assert.equal(decision(sinEfecto.eventos, 1).usos.crear_unidades.acumulado, 0);
  assert.deepEqual(decision(sinEfecto.eventos, 1).anomalias, [{ accion: 'crear_unidades', tipo: 'efecto_creadas_ausente', descontado: 0 }]);
  assert.equal(decision(sinEfecto.eventos, 2).anomalias, undefined);
  // Todo o nada: si no caben las 5, el puente rechaza (sin_espacio), no se crea ninguna y el cupo no se toca.
  const sinEspacio = await jugar(t, [guion([pide5, [A('crear_unidades', { cantidad: 3 })]]), guion()], { puente: { espacio: 3 }, config: { turnos: 3 } });
  assert.equal(decision(sinEspacio.eventos, 1).execution_result[0].codigo, 'sin_espacio'); assert.equal(decision(sinEspacio.eventos, 1).penalizaciones, 1);
  assert.equal(decision(sinEspacio.eventos, 1).usos.crear_unidades, undefined);
  assert.equal(decision(sinEspacio.eventos, 3).usos.crear_unidades.acumulado, 3);
  // La auditoria usa el efecto registrado: alterarlo se detecta.
  const eventos = structuredClone(parcial.eventos); eventos.find(e => e.tipo === 'decision').execution_result[0].efecto.creadas = 5;
  assert.ok((await auditarEventos(eventos)).problemas.some(p => /usos registrados no coinciden/.test(p)));
});
test('X1-7: registrarUso — con efecto confirmado descuenta lo creado (tambien en sin_efecto); sin efecto y ejecutada, anomalia; planificacion supone lo pedido', () => {
  const regla = accionesHabilitadas(normalizarInfo({ protocolo: 1, origen: 'puente', estado: 'listo', capacidades: { reiniciar: true, avanzar: true, terminal: true, multi_faccion: true }, acciones: ACCIONES_REAL_ANUNCIADAS, limites: { max_segundos_avance: 120 } }), CATALOGO, PERFILES.real).find(a => a.nombre === 'crear_unidades');
  const usos = {};
  assert.deepEqual(registrarUso(usos, regla, { cantidad: 5 }, { ejecutada: true, efecto: { creadas: 2 } }), []); assert.deepEqual(usos.crear_unidades, { veces: 1, acumulado: 2 });
  assert.deepEqual(registrarUso(usos, regla, { cantidad: 5 }, { ejecutada: false, efecto: { creadas: 3 } }), []); assert.deepEqual(usos.crear_unidades, { veces: 1, acumulado: 5 }, 'sin_efecto con unidades creadas SI descuenta cupo, pero no cuenta como uso');
  assert.equal(registrarUso(usos, regla, { cantidad: 5 }, { ejecutada: false, efecto: null }).length, 0);
  assert.equal(registrarUso(usos, regla, { cantidad: 5 }, { ejecutada: true, efecto: { creadas: 'cinco' } }).length, 1);
  assert.equal(usos.crear_unidades.acumulado, 5);
  const plan = {}; registrarUso(plan, regla, { cantidad: 4 }); assert.equal(plan.crear_unidades.acumulado, 4);
});

// ---------------------------------------------------------------- hallazgo 8
test('X1-8: la traza guarda efecto acotado, ids de solicitud al puente, build/Unity, configuracion efectiva y razonamiento efectivo; sin secretos', async t => {
  const puente = await servirPuenteReal(t);
  const llamar = async () => ({ texto: JSON.stringify({ actions: [A('bendecir', { gotas: 2 })], reasoning_summary: 'ok' }), uso: { cost: 0.001, prompt_tokens: 100, completion_tokens: 10 }, finishReason: 'stop', razonamiento_efectivo: 'medium' });
  const pasarela = crearPasarela({ presupuesto: 5, tarifas: { 'lab/a': { entrada: 1, salida: 1 }, 'lab/b': { entrada: 1, salida: 1 } }, maxTokens: 100, llamar, limitador: { esperar: async () => {} } });
  const { eventos } = await correrCompetencia({ adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), participantes: [{ id: 'f1', modelo: 'lab/a' }, { id: 'f2', modelo: 'lab/b' }], pasarela, presupuesto: 5, turnos: 2 });
  const d = decision(eventos, 1);
  assert.equal(d.razonamiento_efectivo, 'medium'); assert.equal(d.intentos[0].razonamiento_efectivo, 'medium');
  assert.ok(d.execution_result[0].efecto.diferido === undefined && d.execution_result[0].efecto.interno === 1, 'efecto acotado (escalares) de la respuesta');
  assert.match(d.execution_result[0].id_solicitud, /^[0-9a-f-]{36}$/);
  const ids = puente.peticiones.filter(p => p.cuerpo?.id_solicitud).map(p => p.cuerpo.id_solicitud);
  assert.ok(ids.includes(d.execution_result[0].id_solicitud), 'el id registrado es el que viajo al puente');
  assert.deepEqual(eventos[0].config.adaptador.juego, { nombre: 'WorldBox', version: '0.51.2', build_steam: '19962337', unity: '2022.3.60f1' });
  assert.equal(eventos[0].config.rules_version, 'auge-real-1.1.0'); assert.equal(eventos[0].config.prompt_version, 'worldbox-1.2.0');
  assert.ok(eventos[0].escenario.id_solicitud_reinicio); assert.ok(eventos.find(e => e.tipo === 'turno').avance.id_solicitud);
  assert.equal(eventos.find(e => e.tipo === 'turno').avance.segundos_pedidos, 50);
  assert.ok(!JSON.stringify(eventos).includes(puente.token), 'el token del puente no aparece en la traza');
});

// ---------------------------------------------------------------- hallazgo 11
test('X1-11: semilla entera 0..2147483647 (con signo de 32 bits, no negativa), en ambos extremos y por CLI', async () => {
  const bots = () => [1, 2].map(i => ({ id: `f${i}`, modelo: 'b', decidir: guion() }));
  for (const semilla of [0, 2147483647]) assert.equal((await correrCompetencia({ adaptador: crearAdaptadorSimulado(), participantes: bots(), semilla, turnos: 1 })).reporte.escenario.semilla_usada, semilla);
  for (const semilla of [-1, 2147483648, 4294967295, 2 ** 32, 1.5, NaN]) await assert.rejects(() => correrCompetencia({ adaptador: crearAdaptadorSimulado(), participantes: bots(), semilla, turnos: 1 }), /solicitud_invalida/, String(semilla));
  await assert.rejects(() => crearAdaptadorSimulado().reiniciarEscenario({ semilla: 2147483648, facciones: [{ id: 'a' }, { id: 'b' }] }), /solicitud_invalida/);
  await assert.doesNotReject(() => crearAdaptadorSimulado().reiniciarEscenario({ semilla: 2147483647, facciones: [{ id: 'a' }, { id: 'b' }] }));
  const cli = fileURLToPath(new URL('../../worldbox/correr.js', import.meta.url));
  const malo = spawnSync(process.execPath, [cli, '--semilla=2147483648', '--turnos=1', '--salida=ruta-que-no-se-crea'], { encoding: 'utf8' });
  assert.equal(malo.status, 1); assert.equal(malo.stderr.trim(), 'WorldBox: solicitud_invalida');
});

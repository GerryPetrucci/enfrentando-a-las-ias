import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCIONES_REAL_ANUNCIADAS, servirPuenteReal, servirPuente } from './ayudas.js';
import { CATALOGO, accionesHabilitadas, validarAccion, restriccionIncumplida, restriccionesVisibles, registrarUso } from '../../worldbox/contrato-acciones.js';
import { normalizarInfo } from '../../worldbox/adaptador.js';
import { PERFILES, ACCIONES_REAL } from '../../worldbox/reglas.js';
import { PESOS_REAL, puntuar } from '../../worldbox/puntuacion.js';
import { construirObservacion } from '../../worldbox/observacion.js';
import { construirPrompt } from '../../worldbox/prompt.js';
import { correrCompetencia } from '../../worldbox/orquestador.js';
import { crearAdaptadorHttp } from '../../worldbox/adaptador-http.js';
import { crearBot } from '../../worldbox/bots.js';
import { hash } from '../../worldbox/util.js';

const infoReal = (extra = {}) => normalizarInfo({ protocolo: 1, origen: 'puente', estado: 'listo', puente: { nombre: 'p', version: '0.2.0' }, juego: { nombre: 'WorldBox', version: '0.51.2' },
  capacidades: { reiniciar: true, semilla: false, avanzar: true, terminal: true, multi_faccion: true }, acciones: ACCIONES_REAL_ANUNCIADAS, limites: { max_segundos_avance: 120, max_acciones_por_turno: 3 }, ...extra });
const REAL = PERFILES.real;
const habilitadas = (info = infoReal()) => accionesHabilitadas(info, CATALOGO, REAL);
// Participante con guion: una lista de acciones por turno; turno sin lista (o lista vacia) = esperar.
const guion = (...turnos) => async ({ turno }) => JSON.stringify({ actions: turnos[turno - 1]?.length ? turnos[turno - 1] : [{ action: 'esperar', parameters: {} }], reasoning_summary: '' });
const A = (action, parameters = {}) => ({ action, parameters });
async function jugar(t, guiones, extra = {}) {
  const puente = await servirPuenteReal(t, extra.puente);
  const participantes = guiones.map((g, i) => ({ id: `f${i + 1}`, modelo: `bot-${i + 1}`, decidir: g }));
  const r = await correrCompetencia({ adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), participantes, ...extra.config });
  return { ...r, puente };
}

test('el reglamento real habilita SOLO lo anunciado con el esquema exacto y aplica la tabla de costos de W5', () => {
  const r = habilitadas();
  assert.deepEqual(r.map(a => a.nombre), ['esperar', 'crear_unidades', 'bendecir', 'maldecir', 'incendiar', 'donar_recursos', 'declarar_guerra', 'pedir_paz']);
  const tabla = Object.fromEntries(r.map(a => [a.nombre, [a.puntos, a.cooldown]]));
  assert.deepEqual(tabla, { esperar: [0, 0], crear_unidades: [2, 1], bendecir: [1, 1], maldecir: [2, 2], incendiar: [2, 2], donar_recursos: [1, 0], declarar_guerra: [3, 5], pedir_paz: [1, 0] });
  const g = r.find(a => a.nombre === 'declarar_guerra');
  assert.deepEqual([g.desde_turno, g.max_por_partida], [6, 1]);
  // Puerta de las acciones hostiles: guerra y poderes contra un rival, no antes del turno 6 (bendecir es propio y no la tiene).
  assert.deepEqual(r.filter(a => a.desde_turno === 6).map(a => a.nombre), ['maldecir', 'incendiar', 'declarar_guerra']);
  assert.ok(['crear_unidades', 'bendecir', 'donar_recursos', 'pedir_paz', 'esperar'].every(n => r.find(a => a.nombre === n).desde_turno === undefined));
  assert.deepEqual(r.find(a => a.nombre === 'crear_unidades').acumulado, { parametro: 'cantidad', maximo: 10, efecto: 'creadas' });
  assert.deepEqual(r.find(a => a.nombre === 'donar_recursos').acumulado, { parametro: 'cantidad', maximo: 100 });
  for (const n of ['bendecir', 'maldecir', 'incendiar']) assert.deepEqual(r.find(a => a.nombre === n).tope_grupo, { grupo: 'poderes', maximo: 10 });
  // El texto que ven los modelos es el del reglamento; el del puente solo se conserva para auditar.
  const c = r.find(a => a.nombre === 'crear_unidades');
  assert.ok(c.descripcion.includes('Tope del reglamento: 10')); assert.ok(c.descripcion_puente.includes('tope 30'));
  // Cualquier cambio de esquema, de verificacion o un nombre ajeno deja la accion fuera.
  const cambiada = ACCIONES_REAL_ANUNCIADAS.map(a => a.nombre === 'crear_unidades' ? { ...a, parametros: { cantidad: { tipo: 'entero', minimo: 1, maximo: 6 } } } : a.nombre === 'bendecir' ? { ...a, verificada: false } : a.nombre === 'maldecir' ? { ...a, descripcion: 'EN PRUEBA (NO verificada): x' } : a);
  const ajena = { nombre: 'alianza', descripcion: 'Forma una alianza.', verificada: true, parametros: { objetivo: { tipo: 'cadena', minimo: 1, maximo: 40 } } };
  assert.deepEqual(habilitadas(infoReal({ acciones: [...cambiada, ajena] })).map(a => a.nombre), ['esperar', 'incendiar', 'donar_recursos', 'declarar_guerra', 'pedir_paz']);
  assert.deepEqual(habilitadas(infoReal({ acciones: [] })).map(a => a.nombre), ['esperar']);
  // La tabla del reglamento y la partida estan congeladas.
  assert.deepEqual(Object.keys(ACCIONES_REAL), ['crear_unidades', 'bendecir', 'maldecir', 'incendiar', 'donar_recursos', 'declarar_guerra', 'pedir_paz']);
  assert.deepEqual(REAL.partida, { facciones: 2, especie: 'human', turnos: 24, segundosPorTurno: 50, maxAcciones: 3, puntosPorTurno: 4, tamanoMapa: 192, velocidad: 'x10', plantilla: 'continent', unidadesIniciales: 4, umbralSitio: 30, intentosMapa: 10, maxTiempoMs: 3_600_000, timeoutMs: 60000 });
  assert.equal(REAL.rules_version, 'auge-real-1.1.0');
});
test('restricciones: desde el turno 6, una guerra por faccion, 10 unidades, 10 poderes compartidos, 100 recursos y 4 puntos', () => {
  const r = habilitadas(), v = (accion, usos = {}, extra = {}) => validarAccion(accion, { acciones: r, turno: 8, puntos: 4, usos, ...extra });
  const guerra = A('declarar_guerra', { objetivo: 'f2' });
  assert.equal(validarAccion(guerra, { acciones: r, turno: 5, puntos: 4 }).error, 'aun_no_disponible');
  assert.equal(validarAccion(guerra, { acciones: r, turno: 6, puntos: 4 }).ok, true);
  for (const n of ['maldecir', 'incendiar']) {
    const poder = A(n, { objetivo: 'f2', gotas: 3 });
    assert.equal(validarAccion(poder, { acciones: r, turno: 5, puntos: 4 }).error, 'aun_no_disponible', `${n} antes del turno 6`);
    assert.equal(validarAccion(poder, { acciones: r, turno: 6, puntos: 4 }).ok, true, `${n} desde el turno 6`);
  }
  assert.equal(validarAccion(A('bendecir', { gotas: 3 }), { acciones: r, turno: 1, puntos: 4 }).ok, true, 'bendecir es propio: sin puerta');
  assert.equal(v(guerra, { declarar_guerra: { veces: 1 } }).error, 'limite_partida');
  assert.equal(v(guerra, {}, { puntos: 2 }).error, 'puntos_insuficientes');
  assert.equal(v(A('crear_unidades', { cantidad: 5 }), { crear_unidades: { veces: 1, acumulado: 5 } }).ok, true);
  assert.equal(v(A('crear_unidades', { cantidad: 1 }), { crear_unidades: { veces: 2, acumulado: 10 } }).error, 'limite_partida');
  assert.equal(v(A('crear_unidades', { cantidad: 5 }), { crear_unidades: { veces: 1, acumulado: 6 } }).error, 'limite_partida', 'se mira la suma, no cada orden');
  for (const n of ['bendecir', 'maldecir', 'incendiar']) {
    const accion = A(n, n === 'bendecir' ? { gotas: 1 } : { objetivo: 'f2', gotas: 1 });
    assert.equal(v(accion, { 'grupo:poderes': { veces: 9 } }).ok, true, n); assert.equal(v(accion, { 'grupo:poderes': { veces: 10 } }).error, 'limite_partida', n);
  }
  assert.equal(v(A('donar_recursos', { recurso: 'wood', cantidad: 10 }), { donar_recursos: { veces: 9, acumulado: 91 } }).error, 'limite_partida');
  assert.equal(v(A('donar_recursos', { recurso: 'wood', cantidad: 10 }), { donar_recursos: { veces: 9, acumulado: 90 } }).ok, true);
  assert.equal(v(A('donar_recursos', { recurso: 'hierro', cantidad: 1 })).error, 'parametros_invalidos');
  assert.equal(v(A('maldecir', { objetivo: 'f2', gotas: 4 })).error, 'parametros_invalidos');
  assert.equal(restriccionIncumplida({ nombre: 'x' }, {}, 1, {}), null);
});
test('uso y restricciones visibles: solo `ejecutada` cuenta; cada faccion ve SUS limites', () => {
  const r = habilitadas(), usos = {};
  registrarUso(usos, r.find(a => a.nombre === 'crear_unidades'), { cantidad: 3 }); registrarUso(usos, r.find(a => a.nombre === 'bendecir'), { gotas: 2 }); registrarUso(usos, r.find(a => a.nombre === 'incendiar'), { objetivo: 'f2', gotas: 1 });
  assert.deepEqual(usos, { crear_unidades: { veces: 1, acumulado: 3 }, bendecir: { veces: 1, acumulado: 0 }, 'grupo:poderes': { veces: 2 }, incendiar: { veces: 1, acumulado: 0 } });
  const vis = restriccionesVisibles(r, usos);
  assert.deepEqual(vis.crear_unidades, { acumulado: 3, maximo_acumulado: 10 });
  assert.deepEqual(vis.declarar_guerra, { desde_turno: 6, usadas: 0, maximo: 1 });
  assert.deepEqual(vis.bendecir, { grupo: 'poderes', usadas_grupo: 2, maximo_grupo: 10 });
  assert.deepEqual(vis.donar_recursos, { acumulado: 0, maximo_acumulado: 100 });
  assert.ok(!('pedir_paz' in vis) && !('esperar' in vis));
});
test('puntuacion del juego real: pesos del reglamento, campos que SI discriminan y formula en el log', () => {
  assert.deepEqual({ ...PESOS_REAL }, { supervivencia: 100, poblacion: 0.3, territorio: 0.1, edificios: 0.8, recursos: 0.2, salud_media_pct: 0.5, penalizacion: 5 });
  const f = { vivo: true, poblacion: 10, territorio: 12, edificios: 5, recursos: 30, salud_media_pct: 80, ciudades: 1, objetivos: 1, ejercito: 0, comida: 9 };
  assert.equal(puntuar(f, 0, PESOS_REAL), 154.2, '100 + 3 + 1.2 + 4 + 6 + 40');
  assert.equal(puntuar({ ...f, ciudades: 5, objetivos: 5, ejercito: 40, comida: 999 }, 0, PESOS_REAL), 154.2, 'ciudades, objetivos, ejercito y comida no puntuan');
  assert.equal(puntuar({ ...f, vivo: false }, 0, PESOS_REAL), 54.2); assert.equal(puntuar(f, 2, PESOS_REAL), 144.2);
});

test('el prompt del juego real describe el catalogo anunciado, las cifras del reglamento y la observacion real', () => {
  const acciones = habilitadas();
  const vista = construirObservacion({ origen: 'puente', turno_juego: 3, tiempo_juego_s: 150.2, mundo: { tamano_mapa: 576, libres: 266 },
    faccion: { id: 'f1', vivo: true, especie: 'human', poblacion: 6, ciudades: 1, territorio: 12, recursos: 3, objetivos: 1, ejercito: 0, edificios: 3, comida: 4, salud_media_pct: 90, rey_vivo: true, cooldowns: {}, unidades_creadas: 5, unidades_creables_restantes: 25 },
    rivales: [{ id: 'f2', vivo: true, especie: 'human', poblacion: 5, ciudades: 1, territorio: 11, recursos: 0, objetivos: 1, ejercito: 0, edificios: 2, comida: 1, salud_media_pct: 100, rey_vivo: true, cooldowns: {} }] });
  const p = construirPrompt({ ...vista, acciones, maxAcciones: 3, puntosPorTurno: 4, turnos: 24, segundosPorTurno: 50, turno: 4, orden: ['f1', 'f2'], perfil: REAL,
    restricciones: restriccionesVisibles(acciones, {}), cooldownsPropios: { crear_unidades: 5 } });
  const s = p.sistema;
  for (const texto of ['rules_version=auge-real-1.1.0', 'WorldBox 0.51.2', 'mapa NUEVO', 'especie (human)', '50 segundos de juego', 'velocidad x10', '24 turnos (1200 segundos', '4 puntos de accion', 'maximo 3 acciones',
    'Puntos = 100 si vives, mas 0.3 por habitante, mas 0.1 por zona de territorio, mas 0.8 por edificio, mas 0.2 por unidad de recurso, mas 0.5 por punto de salud media', 'menos 5 por infraccion',
    'Ciudades, objetivos (que en este juego es igual a ciudades), ejercito, comida y rey_vivo no puntuan', `da ${puntuar({ vivo: true, poblacion: 10, territorio: 12, edificios: 5, recursos: 30, salud_media_pct: 80 }, 0, PESOS_REAL)} puntos`,
    'NO que ya causaran dano', 'sin_efecto = el juego la acepto pero no cambio nada', 'rechazada = ', 'solo ejecutada cuenta para los topes', 'Solo desde el turno 6', 'Maximo 1 vez por faccion y partida', 'Suma maxima de cantidad por faccion y partida: 10',
    'Tope compartido (grupo poderes): 10', 'estado_orquestador', 'cooldowns (siempre {} en el juego real', 'unidades_creables_restantes', 'zonas de 8 por 8 casillas', 'Mientras dos reinos estan en guerra', 'sin ninguna guerra no se elimino ningun reino']) {
    assert.ok(s.includes(texto), texto);
  }
  // Cada accion con su sintaxis valida, esquema exacto, puntos y cooldown de la tabla.
  for (const a of acciones) {
    const linea = s.split('\n').find(l => l.startsWith(`- ${a.nombre}:`)); assert.ok(linea, a.nombre);
    const ejemplo = JSON.parse(/Sintaxis: (\{.*?\})\. Esquema/.exec(linea)[1]);
    assert.equal(validarAccion(ejemplo, { acciones, turno: 9, puntos: 9 }).ok, true, linea);
    assert.ok(linea.includes(`Puntos: ${a.puntos}. Cooldown: ${a.cooldown} turnos`), linea);
  }
  assert.ok(s.includes('"recurso":{"tipo":"cadena","minimo":0,"maximo":13,"valores":["wood","stone","gold","common_metals"]}'));
  assert.equal(/[^\x00-\x7f]/.test(s), false);
  assert.ok(!s.includes('Reglas del simulador') && !s.includes('SIMULADO') && !s.includes('20 pobladores'), 'sin reglas del simulador');
  assert.ok(!/(hay que|conviene|debes|deberias|mejor)/i.test(s), 'sin consejos de estrategia');
  const u = JSON.parse(p.usuario);
  assert.deepEqual(Object.keys(u), ['turn_number', 'orden', 'observation', 'estado_orquestador']);
  assert.deepEqual(u.estado_orquestador, { puntos_por_turno: 4, max_acciones: 3, cooldowns: { crear_unidades: 5 }, restricciones: restriccionesVisibles(acciones, {}) });
  assert.equal(u.turn_number, 4); assert.equal(u.observation.faccion.salud_media_pct, 90);
});

test('partida real completa sobre el puente falso: reglamento, 50 s por turno, opciones del escenario y registro de auditoria', async t => {
  const puente = await servirPuenteReal(t);
  const bots = ['bot-expansionista', 'bot-expansionista'].map((n, i) => ({ id: `f${i + 1}`, modelo: n, decidir: crearBot(n, 5 + i) }));
  const { reporte, eventos } = await correrCompetencia({ adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), participantes: bots });
  assert.equal(reporte.reglas, 'real'); assert.equal(reporte.config.rules_version, 'auge-real-1.1.0'); assert.equal(reporte.config.prompt_version, 'worldbox-1.2.0');
  assert.equal(reporte.determinista, false); assert.equal(reporte.completo, true); assert.equal(reporte.turnos, 24);
  const reinicio = puente.peticiones.find(p => p.url === '/v1/escenario/reiniciar').cuerpo;
  assert.deepEqual([reinicio.tamano_mapa, reinicio.semilla], [192, 1]);
  assert.deepEqual(reinicio.facciones, [{ id: 'f1', especie: 'human' }, { id: 'f2', especie: 'human' }]);
  assert.deepEqual(reinicio.opciones, { max_acciones: 3, velocidad: 'x10', plantilla: 'continent', unidades_iniciales: 4 });
  const avances = puente.peticiones.filter(p => p.url === '/v1/avanzar'); assert.equal(avances.length, 24); assert.ok(avances.every(a => a.cuerpo.segundos_juego === 50));
  assert.deepEqual(reporte.escenario.calidad_sitio, { f1: 500, f2: 510 }); assert.equal(reporte.escenario.hash_mundo, 'mundo-real-0001');
  assert.deepEqual(reporte.escenario.mundo, { ancho: 192, alto: 192, plantilla: 'continent', tamano: 'small', velocidad: 'x10', unidades_iniciales: 4, intentos_mapa: 1 });
  assert.equal(reporte.escenario.semilla_usada, null); assert.deepEqual(reporte.config.pesos, { ...PESOS_REAL });
  assert.deepEqual(reporte.config.acciones_habilitadas, ['esperar', 'crear_unidades', 'bendecir', 'maldecir', 'incendiar', 'donar_recursos', 'declarar_guerra', 'pedir_paz']);
  assert.equal(reporte.equidad.prompts_sistema_distintos, 1);
  // Los campos reales llegan al log y al CSV; los puntos salen de la tabla de pesos del log.
  const fin = eventos.find(e => e.tipo === 'turno' && e.turn_number === 24).resultados[0];
  assert.ok(['edificios', 'comida', 'ejercito', 'salud_media_pct', 'especie'].every(k => k in fin));
  assert.equal(fin.puntos, puntuar(fin, fin.penalizaciones, PESOS_REAL));
  assert.ok(eventos.filter(e => e.tipo === 'decision').every(e => e.penalizaciones === 0), 'los bots que respetan el reglamento no ganan infracciones');
  const topes = eventos.findLast(e => e.tipo === 'decision' && e.participant_id === 'f1').usos;
  assert.equal(topes.crear_unidades.acumulado, 10); assert.ok(topes['grupo:poderes'].veces <= 10);
});
test('bot agresivo: la guerra llega al puente exactamente una vez y no antes del turno 6, sin infracciones', async t => {
  const puente = await servirPuenteReal(t);
  const bots = ['bot-voraz', 'bot-expansionista'].map((n, i) => ({ id: `f${i + 1}`, modelo: n, decidir: crearBot(n, 5 + i) }));
  const { reporte, eventos } = await correrCompetencia({ adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), participantes: bots });
  const guerras = puente.peticiones.filter(p => p.url === '/v1/accion' && p.cuerpo.accion === 'declarar_guerra');
  assert.equal(guerras.length, 1); assert.equal(guerras[0].cuerpo.parametros.objetivo, 'f2');
  const decisiones = eventos.filter(e => e.tipo === 'decision');
  assert.equal(decisiones.find(e => e.action_validated.some(a => a.action === 'declarar_guerra')).turn_number, 6);
  assert.ok(decisiones.every(e => e.penalizaciones === 0));
  const hostiles = new Set(['declarar_guerra', 'maldecir', 'incendiar']);
  assert.ok(decisiones.filter(e => e.turn_number < 6).every(e => !e.action_validated.some(a => hostiles.has(a.action))), 'ninguna accion hostil antes del turno 6');
  assert.ok(decisiones.some(e => e.turn_number > 6 && e.participant_id === 'f1' && e.action_validated.some(a => a.action === 'incendiar' || a.action === 'maldecir')), 'tras la guerra el agresor usa poderes');
  assert.equal(reporte.ranking.length, 2);
});
test('el orquestador impone el reglamento aunque el puente no lo pida: guerra, puntos, unidades, poderes, cooldowns', async t => {
  const f1 = guion(
    [A('declarar_guerra', { objetivo: 'f2' })],                                  // T1: antes del turno 6 => invalida (no llega al puente)
    [A('bendecir', { gotas: 1 }), A('crear_unidades', { cantidad: 5 })],         // T2: 1 + 2 puntos
    [A('bendecir', { gotas: 1 })],                                               // T3: cooldown de bendecir (T2 + 1 + 1 = T4) => invalida
    [A('crear_unidades', { cantidad: 5 })],                                      // T4: llega a 10
    [A('crear_unidades', { cantidad: 1 })],                                      // T5: cooldown (T4+2=T6)
    [A('crear_unidades', { cantidad: 1 })],                                      // T6: tope de 10 unidades => invalida
    [A('crear_unidades', { cantidad: 1 })]);
  const f2 = guion([A('esperar'), A('esperar'), A('esperar')]);
  const { reporte, eventos, puente } = await jugar(t, [f1, f2], { config: { turnos: 7 } });
  const d = (turno, id = 'f1') => eventos.find(e => e.tipo === 'decision' && e.turn_number === turno && e.participant_id === id);
  assert.equal(d(1).error_type, 'aun_no_disponible'); assert.equal(d(1).penalizaciones, 1); assert.deepEqual(d(1).action_validated, [{ action: 'esperar', parameters: {} }]);
  assert.deepEqual(d(2).execution_result.map(r => r.resultado), ['ejecutada', 'ejecutada']);
  assert.equal(d(3).error_type, 'cooldown');
  assert.deepEqual(d(4).execution_result.map(r => r.resultado), ['ejecutada']); assert.equal(d(4).usos.crear_unidades.acumulado, 10);
  assert.equal(d(5).error_type, 'cooldown'); assert.equal(d(6).error_type, 'limite_partida');
  assert.equal(reporte.ranking.find(r => r.participant_id === 'f1').penalizaciones, 5);
  const acciones = puente.peticiones.filter(p => p.url === '/v1/accion').map(p => p.cuerpo.accion);
  assert.deepEqual(acciones, ['bendecir', 'crear_unidades', 'crear_unidades'], 'solo llegan al puente las ordenes que el reglamento permite');
  // El juego real entrega cooldowns vacios, pero el orquestador los recuerda entre turnos y se los enseña a la faccion.
  assert.deepEqual(d(3).estado_orquestador.cooldowns, { bendecir: 4, crear_unidades: 4 });
  assert.deepEqual(d(6).estado_orquestador.restricciones.crear_unidades, { acumulado: 10, maximo_acumulado: 10 });
});
test('4 puntos por turno: dos ordenes que suman mas se descartan; la guerra va sola', async t => {
  const f1 = guion([], [], [], [], [], [A('declarar_guerra', { objetivo: 'f2' }), A('crear_unidades', { cantidad: 1 })], [A('declarar_guerra', { objetivo: 'f2' })], [A('pedir_paz', { objetivo: 'f2' })]);
  const f2 = guion();
  const { eventos, puente } = await jugar(t, [f1, f2], { config: { turnos: 8 } });
  const d6 = eventos.find(e => e.tipo === 'decision' && e.turn_number === 6 && e.participant_id === 'f1');
  assert.deepEqual(d6.execution_result.map(r => r.resultado), ['ejecutada', 'sin_efecto']); assert.equal(d6.error_type, 'puntos_insuficientes');
  assert.equal(d6.action_validated[1].action, 'esperar'); assert.equal(d6.acciones_invalidas, 1);
  const d7 = eventos.find(e => e.tipo === 'decision' && e.turn_number === 7 && e.participant_id === 'f1');
  assert.ok(['cooldown', 'limite_partida'].includes(d7.error_type), 'una sola guerra por faccion');
  assert.deepEqual(puente.peticiones.filter(p => p.url === '/v1/accion').map(p => p.cuerpo.accion), ['declarar_guerra', 'pedir_paz']);
});
test('donar sin almacen es sin_efecto: gasta puntos pero NO cuenta para el tope de recursos donados', async t => {
  const donar = A('donar_recursos', { recurso: 'wood', cantidad: 10 });
  const { eventos } = await jugar(t, [guion([donar], [donar], [donar]), guion()], { config: { turnos: 3 } });
  const resultados = [1, 2, 3].map(n => eventos.find(e => e.tipo === 'decision' && e.turn_number === n && e.participant_id === 'f1'));
  // El almacen aparece al segundo avance: los dos primeros intentos son sin_efecto/sin_almacen y no cuentan para el tope de 100.
  assert.deepEqual(resultados.map(e => e.execution_result[0].resultado + '/' + e.execution_result[0].codigo), ['sin_efecto/sin_almacen', 'sin_efecto/sin_almacen', 'ejecutada/ok']);
  assert.deepEqual(resultados.map(e => e.usos.donar_recursos?.acumulado ?? 0), [0, 0, 10]);
  assert.ok(resultados.every(e => e.penalizaciones === 0));
});
test('una guerra puede eliminar a un reino: la partida termina sola, completa, y el eliminado no puntua supervivencia', async t => {
  const f1 = guion([A('crear_unidades', { cantidad: 5 })], [], [A('crear_unidades', { cantidad: 5 })], [], [], [A('declarar_guerra', { objetivo: 'f2' })]);
  const { reporte, eventos, puente } = await jugar(t, [f1, guion()]);
  assert.equal(reporte.completo, true); assert.equal(reporte.razon, 'supervivencia'); assert.ok(reporte.turnos < 24);
  const [a, b] = reporte.ranking; assert.deepEqual([a.participant_id, a.vivo, b.participant_id, b.vivo], ['f1', true, 'f2', false]);
  assert.ok(a.puntos > 100 && b.puntos < 100);
  assert.equal(eventos.at(-1).tipo, 'fin'); assert.ok(puente.peticiones.some(p => p.url === '/v1/cerrar'));
  assert.equal(puente.peticiones.filter(p => p.url === '/v1/avanzar').length, reporte.turnos);
});
test('equidad del terreno: si la brecha de calidad de sitio supera 30 se genera otro mundo (hasta 10) y todos quedan registrados', async t => {
  const correr = async (calidades, extra = {}) => {
    const puente = await servirPuenteReal(t, { calidades });
    const r = await correrCompetencia({ adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), turnos: 1, ...extra, participantes: [1, 2].map(i => ({ id: `f${i}`, modelo: 'b', decidir: guion() })) });
    return { ...r, reinicios: puente.peticiones.filter(p => p.url === '/v1/escenario/reiniciar').length };
  };
  const a = await correr([[600, 500], [560, 470], [520, 505]]);
  assert.equal(a.reinicios, 3); assert.equal(a.reporte.escenario.hash_mundo, 'mundo-real-0003');
  assert.deepEqual(a.reporte.escenario.equidad_sitio, { umbral: 30, intentos: 3, diferencia: 15, cumple: true,
    mundos_probados: [{ hash_mundo: 'mundo-real-0001', diferencia_sitio: 100 }, { hash_mundo: 'mundo-real-0002', diferencia_sitio: 90 }, { hash_mundo: 'mundo-real-0003', diferencia_sitio: 15 }] });
  assert.deepEqual(a.reporte.escenario.calidad_sitio, { f1: 520, f2: 505 }, 'el estado inicial es el del ultimo mundo');
  assert.deepEqual(a.reporte.config.umbralSitio, 30); assert.equal(a.reporte.config.intentosMapa, 10);
  // Agotados los intentos se juega con el ultimo mundo y queda dicho que NO cumple.
  const b = await correr([[600, 500], [600, 480], [600, 450]], { intentosMapa: 2 });
  assert.equal(b.reinicios, 2); assert.deepEqual([b.reporte.escenario.equidad_sitio.cumple, b.reporte.escenario.equidad_sitio.intentos, b.reporte.escenario.equidad_sitio.diferencia], [false, 2, 120]);
  // Sin umbral, o con un mundo ya equilibrado, no se regenera nada.
  assert.equal((await correr([[600, 500]], { umbralSitio: null })).reinicios, 1);
  assert.equal((await correr([[500, 520]])).reinicios, 1);
  assert.equal((await correr([[500, 530]])).reporte.escenario.equidad_sitio.cumple, true, 'la brecha igual al umbral cumple');
  assert.equal((await correr([[500, 531], [500, 500]])).reinicios, 2);
});
test('sin calidad de sitio informada no se puede equilibrar: se juega el primer mundo y no se afirma equidad', async t => {
  const puente = await servirPuente(t, { semilla: false });
  const r = await correrCompetencia({ adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), reglas: 'generico', umbralSitio: 30, turnos: 1,
    participantes: [1, 2].map(i => ({ id: `f${i}`, modelo: 'b', decidir: guion() })) });
  assert.equal(r.reporte.escenario.equidad_sitio, undefined); assert.equal(puente.peticiones.filter(p => p.url === '/v1/escenario/reiniciar').length, 1);
});
test('el reglamento real no admite un adaptador simulado ni un perfil inexistente', async () => {
  const { crearAdaptadorSimulado } = await import('../../worldbox/adaptador-simulado.js');
  const bots = [1, 2].map(i => ({ id: `f${i}`, modelo: 'b', decidir: crearBot('bot-pasivo') }));
  await assert.rejects(() => correrCompetencia({ adaptador: crearAdaptadorSimulado(), participantes: bots, reglas: 'real' }), /no_soportado/);
  await assert.rejects(() => correrCompetencia({ adaptador: crearAdaptadorSimulado(), participantes: bots, reglas: 'inventado' }), /argumento_invalido/);
  const ok = await correrCompetencia({ adaptador: crearAdaptadorSimulado(), participantes: bots, reglas: 'simulado', turnos: 2 });
  assert.equal(ok.reporte.reglas, 'simulado');
});
test('las observaciones de dos facciones tienen los mismos campos aunque solo la propia traiga sus contadores de unidades', async t => {
  const { eventos } = await jugar(t, [guion(), guion()], { config: { turnos: 1 } });
  const [a, b] = eventos.filter(e => e.tipo === 'decision').map(e => e.observation);
  const sin = f => Object.keys(f).filter(k => !k.startsWith('unidades_'));
  assert.deepEqual(sin(a.faccion), sin(a.rivales[0])); assert.deepEqual(Object.keys(a.faccion), Object.keys(b.faccion));
  assert.ok('unidades_creadas' in a.faccion && !('unidades_creadas' in a.rivales[0]));
  assert.equal(hash(a) === hash(b), false);
});

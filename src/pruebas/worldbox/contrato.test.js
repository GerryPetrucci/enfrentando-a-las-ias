import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO, validarAccion, validarEsquema, validarRespuesta, accionesHabilitadas, comprobarCatalogo } from '../../worldbox/contrato-acciones.js';
import { crearAdaptadorSimulado } from '../../worldbox/adaptador-simulado.js';
import { comprobarAdaptador, normalizarInfo, normalizarEjecucion, normalizarTerminal, normalizarReinicio } from '../../worldbox/adaptador.js';
import { construirPrompt } from '../../worldbox/prompt.js';
import { construirObservacion } from '../../worldbox/observacion.js';
import { ACCIONES_PUENTE } from './ayudas.js';

const contexto = { acciones: CATALOGO.acciones, turno: 2, puntos: 3 };
const escenario = { semilla: 19, facciones: [{ id: 'a' }, { id: 'b' }] };
const infoBase = (extra = {}) => ({ protocolo: 1, origen: 'puente', estado: 'listo', puente: { nombre: 'p', version: '1' }, juego: { nombre: 'j', version: '1' },
  capacidades: { reiniciar: true, semilla: false, avanzar: true, terminal: true, multi_faccion: true }, acciones: ACCIONES_PUENTE, limites: { max_segundos_avance: 5 }, ...extra });

test('JSON y campos de respuesta: fallo determinista esperar', () => {
  for (const raw of ['{roto', 'null', '[]', '{}', '', 'texto antes {"actions":[],"reasoning_summary":""}', '{"actions":[{"action":"esperar","parameters":{}}],"reasoning_summary":""} despues',
    '{"actions":[],"reasoning_summary":""}', JSON.stringify({ actions: Array(4).fill({ action: 'esperar', parameters: {} }), reasoning_summary: '' }),
    JSON.stringify({ actions: [{}], reasoning_summary: 'x'.repeat(241) }), JSON.stringify({ actions: [{ action: 'esperar', parameters: {} }] }),
    JSON.stringify({ actions: [{ action: 'esperar', parameters: {} }], reasoning_summary: 5 }), JSON.stringify({ actions: 'esperar', reasoning_summary: '' }),
    JSON.stringify({ actions: [{ action: 'esperar', parameters: {} }], reasoning_summary: '', extra: 1 })]) {
    const v = validarRespuesta(raw); assert.equal(v.ok, false, raw); assert.equal(v.acciones.length, 1); assert.equal(v.acciones[0].action, 'esperar');
    assert.ok(['json_invalido', 'respuesta_invalida'].includes(v.error));
  }
  const buena = { actions: [{ action: 'esperar', parameters: {} }], reasoning_summary: 'x'.repeat(240) };
  assert.equal(validarRespuesta(JSON.stringify(buena)).ok, true);
  assert.equal(validarRespuesta(buena).ok, true);
  assert.equal(validarRespuesta(JSON.stringify({ ...buena, actions: Array(3).fill(buena.actions[0]) })).ok, true);
  assert.equal(validarRespuesta(JSON.stringify({ ...buena, actions: Array(3).fill(buena.actions[0]) }), { maxAcciones: 2 }).ok, false);
});
test('un unico bloque de codigo alrededor del JSON se tolera; texto fuera de el, no', () => {
  const json = JSON.stringify({ actions: [{ action: 'esperar', parameters: {} }], reasoning_summary: 'ok' });
  assert.equal(validarRespuesta('```json\n' + json + '\n```').ok, true);
  assert.equal(validarRespuesta('```\n' + json + '\n```').ok, true);
  assert.equal(validarRespuesta('Aqui va:\n```json\n' + json + '\n```').ok, false);
  assert.equal(validarRespuesta('```json\n' + json + '\n```\nGracias').ok, false);
  assert.equal(validarRespuesta('```json\n{roto\n```').error, 'json_invalido');
});
test('lista blanca, tipos, limites, campos extra, puntos y cooldown', () => {
  for (const a of [null, [], 'esperar', { action: 'shell', parameters: {} }, { action: 'expandir', parameters: { cantidad: '1' } }, { action: 'expandir', parameters: { cantidad: 1.2 } }, { action: 'expandir', parameters: { cantidad: 0 } }, { action: 'expandir', parameters: { cantidad: 4 } }, { action: 'expandir', parameters: {} },
    { action: 'expandir', parameters: { cantidad: 1, extra: 1 } }, { action: 'expandir', parameters: [1] }, { action: 'expandir', parameters: null }, { action: 'expandir' }, { action: 'esperar', parameters: { extra: 1 } }, { action: 'esperar', parameters: {}, codigo: 'exec' },
    { action: 'atacar', parameters: { objetivo: '' } }, { action: 'atacar', parameters: { objetivo: 'x'.repeat(41) } }, { action: 'atacar', parameters: { objetivo: 7 } },
    { action: 'constructor', parameters: {} }, { action: '__proto__', parameters: {} }]) {
    const v = validarAccion(a, contexto); assert.equal(v.ok, false, JSON.stringify(a)); assert.deepEqual(v.accion, { action: 'esperar', parameters: {} });
  }
  assert.equal(validarAccion(JSON.parse('{"action":"expandir","parameters":{"cantidad":1,"__proto__":{"x":1}}}'), contexto).ok, false);
  assert.equal(validarAccion({ action: 'expandir', parameters: { cantidad: 3 } }, contexto).ok, true);
  assert.equal(validarAccion({ action: 'expandir', parameters: { cantidad: 1 } }, contexto).ok, true);
  assert.equal(validarAccion({ action: 'atacar', parameters: { objetivo: 'f2' } }, contexto).ok, true);
  assert.equal(validarAccion({ action: 'fundar', parameters: {} }, { ...contexto, puntos: 1 }).error, 'puntos_insuficientes');
  assert.equal(validarAccion({ action: 'fundar', parameters: {} }, { ...contexto, puntos: 2 }).ok, true);
  assert.equal(validarAccion({ action: 'esperar', parameters: {} }, { ...contexto, puntos: 0 }).ok, true);
  assert.equal(validarAccion({ action: 'expandir', parameters: { cantidad: 1 } }, { ...contexto, cooldowns: { expandir: 3 } }).error, 'cooldown');
  assert.equal(validarAccion({ action: 'expandir', parameters: { cantidad: 1 } }, { ...contexto, turno: 3, cooldowns: { expandir: 3 } }).ok, true);
  assert.equal(validarAccion({ action: 'x', parameters: {} }, contexto).error, 'accion_no_permitida');
  assert.equal(validarAccion({ action: 'expandir', parameters: { cantidad: 9 } }, contexto).error, 'parametros_invalidos');
  assert.equal(validarAccion({ action: 'esperar' }, contexto).error, 'esquema_invalido');
});
test('esquemas: entero, numero, cadena, booleano y valores enumerados', () => {
  const e = { n: { tipo: 'numero', minimo: 0, maximo: 1 }, b: { tipo: 'booleano' }, v: { tipo: 'cadena', valores: ['a', 'b'] }, i: { tipo: 'entero' } };
  const ok = { n: 0.5, b: false, v: 'a', i: -4 };
  assert.equal(validarEsquema(ok, e), true);
  for (const mal of [{ ...ok, n: 1.5 }, { ...ok, n: '0.5' }, { ...ok, n: NaN }, { ...ok, b: 'true' }, { ...ok, v: 'c' }, { ...ok, i: 1.5 }, { ...ok, i: null }, { ...ok, z: 1 }, { n: 0.5, b: true, v: 'a' }, []]) assert.equal(validarEsquema(mal, e), false, JSON.stringify(mal));
  assert.equal(validarEsquema({}, {}), true); assert.equal(validarEsquema({ a: 1 }, {}), false);
  assert.equal(validarEsquema({ t: 'abc' }, { t: { tipo: 'cadena', minimo: 3, maximo: 3 } }), true);
  assert.equal(validarEsquema({ t: 'ab' }, { t: { tipo: 'cadena', minimo: 3, maximo: 3 } }), false);
  assert.equal(validarEsquema({ t: 1 }, { t: { tipo: 'desconocido' } }), false);
});
test('lista blanca del simulador: catalogo local, anunciado verificado y con esquema identico', async () => {
  const info = await crearAdaptadorSimulado().info();
  assert.deepEqual(accionesHabilitadas(info).map(a => a.nombre), ['esperar', 'recolectar', 'expandir', 'fundar', 'reclutar', 'atacar']);
  info.acciones.find(a => a.nombre === 'expandir').parametros.cantidad = { maximo: 3, minimo: 1, tipo: 'entero' };
  assert.equal(accionesHabilitadas(info).length, 6);
  info.acciones.find(a => a.nombre === 'recolectar').verificada = false;
  info.acciones.find(a => a.nombre === 'expandir').parametros.cantidad.maximo = 4;
  assert.deepEqual(accionesHabilitadas(info).map(a => a.nombre), ['esperar', 'fundar', 'reclutar', 'atacar']);
  info.acciones.push({ nombre: 'hechizo', verificada: true, descripcion: 'x', parametros: {} });
  assert.ok(!accionesHabilitadas(info).some(a => a.nombre === 'hechizo'), 'el simulador no admite acciones fuera de su catalogo');
});
test('el catalogo del puente sale SOLO de lo que anuncia con verificada:true', async () => {
  const info = normalizarInfo(infoBase());
  const reglas = accionesHabilitadas(info);
  assert.deepEqual(reglas.map(a => a.nombre), ['esperar', 'reunir', 'construir']);
  assert.deepEqual(reglas.find(a => a.nombre === 'reunir'), { nombre: 'reunir', descripcion: 'Suma 5 recursos.', parametros: {}, puntos: 1, cooldown: 0, anunciada: true });
  const construir = reglas.find(a => a.nombre === 'construir');
  assert.equal(construir.puntos, 2); assert.equal(construir.cooldown, 1);
  assert.deepEqual(construir.parametros.tipo, { tipo: 'cadena', valores: ['torre', 'muro'] });
  // Una accion del simulador con el mismo nombre NO se cuela: lo que vale es lo anunciado.
  assert.deepEqual(accionesHabilitadas(normalizarInfo(infoBase({ acciones: [] }))).map(a => a.nombre), ['esperar']);
  // Lo marcado «EN PRUEBA» (ensayos locales del mod) nunca entra, aunque venga con verificada:true.
  const enPrueba = normalizarInfo(infoBase({ acciones: [...ACCIONES_PUENTE, { nombre: 'nueva', descripcion: 'EN PRUEBA (NO verificada): x', verificada: true, parametros: {} }] }));
  assert.deepEqual(accionesHabilitadas(enPrueba).map(a => a.nombre), ['esperar', 'reunir', 'construir']);
  // `esperar` es siempre la local; un puente no puede redefinirla.
  const falsa = normalizarInfo(infoBase({ acciones: [{ nombre: 'esperar', descripcion: 'borra todo', verificada: true, parametros: { x: { tipo: 'entero' } } }] }));
  assert.deepEqual(accionesHabilitadas(falsa)[0], CATALOGO.acciones[0]);
  // Y lo anunciado se valida con su esquema: nada fuera de la lista pasa.
  assert.equal(validarAccion({ action: 'construir', parameters: { tipo: 'torre', nivel: 3 } }, { acciones: reglas, puntos: 3 }).ok, true);
  for (const p of [{ tipo: 'foso', nivel: 1 }, { tipo: 'torre', nivel: 4 }, { tipo: 'torre' }, { nivel: 1 }]) assert.equal(validarAccion({ action: 'construir', parameters: p }, { acciones: reglas, puntos: 3 }).ok, false);
  assert.equal(validarAccion({ action: 'hechizo', parameters: {} }, { acciones: reglas, puntos: 3 }).error, 'accion_no_permitida');
  assert.equal(validarAccion({ action: 'recolectar', parameters: {} }, { acciones: reglas, puntos: 3 }).error, 'accion_no_permitida');
});
test('normalizarInfo: protocolo, esquema, nombres y reproducibilidad', () => {
  for (const mal of [{ protocolo: 2 }, { acciones: 'x' }, { estado: 'roto' }, { limites: { max_segundos_avance: 0 } }, { limites: { max_segundos_avance: 1, max_acciones_por_turno: 0 } },
    { acciones: [{ nombre: 'Mayuscula', descripcion: 'x', verificada: true, parametros: {} }] }, { acciones: [{ nombre: 'a', descripcion: 5, verificada: true, parametros: {} }] },
    { acciones: [{ nombre: 'a', descripcion: 'x', verificada: true, parametros: { p: { tipo: 'objeto' } } }] }, { acciones: [{ nombre: 'a', descripcion: 'x', verificada: true, parametros: { P: { tipo: 'entero' } } }] },
    { acciones: [{ nombre: 'a', descripcion: 'x', verificada: true, parametros: { p: { tipo: 'entero', minimo: 5, maximo: 1 } } }] }, { acciones: [{ nombre: 'a', descripcion: 'x', verificada: true, parametros: { p: { tipo: 'cadena', valores: [] } } }] },
    { acciones: [{ nombre: 'a', descripcion: 'x', verificada: true, parametros: {} }, { nombre: 'a', descripcion: 'x', verificada: true, parametros: {} }] },
    { acciones: [{ nombre: 'a', descripcion: 'x', verificada: true, parametros: {}, puntos: -1 }] }, { acciones: [{ nombre: 'a', descripcion: 'x', verificada: true, parametros: {}, cooldown: 1.5 }] }]) {
    const info = { ...infoBase(), ...mal }; assert.throws(() => normalizarInfo(info), /protocolo_incompatible|respuesta_invalida/, JSON.stringify(mal));
  }
  // Las no verificadas ni siquiera se normalizan: no existen para el nucleo.
  assert.ok(!normalizarInfo(infoBase()).acciones.some(a => a.nombre === 'hechizo'));
  assert.equal(normalizarInfo({ ...infoBase(), origen: 'simulado' }).determinista, true);
  assert.equal(normalizarInfo(infoBase()).determinista, false, 'sin semilla no es reproducible');
  assert.equal(normalizarInfo(infoBase({ capacidades: { ...infoBase().capacidades, semilla: true } })).determinista, 'desconocido', 'con semilla, Node no puede comprobar la trayectoria');
  assert.equal(normalizarInfo(infoBase()).limites.max_acciones_por_turno, 3);
  assert.equal(normalizarInfo({ ...infoBase(), origen: 'simulado' }).origen, 'simulado');
  assert.equal(normalizarInfo({ ...infoBase(), origen: 'otro' }).origen, 'puente');
});
test('normalizadores: ejecucion, terminal y reinicio descartan lo interno', () => {
  // `efecto` se conserva ACOTADO (escalares con nombre valido) para poder explicar la ejecucion; lo anidado y el resto se descarta.
  assert.deepEqual(normalizarEjecucion({ resultado: 'ejecutada', codigo: 'ok', mensaje: 'x', efecto: { pedidas: 5, creadas: 1, poder: 'fire', diferido: true, interno: { unity: 1 }, 'MAL NOMBRE': 3, nulo: null }, id_solicitud: 'abc-123' }),
    { resultado: 'ejecutada', codigo: 'ok', efecto: { pedidas: 5, creadas: 1, poder: 'fire', diferido: true }, id_solicitud: 'abc-123' });
  assert.deepEqual(normalizarEjecucion({ resultado: 'ejecutada', codigo: 'ok', efecto: { objeto: { x: 1 } }, id_solicitud: 'con espacios' }), { resultado: 'ejecutada', codigo: 'ok' }, 'sin escalares no hay efecto; un id raro se descarta');
  assert.equal(Object.keys(normalizarEjecucion({ resultado: 'ejecutada', codigo: 'ok', efecto: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`campo_${i}`, i])) }).efecto).length, 20, 'maximo 20 campos');
  assert.equal(normalizarEjecucion({ resultado: 'ejecutada', codigo: 'ok', efecto: { texto: 'x'.repeat(500) } }).efecto.texto.length, 100);
  assert.deepEqual(normalizarInfo({ ...infoBase(), juego: { nombre: 'WorldBox', version: '0.51.2', build_steam: '19962337', unity: '2022.3.60f1', secreto: 'x' } }).juego, { nombre: 'WorldBox', version: '0.51.2', build_steam: '19962337', unity: '2022.3.60f1' }, 'build y Unity se conservan');
  assert.equal(normalizarEjecucion({ resultado: 'rechazada', codigo: 'MAL CODIGO' }).codigo, 'sin_codigo');
  assert.throws(() => normalizarEjecucion({ resultado: 'quizas' }), /respuesta_invalida/);
  assert.throws(() => normalizarEjecucion(null), /respuesta_invalida/);
  assert.throws(() => normalizarTerminal({ terminal: 'si', resumen_por_faccion: [] }), /respuesta_invalida/);
  assert.throws(() => normalizarTerminal({ terminal: false, resumen_por_faccion: [{ id: 'a', vivo: true, poblacion: -1, ciudades: 0, territorio: 0, recursos: 0, objetivos: 0 }] }), /respuesta_invalida/);
  assert.equal(normalizarTerminal({ terminal: false, razon: 'cualquiera', resumen_por_faccion: [] }).razon, 'ninguna');
  assert.deepEqual(normalizarReinicio({ escenario_id: 'e', hash_mundo: 'h', facciones: [{ id: 'a', nombre: 'A', interno: 1 }], extra: 1 }), { escenario_id: 'e', hash_mundo: 'h', semilla_usada: null, facciones: [{ id: 'a' }] });
  assert.equal(normalizarReinicio({ escenario_id: 'e', hash_mundo: 'h', semilla_usada: 7, facciones: [] }).semilla_usada, 7);
  assert.throws(() => normalizarReinicio({ escenario_id: 'e', hash_mundo: 'h', semilla_usada: 1.5, facciones: [] }), /respuesta_invalida/);
  assert.throws(() => normalizarReinicio({ escenario_id: '', hash_mundo: 'h', facciones: [] }), /respuesta_invalida/);
  // Auditoria del juego real: calidad de sitio y especie por faccion, y los escalares del mundo generado; nada mas.
  const r = normalizarReinicio({ escenario_id: 'wb-1', hash_mundo: 'h', facciones: [{ id: 'a', especie: 'human', calidad_sitio: 512, nombre: 'Reino', sitio_x: 3 }],
    mundo: { ancho: 192, alto: 192, plantilla: 'continent', tamano: 'small', velocidad: 'x10', unidades_iniciales: 4, intentos_mapa: 1, ms_generar: 430, interno: { x: 1 } } });
  assert.deepEqual(r.facciones, [{ id: 'a', especie: 'human', calidad_sitio: 512 }]);
  assert.deepEqual(r.mundo, { ancho: 192, alto: 192, unidades_iniciales: 4, intentos_mapa: 1, plantilla: 'continent', tamano: 'small', velocidad: 'x10' });
  for (const mal of [{ calidad_sitio: -1 }, { calidad_sitio: 1.5 }, { especie: 'Humano!' }]) assert.throws(() => normalizarReinicio({ escenario_id: 'e', hash_mundo: 'h', facciones: [{ id: 'a', ...mal }] }), /respuesta_invalida/);
  assert.throws(() => normalizarReinicio({ escenario_id: 'e', hash_mundo: 'h', facciones: [], mundo: { ancho: -1 } }), /respuesta_invalida/);
  assert.throws(() => normalizarReinicio({ escenario_id: 'e', hash_mundo: 'h', facciones: [], mundo: { plantilla: 'con espacios y simbolos <>' } }), /respuesta_invalida/);
});
test('comprobarAdaptador: metodos, capacidades obligatorias, semilla opcional y vuelta funcional', async () => {
  const a = crearAdaptadorSimulado();
  const info = await comprobarAdaptador(a, { escenario });
  assert.equal(info.determinista, true);
  await assert.rejects(() => comprobarAdaptador({ ...a, cerrar: undefined }), /adaptador_invalido/);
  const con = extra => ({ ...a, info: async () => infoBase(extra) });
  await assert.rejects(() => comprobarAdaptador(con({ estado: 'cargando' })), /no_soportado/);
  for (const k of ['reiniciar', 'avanzar', 'terminal', 'multi_faccion']) await assert.rejects(() => comprobarAdaptador(con({ capacidades: { ...infoBase().capacidades, [k]: false } })), /no_soportado/, k);
  const sinSemilla = await comprobarAdaptador(con({}));
  assert.equal(sinSemilla.capacidades.semilla, false); assert.equal(sinSemilla.determinista, false);
  // La vuelta funcional detecta un reinicio que olvida una faccion pedida.
  await assert.rejects(() => comprobarAdaptador({ ...a, reiniciarEscenario: async () => ({ escenario_id: 'e', hash_mundo: 'h', facciones: [{ id: 'a' }] }) }, { escenario }), /respuesta_invalida/);
  assert.throws(() => comprobarCatalogo([{ nombre: 'recolectar' }]), /no_soportado/);
});
test('adaptador simulado pasa contrato funcional; reinicio, copias y mecanicas exactas', async () => {
  const a = crearAdaptadorSimulado();
  await comprobarAdaptador(a, { escenario });
  await a.reiniciarEscenario(escenario);
  let v = await a.observar('a'); v.faccion.recursos = 9999;
  assert.equal((await a.observar('a')).faccion.recursos, 20);
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'fundar', parametros: {} })).resultado, 'ejecutada');
  assert.equal((await a.observar('a')).faccion.recursos, 5);
  assert.equal((await a.observar('a')).faccion.objetivos, 1);
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'fundar', parametros: {} })).codigo, 'cooldown');
  await a.ejecutar({ faccion: 'a', accion: 'recolectar', parametros: {} });
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'recolectar', parametros: {} })).codigo, 'puntos_insuficientes');
  await a.avanzar({ segundos_juego: 1 });
  v = await a.observar('a');
  assert.equal(v.faccion.poblacion, 22); assert.equal(v.rivales[0].poblacion, 21);
  assert.equal(v.faccion.recursos - 13 - 7, v.rivales[0].recursos - 20 - 5);
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'fundar', parametros: {} })).codigo, 'cooldown');
  await a.cerrar(); await assert.rejects(() => a.observar('a'), /no_listo/);
});
test('simulador revalida recursos, objetivos y no modifica al rechazar', async () => {
  const a = crearAdaptadorSimulado(); await a.reiniciarEscenario(escenario);
  const antes = await a.observar('a');
  for (const [accion, parametros, codigo] of [['atacar', { objetivo: 'a' }, 'objetivo_invalido'], ['atacar', { objetivo: 'zzz' }, 'objetivo_invalido'], ['expandir', { cantidad: 4 }, 'parametros_invalidos'], ['hechizo', {}, 'accion_no_permitida']]) {
    assert.equal((await a.ejecutar({ faccion: 'a', accion, parametros })).codigo, codigo);
    assert.deepEqual(await a.observar('a'), antes);
  }
  await a.ejecutar({ faccion: 'a', accion: 'expandir', parametros: { cantidad: 3 } });
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'fundar', parametros: {} })).codigo, 'recursos_insuficientes');
});
test('observacion canonica descarta ruido y el prompt documenta vista real y cifras', async () => {
  const a = crearAdaptadorSimulado(); await a.reiniciarEscenario(escenario);
  const raw = await a.observar('a');
  const v = construirObservacion(raw);
  assert.deepEqual(construirObservacion({ ...raw, secreto: 'interno', mundo: { ...raw.mundo, interno: {} } }), v);
  const prompt = construirPrompt({ ...v, acciones: accionesHabilitadas(await a.info()) });
  assert.deepEqual(JSON.parse(prompt.usuario).observation, raw);
  for (const texto of ['137 puntos', 'reasoning_summary', '240', 'INVENTADOS', 'cooldown', '6 recursos', '15 recursos', '20 pobladores', 'SIN infraccion', 'No recibes aviso']) assert.ok(prompt.sistema.includes(texto), texto);
  assert.equal(/[^\x00-\x7f]/.test(prompt.sistema), false);
});
test('prompt del puente: sin reglas del simulador, con las acciones anunciadas y sintaxis valida', () => {
  const info = normalizarInfo(infoBase()), acciones = accionesHabilitadas(info);
  const raw = { origen: 'puente', turno_juego: 0, tiempo_juego_s: 0, mundo: { tamano_mapa: 100, libres: 90 },
    faccion: { id: 'f1', vivo: true, poblacion: 10, ciudades: 1, territorio: 2, recursos: 10, objetivos: 0 }, rivales: [{ id: 'f2', vivo: true, poblacion: 10, ciudades: 1, territorio: 2, recursos: 10, objetivos: 0 }] };
  const { sistema } = construirPrompt({ ...construirObservacion(raw), acciones, rulesVersion: 'puente-observacion-1.0.0' });
  assert.ok(sistema.includes('puente local de WorldBox')); assert.ok(!sistema.includes('SIMULADO')); assert.ok(!sistema.includes('20 pobladores'));
  assert.ok(sistema.includes('- reunir: Suma 5 recursos.')); assert.ok(sistema.includes('- construir:')); assert.ok(!sistema.includes('- hechizo'));
  // Cada sintaxis de ejemplo del prompt cumple su propio esquema.
  for (const a of acciones) {
    const linea = sistema.split('\n').find(l => l.startsWith(`- ${a.nombre}:`)), ejemplo = JSON.parse(/Sintaxis: (\{.*?\})\. Esquema/.exec(linea)[1]);
    assert.equal(validarAccion(ejemplo, { acciones, puntos: 9 }).ok, true, linea);
  }
  assert.equal(/[^\x00-\x7f]/.test(sistema), false);
});
test('el texto de sistema es identico para todos los participantes y depende solo de reglas y catalogo', async () => {
  const acciones = accionesHabilitadas(await crearAdaptadorSimulado().info());
  const f = (id, pob) => ({ id, vivo: true, poblacion: pob, ciudades: 1, territorio: 3, recursos: 20, objetivos: 0 });
  const vista = (yo, otro, turno) => construirObservacion({ origen: 'simulado', turno_juego: turno, tiempo_juego_s: turno, faccion: yo, rivales: [otro], mundo: { tamano_mapa: 64, libres: 58 } });
  const a = construirPrompt({ ...vista(f('f1', 20), f('f2', 30), 0), acciones, turnos: 5, orden: ['f1', 'f2'] }), b = construirPrompt({ ...vista(f('f2', 30), f('f1', 20), 4), acciones, turnos: 5, orden: ['f2', 'f1'] });
  assert.equal(a.sistema, b.sistema); assert.notEqual(a.usuario, b.usuario);
  assert.notEqual(construirPrompt({ ...vista(f('f1', 20), f('f2', 30), 0), acciones, turnos: 6 }).sistema, a.sistema);
});

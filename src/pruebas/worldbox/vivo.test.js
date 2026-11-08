import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PALETA } from '../../../web/paleta.js';
import { identidades, identidadBase, textoDeAccion, textoDeAcciones, recortarRazon, construirDecision, crearEstadoVivo, escribirAtomico, construirEstadoVivo, variarColor, MODELOS_CONOCIDOS, FASES, MAX_RAZON, textoDeError } from '../../worldbox/vivo.js';
import { correrCompetencia } from '../../worldbox/orquestador.js';
import { crearAdaptadorSimulado } from '../../worldbox/adaptador-simulado.js';
import { crearAdaptadorHttp } from '../../worldbox/adaptador-http.js';
import { crearBot } from '../../worldbox/bots.js';
import { main, opcionesCli, cuentaAtras } from '../../worldbox/correr.js';
import { servirPuenteReal } from './ayudas.js';

const CLAVES = ['version', 'actualizado', 'fase', 'turno', 'turnos', 'tiempo_juego_s', 'activo', 'facciones', 'decision', 'ultimo_evento', 'ranking', 'ganador'].sort();
const nombres = { f1: 'GPT Luna', f2: 'Claude Haiku', f3: 'Gemini Flash-Lite' };
const nombreDe = id => nombres[id] ?? null;
async function conCarpeta(fn) { const c = await mkdtemp(join(tmpdir(), 'worldbox-vivo-')); try { await fn(c); } finally { await rm(c, { recursive: true, force: true }); } }
const bots = (...n) => n.map((modelo, i) => ({ id: `f${i + 1}`, modelo, decidir: crearBot(modelo, 1 + i) }));

test('textoDeAcciones: frase natural en espanol con el nombre del modelo, nunca el id de asiento', () => {
  const a = (action, parameters = {}) => ({ action, parameters });
  assert.equal(textoDeAcciones([a('crear_unidades', { cantidad: 5 }), a('bendecir', { gotas: 2 })], { nombreDe }), 'Crea 5 aldeanos y bendice a su gente');
  assert.equal(textoDeAcciones([a('declarar_guerra', { objetivo: 'f1' })], { nombreDe }), 'Declara la guerra a GPT Luna');
  assert.equal(textoDeAcciones([a('crear_unidades', { cantidad: 1 })], { nombreDe }), 'Crea 1 aldeano');
  assert.equal(textoDeAcciones([a('crear_unidades', { cantidad: 3 })], { nombreDe, especie: 'elf' }), 'Crea 3 unidades');
  assert.equal(textoDeAcciones([a('donar_recursos', { recurso: 'gold', cantidad: 7 }), a('pedir_paz', { objetivo: 'f2' }), a('maldecir', { objetivo: 'f3', gotas: 1 })], { nombreDe }), 'Dona 7 de oro, pide la paz a Claude Haiku y maldice a Gemini Flash-Lite');
  assert.equal(textoDeAccion(a('incendiar', { objetivo: 'f2', gotas: 3 }), { nombreDe }), 'Lanza fuego sobre Claude Haiku');
  assert.equal(textoDeAccion(a('donar_recursos', { recurso: 'wood', cantidad: 4 })), 'Dona 4 de madera');
  assert.equal(textoDeAccion(a('maldecir', { objetivo: 'f9' }), { nombreDe }), 'Maldice a un rival', 'un objetivo desconocido no se muestra como id');
  // `esperar` solo cuenta si no hay otra orden; sin ordenes es «Espera».
  assert.equal(textoDeAcciones([a('esperar')]), 'Espera'); assert.equal(textoDeAcciones([]), 'Espera'); assert.equal(textoDeAcciones(undefined), 'Espera');
  assert.equal(textoDeAcciones([a('esperar'), a('bendecir', { gotas: 1 })]), 'Bendice a su gente');
  // Simulador y acciones que el catalogo no conoce.
  assert.equal(textoDeAccion(a('atacar', { objetivo: 'f1' }), { nombreDe }), 'Ataca a GPT Luna');
  assert.equal(textoDeAccion(a('accion_nueva_rara')), 'Accion nueva rara');
  assert.equal(textoDeAccion(a('crear_unidades', { cantidad: 'x' })), 'Crea unidades');
  for (const e of ['tiempo_agotado', 'proveedor', 'respuesta_invalida', 'json_invalido']) assert.match(textoDeError(e), /^[A-Z]/);
});

test('recortarRazon: 160 caracteres como maximo, en palabra entera y con puntos suspensivos solo si recorta', () => {
  assert.equal(MAX_RAZON, 160);
  assert.equal(recortarRazon('  Atacar\n pronto \t  '), 'Atacar pronto');
  assert.equal(recortarRazon(''), ''); assert.equal(recortarRazon(null), ''); assert.equal(recortarRazon(undefined), '');
  const justo = 'a'.repeat(160); assert.equal(recortarRazon(justo), justo, 'exactamente 160 no se toca');
  const largo = Array.from({ length: 80 }, (_, i) => `palabra${i}`).join(' ');
  const r = recortarRazon(largo);
  assert.ok(r.length <= 160 && r.endsWith('…'), r);
  assert.ok(largo.startsWith(r.slice(0, -1)), 'es un prefijo del original');
  assert.ok(/^palabra\d+$/.test(r.slice(0, -1).split(' ').at(-1)), 'termina en palabra entera, no cortada');
  assert.equal(recortarRazon('palabra '.repeat(30)).length <= 160, true);
  // Una sola palabra larguisima se corta a la fuerza, sin pasarse.
  assert.equal(recortarRazon('x'.repeat(500)).length, 160);
  // El corte cae justo en un espacio: no deja coma ni espacio antes de los puntos suspensivos.
  const conComa = `${'b'.repeat(100)}, ${'c'.repeat(100)}`;
  assert.equal(recortarRazon(conComa), `${'b'.repeat(100)}…`);
  assert.equal(recortarRazon('uno dos tres', 8), 'uno dos…');
});

test('identidades: nombre corto del modelo, letra A/B si se repite, color de la paleta y bots con nombre propio', () => {
  const m = identidades([{ id: 'f1', modelo: 'anthropic/claude-haiku-5.5' }, { id: 'f2', modelo: 'openai/gpt-6-luna' }, { id: 'f3', modelo: 'google/gemini-3.5-flash-lite' }]);
  assert.deepEqual([...m.values()].map(x => x.nombre), ['Claude Haiku', 'GPT Luna', 'Gemini Flash-Lite']);
  assert.deepEqual([...m.values()].map(x => x.color), [PALETA.haiku.color, PALETA.luna.color, PALETA['flash-lite'].color]);
  const r = identidades([{ id: 'f1', modelo: 'x-ai/grok-4.3' }, { id: 'f2', modelo: 'openai/gpt-6-luna' }, { id: 'f3', modelo: 'x-ai/grok-4.3' }, { id: 'f4', modelo: 'x-ai/grok-4.3' }]);
  assert.deepEqual([...r.values()].map(x => x.nombre), ['Grok A', 'GPT Luna', 'Grok B', 'Grok C']);
  assert.equal(r.get('f1').color, PALETA.grok.color, 'la primera conserva el color de marca');
  assert.equal(new Set([r.get('f1').color, r.get('f3').color, r.get('f4').color]).size, 3, 'los repetidos se distinguen por color');
  for (const x of r.values()) assert.match(x.color, /^#[0-9a-f]{6}$/i);
  const b = identidades([{ id: 'f1', modelo: 'bot-voraz' }, { id: 'f2', modelo: 'bot-voraz' }, { id: 'f3', modelo: 'bot-pasivo' }]);
  assert.deepEqual([...b.values()].map(x => x.nombre), ['Bot Voraz A', 'Bot Voraz B', 'Bot Pasivo']);
  // Un modelo que no esta en la tabla se muestra con un nombre derivado SIN proveedor ni numero de asiento.
  const d = identidadBase('nuevo-lab/super-modelo-9:free');
  assert.deepEqual([d.nombre, d.bot], ['Super Modelo 9', null]);
  assert.equal(identidadBase(undefined).nombre, 'Participante');
  assert.equal(variarColor('#336699', 0), '#336699'); assert.notEqual(variarColor('#336699', 1), variarColor('#336699', 2));
});

test('la tabla de modelos cubre todos los de src/modelos.js y sus nombres cortos coinciden (sin importarlo: cargaria el .env)', async () => {
  const fuente = await readFile(new URL('../../modelos.js', import.meta.url), 'utf8');
  const ids = [...fuente.matchAll(/\bmodelo: '([^']+)'/g)].map(x => x[1]);
  assert.ok(ids.length >= 20);
  for (const id of ids) assert.ok(MODELOS_CONOCIDOS.includes(id), `falta ${id} en vivo.js`);
  for (const [, nombre, id] of fuente.matchAll(/nombre: '([^']+)', modelo: '([^']+)'/g)) assert.equal(identidadBase(id).nombre, nombre, id);
  for (const id of MODELOS_CONOCIDOS) assert.ok(identidadBase(id).color.startsWith('#') && !identidadBase(id).nombre.includes('/'), id);
});

test('construirDecision: razon recortada para modelos, razon fija para bots, error explicado y objetivo traducido', () => {
  const ids = identidades([{ id: 'f1', modelo: 'openai/gpt-6-luna' }, { id: 'f2', modelo: 'anthropic/claude-haiku-5.5' }, { id: 'f3', modelo: 'bot-voraz' }]);
  const largo = 'Voy a expandirme primero para tener mas poblacion antes de atacar a nadie; ' .repeat(6);
  const d = construirDecision({ acciones: [{ action: 'declarar_guerra', parameters: { objetivo: 'f2' } }, { action: 'bendecir', parameters: { gotas: 1 } }], razon: largo }, ids, { id: 'f1' });
  assert.deepEqual([d.participante, d.texto], ['GPT Luna', 'Declara la guerra a Claude Haiku y bendice a su gente']);
  assert.ok(d.razon.length <= 160 && d.razon.endsWith('…'));
  assert.deepEqual(d.acciones, [{ accion: 'declarar_guerra', texto: 'Declara la guerra a Claude Haiku' }, { accion: 'bendecir', texto: 'Bendice a su gente' }]);
  const bot = construirDecision({ acciones: [{ action: 'esperar', parameters: {} }], razon: 'esto no se usa' }, ids, { id: 'f3' });
  assert.match(bot.razon, /automático de prueba/); assert.equal(bot.texto, 'Espera');
  const fallo = construirDecision({ acciones: [{ action: 'esperar', parameters: {} }], error: 'tiempo_agotado' }, ids, { id: 'f2' });
  assert.deepEqual([fallo.texto, fallo.razon], ['No respondió a tiempo', '']);
  assert.equal(construirDecision({ acciones: [], error: 'json_invalido' }, ids, { id: 'f2' }).acciones.length, 1, 'siempre hay al menos una accion para mostrar');
  assert.ok(!JSON.stringify([d, bot, fallo]).match(/"f[123]"|f1|f2/), 'ni el texto ni el nombre llevan ids de asiento');
});

test('escribirAtomico: un lector nunca ve un JSON a medias ni quedan temporales', async () => {
  await conCarpeta(async c => {
    const ruta = join(c, 'vivo', 'worldbox.json');
    let escribiendo = true, lecturas = 0, malas = 0;
    const lector = (async () => {
      while (escribiendo) {
        try { JSON.parse(await readFile(ruta, 'utf8')); lecturas++; }
        catch (e) { if (e.code !== 'ENOENT') malas++; }
        await new Promise(r => setTimeout(r, 15));
      }
    })();
    // En Windows el rename puede chocar con un lector que tiene el archivo abierto: la escritura reintenta y, si aun asi falla, se pierde ESA version (nunca se deja a medias).
    let perdidas = 0;
    for (let i = 0; i < 60; i++) { try { await escribirAtomico(ruta, { i, relleno: 'x'.repeat(20000) }); } catch { perdidas++; } }
    assert.ok(perdidas <= 3, 'perdidas: ' + perdidas);
    escribiendo = false; await lector;
    assert.equal(malas, 0, 'ninguna lectura vio contenido parcial'); assert.ok(lecturas > 0);
    assert.ok(JSON.parse(await readFile(ruta, 'utf8')).i >= 50);
    assert.deepEqual(await readdir(join(c, 'vivo')), ['worldbox.json']);
  });
});

test('crearEstadoVivo: esquema version 1, fases, eliminaciones, ranking y ganador (la supervivencia manda sobre los puntos)', async () => {
  const guardados = [];
  const vivo = crearEstadoVivo({ ruta: 'x.json', participantes: [{ id: 'f1', modelo: 'openai/gpt-6-luna' }, { id: 'f2', modelo: 'anthropic/claude-haiku-5.5' }], turnos: 24, supervivencia: true, escribir: async (_, v) => { guardados.push(structuredClone(v)); } });
  const fila = (id, vivo, poblacion, territorio) => ({ id, vivo, poblacion, ciudades: vivo ? 1 : 0, territorio, recursos: 0, objetivos: 0, cooldowns: {} });
  const s0 = [fila('f1', true, 4, 9), fila('f2', true, 4, 9)];
  await vivo.emitir({ fase: 'preparando', turno: 0, snapshot: s0, puntos: { f1: 110, f2: 110 } });
  await vivo.emitir({ fase: 'pensando', turno: 1, activo: 'f1', snapshot: s0, puntos: { f1: 110, f2: 110 } });
  await vivo.emitir({ fase: 'decidio', turno: 1, activo: 'f1', snapshot: s0, puntos: {}, acciones: [{ action: 'crear_unidades', parameters: { cantidad: 5 } }, { action: 'bendecir', parameters: { gotas: 1 } }], razon: 'Crezco primero.' });
  await vivo.emitir({ fase: 'aplicando', turno: 1, activo: 'f1', snapshot: [fila('f1', true, 9, 9), fila('f2', true, 4, 9)], puntos: { f1: 113, f2: 110 }, acciones: [{ action: 'crear_unidades', parameters: { cantidad: 5 } }, { action: 'bendecir', parameters: { gotas: 1 } }], razon: 'Crezco primero.', invalidas: 0, rechazadas: 0 });
  await vivo.emitir({ fase: 'turno', turno: 1, tiempo_juego_s: 50, snapshot: [fila('f1', true, 9, 9), fila('f2', false, 0, 0)], puntos: { f1: 113, f2: 0 } });
  await vivo.emitir({ fase: 'fin', turno: 1, snapshot: [fila('f1', true, 9, 9), fila('f2', false, 0, 0)], puntos: { f1: 20, f2: 90 } });
  await vivo.cerrar();
  assert.deepEqual(guardados.map(g => g.fase), ['preparando', 'pensando', 'decidio', 'aplicando', 'turno', 'fin']); assert.deepEqual(FASES, ['preparando', 'pensando', 'decidio', 'esperando', 'aplicando', 'turno', 'fin']);
  for (const g of guardados) { assert.deepEqual(Object.keys(g).sort(), CLAVES); assert.equal(g.version, 1); assert.equal(g.turnos, 24); assert.ok(!Number.isNaN(Date.parse(g.actualizado))); assert.deepEqual(Object.keys(g.facciones[0]).sort(), ['ciudades', 'color', 'id', 'nombre', 'poblacion', 'puntos', 'territorio', 'vivo']); }
  const [, pensando, decidio, aplicando, turno, fin] = guardados;
  assert.deepEqual([pensando.activo, pensando.decision], ['f1', null]);
  assert.deepEqual([decidio.decision.participante, decidio.decision.texto, decidio.decision.razon], ['GPT Luna', 'Crea 5 aldeanos y bendice a su gente', 'Crezco primero.']);
  assert.equal(aplicando.ultimo_evento, 'GPT Luna crea 5 aldeanos y bendice a su gente.');
  assert.deepEqual(aplicando.facciones.map(f => [f.nombre, f.poblacion, f.puntos]), [['GPT Luna', 9, 113], ['Claude Haiku', 4, 110]]);
  assert.equal(turno.ultimo_evento, 'Claude Haiku ha sido eliminado.'); assert.equal(turno.tiempo_juego_s, 50); assert.equal(turno.decision, null);
  assert.equal(fin.ganador, 'f1', 'el unico superviviente gana aunque tenga menos puntos');
  assert.deepEqual(fin.ranking.map(r => [r.id, r.puesto, r.nombre]), [['f1', 1, 'GPT Luna'], ['f2', 2, 'Claude Haiku']]);
  assert.equal(fin.ultimo_evento, 'Gana GPT Luna.');
  assert.ok(guardados.slice(0, 5).every(g => g.ranking === null && g.ganador === null));
  // Empate total: nadie gana.
  const empate = [];
  const v2 = crearEstadoVivo({ ruta: 'x', participantes: [{ id: 'f1', modelo: 'bot-pasivo' }, { id: 'f2', modelo: 'bot-pasivo' }], escribir: async (_, v) => { empate.push(v); } });
  await v2.emitir({ fase: 'fin', turno: 3, snapshot: [fila('f1', true, 4, 9), fila('f2', true, 4, 9)], puntos: { f1: 100, f2: 100 } }); await v2.cerrar();
  assert.equal(empate[0].ganador, null); assert.deepEqual(empate[0].facciones.map(f => f.nombre), ['Bot Pasivo A', 'Bot Pasivo B']);
});

test('crearEstadoVivo: un fallo al escribir no detiene nada y se cuenta', async () => {
  let n = 0;
  const vivo = crearEstadoVivo({ ruta: 'x', participantes: [{ id: 'f1', modelo: 'bot-pasivo' }, { id: 'f2', modelo: 'bot-voraz' }], escribir: async () => { n++; if (n === 1) throw new Error('disco lleno'); } });
  await vivo.emitir({ fase: 'preparando', turno: 0 }); await vivo.emitir({ fase: 'pensando', turno: 1, activo: 'f1', snapshot: [] }); await vivo.cerrar();
  assert.deepEqual([vivo.fallos(), vivo.escrituras(), n], [1, 2, 2]);
  assert.equal(construirEstadoVivo({ fase: 'turno' }).facciones.length, 0);
});

// ---- Orquestador: el ritmo de video es presentacion ----
const base = { semilla: 1, turnos: 4, presupuesto: 0 };
const simulado = () => ({ adaptador: crearAdaptadorSimulado(), participantes: bots('bot-voraz', 'bot-aleatorio'), ...base });

test('el modo grabacion no cambia la partida: mismo ranking, mismo estado final y mismas acciones que sin el', async () => {
  const sin = await correrCompetencia(simulado());
  const fases = [], dormidas = [];
  const con = await correrCompetencia({ ...simulado(), observador: e => { fases.push(e.fase); }, presentacion: { lecturaMs: 4000, finMs: 1500, dormir: async ms => { dormidas.push(ms); } } });
  assert.equal(con.reporte.hash_final, sin.reporte.hash_final);
  assert.deepEqual(con.reporte.ranking.map(f => [f.participant_id, f.puntos, f.puesto]), sin.reporte.ranking.map(f => [f.participant_id, f.puntos, f.puesto]));
  const acc = r => r.eventos.filter(e => e.tipo === 'decision').map(e => [e.participant_id, e.action_validated, e.score_delta]);
  assert.deepEqual(acc(con), acc(sin));
  assert.deepEqual(con.eventos.map(e => e.tipo), sin.eventos.map(e => e.tipo), 'los mismos eventos de telemetria, en el mismo orden');
  assert.equal(con.reporte.rules_version, sin.reporte.rules_version);
  // Una pausa de lectura tras cada decision (4 turnos x 2) y la pausa final.
  assert.deepEqual(dormidas, [...Array(8).fill(4000), 1500]);
  // Fases en orden: preparando(x2: reglas y mundo listo), luego pensando -> decidio -> aplicando por decision, turno por turno, y fin.
  assert.deepEqual(fases.slice(0, 2), ['preparando', 'preparando']);
  assert.equal(fases.at(-1), 'fin'); assert.equal(fases.filter(f => f === 'turno').length, 4);
  const cuerpo = fases.slice(2, -1);
  for (let i = 0; i < cuerpo.length; i += 7) assert.deepEqual(cuerpo.slice(i, i + 7), ['pensando', 'decidio', 'aplicando', 'pensando', 'decidio', 'aplicando', 'turno']);
});

test('la pausa de lectura no cuenta contra el tiempo maximo de la partida y un observador roto no la detiene', async () => {
  let t = 1_000_000;
  const reloj = { ahora: () => t, presentacion: { lecturaMs: 4000, finMs: 0, dormir: async ms => { t += ms; } } };
  const { reporte } = await correrCompetencia({ ...simulado(), maxTiempoMs: 1000, ...reloj, observador: () => { throw new Error('observador roto'); } });
  assert.equal(reporte.completo, true); assert.equal(reporte.razon, 'turnos');
  // Sin la regla, el mismo reloj corta la partida por tiempo: la prueba distingue ambos casos.
  let u = 1_000_000;
  const cortada = await correrCompetencia({ ...simulado(), maxTiempoMs: 1000, ahora: () => u, observador: () => { u += 4000; } });
  assert.equal(cortada.reporte.razon, 'limite_tiempo');
});

// ---- Camara e interfaz contra el puente falso con la forma del real ----
const real = async (t, opciones, extra = {}) => {
  const puente = await servirPuenteReal(t, opciones);
  return { puente, config: { adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), participantes: bots('bot-expansionista', 'bot-voraz'), reglas: 'real', semilla: 1, turnos: 3, presupuesto: 0, ...extra } };
};
const rutas = p => p.peticiones.filter(x => /^\/v1\/(camara|interfaz|escenario\/reiniciar|avanzar|cerrar)/.test(x.url)).map(x => x.url === '/v1/camara' ? (x.cuerpo.liberar ? 'camara:liberar' : `camara:${x.cuerpo.faccion}${x.cuerpo.zoom ? `@${x.cuerpo.zoom}` : ''}`) : x.url === '/v1/interfaz' ? `interfaz:${x.cuerpo.visible}` : x.url.slice(4));

test('con el puente que anuncia camara e interfaz: oculta la interfaz, enfoca a quien decide, libera al cerrar el turno y lo deja todo como estaba', async t => {
  const { puente, config } = await real(t, { presentacion: true });
  const { reporte, eventos } = await correrCompetencia({ ...config, presentacion: { lecturaMs: 0, finMs: 0, zoom: 80 }, observador: () => {} });
  assert.equal(reporte.completo, true);
  assert.ok(eventos[0].config.adaptador.capacidades.camara && eventos[0].config.adaptador.capacidades.interfaz, 'las capacidades anunciadas quedan en el log');
  const r = rutas(puente);
  assert.equal(r.map(x => /^camara:f[12]@80$/.test(x) ? 'C' : x === 'camara:liberar' ? 'L' : x === 'interfaz:false' ? 'I0' : x === 'interfaz:true' ? 'I1' : x).join(' '),
    'escenario/reiniciar I0 C C avanzar L C C avanzar L C C avanzar L L I1 cerrar', 'orden exacto de las llamadas de presentacion');
  assert.equal(r.filter(x => x.startsWith('camara:f')).length, 6, 'una vez por decision');
  assert.deepEqual(r.slice(-3), ['camara:liberar', 'interfaz:true', 'cerrar']);
  assert.equal(r.filter(x => x === 'camara:liberar').length, 4, 'al cerrar cada turno (3) y al final');
  // Ni la camara ni la interfaz salen en la telemetria de decisiones.
  assert.ok(!JSON.stringify(eventos.filter(e => e.tipo !== 'inicio')).includes('camara'));
});

test('sin presentacion no se toca la camara aunque el puente la anuncie; sin capacidades se graba igual', async t => {
  const a = await real(t, { presentacion: true });
  assert.equal((await correrCompetencia(a.config)).reporte.completo, true);
  assert.deepEqual(rutas(a.puente).filter(x => /camara|interfaz/.test(x)), [], 'sin modo grabacion el puente no recibe nada de presentacion');
  const b = await real(t, { presentacion: false });
  const { reporte, eventos } = await correrCompetencia({ ...b.config, presentacion: { lecturaMs: 0, finMs: 0 }, observador: () => {} });
  assert.equal(reporte.completo, true);
  assert.deepEqual(rutas(b.puente).filter(x => /camara|interfaz/.test(x)), []);
  assert.deepEqual(Object.keys(eventos[0].config.adaptador.capacidades).sort(), ['avanzar', 'multi_faccion', 'reiniciar', 'semilla', 'terminal'], 'un puente sin presentacion deja la forma de siempre');
});

test('si la camara o la interfaz fallan, la partida sigue y termina completa', async t => {
  const { puente, config } = await real(t, { presentacion: true, gancho: async req => /^\/v1\/(camara|interfaz)/.test(req.url) ? { status: 500, body: { protocolo: 1, ok: false, error: { codigo: 'error_interno', mensaje: 'x' } } } : undefined });
  const { reporte } = await correrCompetencia({ ...config, presentacion: { lecturaMs: 0, finMs: 0 }, observador: () => {} });
  assert.equal(reporte.completo, true); assert.equal(reporte.turnos, 3);
  assert.ok(puente.peticiones.some(p => p.url === '/v1/camara'), 'lo intento');
});

test('avanzar tiene su propio plazo para el ritmo x1: lo lento solo se tolera donde se pide', async t => {
  const lento = { presentacion: true, gancho: async req => { if (req.url === '/v1/avanzar') await new Promise(r => setTimeout(r, 700)); } };
  const a = await real(t, lento, { turnos: 1, timeoutMs: 400 });
  assert.equal((await correrCompetencia(a.config)).reporte.completo, false, 'con el plazo normal el avance lento corta la partida');
  const b = await real(t, lento, { turnos: 1, timeoutMs: 400 });
  const { reporte } = await correrCompetencia({ ...b.config, timeoutAvanceMs: 5000 });
  assert.equal(reporte.completo, true);
});

// ---- CLI ----
test('opcionesCli: --grabacion va sin valor y sus opciones solo valen con ella', () => {
  const o = opcionesCli(['--grabacion', '--cuenta=5', '--lectura-ms=2500', '--fin-ms=0', '--zoom=60', '--vivo=a.json']);
  assert.deepEqual([o.grabacion, o.cuenta, o['lectura-ms'], o['fin-ms'], o.zoom, o.vivo], [true, '5', '2500', '0', '60', 'a.json']);
  assert.equal(opcionesCli([]).grabacion, undefined);
  for (const mal of [['--cuenta=5'], ['--lectura-ms=1000'], ['--vivo=a.json'], ['--grabacion=1'], ['--grabacion', '--grabacion'], ['--grabacion', '--cuenta=601'], ['--grabacion', '--cuenta=1.5'], ['--grabacion', '--lectura-ms=-1'],
    ['--grabacion', '--lectura-ms=60001'], ['--grabacion', '--zoom=0'], ['--grabacion', '--zoom=1001'], ['--grabacion', '--fin-ms=x'], ['--cuenta']]) {
    assert.throws(() => opcionesCli(mal), /argumento_invalido/, mal.join(' '));
  }
  assert.throws(() => opcionesCli(['--semilla']), /argumento_invalido/, 'las demas opciones siguen exigiendo valor');
});

test('cuentaAtras avisa «Listo para grabar», cuenta cada segundo y termina avisando que empieza', async () => {
  const dichos = [], dormidas = [];
  await cuentaAtras(3, { avisar: t => dichos.push(t), dormir: async ms => { dormidas.push(ms); } });
  assert.deepEqual(dichos, ['Listo para grabar: pulsa grabar en OBS', 'La partida empieza en 3...', 'La partida empieza en 2...', 'La partida empieza en 1...', 'Empieza la partida.']);
  assert.deepEqual(dormidas, [1000, 1000, 1000]);
  const cero = []; await cuentaAtras(0, { avisar: t => cero.push(t), dormir: async () => assert.fail('sin cuenta no se espera') });
  assert.equal(cero[0], 'Listo para grabar: pulsa grabar en OBS');
});

test('CLI --grabacion con el simulador: cuenta atras, pausas de lectura y estado en vivo escrito hasta el final', async () => {
  await conCarpeta(async c => {
    const ruta = join(c, 'vivo', 'worldbox.json'), dichos = [], dormidas = [];
    const deps = { avisar: t => dichos.push(t), dormir: async ms => { dormidas.push(ms); } };
    const [r] = await main(['--grabacion', '--cuenta=3', '--lectura-ms=1000', '--fin-ms=500', '--turnos=3', `--vivo=${ruta}`, `--salida=${join(c, 's')}`], deps);
    assert.equal(r.completo, true); assert.equal(r.turnos, 3);
    assert.equal(dichos[0], 'Listo para grabar: pulsa grabar en OBS'); assert.equal(dichos.filter(x => /empieza en/.test(x)).length, 3);
    assert.deepEqual(dormidas, [1000, 1000, 1000, ...Array(6).fill(1000), 500]);
    const vivo = JSON.parse(await readFile(ruta, 'utf8'));
    assert.deepEqual(Object.keys(vivo).sort(), CLAVES);
    assert.deepEqual([vivo.fase, vivo.version, vivo.turno, vivo.turnos], ['fin', 1, 3, 3]);
    assert.deepEqual(vivo.facciones.map(f => f.nombre), ['Bot Voraz', 'Bot Aleatorio']);
    assert.equal(vivo.ranking.length, 2); assert.ok(vivo.ranking[0].puesto === 1);
    assert.ok(vivo.facciones.every(f => /^#[0-9a-f]{6}$/i.test(f.color)));
    assert.ok(!vivo.ultimo_evento.includes('f1') && !(vivo.decision?.texto ?? '').includes('f2'));
    assert.deepEqual((await readdir(join(c, 'vivo'))), ['worldbox.json']);
    // Sin la bandera no hay estado en vivo, ni cuenta atras, ni pausas.
    const sinRuta = join(c, 'otro', 'worldbox.json'), dichos2 = [], dormidas2 = [];
    await main(['--turnos=2', `--salida=${join(c, 't')}`], { avisar: t => dichos2.push(t), dormir: async ms => { dormidas2.push(ms); } });
    assert.deepEqual([dichos2, dormidas2, existsSync(sinRuta)], [[], [], false]);
  });
});

test('CLI --grabacion contra el puente: velocidad x1 por omision, la que se pida si se pide, y la interfaz se oculta y se restaura', async t => {
  const puente = await servirPuenteReal(t, { presentacion: true });
  await conCarpeta(async c => {
    const deps = { env: { WORLDBOX_PUENTE_URL: puente.url, WORLDBOX_PUENTE_TOKEN: puente.token }, envRuta: join(c, 'no-existe.env'), avisar: () => {}, dormir: async () => {} };
    const comun = ['--adaptador=http', '--participantes=bot-expansionista,bot-voraz', '--grabacion', '--cuenta=0', '--lectura-ms=0', '--fin-ms=0', '--turnos=2'];
    const [r] = await main([...comun, `--vivo=${join(c, 'v.json')}`, `--salida=${join(c, 'a')}`], deps);
    assert.equal(r.completo, true); assert.equal(r.reglas, 'real');
    const reinicio = puente.peticiones.find(p => p.url === '/v1/escenario/reiniciar').cuerpo;
    assert.equal(reinicio.opciones.velocidad, 'x1');
    assert.deepEqual(rutas(puente).filter(x => x.startsWith('interfaz')), ['interfaz:false', 'interfaz:true']);
    assert.ok(puente.peticiones.filter(p => p.url === '/v1/avanzar').every(p => p.cuerpo.segundos_juego === 50), 'el ritmo de video no cambia los segundos del turno');
    const vivo = JSON.parse(await readFile(join(c, 'v.json'), 'utf8'));
    assert.deepEqual([vivo.fase, vivo.turnos, vivo.facciones.map(f => f.nombre)], ['fin', 2, ['Bot Expansionista', 'Bot Voraz']]);
    const antes = puente.peticiones.length;
    await main([...comun, '--velocidad=x5', `--vivo=${join(c, 'v2.json')}`, `--salida=${join(c, 'b')}`], deps);
    assert.equal(puente.peticiones.slice(antes).find(p => p.url === '/v1/escenario/reiniciar').cuerpo.opciones.velocidad, 'x5');
    // Sin --grabacion la velocidad sigue siendo la del reglamento.
    const n = puente.peticiones.length;
    await main(['--adaptador=http', '--participantes=bot-expansionista,bot-voraz', '--turnos=2', `--salida=${join(c, 'd')}`], deps);
    const sin = puente.peticiones.slice(n);
    assert.equal(sin.find(p => p.url === '/v1/escenario/reiniciar').cuerpo.opciones.velocidad, 'x10');
    assert.ok(!sin.some(p => /camara|interfaz/.test(p.url)));
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { correrEra } from '../../worldbox/era/orquestador-era.js';
import { crearAdaptadorEraSimulado } from '../../worldbox/era/adaptador-era-simulado.js';
import { crearBotEra } from '../../worldbox/era/bots-era.js';
import { construirSistemaEra } from '../../worldbox/era/prompt-era.js';
import { normalizarCivilizacion, normalizarEstadoEra, normalizarRespuestaRasgos } from '../../worldbox/era/observacion-era.js';
import { auditarEra } from '../../worldbox/era/auditar-era.js';
import { CATALOGO_ERA, NINGUNO, PERFIL_ERA, PRESUPUESTO_PUNTOS, eleccionPorDefecto, esFuerte, evaluarEleccion, evaluarRasgoExtra, rasgoPorId, resolverPartida, rasgosOfrecidos, validarPartida } from '../../worldbox/era/reglas-era.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearTelemetria } from '../../worldbox/telemetria.js';

// Partida corta con el mantenimiento: borrador en los anios 6 y 11, comprobacion de rasgos pendientes a los 5 anios (16), muro 60, limite 90.
const CORTA = { anioMuro: 60, anioLimite: 90, aniosBorrador: 5, intervencionesDesarrollo: [20, 35, 50], intervencionesGuerra: [3, 15], aniosEsperaRasgos: 5 };
const bots = (...n) => n.map((modelo, i) => ({ id: `f${i + 1}`, modelo, decidir: crearBotEra(modelo, 1 + i) }));
const correr = async ({ adaptador = crearAdaptadorEraSimulado(), participantes = bots('bot-era-militar', 'bot-era-economico'), partida = {}, ...resto } = {}) => {
  const r = await correrEra({ adaptador, participantes, semilla: 7, partida: { ...CORTA, ...partida }, ...resto });
  return { ...r, fin: r.eventos.at(-1), decisiones: r.eventos.filter(e => e.tipo === 'decision') };
};
const sim = s => crearAdaptadorEraSimulado({ sim: s });

// ---------------------------------------------------------------- reglas nuevas: rasgos fuertes, calendario, catalogo
test('rasgos FUERTES: a lo sumo uno por civilizacion en el borrador y los extras; la jugada por defecto descarta los de mas desde la ultima casilla', () => {
  const fuertes = rasgosOfrecidos().filter(r => r.fuerte).map(r => r.id).sort();
  assert.deepEqual(fuertes, ['enhanced_strength', 'gods_chosen', 'high_fecundity', 'hive_society', 'hyper_intelligence', 'stonefists']);
  const vacia = { cognitivo: NINGUNO, mente: NINGUNO, espiritu: NINGUNO, fisico: NINGUNO, apariencia: NINGUNO };
  assert.equal(evaluarEleccion(2, { ...vacia, mente: 'hyper_intelligence', fisico: 'stonefists' }).errores[0].codigo, 'rasgo_fuerte_excedido');
  assert.equal(evaluarEleccion(2, { ...vacia, mente: 'combat_instincts', fisico: 'stonefists' }).ok, true, 'combat_instincts no es fuerte');
  assert.equal(evaluarEleccion(2, { ...vacia, fisico: 'stonefists' }, CATALOGO_ERA, ['hive_society']).errores[0].codigo, 'rasgo_fuerte_excedido', 'cuenta lo que ya se tiene');
  const d = eleccionPorDefecto(2, { ...vacia, mente: 'hyper_intelligence', fisico: 'stonefists' });
  assert.deepEqual(d.rasgos, { mente: 'hyper_intelligence' }, 'se descarta la casilla de mas abajo');
  assert.equal(evaluarRasgoExtra('stonefists', { propios: ['high_fecundity'], reserva: 6 }), 'rasgo_fuerte_excedido');
  assert.equal(evaluarRasgoExtra('stonefists', { propios: ['gaia_shield'], reserva: 6 }), null);
  assert.equal(evaluarRasgoExtra('hive_society', { propios: [], reserva: 6 }), null, 'hive_society cuesta 6: solo cabe como extra con toda la reserva');
  assert.equal(evaluarEleccion(3, { arquitectura: NINGUNO, plano: NINGUNO, edificios: 'hive_society', politica: NINGUNO, sucesion: NINGUNO, impuestos: NINGUNO }).errores[0].codigo, 'presupuesto_excedido', 'no cabe en el borrador');
});

test('calendario: la comprobacion de rasgos pendientes cae despues de la etapa 3 y antes de la primera intervencion; el plazo se valida', () => {
  assert.throws(() => validarPartida(resolverPartida({ aniosEsperaRasgos: 140 })), { codigo: 'configuracion_era_invalida' });
  validarPartida(resolverPartida({ aniosEsperaRasgos: 0 }));
  assert.equal(PERFIL_ERA.partida.tiposMantenidos.join(), 'cultura,idioma,religion,clan');
});

test('catalogo catalogo-2 (E5): etiquetas coherentes con la clase, texto con lo medido, excluidos documentados y los dones de combate fuera', () => {
  const ETIQ = { medido: 'efecto medido', conducta: 'conducta (efecto no medido)', cosmetico: 'sabor' };
  assert.equal(CATALOGO_ERA.catalogo_version, 'era-1.0.catalogo-2');
  for (const r of CATALOGO_ERA.rasgos) {
    assert.equal(r.etiqueta, ETIQ[r.clase], r.id); assert.ok(r.e3?.recomendacion && r.confianza, `${r.id} trae su fila de E3`);
    if (r.clase === 'conducta') assert.match(r.efecto_es, /no medido|no se distinguió/, `${r.id}: la conducta dice que su efecto no se midio`);
    if (r.tipo === 'clan') assert.match(r.efecto_es, /miembros del clan/, `${r.id}: el efecto de clan dice a quien afecta`);
  }
  assert.equal(CATALOGO_ERA.rasgos.filter(r => r.clase === 'declarado').length, 0);
  for (const id of ['gift_of_fire', 'gift_of_thunder', 'gift_of_death', 'gift_of_void', 'gift_of_blood', 'unmoving', 'population_small', 'population_moderate', 'bioproduct_gold', 'blood_of_eons', 'eternal_text', 'patriarchy', 'matriarchy', 'solitude_seekers', 'hovering', 'zeal_of_conquest', 'cast_curse']) {
    assert.equal(rasgoPorId(id), undefined, `${id} no se ofrece`);
    assert.ok(CATALOGO_ERA.excluidos.some(x => x.id === id && x.motivo.length > 10), `${id} figura en excluidos con motivo`);
  }
  // el texto describe lo medido (E3)
  assert.match(rasgoPorId('hive_society').efecto_es, /×3/); assert.match(rasgoPorId('hive_society').efecto_es, /9 → 27/);
  assert.match(rasgoPorId('dense_dwellings').efecto_es, /×2/); assert.match(rasgoPorId('fast_learners').efecto_es, /×2/); assert.match(rasgoPorId('strict_spelling').efecto_es, /5 → 15/);
  assert.match(CATALOGO_ERA.excluidos.find(x => x.id === 'bioproduct_gold').motivo, /×4 a ×14/);
  for (const s of CATALOGO_ERA.slots) assert.ok(CATALOGO_ERA.rasgos.some(r => r.slot === s.id), `la casilla ${s.id} tiene opciones`);
  assert.equal(CATALOGO_ERA.rasgos.length, 67);
});

test('prompt: los rasgos FUERTES, la persistencia y el reembolso se explican con cifras del motor; la guerra puede decidirse antes de una intervencion', () => {
  const s = construirSistemaEra(resolverPartida());
  assert.match(s, /a lo sumo 1 en toda la partida/); assert.match(s, /el motor MANTIENE tus rasgos de cultura, idioma, religión y clan/);
  assert.match(s, /Año 31: el motor comprueba/); assert.match(s, /Año 501: intervención 1 de 2 de la guerra \(1 años después/);
  assert.match(s, /esa intervención no ocurre/); assert.match(s, /No cabe en el presupuesto de su etapa: solo se obtiene como rasgo_extra/);
  assert.doesNotMatch(construirSistemaEra(resolverPartida({ aniosEsperaRasgos: 0 })), /el motor comprueba si algún rasgo/);
});

// ---------------------------------------------------------------- normalizacion de lo que el puente informa
test('normalizar: pendientes, soltados, rasgos mantenidos y resumen del mantenimiento se conservan acotados; sin ellos la forma no cambia', () => {
  const r = normalizarRespuestaRasgos({ resultado: 'parcial', tipo: 'cultura', aplicados: ['a'], quitados: [], rechazados: [], pendientes: [{ id: 'roads', codigo: 'objeto_ausente', mensaje: 'x' }], soltados: ['z'], tope: 6 });
  assert.deepEqual(r.pendientes, [{ id: 'roads', codigo: 'objeto_ausente' }]); assert.deepEqual(r.soltados, ['z']);
  assert.deepEqual(normalizarRespuestaRasgos({ resultado: 'ejecutada', tipo: 'clan', aplicados: ['a'] }).pendientes, []);
  const c = normalizarCivilizacion({ faccion: 'f1', vivo: true, poblacion: 1, ciudades: 1, territorio: 1, ejercito: 0, edificios: 0, reinos: [], rasgos_mantenidos: { cultura: [{ id: 'roads', estado: 'activo', perdidas: 2, reaplicaciones: 2 }, { id: 'x', estado: 'raro', motivo: 'objeto_ausente' }], 'MAL!': [] } });
  assert.deepEqual(c.rasgos_mantenidos, { cultura: [{ id: 'roads', estado: 'activo', perdidas: 2, reaplicaciones: 2 }, { id: 'x', estado: 'pendiente', perdidas: 0, reaplicaciones: 0, motivo: 'objeto_ausente' }] });
  assert.deepEqual(normalizarCivilizacion({ faccion: 'f1', vivo: true, poblacion: 1, ciudades: 1, territorio: 1, ejercito: 0, edificios: 0 }).rasgos_mantenidos, {});
  assert.equal(normalizarEstadoEra({ hay_era: true, tiempo_juego_s: 5, civilizaciones: [], mantenimiento: { reaplicaciones: 3, ms_total: 1.5 } }).mantenimiento.reaplicaciones, 3);
});

// ---------------------------------------------------------------- orquestacion con mantenimiento
test('cultura que aparece tarde: el rasgo queda pendiente, el puente lo aplica cuando el reino ya tiene cultura y a la comprobacion ya esta activo (sin reembolso)', async () => {
  const { eventos, fin } = await correr({ adaptador: sim({ objetoAusenteHasta: { cultura: 14 } }) });
  const etapa3 = eventos.filter(e => e.tipo === 'rasgos_aplicados' && e.etapa === 3 && e.tipo_rasgo === 'cultura');
  assert.ok(etapa3.every(e => e.mantener === true && e.aplicados.length === 0 && e.pendientes.length >= 3), 'a los 11 anios aun no hay cultura: todo queda pendiente');
  assert.equal(eventos.filter(e => e.tipo === 'rasgo_no_aplicado').length, 0);
  assert.ok(eventos.filter(e => e.tipo === 'rasgo_diferido').length >= 6, 'a los 16 anios ya estan aplicados');
  for (const id of ['f1', 'f2']) { assert.deepEqual(fin.elecciones[id].rasgos_pendientes, {}); assert.equal(fin.elecciones[id].rasgos_aplicados.arquitectura, 'roads'); assert.deepEqual(fin.elecciones[id].rasgos_no_aplicados, []); }
  assert.ok(fin.mantenimiento.aplicados_tarde >= 6); assert.equal(fin.mantenimiento.deseados_pendientes, 0);
});

test('cultura que no aparece: tras el plazo se informa al modelo (rasgos_no_aplicados con motivo), se suelta del puente y los puntos vuelven a su reserva de extras', async () => {
  const vistos = [];
  const espia = (id, nombre) => ({ id, modelo: nombre, decidir: async ctx => { if (ctx.llamada.tipo === 'intervencion' && ctx.llamada.indice === 1 && ctx.llamada.fase === 'desarrollo') vistos.push({ id, presupuesto: ctx.presupuesto, tus: JSON.parse(ctx.prompt.usuario).tus_elecciones }); return crearBotEra(nombre, 3)(ctx); } });
  const { eventos, fin } = await correr({ adaptador: sim({ objetoAusenteHasta: { cultura: 80 } }), participantes: [espia('f1', 'bot-era-militar'), espia('f2', 'bot-era-economico')] });
  const nada = eventos.filter(e => e.tipo === 'rasgo_no_aplicado');
  assert.equal(nada.length, 10, 'los cinco rasgos de cultura de cada bot');
  assert.ok(nada.every(e => e.motivo === 'objeto_ausente' && e.puntos_devueltos === rasgoPorId(e.id).costo));
  const f1 = vistos.find(v => v.id === 'f1');
  const costo1 = Object.values(fin.elecciones.f1.rasgos_no_aplicados).reduce((s, x) => s + x.puntos_devueltos, 0);
  assert.equal(f1.presupuesto.reserva_rasgos_extra, PRESUPUESTO_PUNTOS.rasgo_extra + costo1, 'la reserva que ve el modelo incluye lo devuelto');
  assert.ok(f1.tus.rasgos_no_aplicados.length >= 4 && f1.tus.rasgos_no_aplicados.every(x => x.motivo === 'objeto_ausente' && 'casilla' in x && 'id' in x));
  assert.deepEqual(f1.tus.rasgos_pendientes, {});
  assert.equal(fin.mantenimiento.deseados_pendientes, 0, 'se soltaron del puente');
  assert.equal(fin.infracciones.f1, 0); assert.equal(fin.infracciones.f2, 0, 'no es culpa del modelo');
});

test('reemplazo del objeto por el juego: el mantenimiento reaplica cultura, idioma y religion; al final todos los rasgos elegidos siguen puestos', async () => {
  const base = sim({ reemplazos: [{ tipo: 'cultura', cadaAnios: 7 }, { tipo: 'idioma', cadaAnios: 9 }, { tipo: 'religion', cadaAnios: 11 }] });
  let mundo = null;
  const adaptador = { ...base, cerrar: async () => { const m = base._mundo(); mundo = { mantCuenta: { ...m.mantCuenta }, facs: structuredClone(m.facs) }; return base.cerrar(); } };
  const { eventos, fin } = await correr({ adaptador });
  assert.ok(mundo.mantCuenta.reaplicaciones > 5, `reaplicaciones: ${mundo.mantCuenta.reaplicaciones}`);
  assert.equal(fin.mantenimiento.reaplicaciones, mundo.mantCuenta.reaplicaciones);
  const f1 = mundo.facs[0], f2 = mundo.facs[1];
  for (const id of ['roads', 'city_layout_rings', 'tower_lovers', 'expansionists', 'warriors_ascension']) assert.ok(f1.rasgos.cultura.includes(id), `f1 conserva ${id}`);
  assert.ok(f1.rasgos.idioma.includes('strict_spelling') && f1.rasgos.religion.includes('cast_shield') && f2.rasgos.idioma.includes('elegant_words'), 'idioma y religion persisten');
  const foto = eventos.filter(e => e.tipo === 'anio' && e.rasgos_mantenidos).at(-1);
  assert.deepEqual(foto.rasgos_mantenidos.f1.cultura.ids.sort(), ['expansionists', 'city_layout_rings', 'roads', 'tower_lovers', 'warriors_ascension'].sort());
  assert.ok(foto.rasgos_mantenidos.f1.cultura.reaplicaciones > 0 && foto.rasgos_mantenidos.f1.cultura.perdidas === foto.rasgos_mantenidos.f1.cultura.reaplicaciones);
  assert.equal(fin.rasgos_mantenidos.f2.idioma.activos, 1);
});

test('sin mantenimiento en el puente (sin era_mantener): se juega como antes, no se pide mantener y queda anotado; los rechazos se informan igual', async () => {
  const base = crearAdaptadorEraSimulado({ sim: { objetoAusenteHasta: { cultura: 80 } } }), antes = await base.info(), pedidos = [];
  const envuelto = { ...base, era: { ...base.era, rasgos: async d => { pedidos.push(d); return base.era.rasgos(d); } }, info: async () => ({ ...antes, capacidades: { ...antes.capacidades, era_mantener: false } }) };
  const { eventos, fin } = await correr({ adaptador: envuelto });
  assert.equal(fin.anomalias.find(a => a.tipo === 'sin_mantenimiento')?.tipo, 'sin_mantenimiento');
  assert.ok(pedidos.length > 0 && pedidos.every(p => p.mantener === undefined));
  const rechazos = eventos.filter(e => e.tipo === 'rasgo_no_aplicado');
  assert.ok(rechazos.length >= 8 && rechazos.every(e => e.motivo === 'no_aplicado'), 'el juego los rechazo y, no siendo culpa del modelo, se devuelven los puntos');
  assert.ok(rechazos.every(e => e.puntos_devueltos === rasgoPorId(e.id).costo));
});

test('rasgo_extra de un tipo mantenido viaja con mantener; si el objeto no existe no queda nada pendiente en el puente', async () => {
  const base = crearAdaptadorEraSimulado(), pedidos = [];
  const envuelto = { ...base, era: { ...base.era, rasgos: async d => { pedidos.push(structuredClone(d)); return base.era.rasgos(d); } } };
  const f1 = { id: 'f1', modelo: 'g1', decidir: async ctx => (ctx.llamada.tipo === 'intervencion' && ctx.llamada.indice === 1 && ctx.llamada.fase === 'desarrollo'
    ? JSON.stringify({ actions: [{ action: 'rasgo_extra', parameters: { id: 'enlightening_script' } }], reasoning_summary: 'Idioma extra.' }) : crearBotEra('bot-era-militar', 1)(ctx)) };
  const { fin } = await correr({ adaptador: envuelto, participantes: [f1, bots('bot-era-economico')[0]].map((x, i) => ({ ...x, id: `f${i + 1}` })) });
  assert.equal(fin.elecciones.f1.extras[0], 'enlightening_script', 'el primer extra es el pedido, de tipo idioma');
  assert.ok(pedidos.some(p => p.agregar?.[0] === 'enlightening_script' && p.mantener === true));
});

test('guerra lenta: en la guerra se avanza en pasos de 20 s de mundo (no 60), la velocidad pasa a x5 y las intervenciones de guerra caen +1 y +3 anios despues de la caida', async () => {
  const base = crearAdaptadorEraSimulado(), pasos = [], vel = [];
  const envuelto = { ...base, avanzar: async d => { pasos.push({ seg: d.segundos_juego, guerra: base._mundo().guerra }); return base.avanzar(d); }, era: { ...base.era, velocidad: async d => { vel.push(d.velocidad); return base.era.velocidad(d); } } };
  const { eventos } = await correr({ adaptador: envuelto, partida: { intervencionesGuerra: [1, 3] } });
  assert.deepEqual(vel, ['x5']);
  assert.ok(pasos.filter(p => p.guerra).length > 0 && pasos.filter(p => p.guerra).every(p => p.seg === 20), 'en guerra, 20 s');
  assert.ok(pasos.filter(p => !p.guerra).every(p => p.seg === 60), 'antes, 60 s');
  const g = eventos.filter(e => e.tipo === 'intervencion' && e.fase === 'guerra').map(e => e.anio);
  assert.ok(g.length >= 2 && Math.min(...g) >= 61 && Math.max(...g) <= 64, `intervenciones de guerra en ${g}`);
});

test('si la guerra elimina a una civilizacion antes de la intervencion, esa intervencion se omite y queda registrada (sin llamar a nadie)', async () => {
  const { eventos, razon, decisiones } = await correr({ adaptador: sim({ letalidad: 6 }), partida: { intervencionesGuerra: [1, 8], anioLimite: 400 } });
  assert.equal(razon, 'eliminacion');
  const omitidas = eventos.filter(e => e.tipo === 'intervencion_omitida');
  assert.ok(omitidas.length <= 1);
  const llamadasDeGuerra = decisiones.filter(d => d.llamada.fase === 'guerra').map(d => d.llamada.indice);
  assert.ok(llamadasDeGuerra.every(i => i === 1), 'la segunda intervencion de guerra no llega a llamarse');
});

test('el modelo no puede elegir dos rasgos FUERTES: recibe una correccion y, si insiste, se descarta el de la casilla de mas abajo', async () => {
  const f1 = { id: 'f1', modelo: 'g1', decidir: async ctx => (ctx.llamada.tipo === 'etapa2'
    ? JSON.stringify({ actions: [{ action: 'elegir_rasgos_etapa2', parameters: { cognitivo: NINGUNO, mente: 'hyper_intelligence', espiritu: NINGUNO, fisico: 'stonefists', apariencia: NINGUNO } }], reasoning_summary: 'Dos fuertes.' }) : crearBotEra('bot-era-economico', 1)(ctx)) };
  const { fin, decisiones } = await correr({ participantes: [f1, bots('bot-era-militar')[0]].map((x, i) => ({ ...x, id: `f${i + 1}` })) });
  const d = decisiones.filter(x => x.participant_id === 'f1' && x.turn_number === 2);
  assert.equal(d.length, 2); assert.equal(d[0].errores[0].codigo, 'rasgo_fuerte_excedido');
  assert.deepEqual(fin.elecciones.f1.rasgos.mente, 'hyper_intelligence'); assert.equal(fin.elecciones.f1.rasgos.fisico, undefined);
  assert.equal(fin.infracciones.f1, 1);
  assert.equal([...Object.values(fin.elecciones.f1.rasgos)].filter(id => esFuerte(id)).length, 1);
});

test('auditoria: una partida con mantenimiento, pendientes y reembolsos se audita limpia y el reporte coincide con el log', async () => {
  const carpeta = await mkdtemp(join(tmpdir(), 'worldbox-era-mant-'));
  try {
    const tel = await crearTelemetria(join(carpeta, 'eventos.jsonl'));
    const { eventos } = await correr({ adaptador: sim({ objetoAusenteHasta: { cultura: 80 }, reemplazos: [{ tipo: 'idioma', cadaAnios: 8 }] }), telemetria: tel });
    const { reconstruirReporteEra, escribirReporteEra } = await import('../../worldbox/era/reporte-era.js');
    await escribirReporteEra(reconstruirReporteEra(eventos), carpeta);
    const limpio = await auditarEra(carpeta);
    assert.deepEqual(limpio.problemas, []); assert.equal(limpio.ok, true);
    assert.ok(eventos.some(e => e.tipo === 'rasgo_no_aplicado') && eventos.some(e => e.tipo === 'rasgo_reaplicado' || e.tipo === 'anio' && e.mantenimiento));
  } finally { await rm(carpeta, { recursive: true, force: true }); }
});

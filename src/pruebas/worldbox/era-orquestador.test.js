import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { correrEra } from '../../worldbox/era/orquestador-era.js';
import { crearAdaptadorEraSimulado } from '../../worldbox/era/adaptador-era-simulado.js';
import { crearAdaptadorHttp } from '../../worldbox/adaptador-http.js';
import { crearBotEra, BOTS_ERA } from '../../worldbox/era/bots-era.js';
import { crearEstadoVivoEra } from '../../worldbox/era/vivo-era.js';
import { reconstruirReporteEra } from '../../worldbox/era/reporte-era.js';
import { auditarEra } from '../../worldbox/era/auditar-era.js';
import { crearLineaTiempo } from '../../worldbox/era/linea-tiempo.js';
import { crearPasarela } from '../../worldbox/pasarela.js';
import { PRESUPUESTO_PUNTOS, NINGUNO, rasgoPorId, resolverPartida } from '../../worldbox/era/reglas-era.js';
import { main } from '../../worldbox/correr.js';
import { estimarCostoEra } from '../../worldbox/era/estimar-costo-era.js';

const CORTA = { anioMuro: 60, anioLimite: 90, aniosBorrador: 5, intervencionesDesarrollo: [20, 35, 50], intervencionesGuerra: [3, 15], aniosEsperaRasgos: 5 };
const bots = (...n) => n.map((modelo, i) => ({ id: `f${i + 1}`, modelo, decidir: crearBotEra(modelo, 1 + i) }));
const json = (actions, frase = 'Frase de prueba.') => JSON.stringify({ actions, reasoning_summary: frase });
const VACIA2 = { cognitivo: NINGUNO, mente: NINGUNO, espiritu: NINGUNO, fisico: NINGUNO, apariencia: NINGUNO };
const VACIA3 = { arquitectura: NINGUNO, plano: NINGUNO, edificios: NINGUNO, politica: NINGUNO, sucesion: NINGUNO, impuestos: NINGUNO };
async function conCarpeta(fn) { const c = await mkdtemp(join(tmpdir(), 'worldbox-era-')); try { await fn(c); } finally { await rm(c, { recursive: true, force: true }); } }
const correr = async ({ adaptador = crearAdaptadorEraSimulado(), participantes = bots('bot-era-militar', 'bot-era-economico'), partida = {}, ...resto } = {}) => {
  const r = await correrEra({ adaptador, participantes, semilla: 7, partida: { ...CORTA, ...partida }, ...resto });
  return { ...r, fin: r.eventos.at(-1), decisiones: r.eventos.filter(e => e.tipo === 'decision') };
};
// Participante guionado: responde segun la llamada; `guion(ctx)` devuelve el texto o un objeto (se serializa).
const guionado = (id, guion) => ({ id, modelo: `guion-${id}`, decidir: async ctx => { const x = await guion(ctx); return typeof x === 'string' ? x : x.actions ? JSON.stringify(x) : json(x); } });
const normal = (nombre, id) => ({ id, modelo: nombre, decidir: crearBotEra(nombre, 3) });

test('partida completa con bots y el simulado: 8 llamadas por modelo, fin por puntos al limite de anios, reporte y auditoria coherentes', async () => {
  const { fin, decisiones, razon, completo, ganador, eventos } = await correr();
  assert.equal(razon, 'limite_anios'); assert.equal(completo, true); assert.equal(fin.anio, 90);
  for (const id of ['f1', 'f2']) assert.equal(new Set(decisiones.filter(d => d.participant_id === id).map(d => d.turn_number)).size, 8, `8 llamadas de ${id}`);
  assert.deepEqual(decisiones.map(d => d.llamada.tipo).filter((t, i, a) => a.indexOf(t) === i), ['etapa1', 'etapa2', 'etapa3', 'intervencion']);
  assert.deepEqual([...new Set(eventos.filter(e => e.tipo === 'decision' && e.llamada.tipo === 'intervencion').map(e => e.llamada.fase))], ['desarrollo', 'guerra']);
  assert.equal(fin.ranking[0].puesto, 1); assert.equal(ganador, fin.ranking[0].participant_id);
  assert.equal(Math.round(Object.values(fin.puntos).reduce((s, v) => s + v, 0) * 10) / 10, 100);
  assert.equal(fin.consumo.costo, 0); assert.equal(decisiones[0].rules_version, 'era-1.0'); assert.equal(decisiones[0].prompt_version, 'era-1.0');
  const inicio = eventos.find(e => e.tipo === 'inicio');
  assert.equal(inicio.config.partida.anioMuro, 60); assert.equal(inicio.config.sistema_hash, decisiones[0].sistema_hash);
  assert.equal(new Set(decisiones.map(d => d.sistema_hash)).size, 1, 'el mismo texto de sistema para los dos modelos y todas las llamadas');
  const rep = reconstruirReporteEra(eventos);
  assert.equal(rep.formato, 'era'); assert.equal(rep.modelos.length, 2); assert.equal(rep.modelos[0].llamadas, 8); assert.equal(rep.completo, true);
});

test('equidad del mundo: espejo, muro, minerales en la misma cantidad y radio para ambos, leyes de variabilidad apagadas, edad fija, velocidad de desarrollo', async () => {
  const sim = crearAdaptadorEraSimulado(), pedidos = [];
  const envuelto = { ...sim, era: sim.era, reiniciarEscenario: async d => { pedidos.push(d); return sim.reiniciarEscenario(d); } };
  await correr({ adaptador: envuelto });
  const d = pedidos[0], era = d.opciones.era;
  assert.equal(era.espejo, true); assert.deepEqual(era.muro, { ancho: 4 }); assert.equal(era.edad, 'age_hope'); assert.equal(era.pausar_edades, true);
  assert.deepEqual(era.leyes, { world_law_rebellions: false, world_law_disasters_nature: false, world_law_disasters_other: false });
  assert.equal(era.minerales.length, 2); assert.equal(era.minerales[0].cantidad, era.minerales[1].cantidad); assert.equal(era.minerales[0].radio, era.minerales[1].radio);
  assert.equal(d.opciones.velocidad, 'x40'); assert.equal(d.facciones.length, 2); assert.equal(d.tamano_mapa, 192);
});

test('borrador a ciegas: sin ver al rival hasta cerrar las tres etapas; con revelar=etapa se ve lo ya cerrado; en las intervenciones se ve todo', async () => {
  const vistas = [];
  const grabar = id => ({ id, modelo: `g-${id}`, decidir: async ctx => { vistas.push({ id, tipo: ctx.llamada.tipo, fase: ctx.llamada.fase, rival: ctx.observation?.rival ?? null, elecciones_rival: JSON.parse(ctx.prompt.usuario).elecciones_del_rival, puntaje: ctx.observation?.puntaje ?? null });
    return crearBotEra('bot-era-economico', 1)(ctx); } });
  await correr({ participantes: [grabar('f1'), grabar('f2')] });
  for (const v of vistas.filter(x => x.tipo !== 'intervencion')) { assert.equal(v.rival, null, `${v.tipo}: rival oculto`); assert.equal(v.elecciones_rival, null, `${v.tipo}: elecciones ocultas`); }
  for (const v of vistas.filter(x => x.tipo === 'intervencion')) { assert.ok(v.rival && v.rival.especie, 'intervencion: rival visible'); assert.ok(v.elecciones_rival?.raza, 'elecciones del rival visibles'); assert.ok(v.puntaje && v.puntaje.tu !== undefined); }
  vistas.length = 0;
  await correr({ participantes: [grabar('f1'), grabar('f2')], partida: { revelar: 'etapa' } });
  assert.equal(vistas.find(v => v.tipo === 'etapa1').elecciones_rival, null);
  assert.ok(vistas.find(v => v.tipo === 'etapa2').elecciones_rival.raza, 'con revelar=etapa se ve lo que cerro la etapa 1');
});

test('la etapa 1 y el bioma: una combinacion invalida recibe UNA correccion que explica el error y, corregida, se juega sin infraccion', async () => {
  const vistos = [];
  const f1 = guionado('f1', ctx => {
    if (ctx.llamada.tipo === 'etapa1') { vistos.push(ctx.correccion); return ctx.correccion ? { actions: [{ action: 'elegir_inicio', parameters: { raza: 'human', mineral: 'mineral_gold', bioma: 'biome_grass' } }], reasoning_summary: 'Corrijo.' } : { actions: [{ action: 'elegir_inicio', parameters: { raza: 'human', mineral: 'mineral_gold', bioma: 'biome_desert' } }], reasoning_summary: 'Desierto.' }; }
    return crearBotEra('bot-era-economico', 1)(ctx);
  });
  const { fin, decisiones } = await correr({ participantes: [f1, normal('bot-era-militar', 'f2')] });
  assert.equal(vistos[0], null); assert.equal(vistos[1].errores[0].codigo, 'bioma_incompatible'); assert.match(vistos[1].errores[0].detalle, /biome_grass/);
  assert.match(vistos[1].intento_anterior, /biome_desert/);
  assert.equal(fin.infracciones.f1, 0); assert.equal(fin.elecciones.f1.bioma, 'biome_grass');
  const intentos = decisiones.filter(d => d.participant_id === 'f1' && d.turn_number === 1);
  assert.deepEqual(intentos.map(d => [d.intento, d.correccion]), [[0, false], [1, true]]);
  assert.equal(intentos[0].errores[0].codigo, 'bioma_incompatible');
});

test('presupuesto de puntos: pasarse en la etapa 2 se corrige una vez; si sigue mal se recorta desde la ultima casilla y cuenta una infraccion por error', async () => {
  const pasado = { actions: [{ action: 'elegir_rasgos_etapa2', parameters: { ...VACIA2, mente: 'combat_instincts', fisico: 'high_fecundity' } }], reasoning_summary: 'Todo.' };
  const f1 = guionado('f1', ctx => ctx.llamada.tipo === 'etapa2' ? pasado : crearBotEra('bot-era-economico', 1)(ctx));
  const { fin, decisiones } = await correr({ participantes: [f1, normal('bot-era-militar', 'f2')] });
  assert.equal(decisiones.filter(d => d.participant_id === 'f1' && d.turn_number === 2).length, 2, 'una sola correccion');
  assert.equal(fin.infracciones.f1, 1);
  assert.deepEqual(fin.elecciones.f1.rasgos, { mente: 'combat_instincts', ...Object.fromEntries(Object.entries(fin.elecciones.f1.rasgos).filter(([k]) => k !== 'mente' && k !== 'fisico')) }, 'se descarta el fisico (casilla de mas abajo) y queda dentro del presupuesto');
  assert.equal(fin.elecciones.f1.rasgos.fisico, undefined); assert.equal(fin.elecciones.f1.rasgos.mente, 'combat_instincts');
  assert.equal(decisiones.find(d => d.participant_id === 'f1' && d.turn_number === 2 && d.intento === 0).errores[0].codigo, 'presupuesto_excedido');
});

test('respuesta rota: la correccion la salva sin infraccion (bot-roto); sin correccion posible (bot-terco) se juega la jugada por defecto con una infraccion por llamada', async () => {
  const { fin, decisiones } = await correr({ participantes: bots('bot-era-roto', 'bot-era-terco') });
  assert.equal(fin.infracciones.f1, 0); assert.equal(fin.infracciones.f2, 8);
  assert.equal(decisiones.filter(d => d.participant_id === 'f1').length, 16); assert.equal(decisiones.filter(d => d.participant_id === 'f1' && d.correccion).length, 8);
  assert.deepEqual(fin.elecciones.f2.raza, 'human'); assert.equal(fin.elecciones.f2.mineral, 'mineral_stone'); assert.deepEqual(fin.elecciones.f2.rasgos, {});
  assert.ok(BOTS_ERA.includes('bot-era-roto'));
});

test('intervenciones: maldecir en el desarrollo y un rasgo_extra que no es medido ni declarado se rechazan (una correccion); con la correccion se juega el rasgo extra pagado de la reserva', async () => {
  const f1 = guionado('f1', ctx => {
    if (ctx.llamada.tipo !== 'intervencion') return crearBotEra('bot-era-economico', 1)(ctx);
    if (ctx.llamada.fase === 'desarrollo' && ctx.llamada.indice === 1) {
      if (!ctx.correccion) return { actions: [{ action: 'maldecir', parameters: { objetivo: 'f2', gotas: 1 } }, { action: 'rasgo_extra', parameters: { id: 'phenotype_skin_magical' } }], reasoning_summary: 'x' };
      assert.equal(ctx.correccion.errores.map(e => e.codigo).sort().join(), 'accion_no_permitida,parametros_invalidos');
      assert.equal(ctx.presupuesto.reserva_rasgos_extra, PRESUPUESTO_PUNTOS.rasgo_extra);
      return { actions: [{ action: 'crear_unidades', parameters: { cantidad: 5 } }, { action: 'rasgo_extra', parameters: { id: 'gaia_shield' } }], reasoning_summary: 'ok' };
    }
    if (ctx.llamada.fase === 'desarrollo' && ctx.llamada.indice === 2) { assert.equal(ctx.presupuesto.reserva_rasgos_extra, PRESUPUESTO_PUNTOS.rasgo_extra - rasgoPorId('gaia_shield').costo); assert.equal(ctx.presupuesto.unidades_restantes, 5); }
    return { actions: [{ action: 'esperar', parameters: {} }], reasoning_summary: 'espero' };
  });
  const { fin, decisiones } = await correr({ participantes: [f1, normal('bot-era-militar', 'f2')] });
  assert.equal(fin.infracciones.f1, 0); assert.deepEqual(fin.elecciones.f1.extras, ['gaia_shield']);
  assert.equal(decisiones.filter(d => d.participant_id === 'f1' && d.llamada.tipo === 'intervencion' && d.correccion).length, 1, 'una sola correccion en toda la partida');
  assert.ok(decisiones.filter(d => d.participant_id === 'f1' && d.llamada.tipo === 'intervencion' && !d.correccion).length >= 3);
});
test('tope de unidades creadas: pasarlo es invalido (limite_partida) y recibe correccion', async () => {
  const f1 = guionado('f1', ctx => {
    if (ctx.llamada.tipo !== 'intervencion') return crearBotEra('bot-era-economico', 1)(ctx);
    return ctx.correccion ? { actions: [{ action: 'esperar', parameters: {} }], reasoning_summary: 'espero' } : { actions: [{ action: 'crear_unidades', parameters: { cantidad: 5 } }], reasoning_summary: 'cinco' };
  });
  const { fin, decisiones } = await correr({ participantes: [f1, normal('bot-era-militar', 'f2')] });
  const errores = decisiones.filter(d => d.participant_id === 'f1' && d.errores?.length).flatMap(d => d.errores.map(e => e.codigo));
  assert.ok(errores.includes('limite_partida'), 'a la tercera orden de 5 unidades se pasa del tope de 10');
  assert.equal(fin.infracciones.f1, 0, 'la correccion lo arregla');
});

test('muro y guerra por regla: el muro sigue en pie hasta el anio fijado; al caer, el motor declara la guerra, baja la velocidad y la linea de tiempo lo registra', async () => {
  const sim = crearAdaptadorEraSimulado();
  const estados = [];
  const envuelto = { ...sim, era: { ...sim.era, estado: async d => { const e = await sim.era.estado(d); estados.push({ anio: e.anio, muro: e.muro.puesto, guerra: sim._mundo().guerra }); return e; } } };
  const { eventos, linea } = await correr({ adaptador: envuelto });
  assert.ok(estados.filter(e => e.anio < 60).every(e => e.muro && !e.guerra), 'antes del anio 60: muro en pie y sin guerra');
  assert.ok(estados.filter(e => e.anio >= 61).every(e => !e.muro && e.guerra), 'despues: muro caido y guerra');
  const guerra = eventos.find(e => e.tipo === 'guerra');
  assert.equal(guerra.declarada, true); assert.equal(guerra.motivo, 'caida_del_muro'); assert.equal(guerra.anio, 60);
  const v = eventos.filter(e => e.tipo === 'velocidad'); assert.deepEqual(v.map(e => e.velocidad), ['x5']);
  const tipos = linea.eventos.map(e => e.tipo);
  for (const t of ['fundacion', 'llamada', 'muro_cae', 'guerra', 'velocidad', 'fin']) assert.ok(tipos.includes(t), t);
  const orden = linea.eventos.filter(e => ['muro_cae', 'guerra'].includes(e.tipo)).map(e => e.anio); assert.deepEqual(orden, [60, 60]);
});

test('sin cambio de velocidad en vivo (puente sin era_velocidad) se juega a la del escenario y queda anotado', async () => {
  const sim = crearAdaptadorEraSimulado(), antes = await sim.info();
  const envuelto = { ...sim, info: async () => ({ ...antes, capacidades: { ...antes.capacidades, era_velocidad: false } }) };
  const { fin } = await correr({ adaptador: envuelto });
  assert.equal(fin.anomalias.find(a => a.tipo === 'velocidad_fija')?.tipo, 'velocidad_fija'); assert.equal(fin.anomalias.some(a => a.tipo === 'sin_mantenimiento'), false); assert.equal(fin.completo, true);
});

test('eliminacion: gana el ultimo vivo y la partida termina antes del limite', async () => {
  const { razon, fin, ganador, completo } = await correr({ adaptador: crearAdaptadorEraSimulado({ sim: { letalidad: 3 } }), partida: { anioLimite: 400 } });
  assert.equal(razon, 'eliminacion'); assert.equal(completo, true); assert.ok(fin.anio < 400, `termino en el anio ${fin.anio}`);
  const vivos = fin.snapshot.filter(c => c.vivo); assert.equal(vivos.length, 1); assert.equal(ganador, vivos[0].id); assert.equal(fin.ranking[0].participant_id, ganador);
  assert.equal(fin.puntos[ganador], 100);
});

test('una civilizacion es la suma de sus reinos: una escision no cuenta como victoria y la caida del reino fundador no elimina a la civilizacion', async () => {
  const { razon, fin, eventos } = await correr({ adaptador: crearAdaptadorEraSimulado({ sim: { escision: { faccion: 'f2', anio: 30 }, cae_original: { faccion: 'f2', anio: 40 } } }) });
  assert.equal(razon, 'limite_anios');
  assert.ok(fin.snapshot.every(c => c.vivo), 'las dos siguen vivas');
  const f2 = fin.snapshot.find(c => c.id === 'f2'); assert.equal(f2.reinos_vivos, 1);
  assert.ok(eventos.some(e => e.tipo === 'anio'));
});

test('si una guerra termina en paz el motor la vuelve a declarar; con renovarGuerra=false no', async () => {
  const hacer = async partida => {
    const sim = crearAdaptadorEraSimulado();
    let hecho = false;
    const envuelto = { ...sim, avanzar: async d => { const r = await sim.avanzar(d); const m = sim._mundo(); if (!hecho && m.t >= 70 * 60 && m.guerra) { hecho = true; await sim.ejecutar({ faccion: 'f1', accion: 'pedir_paz', parametros: { objetivo: 'f2' } }); } return r; } };
    const { eventos } = await correr({ adaptador: envuelto, partida });
    return eventos.filter(e => e.tipo === 'guerra').map(e => e.motivo);
  };
  assert.deepEqual(await hacer({}), ['caida_del_muro', 'renovar_paz']);
  assert.deepEqual(await hacer({ renovarGuerra: false }), ['caida_del_muro']);
});

test('rasgos que el juego rechaza (ya presente) no se aplican ni cuestan, y quedan en el registro', async () => {
  const sim = crearAdaptadorEraSimulado({ sim: { presentes: { f1: { subespecie: ['phenotype_skin_magical'] } } } });
  const f1 = guionado('f1', ctx => ctx.llamada.tipo === 'etapa2' ? { actions: [{ action: 'elegir_rasgos_etapa2', parameters: { ...VACIA2, apariencia: 'phenotype_skin_magical', fisico: 'exoskeleton' } }], reasoning_summary: 'x' } : crearBotEra('bot-era-economico', 1)(ctx));
  const { eventos, fin } = await correr({ adaptador: sim, participantes: [f1, normal('bot-era-militar', 'f2')] });
  const ap = eventos.find(e => e.tipo === 'rasgos_aplicados' && e.participant_id === 'f1' && e.etapa === 2 && e.tipo_rasgo === 'subespecie');
  assert.deepEqual(ap.aplicados, ['exoskeleton']); assert.equal(ap.rechazados[0].codigo, 'ya_presente');
  assert.equal(fin.elecciones.f1.rasgos_aplicados.apariencia, undefined); assert.equal(fin.elecciones.f1.rasgos_aplicados.fisico, 'exoskeleton');
  assert.equal(fin.infracciones.f1, 0);
});

test('costos y cortes de seguridad: el gasto se suma por llamada; si se agota el presupuesto a mitad de partida queda incompleta, sin infraccion y con su ultimo estado', async () => {
  const costoLlamar = async ({ usuario }) => { const d = JSON.parse(usuario); const t = d.llamada.tipo; const params = t === 'etapa1' ? { raza: 'human', mineral: 'mineral_gold', bioma: NINGUNO } : t === 'etapa2' ? VACIA2 : VACIA3;
    return { texto: t === 'intervencion' ? json([{ action: 'esperar', parameters: {} }]) : json([{ action: t === 'etapa1' ? 'elegir_inicio' : `elegir_rasgos_etapa${d.llamada.etapa}`, parameters: params }]), finishReason: 'stop', uso: { prompt_tokens: 9000, completion_tokens: 200, cost: 0.002 } }; };
  const nueva = () => crearPasarela({ llamar: costoLlamar, modo: 'pago', presupuesto: 1, presupuestoModelo: 0.5, tarifas: { 'a/x': { entrada: 0.1, salida: 0.5 }, 'b/y': { entrada: 0.1, salida: 0.5 } }, limitador: { esperar: async () => {} } });
  const par = [{ id: 'f1', modelo: 'a/x' }, { id: 'f2', modelo: 'b/y' }];
  const r = await correr({ participantes: par, pasarela: nueva(), presupuesto: 1 });
  assert.equal(r.completo, true); assert.equal(Math.round(r.fin.consumo.costo * 1e6) / 1e6, 0.032, '16 llamadas de 0,002'); assert.equal(r.fin.consumo.tokens, 16 * 9200); assert.equal(r.fin.infracciones.f1, 0);
  const corte = await correr({ participantes: par, pasarela: nueva(), presupuesto: 0.009 });
  assert.equal(corte.completo, false); assert.equal(corte.razon, 'presupuesto_excedido'); assert.equal(corte.fin.razon, 'presupuesto_excedido');
  assert.equal(corte.fin.infracciones.f1, 0); assert.equal(corte.fin.infracciones.f2, 0); assert.ok(corte.fin.snapshot.length === 2, 'conserva el ultimo estado confirmado');
  await assert.rejects(() => correr({ participantes: par, pasarela: nueva(), presupuesto: 0.001 }), { codigo: 'presupuesto_excedido' }, 'sin presupuesto para la etapa 1 no hay partida');
  const rep = reconstruirReporteEra(corte.eventos); assert.equal(rep.completo, false); assert.equal(rep.razon, 'presupuesto_excedido');
});
test('un fallo tecnico del proveedor pierde la llamada sin infraccion y sin correccion; el motor usa la jugada por defecto', async () => {
  const llamar = async ({ usuario }) => { const d = JSON.parse(usuario); if (d.llamada.numero === 1) { const e = new Error('503'); e.status = 503; throw e; }
    const t = d.llamada.tipo; return { texto: t === 'intervencion' ? json([{ action: 'esperar', parameters: {} }]) : json([{ action: t === 'etapa1' ? 'elegir_inicio' : `elegir_rasgos_etapa${d.llamada.etapa}`, parameters: t === 'etapa1' ? { raza: 'elf', mineral: 'mineral_gold', bioma: NINGUNO } : t === 'etapa2' ? VACIA2 : VACIA3 }]), finishReason: 'stop', uso: { prompt_tokens: 10, completion_tokens: 10, cost: 0 } }; };
  const pasarela = crearPasarela({ llamar, modo: 'pago', presupuesto: 1, presupuestoModelo: 1, reintentos: 0, tarifas: { 'a/x': { entrada: 0, salida: 0 }, 'b/y': { entrada: 0, salida: 0 } }, limitador: { esperar: async () => {} } });
  const { fin, decisiones } = await correr({ participantes: [{ id: 'f1', modelo: 'a/x' }, { id: 'f2', modelo: 'b/y' }], pasarela, presupuesto: 1 });
  assert.equal(fin.infracciones.f1, 0); assert.equal(fin.elecciones.f1.raza, 'human', 'jugada por defecto de la etapa 1');
  assert.equal(decisiones.filter(d => d.participant_id === 'f1' && d.turn_number === 1).length, 1, 'sin correccion');
  assert.equal(decisiones.find(d => d.participant_id === 'f1' && d.turn_number === 1).error_type, 'proveedor');
});

test('la auditoria repite la validacion desde el log y detecta cada manipulacion', async () => {
  await conCarpeta(async c => {
    const salida = await main(['--formato=era', '--adaptador=simulado', '--participantes=bot-era-militar,bot-era-roto', '--semilla=7', '--partidas=1', '--anio-muro=60', '--anio-limite=90', '--intervenciones=20,35,50', '--intervenciones-guerra=3,15', '--anios-espera-rasgos=5', `--salida=${c}`]);
    const carpeta = salida[0].carpeta;
    const limpio = await auditarEra(carpeta); assert.deepEqual(limpio.problemas, []); assert.equal(limpio.ok, true);
    const crudo = await readFile(join(carpeta, 'eventos.jsonl'), 'utf8');
    const { writeFile } = await import('node:fs/promises');
    const manipular = async (cambiar, esperado) => {
      await writeFile(join(carpeta, 'eventos.jsonl'), cambiar(crudo)); const r = await auditarEra(carpeta);
      assert.equal(r.ok, false, esperado); assert.ok(r.problemas.some(p => p.includes(esperado)), `${esperado}: ${r.problemas.join(' | ')}`);
    };
    await manipular(t => t.replace('"cost":0', '"cost":0.5'), 'costo registrado');
    const sobre = (t, pred, fn) => t.split('\n').map(l => { if (!l) return l; const e = JSON.parse(l); return pred(e) ? JSON.stringify(fn(e)) : l; }).join('\n');
    await manipular(t => sobre(t, e => e.tipo === 'decision' && e.turn_number === 2 && e.intento === 0 && !e.correccion && e.participant_id === 'f1', e => ({ ...e, errores: [], action_raw: JSON.stringify({ actions: [{ action: 'elegir_rasgos_etapa2', parameters: { cognitivo: 'ninguno', mente: 'combat_instincts', espiritu: 'gods_chosen', fisico: 'high_fecundity', apariencia: 'ninguno' } }], reasoning_summary: 'x' }) })), 'validación repetida');
    await manipular(t => sobre(t, e => e.tipo === 'fin', e => ({ ...e, puntos: { f1: 99, f2: 1 } })), 'puntos finales');
    await manipular(t => sobre(t, e => e.tipo === 'inicio', e => ({ ...e, config: { ...e.config, sistema_hash: 'x' } })), 'sistema_hash');
    await writeFile(join(carpeta, 'eventos.jsonl'), crudo);
    const archivos = await readdir(carpeta); for (const a of ['eventos.jsonl', 'reporte.json', 'ranking.csv', 'modelos.csv', 'llamadas.csv', 'serie-anual.csv', 'linea-de-tiempo.json']) assert.ok(archivos.includes(a), a);
  });
});

test('estado en vivo de la era: esquema v1 + campos aditivos, elecciones reveladas con nombres, el subtitulo se retira cada anio y el fin trae ranking y ganador; un fallo al escribir no detiene la partida', async () => {
  const escrituras = [];
  const participantes = bots('bot-era-militar', 'bot-era-economico');
  const partida = resolverPartida(CORTA);
  const vivo = crearEstadoVivoEra({ ruta: 'x.json', participantes, partida, escribir: async (ruta, valor) => { escrituras.push(structuredClone(valor)); } });
  const observador = { emitir: vivo.emitir, nombre: id => vivo.ids.get(id)?.nombre ?? id };
  await correr({ participantes, observador });
  await vivo.cerrar();
  const ult = escrituras.at(-1);
  assert.equal(ult.version, 1); assert.equal(ult.formato, 'era'); assert.equal(ult.fase, 'fin'); assert.equal(ult.fase_era, 'fin'); assert.ok(ult.ganador); assert.equal(ult.ranking.length, 2);
  for (const k of ['actualizado', 'fase', 'turno', 'turnos', 'tiempo_juego_s', 'activo', 'facciones', 'decision', 'ultimo_evento', 'ranking', 'ganador', 'anio', 'anio_muro', 'anio_limite', 'fase_era', 'etapa', 'muro', 'guerra', 'velocidad', 'llamada', 'pensando']) assert.ok(k in ult, k);
  assert.equal(ult.turnos, 90); assert.equal(ult.anio_muro, 60);
  const decidio = escrituras.filter(e => e.fase === 'decidio');
  assert.ok(decidio.length >= 16 && decidio.every(e => e.decision.texto && typeof e.decision.razon === 'string'));
  const e1 = decidio.find(e => e.llamada?.tipo === 'etapa1' && e.activo === 'f1');
  assert.match(e1.decision.texto, /^Elige Orco, mythril y sin bioma$/);
  const conElegido = escrituras.filter(e => e.facciones.some(f => f.elegido?.raza)).at(-1);
  assert.equal(conElegido.facciones[0].elegido.raza, 'Orco'); assert.ok(conElegido.facciones[0].elegido.rasgos.some(r => r.nombre === 'Puños de piedra'));
  assert.ok(conElegido.facciones[0].nombre && conElegido.facciones[0].color && 'ejercito' in conElegido.facciones[0] && 'edificios' in conElegido.facciones[0]);
  assert.ok(escrituras.filter(e => e.fase === 'turno').every(e => e.decision === null), 'cada anio se retira el subtitulo');
  assert.ok(escrituras.some(e => e.fase === 'pensando' && e.pensando.length === 2), 'los dos piensan a la vez');
  assert.ok(escrituras.some(e => e.fase_era === 'guerra' && e.muro.puesto === false && e.guerra === true && e.velocidad === 'x5'));
  assert.ok(escrituras.some(e => e.fase_era === 'desarrollo' && e.muro.puesto === true && e.velocidad === 'x40'));
  assert.ok(escrituras.every(e => e.facciones.length === 2));
  // un fallo al escribir no detiene la partida
  const malo = crearEstadoVivoEra({ ruta: 'x.json', participantes, partida, escribir: async () => { throw new Error('disco lleno'); } });
  const r = await correr({ participantes, observador: { emitir: malo.emitir } });
  assert.equal(r.completo, true); await malo.cerrar(); assert.ok(malo.fallos() > 0);
});

test('linea de tiempo: segundos reales desde «Listo para grabar»; lo previo queda con t_real_s nulo; incluye llamadas con su frase, muro, guerra y fin', async () => {
  let ahora = 1_000_000; const reloj = () => ahora;
  const linea = crearLineaTiempo({ ahora: reloj });
  const presentacion = { lecturaMs: 500, finMs: 0, dormir: async ms => { ahora += ms; }, preludio: async ({ listo }) => { ahora += 6000; listo(); ahora += 15000; } };
  const { linea: l } = await correr({ lineaTiempo: linea, presentacion, observador: { emitir: async () => { ahora += 250; } } });
  const previos = l.eventos.filter(e => e.t_real_s === null); assert.ok(previos.length >= 2 && previos.every(e => e.previo === true));
  const llamadas = l.eventos.filter(e => e.tipo === 'llamada');
  assert.equal(llamadas.length, 16); assert.ok(llamadas.every(e => e.frase && e.descripcion.includes(':') && e.t_real_s >= 15));
  assert.ok(llamadas[0].t_real_s >= 15, 'la primera llamada se muestra tras la cuenta atras de 15 s');
  const t = l.eventos.filter(e => e.t_real_s !== null).map(e => e.t_real_s); assert.deepEqual(t, [...t].sort((a, b) => a - b), 'orden cronologico');
  const doc = l.documento({ x: 1 }); assert.equal(doc.version, 1); assert.ok(doc.nota.includes('Listo para grabar'));
  assert.ok(l.eventos.at(-1).tipo === 'fin' && /^Gana /.test(l.eventos.at(-1).descripcion));
});

// ---------------------------------------------------------------- CLI y puente HTTP (servidor falso con la forma del puente)
test('CLI --formato=era: una partida, carpeta con eventos, reporte, CSV y linea de tiempo; rechaza combinaciones invalidas', async () => {
  await conCarpeta(async c => {
    const base = ['--formato=era', '--adaptador=simulado', '--semilla=7', '--partidas=1', '--anio-muro=60', '--anio-limite=90', '--intervenciones=20,35,50', '--intervenciones-guerra=3,15', '--anios-espera-rasgos=5', `--salida=${c}`];
    const r = await main(base);
    assert.equal(r.length, 1); assert.equal(r[0].formato, 'era'); assert.equal(r[0].rules_version, 'era-1.0'); assert.equal(r[0].completo, true);
    const linea = JSON.parse(await readFile(join(r[0].carpeta, 'linea-de-tiempo.json'), 'utf8'));
    assert.deepEqual(linea.velocidades, { desarrollo: 'x40', guerra: 'x5' }); assert.equal(linea.anio_muro, 60);
    const rep = JSON.parse(await readFile(join(r[0].carpeta, 'reporte.json'), 'utf8')); assert.equal(rep.formato, 'era');
  });
  const malo = async (args, codigo) => assert.rejects(() => main(['--formato=era', '--adaptador=simulado', ...args]), { codigo });
  await malo(['--partidas=2'], 'partidas_invalidas');
  await malo(['--reglas=real'], 'argumento_invalido');
  await malo(['--turnos=5'], 'argumento_invalido');
  await malo(['--manual'], 'argumento_invalido'); // --manual (un Enter por decisión, para comentar en vivo) exige --grabacion
  await malo(['--sin-camara'], 'argumento_invalido');
  await malo(['--asistido'], 'argumento_invalido'); // las opciones de respuestas guardadas solo valen con --respuestas
  await malo(['--respuestas=x', '--participantes=bot-era-militar,bot-era-economico'], 'argumento_invalido');
  await malo(['--tamano=gigante'], 'argumento_invalido');
  await malo(['--plantilla=rara'], 'argumento_invalido');
  await malo(['--participantes=bot-voraz,bot-pasivo'], 'participantes_invalidos');
  await malo(['--modelos=a/x,b/y'], 'pago_no_autorizado');
  await malo(['--anio-muro=600', '--anio-limite=500'], 'configuracion_era_invalida');
  await assert.rejects(() => main(['--adaptador=simulado', '--anio-muro=60']), { codigo: 'argumento_invalido' }); // opciones era sin --formato=era
  await assert.rejects(() => main(['--formato=otro']), { codigo: 'argumento_invalido' });
});

test('CLI en modo grabacion: cuenta atras tras generar el mundo, estado en vivo con el formato era y linea de tiempo con tiempos reales', async () => {
  await conCarpeta(async c => {
    const avisos = [], ruta = join(c, 'vivo', 'worldbox.json');
    const r = await main(['--formato=era', '--adaptador=simulado', '--semilla=7', '--partidas=1', '--anio-muro=60', '--anio-limite=90', '--intervenciones=20,35,50', '--intervenciones-guerra=3,15', '--anios-espera-rasgos=5', '--grabacion', '--cuenta=2', '--aviso-ms=0', '--lectura-ms=0', '--fin-ms=0', `--vivo=${ruta}`, `--salida=${c}`],
      { avisar: t => avisos.push(t), dormir: async () => {} });
    assert.equal(r[0].completo, true);
    assert.ok(avisos.some(t => /Listo para grabar/.test(t)) && avisos.some(t => /La partida empieza en 2/.test(t)));
    const vivo = JSON.parse(await readFile(ruta, 'utf8')); assert.equal(vivo.fase, 'fin'); assert.equal(vivo.formato, 'era'); assert.ok(vivo.ganador);
    const linea = JSON.parse(await readFile(join(r[0].carpeta, 'linea-de-tiempo.json'), 'utf8'));
    assert.ok(linea.eventos.some(e => e.tipo === 'llamada' && Number.isFinite(e.t_real_s)));
  });
});

async function servirPuenteEra(t, sim = {}) {
  const a = crearAdaptadorEraSimulado({ sim }), token = 'tok-era-prueba-0123456789abcdef0123456789';
  const peticiones = [];
  const server = http.createServer(async (req, res) => {
    const cuerpo = await new Promise(r => { let d = ''; req.on('data', x => { d += x; }); req.on('end', () => r(d ? JSON.parse(d) : {})); });
    const url = new URL(req.url, 'http://127.0.0.1');
    peticiones.push({ metodo: req.method, ruta: url.pathname, cuerpo });
    const enviar = (estado, x) => { res.statusCode = estado; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ protocolo: 1, ...x })); };
    if (req.headers['x-puente-token'] !== token) return enviar(401, { ok: false, error: { codigo: 'no_autorizado', mensaje: 'token' } });
    try {
      const k = `${req.method} ${url.pathname}`;
      if (k === 'GET /v1/info') return enviar(200, { ok: true, ...await a.info() });
      if (k === 'POST /v1/escenario/reiniciar') return enviar(200, { ok: true, ...await a.reiniciarEscenario(cuerpo) });
      if (k === 'POST /v1/avanzar') return enviar(200, { ok: true, ...await a.avanzar(cuerpo) });
      if (k === 'GET /v1/estado-terminal') return enviar(200, { ok: true, ...await a.estadoTerminal() });
      if (k === 'POST /v1/accion') return enviar(200, { ok: true, ...await a.ejecutar({ faccion: cuerpo.faccion, accion: cuerpo.accion, parametros: cuerpo.parametros }) });
      if (k === 'GET /v1/era/estado') return enviar(200, { ok: true, ...a.era._crudo.estado(Number(url.searchParams.get('desde') ?? 0)) });
      if (k === 'POST /v1/era/rasgos') return enviar(200, { ok: true, ...a.era._rasgosCrudo(cuerpo) });
      if (k === 'POST /v1/era/muro') return enviar(200, { ok: true, ...await a.era.muro(cuerpo) });
      if (k === 'POST /v1/era/velocidad') return enviar(200, { ok: true, ...await a.era.velocidad(cuerpo) });
      if (k === 'POST /v1/cerrar') return enviar(200, { ok: true, ...await a.cerrar() });
      return enviar(404, { ok: false, error: { codigo: 'no_soportado', mensaje: k } });
    } catch (e) { return enviar(e.codigo === 'solicitud_invalida' ? 400 : 500, { ok: false, error: { codigo: e.codigo ?? 'error_interno', mensaje: 'x' } }); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  return { url: `http://127.0.0.1:${server.address().port}/`, token, peticiones };
}

test('por HTTP (puente falso con la forma del real): la partida era completa usa las rutas /v1/era/*, el mismo orden y los mismos resultados que el simulado directo', async t => {
  const puente = await servirPuenteEra(t);
  const adaptador = crearAdaptadorHttp({ url: puente.url, token: puente.token });
  const http_ = await correr({ adaptador });
  assert.equal(http_.completo, true); assert.equal(http_.razon, 'limite_anios');
  const rutas = puente.peticiones.map(p => `${p.metodo} ${p.ruta}`);
  for (const r of ['GET /v1/info', 'POST /v1/escenario/reiniciar', 'GET /v1/era/estado', 'POST /v1/era/rasgos', 'POST /v1/era/muro', 'POST /v1/era/velocidad', 'POST /v1/avanzar', 'POST /v1/accion', 'POST /v1/cerrar']) assert.ok(rutas.includes(r), r);
  const muro = puente.peticiones.find(p => p.ruta === '/v1/era/muro'); assert.equal(muro.cuerpo.operacion, 'quitar');
  const reinicio = puente.peticiones.find(p => p.ruta === '/v1/escenario/reiniciar').cuerpo;
  assert.equal(reinicio.opciones.era.espejo, true); assert.equal(reinicio.opciones.velocidad, 'x40');
  assert.equal(puente.peticiones.find(p => p.ruta === '/v1/accion' && p.cuerpo.accion === 'declarar_guerra').cuerpo.parametros.objetivo, 'f2');
  const directo = await correr();
  assert.deepEqual(http_.fin.snapshot, directo.fin.snapshot, 'mismo resultado por HTTP y directo (el simulado es determinista)');
  assert.ok(!JSON.stringify(http_.eventos).includes(puente.token), 'el token nunca llega al log');
  const rasgos = puente.peticiones.filter(p => p.ruta === '/v1/era/rasgos'); assert.ok(rasgos.every(p => p.cuerpo.parcial === true && ['subespecie', 'clan', 'idioma', 'religion', 'cultura', 'reino'].includes(p.cuerpo.tipo)));
});

test('por HTTP: si el juego no encuentra sitio (error_interno) se vuelve a generar el mundo hasta intentosMundo y luego falla sin dejar partida', async t => {
  const sim = crearAdaptadorEraSimulado();
  let n = 0;
  const falla = { ...sim, reiniciarEscenario: async d => { n++; if (n < 3) { const { ErrorArena } = await import('../../worldbox/util.js'); throw new ErrorArena('error_interno'); } return sim.reiniciarEscenario(d); } };
  const r = await correr({ adaptador: falla }); assert.equal(r.completo, true); assert.equal(n, 3);
  n = -10;
  await assert.rejects(() => correr({ adaptador: falla }), { codigo: 'error_interno' });
});

test('el simulado es determinista: misma semilla y mismos bots dan el mismo estado final; la raza invalida o el bioma imposible se rechazan', async () => {
  const a = await correr(), b = await correr();
  assert.deepEqual(a.fin.snapshot, b.fin.snapshot); assert.deepEqual(a.fin.puntos, b.fin.puntos);
  const sim = crearAdaptadorEraSimulado();
  const base = { semilla: 1, tamano_mapa: 192, facciones: [{ id: 'f1', especie: 'human' }, { id: 'f2', especie: 'orc' }], opciones: { era: { espejo: true } } };
  await assert.rejects(() => sim.reiniciarEscenario({ ...base, facciones: [{ id: 'f1', especie: 'dragon' }, { id: 'f2' }] }), { codigo: 'solicitud_invalida' });
  await assert.rejects(() => sim.reiniciarEscenario({ ...base, opciones: { era: { espejo: true, biomas: { f1: 'biome_desert' } } } }), { codigo: 'error_interno' });
  await assert.rejects(() => sim.reiniciarEscenario({ ...base, opciones: { era: {} } }), { codigo: 'solicitud_invalida' });
  assert.equal(rasgoPorId('stonefists').tipo, 'clan'); assert.ok(PRESUPUESTO_PUNTOS.rasgo_extra > 0);
});

test('solo existen las acciones que el puente anuncia con EXACTAMENTE el esquema del reglamento; sin declarar_guerra verificada no hay partida', async () => {
  const sim = crearAdaptadorEraSimulado(), base = await sim.info();
  const cambia = (nombre, f) => ({ ...sim, info: async () => ({ ...base, acciones: base.acciones.map(a => a.nombre === nombre ? f(a) : a) }) });
  const bendecirAncha = cambia('bendecir', a => ({ ...a, parametros: { gotas: { tipo: 'entero', minimo: 1, maximo: 5 } } }));
  const f1 = guionado('f1', ctx => ctx.llamada.tipo === 'intervencion' && !ctx.correccion && ctx.llamada.indice === 1 && ctx.llamada.fase === 'desarrollo'
    ? { actions: [{ action: 'bendecir', parameters: { gotas: 1 } }], reasoning_summary: 'x' } : crearBotEra('bot-era-economico', 1)(ctx));
  const { decisiones } = await correr({ adaptador: bendecirAncha, participantes: [f1, normal('bot-era-militar', 'f2')] });
  assert.equal(decisiones.find(d => d.participant_id === 'f1' && d.llamada.tipo === 'intervencion' && d.intento === 0).errores[0].codigo, 'accion_no_permitida');
  const sinGuerra = { ...sim, info: async () => ({ ...base, acciones: base.acciones.filter(a => a.nombre !== 'declarar_guerra') }) };
  await assert.rejects(() => correr({ adaptador: sinGuerra }), { codigo: 'no_soportado' });
  const sinEra = { ...sim, info: async () => ({ ...base, capacidades: { ...base.capacidades, era: false } }) };
  await assert.rejects(() => correr({ adaptador: sinEra }), { codigo: 'no_soportado' });
});

test('estimar costo: reconstruye el prompt de cada llamada del log y calcula el costo con las tarifas dadas, sin llamar a ninguna API', async () => {
  const { eventos } = await correr({ adaptador: crearAdaptadorEraSimulado({ sim: { letalidad: 0.001 } }) });
  const e = estimarCostoEra(eventos, { modelo: { entrada: 0.1, salida: 0.5, cache: 0.01 }, salidas: [0, 2000], correcciones: 0.25 });
  assert.equal(e.llamadas, 8); assert.equal(e.llamadas_observadas, 8); assert.ok(e.entrada_total_tokens > 8 * 8000 && e.entrada_total_tokens < 8 * 14000, `entrada total ${e.entrada_total_tokens}`);
  assert.ok(e.entrada_cacheable_tokens > 0.7 * e.entrada_total_tokens);
  const [sinSalida, conSalida] = e.por_salida;
  assert.equal(sinSalida.costo_por_modelo, Math.round(e.entrada_total_tokens * 0.1 / 1e6 * 1.25 * 1e5) / 1e5);
  assert.ok(conSalida.costo_por_modelo > sinSalida.costo_por_modelo && conSalida.costo_por_modelo_con_cache < conSalida.costo_por_modelo);
  assert.equal(estimarCostoEra(eventos, { modelo: { entrada: 0, salida: 0 } }).por_salida[0].costo_por_modelo, 0);
});
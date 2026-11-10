import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, readFile, writeFile, cp, readdir, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../worldbox/correr.js';
import { correrEra } from '../../worldbox/era/orquestador-era.js';
import { crearAdaptadorEraSimulado } from '../../worldbox/era/adaptador-era-simulado.js';
import { crearBotEra } from '../../worldbox/era/bots-era.js';
import { auditarEra } from '../../worldbox/era/auditar-era.js';
import { partidaDesdeCli } from '../../worldbox/era/correr-era.js';
import { cargarAlmacen } from '../../worldbox/era/respuestas/almacen.js';
import { evaluarTexto, verificarRespuestas, informeTexto } from '../../worldbox/era/respuestas/verificar.js';
import { validarEtapa, validarIntervencion } from '../../worldbox/era/respuestas/validar-respuesta.js';
import { generarPrompts } from '../../worldbox/era/respuestas/prompts.js';
import { hash } from '../../worldbox/util.js';
import { construirSistemaEra } from '../../worldbox/era/prompt-era.js';
import { resolverPartida } from '../../worldbox/era/reglas-era.js';
import { main as verificarMain } from '../../../herramientas/worldbox-era-verificar.mjs';
import { main as promptsMain } from '../../../herramientas/worldbox-era-prompts.mjs';

const EJEMPLO = fileURLToPath(new URL('../../../docs/ejemplos/era/respuestas-ejemplo', import.meta.url));
const EJEMPLO_ERROR = fileURLToPath(new URL('../../../docs/ejemplos/era/respuestas-ejemplo-con-error', import.meta.url));
const CORTA = ['--anio-muro=60', '--anio-limite=90', '--intervenciones=20,35,50', '--intervenciones-guerra=1,3', '--anios-espera-rasgos=5'];
const BASE = ['--formato=era', '--adaptador=simulado', '--partidas=1', '--semilla=7', ...CORTA];
const CORTA_P = { anioMuro: 60, anioLimite: 90, aniosBorrador: 5, intervencionesDesarrollo: [20, 35, 50], intervencionesGuerra: [1, 3], aniosEsperaRasgos: 5 };
async function conCarpeta(fn) { const c = await mkdtemp(join(tmpdir(), 'worldbox-era-resp-')); try { await fn(c); } finally { await rm(c, { recursive: true, force: true }); } }
const jugar = (extra, deps = {}) => main([...BASE, ...extra], { avisar: () => {}, ...deps });
const leerJson = async ruta => JSON.parse(await readFile(ruta, 'utf8'));
const existe = async ruta => access(ruta).then(() => true, () => false);
const sinRuido = decisiones => decisiones.map(d => ({ p: d.participant_id, n: d.turn_number, i: d.intento, a: d.action_validated, e: d.errores.map(x => x.codigo) }));
const eventos = async carpeta => (await readFile(join(carpeta, 'eventos.jsonl'), 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l));
const RESP1 = (raza, mineral, bioma) => JSON.stringify({ actions: [{ action: 'elegir_inicio', parameters: { raza, mineral, bioma } }], reasoning_summary: 'x' });

test('revisión previa: el ejemplo pasa; el ejemplo con error se acepta por su corrección; sin ella se bloquea con el error exacto', async () => {
  const p = resolverPartida();
  const ok = verificarRespuestas({ almacen: await cargarAlmacen(EJEMPLO), partida: p });
  assert.equal(ok.ok, true); assert.equal(ok.errores, 0); assert.equal(ok.faltan, 0);
  assert.deepEqual(ok.participantes.f1.map(f => f.estado), ['ok', 'ok', 'ok', 'ok', 'sin_respuesta', 'sin_respuesta', 'ok', 'sin_respuesta']);
  const corr = verificarRespuestas({ almacen: await cargarAlmacen(EJEMPLO_ERROR), partida: p });
  assert.equal(corr.ok, true); assert.equal(corr.corregidas, 2);
  assert.deepEqual(corr.participantes.f2.slice(0, 3).map(f => f.estado), ['corregida', 'corregida', 'ok']);
  await conCarpeta(async c => {
    await cp(EJEMPLO_ERROR, c, { recursive: true });
    await rm(join(c, 'b', 'borrador.correccion.txt'));
    const mal = verificarRespuestas({ almacen: await cargarAlmacen(c), partida: p });
    assert.equal(mal.ok, false); assert.equal(mal.errores, 2);
    const texto = informeTexto(mal);
    assert.match(texto, /mineral_adamantine cuesta 4 \+ biome_celestial cuesta 1, suman 5 y el máximo es 4/);
    assert.match(texto, /«cast_shield» es un rasgo de la casilla «espiritu»/);
    assert.match(texto, /«stonefist» no es una opción válida\. ¿Quisiste decir «stonefists»\?/);
    assert.match(texto, /b\/borrador\.correccion\.txt/);
  });
});

test('mensajes accionables de las etapas: campo, valor, opciones válidas y sugerencias', () => {
  const v = (etapa, valor, o) => validarEtapa(etapa, valor, o);
  const mensajes = r => r.errores.map(e => e.mensaje).join(' | ');
  const e1 = (parametros, extra = {}) => ({ actions: [{ action: 'elegir_inicio', parameters: parametros }], reasoning_summary: 'x', ...extra });
  let r = v(1, e1({ raza: 'orcc', mineral: 'mineral_stone', bioma: 'ninguno' }));
  assert.equal(r.ok, false); assert.match(mensajes(r), /raza: «orcc» no es una opción válida\. ¿Quisiste decir «orc»\?/);
  r = v(1, e1({ raza: 'civ_beetle', mineral: 'mineral_stone', bioma: 'ninguno' })); assert.match(mensajes(r), /NO se ofrece en esta partida/);
  r = v(1, e1({ raza: 'human', mineral: 'mineral_stone', bioma: 'biome_desert' })); assert.match(mensajes(r), /solo puede fundar en/); assert.equal(r.errores[0].codigo, 'bioma_incompatible');
  r = v(1, e1({ raza: 'human', mineral: 'mineral_stone' })); assert.match(mensajes(r), /Falta el parámetro «bioma»/);
  r = v(1, e1({ raza: 'human', mineral: 'mineral_stone', bioma: 'ninguno', extra: 1 })); assert.match(mensajes(r), /Sobra el parámetro «extra»/);
  r = v(1, e1({ raza: 'human', mineral: 'mineral_stone', bioma: 'ninguno' }, { otro: 1 })); assert.match(mensajes(r), /Sobra el campo «otro»/);
  r = v(1, { actions: [{ action: 'elegir_rasgos_etapa2', parameters: {} }], reasoning_summary: 'x' }); assert.match(mensajes(r), /debe llamarse «elegir_inicio»/);
  r = v(1, { actions: [], reasoning_summary: 'x' }); assert.match(mensajes(r), /«actions» está vacío/);
  r = v(1, e1({ raza: 'human', mineral: 'mineral_stone', bioma: 'ninguno' }, { reasoning_summary: 'x'.repeat(241) })); assert.match(mensajes(r), /241 caracteres y el máximo es 240/);
  r = v(1, e1({ raza: 'human', mineral: 'mineral_stone', bioma: 'ninguno' })); assert.equal(r.ok, true); assert.deepEqual(r.eleccion, { raza: 'human', mineral: 'mineral_stone', bioma: null });
  const e2 = p => ({ actions: [{ action: 'elegir_rasgos_etapa2', parameters: { cognitivo: 'ninguno', mente: 'ninguno', espiritu: 'ninguno', fisico: 'ninguno', apariencia: 'ninguno', ...p } }], reasoning_summary: 'x' });
  r = v(2, e2({ fisico: 'stonefists', espiritu: 'gods_chosen' })); assert.equal(r.ok, false); assert.equal(r.errores[0].codigo, 'rasgo_fuerte_excedido'); assert.match(mensajes(r), /Deja solo uno/);
  r = v(2, e2({ mente: 'combat_instincts', fisico: 'bonebreakers', espiritu: 'magic_blood' })); assert.equal(r.errores[0].codigo, 'presupuesto_excedido'); assert.match(mensajes(r), /mente: combat_instincts \(5\); espiritu: magic_blood \(4\); fisico: bonebreakers \(5\)/);
  r = v(2, e2({ mente: 'roads' })); assert.match(mensajes(r), /«roads» es un rasgo de la casilla «arquitectura» \(etapa 3\), no de «mente»/);
  r = v(2, e2({ mente: 'blood_of_eons' })); assert.match(mensajes(r), /excluido del catálogo/);
  r = v(3, { actions: [{ action: 'elegir_rasgos_etapa3', parameters: { arquitectura: 'roads', plano: 'ninguno', edificios: 'hive_society', politica: 'ninguno', sucesion: 'ninguno', impuestos: 'ninguno' } }], reasoning_summary: 'x' });
  assert.equal(r.ok, false); assert.match(mensajes(r), /presupuesto de la etapa 3 excedido/i);
});

test('mensajes accionables de las intervenciones: fase, topes, puntos, objetivo, rasgo_extra', () => {
  const a = (...acciones) => ({ actions: acciones, reasoning_summary: 'x' });
  const m = r => r.errores.map(e => e.mensaje).join(' | ');
  let r = validarIntervencion('desarrollo', a({ action: 'maldecir', parameters: { objetivo: 'f2', gotas: 1 } }), undefined, { rivalId: 'f2' });
  assert.equal(r.ok, false); assert.match(m(r), /solo valen en la guerra/);
  r = validarIntervencion('guerra', a({ action: 'maldecir', parameters: { objetivo: 'f2', gotas: 1 } }), undefined, { rivalId: 'f2' }); assert.equal(r.ok, true);
  r = validarIntervencion('guerra', a({ action: 'maldecir', parameters: { objetivo: 'f1', gotas: 1 } }), undefined, { rivalId: 'f2' }); assert.match(m(r), /objetivo.*id de tu rival/);
  r = validarIntervencion('guerra', a({ action: 'maldecir', parameters: { objetivo: 'f2', gotas: 9 } }), undefined, { rivalId: 'f2' }); assert.match(m(r), /gotas vale 9 y debe estar entre 1 y 3/);
  r = validarIntervencion('guerra', a({ action: 'crear_unidades', parameters: { cantidad: '3' } })); assert.match(m(r), /debe ser un número entero/);
  r = validarIntervencion('desarrollo', a({ action: 'crear_unidades', parameters: { cantidad: 1 } }, { action: 'crear_unidades', parameters: { cantidad: 1 } }, { action: 'crear_unidades', parameters: { cantidad: 1 } })); assert.match(m(r), /no cabe en tus puntos de acción/);
  r = validarIntervencion('desarrollo', a({ action: 'crear_unidades', parameters: { cantidad: 5 } }), { usos: { crear_unidades: { veces: 2, acumulado: 8 } }, propios: [], reserva: 6 }); assert.match(m(r), /superaría el tope de toda la partida/);
  r = validarIntervencion('desarrollo', a({ action: 'esperar', parameters: {} }, { action: 'esperar', parameters: {} }, { action: 'esperar', parameters: {} }, { action: 'esperar', parameters: {} })); assert.match(m(r), /máximo es 3/);
  r = validarIntervencion('desarrollo', a({ action: 'rasgo_extra', parameters: { id: 'roads' } })); assert.match(m(r), /no sirve como rasgo_extra/);
  r = validarIntervencion('desarrollo', a({ action: 'rasgo_extra', parameters: { id: 'gaia_shield' } }), { usos: {}, propios: ['gaia_shield'], reserva: 6 }); assert.match(m(r), /ya tienes/);
  r = validarIntervencion('desarrollo', a({ action: 'rasgo_extra', parameters: { id: 'bonebreakers' } }), { usos: {}, propios: [], reserva: 2 }); assert.match(m(r), /no te alcanza la reserva/);
  r = validarIntervencion('desarrollo', a({ action: 'rasgo_extra', parameters: { id: 'exoskeleton' } }, { action: 'rasgo_extra', parameters: { id: 'long_lifespan' } })); assert.match(m(r), /solo puedes sumar 1 rasgo_extra por llamada/);
  r = validarIntervencion('desarrollo', a({ action: 'bailar', parameters: {} })); assert.match(m(r), /Acciones válidas ahora: /);
  r = validarIntervencion('desarrollo', a({ action: 'esperar', parameters: {} })); assert.equal(r.ok, true);
});

test('paridad con el motor: la revisión previa dice «válida» exactamente cuando el orquestador no encuentra errores', async () => {
  const casos = [RESP1('orc', 'mineral_stone', 'ninguno'), RESP1('orcc', 'mineral_stone', 'ninguno'), RESP1('human', 'mineral_adamantine', 'biome_celestial'), RESP1('human', 'mineral_gold', 'biome_desert'), RESP1('civ_turtle', 'mineral_gold', 'biome_swamp'),
    '{"actions":[],"reasoning_summary":"x"}', 'esto no es json', JSON.stringify({ actions: [{ action: 'elegir_inicio', parameters: { raza: 'orc', mineral: 'mineral_stone', bioma: 'ninguno' } }], reasoning_summary: 'x', extra: 1 })];
  for (let i = 0; i < casos.length; i += 2) {
    const par = [casos[i], casos[i + 1]];
    const participantes = ['f1', 'f2'].map((id, k) => ({ id, modelo: `guion-${id}`, decidir: async ctx => ctx.llamada.tipo === 'etapa1' ? par[k] : crearBotEra('bot-era-economico', 3)(ctx) }));
    const r = await correrEra({ adaptador: crearAdaptadorEraSimulado(), participantes, semilla: 7, partida: CORTA_P });
    ['f1', 'f2'].forEach((id, k) => {
      const d = r.eventos.find(e => e.tipo === 'decision' && e.participant_id === id && e.turn_number === 1 && e.intento === 0);
      const previa = evaluarTexto('etapa1', par[k]).validacion;
      assert.equal(previa.ok, d.errores.length === 0, `caso ${i + k}: ${par[k].slice(0, 70)}`);
      for (const c of ['bioma_incompatible', 'presupuesto_excedido']) assert.equal(previa.errores.some(e => e.codigo === c), d.errores.some(e => e.codigo === c), `${c} en el caso ${i + k}`);
    });
  }
});

test('partida con respuestas guardadas: evidencia v1, resumen público sin datos crudos, auditoría ok y flujo determinista', async () => {
  await conCarpeta(async c => {
    const r1 = (await jugar([`--respuestas=${EJEMPLO}`, `--salida=${c}`]))[0], r2 = (await jugar([`--respuestas=${EJEMPLO}`, `--salida=${c}`]))[0];
    assert.notEqual(r1.carpeta, r2.carpeta); assert.match(r1.carpeta, /[\\/]\d{8}-\d{4}-[0-9a-f]{8}-1$/);
    assert.equal(r1.completo, true); assert.equal(r1.consumo.costo, 0); assert.equal(r1.consumo.tokens, 0);
    assert.deepEqual(r1.ranking, r2.ranking);
    const [e1, e2] = [await eventos(r1.carpeta), await eventos(r2.carpeta)];
    assert.deepEqual(sinRuido(e1.filter(e => e.tipo === 'decision')), sinRuido(e2.filter(e => e.tipo === 'decision')));
    assert.deepEqual((await auditarEra(r1.carpeta)), { ok: true, problemas: [], eventos: e1.length });
    const conv = await leerJson(join(r1.carpeta, 'conversacion.json'));
    assert.equal(conv.version, 1); assert.equal(conv.tipo, 'conversacion-era'); assert.equal(conv.ejemplo, true); assert.equal(conv.origen, 'chat-manual');
    assert.equal(conv.versiones.rules_version, 'era-1.0'); assert.equal(conv.versiones.envoltura_manual, 'manual-1.0'); assert.equal(conv.versiones.sistema_hash, hash(construirSistemaEra(resolverPartida(CORTA_P))));
    assert.deepEqual(conv.participantes.map(p => [p.id, p.letra, p.modelo, p.canal, p.declarado_por]), [['f1', 'A', 'anthropic/claude-sonnet-5.5', 'chat', 'usuario'], ['f2', 'B', 'openai/gpt-6.1-sol', 'chat', 'usuario']]);
    assert.equal(conv.llamadas.length, 16); assert.equal(conv.escenario.resumen.anio_muro, 60); assert.equal(conv.escenario.resumen.plantilla, 'continent');
    const l = conv.llamadas.find(x => x.participante === 'f2' && x.clave === 'etapa2');
    assert.equal(l.intentos[0].fuente, 'archivo'); assert.equal(l.intentos[0].archivo, 'b/borrador.txt#etapa2'); assert.match(l.intentos[0].respuesta_cruda, /Mi borrador completo/);
    assert.match(l.intentos[0].prompt_usuario, /"tipo":"etapa2"/); assert.equal(l.intentos[0].validacion.ok, true); assert.equal(l.aplicado.jugada_por_defecto, false);
    const sin = conv.llamadas.find(x => x.participante === 'f1' && x.clave === 'desarrollo-2');
    assert.equal(sin.intentos[0].fuente, 'ninguna'); assert.deepEqual(sin.aplicado.acciones, [{ action: 'esperar', parameters: {} }]);
    assert.ok(conv.resultado.ranking.length === 2 && conv.elecciones_finales.f1.raza === 'dwarf');
    assert.equal(conv.archivos.sistema, 'prompts/sistema.txt'); assert.equal(await readFile(join(r1.carpeta, 'prompts', 'sistema.txt'), 'utf8'), construirSistemaEra(resolverPartida(CORTA_P)));
    // Resumen público: elecciones y frases; nada de prompts, texto crudo, rutas, hashes ni ids de facción.
    const res = await leerJson(join(r1.carpeta, 'resumen-publico.json')), crudo = JSON.stringify(res);
    assert.equal(res.revisado, false); assert.equal(res.tipo, 'resumen-publico-era'); assert.equal(res.participantes[0].elecciones.raza, 'Enano'); assert.ok(res.participantes[1].decisiones.some(d => /Ejemplo: elfos/.test(d.frase)));
    for (const prohibido of ['prompt_usuario', 'respuesta_cruda', 'borrador.txt', '"f1"', 'sha256', 'hash', 'C:\\']) assert.ok(!crudo.includes(prohibido), `el resumen público no debe incluir ${prohibido}`);
  });
});

test('repetir una partida desde su conversacion.json reproduce las mismas respuestas, correcciones incluidas', async () => {
  await conCarpeta(async c => {
    const orig = (await jugar([`--respuestas=${EJEMPLO_ERROR}`, `--salida=${c}`]))[0];
    const conv = await leerJson(join(orig.carpeta, 'conversacion.json'));
    const p = conv.llamadas.find(x => x.participante === 'f2' && x.clave === 'etapa1');
    assert.equal(p.intentos.length, 2); assert.equal(p.intentos[0].validacion.ok, false); assert.equal(p.intentos[1].validacion.ok, true); assert.equal(p.aplicado.correccion_usada, true); assert.equal(p.aplicado.jugada_por_defecto, false);
    assert.equal(p.intentos[0].validacion.errores[0].codigo, 'presupuesto_excedido');
    const rep = (await jugar([`--respuestas=${join(orig.carpeta, 'conversacion.json')}`, `--salida=${c}`]))[0];
    const conv2 = await leerJson(join(rep.carpeta, 'conversacion.json'));
    assert.equal(conv2.origen, 'repeticion'); assert.deepEqual(rep.ranking, orig.ranking);
    assert.deepEqual(sinRuido((await eventos(rep.carpeta)).filter(e => e.tipo === 'decision')), sinRuido((await eventos(orig.carpeta)).filter(e => e.tipo === 'decision')));
    assert.deepEqual(conv2.participantes.map(x => x.modelo), conv.participantes.map(x => x.modelo));
    assert.equal(conv2.llamadas.find(x => x.participante === 'f2' && x.clave === 'etapa1').intentos[0].fuente, 'conversacion');
    assert.deepEqual((await auditarEra(rep.carpeta)).problemas, []);
  });
});

test('una respuesta inválida sin corrección bloquea la partida (nada se crea); con --ignorar-invalidas se juega con la corrección única y la jugada por defecto', async () => {
  await conCarpeta(async c => {
    const mis = join(c, 'mis'), salida = join(c, 'salida');
    await cp(EJEMPLO, mis, { recursive: true });
    await writeFile(join(mis, 'a', 'etapa1.txt'), RESP1('dwarf', 'mineral_oro', 'ninguno'));
    const avisos = [];
    await assert.rejects(() => jugar([`--respuestas=${mis}`, `--salida=${salida}`], { avisar: t => avisos.push(t) }), { codigo: 'respuestas_invalidas' });
    assert.ok(avisos.join('\n').includes('mineral: «mineral_oro» no es una opción válida'));
    assert.equal(await existe(salida), false);
    const r = (await jugar([`--respuestas=${mis}`, '--ignorar-invalidas', `--salida=${salida}`]))[0];
    const ev = await eventos(r.carpeta), d = ev.filter(e => e.tipo === 'decision' && e.participant_id === 'f1' && e.turn_number === 1);
    assert.deepEqual(d.map(x => [x.intento, x.errores.length > 0]), [[0, true], [1, true]]);
    const fin = ev.at(-1); assert.ok(fin.infracciones.f1 >= 1); assert.equal(fin.elecciones.f1.raza, 'dwarf'); assert.equal(fin.elecciones.f1.mineral, 'mineral_stone');
    const conv = await leerJson(join(r.carpeta, 'conversacion.json'));
    assert.equal(conv.llamadas.find(x => x.participante === 'f1' && x.clave === 'etapa1').aplicado.jugada_por_defecto, true);
  });
});

test('faltar una etapa obligatoria bloquea; una respuesta de la etapa 3 con un rasgo fuerte repetido de la etapa 2 se detecta en la revisión previa', async () => {
  await conCarpeta(async c => {
    await cp(EJEMPLO, c, { recursive: true });
    await rm(join(c, 'a', 'etapa3.txt'));
    await assert.rejects(() => jugar([`--respuestas=${c}`, `--salida=${join(c, 's')}`]), { codigo: 'respuestas_invalidas' });
    // etapa 2 con un FUERTE (stonefists) y etapa 3 con otro FUERTE (hive_society cuesta 6 > 4: presupuesto) -> se ve el presupuesto; con un fuerte permitido sí pasa
    const informe = verificarRespuestas({ almacen: await cargarAlmacen(c), partida: resolverPartida() });
    assert.equal(informe.faltan, 1); assert.match(informeTexto(informe), /FALTA\s+etapa3 .*Es obligatoria/);
  });
});

test('modo asistido: pide cada intervención con el estado observado, espera el Enter y guarda la evidencia como chat-manual-asistido', async () => {
  await conCarpeta(async c => {
    const mis = join(c, 'mis'), entrada = new PassThrough(), mensajes = [];
    await cp(EJEMPLO, mis, { recursive: true });
    for (const f of ['a/desarrollo-1.txt', 'a/guerra-1.txt', 'b/desarrollo-1.txt', 'b/guerra-2.txt']) await rm(join(mis, f));
    const avisar = t => {
      mensajes.push(t);
      if (/^Llamada 4 de 8/m.test(t)) {
        (async () => {
          await writeFile(join(mis, 'a', 'desarrollo-1.txt'), 'Mi decisión:\n```json\n{"actions":[{"action":"crear_unidades","parameters":{"cantidad":2}}],"reasoning_summary":"Asistido: dos más."}\n```');
          await writeFile(join(mis, 'b', 'desarrollo-1.txt'), '{"actions":[{"action":"bendecir","parameters":{"gotas":1}}],"reasoning_summary":"Asistido: bendición."}');
          entrada.write('\n');
        })();
      } else if (/^Llamada \d/m.test(t)) setImmediate(() => entrada.write('\n'));
      else if (/Falta la respuesta de/.test(t)) setImmediate(() => entrada.write('s\n'));
    };
    const r = (await jugar([`--respuestas=${mis}`, '--asistido', `--salida=${join(c, 's')}`], { entrada, avisar, esperarMs: 5 }))[0];
    assert.equal(r.completo, true);
    const texto = mensajes.join('\n');
    assert.match(texto, /Llamada 4 de 8: Intervención 1 de 3 \(desarrollo\) \(año 20\)/); assert.match(texto, /_prompts[\\/]desarrollo-1-A\.txt/); assert.match(texto, /Pulsa Enter cuando estén guardadas/);
    assert.match(texto, /Llamada 7 de 8: Intervención 1 de 2 \(guerra\)/);
    const p = await readFile(join(mis, '_prompts', 'desarrollo-1-A.txt'), 'utf8');
    assert.match(p, /^MENSAJE DE ESTA LLAMADA \(JSON\):/); assert.match(p, /"tipo":"intervencion"/); assert.match(p, /"observation":\{/); assert.ok(!p.includes('prompt_version='), 'sin texto de sistema: ese chat ya lo recibió con el borrador');
    const conv = await leerJson(join(r.carpeta, 'conversacion.json'));
    assert.equal(conv.origen, 'chat-manual-asistido');
    const l = conv.llamadas.find(x => x.participante === 'f1' && x.clave === 'desarrollo-1');
    assert.equal(l.intentos[0].fuente, 'asistido'); assert.equal(l.intentos[0].archivo, 'a/desarrollo-1.txt'); assert.equal(l.aplicado.acciones[0].action, 'crear_unidades'); assert.equal(l.aplicado.razon, 'Asistido: dos más.');
    assert.equal(conv.llamadas.find(x => x.participante === 'f1' && x.clave === 'guerra-1').intentos[0].fuente, 'ninguna');
    // Lo capturado queda en la carpeta: sirve para repetir la partida sin preguntar nada.
    const sin = (await jugar([`--respuestas=${mis}`, `--salida=${join(c, 's')}`]))[0];
    assert.deepEqual(sin.ranking, r.ranking);
  });
});

test('modo asistido: una respuesta inválida pide la corrección (con el error en español) y la aplica', async () => {
  await conCarpeta(async c => {
    const mis = join(c, 'mis'), entrada = new PassThrough(), mensajes = [];
    await cp(EJEMPLO, mis, { recursive: true });
    for (const f of ['a/desarrollo-1.txt', 'a/guerra-1.txt', 'b/desarrollo-1.txt', 'b/guerra-2.txt']) await rm(join(mis, f));
    let ronda = 0;
    const avisar = t => {
      mensajes.push(t);
      if (/^Llamada 4 de 8: .*CORRECCIÓN/m.test(t)) {
        (async () => { await writeFile(join(mis, 'a', 'desarrollo-1.correccion.txt'), '{"actions":[{"action":"esperar","parameters":{}}],"reasoning_summary":"Corregido."}'); entrada.write('\n'); })();
      } else if (/^Llamada 4 de 8/m.test(t) && ronda++ === 0) {
        (async () => { await writeFile(join(mis, 'a', 'desarrollo-1.txt'), '{"actions":[{"action":"maldecir","parameters":{"objetivo":"f2","gotas":1}}],"reasoning_summary":"Mal: aún es desarrollo."}'); entrada.write('\n'); })();
      } else if (/^Llamada \d/m.test(t)) setImmediate(() => entrada.write('\n'));
      else if (/Falta la respuesta de/.test(t)) setImmediate(() => entrada.write('s\n'));
    };
    const r = (await jugar([`--respuestas=${mis}`, '--asistido', `--salida=${join(c, 's')}`], { entrada, avisar, esperarMs: 5 }))[0];
    const corr = await readFile(join(mis, '_prompts', 'desarrollo-1-correccion-A.txt'), 'utf8');
    assert.match(corr, /TU RESPUESTA ANTERIOR FUE INVÁLIDA/); assert.match(corr, /solo valen en la guerra/);
    const conv = await leerJson(join(r.carpeta, 'conversacion.json'));
    const l = conv.llamadas.find(x => x.participante === 'f1' && x.clave === 'desarrollo-1');
    assert.equal(l.intentos.length, 2); assert.equal(l.intentos[1].fuente, 'asistido'); assert.equal(l.aplicado.correccion_usada, true); assert.equal(l.aplicado.razon, 'Corregido.');
  });
});

test('generador de prompts: el texto de sistema coincide con el del motor, el manifiesto lleva hashes y la partida avisa si no coincide', async () => {
  const p = resolverPartida(), { archivos, manifiesto } = generarPrompts({ partida: p });
  assert.equal(archivos['sistema.txt'], construirSistemaEra(p)); assert.equal(manifiesto.sistema_hash, hash(construirSistemaEra(p)));
  assert.ok(archivos['1-borrador-completo.txt'].startsWith(archivos['sistema.txt'])); assert.match(archivos['1-borrador-completo.txt'], /BORRADOR COMPLETO \(envoltura manual-1\.0\)/);
  assert.match(archivos['1-borrador-completo.txt'], /"etapa1":\{"actions"/); assert.match(archivos['1-borrador-completo.txt'], /"tipo":"etapa3"/);
  assert.ok(manifiesto.archivos['sistema.txt'].tokens_estimados > 9000 && manifiesto.archivos['sistema.txt'].tokens_estimados < 14000);
  await conCarpeta(async c => {
    const salidas = [];
    assert.equal(await promptsMain([`--salida=${join(c, 'prompts')}`], t => salidas.push(t)), 0);
    assert.deepEqual((await readdir(join(c, 'prompts'))).sort(), ['1-borrador-completo.txt', '2-solo-etapa1.txt', 'manifiesto.json', 'sistema.txt']);
    const mis = join(c, 'mis'); await cp(EJEMPLO, mis, { recursive: true });
    assert.equal(await promptsMain(['--etapa=2', '--participante=a', `--respuestas=${mis}`, `--salida=${join(c, 'prompts')}`], t => salidas.push(t)), 0);
    const e2 = await readFile(join(c, 'prompts', '2-etapa2-a.txt'), 'utf8'); assert.match(e2, /"raza":"dwarf","mineral":"mineral_gold","bioma":"biome_rocklands"/);
    assert.equal(await promptsMain(['--etapa=3', '--participante=a', `--respuestas=${join(c, 'nada')}`, `--salida=${join(c, 'prompts')}`], t => salidas.push(t)).catch(() => 2), 2);
    // La partida compara el hash del manifiesto con su propio texto de sistema y avisa si cambió el calendario.
    await cp(join(c, 'prompts'), join(mis, 'prompts'), { recursive: true });
    const avisos = [];
    await jugar([`--respuestas=${mis}`, `--salida=${join(c, 's')}`], { avisar: t => avisos.push(t) });
    assert.ok(avisos.join('\n').includes('NO es el de esta partida'), 'la partida corta (muro 60) no usa el texto de sistema del manifiesto por omisión');
    const conv = await leerJson(join(c, 's', (await readdir(join(c, 's')))[0], 'conversacion.json'));
    assert.equal(conv.manifiesto_prompts.coincide_con_la_partida, false); assert.equal(conv.manifiesto_prompts.envoltura, 'manual-1.0');
  });
});

test('herramienta de revisión previa: código de salida y salida en JSON', async () => {
  const salidas = [];
  assert.equal(await verificarMain([`--respuestas=${EJEMPLO}`], t => salidas.push(t)), 0); assert.match(salidas[0], /Todo en orden/);
  assert.equal(await verificarMain([`--respuestas=${EJEMPLO_ERROR}`, '--json'], t => salidas.push(t)), 0); assert.equal(JSON.parse(salidas[1]).corregidas, 2);
  await conCarpeta(async c => {
    await cp(EJEMPLO_ERROR, c, { recursive: true }); await rm(join(c, 'b', 'borrador.correccion.txt'));
    assert.equal(await verificarMain([`--respuestas=${c}`], t => salidas.push(t)), 1);
  });
  assert.equal(await verificarMain([], t => salidas.push(t)), 2);
});

test('escenario por CLI: tamaño, plantilla y mapa guardado llegan al puente; valores inválidos se rechazan', async () => {
  const p = partidaDesdeCli({ tamano: 'large', plantilla: 'pancake', 'mapa-guardado': 'simetrico-prueba' });
  assert.equal(p.tamanoMapa, 320); assert.equal(p.plantilla, 'pancake'); assert.equal(p.mapaGuardado, 'simetrico-prueba');
  assert.equal(partidaDesdeCli({ tamano: 'tiny' }).tamanoMapa, 128); assert.equal(partidaDesdeCli({ mapa: '256' }).tamanoMapa, 256); assert.equal(partidaDesdeCli({}).tamanoMapa, 192);
  for (const o of [{ tamano: 'gigante' }, { tamano: 'small', mapa: '192' }, { plantilla: 'rara' }, { 'mapa-guardado': '../x' }]) assert.throws(() => partidaDesdeCli(o), { codigo: 'argumento_invalido' });
  const sim = crearAdaptadorEraSimulado(), pedidos = [];
  const envuelto = { ...sim, era: sim.era, reiniciarEscenario: async d => { pedidos.push(d); return sim.reiniciarEscenario(d); } };
  const participantes = ['bot-era-militar', 'bot-era-economico'].map((m, i) => ({ id: `f${i + 1}`, modelo: m, decidir: crearBotEra(m, 1 + i) }));
  await correrEra({ adaptador: envuelto, participantes, semilla: 7, partida: { ...CORTA_P, tamanoMapa: 320, plantilla: 'pancake', mapaGuardado: 'slot3', muroAncho: 8 } });
  assert.equal(pedidos[0].tamano_mapa, 320); assert.equal(pedidos[0].opciones.plantilla, 'pancake'); assert.equal(pedidos[0].opciones.mapa, 'slot3'); assert.deepEqual(pedidos[0].opciones.era.muro, { ancho: 8 });
  const sinMapa = [];
  await correrEra({ adaptador: { ...sim, era: sim.era, reiniciarEscenario: async d => { sinMapa.push(d); return sim.reiniciarEscenario(d); } }, participantes, semilla: 7, partida: CORTA_P });
  assert.ok(!('mapa' in sinMapa[0].opciones));
});

test('presentación: --sin-camara no mueve la cámara, --interfaz-visible no la oculta y --manual espera un Enter por decisión (y por la caída del muro)', async () => {
  await conCarpeta(async c => {
    const entrada = new PassThrough(), avisos = [];
    const base = ['--grabacion', '--cuenta=0', '--aviso-ms=0', '--lectura-ms=0', '--fin-ms=0', `--vivo=${join(c, 'vivo.json')}`];
    const avisar = t => { avisos.push(t); if (/Pulsa Enter/.test(t)) setImmediate(() => entrada.write('\n')); };
    const r = (await jugar([...base, '--manual', '--sin-camara', '--interfaz-visible', `--salida=${join(c, 's')}`], { entrada, avisar, dormir: async () => {} }))[0];
    assert.equal(r.completo, true);
    assert.equal(avisos.filter(t => /Pulsa Enter/.test(t)).length, 17, '16 decisiones y la caída del muro');
    assert.ok(avisos.some(t => /Llamada 1 de 8, año 1 - .*Elige/.test(t)) && avisos.some(t => /Cae el muro/.test(t)));
    // Con una cámara e interfaz espía: --sin-camara y --interfaz-visible no producen llamadas; sin ellas sí.
    const espiar = async presentacion => {
      const sim = crearAdaptadorEraSimulado(), llamadas = [];
      const ad = { ...sim, era: sim.era, async camara(d) { llamadas.push(['camara', d]); return sim.camara(d); }, async interfaz(d) { llamadas.push(['interfaz', d]); return sim.interfaz(d); } };
      const informacion = sim.info.bind(sim);
      ad.info = async () => { const i = await informacion(); return { ...i, capacidades: { ...i.capacidades, camara: true, interfaz: true } }; };
      const participantes = ['bot-era-militar', 'bot-era-economico'].map((m, i) => ({ id: `f${i + 1}`, modelo: m, decidir: crearBotEra(m, 1 + i) }));
      await correrEra({ adaptador: ad, participantes, semilla: 7, partida: CORTA_P, presentacion: { lecturaMs: 0, finMs: 0, dormir: async () => {}, pausaInterfazMs: 0, ...presentacion } });
      return llamadas;
    };
    const libre = await espiar({ interfazVisible: true });
    assert.deepEqual(libre.filter(([k, d]) => k === 'camara' && !d.liberar), [], 'solo se suelta la cámara al final; nunca se mueve');
    assert.ok(libre.filter(([k, d]) => k === 'interfaz' && d.visible === false).length === 0, 'la interfaz nunca se oculta');
    const normal = await espiar({ zooms: { cerca: 60, medio: 110, lejos: 211 } });
    assert.ok(normal.some(([k]) => k === 'camara')); assert.ok(normal.some(([k, d]) => k === 'interfaz' && d.visible === false));
  });
});

test('herramienta «solo mirar el mapa»: crea el mundo con los parámetros, lee etapa 1 de las respuestas, mide y suelta el juego', async () => {
  const { main: mundo } = await import('../../../herramientas/worldbox-era-mundo.mjs');
  const salidas = [], pedidos = [], sim = crearAdaptadorEraSimulado();
  const espia = { ...sim, era: sim.era, info: sim.info.bind(sim), reiniciarEscenario: async d => { pedidos.push(d); return sim.reiniciarEscenario(d); }, cerrar: async () => { pedidos.push('cerrado'); return sim.cerrar(); } };
  const c = await mundo(['--tamano=huge', '--plantilla=pancake', '--ancho-muro=0', '--anios=3', '--sin-esperar', `--respuestas=${EJEMPLO}`], { salida: t => salidas.push(t), adaptador: espia });
  assert.equal(c, 0);
  assert.equal(pedidos[0].tamano_mapa, 384); assert.equal(pedidos[0].opciones.plantilla, 'pancake'); assert.ok(!('muro' in pedidos[0].opciones.era));
  assert.deepEqual(pedidos[0].facciones.map(f => f.especie), ['dwarf', 'elf']); assert.deepEqual(pedidos[0].opciones.era.biomas, { f1: 'biome_rocklands', f2: 'biome_enchanted' });
  assert.equal(pedidos.at(-1), 'cerrado'); assert.ok(salidas.some(t => /Avanzados 3 años/.test(t)));
  const con = []; const sim2 = crearAdaptadorEraSimulado();
  await mundo(['--sin-esperar'], { salida: () => {}, adaptador: { ...sim2, era: sim2.era, reiniciarEscenario: async d => { con.push(d); return sim2.reiniciarEscenario(d); } } });
  assert.deepEqual(con[0].opciones.era.muro, { ancho: 4 });
});

test('muro de ancho 0 (sin muro): la partida se juega y la caída del muro solo declara la guerra', async () => {
  const sim = crearAdaptadorEraSimulado(), pedidos = [];
  const participantes = ['bot-era-militar', 'bot-era-economico'].map((m, i) => ({ id: `f${i + 1}`, modelo: m, decidir: crearBotEra(m, 1 + i) }));
  const r = await correrEra({ adaptador: { ...sim, era: sim.era, reiniciarEscenario: async d => { pedidos.push(d); return sim.reiniciarEscenario(d); } }, participantes, semilla: 7, partida: { ...CORTA_P, muroAncho: 0 } });
  assert.ok(!('muro' in pedidos[0].opciones.era)); assert.equal(r.completo, true);
  assert.ok(r.eventos.some(e => e.tipo === 'guerra'));
});

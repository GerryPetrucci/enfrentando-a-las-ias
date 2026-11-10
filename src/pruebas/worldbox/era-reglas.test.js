import test from 'node:test';
import assert from 'node:assert/strict';
import { validarAccion } from '../../worldbox/contrato-acciones.js';
import { CATALOGO_ERA, PESOS_ERA, PRESUPUESTO_PUNTOS, INTERVENCION, NINGUNO, PERFIL_ERA, RULES_VERSION_ERA, PROMPT_VERSION_ERA, accionesIntervencion, anioDe, biomaCompatible, biomasValidosPara, calendarioEra, clasificarEra,
  eleccionPorDefecto, esquemaEtapa, evaluarEleccion, evaluarRasgoExtra, nombreAccionEtapa, puntuarEra, rasgoPorId, rasgosOfrecidos, razasOfrecidas, reglasEtapa, resolverPartida, slotsDeEtapa, totalLlamadas, validarPartida } from '../../worldbox/era/reglas-era.js';
import { construirSistemaEra, construirPromptEra } from '../../worldbox/era/prompt-era.js';
import { hash } from '../../worldbox/util.js';

const P = resolverPartida();

test('versiones del reglamento era: rules_version y prompt_version propios, sin tocar auge-real-1.1.0', () => {
  assert.equal(RULES_VERSION_ERA, 'era-1.0'); assert.equal(PROMPT_VERSION_ERA, 'era-1.0');
  assert.equal(PERFIL_ERA.rules_version, 'era-1.0');
});

test('catalogo: 39 razas, 21 biomas, 8 minerales, ids unicos y casillas validas; todo lo ofrecido tiene tipo, slot, costo entero y efecto escrito', () => {
  assert.equal(CATALOGO_ERA.razas.length, 39); assert.equal(CATALOGO_ERA.biomas.length, 21); assert.equal(CATALOGO_ERA.minerales.length, 8);
  const ids = CATALOGO_ERA.rasgos.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
  const slots = new Set(CATALOGO_ERA.slots.map(s => s.id));
  for (const r of CATALOGO_ERA.rasgos) {
    assert.ok(slots.has(r.slot), r.id); assert.ok(['reino', 'cultura', 'idioma', 'clan', 'subespecie', 'religion'].includes(r.tipo), r.id);
    assert.ok(Number.isInteger(r.costo) && r.costo >= 0, r.id); assert.ok(r.efecto_es.length > 5 && r.confianza && r.recomendacion, r.id);
    assert.ok(['medido', 'declarado', 'conducta', 'cosmetico'].includes(r.clase), r.id);
    assert.ok(r.opuestos.every(o => ids.includes(o)), `opuestos de ${r.id}`);
  }
  assert.equal(CATALOGO_ERA.slots.filter(s => s.etapa === 2).length, 5); assert.equal(CATALOGO_ERA.slots.filter(s => s.etapa === 3).length, 6);
});

test('catalogo: solo se ofrecen rasgos con efecto medido o de sabor etiquetado; los absurdos o letales estan excluidos y documentados', () => {
  for (const id of ['blood_of_eons', 'eternal_text', 'endurance_of_titans', 'foolish_glyphs', 'shattered_crown']) {
    assert.equal(rasgoPorId(id), undefined, `${id} no se ofrece`);
    assert.ok(CATALOGO_ERA.excluidos.some(x => x.id === id && x.motivo), `${id} figura en excluidos con su motivo`);
  }
  for (const r of rasgosOfrecidos()) {
    if (r.clase === 'cosmetico') assert.equal(r.costo, 0, r.id);
    if (r.clase === 'conducta') assert.equal(r.costo, 1, r.id);
    if (r.clase === 'medido' || r.clase === 'declarado') assert.ok(r.costo >= 1, r.id);
  }
  assert.equal(rasgosOfrecidos().filter(r => r.clase === 'medido').length >= 20, true, 'los 25 medidos de E2 menos los excluidos');
  assert.ok(rasgosOfrecidos().filter(r => r.clase === 'cosmetico' || r.clase === 'conducta').length >= 20, 'unos pocos de sabor, etiquetados');
});

test('compatibilidad raza-bioma: 15 biomas seguros para todas; los otros 6 solo para las razas de la tabla de E2', () => {
  assert.equal(CATALOGO_ERA.compatibilidad.biomas_seguros.length, 15);
  assert.deepEqual(biomasValidosPara('civ_scorpion').filter(b => !CATALOGO_ERA.compatibilidad.biomas_seguros.includes(b)), ['biome_desert']);
  assert.ok(biomaCompatible('civ_seal', 'biome_swamp') && biomaCompatible('civ_seal', 'biome_corrupted'));
  assert.ok(!biomaCompatible('human', 'biome_desert') && !biomaCompatible('human', 'biome_swamp') && biomaCompatible('human', 'biome_celestial'));
  assert.deepEqual(CATALOGO_ERA.compatibilidad.excepciones.civ_crystal_golem.sort(), ['biome_infernal', 'biome_permafrost']);
});

test('etapa 1: el esquema exige las tres claves; raza, mineral y bioma fuera de lista se rechazan; el bioma incompatible y el presupuesto se detectan', () => {
  const regla = reglasEtapa(1);
  const v = p => validarAccion({ action: 'elegir_inicio', parameters: p }, { acciones: regla, puntos: 0 });
  assert.ok(v({ raza: 'human', mineral: 'mineral_gold', bioma: NINGUNO }).ok);
  assert.equal(v({ raza: 'dragon', mineral: 'mineral_gold', bioma: NINGUNO }).error, 'parametros_invalidos');
  assert.equal(v({ raza: 'human', mineral: 'mineral_oro', bioma: NINGUNO }).error, 'parametros_invalidos');
  assert.equal(v({ raza: 'human', mineral: 'mineral_gold' }).error, 'parametros_invalidos', 'falta bioma');
  assert.equal(v({ raza: 'human', mineral: 'mineral_gold', bioma: NINGUNO, extra: 1 }).error, 'parametros_invalidos');
  const inc = evaluarEleccion(1, { raza: 'human', mineral: 'mineral_gold', bioma: 'biome_desert' });
  assert.equal(inc.ok, false); assert.equal(inc.errores[0].codigo, 'bioma_incompatible'); assert.match(inc.errores[0].detalle, /biome_grass/);
  assert.ok(evaluarEleccion(1, { raza: 'civ_scorpion', mineral: 'mineral_gold', bioma: 'biome_desert' }).ok);
  assert.equal(PRESUPUESTO_PUNTOS.etapa1, 4);
  const caro = evaluarEleccion(1, { raza: 'human', mineral: 'mineral_adamantine', bioma: 'biome_celestial' });
  assert.equal(caro.costo, 5); assert.equal(caro.errores[0].codigo, 'presupuesto_excedido');
  assert.ok(evaluarEleccion(1, { raza: 'orc', mineral: 'mineral_mythril', bioma: 'biome_celestial' }).ok, 'mythril 3 + celestial 1 = 4');
  assert.ok(evaluarEleccion(1, { raza: 'orc', mineral: 'mineral_adamantine', bioma: NINGUNO }).ok);
});

test('etapas 2 y 3: un rasgo por casilla desde su lista, presupuesto por etapa, renunciar (ninguno) ahorra puntos', () => {
  const regla = reglasEtapa(2), nombre = nombreAccionEtapa(2);
  assert.equal(nombre, 'elegir_rasgos_etapa2');
  const vacia = Object.fromEntries(slotsDeEtapa(2).map(s => [s.id, NINGUNO]));
  const v = p => validarAccion({ action: nombre, parameters: { ...vacia, ...p } }, { acciones: regla, puntos: 0 });
  assert.ok(v({}).ok); assert.equal(evaluarEleccion(2, vacia).costo, 0);
  assert.equal(v({ fisico: 'iron_will' }).error, 'parametros_invalidos', 'un rasgo en una casilla que no es la suya');
  assert.equal(v({ mente: 'blood_of_eons' }).error, 'parametros_invalidos', 'los excluidos no existen');
  const ok = evaluarEleccion(2, { ...vacia, fisico: 'stonefists', mente: 'iron_will' });
  assert.equal(ok.ok, true); assert.equal(ok.costo, rasgoPorId('stonefists').costo + rasgoPorId('iron_will').costo);
  const exceso = evaluarEleccion(2, { ...vacia, fisico: 'high_fecundity', mente: 'combat_instincts' });
  assert.equal(exceso.ok, false); assert.equal(exceso.errores[0].codigo, 'presupuesto_excedido'); assert.ok(exceso.costo > PRESUPUESTO_PUNTOS.etapa2);
  assert.equal(Object.keys(esquemaEtapa(3)).join(), 'arquitectura,plano,edificios,politica,sucesion,impuestos');
  assert.ok(evaluarEleccion(3, { arquitectura: 'roads', plano: 'city_layout_rings', edificios: NINGUNO, politica: 'expansionists', sucesion: NINGUNO, impuestos: 'tax_rate_local_low' }).ok);
  assert.equal(evaluarEleccion(3, { arquitectura: 'roads', plano: 'city_layout_rings', edificios: 'tower_lovers', politica: 'expansionists', sucesion: 'golden_rule', impuestos: 'tax_rate_local_low' }).errores[0].codigo, 'presupuesto_excedido');
});

test('jugada por defecto: determinista; recorta desde la ultima casilla hasta caber; etapa 1 conserva lo valido', () => {
  assert.deepEqual(eleccionPorDefecto(1, null), { raza: 'human', mineral: 'mineral_stone', bioma: null });
  assert.deepEqual(eleccionPorDefecto(1, { raza: 'orc', mineral: 'mineral_mythril', bioma: 'biome_desert' }), { raza: 'orc', mineral: 'mineral_mythril', bioma: null }, 'bioma incompatible se descarta');
  assert.deepEqual(eleccionPorDefecto(1, { raza: 'human', mineral: 'mineral_adamantine', bioma: 'biome_celestial' }), { raza: 'human', mineral: 'mineral_adamantine', bioma: null }, 'sin presupuesto se quita el bioma');
  const vacia = Object.fromEntries(slotsDeEtapa(2).map(s => [s.id, NINGUNO]));
  const r = eleccionPorDefecto(2, { ...vacia, cognitivo: 'gift_of_life', mente: 'combat_instincts', fisico: 'high_fecundity' });
  assert.deepEqual(r.rasgos, { cognitivo: 'gift_of_life', mente: 'combat_instincts' }, 'el fisico (la casilla de mas abajo) se descarta hasta cumplir 10');
  assert.ok(evaluarEleccion(2, { ...vacia, ...r.rasgos }).ok);
});

test('rasgo_extra: solo medidos o declarados, sin repetir ni chocar con opuestos y dentro de la reserva', () => {
  const ctx = { propios: [], reserva: PRESUPUESTO_PUNTOS.rasgo_extra };
  assert.equal(evaluarRasgoExtra('stonefists', ctx), null);
  assert.equal(evaluarRasgoExtra('phenotype_skin_magical', ctx), 'rasgo_no_extra');
  assert.equal(evaluarRasgoExtra('roads', ctx), 'rasgo_no_extra');
  assert.equal(evaluarRasgoExtra('no_existe', ctx), 'rasgo_no_ofrecido');
  assert.equal(evaluarRasgoExtra('stonefists', { ...ctx, propios: ['stonefists'] }), 'ya_presente');
  assert.equal(evaluarRasgoExtra('tax_rate_local_high', { ...ctx, propios: ['tax_rate_local_low'] }), 'rasgo_opuesto');
  assert.equal(evaluarRasgoExtra('blood_pact', ctx), 'rasgo_no_extra', 'E3: efecto de sabor, no se compra como extra');
  assert.equal(evaluarRasgoExtra('high_fecundity', { ...ctx, reserva: 2 }), 'reserva_insuficiente');
});

test('intervenciones: el desarrollo no incluye maldecir ni incendiar; la guerra si; nada de declarar_guerra ni pedir_paz; esquemas identicos al reglamento auge', () => {
  const dev = accionesIntervencion('desarrollo').map(a => a.nombre), guerra = accionesIntervencion('guerra').map(a => a.nombre);
  assert.deepEqual(dev, ['esperar', 'crear_unidades', 'donar_recursos', 'bendecir', 'rasgo_extra']);
  assert.deepEqual(guerra, ['esperar', 'crear_unidades', 'donar_recursos', 'bendecir', 'maldecir', 'incendiar', 'rasgo_extra']);
  assert.ok(!dev.includes('declarar_guerra') && !guerra.includes('pedir_paz'));
  assert.equal(INTERVENCION.puntosAccion, 4); assert.equal(INTERVENCION.maxAcciones, 3);
  const cu = accionesIntervencion('desarrollo').find(a => a.nombre === 'crear_unidades');
  assert.equal(cu.cooldown, 0); assert.equal(cu.puntos, 2); assert.equal(cu.acumulado.maximo, 10);
  assert.equal(accionesIntervencion('desarrollo', { anunciadas: new Set(['bendecir']) }).map(a => a.nombre).join(), 'esperar,bendecir,rasgo_extra', 'solo viaja al juego lo que el puente anuncia');
});

test('puntaje del desempate: cuotas que suman 100; la eliminada puntua 0; las infracciones restan 1; el unico superviviente gana aunque puntue menos; los empates comparten puesto', () => {
  const a = { id: 'f1', vivo: true, poblacion: 300, ciudades: 3, territorio: 60, edificios: 200, ejercito: 50 };
  const b = { id: 'f2', vivo: true, poblacion: 100, ciudades: 1, territorio: 20, edificios: 100, ejercito: 50 };
  const p = puntuarEra([a, b]);
  assert.equal(Math.round((p.f1 + p.f2) * 10) / 10, 100);
  const esperado = 100 * (0.40 * 300 / 400 + 0.20 * 60 / 80 + 0.10 * 3 / 4 + 0.15 * 200 / 300 + 0.15 * 50 / 100);
  assert.equal(p.f1, Math.round(esperado * 10) / 10);
  assert.equal(PESOS_ERA.poblacion + PESOS_ERA.territorio + PESOS_ERA.ciudades + PESOS_ERA.edificios + PESOS_ERA.ejercito, 1);
  assert.equal(puntuarEra([a, b], { f1: 3 }).f1, Math.round((esperado - 3) * 10) / 10);
  assert.deepEqual(puntuarEra([a, { ...b, vivo: false }]), { f1: 100, f2: 0 });
  assert.deepEqual(puntuarEra([{ ...a, vivo: false }, { ...b, vivo: false }]), { f1: 0, f2: 0 });
  const nada = { poblacion: 0, ciudades: 0, territorio: 0, edificios: 0, ejercito: 0 };
  assert.deepEqual(puntuarEra([{ id: 'x', vivo: true, ...nada }, { id: 'y', vivo: true, ...nada }]), { x: 50, y: 50 }, 'sin nada que repartir, a partes iguales');
  // gana el unico superviviente aunque tenga infracciones de sobra
  const r = clasificarEra([{ ...a, vivo: false }, b], { f2: 500 });
  assert.equal(r[0].participant_id, 'f2'); assert.equal(r[0].puesto, 1); assert.equal(r[1].puesto, 2);
  const e = clasificarEra([{ ...a }, { ...a, id: 'f2' }]);
  assert.deepEqual(e.map(x => x.puesto), [1, 1], 'empate total: comparten puesto');
  // dos vivas: mas puntos
  assert.equal(clasificarEra([a, b])[0].participant_id, 'f1');
});

test('calendario: 8 llamadas por modelo con los anos por omision (150, 300, 450, muro 500, guerra +1 y +3, limite 650); etapas 2 y 3 a los 5 y 10 anos y comprobacion de rasgos a los 20', () => {
  assert.equal(totalLlamadas(P), 8);
  const c = calendarioEra(P);
  assert.deepEqual(c.map(h => [h.tipo, h.anio]), [['etapa', 6], ['etapa', 11], ['rasgos', 31], ['intervencion', 150], ['intervencion', 300], ['intervencion', 450], ['muro', 500], ['intervencion', 501], ['intervencion', 503]]);
  assert.equal(c.filter(h => h.tipo !== 'rasgos' && h.tipo !== 'muro').length, 7, 'la comprobacion de rasgos y el muro no son llamadas a un modelo');
  assert.equal(P.anioLimite, 650); assert.equal(P.velocidadDesarrollo, 'x40'); assert.equal(P.velocidadGuerra, 'x5'); assert.equal(P.segundosAvanceGuerra, 20); assert.equal(P.aniosEsperaRasgos, 20); assert.deepEqual(P.tiposMantenidos, ['cultura', 'idioma', 'religion', 'clan']); assert.equal(P.revelar, 'borrador');
  assert.equal(P.leyes.world_law_rebellions, false); assert.equal(P.edad, 'age_hope');
  assert.equal(anioDe(0), 1); assert.equal(anioDe(59.9), 1); assert.equal(anioDe(60), 2); assert.equal(anioDe(29940), 500);
  const corta = resolverPartida({ anioMuro: 60, anioLimite: 90, intervencionesDesarrollo: [20, 35, 50], intervencionesGuerra: [3, 15], aniosEsperaRasgos: 5 });
  validarPartida(corta);
});

test('validarPartida rechaza calendarios imposibles', () => {
  const malo = c => assert.throws(() => validarPartida(resolverPartida(c)), { codigo: 'configuracion_era_invalida' });
  malo({ anioMuro: 100 });                                     // intervenciones de desarrollo despues del muro
  malo({ anioLimite: 400 });                                   // limite antes del muro
  malo({ intervencionesDesarrollo: [300, 150, 450] });         // desordenadas
  malo({ intervencionesDesarrollo: [8, 300, 450] });           // antes de terminar el borrador
  malo({ intervencionesGuerra: [10, 150] });                   // la guerra no cabe
  malo({ velocidadGuerra: 'rapido' });
  malo({ revelar: 'nunca' });
  malo({ segundosAvance: 500 });
  malo({ segundosAvanceGuerra: 0 });
  malo({ aniosEsperaRasgos: 200 });                            // la comprobacion de rasgos caeria despues de la primera intervencion
  malo({ maxFuertes: -1 });
});

test('prompt era-1.0: identico para los dos modelos y para las 8 llamadas; las cifras salen del motor; contiene todo el catalogo y las reglas', () => {
  const s = construirSistemaEra(P);
  assert.equal(hash(construirSistemaEra(P)), hash(s), 'determinista');
  assert.equal(construirPromptEra(P, { llamada: { numero: 1 }, anio: 0, presupuesto: {} }).sistema, construirPromptEra(P, { llamada: { numero: 5 }, anio: 150, presupuesto: {} }).sistema, 'el sistema no depende de la llamada');
  assert.notEqual(hash(construirSistemaEra(resolverPartida({ anioMuro: 400 }))), hash(s), 'otra configuracion = otro texto');
  for (const r of razasOfrecidas()) assert.ok(s.includes(r.id), r.id);
  for (const r of rasgosOfrecidos()) assert.ok(s.includes(r.id), r.id);
  for (const m of CATALOGO_ERA.minerales) assert.ok(s.includes(m.id), m.id);
  for (const b of CATALOGO_ERA.biomas) assert.ok(s.includes(b.id), b.id);
  for (const n of [P.anioMuro, P.anioLimite, ...P.intervencionesDesarrollo, 1 + P.aniosBorrador, 1 + 2 * P.aniosBorrador, P.anioMuro + 1, P.anioMuro + 3, 1 + 2 * P.aniosBorrador + P.aniosEsperaRasgos, PRESUPUESTO_PUNTOS.etapa1, PRESUPUESTO_PUNTOS.etapa2, PRESUPUESTO_PUNTOS.etapa3, PRESUPUESTO_PUNTOS.rasgo_extra, INTERVENCION.puntosAccion, 192, 60])
    assert.ok(s.includes(String(n)), `cifra ${n}`);
  for (const w of [PESOS_ERA.poblacion, PESOS_ERA.territorio, PESOS_ERA.ciudades, PESOS_ERA.edificios, PESOS_ERA.ejercito]) assert.ok(s.includes(String(w).replace('.', ',')), `peso ${w}`);
  for (const frase of ['UN SOLO USO', 'a ciegas y simultáneo', 'ÚLTIMA civilización', 'corrección', 'NO están medidos', 'valores INVENTADOS', 'no los copies', 'elegir_inicio', 'elegir_rasgos_etapa2', 'elegir_rasgos_etapa3', 'rasgo_extra', 'reasoning_summary', 'age_hope', 'no ves ninguna elección del rival', 'FUERTE', 'efecto medido', 'conducta (efecto no medido)', 'sabor', 'MANTIENE', 'rasgos_no_aplicados', 'objeto_ausente', 'no ocurre']) assert.ok(s.includes(frase) || s.toLowerCase().includes(frase.toLowerCase()), frase);
  assert.ok(!/asiento|f1|f2/.test(s), 'el prompt no habla de asientos ni de ids de facción');
  assert.ok(s.length < 60_000, `tamaño razonable (${s.length} caracteres)`);
});

test('prompt: el modo de revelado y las leyes apagadas se reflejan en el texto', () => {
  assert.match(construirSistemaEra(P), /hasta que se cierran LAS TRES etapas del borrador/);
  assert.match(construirSistemaEra(resolverPartida({ revelar: 'etapa' })), /al cerrarse una etapa ves lo que el rival eligió/);
  assert.match(construirSistemaEra(P), /las rebeliones, los desastres naturales y los otros desastres/);
  assert.doesNotMatch(construirSistemaEra(resolverPartida({ leyes: {} })), /se apagan/);
});

test('razas podadas (E6): siguen en el catalogo con su motivo pero no se ofrecen, ni en el esquema, ni en el prompt, ni en la validacion', () => {
  const podadas = CATALOGO_ERA.razas.filter(r => !r.ofrecible).map(r => r.id).sort();
  assert.deepEqual(podadas, ['civ_beetle', 'civ_candy_man', 'civ_piranha']);
  for (const r of CATALOGO_ERA.razas.filter(x => !x.ofrecible)) assert.match(r.motivo, /^E6: .*\d/, `${r.id}: el motivo cita la medicion`);
  assert.equal(razasOfrecidas().length, 36);
  const s = construirSistemaEra(P), v = p => validarAccion({ action: 'elegir_inicio', parameters: p }, { acciones: reglasEtapa(1), puntos: 0 });
  assert.ok(v({ raza: 'human', mineral: 'mineral_gold', bioma: NINGUNO }).ok);
  for (const id of podadas) {
    assert.ok(!razasOfrecidas().some(r => r.id === id)); assert.ok(!s.includes(id), `${id} no aparece en el prompt`);
    assert.equal(v({ raza: id, mineral: 'mineral_gold', bioma: NINGUNO }).error, 'parametros_invalidos', `${id} no se puede elegir`);
  }
  for (const id of ['human', 'elf', 'civ_fox']) assert.ok(razasOfrecidas().some(r => r.id === id), id);
});

test('dones de combate (E6): medidos en duelos pareados; fuera de la oferta con la cifra y la propuesta; los cuatro dones de conducta y la fuerza mejorada citan su medicion', () => {
  for (const id of ['gift_of_fire', 'gift_of_thunder', 'gift_of_death', 'gift_of_void', 'gift_of_blood']) {
    assert.equal(rasgoPorId(id), undefined, `${id} sigue fuera`);
    assert.match(CATALOGO_ERA.excluidos.find(x => x.id === id).motivo, /E6.*\d+ de \d+/, `${id}: el motivo cita la medicion de E6`);
  }
  assert.match(CATALOGO_ERA.excluidos.find(x => x.id === 'gift_of_death').motivo, /esqueletos.*población/);
  for (const id of ['gift_of_water', 'gift_of_life', 'gift_of_harmony', 'gift_of_air']) assert.match(rasgoPorId(id).efecto_es, /duelos pareados \(E6\).*no se distinguió del azar/, id);
  assert.match(rasgoPorId('enhanced_strength').efecto_es, /E6/); assert.equal(rasgoPorId('enhanced_strength').costo, 6); assert.equal(rasgoPorId('enhanced_strength').fuerte, true);
});

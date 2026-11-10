import { readFileSync } from 'node:fs';
import { entero, exigir, objeto } from '../util.js';
import { ACCIONES_REAL } from '../reglas.js';
import { ranking } from '../puntuacion.js';

// Reglamento «era» (docs/worldbox-era.md). Cambiar una cifra de este archivo o del catalogo es cambiar el reglamento: se sube
// RULES_VERSION_ERA (y PROMPT_VERSION_ERA si cambia el texto) y los resultados de versiones distintas no se comparan como equivalentes.
export const RULES_VERSION_ERA = 'era-1.0';
export const PROMPT_VERSION_ERA = 'era-1.0';
export const CATALOGO_ERA = JSON.parse(readFileSync(new URL('./catalogo-era.json', import.meta.url), 'utf8'));
export const NINGUNO = 'ninguno';

// Puntos del borrador: tope de costo por etapa y reserva de rasgos extra para las intervenciones (docs/worldbox-era.md, seccion 4).
export const PRESUPUESTO_PUNTOS = Object.freeze({ etapa1: 4, etapa2: 10, etapa3: 4, rasgo_extra: 6 });
// Intervenciones: 4 puntos de accion y hasta 3 acciones por llamada; los topes por partida coinciden con los de seguridad del puente.
export const INTERVENCION = Object.freeze({ puntosAccion: 4, maxAcciones: 3, rasgosExtraPorLlamada: 1, topes: Object.freeze({ unidades: 10, poderes: 10, donado: 100 }) });
// Puntaje del desempate (solo si pasan los anos sin eliminacion). Cuota de cada componente frente al total de las dos civilizaciones, x100.
export const PESOS_ERA = Object.freeze({ poblacion: 0.40, territorio: 0.20, ciudades: 0.10, edificios: 0.15, ejercito: 0.15, penalizacion: 1 });

export const PERFIL_ERA = Object.freeze({
  nombre: 'era', rules_version: RULES_VERSION_ERA, prompt_version: PROMPT_VERSION_ERA, pesos: PESOS_ERA, victoriaSupervivencia: true,
  partida: Object.freeze({
    facciones: 2, tamanoMapa: 192, plantilla: 'continent', unidadesIniciales: 4, segundosAvance: 60, segundosPorAnio: 60,
    anioMuro: 500, aniosGuerra: 150, aniosBorrador: 5, intervencionesDesarrollo: Object.freeze([150, 300, 450]), intervencionesGuerra: Object.freeze([1, 3]),
    // E5: la guerra se juega LENTA (x5, 20 s de mundo por paso) para que se vea y para observar la eliminacion; las intervenciones de guerra son relativas a la caida del muro.
    velocidadDesarrollo: 'x40', velocidadGuerra: 'x5', segundosAvanceGuerra: 20, muroAncho: 4,
    // E5: cultura, idioma, religion y clan los reemplaza el juego por su cuenta: el puente los mantiene (reaplica lo perdido y aplica lo pendiente en cuanto el objeto existe).
    // Si pasados `aniosEsperaRasgos` anos desde la etapa 3 un rasgo sigue sin poder aplicarse, se informa al modelo y se devuelven los puntos a su reserva.
    tiposMantenidos: Object.freeze(['cultura', 'idioma', 'religion', 'clan']), aniosEsperaRasgos: 20, maxFuertes: 1, edad: 'age_hope', cantidadMinerales: 8, radioMinerales: 14, renovarGuerra: true, revelar: 'borrador',
    leyes: Object.freeze({ world_law_rebellions: false, world_law_disasters_nature: false, world_law_disasters_other: false }),
    maxTiempoMs: 14_400_000, timeoutMs: 120000, intentosMundo: 3,
  }),
});

// ---------------------------------------------------------------- catalogo
export const razasOfrecidas = (cat = CATALOGO_ERA) => cat.razas.filter(r => r.ofrecible);
export const rasgosOfrecidos = (cat = CATALOGO_ERA) => cat.rasgos.filter(r => r.ofrecible);
// Motivos por los que un rasgo elegido NO se aplico y que NO son culpa del modelo: se le devuelven los puntos (a su reserva de rasgos extra).
export const MOTIVOS_REEMBOLSABLES = Object.freeze(['objeto_ausente', 'no_aplicado', 'perdido', 'faccion_eliminada']);
export const rasgoPorId = (id, cat = CATALOGO_ERA) => cat.rasgos.find(r => r.id === id);
export const slotsDeEtapa = (etapa, cat = CATALOGO_ERA) => cat.slots.filter(s => s.etapa === etapa);
export const biomasValidosPara = (raza, cat = CATALOGO_ERA) => [...cat.compatibilidad.biomas_seguros, ...(cat.compatibilidad.excepciones[raza] ?? [])];
export const biomaCompatible = (raza, bioma, cat = CATALOGO_ERA) => biomasValidosPara(raza, cat).includes(bioma);

const cadena = valores => ({ tipo: 'cadena', minimo: 1, maximo: 60, valores });
// Esquemas exactos de los «pedidos» de cada etapa. Se validan con el mismo validador de acciones de las demas partidas.
export function esquemaEtapa(etapa, cat = CATALOGO_ERA) {
  if (etapa === 1) return { raza: cadena(razasOfrecidas(cat).map(r => r.id)), mineral: cadena(cat.minerales.map(m => m.id)), bioma: cadena([NINGUNO, ...cat.biomas.map(b => b.id)]) };
  return Object.fromEntries(slotsDeEtapa(etapa, cat).map(s => [s.id, cadena([NINGUNO, ...rasgosOfrecidos(cat).filter(r => r.slot === s.id).map(r => r.id)])]));
}
export const nombreAccionEtapa = etapa => etapa === 1 ? 'elegir_inicio' : `elegir_rasgos_etapa${etapa}`;

// Reglas de accion de una llamada (misma forma que accionesHabilitadas: nombre, parametros, puntos, cooldown, restricciones).
const textoReal = n => ACCIONES_REAL[n].texto;
const base = (nombre, extra = {}) => ({ nombre, cooldown: 0, anunciada: true, ...extra });
export function accionesIntervencion(fase, { anunciadas = null } = {}) {
  const real = n => ({ descripcion: textoReal(n), parametros: ACCIONES_REAL[n].parametros });
  const lista = [
    base('esperar', { descripcion: 'No hace nada. Cuesta 0 puntos.', parametros: {}, puntos: 0, anunciada: false }),
    base('crear_unidades', { ...real('crear_unidades'), puntos: 2, acumulado: { parametro: 'cantidad', maximo: INTERVENCION.topes.unidades, efecto: 'creadas' } }),
    base('donar_recursos', { ...real('donar_recursos'), puntos: 1, acumulado: { parametro: 'cantidad', maximo: INTERVENCION.topes.donado } }),
    base('bendecir', { ...real('bendecir'), puntos: 1, tope_grupo: { grupo: 'poderes', maximo: INTERVENCION.topes.poderes } }),
  ];
  if (fase === 'guerra') lista.push(
    base('maldecir', { ...real('maldecir'), puntos: 2, tope_grupo: { grupo: 'poderes', maximo: INTERVENCION.topes.poderes } }),
    base('incendiar', { ...real('incendiar'), puntos: 2, tope_grupo: { grupo: 'poderes', maximo: INTERVENCION.topes.poderes } }));
  lista.push(base('rasgo_extra', { descripcion: 'Suma UN rasgo medido o declarado del catalogo a tu civilizacion, pagandolo de tu reserva de puntos de rasgos extra.', parametros: { id: cadena(rasgosOfrecidos().filter(r => r.clase === 'medido' || r.clase === 'declarado').map(r => r.id)) }, puntos: 0, anunciada: false }));
  // Las acciones que viajan al juego solo existen si el puente las anuncia verificadas con EXACTAMENTE su esquema.
  return anunciadas ? lista.filter(a => !a.anunciada || anunciadas.has(a.nombre)) : lista;
}
export function reglasEtapa(etapa, cat = CATALOGO_ERA) {
  return [{ nombre: nombreAccionEtapa(etapa), descripcion: etapa === 1 ? 'Eliges tu raza, tu mineral y, si quieres, tu bioma.' : `Eliges como maximo un rasgo por casilla de la etapa ${etapa}.`, parametros: esquemaEtapa(etapa, cat), puntos: 0, cooldown: 0, anunciada: false }];
}

// ---------------------------------------------------------------- validacion de elecciones (ademas del esquema)
export const costoMineral = (id, cat = CATALOGO_ERA) => cat.minerales.find(m => m.id === id)?.costo ?? 0;
export const costoBioma = (id, cat = CATALOGO_ERA) => cat.biomas.find(b => b.id === id)?.costo ?? 0;
export function limiteEtapa(etapa) { return PRESUPUESTO_PUNTOS[`etapa${etapa}`]; }
// parametros: ya validados por el esquema. Devuelve { ok, errores:[{codigo, detalle}], eleccion, costo }.
export const esFuerte = (id, cat = CATALOGO_ERA) => rasgoPorId(id, cat)?.fuerte === true;
// `previos`: ids que la civilizacion ya tiene (de etapas anteriores o extras): cuentan para el tope de rasgos «fuertes» (valores muy grandes segun E3).
export function evaluarEleccion(etapa, parametros, cat = CATALOGO_ERA, previos = [], maxFuertes = PERFIL_ERA.partida.maxFuertes) {
  const errores = [];
  if (etapa === 1) {
    const bioma = parametros.bioma === NINGUNO ? null : parametros.bioma;
    if (bioma && !biomaCompatible(parametros.raza, bioma, cat)) errores.push({ codigo: 'bioma_incompatible', detalle: `La raza ${parametros.raza} solo puede fundar en: ${biomasValidosPara(parametros.raza, cat).join(', ')}.` });
    const costo = costoMineral(parametros.mineral, cat) + (bioma ? costoBioma(bioma, cat) : 0);
    if (costo > limiteEtapa(1)) errores.push({ codigo: 'presupuesto_excedido', detalle: `Mineral + bioma cuestan ${costo} y el presupuesto de la etapa 1 es ${limiteEtapa(1)}.` });
    return { ok: errores.length === 0, errores, eleccion: { raza: parametros.raza, mineral: parametros.mineral, bioma }, costo };
  }
  const rasgos = {};
  let costo = 0;
  for (const [slot, id] of Object.entries(parametros)) { if (id !== NINGUNO) { rasgos[slot] = id; costo += rasgoPorId(id, cat).costo; } }
  if (costo > limiteEtapa(etapa)) errores.push({ codigo: 'presupuesto_excedido', detalle: `Tus rasgos cuestan ${costo} y el presupuesto de la etapa ${etapa} es ${limiteEtapa(etapa)}.` });
  const fuertes = [...previos, ...Object.values(rasgos)].filter(id => esFuerte(id, cat));
  if (fuertes.length > maxFuertes) errores.push({ codigo: 'rasgo_fuerte_excedido', detalle: `Solo puedes tener ${maxFuertes} rasgo fuerte (valor muy grande) en toda la partida y con este tendrias ${fuertes.length}: ${fuertes.join(', ')}.` });
  return { ok: errores.length === 0, errores, eleccion: { rasgos }, costo };
}
// Plan B si, tras la correccion, la eleccion sigue siendo invalida: lo que el motor hace es siempre el mismo (deterministico).
export function eleccionPorDefecto(etapa, parametros, cat = CATALOGO_ERA, previos = [], maxFuertes = PERFIL_ERA.partida.maxFuertes) {
  if (etapa === 1) {
    // Solo se conserva lo que EXISTE en las listas (un valor con una errata no puede llegar al juego: «conserva lo válido»); lo demás vuelve a human / piedra / sin bioma.
    const raza = razasOfrecidas(cat).some(r => r.id === parametros?.raza) ? parametros.raza : 'human', mineral = cat.minerales.some(m => m.id === parametros?.mineral) ? parametros.mineral : 'mineral_stone';
    let bioma = cat.biomas.some(b => b.id === parametros?.bioma) && biomaCompatible(raza, parametros.bioma, cat) ? parametros.bioma : null;
    let m = mineral;
    if (costoMineral(m, cat) + (bioma ? costoBioma(bioma, cat) : 0) > limiteEtapa(1)) bioma = null;
    if (costoMineral(m, cat) > limiteEtapa(1)) m = 'mineral_stone';
    return { raza, mineral: m, bioma };
  }
  // Etapas de rasgos: se descartan casillas desde la ultima hasta que el costo cabe.
  const rasgos = {}, orden = slotsDeEtapa(etapa, cat).map(s => s.id);
  // Un rasgo que no existe, que no se ofrece o que está en otra casilla (una errata) se descarta: no cuesta, no llega al juego y no rompe la partida.
  for (const [slot, id] of Object.entries(parametros ?? {})) if (id !== NINGUNO && orden.includes(slot) && cat.rasgos.some(r => r.id === id && r.slot === slot && r.ofrecible)) rasgos[slot] = id;
  const costo = () => Object.values(rasgos).reduce((s, id) => s + rasgoPorId(id, cat).costo, 0);
  for (const slot of [...orden].reverse()) { if (costo() <= limiteEtapa(etapa)) break; delete rasgos[slot]; }
  const fuertes = () => [...previos, ...Object.values(rasgos)].filter(id => esFuerte(id, cat)).length;
  for (const slot of [...orden].reverse()) { if (fuertes() <= maxFuertes) break; if (rasgos[slot] && esFuerte(rasgos[slot], cat)) delete rasgos[slot]; }
  return { rasgos };
}
// rasgo_extra: reglas propias (ademas del esquema). `propios`: ids ya aplicados a la civilizacion; `reserva`: puntos que le quedan.
export function evaluarRasgoExtra(id, { propios, reserva }, cat = CATALOGO_ERA) {
  const r = rasgoPorId(id, cat);
  if (!r || !r.ofrecible) return 'rasgo_no_ofrecido';
  if (!(r.clase === 'medido' || r.clase === 'declarado')) return 'rasgo_no_extra';
  if (propios.includes(id)) return 'ya_presente';
  if (r.opuestos.some(o => propios.includes(o))) return 'rasgo_opuesto';
  if (r.fuerte && propios.some(p => esFuerte(p, cat))) return 'rasgo_fuerte_excedido';
  if (r.costo > reserva) return 'reserva_insuficiente';
  return null;
}

// ---------------------------------------------------------------- puntaje del desempate
const COMPONENTES = ['poblacion', 'territorio', 'ciudades', 'edificios', 'ejercito'];
// civs: [{id, vivo, poblacion, ciudades, territorio, edificios, ejercito}]. Cada componente vale su peso x 100 repartido en proporcion a la cuota
// de cada civilizacion VIVA (si ambas valen 0, a partes iguales). Una civilizacion eliminada puntua 0. Cada infraccion resta 1 punto.
export function puntuarEra(civs, infracciones = {}, pesos = PESOS_ERA) {
  const vivas = civs.filter(c => c.vivo);
  const salida = {};
  for (const c of civs) {
    let p = 0;
    if (c.vivo) for (const k of COMPONENTES) { const total = vivas.reduce((s, x) => s + (x[k] ?? 0), 0); p += pesos[k] * 100 * (total > 0 ? (c[k] ?? 0) / total : 1 / vivas.length); }
    salida[c.id] = Math.round((p - pesos.penalizacion * (infracciones[c.id] ?? 0)) * 10) / 10;
  }
  return salida;
}
// Ranking con la regla de siempre: el unico superviviente gana; si siguen dos vivas, mas puntos > mas poblacion > mas territorio; si no, comparten puesto.
export function clasificarEra(civs, infracciones = {}, opciones = {}) {
  const puntos = puntuarEra(civs, infracciones, opciones.pesos);
  return ranking(civs.map(c => ({ ...c, participant_id: c.id, puntos: puntos[c.id] })), { supervivencia: true });
}

// ---------------------------------------------------------------- calendario
export const anioDe = tJuegoS => 1 + Math.floor(Math.max(0, tJuegoS) / 60);
// E9: opciones del puente que protegen el 1 vs 1 (vigilante del muro y un solo reino por civilizacion). Activas por omision en el puente: solo se envian para apagarlas o cambiar el modo del vigilante.
export const MODOS_VIGILANTE = Object.freeze(['devolver', 'eliminar', 'observar']);
export function opcionesControlEra(p = {}) {
  return {
    ...(p.vigilante === false ? { vigilante: false } : p.vigilanteModo ? { vigilante: { activo: true, modo: p.vigilanteModo } } : {}),
    ...(p.unicoReino === false ? { unico_reino: false } : {}),
  };
}
export function resolverPartida(c = {}) {
  const p = PERFIL_ERA.partida, r = { ...p, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) };
  r.intervencionesDesarrollo = [...r.intervencionesDesarrollo]; r.intervencionesGuerra = [...r.intervencionesGuerra];
  if (r.anioLimite === undefined) r.anioLimite = r.anioMuro + r.aniosGuerra;
  return r;
}
export function validarPartida(p) {
  exigir(p.vigilanteModo === undefined || MODOS_VIGILANTE.includes(p.vigilanteModo), 'configuracion_era_invalida');
  exigir(entero(p.anioMuro, 3, 100000) && entero(p.anioLimite, 4, 100000) && p.anioLimite > p.anioMuro && entero(p.aniosBorrador, 1, 1000), 'configuracion_era_invalida');
  exigir(entero(p.segundosAvanceGuerra, 1, 120) && entero(p.aniosEsperaRasgos, 0, 200) && entero(p.maxFuertes, 0, 10) && Array.isArray(p.tiposMantenidos) && p.tiposMantenidos.every(t => ['cultura', 'idioma', 'religion', 'clan', 'reino', 'subespecie'].includes(t)), 'configuracion_era_invalida');
  exigir(entero(p.segundosAvance, 1, 120) && (p.muroAncho === 0 || entero(p.muroAncho, 2, 16)) && entero(p.cantidadMinerales, 1, 24) && entero(p.radioMinerales, 4, 30) && entero(p.unidadesIniciales, 1, 8) && entero(p.tamanoMapa, 12, 10000), 'configuracion_era_invalida');
  exigir([p.velocidadDesarrollo, p.velocidadGuerra].every(v => /^x\d{1,2}$/.test(v)) && ['borrador', 'etapa'].includes(p.revelar), 'configuracion_era_invalida');
  const desarrollo = p.intervencionesDesarrollo, guerra = p.intervencionesGuerra, tres = 1 + 2 * p.aniosBorrador;
  exigir(desarrollo.every(a => entero(a, tres + 1, p.anioMuro - 1)) && desarrollo.every((a, i) => i === 0 || a > desarrollo[i - 1]), 'configuracion_era_invalida');
  exigir(guerra.every(a => entero(a, 1, p.anioLimite - p.anioMuro - 1)) && guerra.every((a, i) => i === 0 || a > guerra[i - 1]), 'configuracion_era_invalida');
  exigir(tres < p.anioMuro && objeto(p.leyes), 'configuracion_era_invalida');
  exigir(tres + p.aniosEsperaRasgos < (desarrollo[0] ?? p.anioMuro), 'configuracion_era_invalida'); // la comprobacion de rasgos pendientes cae antes de la primera intervencion
}
// Hitos de la partida en orden: etapas 2 y 3, comprobacion de rasgos pendientes, intervenciones de desarrollo, muro (y guerra) e intervenciones de guerra.
export function calendarioEra(p) {
  const h = [{ tipo: 'etapa', etapa: 2, anio: 1 + p.aniosBorrador }, { tipo: 'etapa', etapa: 3, anio: 1 + 2 * p.aniosBorrador }];
  // No es una llamada a un modelo: el motor comprueba si los rasgos pendientes ya se aplicaron y, si no, informa y devuelve los puntos.
  if (p.aniosEsperaRasgos > 0) h.push({ tipo: 'rasgos', anio: 1 + 2 * p.aniosBorrador + p.aniosEsperaRasgos });
  p.intervencionesDesarrollo.forEach((anio, i) => h.push({ tipo: 'intervencion', fase: 'desarrollo', indice: i + 1, de: p.intervencionesDesarrollo.length, anio }));
  h.push({ tipo: 'muro', anio: p.anioMuro });
  p.intervencionesGuerra.forEach((desp, i) => h.push({ tipo: 'intervencion', fase: 'guerra', indice: i + 1, de: p.intervencionesGuerra.length, anio: p.anioMuro + desp }));
  return h.sort((a, b) => a.anio - b.anio); // estable: a igual año, el orden de arriba
}
export const totalLlamadas = p => 1 + 2 + p.intervencionesDesarrollo.length + p.intervencionesGuerra.length;

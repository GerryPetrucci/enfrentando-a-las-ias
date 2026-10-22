// Evaluacion de la Guerra de territorios: al final de cada partida (y de cada serie) se dicen las caracteristicas de todas las IAs (decision del usuario, 11 y 18 de octubre de 2026: cada juego es independiente,
// sin torneo general). Las calcula el codigo desde lo guardado: sin llamadas extra, sin cambiar ni ocultar ninguna jugada. El texto es PUBLICO (lleva acentos).
//
// Cinco caracteristicas, aprobadas por el usuario el 18 de octubre de 2026:
//   obediencia   ordenes legales sobre las totales y turnos sin respuesta (la IA contesto en formato)
//   palabra      pactos rotos y honor final
//   negociacion  pactos firmados y comercios por turno
//   conquista    regiones, conquistas a otros reinos, batallas ganadas, si cayo
//   camino       como fue por la victoria: Maravilla (construida, completada, tomada o perdida) o territorio
// Cada una devuelve { valor, frase, notable }; `notable` decide cuales se destacan (hasta 3 por IA, en el orden de PRIORIDAD).
// Guerra 2.0.0 no agrega una sexta (como los demas juegos, son cinco): enriquece dos frases con lo nuevo que dejan guardado las partidas (`estado.uni`: las unidades de cada reino por region, tambien de visita):
// `palabra` dice cuantas rupturas fueron «desde dentro» (con tropas suyas en tierra de la victima) y `conquista`, con que ejercito peleo. Una partida de formato anterior no trae `uni` y se ve como siempre.
//
// Vive en web/ porque lo usan la escena (que no puede importar de src/) y el motor (src/juegos/conquista/evaluacion.js, que SI puede importar de web/, como modelos.js con la paleta).

import { plural, redondeo, comentarioDeSerie } from './evaluacion-comun.js';

export const UMBRALES = {
  obedienciaBaja: 0.75, obedienciaAlta: 0.9, // ordenes legales / ordenes totales
  negociaMucho: 0.8, negociaPoco: 0.2, // (pactos + comercios) por turno jugado
  conquistador: 3, // conquistas a otros reinos para llamarlo conquistador
  turnosParaPasivo: 8, // sin atacar a nadie solo es notable en una partida de al menos esta duracion
  unidadesParaUsarTipo: 5, // un tipo de unidad cuenta como usado si tuvo al menos tantas en algun turno (todas sus regiones, tambien de visita)
  tiposVariados: 3, // con tantos tipos usados o mas, el ejercito es notable
};
export const PRIORIDAD = ['camino', 'palabra', 'obediencia', 'conquista', 'negociacion'];
// Como se llama cada una en la ficha de la pantalla final (texto publico), en el orden en que se muestran.
export const ETIQUETAS = { obediencia: 'Obediencia', palabra: 'Palabra', negociacion: 'Negociación', conquista: 'Conquista', camino: 'Camino a la victoria' };

const nombreDe = (p, s) => p.jugadores?.[s]?.nombre ?? `Jugador ${s + 1}`;
const objeto = (x) => x && typeof x === 'object' && !Array.isArray(x);
// Los eventos de toda la partida, cada uno con su turno; lo que no es un evento (un dato roto o editado a mano) se ignora.
const eventosDe = (p) => (Array.isArray(p.rondas) ? p.rondas : []).flatMap((r) => (Array.isArray(r?.eventos) ? r.eventos : []).filter(objeto).map((e) => ({ ...e, t: e.t ?? r.turno })));

// Lo que se cuenta de UN asiento en UNA partida.
export function contarPartida(p, s) {
  const m = p.metricas?.[s] ?? {}, eventos = eventosDe(p);
  const propios = (tipo, campo = 'k') => eventos.filter((e) => e.tipo === tipo && e[campo] === s);
  let ataques = 0, ganados = 0;
  for (const r of Array.isArray(p.rondas) ? p.rondas : []) for (const c of Array.isArray(r?.combates) ? r.combates : []) {
    if (!objeto(c) || !Array.isArray(c.bandos) || !c.bandos.some((b) => b?.k === s && !b.defensor)) continue;
    ataques++;
    if (c.k === s) ganados++;
  }
  const construyo = propios('maravilla')[0], completo = propios('maravilla_gana')[0], tomo = propios('maravilla_cae')[0], perdio = propios('maravilla_cae', 'de')[0];
  const { pico, desdeDentro } = ejercitoDe(p, s, eventos);
  return {
    id: p.jugadores?.[s]?.id ?? `asiento-${s}`, nombre: nombreDe(p, s), partidas: 1,
    turnos: p.usoPorJugador?.[s]?.llamadas ?? (Array.isArray(p.rondas) ? p.rondas.length : 0), malas: m.respuestasInvalidas ?? 0,
    ordV: m.ordenesValidas ?? 0, ordT: m.ordenesTotal ?? 0,
    traiciones: m.traiciones ?? 0, honor: m.honor ?? null, pactos: m.pactosFirmados ?? 0, comercios: m.comercios ?? 0,
    regiones: m.regiones ?? 0, cayoEn: m.cayoEn ?? null, caidas: m.cayoEn ? 1 : 0, conquistas: propios('conquista').length, ataques, ganados,
    construyo: construyo ? 1 : 0, turnoConstruyo: construyo?.t ?? null, completo: completo ? 1 : 0, turnoCompleto: completo?.t ?? null,
    tomo: tomo ? 1 : 0, deQuienTomo: tomo ? nombreDe(p, tomo.de) : null, perdio: perdio ? 1 : 0, ante: perdio ? nombreDe(p, perdio.k) : null,
    gano: p.ganador === s ? 1 : 0, ganoPorTerritorio: p.ganador === s && p.ganoPorMaravilla !== true ? 1 : 0,
    puntos: m.puntos ?? 0, pico, desdeDentro,
  };
}

// 2.0.0: el maximo de unidades de cada tipo [L, A, J, I] que el asiento tuvo en algun turno (sumando todas sus regiones, tambien las de visita; null si la partida no guarda `uni`) y cuantas de sus rupturas
// las hizo con tropas suyas dentro de una region de la victima (la foto del cierre del turno anterior es el inicio de ese turno).
function ejercitoDe(p, s, eventos) {
  const rondas = (Array.isArray(p.rondas) ? p.rondas : []).filter(objeto), unidades = (r) => (Array.isArray(r.estado?.uni) ? r.estado.uni.filter((f) => Array.isArray(f)) : null);
  let pico = null;
  for (const r of rondas) {
    const uni = unidades(r);
    if (!uni) continue;
    const total = [0, 0, 0, 0];
    for (const f of uni) if (f[1] === s) for (let t = 0; t < 4; t++) total[t] += Number(f[2 + t]) || 0;
    pico = (pico ?? [0, 0, 0, 0]).map((n, t) => Math.max(n, total[t]));
  }
  let desdeDentro = 0;
  for (const e of eventos) {
    if (e.tipo !== 'ruptura' || e.k !== s) continue;
    const antes = rondas.find((r) => r.turno === e.t - 1), uni = antes && unidades(antes), dueno = antes?.estado?.dueno;
    if (uni && Array.isArray(dueno) && uni.some((f) => f[1] === s && dueno[f[0]] === e.contra)) desdeDentro++;
  }
  return { pico, desdeDentro };
}

// Suma lo contado de varias partidas del mismo jugador.
export function sumar(lista) {
  const cuenta = (campo) => lista.reduce((a, c) => a + (c[campo] ?? 0), 0);
  const unica = lista.length === 1 ? lista[0] : null;
  const honores = lista.map((c) => c.honor).filter(Number.isFinite), picos = lista.map((c) => c.pico).filter(Array.isArray);
  return {
    id: lista[0].id, nombre: lista[0].nombre, partidas: lista.length,
    ...Object.fromEntries(['turnos', 'malas', 'ordV', 'ordT', 'traiciones', 'pactos', 'comercios', 'regiones', 'caidas', 'conquistas', 'ataques', 'ganados', 'construyo', 'completo', 'tomo', 'perdio', 'gano', 'ganoPorTerritorio', 'puntos', 'desdeDentro'].map((k) => [k, cuenta(k)])),
    pico: picos.length ? [0, 1, 2, 3].map((t) => Math.max(...picos.map((x) => x[t] ?? 0))) : null,
    honor: honores.length ? Math.min(...honores) : null, cayoEn: unica?.cayoEn ?? null,
    turnoConstruyo: unica?.turnoConstruyo ?? null, turnoCompleto: unica?.turnoCompleto ?? null, deQuienTomo: unica?.deQuienTomo ?? null, ante: unica?.ante ?? null,
  };
}

const enPartidas = (c, que) => (c.partidas > 1 ? `${que} en ${c.partidas} partidas` : que);

export function fraseObediencia(c) {
  if (!c.ordT && !c.malas) return { valor: null, frase: 'no hubo órdenes que medir', notable: false };
  const ratio = c.ordT ? c.ordV / c.ordT : null;
  const partes = [];
  if (ratio !== null) partes.push(ratio < UMBRALES.obedienciaBaja ? `solo ${c.ordV} de ${c.ordT} órdenes eran legales` : ratio >= UMBRALES.obedienciaAlta ? `órdenes casi siempre legales (${c.ordV} de ${c.ordT})` : `${c.ordV} de ${c.ordT} órdenes eran legales`);
  if (c.malas) partes.push(`no respondió bien ${plural(c.malas, 'turno', 'turnos')} de ${c.turnos}`);
  return { valor: ratio === null ? null : redondeo(ratio), frase: partes.join('; '), notable: c.malas > 0 || (ratio !== null && ratio < UMBRALES.obedienciaBaja) };
}

export function frasePalabra(c) {
  if (!c.traiciones) return { valor: c.honor, frase: enPartidas(c, 'no rompió ningún pacto'), notable: false };
  const dentro = c.desdeDentro > 0 ? ` (${c.desdeDentro} atacando desde dentro)` : '';
  return { valor: c.honor, frase: `rompió ${plural(c.traiciones, 'pacto', 'pactos')}${dentro}${c.honor === null ? '' : ` y terminó con ${c.honor} de honor`}`, notable: true };
}

export function fraseNegociacion(c) {
  const total = c.pactos + c.comercios, detalle = `${plural(c.pactos, 'pacto', 'pactos')} y ${plural(c.comercios, 'comercio', 'comercios')}`;
  if (!total) return { valor: 0, frase: 'no negoció con nadie', notable: true };
  const ritmo = c.turnos ? total / c.turnos : 0;
  if (ritmo >= UMBRALES.negociaMucho) return { valor: redondeo(ritmo, 2), frase: `negoció sin parar: ${detalle}`, notable: true };
  if (ritmo <= UMBRALES.negociaPoco) return { valor: redondeo(ritmo, 2), frase: `casi no negoció: ${detalle}`, notable: true };
  return { valor: redondeo(ritmo, 2), frase: `negoció lo normal: ${detalle}`, notable: false };
}

const TIPOS_DE_UNIDAD = ['Lanceros', 'Arqueros', 'Jinetes', 'Ingenios'];
// Los tipos que de verdad uso (con el minimo de UMBRALES.unidadesParaUsarTipo en algun turno) y como se dice: «solo Lanceros», «Lanceros y Arqueros», «los cuatro tipos de unidad». Sin datos de unidades, nada.
function ejercito(c) {
  const usados = Array.isArray(c.pico) ? TIPOS_DE_UNIDAD.filter((_, t) => c.pico[t] >= UMBRALES.unidadesParaUsarTipo) : [];
  if (!usados.length) return { usados, texto: '' };
  const texto = usados.length === 1 ? `solo ${usados[0]}` : usados.length === TIPOS_DE_UNIDAD.length ? 'los cuatro tipos de unidad' : `${usados.slice(0, -1).join(', ')} y ${usados.at(-1)}`;
  return { usados, texto };
}

export function fraseConquista(c) {
  const army = ejercito(c), batallas = c.ataques ? `ganó ${c.ganados} de ${plural(c.ataques, 'batalla', 'batallas')}${army.texto ? `; ejército: ${army.texto}` : ''}` : 'sin batallas propias';
  const regiones = plural(c.regiones, 'región', 'regiones'), variado = army.usados.length >= UMBRALES.tiposVariados;
  if (c.caidas) return { valor: c.regiones, frase: c.partidas > 1 ? `cayó en ${plural(c.caidas, 'partida', 'partidas')}` : `cayó en el turno ${c.cayoEn}`, notable: true };
  if (c.conquistas >= UMBRALES.conquistador) return { valor: c.conquistas, frase: `conquistó ${plural(c.conquistas, 'región', 'regiones')} a otros reinos (${batallas})`, notable: true };
  if (!c.ataques && c.turnos >= UMBRALES.turnosParaPasivo * c.partidas) return { valor: c.conquistas, frase: `no atacó a nadie: termina con ${regiones}`, notable: true };
  const quito = c.conquistas ? `conquistó ${plural(c.conquistas, 'región', 'regiones')} a otros reinos` : 'no conquistó regiones de otros reinos';
  return { valor: c.conquistas, frase: `${quito} (${batallas}); termina con ${regiones}`, notable: variado };
}

export function fraseCamino(c) {
  const una = c.partidas === 1;
  if (c.completo) return { valor: 'maravilla', frase: una ? `completó la Maravilla en el turno ${c.turnoCompleto} y ganó` : `completó la Maravilla en ${plural(c.completo, 'partida', 'partidas')}`, notable: true };
  if (c.tomo) return { valor: 'maravilla', frase: una && c.deQuienTomo ? `conquistó la Maravilla de ${c.deQuienTomo}` : `conquistó la Maravilla de otro reino en ${plural(c.tomo, 'partida', 'partidas')}`, notable: true };
  if (c.perdio) return { valor: 'maravilla', frase: una && c.ante ? `construyó la Maravilla y la perdió ante ${c.ante}` : `construyó la Maravilla y la perdió en ${plural(c.perdio, 'partida', 'partidas')}`, notable: true };
  if (c.construyo) return { valor: 'maravilla', frase: una && c.turnoConstruyo ? `construyó la Maravilla en el turno ${c.turnoConstruyo}` : `construyó la Maravilla en ${plural(c.construyo, 'partida', 'partidas')}`, notable: true };
  if (c.ganoPorTerritorio) return { valor: 'territorio', frase: enPartidas(c, 'ganó por territorio'), notable: true };
  return { valor: null, frase: enPartidas(c, 'no fue por la Maravilla'), notable: false };
}

export function caracteristicasDe(c) {
  const caracteristicas = { obediencia: fraseObediencia(c), palabra: frasePalabra(c), negociacion: fraseNegociacion(c), conquista: fraseConquista(c), camino: fraseCamino(c) };
  const notables = PRIORIDAD.filter((k) => caracteristicas[k].notable).slice(0, 3).map((k) => caracteristicas[k].frase);
  return { caracteristicas, destacadas: notables.length ? notables : [caracteristicas.conquista.frase] };
}

// Una partida terminada: una entrada por asiento, en el orden de los asientos. Una partida cortada, rota o sin jugadores no se evalua (lista vacia).
export function evaluarPartida(p) {
  if (!p || typeof p !== 'object' || p.truncada === true || !Array.isArray(p.jugadores) || !p.jugadores.length || !Array.isArray(p.rondas) || !Array.isArray(p.metricas)) return { jugadores: [] };
  return { jugadores: p.jugadores.map((_, s) => { const c = contarPartida(p, s); return { asiento: s, id: c.id, nombre: c.nombre, puntos: c.puntos, ...caracteristicasDe(c) }; }) };
}

// Una serie: lo mismo juntando las partidas de cada jugador (por su id, aunque los asientos roten). Para `juego.evaluar` y la consola.
export function evaluarSerie(partidas) {
  const vacia = { partidas: 0, jugadores: [], comentario: [] };
  const buenas = (Array.isArray(partidas) ? partidas : []).filter((p) => evaluarPartida(p).jugadores.length);
  if (!buenas.length) return vacia;
  const por = new Map();
  for (const p of buenas) p.jugadores.forEach((_, s) => { const c = contarPartida(p, s); por.set(c.id, [...(por.get(c.id) ?? []), c]); });
  const jugadores = [...por.values()].map((lista) => {
    const c = sumar(lista), puntosPorPartida = redondeo(c.puntos / c.partidas, 2);
    return { id: c.id, nombre: c.nombre, partidas: c.partidas, puntosPorPartida, conteos: { victorias: c.gano, caidas: c.caidas }, ...caracteristicasDe(c) };
  }).sort((a, b) => b.puntosPorPartida - a.puntosPorPartida);
  return { partidas: buenas.length, jugadores, comentario: comentarioDeSerie({ juego: 'Guerra de territorios', jugadores, n: buenas.length, vuelta: jugadores.length }) };
}

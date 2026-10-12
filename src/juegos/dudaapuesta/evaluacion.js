// Evaluacion al final de una serie de Duda y apuesta (decision del usuario, 11 de octubre de 2026: no hay torneo general; cada juego se evalua por si mismo).
// Cinco caracteristicas por IA, con frases por umbrales FIJOS, mas un comentario del resultado. Lo escribe el codigo a partir de los datos guardados (sin llamadas extra) y
// nunca cambia ni oculta una jugada. El texto es PUBLICO (lleva acentos). Solo cuentan las decisiones que eligio la IA: una jugada de reemplazo no mide a nadie.
//
//   obediencia   respuestas en formato / respuestas totales
//   ojo          de las veces que dudo, en cuantas el anuncio era FALSO con las cartas reales (tambien si el rival se retira; si no hay cartas en el registro, quien gano)
//   farol        de sus anuncios, cuantos no se cumplian con las cartas reales (se calcula del registro publico `oculto`)
//   riesgo       cuanto de sus fichas puso en promedio en cada apuesta y cuantas veces aposto todo
//   constancia   piezas / medios / eliminados y manos ganadas

import { JUGADORES } from './constantes.js';
import { plural, redondeo, fraseObediencia, comentarioDeSerie, buenasDe } from '../../evaluacion-comun.js';

// Calibrados con 4,000 partidas por mesa de bots (medir-ojo del 11 de octubre; privado/prototipos/herramientas/dudaapuesta-balance.mjs): quien duda a ciegas (azar) acierta ~38 % de sus
// dudas (el anuncio era falso), el calculador ~60 %, el prudente ~64 %, el retador ~88 %; los anuncios que no se cumplen son ~35-42 % incluso para un jugador honesto (al aceptar hay
// que subir la cantidad) y 88 % para el farolero; las apuestas medias van de 14 % a 25 % de las fichas totales. Con una muestra de 8 y estos umbrales, por pura suerte solo sale algo
// "notable" en menos del 12 % de los casos (una muestra de 5 daba ~27 %). Con modelos se vuelven a medir (los bots apuestan poco).
export const UMBRALES = {
  muestraMinima: 8, // decisiones propias minimas (de ese tipo) para hablar de ojo, farol o riesgo (una serie de 4 partidas da ~6 dudas por jugador: muchas veces "muestra chica")
  ojoAlto: 0.7, ojoBajo: 0.1, // dudas acertadas / dudas
  farolAlto: 0.7, farolBajo: 0.1, // anuncios que no se cumplian / anuncios
  riesgoAlto: 0.3, riesgoBajo: 0.1, // apuesta media sobre las fichas (de juego y de espacio) que tenia
  puntosArriba: 3, puntosAbajo: 1, // puntos del marcador por partida
};

const pct = (x) => `${Math.round(100 * x)} %`;

// acertadas = dudas sobre un anuncio que de verdad no se cumplia
export function fraseOjo(dudas, acertadas) {
  const cuenta = `${acertadas} de ${plural(dudas, 'duda', 'dudas')}`;
  if (dudas < UMBRALES.muestraMinima) return { valor: dudas ? redondeo(acertadas / dudas) : null, frase: `${dudas ? `acertó ${cuenta}` : 'no dudó'}: muestra todavía chica para decir más`, notable: false };
  const t = acertadas / dudas;
  if (t >= UMBRALES.ojoAlto) return { valor: redondeo(t), frase: `duda con ojo: acertó ${cuenta}`, notable: true };
  if (t <= UMBRALES.ojoBajo) return { valor: redondeo(t), frase: `duda a ciegas: acertó ${cuenta}`, notable: true };
  return { valor: redondeo(t), frase: `acertó ${cuenta}`, notable: false };
}

export function fraseFarol(anuncios, falsos) {
  const cuenta = `${falsos} de sus ${plural(anuncios, 'anuncio', 'anuncios')} no se cumplían`;
  if (anuncios < UMBRALES.muestraMinima) return { valor: anuncios ? redondeo(falsos / anuncios) : null, frase: `${anuncios ? cuenta : 'no hizo anuncios'}: muestra todavía chica para decir más`, notable: false };
  const t = falsos / anuncios;
  if (t >= UMBRALES.farolAlto) return { valor: redondeo(t), frase: `hace muchos faroles: ${cuenta}`, notable: true };
  if (t <= UMBRALES.farolBajo) return { valor: redondeo(t), frase: `solo anuncia lo que se cumple: ${cuenta}`, notable: true };
  return { valor: redondeo(t), frase: cuenta, notable: false };
}

export function fraseRiesgo({ apuestas, sumaRelativa, todo }) {
  if (apuestas < UMBRALES.muestraMinima) return { valor: null, frase: `${apuestas ? `${plural(apuestas, 'apuesta', 'apuestas')}` : 'sin apuestas'}: muestra todavía chica para decir más`, notable: false };
  const t = sumaRelativa / apuestas;
  const detalle = `pone ${pct(t)} de sus fichas en promedio${todo ? ` y apostó todo ${plural(todo, 'vez', 'veces')}` : ''}`;
  if (t >= UMBRALES.riesgoAlto) return { valor: redondeo(t), frase: `arriesga mucho: ${detalle}`, notable: true };
  if (t <= UMBRALES.riesgoBajo) return { valor: redondeo(t), frase: `apuesta con cautela: ${detalle}`, notable: true };
  return { valor: redondeo(t), frase: detalle, notable: false };
}

export function fraseConstancia({ partidas, piezas, medios, eliminados, puntosPorPartida, manosGanadas = 0, manosJugadas = 0 }) {
  const lugar = puntosPorPartida >= UMBRALES.puntosArriba ? 'arriba' : puntosPorPartida <= UMBRALES.puntosAbajo ? 'abajo' : 'a media tabla';
  const manos = manosJugadas ? `; ganó ${manosGanadas} de ${plural(manosJugadas, 'enfrentamiento', 'enfrentamientos')}` : '';
  const cuenta = `${plural(piezas, 'pieza', 'piezas')}, ${medios} en medio y ${plural(eliminados, 'eliminado', 'eliminados')} en ${plural(partidas, 'partida', 'partidas')}${manos}`;
  return { valor: redondeo(puntosPorPartida, 2), frase: `termina ${lugar}: ${cuenta}`, notable: lugar !== 'a media tabla' };
}

const PRIORIDAD = ['constancia', 'obediencia', 'farol', 'ojo', 'riesgo'];
// Un jugador sin id se identifica por su asiento; sin nombre se usa el id y, sin id, el asiento: nunca "undefined" en el texto.
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null); // un valor que no es numero no se cuenta (nunca NaN en el texto)
// Cada plaza de una partida con su clave: el id; si el mismo id ocupa dos asientos de la misma mesa (4 "azar"), la segunda en adelante lleva "#2", "#3"...
// y el nombre "(2)", "(3)", para que no se fundan en una sola. Con la mesa rotada cada plaza sigue siendo la misma de una partida a otra.
function plazasDe(p) {
  const vistos = new Map();
  return p.jugadores.map((j, s) => {
    if (!j) return null;
    const id = j.id ?? `asiento-${s}`, nombre = j.nombre ?? j.id ?? `Jugador ${s + 1}`;
    const k = (vistos.get(id) ?? 0) + 1;
    vistos.set(id, k);
    return { clave: k === 1 ? id : `${id}#${k}`, nombre: k === 1 ? nombre : `${nombre} (${k})` };
  });
}
const vacioDe = (plaza) => ({
  id: plaza.clave, nombre: plaza.nombre, partidas: 0, validas: 0, total: 0, puntos: 0, piezas: 0, medios: 0, eliminados: 0,
  dudas: 0, acertadas: 0, anuncios: 0, falsos: 0, apuestas: 0, sumaRelativa: 0, todo: 0, manosJugadas: 0, manosGanadas: 0,
});

export function evaluarSerie(partidas) {
  const vacia = { partidas: 0, jugadores: [], comentario: [] };
  const buenas = buenasDe(partidas);
  if (!buenas.length) return vacia;

  const por = new Map();
  for (const p of buenas) {
    const plazas = plazasDe(p);
    p.jugadores.forEach((j, s) => {
      if (!j) return;
      const a = por.get(plazas[s].clave) ?? vacioDe(plazas[s]);
      const m = p.metricas[s] ?? {};
      a.partidas++;
      a.validas += m.ordenesValidas ?? 0;
      a.total += m.ordenesTotal ?? 0;
      a.puntos += m.puntos ?? 0;
      a.manosJugadas += m.manosJugadas ?? 0;
      a.manosGanadas += m.manosGanadas ?? 0;
      if (m.puesto === 'pieza') a.piezas++;
      else if (m.puesto === 'medio') a.medios++;
      else if (m.puesto === 'eliminado') a.eliminados++;
      por.set(plazas[s].clave, a);
    });
    const de = (s) => (plazas[s] ? por.get(plazas[s].clave) : null);
    let duda = null; // la duda de la mano en curso, si la eligio la IA: se cuenta cuando se sabe si el anuncio era falso
    for (const r of p.rondas) {
      if (!r || typeof r.asiento !== 'number') continue;
      const s = r.asiento, a = de(s);
      const eligio = a && r.invalidas?.[s] === false; // solo decisiones que eligio la IA
      const real = (color) => num(r.oculto?.cuentas?.[color]);
      if (eligio && (r.accion === 'anunciar' || r.accion === 'aceptar') && r.anuncio && real(r.anuncio.color) !== null && num(r.anuncio.cantidad) !== null) {
        a.anuncios++;
        if (real(r.anuncio.color) < r.anuncio.cantidad) a.falsos++;
      }
      const tenia = num(r.tenia), f = num(r.apuesta?.fichas ?? 0), e = num(r.apuesta?.espacios ?? 0);
      const total = r.apuesta && f !== null && e !== null ? f + e : null;
      if (eligio && tenia > 0 && total !== null) {
        a.apuestas++;
        a.sumaRelativa += Math.min(1, total / tenia);
        if (total >= tenia) a.todo++;
      }
      if (r.accion === 'dudar') duda = eligio ? s : null;
      if (r.resolucion) {
        const d = de(r.resolucion.dudador);
        if (duda !== null && d && duda === r.resolucion.dudador) {
          d.dudas++;
          // acierta quien duda de un anuncio que de verdad no se cumplia (aunque el rival se retire); sin cartas en el registro, quien gano
          const cuenta = real(r.resolucion.color), pedida = num(r.resolucion.cantidad);
          const falso = cuenta !== null && pedida !== null ? cuenta < pedida : r.resolucion.ganador === duda;
          if (falso) d.acertadas++;
        }
        duda = null;
      }
    }
  }
  if (!por.size) return vacia; // partidas con jugadores o rondas rotos: nada que evaluar (comentarioDeSerie necesita al menos un jugador)

  const jugadores = [...por.values()].map((a) => {
    const puntosPorPartida = redondeo(a.puntos / a.partidas, 2);
    const caracteristicas = {
      obediencia: fraseObediencia(a.validas, a.total),
      ojo: fraseOjo(a.dudas, a.acertadas),
      farol: fraseFarol(a.anuncios, a.falsos),
      riesgo: fraseRiesgo(a),
      constancia: fraseConstancia({ ...a, puntosPorPartida }),
    };
    const notables = PRIORIDAD.filter((k) => caracteristicas[k].notable).slice(0, 3).map((k) => caracteristicas[k].frase);
    return {
      id: a.id, nombre: a.nombre, partidas: a.partidas, puntosPorPartida,
      conteos: { piezas: a.piezas, medios: a.medios, eliminados: a.eliminados },
      caracteristicas,
      destacadas: notables.length ? notables : [caracteristicas.constancia.frase],
    };
  }).sort((x, y) => y.puntosPorPartida - x.puntosPorPartida);

  const n = buenas.length;
  return { partidas: n, jugadores, comentario: comentarioDeSerie({ juego: 'Duda y apuesta', jugadores, n, vuelta: JUGADORES }) };
}

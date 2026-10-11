// Evaluacion al final de una SERIE de Mayor o menor (decision del usuario, 11 de octubre de 2026: no hay torneo general; al final de cada juego se
// evaluan caracteristicas de las IAs y se comenta el resultado segun ellas). Lo calcula el codigo desde los datos guardados: sin llamadas extra, sin
// cambiar ni ocultar ninguna jugada. El texto es PUBLICO (lleva acentos).
//
// Cuentan solo las jugadas que ELIGIO la IA (invalidas[s] === false): una jugada de reemplazo la puso el motor y eso lo mide la obediencia.
// Umbrales fijos, calibrados con partidas de bots (privado/prototipos/herramientas/mayormenor-balance.mjs); ver la seccion 6 del spec.

import { JUGADORES } from './constantes.js';
import { plural, redondeo, fraseObediencia, comentarioDeSerie, buenasDe } from '../../evaluacion-comun.js';

export const UMBRALES = {
  lecturaAlta: 0.6, lecturaBaja: 0.4, // apuestas acertadas / apuestas con resultado
  audaciaAlta: 0.5, audaciaBaja: 0.15, // parte de sus fichas que apuesta por ronda
  provechoAlto: 2.5, provechoBajo: 0.8, // fichas ganadas por ronda como activo (azar 1.67; prudente 1.00; contrario 0.55; temerario > 4)
  puntosArriba: 3, puntosAbajo: 1, // puntos de marcador por partida (el promedio de la mesa es 2.0)
};
const dec = (x) => x.toFixed(1);

export function fraseLectura(aciertos, apuestas) {
  if (!apuestas) return { valor: null, frase: 'no hubo apuestas propias con resultado que medir', notable: false };
  const t = aciertos / apuestas;
  const cuenta = `${aciertos} de ${apuestas} apuestas`;
  if (t >= UMBRALES.lecturaAlta || t <= UMBRALES.lecturaBaja) {
    // tirando una moneda tambien se acierta cerca de la mitad, con mucho vaiven si hay pocas apuestas: solo es habilidad lo que se aleja de 0.5
    // mas de 1.96 errores estandar (prueba binomial al 95 %)
    if (Math.abs(t - 0.5) <= (1.96 * 0.5) / Math.sqrt(apuestas)) return { valor: redondeo(t), frase: `${cuenta}: muestra todavía chica para decir más`, notable: false };
    return t >= UMBRALES.lecturaAlta
      ? { valor: redondeo(t), frase: `leyó bien las cartas que faltaban (${cuenta})`, notable: true }
      : { valor: redondeo(t), frase: `falló más de lo normal (${cuenta})`, notable: true };
  }
  return { valor: redondeo(t), frase: `acertó lo normal (${cuenta})`, notable: false };
}

export function fraseAudacia(media, todo, elegidas) {
  if (!elegidas) return { valor: null, frase: 'no hubo apuestas propias que medir', notable: false };
  const pct = Math.round(media * 100);
  const extra = todo ? `, y lo apostó todo ${plural(todo, 'vez', 'veces')}` : '';
  if (media >= UMBRALES.audaciaAlta) return { valor: redondeo(media), frase: `apuesta fuerte: ${pct} % de sus fichas por ronda${extra}`, notable: true };
  if (media <= UMBRALES.audaciaBaja) return { valor: redondeo(media), frase: `juega seguro: ${pct} % de sus fichas por ronda${extra}`, notable: true };
  return { valor: redondeo(media), frase: `apuesta con medida: ${pct} % de sus fichas por ronda${extra}`, notable: false };
}

export function fraseProvecho(fichas, rondas, sinSuperar) {
  if (!rondas) return { valor: null, frase: 'no hubo rondas propias como activo que medir', notable: false };
  const v = fichas / rondas;
  const cuenta = `${dec(v)} fichas por ronda como activo`;
  const regalos = sinSuperar ? ` (jugó ${plural(sinSuperar, 'carta', 'cartas')} que no superaba al crupier)` : '';
  if (v >= UMBRALES.provechoAlto) return { valor: redondeo(v), frase: `exprime cada ronda: ${cuenta}${regalos}`, notable: true };
  if (v <= UMBRALES.provechoBajo) return { valor: redondeo(v), frase: `regala rondas: ${cuenta}${regalos}`, notable: true };
  return { valor: redondeo(v), frase: `aprovecha lo normal: ${cuenta}${regalos}`, notable: false };
}

export function fraseConstancia({ partidas, victorias, empates, derrotas, puntosPorPartida, arriba, rondas }) {
  const lugar = puntosPorPartida >= UMBRALES.puntosArriba ? 'arriba' : puntosPorPartida <= UMBRALES.puntosAbajo ? 'abajo' : 'a media tabla';
  const pctArriba = rondas ? Math.round((100 * arriba) / rondas) : 0;
  const cuenta = `${plural(victorias, 'victoria', 'victorias')}, ${plural(empates, 'empate', 'empates')} y ${plural(derrotas, 'derrota', 'derrotas')} en ${plural(partidas, 'partida', 'partidas')}; iba arriba en fichas ${pctArriba} % de las rondas`;
  return { valor: redondeo(puntosPorPartida, 2), frase: `termina ${lugar}: ${cuenta}`, notable: lugar !== 'a media tabla' };
}

const PRIORIDAD = ['constancia', 'obediencia', 'lectura', 'provecho', 'audacia'];
const vacioDe = (j) => ({
  id: j.id, nombre: j.nombre, partidas: 0, validas: 0, total: 0, puntos: 0, victorias: 0, empates: 0, derrotas: 0, rondas: 0, arriba: 0,
  elegidasApuesta: 0, fraccion: 0, todo: 0, conResultado: 0, aciertos: 0, elegidasActivo: 0, fichasActivo: 0, sinSuperar: 0,
});

export function evaluarSerie(partidas) {
  const vacia = { partidas: 0, jugadores: [], comentario: [] };
  const buenas = buenasDe(partidas);
  if (!buenas.length) return vacia;

  const por = new Map();
  for (const p of buenas) {
    p.jugadores.forEach((j, s) => {
      if (!j) return;
      const a = por.get(j.id) ?? vacioDe(j);
      const m = p.metricas[s] ?? {};
      a.partidas++;
      a.validas += m.ordenesValidas ?? 0;
      a.total += m.ordenesTotal ?? 0;
      a.puntos += m.puntos ?? 0;
      if (m.puesto === 'gana') a.victorias++;
      else if (m.puesto === 'empata') a.empates++;
      else if (m.puesto === 'pierde') a.derrotas++;
      por.set(j.id, a);
    });
    for (const r of p.rondas) {
      if (!r) continue;
      p.jugadores.forEach((j, s) => {
        if (!j) return;
        const a = por.get(j.id);
        a.rondas++;
        if (r.fichas?.[s] > r.fichas?.[1 - s]) a.arriba++;
        if (r.invalidas?.[s] !== false) return; // solo jugadas que eligio la IA
        if (r.activo === s) {
          a.elegidasActivo++;
          a.fichasActivo += r.ganaActivo ?? 0;
          if (r.carta <= r.crupier) a.sinSuperar++;
        } else {
          a.elegidasApuesta++;
          a.fraccion += r.apuesta / (r.fichasAntes?.[s] || 1);
          if (r.apostoTodo) a.todo++;
          if (r.acierto === true || r.acierto === false) {
            a.conResultado++;
            if (r.acierto) a.aciertos++;
          }
        }
      });
    }
  }
  if (!por.size) return vacia; // partidas con jugadores o rondas rotos: nada que evaluar (comentarioDeSerie necesita al menos un jugador)

  const jugadores = [...por.values()].map((a) => {
    const puntosPorPartida = redondeo(a.puntos / a.partidas, 2);
    const caracteristicas = {
      obediencia: fraseObediencia(a.validas, a.total),
      lectura: fraseLectura(a.aciertos, a.conResultado),
      audacia: fraseAudacia(a.elegidasApuesta ? a.fraccion / a.elegidasApuesta : 0, a.todo, a.elegidasApuesta),
      provecho: fraseProvecho(a.fichasActivo, a.elegidasActivo, a.sinSuperar),
      constancia: fraseConstancia({ ...a, puntosPorPartida }),
    };
    const notables = PRIORIDAD.filter((k) => caracteristicas[k].notable).slice(0, 3).map((k) => caracteristicas[k].frase);
    return {
      id: a.id, nombre: a.nombre, partidas: a.partidas, puntosPorPartida,
      conteos: { victorias: a.victorias, empates: a.empates, derrotas: a.derrotas },
      caracteristicas,
      destacadas: notables.length ? notables : [caracteristicas.constancia.frase],
    };
  }).sort((x, y) => y.puntosPorPartida - x.puntosPorPartida);

  const n = buenas.length;
  return { partidas: n, jugadores, comentario: comentarioDeSerie({ juego: 'Mayor o menor', jugadores, n, vuelta: JUGADORES }) };
}

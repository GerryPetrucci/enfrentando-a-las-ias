// Evaluacion al final de una SERIE de El numero solitario (decision del usuario, 11 de octubre de 2026: no hay torneo general; al final de
// cada juego se evaluan caracteristicas de las IAs y se comenta el resultado segun ellas). Lo calcula el codigo desde los datos guardados:
// sin llamadas extra, sin cambiar ni ocultar ninguna jugada. El texto es PUBLICO (lleva acentos). Spec: seccion 6.
//
// Las jugadas que puso el motor porque una IA contesto mal (invalidas[s] === true) NO cuentan en lectura, audacia ni punteria: miden
// decisiones de la IA, no sus fallos de formato (esos van en la obediencia).
// Los umbrales son fijos y se calibraron con 3,000 partidas de bots: con cinco jugadores al azar la tasa base de choque es 0.32, la de carta
// alta 0.50 y el valor medio de una victoria 2.78.

import { JUGADORES } from './constantes.js';
import { plural, redondeo, fraseObediencia, comentarioDeSerie, buenasDe } from '../../evaluacion-comun.js';

export { fraseObediencia }; // las pruebas y otros juegos la piden desde aqui o desde evaluacion-comun.js

export const UMBRALES = {
  choqueBajo: 0.2, choqueAlto: 0.4, // tasa de cartas anuladas
  audaciaAlta: 0.6, audaciaBaja: 0.25, // tasa de jugar la carta mas alta de su pareja
  valorAlto: 3.5, valorBajo: 2, // valor medio de las rondas ganadas
  puntosArriba: 3, puntosAbajo: 1.5, // puntos de marcador por partida (el promedio de la mesa es 2.4)
};

const dec = (x) => x.toFixed(1);
const SIN_RONDAS = 'no jugó rondas propias que medir';

export function fraseLectura(choques, rondas) {
  if (!rondas) return { valor: null, frase: SIN_RONDAS, notable: false };
  const t = choques / rondas;
  const cuenta = `${choques} de ${rondas} cartas anuladas`;
  if (t < UMBRALES.choqueBajo) return { valor: redondeo(t), frase: `evitó los choques (${cuenta})`, notable: true };
  if (t > UMBRALES.choqueAlto) return { valor: redondeo(t), frase: `chocó más de lo normal (${cuenta})`, notable: true };
  return { valor: redondeo(t), frase: `chocó lo normal (${cuenta})`, notable: false };
}

export function fraseAudacia(altas, rondas) {
  if (!rondas) return { valor: null, frase: SIN_RONDAS, notable: false };
  const t = altas / rondas;
  if (t >= UMBRALES.audaciaAlta) return { valor: redondeo(t), frase: `juega al señuelo: la carta más alta de su pareja en ${altas} de ${rondas} rondas`, notable: true };
  if (t <= UMBRALES.audaciaBaja) return { valor: redondeo(t), frase: `apuesta por la baja: la carta más alta de su pareja solo en ${altas} de ${rondas} rondas`, notable: true };
  return { valor: redondeo(t), frase: `mezcla altas y bajas (la más alta en ${altas} de ${rondas} rondas)`, notable: false };
}

export function frasePunteria(victorias, puntosGanados) {
  if (!victorias) return { valor: null, victorias: 0, frase: 'no ganó ninguna ronda', notable: true };
  const v = puntosGanados / victorias;
  const cuenta = `${plural(victorias, 'ronda ganada', 'rondas ganadas')}, valor medio ${dec(v)}`;
  if (v >= UMBRALES.valorAlto) return { valor: redondeo(v), victorias, frase: `gana alto: ${cuenta}`, notable: true };
  if (v <= UMBRALES.valorBajo) return { valor: redondeo(v), victorias, frase: `gana barato: ${cuenta}`, notable: true };
  return { valor: redondeo(v), victorias, frase: `gana con números medios: ${cuenta}`, notable: false };
}

export function fraseConstancia({ partidas, piezas, salvos, medios, eliminados, puntosPorPartida }) {
  const lugar = puntosPorPartida >= UMBRALES.puntosArriba ? 'arriba' : puntosPorPartida <= UMBRALES.puntosAbajo ? 'abajo' : 'a media tabla';
  const cuenta = `${plural(piezas, 'pieza', 'piezas')}, ${salvos} a salvo, ${medios} en medio y ${plural(eliminados, 'eliminado', 'eliminados')} en ${plural(partidas, 'partida', 'partidas')}`;
  return { valor: redondeo(puntosPorPartida, 2), frase: `termina ${lugar}: ${cuenta}`, notable: lugar !== 'a media tabla' };
}

const PRIORIDAD = ['constancia', 'obediencia', 'punteria', 'lectura', 'audacia'];
const vacioDe = (j) => ({
  id: j.id, nombre: j.nombre, partidas: 0, validas: 0, total: 0, puntos: 0,
  piezas: 0, salvos: 0, medios: 0, eliminados: 0, rondas: 0, choques: 0, altas: 0, victorias: 0, puntosGanados: 0,
});

// partidas: las de una serie (lo que guarda la consola en `partidas`). Las cortadas no entran.
export function evaluarSerie(partidas) {
  const vacia = { partidas: 0, jugadores: [], comentario: [] };
  const buenas = buenasDe(partidas);
  if (!buenas.length) return vacia;

  const por = new Map();
  for (const p of buenas) {
    p.jugadores.forEach((j, s) => {
      const a = por.get(j.id) ?? vacioDe(j);
      const m = p.metricas[s] ?? {};
      a.partidas++;
      a.validas += m.ordenesValidas ?? 0;
      a.total += m.ordenesTotal ?? 0;
      a.puntos += m.puntos ?? 0;
      if (m.puesto === 'pieza') a.piezas++;
      else if (m.puesto === 'salvo') a.salvos++;
      else if (m.puesto === 'medio') a.medios++;
      else if (m.puesto === 'eliminado') a.eliminados++;
      por.set(j.id, a);
    });
    for (const r of p.rondas) {
      if (r.fase !== 2 || !Array.isArray(r.marcas) || !Array.isArray(r.parejas)) continue;
      p.jugadores.forEach((j, s) => {
        if (r.marcas[s] == null || r.invalidas?.[s] !== false) return; // solo marcas que eligio la IA
        const a = por.get(j.id);
        a.rondas++;
        if (r.anuladas?.[s]) a.choques++;
        if (r.parejas[s] && r.marcas[s] === Math.max(...r.parejas[s])) a.altas++;
        if (r.ganador === s) { a.victorias++; a.puntosGanados += r.numero; }
      });
    }
  }

  const jugadores = [...por.values()].map((a) => {
    const puntosPorPartida = redondeo(a.puntos / a.partidas, 2);
    const caracteristicas = {
      obediencia: fraseObediencia(a.validas, a.total),
      lectura: fraseLectura(a.choques, a.rondas),
      audacia: fraseAudacia(a.altas, a.rondas),
      punteria: frasePunteria(a.victorias, a.puntosGanados),
      constancia: fraseConstancia({ ...a, puntosPorPartida }),
    };
    const notables = PRIORIDAD.filter((k) => caracteristicas[k].notable).slice(0, 3).map((k) => caracteristicas[k].frase);
    return {
      id: a.id, nombre: a.nombre, partidas: a.partidas, puntosPorPartida,
      conteos: { piezas: a.piezas, salvos: a.salvos, medios: a.medios, eliminados: a.eliminados },
      caracteristicas,
      destacadas: notables.length ? notables : [caracteristicas.constancia.frase],
    };
  }).sort((x, y) => y.puntosPorPartida - x.puntosPorPartida);

  const n = buenas.length;
  return { partidas: n, jugadores, comentario: comentarioDeSerie({ juego: 'El número solitario', jugadores, n, vuelta: JUGADORES }) };
}

// Evaluacion al final de una SERIE de Subasta de tiempo (decision del usuario, 11 de octubre de 2026: no hay torneo general; al final de cada
// juego se evaluan caracteristicas de las IAs y se comenta el resultado segun ellas). Lo calcula el codigo desde los datos guardados: sin
// llamadas extra, sin cambiar ni ocultar ninguna jugada. El texto es PUBLICO (lleva acentos).
//
// Cuentan solo las apuestas que ELIGIO la IA (invalidas[s] === false): una respuesta ilegible equivale a retirarse, pero eso lo mide la
// obediencia, no la prudencia.
// Umbrales fijos, calibrados con 2,000 partidas de bots: repartir el banco parejo gasta ~52 % a la mitad; con cinco jugadores al azar se
// pagan ~155 segundos por ficha.

import { JUGADORES, BANCO, segundos } from './constantes.js';
import { plural, redondeo, fraseObediencia, comentarioDeSerie, buenasDe } from '../../evaluacion-comun.js';

export const UMBRALES = {
  ritmoAlto: 0.75, ritmoBajo: 0.3, // parte del banco gastada al llegar a la subasta 10
  retiroAlto: 0.5, retiroBajo: 0.1, // parte de las subastas en que se retira
  fichaBarata: 80, fichaCara: 180, // segundos apostados por ficha ganada
  puntosArriba: 3, puntosAbajo: 1, // puntos de marcador por partida (el promedio de la mesa es 2.0)
};
const MITAD = 10;
const dec = (x) => x.toFixed(1);

export function fraseRitmo(gastado) {
  if (gastado === null || gastado === undefined) return { valor: null, frase: 'no hubo subastas que medir', notable: false };
  const pct = Math.round(gastado * 100);
  if (gastado >= UMBRALES.ritmoAlto) return { valor: redondeo(gastado), frase: `gasta rápido: ${pct} % de su banco ya estaba gastado al llegar a la subasta ${MITAD}`, notable: true };
  if (gastado <= UMBRALES.ritmoBajo) return { valor: redondeo(gastado), frase: `guarda su tiempo: solo ${pct} % de su banco gastado al llegar a la subasta ${MITAD}`, notable: true };
  return { valor: redondeo(gastado), frase: `administra el banco (${pct} % gastado a la mitad)`, notable: false };
}

export function frasePrudencia(retiradas, elegidas) {
  if (!elegidas) return { valor: null, frase: 'no hubo apuestas propias que medir', notable: false };
  const t = retiradas / elegidas;
  const cuenta = `${retiradas} de ${elegidas} subastas`;
  if (t >= UMBRALES.retiroAlto) return { valor: redondeo(t), frase: `se retira mucho (${cuenta})`, notable: true };
  if (t <= UMBRALES.retiroBajo) return { valor: redondeo(t), frase: `casi nunca se retira (${cuenta})`, notable: false };
  return { valor: redondeo(t), frase: `se retira de vez en cuando (${cuenta})`, notable: false };
}

export function fraseEficiencia(victorias, segundosApostados) {
  if (!victorias) return { valor: null, victorias: 0, frase: `no ganó ninguna subasta (apostó ${dec(segundosApostados)} segundos en total)`, notable: true };
  const v = segundosApostados / victorias;
  const cuenta = `${dec(v)} segundos por ficha (${plural(victorias, 'ficha', 'fichas')})`;
  if (v <= UMBRALES.fichaBarata) return { valor: redondeo(v), victorias, frase: `gana barato: ${cuenta}`, notable: true };
  if (v >= UMBRALES.fichaCara) return { valor: redondeo(v), victorias, frase: `paga caro: ${cuenta}`, notable: true };
  return { valor: redondeo(v), victorias, frase: `paga lo normal: ${cuenta}`, notable: false };
}

export function fraseConstancia({ partidas, piezas, medios, eliminados, puntosPorPartida }) {
  const lugar = puntosPorPartida >= UMBRALES.puntosArriba ? 'arriba' : puntosPorPartida <= UMBRALES.puntosAbajo ? 'abajo' : 'a media tabla';
  const cuenta = `${plural(piezas, 'pieza', 'piezas')}, ${medios} en medio y ${plural(eliminados, 'eliminado', 'eliminados')} en ${plural(partidas, 'partida', 'partidas')}`;
  return { valor: redondeo(puntosPorPartida, 2), frase: `termina ${lugar}: ${cuenta}`, notable: lugar !== 'a media tabla' };
}

const PRIORIDAD = ['constancia', 'obediencia', 'eficiencia', 'ritmo', 'prudencia'];
const vacioDe = (j) => ({
  id: j.id, nombre: j.nombre, partidas: 0, validas: 0, total: 0, puntos: 0, piezas: 0, medios: 0, eliminados: 0,
  gastado: 0, conRitmo: 0, elegidas: 0, retiradas: 0, segundos: 0, victorias: 0,
});

export function evaluarSerie(partidas) {
  const vacia = { partidas: 0, jugadores: [], comentario: [] };
  const buenas = buenasDe(partidas);
  if (!buenas.length) return vacia;

  const por = new Map();
  for (const p of buenas) {
    // el banco al llegar a la subasta 10 (o el ultimo conocido, si la partida acabo antes)
    const mitad = p.rondas.find((r) => r.subasta === MITAD) ?? p.rondas.at(-1);
    p.jugadores.forEach((j, s) => {
      const a = por.get(j.id) ?? vacioDe(j);
      const m = p.metricas[s] ?? {};
      a.partidas++;
      a.validas += m.ordenesValidas ?? 0;
      a.total += m.ordenesTotal ?? 0;
      a.puntos += m.puntos ?? 0;
      if (m.puesto === 'pieza') a.piezas++;
      else if (m.puesto === 'medio') a.medios++;
      else if (m.puesto === 'eliminado') a.eliminados++;
      const banco = mitad?.oculto?.bancos?.[s];
      if (typeof banco === 'number') { a.gastado += (segundos(BANCO) - banco) / segundos(BANCO); a.conRitmo++; }
      por.set(j.id, a);
    });
    for (const r of p.rondas) {
      p.jugadores.forEach((j, s) => {
        const apuesta = r.oculto?.apuestas?.[s];
        if (apuesta === null || apuesta === undefined || r.invalidas?.[s] !== false) return; // solo apuestas que eligio la IA
        const a = por.get(j.id);
        a.elegidas++;
        if (apuesta === 0) a.retiradas++;
        a.segundos += apuesta;
        if (r.ganador === s) a.victorias++;
      });
    }
  }

  const jugadores = [...por.values()].map((a) => {
    const puntosPorPartida = redondeo(a.puntos / a.partidas, 2);
    const caracteristicas = {
      obediencia: fraseObediencia(a.validas, a.total),
      ritmo: fraseRitmo(a.conRitmo ? a.gastado / a.conRitmo : null),
      prudencia: frasePrudencia(a.retiradas, a.elegidas),
      eficiencia: fraseEficiencia(a.victorias, a.segundos),
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
  return { partidas: n, jugadores, comentario: comentarioDeSerie({ juego: 'Subasta de tiempo', jugadores, n, vuelta: JUGADORES }) };
}

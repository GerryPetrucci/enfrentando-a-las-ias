// Evaluacion al final de una SERIE de Triple dado (decision del usuario, 11 de octubre de 2026: no hay torneo general; al final de cada juego se evaluan
// caracteristicas de las IAs y se comenta el resultado segun ellas). Lo calcula el codigo desde los datos guardados: sin llamadas extra, sin cambiar ni
// ocultar ninguna jugada. El texto es PUBLICO (lleva acentos).
//
// Cuentan solo las jugadas que ELIGIO la IA (invalidas[s] === false): una tarjeta o unos dados de reemplazo los puso el motor y eso lo mide la obediencia.
// La tarjeta de la ronda 4 la pone el juego y no cuenta. Una tasa solo es notable con una muestra minima: tirando una moneda tambien se acierta a veces.
// Umbrales fijos, calibrados con partidas de bots (privado/prototipos/herramientas/tripledado-balance.mjs); ver la seccion 6 del spec.

import { JUGADORES } from './constantes.js';
import { plural, redondeo, fraseObediencia, comentarioDeSerie, buenasDe } from '../../evaluacion-comun.js';

export const UMBRALES = {
  muestraMinima: 8, // tarjetas propias minimas (en una serie de 4 partidas hay 12) para hablar de puntería
  // Calibrados con 5,000 partidas y 400 series de bots (privado/prototipos/herramientas/tripledado-balance.mjs). Puntería base de quien tira una moneda: 0.25, asi que con
  // 12 tarjetas por serie 1 acierto o menos sale por pura suerte a ~16 % de las series; solo cero aciertos (3 %) o 8 o mas (0.3 %) se destacan.
  punteriaAlta: 0.6, punteriaBaja: 0.05, // aciertos / tarjetas propias
  // Enfrentamiento medio (1 a 3) en que usa sus ocultos: el azar promedia 2.0 y el goloso (que los usa cuando ayudan) 2.2 +- 0.2; el reservado y el calculador, 3.0.
  ocultoTemprano: 1.5, ocultoTarde: 2.6,
  puntosArriba: 3, puntosAbajo: 1, // puntos de marcador por partida (el promedio de la mesa es 2.0)
};
const dec = (x) => x.toFixed(1);

export function frasePunteria(aciertos, predicciones) {
  if (!predicciones) return { valor: null, frase: 'no hubo tarjetas propias que medir', notable: false };
  const t = aciertos / predicciones;
  const cuenta = `${aciertos} de ${predicciones} tarjetas`;
  if (predicciones < UMBRALES.muestraMinima) return { valor: redondeo(t), frase: `${cuenta}: muestra todavía chica para decir más`, notable: false };
  if (t >= UMBRALES.punteriaAlta) return { valor: redondeo(t), frase: `lee bien su puntuación: acertó ${cuenta}`, notable: true };
  if (t <= UMBRALES.punteriaBaja) return { valor: redondeo(t), frase: `le cuesta predecir: acertó ${cuenta}`, notable: true };
  return { valor: redondeo(t), frase: `acertó ${cuenta}`, notable: false };
}

// zeroElegido = partidas en que la IA eligio el ZERO; zeroForzado = partidas en que el ZERO fue la tarjeta que se pone sola en la ronda 4; ceros = ZERO acertados.
// Cada partida cae en una de tres: lo eligio, le quedo para la ronda 4, o se lo puso el juego por una respuesta ilegal (no se puede decir que "lo guardo").
export function fraseRiesgo({ partidas, predicciones, zeroElegido, zeroForzado = 0, ceros }) {
  if (!partidas || !predicciones) return { valor: null, frase: 'no hubo tarjetas propias que medir', notable: false };
  if (zeroElegido) {
    const logro = ceros ? `lo logró ${plural(ceros, 'vez', 'veces')}` : 'no lo logró';
    return { valor: redondeo(ceros / zeroElegido), frase: `fue por el ZERO en ${zeroElegido} de ${partidas} partidas y ${logro}`, notable: true };
  }
  if (zeroForzado) {
    const cuantas = zeroForzado < partidas ? ` en ${zeroForzado} de ${partidas} partidas` : '';
    return { valor: 0, frase: `guardó el ZERO hasta el final (se le puso solo en la ronda 4)${cuantas}`, notable: true };
  }
  return { valor: null, frase: 'su ZERO lo puso el juego por una respuesta ilegal', notable: false };
}

// ocultos = dados rojo o azul que uso en enfrentamientos que eligio; sumaPos = suma del numero de enfrentamiento (1 a 3) de cada uno.
export function fraseOcultos({ partidas, elegidasEnfr, ocultos, sumaPos }) {
  if (!partidas || !elegidasEnfr) return { valor: null, frase: 'no hubo jugadas propias que medir', notable: false };
  if (!ocultos) return { valor: 0, frase: 'no usó ningún dado oculto', notable: true };
  const prom = sumaPos / ocultos;
  const detalle = `${dec(ocultos / partidas)} ocultos por partida, enfrentamiento ${dec(prom)} en promedio`;
  if (prom <= UMBRALES.ocultoTemprano) return { valor: redondeo(prom), frase: `gasta los ocultos de entrada (${detalle})`, notable: true };
  if (prom >= UMBRALES.ocultoTarde) return { valor: redondeo(prom), frase: `guarda los ocultos para el final (${detalle})`, notable: true };
  return { valor: redondeo(prom), frase: `reparte los ocultos (${detalle})`, notable: false };
}

export function fraseConstancia({ partidas, piezas, medios, eliminados, puntosPorPartida }) {
  const lugar = puntosPorPartida >= UMBRALES.puntosArriba ? 'arriba' : puntosPorPartida <= UMBRALES.puntosAbajo ? 'abajo' : 'a media tabla';
  const cuenta = `${plural(piezas, 'pieza', 'piezas')}, ${medios} en medio y ${plural(eliminados, 'eliminado', 'eliminados')} en ${plural(partidas, 'partida', 'partidas')}`;
  return { valor: redondeo(puntosPorPartida, 2), frase: `termina ${lugar}: ${cuenta}`, notable: lugar !== 'a media tabla' };
}

const PRIORIDAD = ['constancia', 'obediencia', 'riesgo', 'punteria', 'ocultos'];
// Un jugador sin id se identifica por su asiento; sin nombre se usa el id y, sin id, el asiento: nunca "undefined" en el texto.
const claveDe = (j, s) => j.id ?? `asiento-${s}`;
const vacioDe = (j, s) => ({
  id: claveDe(j, s), nombre: j.nombre ?? j.id ?? `Jugador ${s + 1}`, partidas: 0, validas: 0, total: 0, puntos: 0, piezas: 0, medios: 0, eliminados: 0,
  predicciones: 0, aciertos: 0, zeroElegido: 0, zeroForzado: 0, ceros: 0, elegidasEnfr: 0, ocultos: 0, sumaPos: 0,
});

export function evaluarSerie(partidas) {
  const vacia = { partidas: 0, jugadores: [], comentario: [] };
  const buenas = buenasDe(partidas);
  if (!buenas.length) return vacia;

  const por = new Map();
  for (const p of buenas) {
    p.jugadores.forEach((j, s) => {
      if (!j) return;
      const a = por.get(claveDe(j, s)) ?? vacioDe(j, s);
      const m = p.metricas[s] ?? {};
      a.partidas++;
      a.validas += m.ordenesValidas ?? 0;
      a.total += m.ordenesTotal ?? 0;
      a.puntos += m.puntos ?? 0;
      if (m.puesto === 'pieza') a.piezas++;
      else if (m.puesto === 'medio') a.medios++;
      else if (m.puesto === 'eliminado') a.eliminados++;
      por.set(claveDe(j, s), a);
    });
    const de = (s) => (p.jugadores[s] ? por.get(claveDe(p.jugadores[s], s)) : null);
    let eligio = []; // quien eligio su tarjeta en la ronda en curso (la forzada de la ronda 4 y las de reemplazo no)
    for (const r of p.rondas) {
      if (!r) continue;
      if (r.fase === 'prediccion') {
        const tarjetas = r.oculto?.tarjetas ?? [];
        eligio = p.jugadores.map((_, s) => r.invalidas?.[s] === false);
        eligio.forEach((e, s) => {
          if (e && tarjetas[s] === 'ZERO' && de(s)) de(s).zeroElegido++;
        });
        if (r.forzada) tarjetas.forEach((t, s) => { if (t === 'ZERO' && de(s)) de(s).zeroForzado++; }); // la que se pone sola en la ronda 4
      } else if (r.fase === 'jugada') {
        p.jugadores.forEach((_, s) => {
          const a = de(s);
          if (!a || r.invalidas?.[s] !== false) return; // solo jugadas que eligio la IA
          a.elegidasEnfr++;
          const o = r.combos?.[s]?.ocultos?.length ?? 0;
          a.ocultos += o;
          a.sumaPos += o * (r.enfrentamiento ?? 0);
        });
        if (r.cierre) {
          p.jugadores.forEach((_, s) => {
            const a = de(s);
            if (!a || !eligio[s]) return;
            a.predicciones++;
            if (r.cierre.aciertos?.[s]) {
              a.aciertos++;
              if (r.cierre.tarjetas?.[s] === 'ZERO') a.ceros++;
            }
          });
        }
      }
    }
  }
  if (!por.size) return vacia; // partidas con jugadores o rondas rotos: nada que evaluar (comentarioDeSerie necesita al menos un jugador)

  const jugadores = [...por.values()].map((a) => {
    const puntosPorPartida = redondeo(a.puntos / a.partidas, 2);
    const caracteristicas = {
      obediencia: fraseObediencia(a.validas, a.total),
      punteria: frasePunteria(a.aciertos, a.predicciones),
      riesgo: fraseRiesgo(a),
      ocultos: fraseOcultos(a),
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
  return { partidas: n, jugadores, comentario: comentarioDeSerie({ juego: 'Triple dado', jugadores, n, vuelta: JUGADORES }) };
}

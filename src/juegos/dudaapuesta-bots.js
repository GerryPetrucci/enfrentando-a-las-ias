// Estrategias de control de Duda y apuesta. No son IAs: sirven para probar el motor y para medir el juego. Leen el estado COMPLETO pero solo usan lo que veria su jugador
// (sus cartas y lo publico), nunca lo modifican y devuelven una respuesta cruda como la de una IA. El azar usa solo el rng de su asiento.

import { COLORES, JUGADORES } from './dudaapuesta/constantes.js';
import { totalCartas, puedeAceptar, limiteApuesta } from './dudaapuesta/estado.js';
import { pTotalAlMenos, cuentoYo } from './dudaapuesta/probabilidad.js';

const razon = 'bot de control';
const suma = (ap) => ap.fichas + ap.espacios;
const mejorColor = (E, s) => COLORES.reduce((b, c) => (cuentoYo(E, s, c) > cuentoYo(E, s, b) ? c : b), COLORES[0]);

// La mayor cantidad n >= minima con P(hay al menos n) >= umbral (si ni la minima llega, la minima), mas `extra` de farol.
function cantidadHasta(E, s, color, minima, umbral, extra) {
  const tope = totalCartas(E);
  let n = Math.min(minima, tope);
  while (n + 1 <= tope && pTotalAlMenos(E, s, color, n + 1) >= umbral) n++;
  return Math.min(tope, n + extra);
}

// total fichas de apuesta: primero de juego y, si no alcanzan, de espacio
const apuestaDe = (E, s, total) => {
  const fichas = Math.min(total, E.fichas[s]);
  return { fichas, espacios: total - fichas };
};

// Un bot "de perfil": decide por la probabilidad de que el ultimo anuncio (o el propio) sea cierto con las cartas que ve.
//   anuncio  umbral de probabilidad con el que sube su cantidad        extra   cartas de farol que agrega
//   duda     duda si P(el anuncio es cierto) < duda                     sube    sube la apuesta al dudar si P < sube
//   pliega   se retira si P(su anuncio es cierto) < pliega              alta    apuesta 2 fichas cuando P(su anuncio) > alta (0 = nunca)
function jugarPerfil(E, s, p) {
  const ult = E.cadena.at(-1);
  if (E.fase === 'anuncio') {
    const color = mejorColor(E, s);
    const cantidad = cantidadHasta(E, s, color, 1, p.anuncio, p.extra);
    const k = p.alta && pTotalAlMenos(E, s, color, cantidad) > p.alta ? 2 : 1;
    return { accion: 'anunciar', color, cantidad, ...apuestaDe(E, s, Math.min(k, limiteApuesta(E, s, (s + 1) % JUGADORES))), razon };
  }
  if (E.fase === 'respuesta') {
    const pVerdad = pTotalAlMenos(E, s, ult.color, ult.cantidad);
    if (puedeAceptar(E) && pVerdad >= p.duda) {
      const color = mejorColor(E, s);
      const cantidad = cantidadHasta(E, s, color, ult.cantidad + 1, p.anuncio, p.extra);
      return { accion: 'aceptar', color, cantidad, ...apuestaDe(E, s, 1), razon };
    }
    const base = suma(ult.apuesta), tope = limiteApuesta(E, s, ult.asiento);
    const total = pVerdad < p.sube && base + 1 <= tope ? base + 1 : base;
    return { accion: 'dudar', ...apuestaDe(E, s, total), razon };
  }
  return { accion: pTotalAlMenos(E, s, ult.color, ult.cantidad) < p.pliega ? 'retirarse' : 'igualar', razon };
}

export const calculador = (E, s) => jugarPerfil(E, s, { anuncio: 0.55, extra: 0, duda: 0.4, sube: 0.2, pliega: 0.35, alta: 0.8 });
// Anuncia siempre una carta o dos por encima de lo probable, casi nunca duda y nunca se retira.
export const farolero = (E, s) => jugarPerfil(E, s, { anuncio: 0.2, extra: 1, duda: 0.03, sube: 0, pliega: -1, alta: 0 });
// Duda en cuanto puede y sube la apuesta si el anuncio le parece dudoso.
export const retador = (E, s) => jugarPerfil(E, s, { anuncio: 0.5, extra: 0, duda: 2, sube: 0.5, pliega: 0.3, alta: 0 });
// Anuncia solo lo casi seguro, acepta antes de dudar y se retira pronto.
export const prudente = (E, s) => jugarPerfil(E, s, { anuncio: 0.85, extra: 0, duda: 0.3, sube: 0, pliega: 0.6, alta: 0 });

// Todo al azar y siempre legal: color y cantidad al azar, acepta o duda a cara o cruz, de vez en cuando pide comprar un espacio.
export function azar(E, s, rng) {
  const color = COLORES[Math.floor(rng() * COLORES.length)];
  const compra = rng() < 0.1 ? { comprar_espacio: true } : {};
  if (E.fase === 'anuncio') return { accion: 'anunciar', color, cantidad: 1 + Math.floor(rng() * Math.min(8, totalCartas(E))), fichas: 1, espacios: 0, ...compra, razon };
  const ult = E.cadena.at(-1);
  if (E.fase === 'respuesta') {
    if (puedeAceptar(E) && rng() < 0.5) {
      return { accion: 'aceptar', color, cantidad: Math.min(totalCartas(E), ult.cantidad + 1 + Math.floor(rng() * 2)), fichas: 1, espacios: 0, ...compra, razon };
    }
    return { accion: 'dudar', ...compra, razon };
  }
  return { accion: rng() < 0.5 ? 'igualar' : 'retirarse', ...compra, razon };
}

export const BOTS = { azar, calculador, farolero, retador, prudente };

// Como se muestran en el marcador y el video (texto publico: lleva acentos si hace falta). Los colores son de control, no de una IA.
export const INFO_BOTS = {
  azar: { nombre: 'Al azar', color: '#9C8FB8' },
  calculador: { nombre: 'Calculador', color: '#B8A86F' },
  farolero: { nombre: 'Farolero', color: '#B87F6F' },
  retador: { nombre: 'Retador', color: '#8FA3B8' },
  prudente: { nombre: 'Prudente', color: '#6FB8A0' },
};

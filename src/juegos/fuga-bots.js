// Estrategias de control de La Fuga. No son IAs: sirven para probar el motor y para calibrar el balance. Leen el estado COMPLETO
// (por eso conocen el mejor metodo de cada situacion: son un "oraculo" de control, no un jugador realista), nunca lo modifican
// y devuelven una respuesta cruda como la de una IA. El azar usa solo el rng de su asiento.

import { porId } from './fuga/catalogo.js';
import { POSTURAS, METODOS } from './fuga/constantes.js';
import { esSolo } from './fuga/tentacion.js';

const mejorMetodo = (E) => porId.get(E.situaciones[E.ronda].id).mejor;
const base = (extra) => ({ postura: 'ayudar', metodo: 'sigilo', aprovechar: false, promesa: 'ayudar', mensaje: '', razon: 'bot de control', ...extra });

// Siempre ayuda y nunca compite con su companero por una tentacion; si se queda solo (lo capturaron o escapo), toma el botin:
// sin companero no hay con quien competir por una tentacion (enmienda del 10 de octubre de 2026).
export function leal(E) {
  return base({ postura: 'ayudar', metodo: mejorMetodo(E), aprovechar: esSolo(E), promesa: 'ayudar', mensaje: 'Confia en mi.' });
}

// Promete ayudar y se separa siempre (en el marcador: "Por su cuenta"); aprovecha toda tentacion.
export function traidor(E) {
  return base({ postura: 'separarse', metodo: mejorMetodo(E), aprovechar: true, promesa: 'ayudar', mensaje: 'Cuenta conmigo.' });
}

// Copia la ultima postura del companero (la primera vez ayuda; un sacrificio lo copia como ayuda).
export function tomaydaca(E, s) {
  const previa = E.historial.at(-1)?.jugadas[1 - s]?.postura;
  const postura = !previa || previa === 'sacrificarse' ? 'ayudar' : previa;
  return base({ postura, metodo: mejorMetodo(E), aprovechar: esSolo(E), promesa: postura, mensaje: 'Te devuelvo lo que me des.' });
}

export function azar(E, s, rng) {
  const pick = (lista) => lista[Math.floor(rng() * lista.length)];
  return base({ postura: pick(POSTURAS), metodo: pick(METODOS), aprovechar: rng() < 0.5, promesa: pick(POSTURAS), mensaje: 'Ni yo se que voy a hacer.' });
}

export const BOTS = { leal, traidor, tomaydaca, azar };

// Como se muestran en el marcador y el video (texto publico: lleva acentos si hace falta). Los colores son de control, no de una IA.
export const INFO_BOTS = {
  leal: { nombre: 'Leal', color: '#6FA86F' },
  traidor: { nombre: 'Por su cuenta', color: '#B8544A' },
  tomaydaca: { nombre: 'Toma y Daca', color: '#5A8FB8' },
  azar: { nombre: 'Al azar', color: '#9C8FB8' },
};

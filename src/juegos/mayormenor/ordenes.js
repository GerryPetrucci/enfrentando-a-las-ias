// Lo que contesta una IA -> una respuesta tipada. Nunca lanza error. No conoce el papel ni el estado: un campo ausente es null y solo se marca
// invalida lo que viene mal formado. Que la carta este en la mano o que la apuesta quepa en las fichas lo decide turno.js.

import { CARTAS, LARGO_RAZON } from './constantes.js';

const entero = (v) => {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return parseInt(v, 10); // un texto de cientos de digitos da Infinity: lo filtra quien llama
  return NaN;
};
// Solo textos, y en UNA linea: con saltos de linea un modelo podria fabricar renglones falsos en los datos.
const linea = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function normalizar(r) {
  const objeto = r !== null && typeof r === 'object' && !Array.isArray(r);
  const o = objeto ? r : {};
  const motivos = [];
  if (!objeto) motivos.push('sin respuesta legible');
  let carta = null;
  if (o.carta != null) {
    const c = entero(o.carta);
    if (CARTAS.includes(c)) carta = c;
    else motivos.push('carta mal formada');
  }
  let lado = null;
  if (o.lado != null) {
    const l = typeof o.lado === 'string' ? o.lado.trim().toLowerCase() : '';
    if (l === 'mayor' || l === 'menor') lado = l;
    else motivos.push('lado mal formado');
  }
  let fichas = null;
  if (o.fichas != null) {
    const f = entero(o.fichas);
    if (Number.isFinite(f) && f >= 1) fichas = f;
    else motivos.push('fichas mal formadas');
  }
  return { carta, lado, fichas, razon: linea(o.razon, LARGO_RAZON), invalida: motivos.length > 0, motivo: motivos.join(', ') || null };
}

export function normalizarRespuesta(r) {
  try {
    return normalizar(r);
  } catch {
    // objetos hostiles (getters que lanzan, valueOf que lanza...): se trata como si no hubiera llegado nada
    return normalizar(null);
  }
}

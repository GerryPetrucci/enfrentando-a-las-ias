// Lo que contesta una IA -> una respuesta tipada. Nunca lanza error. No conoce la fase ni el estado: un campo ausente es null, y
// solo se marca invalida lo que viene mal formado. Que una carta este disponible o que la marca sea de la pareja lo decide turno.js.

import { CARTAS, LARGO_RAZON } from './constantes.js';

const entero = (v) => {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return parseInt(v, 10);
  return NaN;
};
const esCarta = (n) => CARTAS.includes(n);
// Solo textos, y en UNA linea: con saltos de linea un modelo podria fabricar renglones falsos en los datos.
const linea = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function normalizar(r) {
  const objeto = r !== null && typeof r === 'object' && !Array.isArray(r);
  const o = objeto ? r : {};
  const motivos = [];
  if (!objeto) motivos.push('sin respuesta legible');
  let cartas = null;
  if (o.cartas != null) {
    const c = Array.isArray(o.cartas) ? o.cartas.map(entero) : [];
    if (c.length === 2 && c.every(esCarta) && c[0] !== c[1]) cartas = [c[0], c[1]].sort((a, b) => a - b);
    else motivos.push('cartas mal formadas');
  }
  let juega = null;
  if (o.juega != null) {
    const j = entero(o.juega);
    if (esCarta(j)) juega = j;
    else motivos.push('juega mal formada');
  }
  return { cartas, juega, razon: linea(o.razon, LARGO_RAZON), invalida: motivos.length > 0, motivo: motivos.join(', ') || null };
}

export function normalizarRespuesta(r) {
  try {
    return normalizar(r);
  } catch {
    // objetos hostiles (getters que lanzan, valueOf que lanza...): se trata como si no hubiera llegado nada
    return normalizar(null);
  }
}

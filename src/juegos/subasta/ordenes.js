// Lo que contesta una IA -> una respuesta tipada. Nunca lanza error. Aqui solo se lee el numero de segundos; cuanto puede apostar de verdad
// (se limita al banco) lo decide turno.js, que conoce el estado.

import { LARGO_RAZON } from './constantes.js';

// segundos pedidos: numero finito >= 0, o texto numerico con punto o coma decimal. Todo lo demas (NaN, negativos, "mucho", listas...) = NaN.
const numero = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : NaN;
  if (typeof v === 'string' && /^\s*\d+([.,]\d+)?\s*$/.test(v)) return parseFloat(v.replace(',', '.'));
  return NaN;
};
// Solo textos, y en UNA linea: con saltos de linea un modelo podria fabricar renglones falsos en los datos.
const linea = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function normalizar(r) {
  const objeto = r !== null && typeof r === 'object' && !Array.isArray(r);
  if (!objeto) return { apuesta: null, razon: '', invalida: true, motivo: 'sin respuesta legible' };
  let apuesta = null, motivo = null;
  if (r.apuesta == null) {
    motivo = 'sin apuesta';
  } else {
    const n = numero(r.apuesta);
    if (Number.isNaN(n)) motivo = 'apuesta mal formada';
    else apuesta = n;
  }
  return { apuesta, razon: linea(r.razon, LARGO_RAZON), invalida: motivo !== null, motivo };
}

export function normalizarRespuesta(r) {
  try {
    return normalizar(r);
  } catch {
    // objetos hostiles (getters que lanzan...): se trata como si no hubiera llegado nada
    return normalizar(null);
  }
}

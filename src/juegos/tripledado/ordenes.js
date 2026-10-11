// Lo que contesta una IA -> una respuesta tipada. Nunca lanza error. No conoce la fase ni el estado: un campo ausente es null y solo se marca invalida
// lo que viene mal formado. Que la tarjeta ya se haya usado, que los dados sean exactamente tres o que ya se hayan gastado lo decide turno.js.

import { TARJETAS, IDS_DADOS, LARGO_RAZON } from './constantes.js';

// Solo textos, y en UNA linea: con saltos de linea un modelo podria fabricar renglones falsos en los datos.
const linea = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function normalizar(r) {
  const objeto = r !== null && typeof r === 'object' && !Array.isArray(r);
  const o = objeto ? r : {};
  const motivos = [];
  if (!objeto) motivos.push('sin respuesta legible');
  let tarjeta = null;
  if (o.tarjeta != null) {
    const t = typeof o.tarjeta === 'string' ? o.tarjeta.trim().toUpperCase() : '';
    if (TARJETAS.includes(t)) tarjeta = t;
    else motivos.push('tarjeta mal formada');
  }
  let dados = null;
  if (o.dados != null) {
    // Array.from convierte los huecos en undefined (que no es un id valido); un objeto con "length" que no es arreglo no pasa
    const lista = Array.isArray(o.dados) ? Array.from(o.dados, (d) => (typeof d === 'string' ? d.trim().toLowerCase() : '')) : null;
    if (lista && lista.length <= IDS_DADOS.length && lista.every((d) => IDS_DADOS.includes(d)) && new Set(lista).size === lista.length) dados = lista;
    else motivos.push('dados mal formados');
  }
  return { tarjeta, dados, razon: linea(o.razon, LARGO_RAZON), invalida: motivos.length > 0, motivo: motivos.join(', ') || null };
}

export function normalizarRespuesta(r) {
  try {
    return normalizar(r);
  } catch {
    // objetos hostiles (getters que lanzan, valueOf que lanza...): se trata como si no hubiera llegado nada
    return normalizar(null);
  }
}

// Lo que contesta una IA -> una respuesta tipada. Nunca lanza error. No conoce la fase ni el estado: un campo ausente es null y solo se marca invalida lo que viene
// mal formado (`malos` dice cuales campos). Que la accion sea legal ahora, que la cantidad suba o que la apuesta quepa lo decide turno.js.

import { COLORES, ACCIONES, LARGO_RAZON } from './constantes.js';

// Solo textos, y en UNA linea: con saltos de linea un modelo podria fabricar renglones falsos en los datos.
const linea = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const sinAcentos = (v) => (typeof v === 'string' ? v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() : '');
// Un numero enorme (1e20, 2^60, un texto de 400 digitos) no esta "mal formado": se trata como "lo mas que se pueda" y turno.js lo recorta al maximo permitido.
const TOPE_NUMERO = 1e9;
const entero = (v) => {
  if (typeof v === 'number' && Number.isInteger(v)) return Math.min(v, TOPE_NUMERO);
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(n, TOPE_NUMERO) : TOPE_NUMERO;
  }
  return NaN;
};

function normalizar(r) {
  const objeto = r !== null && typeof r === 'object' && !Array.isArray(r);
  const o = objeto ? r : {};
  const malos = [];
  const motivos = [];
  if (!objeto) motivos.push('sin respuesta legible');
  const marcar = (campo, texto) => { malos.push(campo); motivos.push(texto); };

  let accion = null;
  if (o.accion != null) {
    const a = sinAcentos(o.accion);
    if (ACCIONES.includes(a)) accion = a;
    else marcar('accion', 'accion mal formada');
  }
  let color = null;
  if (o.color != null) {
    const c = sinAcentos(o.color);
    if (COLORES.includes(c)) color = c;
    else marcar('color', 'color mal formado');
  }
  let cantidad = null;
  if (o.cantidad != null) {
    const n = entero(o.cantidad);
    if (Number.isFinite(n) && n >= 1) cantidad = n;
    else marcar('cantidad', 'cantidad mal formada');
  }
  const ficha = (campo, texto) => {
    if (o[campo] == null) return null;
    const n = entero(o[campo]);
    if (Number.isFinite(n) && n >= 0) return n;
    marcar(campo, texto);
    return null;
  };
  const fichas = ficha('fichas', 'fichas mal formadas');
  const espacios = ficha('espacios', 'espacios mal formados');
  let comprar = false;
  if (o.comprar_espacio != null) {
    const c = o.comprar_espacio;
    if (c === true || c === 'true') comprar = true;
    else if (c !== false && c !== 'false') marcar('comprar_espacio', 'comprar_espacio mal formado');
  }
  return { accion, color, cantidad, fichas, espacios, comprar, razon: linea(o.razon, LARGO_RAZON), invalida: motivos.length > 0, motivo: motivos.join(', ') || null, malos };
}

export function normalizarRespuesta(r) {
  try {
    return normalizar(r);
  } catch {
    // objetos hostiles (getters que lanzan, valueOf que lanza...): se trata como si no hubiera llegado nada
    return normalizar(null);
  }
}

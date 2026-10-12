// Lo que contesta una IA -> una jugada legal. Nunca lanza error: lo que no se entiende se reemplaza por una jugada neutra
// (avanzar con sigilo) y la respuesta queda marcada como invalida, con el motivo.

import { POSTURAS, METODOS } from './constantes.js';

// minusculas, sin espacios, sin acentos y sin la enie ("ENGAÑO" -> "engano")
const limpio = (v) => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const AFIRMA = new Set(['true', 'si']);
const NIEGA = new Set(['false', 'no']);

// Solo se aceptan textos, y en UNA sola linea: con saltos de linea un modelo podria fabricar renglones falsos ("Alerta: desatada",
// "Tu companero fue capturado") en la vista de su rival.
const linea = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function normalizar(r) {
  const o = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  const postura = limpio(o.postura), metodo = limpio(o.metodo), promesa = limpio(o.promesa);
  const posturaOk = POSTURAS.includes(postura), metodoOk = METODOS.includes(metodo);
  const motivos = [];
  if (!posturaOk) motivos.push('postura invalida');
  if (!metodoOk) motivos.push('metodo invalido');
  const aprovechar = o.aprovechar === true || AFIRMA.has(limpio(o.aprovechar));
  // Campos escritos pero ilegibles: no cambian la jugada (la promesa queda en null y aprovechar en false), pero se anotan, para que
  // la fiabilidad no esconda a quien promete con frases en vez de la palabra pedida (seguir el formato tambien se mide).
  const ilegibles = [];
  if (o.promesa != null && limpio(o.promesa) !== '' && !POSTURAS.includes(promesa)) ilegibles.push('promesa');
  if (o.aprovechar != null && o.aprovechar !== '' && !aprovechar && !NIEGA.has(limpio(o.aprovechar)) && o.aprovechar !== false) ilegibles.push('aprovechar');
  return {
    postura: posturaOk ? postura : 'avanzar',
    metodo: metodoOk ? metodo : 'sigilo',
    aprovechar,
    promesa: POSTURAS.includes(promesa) ? promesa : null,
    mensaje: linea(o.mensaje, 140),
    razon: linea(o.razon, 300),
    ilegibles,
    invalida: motivos.length > 0,
    motivo: motivos.join(', ') || null,
  };
}

export function normalizarRespuesta(r) {
  try {
    return normalizar(r);
  } catch {
    // objetos hostiles (getters que lanzan, sin prototipo...): se trata como si no hubiera llegado nada
    return normalizar(null);
  }
}

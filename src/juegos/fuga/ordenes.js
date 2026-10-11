// Lo que contesta una IA -> una jugada legal. Nunca lanza error: lo que no se entiende se reemplaza por una jugada neutra
// (avanzar con sigilo) y la respuesta queda marcada como invalida, con el motivo.

import { POSTURAS, METODOS } from './constantes.js';

// minusculas, sin espacios, sin acentos y sin la enie ("ENGAÑO" -> "engano")
const limpio = (v) => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const AFIRMA = new Set(['true', 'si']);

function normalizar(r) {
  const o = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  const postura = limpio(o.postura), metodo = limpio(o.metodo), promesa = limpio(o.promesa);
  const posturaOk = POSTURAS.includes(postura), metodoOk = METODOS.includes(metodo);
  const motivos = [];
  if (!posturaOk) motivos.push('postura invalida');
  if (!metodoOk) motivos.push('metodo invalido');
  return {
    postura: posturaOk ? postura : 'avanzar',
    metodo: metodoOk ? metodo : 'sigilo',
    aprovechar: o.aprovechar === true || AFIRMA.has(limpio(o.aprovechar)),
    promesa: POSTURAS.includes(promesa) ? promesa : null,
    mensaje: String(o.mensaje ?? '').slice(0, 140),
    razon: String(o.razon ?? '').slice(0, 300),
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

// Dados compartidos de la Carrera de civilizaciones (spec 2). Todo sorteo del mundo sale de aqui y NUNCA del rng de la partida:
// no depende de lo que decidan las IAs ni del orden en que respondan, y los dos mundos gemelos tiran exactamente lo mismo.
// La clave NO lleva el asiento (1.2.0, C08): 'secesion', 'terremoto', 'cometa', 'maravilla-' + id...

import { crearRng } from '../../rng.js';

// FNV-1a sobre "seed|turno|clave" y una mezcla final (avalancha) para que claves parecidas no den numeros parecidos.
export function hash32(seedMundo, turno, clave) {
  let h = 2166136261;
  for (const c of `${seedMundo >>> 0}|${turno}|${clave}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

export const rngDe = (seedMundo, turno, clave) => crearRng(hash32(seedMundo, turno, clave));

// Un solo numero en [0, 1) para (seed, turno, clave): lo que usan los eventos que solo necesitan una tirada.
export const dadoDe = (seedMundo, turno, clave) => rngDe(seedMundo, turno, clave)();

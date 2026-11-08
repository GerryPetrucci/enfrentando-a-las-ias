// Registro público: solo juegos disponibles.
import lobo from './lobo.js';

export const JUEGOS = { [lobo.id]: lobo };

export function obtenerJuego(id) {
  if (!Object.hasOwn(JUEGOS, id)) throw new Error(`Juego desconocido: "${id}". Disponibles: ${Object.keys(JUEGOS).join(', ')}`);
  return JUEGOS[id];
}

// Registro de juegos. Agregar un juego nuevo = un archivo aqui y una linea abajo.
import dilema from './dilema.js';
import conquista from './conquista.js';
import fuga from './fuga.js';

export const JUEGOS = {
  [dilema.id]: dilema,
  [conquista.id]: conquista,
  [fuga.id]: fuga,
};

export function obtenerJuego(id) {
  const juego = JUEGOS[id];
  if (!juego) {
    throw new Error(`Juego desconocido: "${id}". Disponibles: ${Object.keys(JUEGOS).join(', ')}`);
  }
  return juego;
}

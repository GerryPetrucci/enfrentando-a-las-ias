// Registro de juegos. Agregar un juego nuevo = un archivo aqui y una linea abajo.
import dilema from './dilema.js';
import conquista from './conquista.js';
import fuga from './fuga.js';
import solitario from './solitario.js';
import subasta from './subasta.js';
import mayormenor from './mayormenor.js';
import tripledado from './tripledado.js';
import dudaapuesta from './dudaapuesta.js';
import lobo from './lobo.js';
import civilizaciones from './civilizaciones.js';

export const JUEGOS = {
  [civilizaciones.id]: civilizaciones,
  [lobo.id]: lobo,
  [dilema.id]: dilema,
  [conquista.id]: conquista,
  [fuga.id]: fuga,
  [solitario.id]: solitario,
  [subasta.id]: subasta,
  [mayormenor.id]: mayormenor,
  [tripledado.id]: tripledado,
  [dudaapuesta.id]: dudaapuesta,
};

export function obtenerJuego(id) {
  const juego = JUEGOS[id];
  if (!juego) {
    throw new Error(`Juego desconocido: "${id}". Disponibles: ${Object.keys(JUEGOS).join(', ')}`);
  }
  return juego;
}

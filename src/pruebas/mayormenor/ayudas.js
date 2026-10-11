// Ayudas compartidas por las pruebas de Mayor o menor. No es un archivo de pruebas.
import { crearRng } from '../../rng.js';
import { crearEstado } from '../../juegos/mayormenor/estado.js';
import { activoDe } from '../../juegos/mayormenor/constantes.js';

export const nuevoEstado = (seed = 7) => crearEstado(crearRng(seed));

// Fija la carta que revela el crupier en la ronda en curso (para ejemplos exactos). Rompe la permutacion del mazo: solo para pruebas de una ronda.
export function fijarCrupier(E, carta) {
  const a = activoDe(E.ronda);
  E.crupier[a][E.crupierSalidas[a].length] = carta;
}

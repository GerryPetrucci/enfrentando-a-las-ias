// Ayudas compartidas por las pruebas de Triple dado. No es un archivo de pruebas.
import { crearRng } from '../../rng.js';
import { crearEstado } from '../../juegos/tripledado/estado.js';

export const nuevoEstado = (seed = 7) => crearEstado(crearRng(seed));

// Fija los dados de un jugador en la ronda dada (por defecto la en curso). Para ejemplos exactos.
export function fijarDados(E, s, { blancos, rojo = 1, azul = 1 }, ronda = E.ronda) {
  E.dados[ronda - 1][s] = { blancos: [...blancos], rojo, azul };
}

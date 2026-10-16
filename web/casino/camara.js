// Camara oculta: en cada mano el publico ve las cartas reales de unos pocos jugadores (por defecto dos, elegidos al azar) y de los
// demas no ve nada hasta el recuento, para que el espectador especule. Es solo una decision de que MOSTRAR: no cambia ni oculta
// ninguna jugada. El azar sale del seed de la partida y del numero de mano: el mismo archivo da siempre el mismo video.
//
// Sin DOM ni `window`: lo importan la escena (navegador) y las pruebas (Node).

import { azarDesdeTexto } from './azar.js';

export const CAMARA_POR_DEFECTO = 2;
export const ASIENTOS = 4;

// seed: el de la partida (cualquier valor; un texto o un numero). mano: 1..16. n: cuantos asientos se ven (0 apaga, 4 o mas muestra todos).
// Devuelve los asientos elegidos, sin repetir y en orden. Entrada ilegible no lanza: n ilegible vale el valor por defecto.
export function elegirCamara(seed, mano, n = CAMARA_POR_DEFECTO, jugadores = ASIENTOS) {
  const cuantos = Number.isInteger(n) ? Math.max(0, Math.min(jugadores, n)) : CAMARA_POR_DEFECTO;
  const azar = azarDesdeTexto(`camara:${String(seed)}:${String(mano)}`);
  const asientos = Array.from({ length: jugadores }, (_, s) => s);
  for (let i = asientos.length - 1; i > 0; i--) { // Fisher-Yates
    const j = Math.floor(azar() * (i + 1));
    [asientos[i], asientos[j]] = [asientos[j], asientos[i]];
  }
  return asientos.slice(0, cuantos).sort((a, b) => a - b);
}

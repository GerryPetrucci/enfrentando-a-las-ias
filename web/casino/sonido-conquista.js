// Que suena con la Maravilla de Guerra de territorios (mesa-conquista.js): el cuerno de guerra (efecto `obra`, DeVern) cada turno que su obra avanza y el gong (efecto `construida`, JensZygar) cuando la obra termina.
// `antes` y `despues` son la Maravilla en la foto del mapa de antes y despues de resolver el turno ({ k: dueno, r: region, n: turnos contados, cercada }); la cuenta `n` arranca en 0 al darse la orden y
// sube un turno cada cierre (pausada si esta cercada). Los primeros MARAVILLA_OBRA turnos son de obra; despues, de pie. Funcion pura: sin DOM ni audio.

import { MARAVILLA_OBRA } from './conquista-datos.js';

const entero = (n) => Number.isInteger(n) && n >= 0;

// 'obra' (la cuenta avanzo y sigue en obra), 'construida' (la obra acaba de terminar) o null (nada: de pie, cercada, otro dueno u otra region, o una foto ilegible).
export function sonidoDeMaravilla(antes, despues) {
  if (!antes || !despues || typeof antes !== 'object' || typeof despues !== 'object') return null;
  if (!entero(antes.n) || !entero(despues.n) || antes.k !== despues.k || antes.r !== despues.r || despues.n <= antes.n) return null;
  if (antes.n < MARAVILLA_OBRA && despues.n >= MARAVILLA_OBRA) return 'construida';
  return despues.n < MARAVILLA_OBRA ? 'obra' : null;
}

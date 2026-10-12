// La formula de riesgo de La Fuga: probabilidad de que un prisionero FALLE en una situacion. Es una funcion pura: no sortea
// nada (los dados ya estan en el estado) y no modifica el estado. Los multiplicadores viven en constantes.js (K).

import { K } from './constantes.js';

// Metodos que se complementan bajan el fallo de los dos; repetir el mismo estorba; esperar no combina con nada.
function combo(a, b) {
  if (a === 'esperar' || b === 'esperar') return 1;
  if ((a === 'sigilo' && b === 'engano') || (a === 'engano' && b === 'sigilo')) return K.comboComplemento;
  if (a === b) return K.comboRepetido;
  return 1;
}

// sit: situacion del estado.  jugadas[s]: { postura, metodo } normalizado, o null si ese prisionero ya esta capturado.
// i: el prisionero cuya probabilidad se pide.  E: estado (libres, alarma, cohesion, heridas, objeto).
export function probFallo(sit, jugadas, i, E) {
  const yo = jugadas[i], otro = jugadas[1 - i];
  const conCompanero = !!otro && E.libres[1 - i];
  // sin companero libre ninguna postura tiene sentido: cuenta como avanzar
  const postura = conCompanero ? yo.postura : 'avanzar';
  let f = sit.peligro * sit.ajuste[yo.metodo] * K.posturaPropia[postura];
  if (!conCompanero) {
    f *= K.solo; // nadie lo cubre
  } else if (postura !== 'separarse') {
    f *= K.efectoCompanero[otro.postura];
    if (otro.postura !== 'separarse') f *= combo(yo.metodo, otro.metodo);
  }
  f *= 1 + K.alarma * E.alarma;
  f *= 1 - K.cohesion * E.cohesion;
  if ((E.objeto[i]?.restan ?? 0) > 0) f *= K.objeto;
  f += K.herida * E.heridas[i];
  return Math.min(K.maxFallo, Math.max(K.minFallo, f));
}

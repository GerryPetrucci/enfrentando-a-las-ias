// Lo que ve el jugador i. Es el UNICO lugar donde se decide que sabe cada uno (CLAUDE.md, invariante 2). Texto sin acentos: forma
// parte del prompt. Nunca incluye: el azar de reemplazo, el sorteo de desempate, ni lo que otros decidan en la misma fase (el estado
// no guarda las marcas hasta resolver la ronda; en la fase 2 solo muestra las parejas, que ya se revelaron).

import { JUGADORES, RONDAS, CORTES, cicloDe } from './constantes.js';
import { disponibles } from './estado.js';

const asientos = [...Array(JUGADORES).keys()];
const lista = (xs) => (xs.length ? xs.join(' ') : 'ninguna');

function estadoDe(E, s) {
  if (E.jugando[s]) return 'sigue';
  if (E.puesto[s] === 'salvo') return `a salvo (corte ${E.corteSalvo[s]})`;
  return E.puesto[s] ?? 'fuera';
}

// Mi puesto por puntos, fichas y ultima victoria. El sorteo NO cuenta (es secreto): los que quedan iguales se avisan.
function puestoVisible(E, i) {
  const clave = (s) => [E.puntos[s], E.fichas[s], E.ultimaVictoria[s]];
  const mejor = (a, b) => {
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k];
    return false;
  };
  const vivos = asientos.filter((s) => E.jugando[s]);
  const antes = vivos.filter((s) => s !== i && mejor(clave(s), clave(i))).length;
  const iguales = vivos.filter((s) => s !== i && !mejor(clave(s), clave(i)) && !mejor(clave(i), clave(s))).length;
  return `${antes + 1} de ${vivos.length}${iguales ? ` (empatado con ${iguales} mas)` : ''}`;
}

// Una linea por ronda ya jugada: lo que mostro y jugo cada uno (ya ocurrio, no es secreto) y quien gano.
function lineaHistorial(reg, i) {
  const partes = asientos
    .filter((s) => reg.parejas[s])
    .map((s) => `J${s + 1}${s === i ? '(tu)' : ''} ${reg.parejas[s].join('/')}>${reg.marcas[s]}`);
  const res = reg.ganador === null ? 'nadie gana' : `gana J${reg.ganador + 1} con ${reg.numero}`;
  return `R${reg.ronda}: ${partes.join(' | ')} -> ${res}`;
}

export function vistaTexto(E, i) {
  const fase2 = E.fase === 2;
  const L = [];
  L.push(`RONDA ${E.ronda} DE ${RONDAS} (ciclo ${cicloDe(E.ronda)}) - FASE ${E.fase} DE 2: ${fase2 ? 'MARCA LA CARTA QUE JUEGAS' : 'ELIGE TU PAREJA'}`);
  L.push(`Tus cartas disponibles: ${disponibles(E, i).join(' ')}`);
  L.push(`Carta bloqueada esta ronda: ${E.bloqueada[i] ?? 'ninguna'}`);
  L.push(`Cartas que ya jugaste en este ciclo: ${lista(E.descartadas[i])}`);
  if (fase2) L.push(`Tu pareja: ${E.parejas[i].join(' y ')}`);
  L.push('', 'JUGADORES:');
  for (const s of asientos) {
    const base = `Jugador ${s + 1}${s === i ? ' (tu)' : ''}: ${estadoDe(E, s)}, puntos ${E.puntos[s]}, fichas ${E.fichas[s]}`;
    if (E.jugando[s] && s !== i) {
      const par = fase2 && E.parejas[s] ? `; pareja de esta ronda: ${E.parejas[s].join(' y ')}` : '';
      L.push(`${base}; cartas disponibles: ${disponibles(E, s).join(' ')}; bloqueada: ${E.bloqueada[s] ?? 'ninguna'}${par}`);
    } else {
      L.push(base);
    }
  }
  L.push(`Tu puesto ahora (sin contar el sorteo): ${puestoVisible(E, i)}`);
  const proximo = CORTES.find((c) => c >= E.ronda);
  L.push(proximo
    ? `Proximo corte: al final de la ronda ${proximo} (queda a salvo el jugador con mas puntos).`
    : `Final: al final de la ronda ${RONDAS} gana la pieza el que tenga mas puntos y se elimina al que tenga menos.`);
  if (E.historial.length) {
    L.push('', 'HISTORIAL (J = jugador; pareja > carta que jugo):');
    for (const reg of E.historial) L.push(lineaHistorial(reg, i));
  }
  L.push('', fase2
    ? 'AHORA (fase 2): responde solo "juega" con una de tus dos cartas, y "razon".'
    : 'AHORA (fase 1): responde solo "cartas" con dos de tus cartas disponibles, y "razon".');
  return L.join('\n');
}

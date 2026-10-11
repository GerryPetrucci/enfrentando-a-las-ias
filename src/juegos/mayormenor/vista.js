// Lo que ve el jugador i. Es el UNICO lugar donde se decide que sabe cada uno (CLAUDE.md, invariante 2). Texto sin acentos: forma parte del prompt.
// Es publico casi todo: fichas, manos (las cartas jugadas se ven), cartas del crupier ya salidas y el historial. Lo secreto es el orden futuro del
// crupier y lo que el rival decide a la vez: lo primero no se lee nunca de E.crupier mas alla de la carta de esta ronda, lo segundo ni siquiera esta en
// el estado todavia. Una prueba de no interferencia reordena el futuro del crupier y exige la misma vista.

import { RONDAS, activoDe } from './constantes.js';
import { crupierDeRonda, crupierFaltan } from './estado.js';

const lista = (xs) => (xs.length ? xs.join(' ') : '(ninguna)');

function lineaHistorial(h) {
  const p = 1 - h.activo;
  const carta = `jugo ${h.carta} (${h.veredicto}${h.ganaActivo ? `, +${h.ganaActivo}` : ''})`;
  const apuesta = h.acierto === null ? 'se devuelve' : h.acierto ? `acierta (+${h.apuesta})` : `falla (-${h.apuesta})`;
  return `R${h.ronda} (activo J${h.activo + 1}): crupier ${h.crupier}, ${carta} | J${p + 1} aposto ${h.apuesta} a ${h.lado}: ${apuesta}`;
}

export function vistaTexto(E, i) {
  const r = E.ronda, a = activoDe(r), rival = 1 - i;
  const restan = RONDAS - r;
  const L = [];
  L.push(`RONDA ${r} DE ${RONDAS} (${restan === 0 ? 'es la ultima' : `despues de esta quedan ${restan}`})`);
  L.push(a === i
    ? 'Tu papel: JUGADOR ACTIVO (juegas una carta boca abajo)'
    : 'Tu papel: PREDICTOR (apuestas si la carta oculta de tu rival sera mayor o menor)');
  L.push(`Carta del crupier esta ronda: ${crupierDeRonda(E)} (sale del mazo del Jugador ${a + 1})`);
  L.push(`Tus fichas: ${E.fichas[i]} | Fichas del rival: ${E.fichas[rival]}`);
  L.push(`Tus cartas: ${lista(E.mano[i])}`);
  L.push(`Cartas que le quedan a tu rival: ${lista(E.mano[rival])}`);
  L.push('', 'MAZOS DEL CRUPIER (cada jugador tiene el suyo, del 1 al 9):');
  for (const s of [0, 1]) {
    L.push(`Mazo del Jugador ${s + 1}${s === i ? ' (tu)' : ''}: ya salieron ${lista(E.crupierSalidas[s])} | faltan ${lista(crupierFaltan(E, s))}`);
  }
  if (E.historial.length) {
    L.push('', 'HISTORIAL (publico):');
    for (const h of E.historial) L.push(lineaHistorial(h));
  }
  L.push('');
  L.push(a === i
    ? `AHORA: eres el jugador activo: responde "carta" con UNA de tus cartas (${lista(E.mano[i])}) y "razon".`
    : `AHORA: eres el predictor: responde "lado" ("mayor" o "menor"), "fichas" (un entero de 1 a ${E.fichas[i]}; si pides mas, apuestas todas) y "razon".`);
  return L.join('\n');
}

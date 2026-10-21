// Lo que ve el jugador i. Es el UNICO lugar donde se decide que sabe cada uno (CLAUDE.md, invariante 2). Texto sin acentos: forma parte del prompt.
// Es publico casi todo: fichas, manos (las cartas jugadas se ven), cartas del crupier ya salidas y el historial. Lo secreto es el orden futuro del
// crupier y lo que el rival decide a la vez: lo primero no se lee nunca de E.crupier mas alla de la carta de esta ronda, lo segundo ni siquiera esta en
// el estado todavia. Una prueba de no interferencia reordena el futuro del crupier y exige la misma vista.

import { RONDAS, activoDe } from './constantes.js';
import { crupierDeRonda, crupierFaltan, apuestaMaxima, cartasDesconocidas } from './estado.js';

const lista = (xs) => (xs.length ? xs.join(' ') : '(ninguna)');

// Una jugada que puso el juego por una respuesta ilegal se marca [reemplazo]: no la eligio el jugador.
function lineaHistorial(h) {
  const p = 1 - h.activo;
  const marca = (s) => (h.reemplazadas?.[s] ? ' [reemplazo]' : '');
  const veredicto = h.igual && h.veredicto === 'menor' ? 'menor por ser igual' : h.veredicto; // reglas 2.0.0: la carta igual cuenta como menor
  const carta = `jugo ${h.carta} (${veredicto}${h.ganaActivo ? `, +${h.ganaActivo}` : ''})${marca(h.activo)}`;
  const apuesta = h.acierto === null ? 'se devuelve' : h.acierto ? `acierta (+${h.apuesta * (h.doble ?? 1)})` : `falla (-${h.apuesta})`;
  return `R${h.ronda} (activo J${h.activo + 1}): crupier ${h.crupier}, ${carta} | J${p + 1} aposto ${h.apuesta} a ${h.lado}${marca(p)}: ${apuesta}${h.doble === 2 ? ' [DOBLE]' : ''}`;
}

export function vistaTexto(E, i) {
  const r = E.ronda, a = activoDe(r), rival = 1 - i;
  // Terminada la partida no hay carta de esta ronda: E.ronda es la ultima jugada y el mazo ya no tiene "siguiente" que mostrar.
  if (E.fin) {
    return [
      `PARTIDA TERMINADA (${r === 1 ? 'se jugo 1 ronda' : `se jugaron ${r} rondas`} de ${RONDAS})`,
      `Tus fichas: ${E.fichas[i]} | Fichas del rival: ${E.fichas[rival]}`,
    ].join('\n');
  }
  const restan = RONDAS - r;
  const L = [];
  L.push(`RONDA ${r} DE ${RONDAS} (${restan === 0 ? 'es la ultima' : `despues de esta quedan ${restan}`})`);
  if (E.dobles.length) {
    const d = E.dobles;
    L.push(`RONDAS DOBLES de esta partida: ${d.slice(0, -1).join(', ')} y ${d.at(-1)} (ahi las ganancias se pagan al doble)`);
    if (d.includes(r)) L.push('*** ESTA RONDA ES DOBLE ***');
  }
  L.push(`Eres el Jugador ${i + 1} (en el historial apareces como J${i + 1})`);
  L.push(a === i
    ? 'Tu papel: JUGADOR ACTIVO (juegas una carta boca abajo)'
    : 'Tu papel: PREDICTOR (apuestas si la carta oculta de tu rival sera mayor o menor)');
  L.push(`Carta del crupier esta ronda: ${crupierDeRonda(E)} (sale del mazo del Jugador ${a + 1})`);
  L.push(`Tus fichas: ${E.fichas[i]} | Fichas del rival: ${E.fichas[rival]}`);
  if (E.reglas.topeFijo && a !== i) L.push(`Puedes apostar como maximo ${apuestaMaxima(E, i)} fichas (tus fichas, sin pasar del tope de ${E.reglas.topeFijo} por ronda)`);
  L.push(`Tus cartas: ${lista(E.mano[i])}`);
  if (E.reglas.manoOculta) {
    // la mano del rival es secreta: solo se sabe cuantas le quedan, cuales ya jugo y que cartas quedan por conocerse
    L.push(`A tu rival le quedan ${E.mano[rival].length} cartas (no sabes cuales)`);
    L.push(`Cartas que tu rival ya jugo: ${lista(E.jugadas[rival])}`);
    L.push(`Cartas desconocidas: ${lista(cartasDesconocidas(E, i))} (de aqui salen las que le quedan a tu rival; el resto no se usa)`);
  } else {
    L.push(`Cartas que le quedan a tu rival: ${lista(E.mano[rival])}`);
  }
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
    : `AHORA: eres el predictor: responde "lado" ("mayor" o "menor"), "fichas" (un entero de 1 a ${apuestaMaxima(E, i)}; si pides mas, apuestas ${E.reglas.topeFijo ? apuestaMaxima(E, i) : 'todas'}) y "razon".`);
  return L.join('\n');
}

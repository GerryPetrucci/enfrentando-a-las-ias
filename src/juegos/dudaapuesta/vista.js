// Lo que ve el jugador i. Es el UNICO lugar donde se decide que sabe cada uno (CLAUDE.md, invariante 2). Texto sin acentos: forma parte del prompt.
// Es publico: las fichas y los espacios de todos, los anuncios y las apuestas de la mano en curso, el historial de las manos terminadas (con las cartas del color anunciado
// ya reveladas) y el pago a la banca. Es secreto: las cartas de los demas y el mazo. Una prueba de no interferencia lo vigila.
// Las lineas de historial son COMPACTAS a proposito (el peor caso debe caber en el tope de tokens): f = fichas de juego, e = fichas de espacio, * = jugada del juego.

import { JUGADORES, MANOS, ANUNCIOS_MAX, FICHAS_ESPACIO_MAX } from './constantes.js';
import { cartasDe, espacios, totalCartas, actorDe, puedeAceptar, limiteApuesta } from './estado.js';

const HISTORIAL_VISIBLE = 6; // manos terminadas que se muestran completas; las anteriores se resumen (el peor caso debe caber en el tope de tokens)
const asientos = [...Array(JUGADORES).keys()];
const suma = (ap) => ap.fichas + ap.espacios;
const reemplazo = (x) => (x?.reemplazo ? '*' : ''); // * = lo puso el juego por una respuesta ilegal
// 2f / 1e / 1f+1e
const chip = (ap) => [ap.fichas ? `${ap.fichas}f` : '', ap.espacios ? `${ap.espacios}e` : ''].filter(Boolean).join('+') || '0f';

// M2: J1 6 azul 1f | J2 acepta 7 rojo 1f | J3 duda 2f | J2 iguala | hay 8 (J1 2 J2 3 J3 1 J4 2) | gana J3 +2f
function lineaMano(h) {
  const partes = h.cadena.map((c, k) => `J${c.asiento + 1} ${k ? 'acepta ' : ''}${c.cantidad} ${c.color} ${chip(c.apuesta)}${reemplazo(c)}`);
  partes.push(`J${h.duda.asiento + 1} duda ${chip(h.duda.apuesta)}${reemplazo(h.duda)}`);
  if (h.defensa) partes.push(`J${h.resolucion.predictor + 1} ${h.defensa.accion === 'igualar' ? 'iguala' : 'se retira'}${reemplazo(h.defensa)}`);
  const r = h.resolucion;
  if (r.tipo === 'recuento') partes.push(`hay ${r.real} (${asientos.map((s) => `J${s + 1} ${r.cuentas[s]}`).join(' ')})`);
  partes.push(`gana J${r.ganador + 1} +${chip(r.movidas)}`);
  if (h.pago) partes.push('pago a la banca: todos -1f');
  for (const s of h.compras) partes.push(`J${s + 1} compra un espacio`);
  return `M${h.mano}: ${partes.join(' | ')}`;
}

// Lo que le toca decidir al jugador i, con los limites exactos de ahora.
function bloqueDecision(E, i) {
  const ult = E.cadena.at(-1), cartas = totalCartas(E);
  const tengo = `Tienes ${E.fichas[i]} fichas de juego y ${E.fichasEspacio[i]} de espacio.`;
  if (E.fase === 'anuncio') {
    const tope = limiteApuesta(E, i, (i + 1) % JUGADORES);
    return [`ES TU TURNO: abres la mano. accion "anunciar": un color, una cantidad de 1 a ${cartas} y tu apuesta de 1 a ${tope} fichas en total. ${tengo}`];
  }
  if (E.fase === 'respuesta') {
    const p = ult.asiento;
    const topeD = limiteApuesta(E, i, p), topeA = limiteApuesta(E, i, (i + 1) % JUGADORES);
    const L = [`ES TU TURNO: J${p + 1} anuncio al menos ${ult.cantidad} ${ult.color} y apuesta ${chip(ult.apuesta)}. ${tengo} Puedes:`];
    L.push(puedeAceptar(E)
      ? `- accion "aceptar": J${p + 1} recupera su apuesta y tu anuncias una cantidad MAYOR (de ${ult.cantidad + 1} a ${cartas}) con tu apuesta de 1 a ${topeA} fichas en total. Es el anuncio ${E.cadena.length + 1} de ${ANUNCIOS_MAX}.`
      : `- aceptar NO esta permitido (${E.cadena.length >= ANUNCIOS_MAX ? `ya van ${ANUNCIOS_MAX} anuncios` : 'el anuncio ya es igual a todas las cartas en juego'}): debes dudar.`);
    L.push(`- accion "dudar": apuestas de ${suma(ult.apuesta)} a ${topeD} fichas en total (si no dices cuanto, igualas con ${suma(ult.apuesta)}).`);
    return L;
  }
  const d = E.duda;
  const falta = suma(d.apuesta) - suma(ult.apuesta);
  return [`ES TU TURNO: J${d.asiento + 1} dudo de tu anuncio (al menos ${ult.cantidad} ${ult.color}) y subio su apuesta a ${chip(d.apuesta)}; la tuya es ${chip(ult.apuesta)}. ${tengo} Puedes: accion "igualar" (pones ${falta} fichas mas y se revelan las cartas) o accion "retirarse" (pierdes tu apuesta y las cartas no se revelan).`];
}

export function vistaTexto(E, i) {
  const tabla = asientos.map((s) => `J${s + 1}${s === i ? ' (tu)' : ''} ${E.fichas[s]}f ${E.fichasEspacio[s]}e ${espacios(E, s)}c`).join(' | ');
  if (E.fin) return ['PARTIDA TERMINADA', `FICHAS FINALES: ${asientos.map((s) => `J${s + 1}${s === i ? ' (tu)' : ''} ${E.fichas[s]}f`).join(' | ')}`].join('\n');
  const L = [];
  L.push(`MANO ${E.mano} DE ${MANOS} - DECISION ${E.decision} DE ESTA MANO`);
  L.push(`Eres el Jugador ${i + 1} (en el historial apareces como J${i + 1})`);
  L.push(`TUS CARTAS (${espacios(E, i)}): ${cartasDe(E, i).join(' ')}`);
  L.push(`JUGADORES (f = fichas de juego, e = fichas de espacio, c = cartas): ${tabla}`);
  L.push(`CARTAS EN JUEGO: ${totalCartas(E)}. Esta mano abrio J${E.inicia + 1}.`);
  if (E.cadena.length) {
    L.push('ANUNCIOS DE ESTA MANO:');
    E.cadena.forEach((c, k) => L.push(`${k + 1}. J${c.asiento + 1} ${k ? 'acepta y anuncia' : 'anuncia'} al menos ${c.cantidad} ${c.color}, apuesta ${chip(c.apuesta)}${reemplazo(c)}`));
  }
  if (E.duda) L.push(`J${E.duda.asiento + 1} duda con ${chip(E.duda.apuesta)}${reemplazo(E.duda)}`);
  if (actorDe(E) === i) {
    L.push(...bloqueDecision(E, i));
    if (E.fichas[i] >= 2 && E.fichasEspacio[i] < FICHAS_ESPACIO_MAX) L.push('Si quieres, agrega "comprar_espacio": true (pagas 1 ficha de juego y ganas un espacio desde la mano siguiente).');
  } else {
    L.push(`Espera: decide J${actorDe(E) + 1}.`);
  }
  if (E.historial.length) {
    const viejas = E.historial.slice(0, -HISTORIAL_VISIBLE), recientes = E.historial.slice(-HISTORIAL_VISIBLE);
    L.push('', 'MANOS TERMINADAS:');
    if (viejas.length) L.push(`M1-M${viejas.length} (resumen): enfrentamientos ganados ${asientos.map((s) => `J${s + 1} ${viejas.filter((h) => h.resolucion.ganador === s).length}`).join(' | ')}`);
    for (const h of recientes) L.push(lineaMano(h));
  }
  return L.join('\n');
}

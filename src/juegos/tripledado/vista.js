// Lo que ve el jugador i. Es el UNICO lugar donde se decide que sabe cada uno (CLAUDE.md, invariante 2). Texto sin acentos: forma parte del prompt.
// Es publico: los blancos de todos y cuales han gastado, que ocultos le quedan a cada rival (por color), las combinaciones reveladas (con el valor de un
// oculto ya usado), los puntos y las tarjetas de rondas cerradas. Es secreto: los dados de la ronda ANTES de lanzarlos (la fase de prediccion no los lee),
// el valor de los ocultos ajenos sin usar, la tarjeta de la ronda en curso de los demas y lo que eligen a la vez. Una prueba de no interferencia lo vigila.
// Las lineas de historial son COMPACTAS a proposito (el peor caso debe caber en el tope de tokens).

import { RONDAS, ENFRENTAMIENTOS, TARJETAS, JUGADORES } from './constantes.js';
import { disponibles, valorDe, blancosRestantes } from './estado.js';
import { aPuntos } from './combinaciones.js';

const asientos = [...Array(JUGADORES).keys()];
const pts = (d) => String(aPuntos(d));
// lo que no queda se dice "ninguna" (tarjetas) o "ninguno" (dados), sin parentesis
const lista = (xs, vacio = 'ninguna') => (xs.length ? xs.join(' ') : vacio);
const marca = (id) => (id === 'rojo' ? 'r' : id === 'azul' ? 'a' : '');
const reemplazo = (h, s) => (h.reemplazadas?.[s] ? ' [reemplazo]' : '');

// R1E2: J1 6r-5-5 +3 | J2 ...   (r = dado rojo, a = dado azul; el valor del oculto ya esta revelado)
function lineaEnfrentamiento(h) {
  const partes = asientos.map((s) => {
    const c = h.combos[s];
    const dados = c.valores.map((v, j) => ({ v, m: marca(c.dados[j]) })).sort((x, y) => y.v - x.v).map((d) => `${d.v}${d.m}`).join('-');
    return `J${s + 1} ${dados} +${pts(h.puntos[s])}${reemplazo(h, s)}`;
  });
  return `R${h.ronda}E${h.enfrentamiento}: ${partes.join(' | ')}`;
}

// R1 CIERRE: J1 MORE 9 acierta (18) | J2 ...   (tarjeta, suma de la ronda, resultado y puntos con premio)
function lineaCierre(h) {
  const partes = asientos.map((s) => `J${s + 1} ${h.tarjetas[s]}${reemplazo(h, s)} ${pts(h.totales[s])} ${h.aciertos[s] ? 'acierta' : 'falla'} (${pts(h.puntos[s])})`);
  return `R${h.ronda} CIERRE: ${partes.join(' | ')}`;
}

export function vistaTexto(E, i) {
  const puntosDeTodos = asientos.map((s) => `J${s + 1}${s === i ? ' (tu)' : ''} ${pts(E.puntos[s])}`).join(' | ');
  if (E.fin) return ['PARTIDA TERMINADA', `PUNTOS FINALES: ${puntosDeTodos}`].join('\n');
  const r = E.ronda, jugada = E.fase === 'jugada';
  const usadas = E.tarjetasUsadas[i], quedan = TARJETAS.filter((t) => !usadas.includes(t));
  const L = [];
  L.push(`RONDA ${r} DE ${RONDAS} - ${jugada ? `ENFRENTAMIENTO ${E.enfrentamiento} DE ${ENFRENTAMIENTOS}` : 'PREDICCION (los dados aun no se han lanzado)'}`);
  L.push(`Eres el Jugador ${i + 1} (en el historial apareces como J${i + 1})`);
  // en un enfrentamiento la tarjeta de esta ronda ya esta elegida: las que "te quedan" son las de las rondas siguientes
  const siguientes = jugada ? quedan.filter((t) => t !== E.tarjetaActual[i]) : quedan;
  L.push(`${jugada ? 'Tus tarjetas para las rondas siguientes' : 'Tus tarjetas que te quedan'}: ${lista(siguientes)}${usadas.length ? ` (ya usaste: ${usadas.join(' ')})` : ''}`);
  if (jugada) L.push(`Tu tarjeta de esta ronda: ${E.tarjetaActual[i]}`);
  L.push(`PUNTOS ACUMULADOS: ${puntosDeTodos}`);
  if (r > 1) L.push(`TARJETAS YA USADAS: ${asientos.map((s) => `J${s + 1} ${E.tarjetasUsadas[s].join(' ') || '-'}`).join(' | ')}`);
  let disp = [];
  if (jugada) {
    L.push(`PUNTOS DE ESTA RONDA: ${asientos.map((s) => `J${s + 1}${s === i ? ' (tu)' : ''} ${pts(E.puntosRonda[s])}`).join(' | ')}`);
    disp = disponibles(E, i);
    L.push('', `TUS DADOS que no has gastado: ${disp.map((id) => `${id}=${valorDe(E, i, id)}`).join(' ')}`);
    L.push('DADOS DE LOS RIVALES (sus blancos sin gastar y que ocultos les quedan):');
    for (const s of asientos) {
      if (s === i) continue;
      const blancos = blancosRestantes(E, s).map((id) => valorDe(E, s, id)).sort((a, b) => b - a);
      const ocultos = disponibles(E, s).filter((id) => id === 'rojo' || id === 'azul');
      L.push(`J${s + 1}: blancos ${lista(blancos, 'ninguno')} | ocultos sin usar: ${lista(ocultos, 'ninguno')}`);
    }
  }
  if (E.historial.length) {
    L.push('', 'HISTORIAL (publico; r = dado rojo, a = dado azul):');
    for (const h of E.historial) L.push(h.tipo === 'cierre' ? lineaCierre(h) : lineaEnfrentamiento(h));
  }
  L.push('');
  L.push(jugada
    ? `AHORA: elige TRES dados distintos de los que no has gastado: responde "dados" (por ejemplo ${JSON.stringify(disp.slice(0, 3))}) y "razon".`
    : `AHORA: elige UNA de tus tarjetas (${quedan.join(', ')}): responde "tarjeta" y "razon".`);
  return L.join('\n');
}

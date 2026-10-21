// Una ronda de Mayor o menor (un turno de la arena). Muta el estado y devuelve el registro (lo que se guarda en los datos y lee el reproductor).
//   El crupier revela su carta (la siguiente del mazo del activo). El activo juega una carta de su mano y el predictor apuesta de 1 a todas sus
//   fichas a "mayor" o "menor"; deciden a la vez. Si la carta es mayor, el activo gana la diferencia; el predictor acierta y gana lo apostado,
//   o falla y lo pierde; con una carta igual la apuesta se devuelve. Las fichas ganadas salen de la banca.
//   Una respuesta ilegal se reemplaza por una legal con el azar sorteado en crearEstado (E.azar) y queda marcada invalida.
//   La partida termina tras la ronda 18 o antes si alguien se queda sin fichas; gana quien tiene mas fichas.

import { JUGADORES, RONDAS, CARTAS_CRUPIER, activoDe } from './constantes.js';
import { normalizarRespuesta } from './ordenes.js';
import { crupierDeRonda, apuestaMaxima } from './estado.js';
import { narrarRonda } from './narracion.js';

const LARGO_CRUDO = 400; // caracteres de la respuesta cruda que se guardan cuando una respuesta fue invalida
const asientos = [...Array(JUGADORES).keys()];

// Por que la respuesta del activo no sirve (null si sirve). Solo importa el campo de este papel.
function motivoActivo(resp, mano) {
  if (resp.motivo?.includes('sin respuesta')) return 'sin respuesta legible';
  if (resp.motivo?.includes('carta mal')) return 'carta mal formada';
  if (resp.carta === null) return 'sin carta';
  return mano.includes(resp.carta) ? null : 'carta no disponible';
}

// Por que la respuesta del predictor no sirve (null si sirve). Si el lado o las fichas fallan, se reemplazan las dos cosas.
function motivoPredictor(resp) {
  const m = [];
  if (resp.motivo?.includes('sin respuesta')) return 'sin respuesta legible';
  if (resp.motivo?.includes('lado mal')) m.push('lado mal formado');
  if (resp.motivo?.includes('fichas mal')) m.push('fichas mal formadas');
  if (m.length) return m.join(', ');
  return resp.lado === null || resp.fichas === null ? 'sin apuesta' : null;
}

// Cierra la partida: gana quien tiene mas fichas; si igualan, empate.
function cerrar(E, causa) {
  const [x, y] = E.fichas;
  const ganador = x === y ? null : x > y ? 0 : 1;
  E.final = {
    ganador, empate: ganador === null, causa, fichas: [...E.fichas],
    ranking: [...asientos].sort((a, b) => E.fichas[b] - E.fichas[a] || a - b),
  };
  E.fin = true;
  return E.final;
}

// respuestas[s]: respuesta normalizada (con `error` y `crudo` si los puso la arena) o null.
export function aplicarTurno(E, respuestas) {
  if (E.fin) throw new Error('La partida ya termino.');
  const r = E.ronda;
  const a = activoDe(r), p = 1 - a;
  const crupier = crupierDeRonda(E);
  const respA = respuestas[a] ?? normalizarRespuesta(null);
  const respP = respuestas[p] ?? normalizarRespuesta(null);
  const sorteo = E.azar[r - 1];

  // activo: una carta de su mano; si no sirve, una legal sorteada de antemano
  const manoAntes = [...E.mano[a]];
  const motivoA = motivoActivo(respA, manoAntes);
  const carta = motivoA ? manoAntes[Math.floor(sorteo.carta * manoAntes.length)] : respA.carta;
  // predictor: lado y fichas; si no sirven, el lado sorteado y 1 ficha. Pedir mas de lo que tiene es apostar todo.
  const motivoP = motivoPredictor(respP);
  const lado = motivoP ? (sorteo.lado < 0.5 ? 'mayor' : 'menor') : respP.lado;
  const pedida = motivoP ? 1 : respP.fichas;
  const fichasAntes = [...E.fichas];
  const maxima = apuestaMaxima(E, p); // sus fichas y, con topeRival, no mas de las de su rival
  const apuesta = Math.min(pedida, maxima);
  const todo = apuesta === maxima; // apostar todo = apostar lo maximo permitido
  const doble = E.dobles.includes(r) ? 2 : 1; // en una ronda doble las ganancias se pagan al doble (lo que se pierde, no)

  const motivos = asientos.map(() => null);
  motivos[a] = motivoA;
  motivos[p] = motivoP;
  for (const s of asientos) {
    const st = E.stats[s];
    st.respuestas++;
    if (motivos[s]) st.invalidas++;
    else st.validas++;
  }

  // resolucion
  const igual = carta === crupier;
  const veredicto = igual ? (E.reglas.igualEsMenor ? 'menor' : 'igual') : carta > crupier ? 'mayor' : 'menor'; // igualEsMenor: la carta igual cuenta como «menor» y la apuesta se resuelve
  const ganaActivo = carta > crupier ? (carta - crupier) * doble : 0;
  let acierto = null, ganaPredictor = 0;
  if (veredicto !== 'igual') {
    acierto = lado === veredicto;
    ganaPredictor = acierto ? apuesta * doble : -apuesta;
  }
  E.fichas[a] += ganaActivo;
  E.fichas[p] += ganaPredictor;

  const sa = E.stats[a], sp = E.stats[p];
  sa.rondasActivo++;
  sa.fichasActivo += ganaActivo;
  if (!motivoP) { // una apuesta de reemplazo la puso el motor: no mide nada del predictor
    sp.fichasApostadas += apuesta;
    if (todo) sp.apostoTodo++;
    if (acierto !== null) {
      sp.apuestas++;
      if (acierto) sp.aciertos++;
    }
  }

  // cartas: la jugada y la del crupier se retiran para siempre
  const copia = manoAntes.indexOf(carta);
  E.mano[a] = manoAntes.filter((_, k) => k !== copia); // solo esa copia: con la mano oculta puede haber cartas repetidas
  E.jugadas[a].push(carta);
  E.crupierSalidas[a].push(crupier);
  const reemplazadas = motivos.map((m) => m !== null); // jugadas que puso el juego por una respuesta ilegal (publico: el historial las marca)
  E.historial.push({ ronda: r, activo: a, crupier, carta, lado, apuesta, veredicto, igual, doble, acierto, ganaActivo, ganaPredictor, reemplazadas });

  const narracion = narrarRonda({
    E, ronda: r, activo: a, predictor: p, crupier, carta, lado, apuesta, todo, veredicto, igual, doble, acierto, ganaActivo, ganaPredictor,
    reemplazadas, fichas: [...E.fichas], fichasAntes, manoAntes, maxima,
  });

  const sinFichas = E.fichas.some((f) => f === 0);
  const final = sinFichas || r === RONDAS ? cerrar(E, sinFichas ? 'fichas' : 'rondas') : null;
  if (!E.fin) E.ronda++;

  return {
    ronda: r, activo: a, predictor: p, crupier, carta, lado, apuesta, apostoTodo: todo,
    veredicto, igual, doble, acierto, ganaActivo, ganaPredictor,
    apuestaMaxima: maxima, // lo que podia apostar como mucho el predictor en esta ronda (publico)
    fichasAntes, fichas: [...E.fichas],
    mano: E.mano.map((m) => [...m]),
    crupierQuedan: E.crupierSalidas.map((salidas) => CARTAS_CRUPIER.filter((c) => !salidas.includes(c))), // conjuntos: no dicen el orden
    razones: asientos.map((s) => respuestas[s]?.razon || null),
    invalidas: asientos.map((s) => motivos[s] !== null),
    motivos,
    errores: asientos.map((s) => respuestas[s]?.error ?? null),
    crudos: asientos.map((s) => (motivos[s] && typeof respuestas[s]?.crudo === 'string' ? respuestas[s].crudo.slice(0, LARGO_CRUDO) : null)),
    final,
    narracion,
  };
}

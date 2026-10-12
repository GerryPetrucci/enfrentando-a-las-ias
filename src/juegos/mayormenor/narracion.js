// La historia publica de Mayor o menor. Se cuenta desde lo que registro el motor, con frases de plantilla que varian segun el seed: no hay llamadas
// extra a modelos y lo que se ve es lo que paso. Los nombres de las IAs son {0} y {1} (el asiento): el reproductor los reemplaza con resolverNombres.
// El texto es PUBLICO (lleva acentos); lo que ven las IAs vive en vista.js. Las lineas de tipo "comentario" son los disparadores de la voz narradora.
//
// La narracion usa su PROPIO flujo aleatorio (derivado de estado.semillaNarracion): cambiar una frase nunca cambia el juego.

import { crearRng } from '../../rng.js';
import { RONDAS } from './constantes.js';

const elegir = (rng, lista) => lista[Math.floor(rng() * lista.length)];
const quien = (s) => `{${s}}`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const rngDe = (E, ronda) => crearRng((E.semillaNarracion ^ Math.imul(ronda, 0x9e3779b1)) >>> 0);
const lider = (f) => (f[0] === f[1] ? null : f[0] > f[1] ? 0 : 1);

// reemplazadas[s] = true si la jugada de ese jugador la puso el motor porque su respuesta fue ilegible o fallo la API: no se narra como decision suya.
export function narrarRonda({
  E, ronda, activo, predictor, crupier, carta, lado, apuesta, todo, veredicto, acierto, ganaActivo, ganaPredictor,
  reemplazadas = [false, false], fichas, fichasAntes, manoAntes = [],
}) {
  const rng = rngDe(E, ronda);
  const lineas = [];
  const agregar = (tipo, texto) => lineas.push({ tipo, texto });
  const a = quien(activo), p = quien(predictor);

  agregar('apertura', `Ronda ${ronda} de ${RONDAS}. ${elegir(rng, [`${a} es el jugador activo.`, `Le toca jugar a ${a}.`, `${a} lleva la mano en esta ronda.`])}`);
  agregar('crupier', `El crupier de ${a} revela un ${crupier}.`);
  agregar('jugada', reemplazadas[activo]
    ? `${a} no responde bien: se juega una carta legal en su lugar.`
    : `${a} ${elegir(rng, ['elige una carta y la deja boca abajo.', 'baja una carta boca abajo.', 'escoge su carta en secreto.'])}`);
  agregar('apuesta', reemplazadas[predictor]
    ? `${p} no responde bien: se le pone una apuesta de 1 ficha a "${lado}".`
    : `${p} apuesta ${plural(apuesta, 'ficha', 'fichas')} a que será ${lado}.`);

  if (veredicto === 'igual') {
    agregar('revelacion', `Se revela el ${carta}: igual que el crupier. Nadie gana nada y la apuesta se devuelve.`);
  } else {
    agregar('revelacion', `Se revela el ${carta}: ${veredicto} que el ${crupier}.`);
    agregar('resultado', ganaActivo > 0 ? `${a} gana ${plural(ganaActivo, 'ficha', 'fichas')}.` : `${a} no gana fichas.`);
    agregar('resultado', acierto
      ? `${p} acierta y gana ${plural(apuesta, 'ficha', 'fichas')}.`
      : `${p} falla y pierde ${plural(apuesta, 'ficha', 'fichas')}.`);
  }

  // comentarios para la voz
  if (!reemplazadas[predictor] && todo) agregar('comentario', `${p} lo apuesta todo.`);
  if (veredicto === 'igual') agregar('comentario', 'Carta igual: la apuesta se devuelve y la ronda no mueve las fichas.');
  // "todo apuntaba a mayor" = a la mano del activo le quedaban mas cartas por encima del crupier que por debajo (la mano es publica)
  const arriba = manoAntes.filter((c) => c > crupier).length, abajo = manoAntes.filter((c) => c < crupier).length;
  if (!reemplazadas[activo] && veredicto === 'menor' && arriba > abajo) {
    agregar('comentario', acierto === false
      ? `${a} juega bajo a propósito y ${p} cae.`
      : `${a} juega una carta baja pudiendo ganar fichas: regala la ronda.`);
  }
  if (acierto === false && apuesta * 2 >= fichasAntes[predictor]) agregar('comentario', `${p} pierde buena parte de sus fichas de golpe.`);
  const antes = lider(fichasAntes), despues = lider(fichas);
  if (antes !== null && despues !== null && antes !== despues) agregar('comentario', `${quien(despues)} pasa al frente.`);
  return lineas;
}

// El cierre de la historia. Solo existe cuando la partida termino. E.ronda es la ultima ronda jugada.
export function narrarEpilogo(E) {
  if (!E.fin || !E.final) return [];
  const f = E.final;
  const lineas = [];
  const agregar = (texto) => lineas.push({ tipo: 'epilogo', texto });
  if (f.causa === 'fichas') agregar(`${quien(E.fichas.findIndex((x) => x === 0))} se queda sin fichas en la ronda ${E.ronda}: la partida termina.`);
  else agregar(`Se juegan las ${RONDAS} rondas.`);
  agregar(f.ganador === null
    ? `Empate: los dos terminan con ${plural(E.fichas[0], 'ficha', 'fichas')}.`
    : `${quien(f.ganador)} gana con ${plural(E.fichas[f.ganador], 'ficha', 'fichas')} contra ${E.fichas[1 - f.ganador]}.`);
  agregar(`Fichas finales: ${quien(0)} ${E.fichas[0]}, ${quien(1)} ${E.fichas[1]}.`);
  return lineas;
}

// {0} y {1} -> los nombres de las IAs de esa partida (jugadores = lo que guarda la arena en cada partida)
export const resolverNombres = (texto, jugadores) =>
  String(texto).replace(/\{([0-1])\}/g, (_, k) => jugadores?.[k]?.nombre ?? `Jugador ${Number(k) + 1}`);

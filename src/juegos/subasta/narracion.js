// La historia publica de Subasta de tiempo. Se cuenta desde lo que registro el motor, con frases de plantilla que varian segun el seed: no hay
// llamadas extra a modelos y lo que se ve es lo que paso. REVELA lo que las IAs nunca ven (cuanto aposto cada una): esa es la gracia para el
// publico. Los nombres de las IAs son {0} a {4} (el asiento): el reproductor los reemplaza con resolverNombres. El texto es PUBLICO (lleva
// acentos); lo que ven las IAs vive en vista.js. Las lineas de tipo "comentario" son los disparadores de la voz narradora.
//
// La narracion usa su PROPIO flujo aleatorio (derivado de estado.semillaNarracion): cambiar una frase nunca cambia el juego.

import { crearRng } from '../../rng.js';
import { SUBASTAS, BANCO, JUGADORES, segundos } from './constantes.js';

const elegir = (rng, lista) => lista[Math.floor(rng() * lista.length)];
const quien = (s) => `{${s}}`;
const unir = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const seg = (x) => x.toFixed(1);
const TODOS = { 2: 'los dos', 3: 'los tres', 4: 'los cuatro', 5: 'los cinco' };
const rngDe = (E, subasta) => crearRng((E.semillaNarracion ^ Math.imul(subasta, 0x9e3779b1)) >>> 0);

// apuestas[s] y bancos[s] estan en SEGUNDOS (bancos = despues de la subasta); null = ese jugador ya no tenia tiempo y no aposto.
// reemplazadas[s] = true si la apuesta de ese jugador (un 0) la puso el motor porque su respuesta fue ilegible o fallo la API: no se narra como
// una decision de retirarse. fichas / fichasAntes (opcionales) son las fichas de despues y de antes de esta subasta, para comentar quien se adelanta.
export function narrarSubasta({ E, subasta, apuestas, bancos, ganador, sinGanador, empatados, reemplazadas = [], fichas = null, fichasAntes = null }) {
  const rng = rngDe(E, subasta);
  const lineas = [];
  const agregar = (tipo, texto) => lineas.push({ tipo, texto });
  const jugaron = apuestas.map((a, s) => (a === null || a === undefined ? -1 : s)).filter((s) => s >= 0);

  agregar('apertura', `Subasta ${subasta} de ${SUBASTAS}. ${elegir(rng, ['Todos mantienen el botón oculto.', 'Empieza la cuenta regresiva.', 'Nadie sabe cuánto apuesta el resto.'])}`);

  const todosSeRetiran = jugaron.length > 1 && jugaron.every((s) => apuestas[s] === 0 && !reemplazadas[s]);
  if (todosSeRetiran) {
    agregar('apuesta', 'Todos se retiran sin gastar nada.');
  } else {
    for (const s of jugaron) {
      if (reemplazadas[s]) agregar('apuesta', `${quien(s)} no responde bien: se cuenta como retirada.`);
      else agregar('apuesta', apuestas[s] === 0 ? `${quien(s)} se retira sin gastar nada.` : `${quien(s)} aguanta ${seg(apuestas[s])} segundos.`);
    }
  }

  if (ganador !== null) {
    agregar('resultado', `${quien(ganador)} gana la subasta con ${seg(apuestas[ganador])} segundos y se lleva la ficha.`);
  } else if (sinGanador === 'empate') {
    agregar('resultado', `Empate a ${seg(apuestas[empatados[0]])} segundos entre ${unir(empatados.map(quien))}: la subasta se anula y ${TODOS[empatados.length] ?? 'todos'} pierden ese tiempo.`);
  } else {
    agregar('resultado', 'Nadie aguanta: la subasta se queda sin ganador.');
  }

  // comentarios para la voz
  if (sinGanador === 'empate') agregar('comentario', 'Empate en lo más alto: nadie se lleva la ficha, y todo ese tiempo se pierde.');
  if (todosSeRetiran) agregar('comentario', 'Nadie quiere pagar: la subasta pasa en blanco.');
  if (ganador !== null && fichas && fichasAntes) {
    const tope = Math.max(...fichasAntes);
    const empatadosArriba = fichasAntes.filter((f) => f === tope).length;
    const ahoraSolo = fichas.every((f, t) => t === ganador || f < fichas[ganador]);
    if (tope > 0 && empatadosArriba > 1 && fichasAntes[ganador] === tope && ahoraSolo) agregar('comentario', `${quien(ganador)} se adelanta en fichas.`);
  }
  for (const s of jugaron) {
    if (apuestas[s] > segundos(BANCO) / 2) agregar('comentario', `${quien(s)} apuesta más de la mitad de su banco inicial en una sola subasta.`);
    if (apuestas[s] > 0 && bancos[s] === 0) agregar('comentario', `${quien(s)} se queda sin tiempo: ya no podrá apostar.`);
  }
  if (ganador !== null && apuestas[ganador] <= 1 && jugaron.every((s) => s === ganador || apuestas[s] === 0)) {
    agregar('comentario', `${quien(ganador)} se lleva la ficha por casi nada.`);
  }
  return lineas;
}

// El cierre de la historia. Solo existe cuando la partida termino. Los bancos del estado estan en decimas.
export function narrarEpilogo(E) {
  if (!E.fin || !E.final) return [];
  const f = E.final;
  const lineas = [];
  const agregar = (texto) => lineas.push({ tipo: 'epilogo', texto });
  agregar(f.pieza === null
    ? 'Nadie gana la pieza: los de arriba empatan en fichas y en tiempo.'
    : `${quien(f.pieza)} gana la pieza: ${plural(E.fichas[f.pieza], 'ficha', 'fichas')} y ${seg(segundos(E.bancos[f.pieza]))} segundos de banco.`);
  agregar(f.eliminado === null
    ? 'Nadie queda eliminado: los de abajo empatan en fichas y en tiempo.'
    : `${quien(f.eliminado)} queda eliminado con ${plural(E.fichas[f.eliminado], 'ficha', 'fichas')}.`);
  if (f.criterioPieza === 'tiempo') agregar('Empataron en fichas arriba y desempató el tiempo que conservaban.');
  if (f.criterioEliminado === 'tiempo') agregar('Empataron en fichas abajo y desempató el tiempo que conservaban.');
  const todos = [...Array(JUGADORES).keys()];
  agregar(`Fichas: ${todos.map((s) => `${quien(s)} ${E.fichas[s]}`).join(', ')}. Tiempo que sobró: ${todos.map((s) => `${quien(s)} ${seg(segundos(E.bancos[s]))} s`).join(', ')}.`);
  return lineas;
}

// {0}..{4} -> los nombres de las IAs de esa partida (jugadores = lo que guarda la arena en cada partida)
export const resolverNombres = (texto, jugadores) =>
  String(texto).replace(/\{([0-4])\}/g, (_, k) => jugadores?.[k]?.nombre ?? `Jugador ${Number(k) + 1}`);

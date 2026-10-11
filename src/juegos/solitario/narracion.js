// La historia publica de El numero solitario. Se cuenta desde lo que registro el motor, con frases de plantilla que varian segun el
// seed: no hay llamadas extra a modelos y lo que se ve es lo que paso. Los nombres de las IAs son {0} a {4} (el asiento): el
// reproductor los reemplaza con resolverNombres. El texto es PUBLICO (lleva acentos); lo que ven las IAs vive en vista.js.
// Las lineas de tipo "comentario" son los disparadores de la voz narradora.
//
// La narracion usa su PROPIO flujo aleatorio (derivado de estado.semillaNarracion): cambiar una frase nunca cambia el azar.

import { crearRng } from '../../rng.js';
import { RONDAS, cicloDe } from './constantes.js';
import { lideres } from './cortes.js';

const elegir = (rng, lista) => lista[Math.floor(rng() * lista.length)];
const quien = (s) => `{${s}}`;
const unir = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
const puntos = (n) => `${n} punto${n === 1 ? '' : 's'}`;
const fichas = (n) => `${n} ficha${n === 1 ? '' : 's'}`;
const rngDe = (E, ronda, fase) => crearRng((E.semillaNarracion ^ Math.imul(ronda * 2 + fase, 0x9e3779b1)) >>> 0);
const sentados = (xs) => xs.map((x, s) => (x === null || x === undefined ? -1 : s)).filter((s) => s >= 0);

// Fase 1. `E` esta tal como estaba al empezar la ronda (los puntos son los de antes).
export function narrarPareja({ E, ronda, parejas }) {
  const rng = rngDe(E, ronda, 1);
  const lineas = [];
  const agregar = (tipo, texto) => lineas.push({ tipo, texto });
  agregar('apertura', `Ronda ${ronda} de ${RONDAS} · ciclo ${cicloDe(ronda)}. ${elegir(rng, ['Cada quien elige dos cartas.', 'Las parejas se eligen en secreto.', 'Hora de elegir pareja de cartas.'])}`);
  const arriba = lideres(E);
  if (arriba.length) agregar('situacion', `${unir(arriba.map(quien))} ${arriba.length === 1 ? 'va' : 'van'} arriba con ${puntos(E.puntos[arriba[0]])}.`);
  for (const s of sentados(parejas)) agregar('pareja', `${quien(s)} ${elegir(rng, ['enseña', 'muestra'])} el ${parejas[s][0]} y el ${parejas[s][1]}.`);
  return lineas;
}

// Fase 2. `corte` = { numero, jugador, puntos, criterio } o null.
export function narrarMarca({ E, ronda, parejas, marcas, anuladas, ganador, numero, lideresAntes, lideresDespues, corte }) {
  const rng = rngDe(E, ronda, 2);
  const lineas = [];
  const agregar = (tipo, texto) => lineas.push({ tipo, texto });
  const jugaron = sentados(marcas);

  for (const s of jugaron) agregar('marca', `${quien(s)} juega el ${marcas[s]}.`);

  // anulaciones: un renglon por numero repetido, y un comentario si chocan tres o mas
  const porNumero = new Map();
  for (const s of jugaron) if (anuladas[s]) porNumero.set(marcas[s], [...(porNumero.get(marcas[s]) ?? []), s]);
  for (const [num, quienes] of [...porNumero].sort((a, b) => a[0] - b[0])) {
    agregar('anulacion', `El ${num} se anula: lo jugaron ${unir(quienes.map(quien))}.`);
    if (quienes.length >= 3) agregar('comentario', `Choque de ${quienes.length} en el ${num}: demasiados pensaron lo mismo.`);
  }

  if (ganador === null) {
    agregar('resultado', `${elegir(rng, ['Ningún número queda solo', 'Todos chocan con alguien'])}: nadie gana la ronda.`);
    agregar('comentario', 'Ronda en blanco: los puntos siguen donde estaban.');
  } else {
    agregar('resultado', `${quien(ganador)} gana la ronda con el ${numero}: suma ${puntos(numero)} y una ficha de victoria.`);
    if (numero === Math.max(...parejas[ganador])) agregar('comentario', `${quien(ganador)} jugó la carta más alta de su pareja y le salió bien.`);
    const yaLider = lideresAntes.length === 1 && lideresAntes[0] === ganador;
    if (!yaLider && lideresDespues.length === 1 && lideresDespues[0] === ganador) agregar('comentario', `${quien(ganador)} toma la delantera.`);
  }

  if (corte) {
    const detalle = corte.criterio === 'puntos' ? '' : ` (desempate por ${corte.criterio})`;
    agregar('corte', `Fin del corte ${corte.numero}: ${quien(corte.jugador)} queda a salvo con ${puntos(corte.puntos)}${detalle} y sale de la partida.`);
    if (corte.criterio === 'sorteo') agregar('comentario', 'Empate total en el corte: lo decide el sorteo.');
  }
  return lineas;
}

// El cierre de la historia. Solo existe cuando la partida termino.
export function narrarEpilogo(E) {
  if (!E.fin || !E.final) return [];
  const f = E.final;
  const lineas = [];
  const agregar = (texto) => lineas.push({ tipo: 'epilogo', texto });
  const salvos = E.corteSalvo.map((c, s) => (c ? { s, c } : null)).filter(Boolean).sort((a, b) => a.c - b.c);
  for (const { s, c } of salvos) agregar(`${quien(s)} había quedado a salvo en el corte ${c}.`);
  agregar(`${quien(f.pieza)} gana la pieza: termina con ${puntos(E.puntos[f.pieza])} y ${fichas(E.fichas[f.pieza])}.`);
  agregar(`${quien(f.medio)} sobrevive en el medio de la tabla con ${puntos(E.puntos[f.medio])}.`);
  agregar(`${quien(f.eliminado)} queda eliminado con ${puntos(E.puntos[f.eliminado])}.`);
  if (f.criterioPieza === 'sorteo' || f.criterioEliminado === 'sorteo') agregar('El sorteo decidió un empate total en la final.');
  else if (f.criterioPieza === 'fichas' || f.criterioEliminado === 'fichas') agregar('Las fichas de victoria desempataron la final.');
  else if (f.criterioPieza === 'ultima victoria' || f.criterioEliminado === 'ultima victoria') agregar('Desempató quien ganó una ronda más tarde.');
  agregar(`Puntos de cartas: ${E.puntos.map((p, s) => `${quien(s)} ${p}`).join(', ')}.`);
  return lineas;
}

// {0}..{4} -> los nombres de las IAs de esa partida (jugadores = lo que guarda la arena en cada partida)
export const resolverNombres = (texto, jugadores) =>
  String(texto).replace(/\{([0-4])\}/g, (_, k) => jugadores?.[k]?.nombre ?? `Jugador ${Number(k) + 1}`);

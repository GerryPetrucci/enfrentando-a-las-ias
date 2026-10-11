// La historia publica de Triple dado. Se cuenta desde lo que registro el motor, con frases de plantilla que varian segun el seed: no hay llamadas
// extra a modelos y lo que se ve es lo que paso. Los nombres de las IAs son {0} a {3} (el asiento): el reproductor los reemplaza con resolverNombres.
// El texto es PUBLICO (lleva acentos); lo que ven las IAs vive en vista.js. Las lineas de tipo "comentario" son los disparadores de la voz narradora.
// Los puntos que recibe son DOCEAVOS enteros; aqui se muestran con aPuntos.
//
// La narracion usa su PROPIO flujo aleatorio (derivado de estado.semillaNarracion): cambiar una frase nunca cambia el juego.

import { crearRng } from '../../rng.js';
import { RONDAS, ENFRENTAMIENTOS, JUGADORES } from './constantes.js';
import { aPuntos } from './combinaciones.js';

const elegir = (rng, lista) => lista[Math.floor(rng() * lista.length)];
const quien = (s) => `{${s}}`;
const unir = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const pts = (d) => aPuntos(d);
const rngDe = (E, clave) => crearRng((E.semillaNarracion ^ Math.imul(clave + 1, 0x9e3779b1)) >>> 0);
const asientos = [...Array(JUGADORES).keys()];

// Los blancos de cada jugador de la ronda (blancos[s] = 9 valores) y la apertura. forzada = ronda 4: la tarjeta que queda se pone sola.
export function narrarLanzamiento({ E, ronda, forzada, blancos }) {
  const rng = rngDe(E, ronda * 10);
  const lineas = [];
  const agregar = (tipo, texto) => lineas.push({ tipo, texto });
  agregar('apertura', `Ronda ${ronda} de ${RONDAS}. ${forzada
    ? 'A cada uno le queda una sola tarjeta y se pone sola.'
    : elegir(rng, ['Cada uno elige su tarjeta antes de ver los dados.', 'Primero las tarjetas, después los dados.', 'Nadie ha visto los dados: toca apostar a ciegas.'])}`);
  for (const s of asientos) agregar('lanzamiento', `${quien(s)} lanza ${[...blancos[s]].sort((a, b) => b - a).join(' ')} en dados blancos.`);
  return lineas;
}

// combos[s] = { valores, dados, categoria, ocultos } (ocultos = 'rojo' / 'azul' usados). puntosD, docenos. reemplazadas[s] = la jugada la puso el motor.
export function narrarEnfrentamiento({ E, ronda, k, combos, puntosD, puesto, porDesempate, reemplazadas = [] }) {
  const rng = rngDe(E, ronda * 10 + k);
  const lineas = [];
  const agregar = (tipo, texto) => lineas.push({ tipo, texto });
  agregar('apertura', `Enfrentamiento ${k} de ${ENFRENTAMIENTOS}. ${elegir(rng, ['Todos eligen a la vez.', 'Se revelan las combinaciones.', 'Cada uno juega tres dados.'])}`);
  for (const s of asientos) {
    if (reemplazadas[s]) {
      agregar('jugada', `${quien(s)} no responde bien: se juegan tres dados al azar.`);
      continue;
    }
    const c = combos[s];
    const oculto = c.ocultos.length ? `, con el dado ${unir(c.ocultos)}` : '';
    agregar('jugada', `${quien(s)} muestra ${[...c.valores].sort((a, b) => b - a).join('-')}: ${c.categoria}${oculto}.`);
  }
  const primeros = asientos.filter((s) => puesto[s] === 1);
  if (primeros.length === 1) {
    agregar('resultado', `${quien(primeros[0])} gana el enfrentamiento y se lleva ${plural(pts(puntosD[primeros[0]]), 'punto', 'puntos')}.`);
  } else {
    agregar('resultado', `${unir(primeros.map(quien))} empatan en el primer lugar y se reparten los puntos: ${pts(puntosD[primeros[0]])} cada uno.`);
  }
  agregar('resultado', `Puntos: ${asientos.map((s) => `${quien(s)} ${pts(puntosD[s])}`).join(', ')}.`);

  // comentarios para la voz
  if (new Set(puesto).size < JUGADORES) agregar('comentario', 'Hay un empate y se reparten los puntos.');
  for (const s of asientos) {
    if (!reemplazadas[s] && combos[s].categoria === 'triple') agregar('comentario', `${quien(s)} saca un triple.`);
    if (!reemplazadas[s] && porDesempate[s] && puesto[s] === 1) agregar('comentario', `${quien(s)} gana por el dado que le sobraba.`);
    if (!reemplazadas[s] && primeros.length === 1 && primeros[0] === s && combos[s].ocultos.length) agregar('comentario', `${quien(s)} usa un dado oculto para ganar el enfrentamiento.`);
  }
  return lineas;
}

// tarjetas[s], totalesD[s] (puntos de los 3 enfrentamientos), aciertos[s], puntosD[s] (con premio), distancias[s] (docenos que le faltaron a una tarjeta fallida).
export function narrarCierreRonda({ tarjetas, totalesD, aciertos, puntosD, distancias }) {
  const lineas = [];
  const agregar = (tipo, texto) => lineas.push({ tipo, texto });
  for (const s of asientos) {
    const t = tarjetas[s];
    const suma = `${quien(s)} predijo ${t} y suma ${pts(totalesD[s])}`;
    if (aciertos[s]) agregar('cierre', t === 'ZERO' ? `${suma}: logra el ZERO y cobra ${pts(puntosD[s])}.` : `${suma}: acierta y duplica: ${pts(puntosD[s])}.`);
    else agregar('cierre', `${suma}: falla y se queda con ${pts(puntosD[s])}.`);
  }
  for (const s of asientos) {
    if (aciertos[s] && tarjetas[s] === 'ZERO') agregar('comentario', `${quien(s)} logra el ZERO: 40 puntos.`);
    if (!aciertos[s] && distancias[s] > 0 && distancias[s] <= 12) agregar('comentario', `${quien(s)} se queda a ${pts(distancias[s])} de acertar ${tarjetas[s]}.`);
  }
  return lineas;
}

// El cierre de la historia. Solo existe cuando la partida termino.
export function narrarEpilogo(E) {
  if (!E.fin || !E.final) return [];
  const f = E.final;
  const lineas = [];
  const agregar = (texto) => lineas.push({ tipo: 'epilogo', texto });
  agregar(f.pieza === null
    ? 'Nadie gana la pieza: los de arriba empatan en puntos.'
    : `${quien(f.pieza)} gana la pieza con ${plural(pts(E.puntos[f.pieza]), 'punto', 'puntos')}.`);
  agregar(f.eliminado === null
    ? 'Nadie queda eliminado: los de abajo empatan en puntos.'
    : `${quien(f.eliminado)} queda eliminado con ${plural(pts(E.puntos[f.eliminado]), 'punto', 'puntos')}.`);
  agregar(`Puntos finales: ${asientos.map((s) => `${quien(s)} ${pts(E.puntos[s])}`).join(', ')}.`);
  return lineas;
}

// {0}..{3} -> los nombres de las IAs de esa partida (jugadores = lo que guarda la arena en cada partida)
export const resolverNombres = (texto, jugadores) =>
  String(texto).replace(/\{([0-3])\}/g, (_, k) => jugadores?.[k]?.nombre ?? `Jugador ${Number(k) + 1}`);

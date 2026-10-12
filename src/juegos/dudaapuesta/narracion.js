// La historia publica de Duda y apuesta. Se cuenta desde lo que registro el motor, con frases de plantilla que varian segun el seed: no hay llamadas extra a
// modelos y lo que se ve es lo que paso. Los nombres de las IAs son {0} a {3} (el asiento): el reproductor los reemplaza con resolverNombres.
// El texto es PUBLICO (lleva acentos); lo que ven las IAs vive en vista.js. Las lineas de tipo "comentario" son los disparadores de la voz narradora.
// Vocabulario suave: se habla de "farol" y de anuncios que no se cumplen; nunca de mentir ni de enganar.
//
// La narracion usa su PROPIO flujo aleatorio (derivado de estado.semillaNarracion): cambiar una frase nunca cambia el juego.

import { crearRng } from '../../rng.js';
import { MANOS, JUGADORES } from './constantes.js';

const elegir = (rng, lista) => lista[Math.floor(rng() * lista.length)];
const quien = (s) => `{${s}}`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const unir = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
const rngDe = (E, clave) => crearRng((E.semillaNarracion ^ Math.imul(clave + 1, 0x9e3779b1)) >>> 0);
const asientos = [...Array(JUGADORES).keys()];
const CARTAS = { rojo: ['roja', 'rojas'], amarillo: ['amarilla', 'amarillas'], azul: ['azul', 'azules'], verde: ['verde', 'verdes'], morado: ['morada', 'moradas'] };
const cartas = (color, n = 2) => CARTAS[color]?.[n === 1 ? 0 : 1] ?? color; // "roja" / "rojas" segun la cantidad
const nCartas = (n, color) => `${n} ${n === 1 ? 'carta' : 'cartas'} ${cartas(color, n)}`; // "1 carta roja", "2 cartas azules"

// "2 fichas", "1 ficha y 1 de espacio", "1 ficha de espacio"
export function textoApuesta(ap) {
  const f = ap.fichas, e = ap.espacios;
  if (f && e) return `${plural(f, 'ficha', 'fichas')} y ${e} de espacio`;
  if (e) return `${plural(e, 'ficha de espacio', 'fichas de espacio')}`;
  return plural(f, 'ficha', 'fichas');
}

// Un anuncio (anunciar o aceptar). previo = el anuncio que se acepta (null al abrir); previoFalso = ese anuncio no se cumplia con las cartas reales (solo lo sabe el motor).
// reemplazo = lo puso el juego por una respuesta ilegal.
export function narrarAnuncio({ E, mano, decision, s, accion, anuncio, apuesta, reemplazo, previo, previoFalso = false }) {
  const rng = rngDe(E, mano * 10 + decision);
  const lineas = [];
  const agregar = (tipo, texto) => lineas.push({ tipo, texto });
  if (decision === 1) {
    agregar('apertura', `Mano ${mano} de ${MANOS}. Empieza ${quien(s)}${mano > 1 ? ', que perdió la mano anterior' : ''}.`);
  }
  const cuerpo = `al menos ${nCartas(anuncio.cantidad, anuncio.color)}`;
  if (reemplazo) {
    agregar('hecho', `${quien(s)} no responde bien y el juego ${accion === 'aceptar' ? 'acepta y ' : ''}anuncia por ${quien(s)}: ${cuerpo}, con una apuesta de ${textoApuesta(apuesta)}.`);
    return lineas;
  }
  if (accion === 'aceptar') {
    agregar('hecho', `${quien(s)} acepta: ${quien(previo.asiento)} recupera su apuesta. ${elegir(rng, ['Ahora anuncia', 'Y anuncia', 'Responde anunciando'])} ${cuerpo} y apuesta ${textoApuesta(apuesta)}.`);
    // un farol que nadie duda: se acepta un anuncio que no se cumplia (el motor lo sabe; la IA no)
    if (previoFalso) agregar('comentario', `El anuncio de ${quien(previo.asiento)} no se cumplía, pero ${quien(s)} lo acepta.`);
  } else {
    agregar('hecho', `${quien(s)} ${elegir(rng, ['anuncia', 'declara', 'asegura que hay'])} ${cuerpo} y apuesta ${textoApuesta(apuesta)}.`);
  }
  return lineas;
}

// Quien duda. p = quien hizo el ultimo anuncio; subio = el que duda apuesta mas que el anuncio.
export function narrarDuda({ E, mano, decision, s, p, apuesta, subio, reemplazo }) {
  const rng = rngDe(E, mano * 10 + decision);
  if (reemplazo) return [{ tipo: 'hecho', texto: `${quien(s)} no responde bien y el juego duda por ${quien(s)} del anuncio de ${quien(p)}.` }];
  const frase = subio
    ? `${quien(s)} duda del anuncio de ${quien(p)} y sube la apuesta a ${textoApuesta(apuesta)}.`
    : `${quien(s)} ${elegir(rng, ['duda', 'no se lo cree y duda'])} del anuncio de ${quien(p)}${apuesta ? ` e iguala con ${textoApuesta(apuesta)}` : ''}.`;
  return [{ tipo: 'hecho', texto: frase }];
}

// La respuesta de quien anuncio cuando le subieron la apuesta.
export function narrarDefensa({ p, accion, reemplazo }) {
  const por = reemplazo ? ` (el juego responde por ${quien(p)})` : '';
  return [{ tipo: 'hecho', texto: accion === 'igualar'
    ? `${quien(p)} iguala la subida${por}.`
    : `${quien(p)} se retira${por} y pierde lo que había apostado; las cartas no se revelan.` }];
}

// El desenlace de la mano. res = lo que devuelve resolver() en turno.js. reemplazos = { anuncio, duda, defensa }: cuales jugadas de esa mano las puso el juego por una
// respuesta ilegal. El comentario nunca le atribuye a una IA lo que puso el juego: ni un farol, ni una duda que "descubre", ni una retirada.
export function narrarResolucion({ res, reemplazos = {} }) {
  const lineas = [];
  const agregar = (tipo, texto) => lineas.push({ tipo, texto });
  // lo que RECIBE el ganador (una ficha de espacio de mas se vuelve ficha de juego); los registros viejos solo traen lo que puso el perdedor
  const gana = `${quien(res.ganador)} gana ${textoApuesta(res.ganado ?? res.movidas)}`;
  const p = quien(res.predictor), d = quien(res.dudador);
  if (res.tipo === 'retirada') {
    agregar('hecho', `${gana} sin que se revelen las cartas.`);
    if (!reemplazos.defensa) agregar('comentario', `${p} prefiere no averiguarlo.`);
    return lineas;
  }
  const detalle = asientos.map((s) => `${quien(s)} ${res.cuentas[s]}`).join(', ');
  agregar('hecho', `Se revelan las cartas: hay ${res.real} ${cartas(res.color, res.real)} (${detalle}).`);
  agregar('hecho', `${gana}.`);
  const delAnuncio = reemplazos.anuncio ? `El anuncio que el juego puso por ${p}` : `El anuncio de ${p}`;
  if (res.ganador === res.predictor) {
    if (res.real === res.cantidad) agregar('comentario', `Justo: había exactamente ${res.cantidad}.`);
    else if (reemplazos.anuncio || reemplazos.duda) agregar('comentario', `${delAnuncio} era cierto.`);
    else agregar('comentario', `${d} dudó y el anuncio era cierto.`);
  } else if (reemplazos.anuncio) {
    agregar('comentario', `${delAnuncio} no se cumplía.`);
  } else if (reemplazos.duda) {
    agregar('comentario', `${delAnuncio} no se cumplía: era un farol.`);
  } else {
    agregar('comentario', `${delAnuncio} no se cumplía: era un farol y ${d} lo descubre.`);
  }
  return lineas;
}

// Lo que pasa al cerrar la mano: el pago a la banca, los espacios comprados (y los que se pidieron y no se pudo), quien se queda con una sola carta y quien pasa al frente.
// sinEspacios = quienes acaban de perder su ultima ficha de espacio; alFrente = el asiento que pasa a liderar en fichas de juego (null si nadie).
export function narrarCierreMano({ mano, pago, compras, fallidas = [], sinEspacios = [], alFrente = null }) {
  const lineas = [];
  if (pago) lineas.push({ tipo: 'hecho', texto: `Después de la mano ${mano}, cada jugador paga una ficha de juego a la banca.` });
  for (const s of compras) lineas.push({ tipo: 'hecho', texto: `${quien(s)} cambia una ficha de juego por un espacio más.` });
  for (const s of fallidas) lineas.push({ tipo: 'hecho', texto: `${quien(s)} no puede comprar el espacio: ya no le alcanzan las fichas.` });
  for (const s of sinEspacios) lineas.push({ tipo: 'comentario', texto: `${quien(s)} se queda con una sola carta.` });
  if (alFrente !== null) lineas.push({ tipo: 'comentario', texto: `${quien(alFrente)} pasa al frente en fichas.` });
  return lineas;
}

// El cierre de la historia. Solo existe cuando la partida termino.
export function narrarEpilogo(E) {
  if (!E.fin || !E.final) return [];
  const f = E.final;
  const lineas = [];
  const agregar = (texto) => lineas.push({ tipo: 'epilogo', texto });
  agregar(f.motivo === 'eliminacion'
    ? `${unir(f.eliminados.map(quien))} se ${f.eliminados.length === 1 ? 'queda' : 'quedan'} sin fichas de juego y ${f.eliminados.length === 1 ? 'queda eliminado' : 'quedan eliminados'}.`
    : `Se acaban las ${MANOS} manos${f.eliminados.length ? `: ${quien(f.eliminados[0])} queda eliminado con menos fichas.` : ' y los de abajo empatan en fichas: nadie queda eliminado.'}`);
  agregar(f.pieza === null
    ? (f.eliminados.length === JUGADORES ? 'Nadie gana la pieza: todos quedan eliminados.' : 'Nadie gana la pieza: los de arriba empatan en fichas.')
    : `${quien(f.pieza)} gana la pieza con ${plural(E.fichas[f.pieza], 'ficha', 'fichas')}.`);
  agregar(`Fichas finales: ${asientos.map((s) => `${quien(s)} ${E.fichas[s]}`).join(', ')}.`);
  return lineas;
}

// {0}..{3} -> los nombres de las IAs de esa partida (jugadores = lo que guarda la arena en cada partida)
export const resolverNombres = (texto, jugadores) =>
  String(texto).replace(/\{([0-3])\}/g, (_, k) => jugadores?.[k]?.nombre ?? `Jugador ${Number(k) + 1}`);

// Un turno de Duda y apuesta = UNA decision de UN jugador (el unico juego del proyecto que no es simultaneo). La mano es una maquina de tres fases:
//   anuncio    abre la mano: anuncia un color y una cantidad y apuesta                      (accion: anunciar)
//   respuesta  responde el siguiente al ultimo anuncio: aceptar (hace un anuncio MAYOR) o dudar (accion: aceptar | dudar)
//   defensa    quien anuncio y a quien le subieron la apuesta: igualar (se revelan las cartas) o retirarse (pierde lo apostado)  (accion: igualar | retirarse)
// Tras el desenlace se cierra la mano: gana quien dice la verdad sobre las cartas (al menos lo anunciado, con arcoiris), el ganador se queda con las fichas que puso el
// perdedor, pierde la mano quien empieza la siguiente, se paga a la banca en las manos 15, 20..., se compran espacios y se revisa si alguien quedo sin fichas o se acabo el tope.
// Una respuesta ilegal se reemplaza por una legal con el azar sorteado en crearEstado (E.azar) y queda marcada invalida.

import { JUGADORES, COLORES, MANOS, PAGO_DESDE, PAGO_CADA, FICHAS_ESPACIO_MAX } from './constantes.js';
import { normalizarRespuesta } from './ordenes.js';
import { cartasDe, totalCartas, totalFichas, actorDe, puedeAceptar, limiteApuesta, cuentasDe } from './estado.js';
import { narrarAnuncio, narrarDuda, narrarDefensa, narrarResolucion, narrarCierreMano } from './narracion.js';

const LARGO_CRUDO = 400; // caracteres de la respuesta cruda que se guardan cuando una respuesta fue invalida
const asientos = [...Array(JUGADORES).keys()];
const suma = (ap) => ap.fichas + ap.espacios;
const copia = (ap) => ({ fichas: ap.fichas, espacios: ap.espacios });

// Una apuesta pedida, recortada a lo que tiene s y al tope: primero se quitan fichas de espacio y luego de juego. Una cantidad pedida de mas NO es un error.
function recortar(E, s, tope, fichas, espacios) {
  let a = Math.min(fichas ?? 0, E.fichas[s]);
  let b = Math.min(espacios ?? 0, E.fichasEspacio[s]);
  while (a + b > tope) { if (b > 0) b--; else a--; }
  return { fichas: a, espacios: b };
}

// Completa una apuesta hasta `objetivo` fichas con fichas de juego primero y luego de espacio, sin pasarse de lo que tiene s.
function completar(E, s, base, objetivo) {
  let a = Math.min(base.fichas, E.fichas[s]);
  let b = Math.min(base.espacios, E.fichasEspacio[s]);
  a += Math.min(Math.max(objetivo - a - b, 0), E.fichas[s] - a);
  b += Math.min(Math.max(objetivo - a - b, 0), E.fichasEspacio[s] - b);
  return { fichas: a, espacios: b };
}

// Que quiere hacer el actor: { accion, anuncio?, apuesta? } o { motivo } si la respuesta no sirve. Solo importan los campos de la accion.
function decidir(E, resp) {
  const fase = E.fase, s = actorDe(E), ult = E.cadena.at(-1);
  const permitidas = fase === 'anuncio' ? ['anunciar'] : fase === 'respuesta' ? ['aceptar', 'dudar'] : ['igualar', 'retirarse'];
  if (resp.motivo?.includes('sin respuesta')) return { motivo: 'sin respuesta legible' };
  if (resp.malos.includes('accion')) return { motivo: 'accion mal formada' };
  const accion = resp.accion ?? (fase === 'anuncio' ? 'anunciar' : null); // al abrir la mano la accion se sobreentiende
  if (accion === null) return { motivo: 'sin accion' };
  if (!permitidas.includes(accion)) return { motivo: 'accion no permitida ahora' };
  if (accion === 'igualar' || accion === 'retirarse') return { accion };
  if (resp.malos.includes('fichas') || resp.malos.includes('espacios')) return { motivo: 'apuesta mal formada' };
  if (accion === 'dudar') {
    const minimo = suma(ult.apuesta);
    if (resp.fichas === null && resp.espacios === null) return { accion, apuesta: completar(E, s, ult.apuesta, minimo) }; // sin decir cuanto: iguala
    const apuesta = recortar(E, s, limiteApuesta(E, s, ult.asiento), resp.fichas, resp.espacios);
    return suma(apuesta) < minimo ? { motivo: 'apuesta menor que la del anuncio' } : { accion, apuesta };
  }
  // anunciar o aceptar
  if (accion === 'aceptar' && !puedeAceptar(E)) return { motivo: 'no se puede aceptar' };
  if (resp.malos.includes('color')) return { motivo: 'color mal formado' };
  if (resp.malos.includes('cantidad')) return { motivo: 'cantidad mal formada' };
  if (resp.color === null) return { motivo: 'sin color' };
  if (resp.cantidad === null) return { motivo: 'sin cantidad' };
  const minima = accion === 'aceptar' ? ult.cantidad + 1 : 1;
  if (resp.cantidad < minima || resp.cantidad > totalCartas(E)) return { motivo: 'cantidad fuera de rango' };
  const apuesta = recortar(E, s, limiteApuesta(E, s, (s + 1) % JUGADORES), resp.fichas, resp.espacios);
  if (suma(apuesta) < 1) return { motivo: 'sin apuesta' };
  return { accion, anuncio: { color: resp.color, cantidad: resp.cantidad }, apuesta };
}

// La jugada legal que pone el juego cuando la respuesta no sirve, a partir de tres numeros sorteados de antemano para este turno.
function reemplazo(E) {
  const u = E.azar[E.turno], s = actorDe(E), ult = E.cadena.at(-1);
  if (E.fase === 'anuncio' || (E.fase === 'respuesta' && puedeAceptar(E) && u[0] < 0.5)) {
    const aceptar = E.fase === 'respuesta';
    const minima = aceptar ? ult.cantidad + 1 : 1;
    const cantidad = Math.min(totalCartas(E), minima + Math.floor(u[2] * 2));
    return { accion: aceptar ? 'aceptar' : 'anunciar', anuncio: { color: COLORES[Math.floor(u[1] * COLORES.length)], cantidad }, apuesta: { fichas: 1, espacios: 0 } };
  }
  if (E.fase === 'respuesta') return { accion: 'dudar', apuesta: completar(E, s, ult.apuesta, suma(ult.apuesta)) };
  return { accion: u[0] < 0.5 ? 'igualar' : 'retirarse' };
}

// Pasa las fichas que puso el perdedor al ganador. Una ficha de espacio ganada devuelve un espacio (hasta el maximo); si ya esta al maximo, se vuelve ficha de juego.
function mover(E, perdedor, ganador, ap) {
  E.fichas[perdedor] -= ap.fichas;
  E.fichasEspacio[perdedor] -= ap.espacios;
  const sube = Math.min(ap.espacios, FICHAS_ESPACIO_MAX - E.fichasEspacio[ganador]);
  E.fichasEspacio[ganador] += sube;
  E.fichas[ganador] += ap.fichas + (ap.espacios - sube);
}

// El desenlace de la mano. apP = la apuesta final de quien anuncio (la que puso al anunciar o la ya completada al igualar).
function resolver(E, { retirada, apP }) {
  const ult = E.cadena.at(-1), p = ult.asiento, d = E.duda.asiento, apD = E.duda.apuesta;
  const { color, cantidad } = ult;
  let cuentas = null, real = null, ganador, perdedor, ap;
  if (retirada) {
    ganador = d; perdedor = p; ap = apP;
  } else {
    cuentas = cuentasDe(E, color);
    real = cuentas.reduce((a, b) => a + b, 0);
    if (real >= cantidad) { ganador = p; perdedor = d; ap = apD; } else { ganador = d; perdedor = p; ap = apP; }
  }
  mover(E, perdedor, ganador, ap);
  for (const x of [p, d]) E.stats[x].manosJugadas++;
  E.stats[ganador].manosGanadas++;
  if (ganador === d && !E.duda.reemplazo) E.stats[d].dudasGanadas++;
  return { tipo: retirada ? 'retirada' : 'recuento', color, cantidad, cuentas, real, predictor: p, dudador: d, ganador, perdedor, movidas: copia(ap), apuestaPredictor: copia(apP), apuestaDudador: copia(apD) };
}

// Pieza para el de mas fichas de juego (desempata la de espacio; si siguen iguales, nadie). Eliminado: quien llego a 0 fichas o, en el tope, el de menos (nadie si empatan).
export function cerrarPartida(E, motivo) {
  const clave = (s) => E.fichas[s] * 10 + E.fichasEspacio[s]; // las fichas de espacio son 4 o menos
  let eliminados;
  if (motivo === 'eliminacion') {
    eliminados = asientos.filter((s) => E.fichas[s] <= 0);
  } else {
    const min = Math.min(...asientos.map(clave));
    const abajo = asientos.filter((s) => clave(s) === min);
    eliminados = abajo.length === 1 ? abajo : [];
  }
  const vivos = asientos.filter((s) => !eliminados.includes(s));
  const max = vivos.length ? Math.max(...vivos.map(clave)) : null;
  const arriba = vivos.filter((s) => clave(s) === max);
  const pieza = arriba.length === 1 ? arriba[0] : null;
  for (const s of asientos) E.puesto[s] = s === pieza ? 'pieza' : eliminados.includes(s) ? 'eliminado' : 'medio';
  E.final = {
    motivo, pieza, eliminados,
    criterioPieza: pieza !== null ? 'fichas' : 'sin pieza',
    ranking: [...asientos].sort((a, b) => clave(b) - clave(a) || a - b),
  };
  E.fin = true;
  return E.final;
}

// Tras el desenlace: guarda la mano en el historial publico, pasa el turno de abrir al perdedor, cobra el pago a la banca, revisa el final y prepara la mano siguiente.
function cerrarMano(E, res) {
  const h = E.mano;
  const entrada = {
    mano: h, inicia: E.inicia, cadena: E.cadena.map((c) => ({ ...c })), duda: { ...E.duda }, defensa: E.defensa ? { ...E.defensa } : null,
    resolucion: res, pago: false, compras: [],
  };
  E.inicia = res.perdedor;
  if (h >= PAGO_DESDE && (h - PAGO_DESDE) % PAGO_CADA === 0) {
    for (const s of asientos) E.fichas[s] -= 1;
    entrada.pago = true;
  }
  E.historial.push(entrada);
  let final = null;
  if (asientos.some((s) => E.fichas[s] <= 0)) final = cerrarPartida(E, 'eliminacion');
  else if (h >= MANOS) final = cerrarPartida(E, 'tope');
  else {
    // cambiar una ficha de juego por un espacio: vale desde la mano siguiente, con menos de 5 espacios y quedandote al menos 1 ficha
    for (const s of asientos) {
      if (E.pideEspacio[s] && E.fichas[s] >= 2 && E.fichasEspacio[s] < FICHAS_ESPACIO_MAX) {
        E.fichas[s] -= 1;
        E.fichasEspacio[s] += 1;
        entrada.compras.push(s);
      }
    }
    E.mano++;
    E.fase = 'anuncio';
    E.cadena = [];
    E.duda = null;
    E.defensa = null;
    E.decision = 1;
  }
  E.pideEspacio = asientos.map(() => false);
  return { entrada, final };
}

// respuestas[s]: respuesta normalizada (con `error` y `crudo` si los puso la arena) o null. Solo cuenta la del jugador al que le toca.
export function aplicarTurno(E, respuestas) {
  if (E.fin) throw new Error('La partida ya termino.');
  const s = actorDe(E);
  const resp = respuestas?.[s] ?? normalizarRespuesta(null);
  const fase = E.fase, mano = E.mano, decision = E.decision, turno = E.turno + 1, tenia = totalFichas(E, s);
  // lo que las IAs nunca ven y el publico si: las cartas de todos en esta mano y cuantas cartas cuentan para cada color
  const oculto = { cartas: asientos.map((x) => cartasDe(E, x)), cuentas: Object.fromEntries(COLORES.map((c) => [c, cuentasDe(E, c).reduce((a, b) => a + b, 0)])) };

  let d = decidir(E, resp);
  const motivo = d.motivo ?? null;
  const reempl = motivo !== null;
  if (reempl) d = reemplazo(E);
  const st = E.stats[s];
  st.respuestas++;
  if (reempl) st.invalidas++;
  else st.validas++;
  if (!reempl && resp.comprar) E.pideEspacio[s] = true;

  const ult = E.cadena.at(-1);
  let narracion = [], res = null;
  if (d.accion === 'anunciar' || d.accion === 'aceptar') {
    if (!reempl) {
      st.anuncios++;
      if (oculto.cuentas[d.anuncio.color] < d.anuncio.cantidad) st.anunciosFalsos++;
    }
    narracion = narrarAnuncio({ E, mano, decision, s, accion: d.accion, anuncio: d.anuncio, apuesta: d.apuesta, reemplazo: reempl, previo: ult ?? null });
    E.cadena.push({ asiento: s, ...d.anuncio, apuesta: d.apuesta, reemplazo: reempl });
    E.fase = 'respuesta';
    E.decision++;
  } else if (d.accion === 'dudar') {
    if (!reempl) st.dudas++;
    const subio = suma(d.apuesta) > suma(ult.apuesta);
    E.duda = { asiento: s, apuesta: d.apuesta, reemplazo: reempl };
    narracion = narrarDuda({ E, mano, decision, s, p: ult.asiento, apuesta: d.apuesta, subio, reemplazo: reempl });
    if (subio) {
      E.fase = 'defensa';
      E.decision++;
    } else {
      res = resolver(E, { retirada: false, apP: copia(ult.apuesta) });
    }
  } else {
    E.defensa = { accion: d.accion, reemplazo: reempl };
    narracion = narrarDefensa({ p: s, accion: d.accion, reemplazo: reempl });
    if (d.accion === 'retirarse') {
      if (!reempl) st.retiradas++;
      res = resolver(E, { retirada: true, apP: copia(ult.apuesta) });
    } else {
      res = resolver(E, { retirada: false, apP: completar(E, s, ult.apuesta, suma(E.duda.apuesta)) });
    }
  }

  let cierre = null, final = null;
  if (res) {
    narracion = [...narracion, ...narrarResolucion({ res })];
    cierre = cerrarMano(E, res);
    final = cierre.final;
    narracion = [...narracion, ...narrarCierreMano({ mano, pago: cierre.entrada.pago, compras: cierre.entrada.compras })];
  }
  E.turno = turno;

  return {
    fase, mano, decision, turno, asiento: s,
    accion: d.accion,
    anuncio: d.anuncio ?? null,
    apuesta: d.apuesta ?? null,
    tenia, // fichas (de juego y de espacio) que tenia antes de apostar
    comprar: !reempl && resp.comprar,
    resolucion: res,
    finMano: res !== null,
    pago: cierre?.entrada.pago ?? false,
    compras: cierre?.entrada.compras ?? [],
    fichas: [...E.fichas],
    fichasEspacio: [...E.fichasEspacio],
    // un turno = una decision: solo el asiento que decide tiene razon, invalidez, motivo, error y respuesta cruda (la arena y el marcador esperan un arreglo por jugador)
    razones: asientos.map((x) => (x === s ? resp.razon || null : null)),
    invalidas: asientos.map((x) => (x === s ? reempl : null)),
    motivos: asientos.map((x) => (x === s ? motivo : null)),
    errores: asientos.map((x) => (x === s ? resp.error ?? null : null)),
    crudos: asientos.map((x) => (x === s && reempl && typeof resp.crudo === 'string' ? resp.crudo.slice(0, LARGO_CRUDO) : null)),
    oculto,
    final,
    narracion,
  };
}

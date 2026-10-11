// Un turno de El numero solitario (una fase). Muta el estado y devuelve el registro (lo que se guarda en los datos y lee el reproductor).
//   Fase 1: cada jugador que sigue elige su pareja; se revelan todas; pasa a la fase 2.
//   Fase 2: cada uno marca cual juega; se anulan los repetidos; gana el menor numero que queda solo; se descartan las cartas jugadas, se
//           bloquea la no jugada, y al final de la ronda 3 y 6 queda a salvo el de mas puntos; en la 12 se reparte pieza y eliminacion.
// Una respuesta ilegal se reemplaza por una legal con el azar sorteado en crearEstado (E.azar) y queda marcada invalida.

import { JUGADORES, RONDAS, RONDAS_POR_CICLO, CARTAS, CORTES, cicloDe } from './constantes.js';
import { disponibles } from './estado.js';
import { normalizarRespuesta } from './ordenes.js';
import { clasificar, criterioEntre, lideres } from './cortes.js';
import { narrarPareja, narrarMarca } from './narracion.js';

const LARGO_CRUDO = 400; // caracteres de la respuesta cruda que se guardan cuando una respuesta fue invalida
const asientos = [...Array(JUGADORES).keys()];
const vacio = () => Array(JUGADORES).fill(null);
const copiaDe = (xs) => xs.map((x) => (Array.isArray(x) ? [...x] : x));

// Por que una respuesta no sirve en la fase 1 (null si sirve). Solo importa el campo de esta fase.
function motivoPareja(resp, disp) {
  if (!resp.cartas) {
    if (resp.motivo?.includes('sin respuesta')) return 'sin respuesta legible';
    return resp.motivo?.includes('cartas mal') ? 'cartas mal formadas' : 'sin pareja';
  }
  return resp.cartas.every((c) => disp.includes(c)) ? null : 'cartas no disponibles';
}

function motivoMarca(resp, pareja) {
  if (resp.juega === null) {
    if (resp.motivo?.includes('sin respuesta')) return 'sin respuesta legible';
    return resp.motivo?.includes('juega mal') ? 'juega mal formada' : 'sin marca';
  }
  return pareja.includes(resp.juega) ? null : 'marca fuera de la pareja';
}

// Pareja legal al azar a partir de dos numeros sorteados de antemano.
function parejaAlAzar(disp, [u, v]) {
  const a = disp[Math.floor(u * disp.length)];
  const resto = disp.filter((c) => c !== a);
  const b = resto[Math.floor(v * resto.length)];
  return [a, b].sort((x, y) => x - y);
}

function contar(E, s, motivo) {
  const st = E.stats[s];
  st.respuestas++;
  if (motivo) st.invalidas++;
  else st.validas++;
}

// Campos que comparten los dos registros. `activos` = quienes jugaron este turno.
function comunes(activos, respuestas, motivos) {
  return {
    razones: asientos.map((s) => respuestas[s]?.razon || null),
    invalidas: asientos.map((s) => (activos[s] ? motivos[s] !== null : null)),
    motivos,
    errores: asientos.map((s) => respuestas[s]?.error ?? null),
    crudos: asientos.map((s) => (motivos[s] && typeof respuestas[s]?.crudo === 'string' ? respuestas[s].crudo.slice(0, LARGO_CRUDO) : null)),
  };
}

function fasePareja(E, respuestas) {
  const r = E.ronda;
  const activos = [...E.jugando];
  const motivos = vacio(), parejas = vacio();
  for (const s of asientos) {
    if (!activos[s]) continue;
    const resp = respuestas[s] ?? normalizarRespuesta(null);
    const disp = disponibles(E, s);
    motivos[s] = motivoPareja(resp, disp);
    parejas[s] = motivos[s] ? parejaAlAzar(disp, E.azar[r - 1].pareja[s]) : [...resp.cartas];
    contar(E, s, motivos[s]);
  }
  E.parejas = parejas;
  E.fase = 2;
  return {
    ronda: r, ciclo: cicloDe(r), fase: 1, parejas: copiaDe(parejas),
    ...comunes(activos, respuestas, motivos),
    narracion: narrarPareja({ E, ronda: r, parejas }),
  };
}

function faseMarca(E, respuestas) {
  const r = E.ronda;
  const activos = [...E.jugando];
  const parejas = copiaDe(E.parejas);
  const motivos = vacio(), marcas = vacio();
  for (const s of asientos) {
    if (!activos[s]) continue;
    const resp = respuestas[s] ?? normalizarRespuesta(null);
    motivos[s] = motivoMarca(resp, parejas[s]);
    marcas[s] = motivos[s] ? parejas[s][E.azar[r - 1].marca[s] < 0.5 ? 0 : 1] : resp.juega;
    contar(E, s, motivos[s]);
  }

  // quien gana: el menor numero que aparece una sola vez; los repetidos se anulan
  const conteo = new Map();
  for (const m of marcas) if (m !== null) conteo.set(m, (conteo.get(m) ?? 0) + 1);
  const anuladas = marcas.map((m) => (m === null ? null : conteo.get(m) > 1));
  const unicos = [...conteo].filter(([, c]) => c === 1).map(([n]) => n);
  const numero = unicos.length ? Math.min(...unicos) : null;
  const ganador = numero === null ? null : marcas.indexOf(numero);

  const lideresAntes = lideres(E);
  const puntosGanados = Array(JUGADORES).fill(0);
  if (ganador !== null) {
    E.puntos[ganador] += numero;
    E.fichas[ganador]++;
    E.ultimaVictoria[ganador] = r;
    puntosGanados[ganador] = numero;
    E.stats[ganador].rondasGanadas++;
    // el senuelo solo cuenta si la IA eligio la marca: una marca de reemplazo la puso el motor
    if (motivos[ganador] === null && numero === Math.max(...parejas[ganador])) E.stats[ganador].senuelos++;
  }
  const lideresDespues = lideres(E);

  // cartas: la jugada se descarta (de todos), la otra queda bloqueada la ronda siguiente
  for (const s of asientos) {
    if (!activos[s]) continue;
    if (anuladas[s] && motivos[s] === null) E.stats[s].anuladas++; // un choque causado por el reemplazo no es suyo
    const jugada = marcas[s];
    E.mano[s] = E.mano[s].filter((c) => c !== jugada);
    E.descartadas[s].push(jugada);
    E.bloqueada[s] = parejas[s].find((c) => c !== jugada);
  }
  E.historial.push({ ronda: r, parejas: copiaDe(parejas), marcas: [...marcas], ganador, numero });
  const descartadas = E.descartadas.map((d) => [...d]);
  const bloqueadas = [...E.bloqueada];

  // corte: queda a salvo el de mas puntos entre los que siguen
  let corte = null;
  const k = CORTES.indexOf(r);
  if (k >= 0) {
    const orden = clasificar(E, k);
    const [primero, segundo] = orden;
    E.jugando[primero.s] = false;
    E.puesto[primero.s] = 'salvo';
    E.corteSalvo[primero.s] = k + 1;
    corte = {
      numero: k + 1, jugador: primero.s, puntos: primero.puntos, criterio: criterioEntre(primero, segundo),
      ranking: orden.map(({ s, puntos, fichas }) => ({ s, puntos, fichas })),
    };
  }

  // al terminar el ciclo todos reciben mazo nuevo
  if (r % RONDAS_POR_CICLO === 0 && r < RONDAS) {
    for (const s of asientos) {
      if (!E.jugando[s]) continue;
      E.mano[s] = [...CARTAS];
      E.bloqueada[s] = null;
      E.descartadas[s] = [];
    }
  }

  // final: pieza para el mejor de los que quedan, eliminado el ultimo
  let final = null;
  if (r === RONDAS) {
    const orden = clasificar(E, CORTES.length);
    const [a, b, c] = orden;
    E.puesto[a.s] = 'pieza';
    E.puesto[b.s] = 'medio';
    E.puesto[c.s] = 'eliminado';
    for (const x of orden) E.jugando[x.s] = false;
    final = {
      pieza: a.s, medio: b.s, eliminado: c.s, criterioPieza: criterioEntre(a, b), criterioEliminado: criterioEntre(b, c),
      ranking: orden.map(({ s, puntos, fichas }) => ({ s, puntos, fichas })),
    };
    E.final = final;
    E.fin = true;
  }

  const narracion = narrarMarca({ E, ronda: r, parejas, marcas, anuladas, ganador, numero, lideresAntes, lideresDespues, corte, reemplazadas: motivos.map((m) => m !== null) });
  // cartas que podra elegir cada uno en la ronda siguiente (ya con el mazo nuevo si termino el ciclo); null para quien ya no juega
  const disponiblesAhora = asientos.map((s) => (E.jugando[s] ? disponibles(E, s) : null));
  if (!E.fin) {
    E.ronda++;
    E.fase = 1;
    E.parejas = vacio();
  }
  return {
    ronda: r, ciclo: cicloDe(r), fase: 2, parejas, marcas, anuladas, ganador, numero, puntosGanados,
    puntos: [...E.puntos], fichas: [...E.fichas], descartadas, bloqueadas, disponibles: disponiblesAhora,
    ...comunes(activos, respuestas, motivos),
    corte, final, narracion,
  };
}

// respuestas[s]: respuesta normalizada (con `error` y `crudo` si los puso la arena) o null para quien ya no juega.
export function aplicarTurno(E, respuestas) {
  if (E.fin) throw new Error('La partida ya termino.');
  return E.fase === 1 ? fasePareja(E, respuestas) : faseMarca(E, respuestas);
}

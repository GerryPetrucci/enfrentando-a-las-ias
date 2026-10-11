// Una subasta de Subasta de tiempo (un turno de la arena). Muta el estado y devuelve el registro (lo que se guarda en los datos y lee el reproductor).
//   Cada jugador con banco responde cuantos segundos mantiene su apuesta (0 = se retira). TODAS las apuestas se pagan: se restan del banco, gane
//   o pierda. Gana la subasta la apuesta mas alta si es unica; si dos o mas empatan en la mas alta (a la decima) la subasta se anula; si nadie
//   aposto, no hay ganador. Una respuesta ilegible equivale a retirarse. Pedir mas de lo que queda es apostar todo el banco.
//   Tras la subasta 19 (o antes, si nadie tiene tiempo) se reparte la pieza y la eliminacion.
// Todo el tiempo vive en decimas enteras.

import { JUGADORES, SUBASTAS, segundos } from './constantes.js';
import { normalizarRespuesta } from './ordenes.js';
import { narrarSubasta } from './narracion.js';

const LARGO_CRUDO = 400; // caracteres de la respuesta cruda que se guardan cuando una respuesta fue invalida
const asientos = [...Array(JUGADORES).keys()];

// Cierra la partida: pieza para el de mas fichas (desempata el tiempo que conserva; si tambien empatan, nadie), eliminado el de menos fichas
// (desempata el que conserva menos tiempo; si tambien empatan, nadie).
function cerrar(E) {
  const maxF = Math.max(...E.fichas), minF = Math.min(...E.fichas);
  const arriba = asientos.filter((s) => E.fichas[s] === maxF);
  const abajo = asientos.filter((s) => E.fichas[s] === minF);
  const masTiempo = Math.max(...arriba.map((s) => E.bancos[s]));
  const menosTiempo = Math.min(...abajo.map((s) => E.bancos[s]));
  const conMas = arriba.filter((s) => E.bancos[s] === masTiempo);
  const conMenos = abajo.filter((s) => E.bancos[s] === menosTiempo);
  const pieza = conMas.length === 1 ? conMas[0] : null;
  const eliminado = conMenos.length === 1 ? conMenos[0] : null;
  for (const s of asientos) E.puesto[s] = s === pieza ? 'pieza' : s === eliminado ? 'eliminado' : 'medio';
  E.final = {
    pieza,
    eliminado,
    criterioPieza: arriba.length === 1 ? 'fichas' : pieza !== null ? 'tiempo' : 'sin pieza',
    criterioEliminado: abajo.length === 1 ? 'fichas' : eliminado !== null ? 'tiempo' : 'sin eliminado',
    ranking: [...asientos].sort((a, b) => E.fichas[b] - E.fichas[a] || E.bancos[b] - E.bancos[a]).map((s) => ({ s, fichas: E.fichas[s], banco: segundos(E.bancos[s]) })),
  };
  E.fin = true;
  return E.final;
}

// respuestas[s]: respuesta normalizada (con `error` y `crudo` si los puso la arena) o null para quien ya no tiene tiempo.
export function aplicarTurno(E, respuestas) {
  if (E.fin) throw new Error('La partida ya termino.');
  const n = E.subasta;
  const activos = E.bancos.map((b) => b > 0);
  const motivos = asientos.map(() => null);
  const apuestas = asientos.map(() => null); // decimas; null = no apostaba (sin tiempo)
  const todo = asientos.map(() => false);

  for (const s of asientos) {
    if (!activos[s]) continue;
    const resp = respuestas[s] ?? normalizarRespuesta(null);
    motivos[s] = resp.invalida ? resp.motivo : null;
    const pedida = motivos[s] ? 0 : Math.round(resp.apuesta * 10); // una respuesta invalida equivale a retirarse
    apuestas[s] = Math.min(pedida, E.bancos[s]); // pedir de mas = apostar todo el banco
    todo[s] = apuestas[s] > 0 && apuestas[s] === E.bancos[s];
    const st = E.stats[s];
    st.respuestas++;
    if (motivos[s]) st.invalidas++;
    else st.validas++;
    if (!motivos[s] && apuestas[s] === 0) st.retiradas++;
    if (todo[s]) st.todoElBanco++;
  }

  // todas las apuestas se pagan
  for (const s of asientos) {
    if (!activos[s]) continue;
    E.bancos[s] -= apuestas[s];
    E.apostado[s] += apuestas[s];
    E.apuestas[s].push({ subasta: n, decimas: apuestas[s] });
  }

  // quien gana: la apuesta mas alta si es unica
  const fichasAntes = [...E.fichas];
  const hechas = apuestas.filter((a) => a !== null);
  const maxima = hechas.length ? Math.max(...hechas) : 0;
  const arriba = maxima > 0 ? asientos.filter((s) => apuestas[s] === maxima) : [];
  let ganador = null, sinGanador = null;
  if (arriba.length === 1) {
    ganador = arriba[0];
    E.fichas[ganador]++;
    E.stats[ganador].ganadas++;
  } else if (arriba.length > 1) {
    sinGanador = 'empate';
    for (const s of arriba) E.stats[s].empates++;
  } else {
    sinGanador = 'nadie aposto';
  }
  E.historial.push({ subasta: n, ganador, sinGanador });

  const sec = apuestas.map((a) => (a === null ? null : segundos(a)));
  const bancos = E.bancos.map(segundos);
  const narracion = narrarSubasta({
    E, subasta: n, apuestas: sec, bancos, ganador, sinGanador, empatados: sinGanador === 'empate' ? arriba : [],
    reemplazadas: motivos.map((m) => m !== null), fichas: [...E.fichas], fichasAntes,
  });

  E.subasta++;
  const termina = E.subasta > SUBASTAS || E.bancos.every((b) => b === 0);
  const final = termina ? cerrar(E) : null;

  return {
    subasta: n,
    ganador,
    sinGanador,
    fichas: [...E.fichas],
    razones: asientos.map((s) => respuestas[s]?.razon || null),
    invalidas: asientos.map((s) => (activos[s] ? motivos[s] !== null : null)),
    motivos,
    errores: asientos.map((s) => respuestas[s]?.error ?? null),
    crudos: asientos.map((s) => (motivos[s] && typeof respuestas[s]?.crudo === 'string' ? respuestas[s].crudo.slice(0, LARGO_CRUDO) : null)),
    // Lo que las IAs nunca ven (la vista no lo toca) y el publico si: el reproductor lo muestra tal cual.
    oculto: { apuestas: sec, bancos, empatados: sinGanador === 'empate' ? arriba : [], todoElBanco: todo },
    final,
    narracion,
  };
}

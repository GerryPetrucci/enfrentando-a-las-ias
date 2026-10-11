// Resultado de una partida de Subasta de tiempo: puntos por puesto, quien gana la pieza y las metricas de cada jugador.
//
// Las claves traiciones, promesasHechas, promesasRotas, jugadasInvalidas, ordenesValidas y ordenesTotal son las que lee el marcador para TODOS los
// juegos (aqui no hay promesas ni traiciones; cada respuesta cuenta como una "orden", y asi sale la obediencia). Las demas son de este juego.

import { JUGADORES, PUESTO_PUNTOS, segundos } from './constantes.js';
import { narrarEpilogo } from './narracion.js';

const asientos = [...Array(JUGADORES).keys()];

export function resultadoDe(E) {
  // si la partida se corto, todos cuentan como "sobrevive" (la partida no entra al marcador oficial)
  const puntos = E.puesto.map((p) => PUESTO_PUNTOS[p ?? 'medio']);
  const metricas = E.stats.map((st, s) => ({
    puntos: puntos[s],
    puesto: E.puesto[s],
    fichas: E.fichas[s],
    bancoFinal: segundos(E.bancos[s]),
    apostado: segundos(E.apostado[s]),
    retiradas: st.retiradas,
    subastasGanadas: st.ganadas,
    empates: st.empates,
    todoElBanco: st.todoElBanco,
    traiciones: 0,
    promesasHechas: 0,
    promesasRotas: 0,
    jugadasInvalidas: st.invalidas,
    ordenesValidas: st.validas,
    ordenesTotal: st.respuestas,
  }));
  // del mejor al peor puesto: pieza, los que sobreviven (por fichas y tiempo que conservan), eliminado
  const rango = (s) => ({ pieza: 0, medio: 1, eliminado: 2 })[E.puesto[s]];
  const orden = E.fin
    ? [...asientos].sort((a, b) => rango(a) - rango(b) || E.fichas[b] - E.fichas[a] || E.bancos[b] - E.bancos[a])
    : [];
  return {
    puntos,
    ganador: E.final ? E.final.pieza : null,
    empate: !E.fin || E.final.pieza === null,
    metricas,
    orden,
    epilogo: narrarEpilogo(E),
  };
}

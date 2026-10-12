// Resultado de una partida de Mayor o menor: puntos (ganador 4, perdedor 0, empate 2 y 2), quien gana y las metricas de cada jugador.
//
// Las claves traiciones, promesasHechas, promesasRotas, jugadasInvalidas, ordenesValidas y ordenesTotal son las que lee el marcador para TODOS los
// juegos (aqui no hay promesas ni traiciones; cada respuesta cuenta como una "orden", y asi sale la obediencia). Las demas son de este juego.

import { PUNTOS } from './constantes.js';
import { narrarEpilogo } from './narracion.js';

export function resultadoDe(E) {
  const f = E.final;
  // si la partida se corto, nadie gana (la partida no entra al marcador oficial)
  const puntos = E.fichas.map((_, s) => (!f || f.empate ? PUNTOS.empata : s === f.ganador ? PUNTOS.gana : PUNTOS.pierde));
  const puesto = (s) => (!f ? null : f.empate ? 'empata' : s === f.ganador ? 'gana' : 'pierde');
  const metricas = E.stats.map((st, s) => ({
    puntos: puntos[s],
    puesto: puesto(s),
    fichas: E.fichas[s],
    aciertos: st.aciertos,
    apuestas: st.apuestas,
    fichasApostadas: st.fichasApostadas,
    apostoTodo: st.apostoTodo,
    fichasComoActivo: st.fichasActivo,
    rondasComoActivo: st.rondasActivo,
    traiciones: 0,
    promesasHechas: 0,
    promesasRotas: 0,
    jugadasInvalidas: st.invalidas,
    ordenesValidas: st.validas,
    ordenesTotal: st.respuestas,
  }));
  return {
    puntos,
    ganador: f ? f.ganador : null,
    empate: !f || f.empate,
    metricas,
    orden: f ? [...f.ranking] : [],
    epilogo: narrarEpilogo(E),
  };
}

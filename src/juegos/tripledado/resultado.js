// Resultado de una partida de Triple dado: puntos del marcador por puesto (pieza 4, sobrevive 2, eliminado 0), quien gana la pieza y las metricas de cada jugador.
//
// Las claves traiciones, promesasHechas, promesasRotas, jugadasInvalidas, ordenesValidas y ordenesTotal son las que lee el marcador para TODOS los
// juegos (aqui no hay promesas ni traiciones; cada respuesta cuenta como una "orden", y asi sale la obediencia). Las demas son de este juego.
// Los puntos de dados se publican en decimales (aPuntos); internamente son docenos.

import { JUGADORES, PUNTOS } from './constantes.js';
import { aPuntos } from './combinaciones.js';
import { narrarEpilogo } from './narracion.js';

const asientos = [...Array(JUGADORES).keys()];

export function resultadoDe(E) {
  // si la partida se corto, todos cuentan como "medio" (la partida no entra al marcador oficial)
  const puntos = E.puesto.map((p) => PUNTOS[p ?? 'medio']);
  const metricas = E.stats.map((st, s) => ({
    puntos: puntos[s],
    puesto: E.puesto[s],
    puntosTotales: aPuntos(E.puntos[s]),
    puntosDeDados: aPuntos(st.puntosDeDados),
    aciertosPrediccion: st.aciertos,
    predicciones: st.predicciones,
    ceros: st.ceros,
    ocultosUsados: st.ocultosUsados,
    traiciones: 0,
    promesasHechas: 0,
    promesasRotas: 0,
    jugadasInvalidas: st.invalidas,
    ordenesValidas: st.validas,
    ordenesTotal: st.respuestas,
  }));
  // del mejor al peor puesto: pieza, los que sobreviven (por puntos), eliminado
  const rango = { pieza: 0, medio: 1, eliminado: 2 };
  const orden = E.fin ? [...asientos].sort((a, b) => rango[E.puesto[a]] - rango[E.puesto[b]] || E.puntos[b] - E.puntos[a] || a - b) : [];
  return {
    puntos,
    ganador: E.final ? E.final.pieza : null,
    empate: !E.fin || E.final.pieza === null,
    metricas,
    orden,
    epilogo: narrarEpilogo(E),
  };
}

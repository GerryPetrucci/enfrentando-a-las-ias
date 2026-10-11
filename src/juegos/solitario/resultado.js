// Resultado de una partida de El numero solitario: puntos por puesto, quien gana la pieza y las metricas de cada jugador.
//
// Las claves traiciones, promesasHechas, promesasRotas, jugadasInvalidas, ordenesValidas y ordenesTotal son las que lee el marcador
// para TODOS los juegos (aqui no hay promesas ni traiciones; cada respuesta cuenta como una "orden", y asi sale la obediencia).
// Las demas son de este juego, para el reproductor y el analisis.

import { JUGADORES, PUESTO_PUNTOS } from './constantes.js';
import { narrarEpilogo } from './narracion.js';

const asientos = [...Array(JUGADORES).keys()];

export function resultadoDe(E) {
  // si la partida se corto, los que seguian cuentan como "en medio" (la partida no entra al marcador oficial)
  const puntos = E.puesto.map((p) => PUESTO_PUNTOS[p ?? 'medio']);
  const metricas = E.stats.map((st, s) => ({
    puntos: puntos[s],
    puesto: E.puesto[s],
    puntosDeCartas: E.puntos[s],
    fichas: E.fichas[s],
    rondasGanadas: st.rondasGanadas,
    anuladas: st.anuladas,
    senuelos: st.senuelos,
    traiciones: 0,
    promesasHechas: 0,
    promesasRotas: 0,
    jugadasInvalidas: st.invalidas,
    ordenesValidas: st.validas,
    ordenesTotal: st.respuestas,
  }));
  // del mejor al peor puesto: pieza, a salvo en el corte 1, a salvo en el corte 2, en medio, eliminado
  const rango = (s) => ({ pieza: 0, salvo: E.corteSalvo[s] ?? 1, medio: 3, eliminado: 4 })[E.puesto[s]];
  const orden = E.fin ? [...asientos].sort((a, b) => rango(a) - rango(b)) : [];
  return {
    puntos,
    ganador: E.final ? E.final.pieza : null,
    empate: !E.fin,
    metricas,
    orden,
    epilogo: narrarEpilogo(E),
  };
}

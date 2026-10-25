// Resultado de una partida de La Fuga: puntos, ganador y las metricas de cada prisionero.
//
// Las claves traiciones, promesasHechas, promesasRotas y jugadasInvalidas son las que lee el marcador para TODOS los juegos
// (la fiabilidad sale de ahi). Las demas (ayudas, sacrificios, botines...) son de este juego, para el reproductor y el analisis.

import { narrarEpilogo } from './narracion.js';

export function resultadoDe(E) {
  const metricas = [0, 1].map((i) => {
    const st = E.stats[i];
    return {
      puntos: E.puntos[i],
      final: E.finales[i], // 'conjunto' | 'solo' | 'abandonado' | 'anticipada' | 'capturado' | null si la partida no termino
      heridas: E.heridas[i],
      traiciones: st.separaciones + st.delaciones,
      promesasHechas: st.promesasHechas,
      promesasRotas: st.promesasRotas,
      jugadasInvalidas: st.invalidas,
      camposIlegibles: st.ilegibles,
      ayudas: st.ayudas,
      sacrificios: st.sacrificios,
      separaciones: st.separaciones,
      botines: st.botines,
      delaciones: st.delaciones,
    };
  });
  const [a, b] = E.puntos;
  return { puntos: [...E.puntos], ganador: a === b ? null : a > b ? 0 : 1, empate: a === b, metricas, epilogo: narrarEpilogo(E),
    ...(E.historia ? { historia: { version: E.historia.version, huella: E.historia.huella, recorrido: E.historial.map((r) => r.situacion.rama), hechos: structuredClone(E.historia.memoria ?? []) } } : {}) };
}

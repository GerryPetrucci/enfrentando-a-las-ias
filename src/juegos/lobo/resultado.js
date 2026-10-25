import { bandoDe } from './constantes.js';
export function resultadoDe(E) {
  const ganadores = E.fin && E.ganadorBando ? E.roles.flatMap((r, i) => bandoDe(r) === E.ganadorBando ? [i] : []) : [];
  return { puntos: [...E.puntos], ganador: ganadores.length === 1 ? ganadores[0] : null,
    ganadores, ganadorBando: E.ganadorBando, empate: E.fin && E.ganadorBando === null,
    motivoFin: E.motivoFin, rondasJugadas: E.ronda,
    enamoradosGanadores: E.fin && E.enamorados.every((i) => E.vivos[i]) ? [...E.enamorados] : [],
    metricas: E.stats.map((s, i) => ({ puntos: E.puntos[i], rol: E.roles[i], vivo: E.vivos[i], bando: bandoDe(E.roles[i]),
      aciertos: s.aciertos, acciones: s.acciones, jugadasInvalidas: s.invalidas,
      obediencia: s.acciones ? (s.acciones - s.invalidas) / s.acciones : null,
      traiciones: 0, promesasHechas: 0, promesasRotas: 0 })),
  };
}

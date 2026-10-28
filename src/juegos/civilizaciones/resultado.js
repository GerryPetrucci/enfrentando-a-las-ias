// Resultado de una partida: puntos 3 / 0 (ganador / perdedor; el desempate nunca deja un empate) y las metricas de cada civilizacion.

import { PUNTOS, TURNOS } from './constantes.js';
import { indiceDe, estabilidadMedia } from './indice.js';
import { serializarMapa } from '../../mapa.js';

export function resultadoDe(E) {
  const g = E.ganador;
  const puntos = E.civs.map((c) => (g === null ? 0 : c.s === g ? PUNTOS.ganador : PUNTOS.perdedor));
  const metricas = E.civs.map((c) => {
    const ind = indiceDe(c);
    return {
      puntos: puntos[c.s], indice: ind.publicado, pilares: ind.pilares, tecnologias: c.tecnologias.length, era: c.era, poblacion: c.poblacion, regiones: c.regiones.length,
      edificios: [...c.construidos], estabilidad: Math.round(estabilidadMedia(c) * 10) / 10, hambres: c.hambres, colapsos: c.colapsos, fundacionValida: c.stats.fundacionValida,
      // Las mismas claves que lee el marcador para todos los juegos (aqui no hay pactos ni traiciones).
      traiciones: 0, promesasHechas: 0, promesasRotas: 0, jugadasInvalidas: c.stats.invalidas, ordenesValidas: c.stats.validas, ordenesTotal: c.stats.total,
    };
  });
  return {
    puntos, ganador: g, empate: false, metricas, orden: g === null ? [] : [g, 1 - g], desempate: E.desempate, turnos: E.turno, indices: E.indices,
    bioma: E.mundo.bioma, seedMundo: E.seedMundo, sitios: [...E.mundo.sitios],
    temporada: E.temporada ? structuredClone(E.temporada) : null,
    fundaciones: E.civs.map((c) => ({ nombre: c.nombre, lema: c.lema, rasgos: [...c.rasgos], sitio: c.sitio, capital: c.capital, valida: c.stats.fundacionValida })),
    // El mapa completo, para que la escena de la web (que no puede importar de src/) dibuje la partida desde lo guardado.
    mapa: serializarMapa(E.mundo.mapa),
    terminada: E.turno >= TURNOS,
  };
}

// Resultado de una partida terminada: puntos por posicion (5, 3, 1, 0) y metricas de cada reino.

import { clasificar, regionesDe } from './estado.js';
import { PUNTOS_POSICION } from './constantes.js';
import { serializarMapa } from '../../mapa.js';

export function resultadoDe(E) {
  const orden = clasificar(E), puntos = Array(E.k).fill(0);
  orden.forEach((f, pos) => { puntos[f.s] = PUNTOS_POSICION[pos] ?? 0; });
  const metricas = E.reinos.map((r, s) => {
    const st = E.stats[s];
    return {
      puntos: puntos[s], posicion: orden.findIndex((f) => f.s === s) + 1, regiones: regionesDe(E, s).length, honor: r.honor,
      traiciones: st.rupturas, pactosFirmados: st.pactos, pactosCumplidos: st.cumplidos, comercios: st.comercios, edificios: st.edificios,
      obediencia: st.total ? st.validas / st.total : null, respuestasInvalidas: st.invalidas, cayoEn: r.cayoEn,
      // Las mismas claves que lee el marcador para todos los juegos: un pacto firmado es una promesa y romperlo la rompe.
      promesasHechas: st.pactos, promesasRotas: st.rupturas, jugadasInvalidas: st.invalidas,
      ordenesValidas: st.validas, ordenesTotal: st.total,
    };
  });
  // `mapa`: el mapa completo y su bioma, para que la escena de la web (que no puede importar de src/) dibuje la partida desde lo guardado.
  // `reinos`: el nombre de reino de cada asiento (el que usan las IAs en sus mensajes), para que la escena lo muestre junto al nombre del modelo.
  return { puntos, ganador: E.ganador, empate: false, metricas, orden: orden.map((f) => f.s), ganoPorMaravilla: E.ganoPorMaravilla, turnos: E.turno, mapa: serializarMapa(E.mapa), reinos: E.reinos.map((r) => r.nombre) };
}

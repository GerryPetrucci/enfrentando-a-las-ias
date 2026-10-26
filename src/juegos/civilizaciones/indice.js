// Indice de Avance (spec 3.13): 100 puntos en seis pilares. Gana quien tenga mas al terminar el turno 30.

import { INDICE, TEC, MARAVILLAS } from './constantes.js';

const tope = (x, referencia) => Math.min(1, x / referencia);

// Suma de las eras de las tecnologias conocidas (las 36 suman INDICE.tecnologia.referencia).
export const puntosTecnologia = (civ) => civ.tecnologias.reduce((s, id) => s + TEC[id].era, 0);

// Estabilidad media de todos los cierres de turno; antes del primer cierre vale la inicial.
export const estabilidadMedia = (civ) => (civ.cierres > 0 ? civ.sumaEstabilidad / civ.cierres : civ.estabilidad);

export function pilaresDe(civ) {
  return {
    tecnologia: INDICE.tecnologia.puntos * puntosTecnologia(civ) / INDICE.tecnologia.referencia,
    cultura: INDICE.cultura.puntos * tope(civ.culturaAcumulada, INDICE.cultura.referencia),
    poblacion: INDICE.poblacion.puntos * tope(civ.poblacion, INDICE.poblacion.referencia),
    economia: INDICE.economia.puntos * tope(civ.produccionTotal, INDICE.economia.referencia),
    maravillas: Math.min(INDICE.maravillas.puntos, INDICE.maravillas.porMaravilla * civ.maravillas.length, INDICE.maravillas.porMaravilla * MARAVILLAS.length),
    estabilidad: INDICE.estabilidad.puntos * estabilidadMedia(civ) / 100,
  };
}

// `publicado` es el total con la precision con que se muestra (un decimal): con ese numero se comparan las civilizaciones y se declara un empate tecnico.
export function indiceDe(civ) {
  const pilares = pilaresDe(civ);
  const total = Object.values(pilares).reduce((a, b) => a + b, 0);
  return { pilares, total, publicado: Math.round(total * 10) / 10 };
}

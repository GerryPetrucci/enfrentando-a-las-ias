// El ritmo del cuadro de subtitulos en los formatos verticales: aparece con cada beat que dice algo, se queda lo que dura la voz (lo que se tarda en decir el texto) y se apaga, igual que el feed
// de Guerra de territorios (feed-conquista.js), para no tapar la escena. Puro (se prueba en Node). Los tiempos son a velocidad 1; la mesa los divide entre `vel`.

export const SUBTITULO = {
  MIN_MS: 3500, // un texto corto se queda al menos esto
  BASE_MS: 1000, MS_POR_CARACTER: 70, // lo que tarda la voz en decir un texto: 1 s mas 70 ms por caracter (unos 14 caracteres por segundo)
  FUNDIDO_MS: 350, // lo que tarda en aparecer o apagarse
};

// Cuanto se queda a la vista el cuadro con `texto`, en un beat que dura `msBeat`: lo que tarda en decirse (con un minimo), sin pasar del final del beat menos el fundido de salida.
// Un dato raro cuenta como texto vacio / beat de duracion cero: nunca lanza ni da un tiempo negativo.
export function msVisibleDeSubtitulo(texto, msBeat) {
  const n = typeof texto === 'string' ? texto.length : 0;
  const lectura = Math.max(SUBTITULO.MIN_MS, SUBTITULO.BASE_MS + n * SUBTITULO.MS_POR_CARACTER);
  const tope = Number.isFinite(msBeat) && msBeat > 0 ? msBeat - SUBTITULO.FUNDIDO_MS : 0;
  return Math.max(0, Math.min(lectura, tope));
}

// El ritmo del feed de la Guerra de territorios: aparece con los avisos nuevos, se queda lo que se tarda en leerlos y se apaga para dejar ver el mapa; con los siguientes vuelve a entrar.
// Puro (se prueba en Node). Los tiempos son a velocidad 1; la mesa los divide entre `vel`.

export const FEED = {
  MIN_MS: 4000, MAX_MS: 7000, // cuanto se queda como minimo y como maximo
  BASE_MS: 3000, POR_AVISO_MS: 900, // 3 s mas 0.9 s por cada aviso nuevo
  FUNDIDO_MS: 400, // lo que tarda en aparecer o apagarse
};

// Cuanto se queda el feed a la vista despues de recibir `nuevos` avisos (un dato raro cuenta como uno).
export function msVisibleDelFeed(nuevos) {
  const n = Number.isInteger(nuevos) && nuevos > 0 ? nuevos : 1;
  return Math.min(FEED.MAX_MS, Math.max(FEED.MIN_MS, FEED.BASE_MS + FEED.POR_AVISO_MS * n));
}

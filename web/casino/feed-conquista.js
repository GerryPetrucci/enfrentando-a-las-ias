// El ritmo del feed de la Guerra de territorios: aparece con los avisos nuevos, se queda lo que se tarda en leerlos y se apaga para dejar ver el mapa; con los siguientes vuelve a entrar.
// Puro (se prueba en Node). Los tiempos son a velocidad 1; la mesa los divide entre `vel`.

// Los intervalos de lectura se expresan en milisegundos.
export const FEED = {
  MIN_MS: 4000, MAX_MS: 7000, // cuanto se queda como minimo y como maximo
  BASE_MS: 3000, POR_AVISO_MS: 900, // 3 s mas 0.9 s por cada aviso nuevo
  FUNDIDO_MS: 400, // lo que tarda en aparecer o apagarse
  ESPACIADO_MS: 2200, // cuanto se tarda en encolar un aviso detras del anterior (ajustado a su longitud)
};

// Cuanto se queda el feed a la vista despues de recibir `nuevos` avisos (un dato raro cuenta como uno).
export function msVisibleDelFeed(nuevos) {
  const n = Number.isInteger(nuevos) && nuevos > 0 ? nuevos : 1;
  return Math.min(FEED.MAX_MS, Math.max(FEED.MIN_MS, FEED.BASE_MS + FEED.POR_AVISO_MS * n));
}

// Cuanto se tarda en mostrar un aviso del feed (mas si el texto es largo, para que de tiempo a leerlo).
export function espaciadoDeAviso(texto) {
  const largo = String(texto ?? '').length;
  return Math.ceil(Math.max(1800, Math.min(3200, FEED.ESPACIADO_MS * (0.6 + largo / 60))));
}

// La cola de avisos de un beat, uno detras de otro: `demora` es cuanto esperar desde el beat anterior a que aparezca, `restantes` lo que queda sumado desde ahi.
export function colaDeFeed(lista) {
  let acumulado = 0;
  return (lista ?? []).map((aviso) => {
    const texto = (aviso?.partes ?? []).map((p) => (typeof p === 'string' ? p : '')).join('');
    const demora = acumulado;
    acumulado += espaciadoDeAviso(texto);
    return { aviso, demora };
  });
}

// El beat no puede durar menos de lo que tarda en mostrarse toda la cola de avisos del feed: extiende `minMs` si hace falta.
export function extenderMinMs(minMs, lista) {
  const n = lista?.length ?? 0;
  if (!n) return minMs;
  const cola = colaDeFeed(lista);
  const necesita = cola.at(-1).demora + FEED.MIN_MS + FEED.FUNDIDO_MS;
  return Math.max(minMs, necesita);
}

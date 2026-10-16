// Lo que comparten las lineas de tiempo de todos los juegos (linea-de-tiempo-*.js). Sin DOM ni `window`: se importa en Node y en el navegador.

// {0}..{4} -> los nombres de las IAs de esa partida. Igual que resolverNombres del motor (la web no puede importar de src/).
export const nombrar = (texto, jugadores) => String(texto).replace(/\{([0-4])\}/g, (_, k) => jugadores?.[k]?.nombre ?? `Jugador ${Number(k) + 1}`);

// Cuanto dura un beat sin voz: lo que tarda su animacion (minMs) o lo que tarda en leerse (500 ms mas 60 por letra), lo que sea mayor.
export const duracion = (minMs, texto) => Math.max(minMs, texto ? 500 + 60 * texto.length : 0);

// El unico jugador con mas fichas (o puntos) que todos; un empate en lo alto no es lider (null).
export function lider(valores) {
  if (!Array.isArray(valores) || !valores.length) return null;
  const max = Math.max(...valores);
  const quienes = valores.flatMap((v, s) => (v === max ? [s] : []));
  return quienes.length === 1 ? quienes[0] : null;
}

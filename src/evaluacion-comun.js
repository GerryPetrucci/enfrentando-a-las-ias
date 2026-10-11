// Piezas comunes de la evaluacion al final de una serie (decision del usuario, 11 de octubre de 2026: no hay torneo general; al final de cada
// juego se evaluan caracteristicas de las IAs y se comenta el resultado segun ellas). Cada juego pone sus caracteristicas y sus umbrales
// (`src/juegos/<juego>/evaluacion.js`); aqui vive lo que comparten: ayudas de texto, la obediencia y el armado del comentario.
// El texto es PUBLICO (lleva acentos).

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
export const unir = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
export const redondeo = (x, d = 3) => +x.toFixed(d);

// Obediencia: respuestas en formato / respuestas totales. Es notable en cuanto alguna se tuvo que reemplazar.
export function fraseObediencia(validas, total) {
  if (!total) return { valor: null, frase: 'no hubo respuestas que medir', notable: false };
  const malas = total - validas;
  if (malas === 0) return { valor: 1, frase: `contestó en formato las ${total} veces`, notable: false };
  return { valor: redondeo(validas / total), frase: `${malas} de ${total} respuestas se tuvieron que reemplazar`, notable: true };
}

// Las partidas de una serie que se pueden evaluar: las cortadas (truncada) y la basura no entran.
export function buenasDe(partidas) {
  if (!Array.isArray(partidas)) return [];
  return partidas.filter((p) => p && typeof p === 'object' && !p.truncada && Array.isArray(p.jugadores) && p.jugadores.length
    && Array.isArray(p.rondas) && Array.isArray(p.metricas));
}

// El comentario de la serie: un resumen (quien sumo mas puntos por partida), una linea por IA con lo mas notable y los avisos.
// `jugadores` ya viene ordenado por puntosPorPartida (de mayor a menor) y con `nombre` y `destacadas`. `vuelta` = partidas que hacen una
// vuelta completa de asientos (con menos, solo es una muestra).
export function comentarioDeSerie({ juego, jugadores, n, vuelta }) {
  const cima = jugadores.filter((j) => j.puntosPorPartida === jugadores[0].puntosPorPartida);
  const comentario = [{
    tipo: 'resumen',
    texto: `En estas ${plural(n, 'partida', 'partidas')} de ${juego}, con estas reglas, ${unir(cima.map((j) => j.nombre))} ${cima.length === 1 ? 'sumó' : 'suman'} más puntos por partida (${jugadores[0].puntosPorPartida}).`,
  }];
  for (const j of jugadores) comentario.push({ tipo: 'jugador', texto: `${j.nombre}: ${j.destacadas.join('; ')}.` });
  if (n < vuelta) comentario.push({ tipo: 'aviso', texto: `Con ${plural(n, 'partida', 'partidas')} (menos de una vuelta completa de asientos) esto es solo una muestra, no un ranking.` });
  comentario.push({ tipo: 'aviso', texto: 'Esto es lo que pasó en estas partidas; no es un ranking general de las IAs.' });
  return comentario;
}

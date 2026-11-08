// Que juegos tienen escena de casino y que sabe la pagina de cada uno: su nombre, cuantos jugadores, cuantos se ven con la camara oculta por defecto, como se llama
// la unidad de un clip, y donde estan la funcion que convierte una partida guardada en su linea de tiempo (beats) y la mesa que la dibuja.
// Es el registro que usan la pagina (escena.html), el catalogo de partidas y el generador de voz (herramientas/narrar.mjs): un juego nuevo con escena se agrega aqui.
// Sin DOM ni `window`; los modulos (linea y mesa) se cargan al pedirlos para que usar uno no cargue los demas.

import { conIntro } from './intro.js';

const ESCENAS = {
  lobo: {
    nombre: 'Lobo en la aldea', jugadores: 12, camaraPorDefecto: 0, unidad: 'ronda',
    comprobar: (partida) => [8, 12].includes(partida?.jugadores?.length) && partida.rondas.every((r) => Array.isArray(r?.publico?.eventos))
      ? null : 'formato anterior o incompleto: Lobo necesita 8 o 12 asientos y los eventos públicos del motor',
    linea: () => import('./linea-de-tiempo-lobo.js'),
    mesa: () => import('./mesa-lobo.js'),
  },
};

export const juegosConEscena = () => Object.keys(ESCENAS);

// Los datos del juego (sin cargar sus modulos). Un juego sin escena da un error que dice cuales hay.
export function escenaDe(juegoId) {
  if (typeof juegoId !== 'string' || !Object.hasOwn(ESCENAS, juegoId)) {
    throw new Error(`no hay escena para el juego "${juegoId}". Juegos con escena: ${juegosConEscena().join(', ')}.`);
  }
  return ESCENAS[juegoId];
}

// Por que una partida guardada NO se puede reproducir con la escena (null si se puede): la usan la lista de la pagina y las herramientas (narrar, capturar-escena, partes),
// para que una partida de otro juego, vacia o guardada con un motor anterior se rechace con un mensaje claro y no produzca voz o capturas basura.
export function motivoDeNoReproducible(juegoId, partida) {
  if (!juegosConEscena().includes(juegoId)) return `es de ${juegoId ?? 'otro juego'}, que no tiene escena de casino`;
  if (!Array.isArray(partida?.rondas) || !partida.rondas.length) return 'sin rondas';
  return escenaDe(juegoId).comprobar?.(partida) ?? null; // cada juego puede exigir los datos que usa su escena
}

// Los beats de una partida: los del juego con la tarjeta de arranque delante (intro.js). Es el UNICO lugar donde se arma la lista que ven la pagina, las capturas, las partes y la voz.
export async function armarLinea(juegoId, partida, opciones) {
  return (await lineaDe(juegoId))(partida, opciones);
}

// La funcion (partida, opciones) -> beats del juego, con la tarjeta de arranque delante (el mismo contrato que antes).
export async function lineaDe(juegoId) {
  const { construirLineaDeTiempo } = await escenaDe(juegoId).linea();
  return (partida, opciones) => conIntro(construirLineaDeTiempo(partida, opciones), juegoId);
}

// Los n mejores momentos de una partida segun las reglas fijas de cada escena (cada juego los llama distinto: mejoresManos, mejoresRondas o mejoresTurnos), de mayor a menor:
// [{ unidad, puntos, motivos }]. `unidad` es el numero de mano/ronda/turno que usan los beats. Sin partida o con un juego sin esa funcion, lista vacia.
export async function destacadasDe(juegoId, partida, n) {
  if (!partida || typeof partida !== 'object') return [];
  const modulo = await escenaDe(juegoId).linea();
  const mejores = modulo.mejoresManos ?? modulo.mejoresRondas ?? modulo.mejoresTurnos;
  if (typeof mejores !== 'function') return [];
  return mejores(partida, n).map((x) => ({ unidad: x.mano ?? x.ronda ?? x.turno, puntos: x.puntos, motivos: Array.isArray(x.motivos) ? x.motivos : [] }));
}

// El modulo de la mesa del juego (exporta la clase de la mesa; solo se carga en el navegador).
export const mesaDe = (juegoId) => escenaDe(juegoId).mesa();

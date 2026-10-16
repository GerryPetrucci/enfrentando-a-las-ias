// Que juegos tienen escena de casino y donde esta la funcion que convierte una partida guardada en su linea de tiempo (beats).
// Es el registro que usan el generador de voz (herramientas/narrar.mjs) y, cuando haya varias escenas, la pagina: un juego nuevo con escena se agrega aqui.
// Sin DOM ni `window`; los modulos se cargan al pedirlos para que usar uno no cargue los demas.

const LINEAS = {
  dudaapuesta: () => import('./linea-de-tiempo-duda.js'),
};

export const juegosConEscena = () => Object.keys(LINEAS);

// La funcion construirLineaDeTiempo(partida, opciones) del juego. Un juego sin escena da un error que dice cuales hay.
export async function lineaDe(juegoId) {
  if (typeof juegoId !== 'string' || !Object.hasOwn(LINEAS, juegoId)) {
    throw new Error(`no hay escena para el juego "${juegoId}". Juegos con escena: ${juegosConEscena().join(', ')}.`);
  }
  return (await LINEAS[juegoId]()).construirLineaDeTiempo;
}

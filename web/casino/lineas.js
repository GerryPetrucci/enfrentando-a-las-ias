// Que juegos tienen escena de casino y que sabe la pagina de cada uno: su nombre, cuantos jugadores, cuantos se ven con la camara oculta por defecto, como se llama
// la unidad de un clip, y donde estan la funcion que convierte una partida guardada en su linea de tiempo (beats) y la mesa que la dibuja.
// Es el registro que usan la pagina (escena.html), el catalogo de partidas y el generador de voz (herramientas/narrar.mjs): un juego nuevo con escena se agrega aqui.
// Sin DOM ni `window`; los modulos (linea y mesa) se cargan al pedirlos para que usar uno no cargue los demas.

import { leerMapa } from './conquista-datos.js';

const ESCENAS = {
  dudaapuesta: {
    nombre: 'Duda y apuesta',
    jugadores: 4,
    camaraPorDefecto: 2, // a cuantos se les ven las cartas antes del recuento
    unidad: 'mano',
    linea: () => import('./linea-de-tiempo-duda.js'),
    mesa: () => import('./mesa-duda.js'),
  },
  mayormenor: {
    nombre: 'Mayor o menor',
    jugadores: 2,
    camaraPorDefecto: 1, // de 2 jugadores: en la mitad de las rondas se ve la carta jugada
    unidad: 'ronda',
    linea: () => import('./linea-de-tiempo-mayormenor.js'),
    mesa: () => import('./mesa-mayormenor.js'),
  },
  subasta: {
    nombre: 'Subasta de tiempo',
    jugadores: 5,
    camaraPorDefecto: 0, // sin camara oculta: el publico ve los bancos desde el principio y descubre cuanto aguanta cada quien
    unidad: 'ronda', // una subasta es una "ronda" de la URL
    campo: 'subasta', // pero sus registros la numeran con este campo (los otros juegos la numeran con el nombre de su unidad)
    // las partidas guardadas sin los datos ocultos de las apuestas y los bancos no se pueden reproducir: salen apagadas en la lista
    comprobar: (partida) => {
      const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
      const completo = rondas.every((r) => Array.isArray(r?.oculto?.apuestas) && Array.isArray(r.oculto?.bancos));
      return completo ? null : 'formato anterior: la partida se guardó con un motor que no escribía todos los datos que usa la escena';
    },
    linea: () => import('./linea-de-tiempo-subasta.js'),
    mesa: () => import('./mesa-subasta.js'),
  },
  fuga: {
    nombre: 'La Fuga',
    jugadores: 2,
    camaraPorDefecto: 0, // sin camara oculta: lo que el publico ve y las IAs no son la alarma, la cohesion y el riesgo real
    unidad: 'ronda', // una situacion es una "ronda" de la URL
    // las partidas guardadas antes de que el motor escribiera la alarma de antes, el riesgo real y los campos ilegibles salen apagadas en la lista
    comprobar: (partida) => {
      const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
      const completo = rondas.every((r) => Number.isFinite(r?.oculto?.alarmaAntes) && Number.isFinite(r.oculto?.cohesionAntes) && Array.isArray(r.oculto?.fallo) && Array.isArray(r.ilegibles));
      return completo ? null : 'formato anterior: la partida se guardó con un motor que no escribía todos los datos que usa la escena';
    },
    linea: () => import('./linea-de-tiempo-fuga.js'),
    mesa: () => import('./mesa-fuga.js'),
  },
  tripledado: {
    nombre: 'Triple dado',
    jugadores: 4,
    camaraPorDefecto: 2, // a cuantos se les ve la tarjeta antes del cierre de la ronda
    unidad: 'ronda',
    // las partidas guardadas con el motor anterior no traen los doceavos ni los datos de los dados ocultos: salen apagadas en la lista
    comprobar: (partida) => {
      const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
      const completo = rondas.every((r) => (r?.fase === 'prediccion' ? Array.isArray(r.oculto?.tarjetas) && Array.isArray(r.lanzamiento?.blancos) : Array.isArray(r?.puntosD) && Array.isArray(r.puntosRondaD) && Array.isArray(r.combos) && Array.isArray(r.oculto?.sinUsar)));
      return completo ? null : 'formato anterior: la partida se guardó con un motor que no escribía todos los datos que usa la escena';
    },
    linea: () => import('./linea-de-tiempo-tripledado.js'),
    mesa: () => import('./mesa-tripledado.js'),
  },
  solitario: {
    nombre: 'El número solitario',
    jugadores: 5,
    camaraPorDefecto: 2, // de los que siguen jugando: a cuantos se les ve la marca antes del reveal
    unidad: 'ronda',
    linea: () => import('./linea-de-tiempo-solitario.js'),
    mesa: () => import('./mesa-solitario.js'),
  },
  conquista: {
    nombre: 'Guerra de territorios',
    jugadores: 5,
    camaraPorDefecto: 0, // sin camara oculta: el publico lo ve todo; lo que se retrasa son los mensajes privados (se revelan con la traicion, el pacto cumplido o el final)
    unidad: 'turno',
    // las partidas guardadas sin el mapa (o con uno ilegible) o con combates sin el detalle de sus bandos salen apagadas en la lista: la escena no recalcula reglas, solo lee lo guardado
    comprobar: (partida) => {
      const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
      const completo = leerMapa(partida?.mapa) !== null && rondas.every((r) => (r?.combates ?? []).every((c) => Array.isArray(c?.bandos)));
      return completo ? null : 'formato anterior: la partida se guardó con un motor que no escribía todos los datos que usa la escena';
    },
    linea: () => import('./linea-de-tiempo-conquista.js'),
    mesa: () => import('./mesa-conquista.js'),
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

// La funcion construirLineaDeTiempo(partida, opciones) del juego.
export async function lineaDe(juegoId) {
  return (await escenaDe(juegoId).linea()).construirLineaDeTiempo;
}

// El modulo de la mesa del juego (exporta la clase de la mesa; solo se carga en el navegador).
export const mesaDe = (juegoId) => escenaDe(juegoId).mesa();

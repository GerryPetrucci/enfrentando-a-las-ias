// El indice de paquetes (data/paquetes.json): para cada partida con paquete de publicacion, su numero de juego (jN) y sus piezas (parte, clip, gancho). `herramientas/paquete.mjs` lo mantiene al generar un
// paquete (y `--indexar` lo rehace con los que ya hay). Lo lee la pagina de grabacion (escena.js) cuando la direccion NO trae `numero=N` —la de un LEEME anterior a la identificacion de cada pieza—: asi la pieza
// se graba con su tarjeta «Juego N · Parte M de K» aunque se abra con un enlace viejo, en vez de salir, en silencio, sin decir de que juego es. Puro: sin DOM, sin red y sin archivos.
//
//   { "pruebas/2026-10-28-x.json#1": { juego: 3, piezas: [{ id: 'parte-1', tipo: 'parte', parte: 1, desde: 1, hasta: 8 }, ...] }, ... }

export const RUTA_INDICE = 'data/paquetes.json';

// La clave de una partida: el archivo tal como lo pide la direccion (archivo=...) y su numero dentro del archivo.
export const claveDeIndice = (archivo, partida) => `${archivo}#${partida}`;

const entero = (n) => Number.isInteger(n) && n >= 1;

// [clave, entrada] de un paquete.json (el de ahora trae `piezas`; el de la version vieja solo `juego`, `partida` y `archivo`), o null si no sirve.
export function entradaDePaquete(paquete) {
  if (!paquete || typeof paquete !== 'object' || typeof paquete.archivo !== 'string' || !paquete.archivo) return null;
  if (!entero(paquete.juego) || !entero(paquete.partida)) return null;
  const piezas = (Array.isArray(paquete.piezas) ? paquete.piezas : []).filter((p) => p && typeof p === 'object' && typeof p.id === 'string')
    .map((p) => ({ id: p.id, tipo: p.tipo ?? null, parte: p.parte ?? null, desde: p.desde ?? null, hasta: p.hasta ?? null }));
  return [claveDeIndice(paquete.archivo, paquete.partida), { juego: paquete.juego, piezas }];
}

// Lo que identifica a una pieza abierta con una direccion sin numero: { numero, pieza: { parte, de, clip } }, o null si esa partida no tiene paquete (no se inventa un jN).
// `consulta`: { archivo, partida, gancho (lo de la direccion: { parte }) o desde y hasta (las rondas de la parte o del clip) }. Una pieza que el paquete no tiene da solo el juego.
export function identidadDeIndice(indice, consulta) {
  if (!indice || typeof indice !== 'object' || Array.isArray(indice) || !consulta || typeof consulta !== 'object') return null;
  const entrada = indice[claveDeIndice(consulta.archivo, consulta.partida ?? 1)];
  if (!entrada || typeof entrada !== 'object' || !entero(entrada.juego)) return null;
  const piezas = Array.isArray(entrada.piezas) ? entrada.piezas : [];
  const { gancho = null, desde = null, hasta = null } = consulta;
  const pieza = gancho ? piezas.find((p) => p.tipo === 'gancho' && p.parte === gancho.parte)
    : Number.isFinite(desde) && Number.isFinite(hasta) ? piezas.find((p) => (p.tipo === 'parte' || p.tipo === 'clip') && p.desde === desde && p.hasta === hasta) : null;
  if (!pieza) return { numero: entrada.juego, pieza: { parte: null, de: null, clip: null } };
  const clip = pieza.tipo === 'clip' ? Number(String(pieza.id).split('-')[1]) : NaN;
  return { numero: entrada.juego, pieza: { parte: entero(pieza.parte) ? pieza.parte : null, de: entero(pieza.parte) ? 2 : null, clip: entero(clip) ? clip : null } };
}

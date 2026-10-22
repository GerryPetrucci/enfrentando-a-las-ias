// Paquete de equilibrio de la Guerra de territorios (2.0.0): funciones puras sobre el estado. Las reglas de cada pieza estan en constantes.js (HEGEMON, RECONQUISTA, PATRIA, EVENTOS).

import { crearRng } from '../../rng.js';
import { HEGEMON, RECONQUISTA, PATRIA, EVENTOS, TIERRA_AJENA } from './constantes.js';

// Hegemon: el reino con mas regiones desde `entra` de las regiones con dueno; lo conserva mientras siga entre los de mas regiones y no baje de `sale` (histeresis, para que no parpadee).
// Para entrar debe ser el unico de la punta. Devuelve el Hegemon (-1 si no hay) y lo deja en E.hegemon.
export function actualizarHegemon(E) {
  const cuenta = Array(E.k).fill(0);
  let total = 0;
  for (const d of E.dueno) if (d >= 0) { cuenta[d]++; total++; }
  let nuevo = -1;
  if (HEGEMON.activo && total > 0) {
    const punta = Math.max(...cuenta), lideres = cuenta.flatMap((n, s) => (n === punta && E.reinos[s].vivo ? [s] : []));
    const actual = E.hegemon;
    if (actual >= 0 && lideres.includes(actual) && cuenta[actual] / total >= HEGEMON.sale) nuevo = actual;
    else if (lideres.length === 1 && cuenta[lideres[0]] / total >= HEGEMON.entra) nuevo = lideres[0];
  }
  E.hegemon = nuevo;
  return nuevo;
}

// El calendario de eventos de una partida: [{ t, tipo }] en los turnos de EVENTOS.turnos, sin repetir el tipo dos veces seguidas. Sale solo del seed del mapa (un rng propio, para no mover el de la partida),
// asi que es el mismo pase lo que pase y lo conocen todos los reinos por igual. Con los eventos apagados, [].
export function sortearCalendario(seedMapa) {
  if (!EVENTOS.activo) return [];
  const rng = crearRng((seedMapa ^ 0x5ee7) >>> 0), calendario = [];
  let previo = null;
  for (const t of EVENTOS.turnos) {
    const opciones = EVENTOS.tipos.filter((x) => x !== previo), tipo = opciones[Math.floor(rng() * opciones.length)];
    calendario.push({ t, tipo }); previo = tipo;
  }
  return calendario;
}

// El evento del turno t (o null).
export const eventoDe = (E, t) => (EVENTOS.activo ? E.calendario?.find((e) => e.t === t) ?? null : null);

// Como se llama cada evento ante las IAs.
export const NOMBRE_EVENTO = { sequia: 'Sequia', peste: 'Peste', cosecha: 'Cosecha', caravana: 'Caravana' };

// Modificador de fuerza del reino k cuando pelea en la region d en el turno t (lo usan el motor y los FRENTES de la vista, para que digan lo mismo): sin pacto con el dueno de la region rinde TIERRA_AJENA;
// si ese dueno es el Hegemon, x bonoAtaque; si la region era suya y la perdio hace poco, Reconquista. En una region libre, propia o de un aliado vale 1.
export function modificadorDeReino(E, k, d, t) {
  const O = E.dueno[d];
  if (!(O >= 0 && k !== O && !(E.reinos[k].pactos[O] >= t))) return 1;
  let m = TIERRA_AJENA;
  if (HEGEMON.activo && E.hegemon === O) m *= HEGEMON.bonoAtaque;
  const perdida = E.perdidas[d];
  if (RECONQUISTA.activo && perdida && perdida.k === k && t - perdida.t <= RECONQUISTA.turnos) m *= RECONQUISTA.bonoAtaque;
  return m;
}

// Bono de defensa de las regiones de un dueno con `regiones` regiones (Patria).
export const bonoDePatria = (dueno, regiones) => (dueno >= 0 && PATRIA.activo && regiones <= PATRIA.maxRegiones ? PATRIA.bonoDefensa : 1);

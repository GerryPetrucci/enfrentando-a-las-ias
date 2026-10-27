import { EVENTOS, EVENTO, CADA_EVENTO, PESTE_DESDE_TURNO, TURNOS, INVASIONES } from './constantes.js';
import { rngDe } from './rng.js';

export function calendarioEventos(seed) {
  const calendario = [];
  for (let turno = CADA_EVENTO; turno <= TURNOS; turno += CADA_EVENTO) {
    const anterior = calendario.at(-1)?.id;
    const candidatos = EVENTOS.filter((e) => e.id !== anterior && (e.id !== 'peste' || turno >= PESTE_DESDE_TURNO));
    const id = candidatos[Math.floor(rngDe(seed, turno, 'tipo-de-evento')() * candidatos.length)].id;
    calendario.push({ turno, id });
  }
  return calendario;
}

// Consulta pura: no consume RNG de la partida ni revela repentinos futuros.
export function avisosDe(E, t) {
  if (E.capas?.crisis === false) return { evento: null, invasion: null };
  return {
    evento: E.calendario.find((e) => e.turno === t || (e.turno === t + 1 && !EVENTO[e.id].repentino)) ?? null,
    invasion: INVASIONES.find((i) => i.turno === t || i.turno === t + 1) ?? null,
  };
}

// Si solo hay un edificio en la capital no existe «abandonar la region» (11.9).
export function opcionesEvento(civ, id) {
  return EVENTO[id].opciones.map((nombre, k) => ({ n: k + 1, nombre }))
    .filter((o) => id !== 'terremoto' || o.n !== 2 || !civ.edificios[civ.capital]
      || Object.keys(civ.edificios).some((r) => Number(r) !== civ.capital));
}

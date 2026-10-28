import { activosDe } from './estado.js';

// Proyección por lista blanca: nunca entregar el estado ni eventos privados ajenos.
export function vistaDe(E, i) {
  if (!Number.isInteger(i) || i < 0 || i >= E.jugadores) throw new Error('Asiento inválido.');
  const pareja = E.enamorados.includes(i) ? E.enamorados.find((j) => j !== i) : null;
  return structuredClone({
    asiento: i, rol: E.roles[i], ronda: E.ronda, fase: E.fase, activo: activosDe(E)[i],
    // Las IAs solo ven el rol de quien ya murió (o al terminar): nadie sabe quién es Cupido hasta entonces.
    jugadores: E.vivos.map((vivo, j) => ({ asiento: j, vivo, ...(!vivo || E.fin ? { rol: E.roles[j] } : {}) })),
    declaraciones: E.declaraciones,
    pareja, inspecciones: E.inspecciones[i],
    ...(E.roles[i] === 'cupido' ? { enamoradosElegidos: E.enamorados } : {}),
    ...(E.roles[i] === 'lobo' ? { manada: E.roles.flatMap((r, j) => r === 'lobo' ? [j] : []) } : {}),
    ...(E.roles[i] === 'bruja' ? { pociones: E.pociones, victima: E.fase === 'bruja' ? E.victima : null } : {}),
    // Lo que el modo muestra de Cupido pertenece a la cámara, no al conocimiento de las IAs.
    eventos: E.eventos.filter((e) => e.tipo !== 'enamorados'),
  });
}

export const vistaTexto = (E, i) => JSON.stringify(vistaDe(E, i));

// La escena consume esta proyección y registro.publico, nunca registro.privado.
// Los mensajes son afirmaciones de jugadores: no certifican roles verdaderos.
export function vistaCamara(E) {
  return structuredClone({ ronda: E.ronda, fase: E.fase, fin: E.fin,
    jugadores: E.vivos.map((vivo, i) => ({ asiento: i, vivo, ...(!vivo || E.fin || (E.camaraVe.cupido && E.roles[i] === 'cupido') ? { rol: E.roles[i] } : {}) })),
    declaraciones: E.declaraciones,
    // La pareja solo aparece cuando el modo la muestra, cuando muere un enamorado o al terminar.
    enamorados: E.camaraVe.pareja ? E.enamorados : [], eventos: E.eventos,
    ...(E.fin ? { ganadorBando: E.ganadorBando, puntos: E.puntos } : {}),
  });
}

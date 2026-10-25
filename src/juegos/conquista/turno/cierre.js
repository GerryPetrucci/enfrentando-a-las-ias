// Fin del turno: cuenta de la Maravilla, victoria y registro que se guarda.

import { clasificar, instantanea } from '../estado.js';
import { MARAVILLA, TURNOS } from '../constantes.js';
import { resumenPublico } from '../texto.js';
import { actualizarHegemon } from '../equilibrio.js';

import { cercosDeMaravilla } from '../maravilla.js';

// Un cerco militar interrumpe la cuenta sin exigir conquistar la capital.
export function maravillaYVictoria(ctx) {
  const { E, R, t } = ctx, m = E.maravilla;
  if (m && m.t0 < t && E.dueno[m.r] === m.k && R[m.k].vivo) {
    const cercos = cercosDeMaravilla(E, t);
    const estabaCercada = !!m.cercada;
    m.cercada = cercos.length > 0;
    if (m.cercada && !estabaCercada) ctx.evt({ tipo: 'maravilla_cerco', k: m.k, r: m.r, cercos, cuenta: m.n });
    if (!m.cercada && estabaCercada) ctx.evt({ tipo: 'maravilla_libre', k: m.k, r: m.r, cuenta: m.n });
    if (!m.cercada) m.n++;
    if (!m.cercada && m.n >= MARAVILLA.turnos && E.ganador === null) {
      E.ganador = m.k; E.ganoPorMaravilla = true;
      ctx.evt({ tipo: 'maravilla_gana', k: m.k });
    }
  }
  const vivos = R.filter((r) => r.vivo);
  if (E.ganador === null && vivos.length === 1) E.ganador = vivos[0].s;
  // Extincion mutua: los ultimos reinos caen en el mismo turno. La partida termina ahi (no sigue vacia hasta el turno 30) y gana el que mas regiones tenia al caer,
  // luego el sorteo con seed: el orden de los caidos de clasificar(). El resultado lleva `extincionMutua` para que quien lo muestre lo diga.
  if (E.ganador === null && vivos.length === 0) { E.ganador = clasificar(E)[0].s; E.extincionMutua = true; }
  E.turno = t;
  if (E.ganador === null && E.turno >= TURNOS) E.ganador = clasificar(E)[0].s; // al turno 30: mas regiones, tropas, almacen y sorteo
}

export function cerrarRegistro(ctx) {
  const { E, R, k } = ctx;
  const hegemonAntes = E.hegemon, hegemonAhora = actualizarHegemon(E); // se decide con el estado al cerrar el turno: es el que veran las IAs
  if (hegemonAntes !== hegemonAhora) {
    if (hegemonAntes >= 0) ctx.evt({ tipo: 'hegemon_fin', k: hegemonAntes });
    if (hegemonAhora >= 0) ctx.evt({ tipo: 'hegemon', k: hegemonAhora });
  }
  for (let s = 0; s < k; s++) { E.stats[s].validas += ctx.obed[s].validas; E.stats[s].total += ctx.obed[s].total; }
  E.resumenPrevio = resumenPublico(ctx.eventos, R.map((r) => r.nombre));
  E.mensajesPrevios = ctx.mensajes;
  E.regalosPrevios = R.map((_, s) => ctx.regalos.filter((g) => g.a === s));
  return {
    turno: ctx.t, eventos: ctx.eventos, movs: ctx.movs, combates: ctx.combates, mensajes: ctx.mensajes, privados: ctx.privados,
    descartes: ctx.descartes, obediencia: ctx.obed, estado: instantanea(E),
  };
}

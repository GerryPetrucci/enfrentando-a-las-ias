// Reconstruye lo que vio cada IA en cada turno de una partida YA guardada (el prompt de usuario que se le mando). La partida guarda lo que respondio cada reino y lo que paso, no el texto que recibio; pero el motor
// es determinista, asi que rejugando las respuestas guardadas sobre el mismo mapa y seed se obtiene el mismo estado y, con el, la misma vista. `fiel` dice si la rejugada coincide con los estados guardados
// (duenos, guarnicion y unidades de cada reino en cada region, tambien las de visita, de cada turno): si no, esos prompts NO son de fiar y no se publican. Solo para la web y los archivos publicos: nunca
// cambia nada de lo jugado.

import { crearRng } from '../../rng.js';
import { restaurarMapa } from '../../mapa.js';
import { construirUsuario } from '../../prompt.js';
import { crearEstado, tropasDe, instantanea } from './estado.js';
import { normalizarRespuesta } from './ordenes.js';
import { aplicarTurno } from './turno/index.js';
import { vistaTexto } from './vista.js';

const igual = (a, b) => JSON.stringify(Array.from(a ?? [])) === JSON.stringify(Array.from(b ?? []));

// -> { fiel, turnos: [{ turno, prompts: [texto del reino 0, ...] }] } hasta `hastaTurno` (null en el reino que no jugaba ese turno). Nunca lanza: si algo no se puede rejugar, { fiel: false, turnos: [] }.
export function reconstruirPrompts(partida, hastaTurno = Infinity) {
  try {
    if (!Array.isArray(partida?.rondas) || !Array.isArray(partida?.jugadores)) return { fiel: false, turnos: [] };
    const k = partida.jugadores.length;
    const E = crearEstado(crearRng(partida.seed), { jugadores: k, mapa: restaurarMapa(partida.mapa), nombres: partida.reinos, cercoMaravilla: partida.cercoMaravilla ?? 0 });
    const turnos = [];
    let fiel = true;
    for (const r of partida.rondas) {
      if (r.turno > hastaTurno) break;
      turnos.push({ turno: r.turno, prompts: E.reinos.map((x, i) => (x.vivo ? construirUsuario(vistaTexto(E, i)) : null)) });
      const nombres = E.reinos.map((x) => x.nombre);
      const jugadas = E.reinos.map((x, s) => {
        if (!x.vivo) return null;
        const resp = r.respuestas?.[s];
        if (!resp || resp.invalida) return normalizarRespuesta(null, E);
        return normalizarRespuesta({
          ordenes: resp.ordenes, pacto_con: Number.isInteger(resp.pactoCon) ? nombres[resp.pactoCon] : null,
          mensaje: (r.mensajes ?? []).find((m) => m.k === s)?.texto ?? '',
          privados: (r.privados ?? []).filter((m) => m.k === s).map((m) => ({ a: nombres[m.a], texto: m.texto })),
          nota: r.estado?.notas?.[s] ?? '', razon: resp.razon ?? '',
        }, E);
      });
      aplicarTurno(E, jugadas);
      if (!igual(E.dueno, r.estado?.dueno) || !igual(Array.from({ length: E.dueno.length }, (_, x) => tropasDe(E, x)), r.estado?.tropas)) fiel = false;
      if (r.estado?.uni !== undefined && JSON.stringify(instantanea(E).uni) !== JSON.stringify(r.estado.uni)) fiel = false; // las partidas 2.0.0 guardan las unidades de cada reino por region
      const maravilla = (m) => m ? { r: m.r, k: m.k, n: m.n, t0: m.t0, cercada: !!m.cercada } : null;
      if (JSON.stringify(maravilla(E.maravilla)) !== JSON.stringify(maravilla(r.estado?.maravilla))) fiel = false;
    }
    return { fiel, turnos };
  } catch {
    return { fiel: false, turnos: [] };
  }
}

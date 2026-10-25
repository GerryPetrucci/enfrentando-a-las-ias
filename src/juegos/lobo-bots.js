// Controles privados de balance: deciden exclusivamente desde la vista del rol.
import { vistaDe } from './lobo/vista.js';

export const ARQUETIPOS = ['agresivo', 'silencioso', 'revela', 'calla', 'rapida', 'guarda', 'mayoria', 'contradice'];

export function decidirBot(v, arquetipo, rng) {
  const otros = v.jugadores.filter((j) => j.vivo && j.asiento !== v.asiento).map((j) => j.asiento);
  const elegir = (lista) => lista.length ? lista[Math.floor(rng() * lista.length)] : null;
  const hallazgos = v.inspecciones.filter((x) => x.esLobo && otros.includes(x.objetivo)).map((x) => x.objetivo);
  const acusaciones = v.eventos.filter((x) => x.tipo === 'mensaje').flatMap((x) => {
    const m = /^Soy vidente; detecté lobo en asiento (\d+)\.$/u.exec(x.mensaje);
    return m && otros.includes(Number(m[1])) ? [Number(m[1])] : [];
  });
  const sospechosos = [...hallazgos, ...acusaciones];
  const anterior = v.eventos.filter((x) => x.tipo === 'votacion').at(-1);
  const popular = anterior ? [...otros].sort((a, b) => anterior.conteo[b] - anterior.conteo[a] || a - b)[0] : null;
  const objetivoAldea = () => elegir(sospechosos) ?? (arquetipo === 'mayoria' && popular !== null ? popular : arquetipo === 'contradice' && popular !== null ? elegir(otros.filter((i) => i !== popular)) ?? popular : elegir(otros));
  switch (v.fase) {
    case 'cupido': {
      const todos = v.jugadores.filter((j) => j.vivo).map((j) => j.asiento);
      const a = elegir(todos);
      return { enamorados: [a, elegir(todos.filter((i) => i !== a))] };
    }
    case 'lobos': {
      const presas = otros.filter((i) => !v.manada.includes(i));
      // Agresivo coordina por orden público; silencioso mantiene preferencia propia.
      return { accion: 'matar', objetivo: arquetipo === 'silencioso' ? elegir(presas) : presas[0] };
    }
    case 'vidente': return { accion: 'inspeccionar', objetivo: elegir(otros.filter((i) => !v.inspecciones.some((x) => x.objetivo === i))) ?? elegir(otros) };
    case 'bruja': return {
      salvar: v.pociones.salvar && v.victima !== null && (arquetipo === 'rapida' || v.victima === v.asiento || v.ronda >= 3),
      matar: v.pociones.matar && (arquetipo === 'rapida' || sospechosos.length || v.ronda >= 3) ? objetivoAldea() : null,
    };
    case 'cazador': return { accion: 'disparar', objetivo: objetivoAldea() };
    case 'dia': {
      let mensaje = '';
      if (v.rol === 'vidente' && arquetipo !== 'calla' && hallazgos.length) mensaje = `Soy vidente; detecté lobo en asiento ${hallazgos[0]}.`;
      if (v.rol === 'lobo' && arquetipo === 'agresivo') mensaje = `Soy vidente; detecté lobo en asiento ${otros.filter((i) => !v.manada.includes(i))[0]}.`;
      const voto = v.rol === 'lobo' ? elegir(otros.filter((i) => !v.manada.includes(i))) : objetivoAldea();
      return { mensaje, voto };
    }
    default: throw new Error(`Fase desconocida: ${v.fase}`);
  }
}

export const BOTS = Object.fromEntries(ARQUETIPOS.map((tipo) => [tipo, (E, i, rng) => decidirBot(vistaDe(E, i), tipo, rng)]));
export const INFO_BOTS = Object.fromEntries(ARQUETIPOS.map((id) => [id, { nombre: `Control ${id}`, color: '#888888' }]));

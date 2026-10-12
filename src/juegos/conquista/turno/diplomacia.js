// Diplomacia: rupturas de pacto, pactos nuevos, mensajes publicos y privados, notas de plan y ofertas de comercio.

import { aliado } from '../estado.js';
import { HONOR, TURNOS, PACTO_TURNOS, NOMBRES_REINOS } from '../constantes.js';

// Fase 6: romper un pacto acaba el pacto de los dos y resta honor; el que rompe puede atacar ese mismo turno.
export function rupturas(ctx) {
  const { E, R, t } = ctx;
  for (const { s, o } of ctx.pend.rupturas) {
    if (!aliado(E, s, o.reino, t)) { ctx.mal(s, o.texto, 'no tienes un pacto vigente con ese reino'); continue; }
    const j = o.reino;
    R[s].pactos[j] = R[j].pactos[s] = 0;
    R[s].pactoOk[j] = R[j].pactoOk[s] = false;
    R[s].honor = Math.max(0, R[s].honor - HONOR.rotura);
    E.stats[s].rupturas++;
    ctx.evt({ tipo: 'ruptura', k: s, contra: j });
    if (R[s].honor <= HONOR.deshonrado && !R[s].deshonrado) { R[s].deshonrado = true; ctx.evt({ tipo: 'deshonra', k: s }); }
    ctx.bien(s);
  }
}

// Fase 9a: un pacto se firma al final del turno en que las dos propuestas estan abiertas y al menos una se hizo en ese turno
// (la propuesta del turno anterior sigue abierta). Dura 2 turnos. No con 2 reinos, ni deshonrados, ni en la muerte subita.
export function pactosNuevos(ctx) {
  const { E, R, t, k } = ctx;
  const ahora = R.map((r, s) => {
    const j = ctx.jugadas[s], otro = j && !j.invalida ? j.pactoCon : null;
    return ctx.vivosAlInicio[s] && otro !== null && otro !== s && ctx.activa(otro) ? otro : null;
  });
  if (k >= 3 && t < TURNOS - 1) {
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
      if (!R[a].vivo || !R[b].vivo || R[a].pactos[b] >= t + 1) continue;
      if (R[a].honor <= HONOR.deshonrado || R[b].honor <= HONOR.deshonrado) continue;
      const alMismoTiempo = ahora[a] === b && (ahora[b] === a || R[b].propuestaPrevia === a);
      const respuesta = ahora[b] === a && R[a].propuestaPrevia === b;
      if (!alMismoTiempo && !respuesta) continue;
      R[a].pactos[b] = R[b].pactos[a] = t + PACTO_TURNOS;
      R[a].pactoOk[b] = R[b].pactoOk[a] = true;
      E.stats[a].pactos++; E.stats[b].pactos++;
      ctx.evt({ tipo: 'pacto', k: a, con: b });
    }
  }
  R.forEach((r, s) => { r.propuestaPrevia = ahora[s]; });
}

// Fase 9b: mensajes publicos (los ve todo el mundo el turno siguiente), privados (solo su destinatario, el turno siguiente),
// notas de plan y ofertas de comercio pendientes (llegan el turno siguiente y caducan si no se aceptan).
export function mensajesYNotas(ctx) {
  const { R, k } = ctx, nuevosPrivados = R.map(() => []);
  for (let s = 0; s < k; s++) {
    const j = ctx.jugadas[s];
    if (!ctx.vivosAlInicio[s] || !j || j.invalida) continue;
    if (j.mensaje) ctx.mensajes.push({ k: s, texto: j.mensaje });
    for (const p of j.privados) {
      if (p.a === s || !ctx.activa(p.a)) { ctx.mal(s, `privado a ${NOMBRES_REINOS[p.a] ?? '?'}`, 'el destinatario no existe o ya cayo'); continue; }
      nuevosPrivados[p.a].push({ de: s, texto: p.texto });
      ctx.privados.push({ k: s, a: p.a, texto: p.texto });
      ctx.bien(s);
    }
    if (j.nota !== undefined) R[s].nota = j.nota; // sin campo se conserva; vacia se borra
  }
  for (let s = 0; s < k; s++) {
    R[s].privIn = R[s].vivo ? nuevosPrivados[s] : [];
    R[s].ofertasIn = R[s].vivo ? (ctx.pend.ofertas[s] ?? []).filter((x) => R[x.de].vivo) : [];
  }
}

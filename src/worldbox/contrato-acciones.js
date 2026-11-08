import { readFileSync } from 'node:fs';
import { copiar, entero, objeto, exigir, canonico } from './util.js';

// Catalogo versionado: `esperar` (la accion nula de fabrica) y las acciones PROPIAS del simulador
// (`simulada: true`). Las acciones del juego real NO viven aqui: salen de lo que el puente anuncie.
export const CATALOGO = JSON.parse(readFileSync(new URL('./catalogo-acciones.json', import.meta.url), 'utf8'));
export const ESPERAR = Object.freeze({ action: 'esperar', parameters: {} });
const REGLA_ESPERAR = Object.freeze(CATALOGO.acciones.find(a => a.nombre === 'esperar'));
export const POLITICA_PUENTE = Object.freeze({ puntos: 1, cooldown: 0 });

// Lista blanca de la competencia. `esperar` siempre esta (la resuelve el orquestador, nunca viaja al
// adaptador). Simulador: solo las acciones del catalogo, anunciadas verificadas y con el esquema IDENTICO.
// Puente: exactamente las acciones que anuncie con verificada:true (nombre, descripcion y esquema suyos);
// el costo en puntos y el cooldown son los que anuncie o, si no anuncia, 1 punto y cooldown 0.
export function accionesHabilitadas(info, catalogo = CATALOGO, perfil = null) {
  const locales = new Map(catalogo.acciones.map(a => [a.nombre, a]));
  const reglas = [copiar(REGLA_ESPERAR)];
  if (perfil?.acciones) {
    // Reglamento cerrado (juego real): solo las acciones del reglamento, anunciadas verificadas y con EXACTAMENTE su esquema.
    // Costos, cooldowns, restricciones y texto son los del reglamento; la descripcion del puente solo se registra.
    for (const [nombre, p] of Object.entries(perfil.acciones)) {
      const a = info.acciones.find(x => x.nombre === nombre);
      if (!a || a.verificada !== true || /^\s*EN PRUEBA/i.test(a.descripcion ?? '') || canonico(a.parametros) !== canonico(p.parametros)) continue;
      const { texto, ...politica } = copiar(p);
      reglas.push({ nombre, descripcion: texto, descripcion_puente: String(a.descripcion ?? '').slice(0, 1000), ...politica, anunciada: true });
    }
    return reglas;
  }
  for (const a of info.acciones) {
    if (a.verificada !== true || a.nombre === 'esperar') continue;
    // El mod puede anunciar acciones «en prueba» (solo para ensayos locales): jamas entran en una competencia.
    if (/^\s*EN PRUEBA/i.test(a.descripcion ?? '')) continue;
    if (info.origen === 'simulado') {
      const local = locales.get(a.nombre);
      if (local?.simulada && canonico(a.parametros) === canonico(local.parametros)) reglas.push(copiar(local));
    } else {
      reglas.push({ nombre: a.nombre, descripcion: a.descripcion, parametros: copiar(a.parametros),
        puntos: a.puntos ?? POLITICA_PUENTE.puntos, cooldown: a.cooldown ?? POLITICA_PUENTE.cooldown, anunciada: true });
    }
  }
  return reglas;
}
export function validarEsquema(parametros, esquema) {
  if (!objeto(parametros) || Object.keys(parametros).some(k => !Object.hasOwn(esquema, k))) return false;
  return Object.entries(esquema).every(([k, s]) => {
    const v = parametros[k];
    if (!Object.hasOwn(parametros, k)) return false;
    if (s.valores && !s.valores.includes(v)) return false;
    if (s.tipo === 'entero') return entero(v, s.minimo ?? -Infinity, s.maximo ?? Infinity);
    if (s.tipo === 'numero') return Number.isFinite(v) && v >= (s.minimo ?? -Infinity) && v <= (s.maximo ?? Infinity);
    if (s.tipo === 'cadena') return typeof v === 'string' && v.length >= (s.minimo ?? 0) && v.length <= (s.maximo ?? 200);
    if (s.tipo === 'booleano') return typeof v === 'boolean';
    return false;
  });
}
// Una propuesta individual: lista blanca, esquema exacto (sin campos extra ni faltantes), cooldown y puntos.
// Ante cualquier fallo la accion se reemplaza por `esperar` y se informa el motivo (politica determinista).
// `rivalesVivos`: ids de las facciones rivales vivas. Si se entrega, todo parametro `objetivo` de una accion debe ser uno de ellos:
// un objetivo inexistente, uno mismo o un eliminado es contenido invalido (infraccion) y NUNCA llega al puente.
export function validarAccion(accion, { acciones, turno = 1, cooldowns = {}, puntos = 3, usos = {}, rivalesVivos = null }) {
  const error = codigo => ({ ok: false, error: codigo, accion: copiar(ESPERAR) });
  if (!objeto(accion) || Object.keys(accion).sort().join(',') !== 'action,parameters') return error('esquema_invalido');
  const regla = acciones.find(a => a.nombre === accion.action);
  if (!regla) return error('accion_no_permitida');
  if (!validarEsquema(accion.parameters, regla.parametros)) return error('parametros_invalidos');
  if (rivalesVivos && Object.hasOwn(regla.parametros, 'objetivo') && !rivalesVivos.includes(accion.parameters.objetivo)) return error('objetivo_invalido');
  if ((cooldowns[regla.nombre] ?? 0) > turno) return error('cooldown');
  const motivo = restriccionIncumplida(regla, accion.parameters, turno, usos);
  if (motivo) return error(motivo);
  if (regla.puntos > puntos) return error('puntos_insuficientes');
  return { ok: true, accion: copiar(accion), regla: copiar(regla) };
}
// Restricciones del reglamento por accion: `desde_turno` (no antes de ese turno), `max_por_partida` (veces ejecutadas por
// faccion), `acumulado` (suma de un parametro entre ordenes ejecutadas, p. ej. unidades creadas) y `tope_grupo` (tope
// compartido por varias acciones, p. ej. los 10 poderes). `usos` = { <accion>: { veces, acumulado }, 'grupo:<g>': { veces } }.
export const claveGrupo = g => `grupo:${g}`;
export function restriccionIncumplida(regla, parametros, turno, usos = {}) {
  const uso = usos[regla.nombre] ?? {};
  if (regla.desde_turno !== undefined && turno < regla.desde_turno) return 'aun_no_disponible';
  if (regla.max_por_partida !== undefined && (uso.veces ?? 0) >= regla.max_por_partida) return 'limite_partida';
  if (regla.acumulado && (uso.acumulado ?? 0) + parametros[regla.acumulado.parametro] > regla.acumulado.maximo) return 'limite_partida';
  if (regla.tope_grupo && (usos[claveGrupo(regla.tope_grupo.grupo)]?.veces ?? 0) >= regla.tope_grupo.maximo) return 'limite_partida';
  return null;
}
// Anota una orden ACEPTADA en los contadores de uso. `veces` y el tope de grupo solo cuentan si fue EJECUTADA (`sin_efecto` no cuenta).
// `acumulado` con `efecto` (crear_unidades, todo o nada) descuenta lo que el PUENTE CONFIRMA en `efecto[<campo>]`, aunque el resultado
// sea sin_efecto; si la respuesta no lo trae cuenta 0 y se devuelve la anomalia. Con `efecto` omitido (planificacion de un bot) se
// supone creada la cantidad pedida. Sin `efecto` en la regla, `acumulado` suma el parametro pedido (solo si ejecutada).
// Devuelve la lista de anomalias detectadas ([] normalmente).
export function registrarUso(usos, regla, parametros, { ejecutada = true, efecto } = {}) {
  const uso = usos[regla.nombre] ??= { veces: 0, acumulado: 0 }, anomalias = [];
  if (ejecutada) {
    uso.veces++;
    if (regla.tope_grupo) (usos[claveGrupo(regla.tope_grupo.grupo)] ??= { veces: 0 }).veces++;
  }
  if (regla.acumulado?.efecto) {
    const campo = regla.acumulado.efecto, confirmado = efecto === undefined ? parametros[regla.acumulado.parametro] : efecto?.[campo];
    if (Number.isInteger(confirmado) && confirmado >= 0) uso.acumulado += confirmado;
    else if (ejecutada) anomalias.push({ accion: regla.nombre, tipo: `efecto_${campo}_ausente`, descontado: 0 });
  } else if (regla.acumulado && ejecutada) uso.acumulado += parametros[regla.acumulado.parametro];
  return anomalias;
}
// Lo que cada faccion puede ver de SUS limites: no depende del modelo, solo del reglamento y de lo que ya uso.
export function restriccionesVisibles(acciones, usos = {}) {
  const r = {};
  for (const a of acciones) {
    if (a.desde_turno === undefined && a.max_por_partida === undefined && !a.acumulado && !a.tope_grupo) continue;
    const uso = usos[a.nombre] ?? {};
    r[a.nombre] = {};
    if (a.desde_turno !== undefined) r[a.nombre].desde_turno = a.desde_turno;
    if (a.max_por_partida !== undefined) Object.assign(r[a.nombre], { usadas: uso.veces ?? 0, maximo: a.max_por_partida });
    if (a.acumulado) Object.assign(r[a.nombre], { acumulado: uso.acumulado ?? 0, maximo_acumulado: a.acumulado.maximo });
    if (a.tope_grupo) Object.assign(r[a.nombre], { grupo: a.tope_grupo.grupo, usadas_grupo: usos[claveGrupo(a.tope_grupo.grupo)]?.veces ?? 0, maximo_grupo: a.tope_grupo.maximo });
  }
  return r;
}
// El texto debe ser UN objeto JSON; se tolera unicamente que venga dentro de un bloque ``` completo.
function textoJson(raw) {
  const m = /^```(?:json)?[ \t]*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(raw.trim());
  return m ? m[1] : raw;
}
export function validarRespuesta(raw, { maxAcciones = 3 } = {}) {
  let valor;
  try { valor = typeof raw === 'string' ? JSON.parse(textoJson(raw)) : copiar(raw); } catch { return { ok: false, error: 'json_invalido', acciones: [copiar(ESPERAR)] }; }
  if (!objeto(valor) || Object.keys(valor).sort().join(',') !== 'actions,reasoning_summary' ||
      !Array.isArray(valor.actions) || valor.actions.length < 1 || valor.actions.length > maxAcciones ||
      typeof valor.reasoning_summary !== 'string' || valor.reasoning_summary.length > 240) {
    return { ok: false, error: 'respuesta_invalida', acciones: [copiar(ESPERAR)] };
  }
  return { ok: true, acciones: valor.actions, reasoning_summary: valor.reasoning_summary };
}
export function comprobarCatalogo(acciones) {
  exigir(acciones.some(a => a.nombre === 'esperar'), 'no_soportado');
}

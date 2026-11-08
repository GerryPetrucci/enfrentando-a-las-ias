import { createHash } from 'node:crypto';

export const PROTOCOLO = 1;
export const SEMILLA_MAX = 2147483647; // 0..2^31-1: el mismo rango que valida el puente C#
export const RULES_VERSION = 'auge-simulado-1.0.0';
export const BRIDGE_RULES_VERSION = 'puente-observacion-1.0.0';
// 1.1.0 (W6): puntos de accion separados del tope de acciones, reglamento del juego real, estado_orquestador, formula desde la tabla de pesos.
// 1.2.0 (X1): el texto describe la configuracion EFECTIVA del escenario (la que confirma el puente), la victoria por supervivencia y crear_unidades todo-o-nada con cupo segun lo creado.
export const PROMPT_VERSION = 'worldbox-1.2.0';
// Fallos de infraestructura (proveedor, red, tiempo): pierden la decision pero NO son una infraccion del modelo.
export const ERRORES_TECNICOS = new Set(['proveedor', '429', 'tiempo_agotado', 'circuito_abierto', 'conexion']);
// Identificadores de acciones y parametros: minusculas, digitos y guion bajo (superconjunto de lo que anuncia el puente C#).
// Sin doble guion bajo inicial: descarta `__proto__` y parecidos.
export const RE_NOMBRE = /^(?!__)[a-z_][a-z0-9_]{0,39}$/;
export const RE_CODIGO = /^[a-z0-9_]{1,60}$/;
export function canonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  if (valor && typeof valor === 'object') return `{${Object.keys(valor).sort().map(k => `${JSON.stringify(k)}:${canonico(valor[k])}`).join(',')}}`;
  return JSON.stringify(valor);
}
export const hash = valor => createHash('sha256').update(canonico(valor)).digest('hex');
export const copiar = valor => structuredClone(valor);
export const objeto = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export function exigir(condicion, codigo = 'solicitud_invalida') {
  if (!condicion) throw new ErrorArena(codigo);
}
export class ErrorArena extends Error {
  constructor(codigo) { super(codigo); this.name = 'ErrorArena'; this.codigo = codigo; }
}
export const normalizarError = e => e instanceof ErrorArena ? e : new ErrorArena('error_interno');
export function entero(n, min, max) { return Number.isInteger(n) && n >= min && n <= max; }
export async function conTiempo(fn, ms) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => fn(controller.signal)),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ErrorArena('tiempo_agotado')); }, ms); }),
    ]);
  } finally { clearTimeout(timer); }
}

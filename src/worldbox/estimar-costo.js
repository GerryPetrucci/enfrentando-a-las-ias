import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { leerTelemetria } from './telemetria.js';
import { accionesHabilitadas, CATALOGO } from './contrato-acciones.js';
import { construirPrompt } from './prompt.js';
import { PERFILES } from './reglas.js';
import { PROMPT_VERSION, entero, exigir } from './util.js';

// Estimacion de costo de una competencia con MODELOS REALES, calculada solo desde el log de una corrida con bots:
// reconstruye el prompt exacto que habria recibido cada decision y lo mide. NO llama a ninguna API ni lee .env.
// Los precios (USD por millon de tokens) los pone quien llama: este modulo no trae ni asume precios.
// Supuesto declarado: 3.5 bytes UTF-8 por token (texto en espanol sin acentos y JSON); el tokenizador real de cada modelo difiere.
export const BYTES_POR_TOKEN = 3.5;
export const SOBRECARGA_TOKENS = 60; // envoltura del chat por llamada
export const tokensDeTexto = texto => Math.ceil(Buffer.byteLength(texto, 'utf8') / BYTES_POR_TOKEN);
const promedio = v => v.reduce((s, x) => s + x, 0) / (v.length || 1);

// Mide las entradas (en tokens) de cada decision del log: { sistema, usuario } por decision, con el codigo vigente.
export function medirPrompts(eventos) {
  const inicio = eventos.find(e => e.tipo === 'inicio');
  exigir(inicio, 'log_sin_inicio');
  const c = inicio.config, perfil = PERFILES[c.reglas];
  exigir(perfil && c.prompt_version === PROMPT_VERSION, 'version_distinta');
  const acciones = accionesHabilitadas(c.adaptador, CATALOGO, perfil.acciones ? perfil : null);
  return eventos.filter(e => e.tipo === 'decision').map(d => {
    const p = construirPrompt({ observation: d.observation, acciones, maxAcciones: c.maxAcciones, puntosPorTurno: c.puntosPorTurno ?? c.maxAcciones, turnos: c.turnos, segundosPorTurno: c.segundosPorTurno ?? 1,
      turno: d.turn_number, orden: d.orden ?? [], perfil, rulesVersion: c.rules_version, restricciones: d.estado_orquestador?.restricciones, cooldownsPropios: d.estado_orquestador?.cooldowns, config: c.efectiva });
    return { turno: d.turn_number, sistema: tokensDeTexto(p.sistema), usuario: tokensDeTexto(p.usuario) + SOBRECARGA_TOKENS };
  });
}
// modelos: [{ modelo, entrada, salida, cacheLectura? }] en USD por millon. salidas: tokens de salida por llamada (escenarios).
// Una competencia = `turnos` decisiones por modelo (con `participantesPorModelo` asientos, normalmente 1).
export function estimarCosto(prompts, { modelos, salidas = [500, 2000, 6000], turnos = 24, participantesPorModelo = 1 }) {
  exigir(prompts.length > 0 && modelos.length > 0 && salidas.every(s => entero(s, 0, 1e7)) && entero(turnos, 1, 10000), 'estimacion_invalida');
  for (const m of modelos) exigir([m.entrada, m.salida].every(v => Number.isFinite(v) && v >= 0) && (m.cacheLectura === undefined || (Number.isFinite(m.cacheLectura) && m.cacheLectura >= 0)), 'estimacion_invalida');
  const sistema = Math.round(promedio(prompts.map(p => p.sistema))), usuario = Math.round(promedio(prompts.map(p => p.usuario)));
  const llamadas = turnos * participantesPorModelo;
  const filas = modelos.map(m => ({ modelo: m.modelo, escenarios: salidas.map(salida => {
    const sinCache = llamadas * ((sistema + usuario) * m.entrada + salida * m.salida) / 1e6;
    // Con cache de prefijo: la primera llamada paga el sistema completo; las demas lo leen al precio de lectura.
    const conCache = m.cacheLectura === undefined ? null : (llamadas * (usuario * m.entrada + salida * m.salida) + sistema * m.entrada + (llamadas - 1) * sistema * m.cacheLectura) / 1e6;
    return { salida_por_llamada: salida, costo_modelo_sin_cache: sinCache, costo_modelo_con_cache: conCache };
  }) }));
  const total = k => salidas.map((salida, i) => ({ salida_por_llamada: salida, total: filas.reduce((s, f) => s + (f.escenarios[i][k] ?? f.escenarios[i].costo_modelo_sin_cache), 0) }));
  return { supuestos: { bytes_por_token: BYTES_POR_TOKEN, sobrecarga_tokens: SOBRECARGA_TOKENS, llamadas_por_modelo: llamadas, sin_llamadas_extra: 'sin reintentos ni llamadas fallidas' },
    tokens_entrada_por_llamada: { sistema, usuario, total: sistema + usuario, max_usuario: Math.max(...prompts.map(p => p.usuario)) }, modelos: filas,
    total_competencia_sin_cache: total('costo_modelo_sin_cache'), total_competencia_con_cache: total('costo_modelo_con_cache') };
}
export async function estimarDesdeCarpeta(carpeta, opciones) {
  return estimarCosto(medirPrompts(await leerTelemetria(join(carpeta, 'eventos.jsonl'))), opciones);
}
// CLI: node src/worldbox/estimar-costo.js <carpeta> --modelo=id,entrada,salida[,cache] [--modelo=...] [--salidas=500,2000,6000] [--turnos=24]
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), carpeta = args.find(a => !a.startsWith('--'));
  try {
    exigir(carpeta, 'argumento_invalido');
    const modelos = args.filter(a => a.startsWith('--modelo=')).map(a => { const [modelo, entrada, salida, cache] = a.slice(9).split(','); return { modelo, entrada: Number(entrada), salida: Number(salida), ...(cache !== undefined ? { cacheLectura: Number(cache) } : {}) }; });
    const salidas = (args.find(a => a.startsWith('--salidas='))?.slice(10) ?? '500,2000,6000').split(',').map(Number);
    const turnos = Number(args.find(a => a.startsWith('--turnos='))?.slice(9) ?? 24);
    estimarDesdeCarpeta(resolve(carpeta), { modelos, salidas, turnos }).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(`WorldBox: ${e.codigo ?? 'error_interno'}`); process.exitCode = 1; });
  } catch (e) { console.error(`WorldBox: ${e.codigo ?? 'error_interno'}`); process.exitCode = 1; }
}

import { mkdir, appendFile, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { copiar, exigir, ErrorArena } from './util.js';

// Un evento `decision` por decision, con TODOS los campos de la seccion 8 del plan de trabajo.
export const CAMPOS_DECISION = ['competition_id', 'run_id', 'turn_number', 'participant_id', 'model_id', 'prompt_version', 'rules_version', 'observation_hash', 'observation', 'request_id', 'latency_ms', 'action_raw', 'action_validated', 'execution_result', 'input_tokens', 'output_tokens', 'cost', 'cost_source', 'score_delta', 'world_snapshot_ref', 'error_type', 'retry_count', 'timestamp'];
// Defensa adicional para textos devueltos por proveedores; nunca se registran headers/env.
export function sanear(valor) {
  if (typeof valor === 'string') return valor.replace(/\bsk-[A-Za-z0-9_-]+/g, '[REDACTADO]').replace(/Bearer\s+\S+/gi, 'Bearer [REDACTADO]');
  if (Array.isArray(valor)) return valor.map(sanear);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).filter(([k]) => !/^(authorization|api[_-]?key|token|x-puente-token)$/i.test(k)).map(([k, v]) => [k, sanear(v)]));
  return valor;
}
const numero = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
// Un registro incompleto o con tipos imposibles no se escribe: el log es la fuente de verdad del reporte.
export function validarDecision(e) {
  exigir(CAMPOS_DECISION.every(k => Object.hasOwn(e, k)), 'telemetria_incompleta');
  exigir(Number.isInteger(e.turn_number) && e.turn_number >= 1 && typeof e.participant_id === 'string' && typeof e.model_id === 'string', 'telemetria_invalida');
  exigir(numero(e.latency_ms) && Number.isInteger(e.input_tokens) && e.input_tokens >= 0 && Number.isInteger(e.output_tokens) && e.output_tokens >= 0 && numero(e.cost) && Number.isInteger(e.retry_count) && e.retry_count >= 0, 'telemetria_invalida');
  exigir(['reportado', 'estimado'].includes(e.cost_source) && Array.isArray(e.action_validated) && Array.isArray(e.execution_result) && typeof e.action_raw === 'string', 'telemetria_invalida');
  exigir(Number.isFinite(e.score_delta) && typeof e.timestamp === 'string' && !Number.isNaN(Date.parse(e.timestamp)), 'telemetria_invalida');
}
export async function crearTelemetria(archivo = null) {
  const eventos = [];
  // 'wx': nunca se sobreescribe un log existente.
  if (archivo) { await mkdir(dirname(archivo), { recursive: true }); await writeFile(archivo, '', { flag: 'wx' }); }
  return {
    eventos,
    async registrar(evento) {
      if (evento.tipo === 'decision') validarDecision(evento);
      const limpio = sanear(copiar(evento));
      if (archivo) await appendFile(archivo, `${JSON.stringify(limpio)}\n`, 'utf8');
      eventos.push(limpio);
    },
  };
}
export async function leerTelemetria(archivo) {
  const lineas = (await readFile(archivo, 'utf8')).split('\n').filter(Boolean);
  return lineas.map(linea => { try { return JSON.parse(linea); } catch { throw new ErrorArena('registro_corrupto'); } });
}

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sanear } from '../telemetria.js';
import { csv } from '../reporte.js';
import { eficiencia } from '../puntuacion.js';
import { hash } from '../util.js';
import { clasificarEra } from './reglas-era.js';

// Reporte del formato «era»: se RECONSTRUYE solo desde el log (eventos.jsonl), como el de las demás partidas. Fuente de verdad: el log.
export function reconstruirReporteEra(eventos) {
  const inicio = eventos.find(e => e.tipo === 'inicio'), fin = eventos.find(e => e.tipo === 'fin');
  const decisiones = eventos.filter(e => e.tipo === 'decision'), anios = eventos.filter(e => e.tipo === 'anio');
  const participantes = inicio?.participantes ?? [...new Set(decisiones.map(d => d.participant_id))].map(id => ({ id, modelo: decisiones.find(d => d.participant_id === id).model_id }));
  const suma = (lista, k) => Math.round(lista.reduce((s, x) => s + (x[k] ?? 0), 0) * 1e9) / 1e9;
  const ultimaSerie = anios.at(-1);
  const snapshot = fin?.snapshot ?? ultimaSerie?.civilizaciones ?? inicio?.snapshot ?? [];
  const infracciones = fin?.infracciones ?? {};
  const filas = snapshot.map(c => ({ ...c, participant_id: c.id }));
  const clasif = fin ? clasificarEra(snapshot, infracciones) : filas.length ? clasificarEra(snapshot, infracciones) : [];
  const porId = Object.fromEntries(clasif.map(c => [c.participant_id, c]));
  const modelos = participantes.map(p => {
    const d = decisiones.filter(x => x.participant_id === p.id), llamadas = new Set(d.map(x => x.turn_number)).size;
    const costo = suma(d, 'cost'), puntos = porId[p.id]?.puntos ?? null;
    const aplicados = eventos.filter(e => e.tipo === 'rasgos_aplicados' && e.participant_id === p.id).flatMap(e => e.aplicados);
    const rechazados = eventos.filter(e => e.tipo === 'rasgos_aplicados' && e.participant_id === p.id).flatMap(e => e.rechazados.map(r => `${r.id}:${r.codigo}`));
    return { participant_id: p.id, model_id: p.modelo, raza: fin?.elecciones?.[p.id]?.raza ?? p.raza ?? null, mineral: fin?.elecciones?.[p.id]?.mineral ?? null, bioma: fin?.elecciones?.[p.id]?.bioma ?? null,
      rasgos: fin?.elecciones?.[p.id]?.rasgos ?? {}, rasgos_aplicados: aplicados, rasgos_rechazados: rechazados, extras: fin?.elecciones?.[p.id]?.extras ?? [],
      llamadas, intentos: d.length, correcciones: d.filter(x => x.correccion).length, fallos_tecnicos: d.filter(x => ['proveedor', '429', 'tiempo_agotado', 'circuito_abierto', 'conexion'].includes(x.error_type)).length,
      infracciones: infracciones[p.id] ?? 0, input_tokens: suma(d, 'input_tokens'), output_tokens: suma(d, 'output_tokens'), costo, puntos, puesto: porId[p.id]?.puesto ?? null, vivo: porId[p.id]?.vivo ?? null,
      puntos_por_dolar: puntos === null ? null : eficiencia(puntos, costo) };
  });
  return {
    version: 1, formato: 'era', rules_version: inicio?.config?.rules_version ?? null, prompt_version: inicio?.config?.prompt_version ?? null, competition_id: inicio?.competition_id ?? null, run_id: inicio?.run_id ?? null,
    origen: inicio?.origen ?? null, determinista: inicio?.determinista ?? null, completo: fin?.completo ?? false, razon: fin?.razon ?? 'registro_interrumpido', anio_final: fin?.anio ?? ultimaSerie?.anio ?? 0, ganador: fin?.ganador ?? null,
    config: inicio?.config ? { partida: inicio.config.partida, calendario: inicio.config.calendario, catalogo_version: inicio.config.catalogo_version, catalogo_hash: inicio.config.catalogo_hash, sistema_hash: inicio.config.sistema_hash, presupuesto_puntos: inicio.config.presupuesto_puntos, acciones_reales: inicio.config.acciones_reales } : null,
    escenario: inicio?.escenario ?? null, ranking: clasif.map(c => ({ puesto: c.puesto, participant_id: c.participant_id, model_id: participantes.find(p => p.id === c.participant_id)?.modelo ?? null, puntos: c.puntos, vivo: c.vivo, poblacion: c.poblacion, ciudades: c.ciudades, territorio: c.territorio, edificios: c.edificios, ejercito: c.ejercito })),
    modelos, serie_anual: anios.map(a => ({ anio: a.anio, ...Object.fromEntries((a.civilizaciones ?? []).flatMap(c => [[`${c.id}_poblacion`, c.poblacion], [`${c.id}_ciudades`, c.ciudades], [`${c.id}_ejercito`, c.ejercito]])), muro: a.muro, velocidad: a.velocidad })),
    llamadas: decisiones.map(d => ({ llamada: d.turn_number, participant_id: d.participant_id, model_id: d.model_id, tipo: d.llamada?.tipo ?? null, fase: d.llamada?.fase ?? null, anio: d.anio, intento: d.intento, correccion: d.correccion === true, error_type: d.error_type, errores: (d.errores ?? []).map(e => e.codigo).join('|'), latency_ms: d.latency_ms, input_tokens: d.input_tokens, output_tokens: d.output_tokens, cost: d.cost })),
    consumo: fin?.consumo ?? { costo: suma(decisiones, 'cost'), tokens: suma(decisiones, 'input_tokens') + suma(decisiones, 'output_tokens') }, anomalias: fin?.anomalias ?? [],
    hash_final: hash(snapshot),
  };
}
export const COLUMNAS_ERA = {
  ranking: ['puesto', 'participant_id', 'model_id', 'puntos', 'vivo', 'poblacion', 'ciudades', 'territorio', 'edificios', 'ejercito'],
  modelos: ['participant_id', 'model_id', 'raza', 'mineral', 'bioma', 'llamadas', 'intentos', 'correcciones', 'fallos_tecnicos', 'infracciones', 'input_tokens', 'output_tokens', 'costo', 'puntos', 'puesto', 'puntos_por_dolar'],
  llamadas: ['llamada', 'participant_id', 'model_id', 'tipo', 'fase', 'anio', 'intento', 'correccion', 'error_type', 'errores', 'latency_ms', 'input_tokens', 'output_tokens', 'cost'],
  serie: null,
};
export async function escribirReporteEra(reporte, carpeta) {
  await mkdir(carpeta, { recursive: true });
  await writeFile(join(carpeta, 'reporte.json'), JSON.stringify(sanear(reporte), null, 2) + '\n');
  await writeFile(join(carpeta, 'ranking.csv'), csv(reporte.ranking, COLUMNAS_ERA.ranking));
  await writeFile(join(carpeta, 'modelos.csv'), csv(reporte.modelos, COLUMNAS_ERA.modelos));
  await writeFile(join(carpeta, 'llamadas.csv'), csv(reporte.llamadas, COLUMNAS_ERA.llamadas));
  const columnas = reporte.serie_anual.length ? Object.keys(reporte.serie_anual[0]) : ['anio'];
  await writeFile(join(carpeta, 'serie-anual.csv'), csv(reporte.serie_anual, columnas));
}

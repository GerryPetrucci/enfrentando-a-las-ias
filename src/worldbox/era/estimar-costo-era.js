import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { leerTelemetria } from '../telemetria.js';
import { construirSistemaEra, construirUsuarioEra } from './prompt-era.js';

// Costo de una partida era con modelos reales SIN llamar a ninguna API: reconstruye el prompt exacto de cada llamada del log de una corrida con bots
// (texto de sistema + usuario), lo mide (3,5 bytes por token, supuesto declarado) y lo multiplica por los precios en USD por millón que se pasan.
// Uso: node src/worldbox/era/estimar-costo-era.js <carpeta> --modelo=id,entrada,salida[,cache] [--salidas=500,2000,6000,16000] [--correcciones=0.2]
export const BYTES_POR_TOKEN = 3.5;
export function estimarCostoEra(eventos, { modelo, salidas = [500, 2000, 6000, 16000], correcciones = 0 } = {}) {
  const inicio = eventos.find(e => e.tipo === 'inicio');
  if (!inicio) throw new Error('el log no tiene inicio');
  const sistema = construirSistemaEra(inicio.config.partida);
  const tokens = texto => Math.ceil(Buffer.byteLength(texto, 'utf8') / BYTES_POR_TOKEN);
  const decisiones = eventos.filter(e => e.tipo === 'decision' && !e.correccion && e.participant_id === inicio.participantes[0].id);
  const filas = decisiones.map(d => ({ llamada: d.turn_number, tipo: d.llamada.tipo, entrada: tokens(sistema) + tokens(construirUsuarioEra({ ...d.observation, correccion: null })), sistema: tokens(sistema) }));
  // Si la partida de bots termino antes (una eliminacion), se extrapola con el promedio de las llamadas vistas hasta las que fija el calendario.
  const llamadas = inicio.config.llamadas, media = f => filas.reduce((s, x) => s + x[f], 0) / filas.length;
  const entradaTotal = Math.round(media('entrada') * llamadas), cacheable = Math.round(media('sistema') * llamadas);
  const p = modelo ?? { entrada: 0, salida: 0 };
  const costoEntrada = entradaTotal * p.entrada / 1e6, extra = 1 + correcciones;
  return { llamadas, llamadas_observadas: filas.length, entrada_por_llamada: filas.map(f => f.entrada), entrada_total_tokens: entradaTotal, entrada_cacheable_tokens: cacheable, correcciones_supuestas: correcciones,
    por_salida: salidas.map(s => {
      const cacheEntrada = p.cache === undefined ? null : ((entradaTotal - cacheable) * p.entrada + cacheable * p.cache) / 1e6 * extra;
      return { salida_por_llamada: s, costo_por_modelo: round((costoEntrada + llamadas * s * p.salida / 1e6) * extra), costo_por_modelo_con_cache: cacheEntrada === null ? null : round(cacheEntrada + llamadas * s * p.salida / 1e6 * extra) };
    }) };
}
const round = n => Math.round(n * 1e5) / 1e5;
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(3).map(a => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, true]; }));
  const [id, entrada, salida, cache] = String(args.modelo ?? '').split(',');
  const modelo = { entrada: Number(entrada), salida: Number(salida), ...(cache !== undefined ? { cache: Number(cache) } : {}) };
  leerTelemetria(join(resolve(process.argv[2] ?? '.'), 'eventos.jsonl')).then(ev => console.log(JSON.stringify({ modelo: id, ...estimarCostoEra(ev, { modelo, salidas: args.salidas?.split(',').map(Number), correcciones: Number(args.correcciones ?? 0) }) }, null, 2)))
    .catch(e => { console.error(`estimar-costo-era: ${e.message}`); process.exitCode = 1; });
}

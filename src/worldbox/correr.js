import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { crearAdaptadorSimulado } from './adaptador-simulado.js';
import { crearAdaptadorHttp } from './adaptador-http.js';
import { crearBot, BOTS } from './bots.js';
import { crearPasarela, llamarReal } from './pasarela.js';
import { correrCompetencia, validarConfig, resolverConfig } from './orquestador.js';
import { PERFILES, NOMBRES_PERFIL } from './reglas.js';
import { crearTelemetria } from './telemetria.js';
import { escribirReporte } from './reporte.js';
import { entero, exigir } from './util.js';

const PERMITIDAS = new Set(['adaptador', 'reglas', 'participantes', 'modelos', 'modo', 'semilla', 'turnos', 'presupuesto', 'presupuesto-modelo', 'partidas', 'salida', 'acciones', 'puntos-turno', 'segundos-turno', 'mapa', 'velocidad', 'plantilla', 'unidades-iniciales', 'especie', 'umbral-sitio', 'intentos-mapa',
  'max-tokens', 'tiempo-ms', 'timeout-ms', 'timeout-puente-ms', 'tarifa-entrada', 'tarifa-salida']);
const NUMERICAS = ['semilla', 'turnos', 'presupuesto', 'presupuesto-modelo', 'acciones', 'puntos-turno', 'segundos-turno', 'mapa', 'unidades-iniciales', 'umbral-sitio', 'intentos-mapa', 'max-tokens', 'tiempo-ms', 'timeout-ms', 'timeout-puente-ms', 'tarifa-entrada', 'tarifa-salida'];
export function opcionesCli(args) {
  const opciones = {};
  for (const arg of args) {
    const m = /^--([^=]+)=(.+)$/.exec(arg);
    exigir(m && PERMITIDAS.has(m[1]) && !Object.hasOwn(opciones, m[1]), 'argumento_invalido'); opciones[m[1]] = m[2];
  }
  // Los modelos reales exigen la bandera de pago EXPLICITA, tambien los gratuitos. Sin ella no se importa el cliente.
  exigir(!opciones.modo || ['gratis', 'pago'].includes(opciones.modo), 'argumento_invalido');
  exigir(!opciones.modelos || opciones.modo === 'pago', 'pago_no_autorizado');
  exigir(!opciones.modelos || !opciones.participantes, 'participantes_ambiguos');
  exigir(['simulado', 'http'].includes(opciones.adaptador ?? 'simulado'), 'adaptador_invalido');
  exigir(opciones.reglas === undefined || NOMBRES_PERFIL.includes(opciones.reglas), 'argumento_invalido');
  for (const k of NUMERICAS) exigir(opciones[k] === undefined || (opciones[k].trim() !== '' && Number.isFinite(Number(opciones[k]))), 'argumento_invalido');
  exigir(opciones.especie === undefined || /^[a-z_]{1,20}$/.test(opciones.especie), 'argumento_invalido');
  exigir(opciones.velocidad === undefined || /^[a-z0-9_]{1,10}$/.test(opciones.velocidad), 'argumento_invalido');
  exigir(opciones.plantilla === undefined || /^[a-z0-9_]{1,30}$/.test(opciones.plantilla), 'argumento_invalido');
  const partidas = Number(opciones.partidas ?? 1);
  exigir(entero(partidas, 1, 100), 'partidas_invalidas');
  return { ...opciones, partidas };
}
// Lee del .env SOLO las variables WORLDBOX_* que falten (nunca llaves de proveedores) y solo cuando la ejecucion las necesita.
export async function cargarVariablesWorldbox(env = process.env, ruta = '.env') {
  let texto;
  try { texto = await readFile(ruta, 'utf8'); } catch { return; }
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*(WORLDBOX_[A-Z_]+)\s*=\s*(.*?)\s*$/.exec(linea);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
// `deps` permite inyectar la llamada al modelo y el entorno en pruebas; en uso normal queda vacio.
export async function main(args = process.argv.slice(2), deps = {}) {
  const o = opcionesCli(args), modelos = o.modelos?.split(','), env = deps.env ?? process.env;
  if (o.adaptador === 'http' || modelos) await cargarVariablesWorldbox(env, deps.envRuta ?? '.env');
  const nombres = modelos ?? (o.participantes ?? 'bot-voraz,bot-aleatorio').split(',');
  exigir(entero(nombres.length, 2, 4) && nombres.every(n => modelos ? /^[\w./:-]+$/.test(n) : BOTS.includes(n)), 'participantes_invalidos');
  const presupuesto = Number(o.presupuesto ?? env.WORLDBOX_PRESUPUESTO_USD ?? 0);
  exigir(Number.isFinite(presupuesto) && presupuesto >= 0);
  const tarifas = Object.fromEntries(nombres.map(n => [n, { entrada: Number(o['tarifa-entrada']), salida: Number(o['tarifa-salida']) }]));
  if (modelos) exigir(presupuesto > 0 && Object.values(tarifas).every(t => [t.entrada, t.salida].every(v => Number.isFinite(v) && v >= 0)), 'presupuesto_y_tarifas_requeridos');
  const salida = resolve(o.salida ?? 'data/pruebas/worldbox');
  const competitionId = randomUUID();
  // Reglamento: el del juego real por omision con el puente HTTP, el del simulador en los demas casos. Lo que no se pasa por
  // argumento sale del perfil (turnos, segundos por turno, puntos, mapa, velocidad, especie...); lo pasado manda.
  const reglas = o.reglas ?? (o.adaptador === 'http' ? 'real' : 'simulado'), perfil = PERFILES[reglas];
  const pasarela = modelos ? crearPasarela({ modo: o.modo, llamar: deps.llamar ?? llamarReal, presupuesto, presupuestoModelo: Number(o['presupuesto-modelo'] ?? presupuesto / nombres.length), tarifas, timeoutMs: Number(o['timeout-ms'] ?? perfil.partida.timeoutMs), limitador: deps.limitador }) : null;
  const numero = k => o[k] === undefined ? undefined : Number(o[k]);
  const opcionesEscenario = Object.fromEntries(Object.entries({ velocidad: o.velocidad, plantilla: o.plantilla, unidades_iniciales: numero('unidades-iniciales') }).filter(([, v]) => v !== undefined));
  const reportes = [];
  for (let partida = 0; partida < o.partidas; partida++) {
    const semilla = Number(o.semilla ?? 1); // Misma semilla en todas las partidas; solo rota el orden de actuacion.
    const participantes = nombres.map((modelo, i) => ({ id: `f${i + 1}`, modelo, ...(modelos ? {} : { decidir: crearBot(modelo, semilla + i) }) }));
    const adaptador = o.adaptador === 'http' ? crearAdaptadorHttp({ url: env.WORLDBOX_PUENTE_URL, token: env.WORLDBOX_PUENTE_TOKEN, timeoutMs: Number(o['timeout-puente-ms'] ?? (reglas === 'real' ? 60000 : 5000)) }) : crearAdaptadorSimulado();
    const config = { adaptador, participantes, pasarela, reglas, semilla, turnos: numero('turnos'), maxAcciones: numero('acciones'), puntosPorTurno: numero('puntos-turno'), segundosPorTurno: numero('segundos-turno'), tamanoMapa: numero('mapa'), umbralSitio: numero('umbral-sitio'), intentosMapa: numero('intentos-mapa'),
      opcionesEscenario, especie: o.especie, presupuesto, maxTokens: Number(o['max-tokens'] ?? 1_000_000), maxTiempoMs: numero('tiempo-ms'), timeoutMs: numero('timeout-ms'), indicePartida: partida, competitionId };
    validarConfig(resolverConfig(config, perfil)); // antes de crear nada en disco
    const carpeta = join(salida, `${competitionId}-${partida + 1}`);
    const telemetria = await crearTelemetria(join(carpeta, 'eventos.jsonl'));
    let reporte;
    try { ({ reporte } = await correrCompetencia({ ...config, telemetria })); }
    catch (e) { if (telemetria.eventos.length === 0) await rm(carpeta, { recursive: true, force: true }); throw e; } // un arranque fallido no deja carpeta vacia
    await escribirReporte(reporte, carpeta);
    reportes.push({ carpeta, reglas: reporte.reglas, rules_version: reporte.config.rules_version, origen: reporte.origen, determinista: reporte.determinista, completo: reporte.completo, razon: reporte.razon, turnos: reporte.turnos, hash_final: reporte.hash_final,
      ranking: reporte.ranking.map(f => ({ participante: f.participant_id, modelo: f.model_id, puesto: f.puesto, puntos: f.puntos, costo: f.costo })) });
    if (!reporte.completo) break;
  }
  return reportes;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(`WorldBox: ${e.codigo ?? 'error_interno'}`); process.exitCode = 1; });
}

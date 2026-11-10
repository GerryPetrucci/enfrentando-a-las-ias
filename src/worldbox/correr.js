import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { crearAdaptadorSimulado } from './adaptador-simulado.js';
import { crearAdaptadorHttp } from './adaptador-http.js';
import { crearBot, BOTS } from './bots.js';
import { crearPasarela, llamarReal } from './pasarela.js';
import { correrCompetencia, validarConfig, resolverConfig } from './orquestador.js';
import { PERFILES, NOMBRES_PERFIL } from './reglas.js';
import { crearTelemetria } from './telemetria.js';
import { escribirReporte } from './reporte.js';
import { entero, exigir } from './util.js';
import { crearEstadoVivo } from './vivo.js';
import { correrEraCli, OPCIONES_ERA, NUMERICAS_ERA, BOOLEANAS_ERA, SOLO_GRABACION_ERA } from './era/correr-era.js';
import { BOTS_ERA } from './era/bots-era.js';

const PERMITIDAS = new Set(['adaptador', 'reglas', 'participantes', 'modelos', 'modo', 'semilla', 'turnos', 'presupuesto', 'presupuesto-modelo', 'partidas', 'salida', 'acciones', 'puntos-turno', 'segundos-turno', 'mapa', 'velocidad', 'plantilla', 'unidades-iniciales', 'especie', 'umbral-sitio', 'intentos-mapa',
  'max-tokens', 'tiempo-ms', 'timeout-ms', 'timeout-puente-ms', 'tarifa-entrada', 'tarifa-salida', 'grabacion', 'manual', 'cuenta', 'aviso-ms', 'lectura-ms', 'fin-ms', 'zoom', 'zoom-cerca', 'zoom-medio', 'zoom-lejos', 'vivo', ...OPCIONES_ERA]);
// Modo grabacion (docs/worldbox-grabacion.md): `--grabacion` va sin valor; el resto de sus opciones solo valen con ella.
const BOOLEANAS = new Set(['grabacion', 'manual', 'sin-renovar-guerra', ...BOOLEANAS_ERA]), SOLO_GRABACION = ['manual', 'cuenta', 'aviso-ms', 'lectura-ms', 'fin-ms', 'zoom', 'zoom-cerca', 'zoom-medio', 'zoom-lejos', 'vivo', ...SOLO_GRABACION_ERA];
// Zoom del juego: 10 (muy cerca) a 211 (todo el mapa). Por fase: cerca sobre quien decide, medio mientras avanza el turno, lejos al preparar y en la tarjeta final.
export const ZOOM_POR_OMISION = Object.freeze({ cerca: 60, medio: 110, lejos: 211 });
const NUMERICAS = ['semilla', 'turnos', 'presupuesto', 'presupuesto-modelo', 'acciones', 'puntos-turno', 'segundos-turno', 'mapa', 'unidades-iniciales', 'umbral-sitio', 'intentos-mapa', 'max-tokens', 'tiempo-ms', 'timeout-ms', 'timeout-puente-ms', 'tarifa-entrada', 'tarifa-salida', 'cuenta', 'aviso-ms', 'lectura-ms', 'fin-ms', 'zoom', 'zoom-cerca', 'zoom-medio', 'zoom-lejos', ...NUMERICAS_ERA];
export function opcionesCli(args) {
  const opciones = {};
  for (const arg of args) {
    const bandera = /^--([^=]+)$/.exec(arg)?.[1];
    if (bandera && BOOLEANAS.has(bandera)) { exigir(!Object.hasOwn(opciones, bandera), 'argumento_invalido'); opciones[bandera] = true; continue; }
    const m = /^--([^=]+)=(.+)$/.exec(arg);
    exigir(m && PERMITIDAS.has(m[1]) && !BOOLEANAS.has(m[1]) && !Object.hasOwn(opciones, m[1]), 'argumento_invalido'); opciones[m[1]] = m[2];
  }
  // Los modelos reales exigen la bandera de pago EXPLICITA, tambien los gratuitos. Sin ella no se importa el cliente.
  exigir(!opciones.modo || ['gratis', 'pago'].includes(opciones.modo), 'argumento_invalido');
  exigir(!opciones.modelos || opciones.modo === 'pago', 'pago_no_autorizado');
  exigir(!opciones.modelos || !opciones.participantes, 'participantes_ambiguos');
  exigir(['simulado', 'http'].includes(opciones.adaptador ?? 'simulado'), 'adaptador_invalido');
  exigir(opciones.reglas === undefined || NOMBRES_PERFIL.includes(opciones.reglas), 'argumento_invalido');
  // Formato era (docs/worldbox-era.md): sus opciones solo valen con --formato=era, que no admite los parametros por turno de las demas reglas (--manual si: un Enter por decision).
  exigir(opciones.formato === undefined || opciones.formato === 'era', 'argumento_invalido');
  exigir(opciones.formato === 'era' || OPCIONES_ERA.every(k => k === 'formato' || opciones[k] === undefined), 'argumento_invalido');
  exigir(opciones.formato !== 'era' || (opciones.reglas === undefined && ['turnos', 'acciones', 'puntos-turno', 'segundos-turno', 'velocidad', 'especie', 'umbral-sitio', 'intentos-mapa'].every(k => opciones[k] === undefined)), 'argumento_invalido');
  // Respuestas pegadas a mano: no se mezclan con participantes ni modelos; --asistido y las opciones de participante solo valen con --respuestas.
  exigir(opciones.respuestas === undefined || (opciones.formato === 'era' && !opciones.participantes && !opciones.modelos), 'argumento_invalido');
  exigir(opciones.respuestas !== undefined || ['asistido', 'modelo-a', 'modelo-b', 'nombre-a', 'nombre-b', 'canal', 'ignorar-invalidas', 'prompt-completo'].every(k => opciones[k] === undefined), 'argumento_invalido');
  for (const k of ['modelo-a', 'modelo-b']) exigir(opciones[k] === undefined || /^[\w./:-]{1,60}$/.test(opciones[k]), 'argumento_invalido');
  for (const k of NUMERICAS) exigir(opciones[k] === undefined || (opciones[k].trim() !== '' && Number.isFinite(Number(opciones[k]))), 'argumento_invalido');
  exigir(opciones.especie === undefined || /^[a-z_]{1,20}$/.test(opciones.especie), 'argumento_invalido');
  exigir(opciones.velocidad === undefined || /^[a-z0-9_]{1,10}$/.test(opciones.velocidad), 'argumento_invalido');
  exigir(opciones.plantilla === undefined || /^[a-z0-9_]{1,30}$/.test(opciones.plantilla), 'argumento_invalido');
  exigir(opciones.grabacion === true || SOLO_GRABACION.every(k => opciones[k] === undefined), 'argumento_invalido');
  exigir(opciones.cuenta === undefined || entero(Number(opciones.cuenta), 0, 600), 'argumento_invalido');
  exigir(opciones['aviso-ms'] === undefined || entero(Number(opciones['aviso-ms']), 0, 60000), 'argumento_invalido');
  exigir(opciones['lectura-ms'] === undefined || entero(Number(opciones['lectura-ms']), 0, 60000), 'argumento_invalido');
  exigir(opciones['fin-ms'] === undefined || entero(Number(opciones['fin-ms']), 0, 120000), 'argumento_invalido');
  for (const k of ['zoom-cerca', 'zoom-medio', 'zoom-lejos']) exigir(opciones[k] === undefined || (Number(opciones[k]) >= 10 && Number(opciones[k]) <= 211), 'argumento_invalido');
  exigir(opciones.zoom === undefined || (Number(opciones.zoom) >= 1 && Number(opciones.zoom) <= 1000), 'argumento_invalido');
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
// Cuenta atras del modo grabacion: avisa por la salida de error (la salida estandar es el JSON final) y espera un segundo por numero.
export async function cuentaAtras(segundos, deps = {}) {
  const avisar = deps.avisar ?? (t => console.error(t)), dormir = deps.dormir ?? (ms => new Promise(r => setTimeout(r, ms)));
  avisar('Listo para grabar: pulsa grabar en OBS');
  for (let i = segundos; i > 0; i--) { avisar(`La partida empieza en ${i}...`); await dormir(1000); }
  avisar('Empieza la partida.');
}
// Espera de Enter del modo manual. Cada llamada a esperar() resuelve con la SIGUIENTE linea (un Enter pulsado antes de tiempo se descarta,
// para no saltarse una decision sin querer); si la entrada se cierra, ya no espera mas. cerrar() suelta la consola.
export function crearEsperaEnter(entrada) {
  const rl = createInterface({ input: entrada, terminal: false }), esperando = [];
  let cerrado = false;
  rl.on('line', () => esperando.shift()?.());
  rl.on('close', () => { cerrado = true; while (esperando.length) esperando.shift()(); });
  return { esperar: () => cerrado ? Promise.resolve() : new Promise(r => esperando.push(r)), cerrar: () => rl.close() };
}
// `deps` permite inyectar la llamada al modelo y el entorno en pruebas; en uso normal queda vacio.
// AAAAMMDD-HHMM en hora LOCAL (el nombre de la carpeta de una partida con respuestas pegadas a mano).
const fechaLocal = (d = new Date()) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
export async function main(args = process.argv.slice(2), deps = {}) {
  const o = opcionesCli(args), modelos = o.modelos?.split(','), env = deps.env ?? process.env;
  if (o.adaptador === 'http' || modelos) await cargarVariablesWorldbox(env, deps.envRuta ?? '.env');
  const nombres = modelos ?? (o.participantes ?? (o.formato === 'era' ? 'bot-era-militar,bot-era-economico' : 'bot-voraz,bot-aleatorio')).split(',');
  exigir(o.formato === 'era' ? nombres.length === 2 : entero(nombres.length, 2, 4), 'participantes_invalidos');
  exigir(o.respuestas !== undefined || nombres.every(n => modelos ? /^[\w./:-]+$/.test(n) : (o.formato === 'era' ? BOTS_ERA : BOTS).includes(n)), 'participantes_invalidos');
  const presupuesto = Number(o.presupuesto ?? env.WORLDBOX_PRESUPUESTO_USD ?? 0);
  exigir(Number.isFinite(presupuesto) && presupuesto >= 0);
  const tarifas = Object.fromEntries(nombres.map(n => [n, { entrada: Number(o['tarifa-entrada']), salida: Number(o['tarifa-salida']) }]));
  if (modelos) exigir(presupuesto > 0 && Object.values(tarifas).every(t => [t.entrada, t.salida].every(v => Number.isFinite(v) && v >= 0)), 'presupuesto_y_tarifas_requeridos');
  // Con respuestas pegadas a mano la partida y su evidencia van a data/era/partidas/ (ignorada por git), con la fecha en el nombre; las demas, como siempre.
  const salida = resolve(o.salida ?? (o.respuestas !== undefined ? 'data/era/partidas' : 'data/pruebas/worldbox'));
  const competitionId = o.respuestas !== undefined ? `${fechaLocal()}-${randomUUID().slice(0, 8)}` : randomUUID();
  // Reglamento: el del juego real por omision con el puente HTTP, el del simulador en los demas casos. Lo que no se pasa por
  // argumento sale del perfil (turnos, segundos por turno, puntos, mapa, velocidad, especie...); lo pasado manda.
  if (o.formato === 'era') {
    exigir(o.partidas === 1, 'partidas_invalidas'); // una sola partida era por corrida
    return correrEraCli({ o, env, deps, nombres, modelos, presupuesto, tarifas, salida, competitionId, zoomPorOmision: ZOOM_POR_OMISION, cuentaAtras });
  }
  const reglas = o.reglas ?? (o.adaptador === 'http' ? 'real' : 'simulado'), perfil = PERFILES[reglas];
  const pasarela = modelos ? crearPasarela({ modo: o.modo, llamar: deps.llamar ?? llamarReal, presupuesto, presupuestoModelo: Number(o['presupuesto-modelo'] ?? presupuesto / nombres.length), tarifas, timeoutMs: Number(o['timeout-ms'] ?? perfil.partida.timeoutMs), limitador: deps.limitador }) : null;
  const numero = k => o[k] === undefined ? undefined : Number(o[k]);
  // Grabacion: ritmo de VIDEO. Velocidad x1 salvo que se pida otra; es presentacion, el reglamento y la puntuacion son los mismos.
  const grabacion = o.grabacion === true, velocidad = o.velocidad ?? (grabacion ? 'x1' : undefined);
  const opcionesEscenario = Object.fromEntries(Object.entries({ velocidad, plantilla: o.plantilla, unidades_iniciales: numero('unidades-iniciales') }).filter(([, v]) => v !== undefined));
  const reportes = []; let lector = null;
  for (let partida = 0; partida < o.partidas; partida++) {
    const semilla = Number(o.semilla ?? 1); // Misma semilla en todas las partidas; solo rota el orden de actuacion.
    const participantes = nombres.map((modelo, i) => ({ id: `f${i + 1}`, modelo, ...(modelos ? {} : { decidir: crearBot(modelo, semilla + i) }) }));
    // A x1 un turno dura de verdad lo que dura en juego: avanzar necesita mas plazo que a x10 (segundos reales + 60 s de margen, tope del cliente 120 s).
    const factor = Number(/^x(\d+)$/.exec(velocidad ?? perfil.partida.velocidad ?? '')?.[1] ?? 1) || 1;
    const avanceMs = grabacion ? Math.min(120000, Math.ceil((numero('segundos-turno') ?? perfil.partida.segundosPorTurno) / factor) * 1000 + 60000) : undefined;
    const adaptador = o.adaptador === 'http' ? crearAdaptadorHttp({ url: env.WORLDBOX_PUENTE_URL, token: env.WORLDBOX_PUENTE_TOKEN, timeoutMs: Number(o['timeout-puente-ms'] ?? (reglas === 'real' ? Math.max(60000, avanceMs ?? 0) : 5000)) }) : crearAdaptadorSimulado();
    const config = { adaptador, participantes, pasarela, reglas, semilla, turnos: numero('turnos'), maxAcciones: numero('acciones'), puntosPorTurno: numero('puntos-turno'), segundosPorTurno: numero('segundos-turno'), tamanoMapa: numero('mapa'), umbralSitio: numero('umbral-sitio'), intentosMapa: numero('intentos-mapa'),
      opcionesEscenario, especie: o.especie, presupuesto, maxTokens: Number(o['max-tokens'] ?? 1_000_000), maxTiempoMs: numero('tiempo-ms'), timeoutMs: numero('timeout-ms'), indicePartida: partida, competitionId, ...(grabacion ? { timeoutAvanceMs: avanceMs } : {}) };
    validarConfig(resolverConfig(config, perfil)); // antes de crear nada en disco
    const carpeta = join(salida, `${competitionId}-${partida + 1}`);
    const telemetria = await crearTelemetria(join(carpeta, 'eventos.jsonl'));
    let reporte, vivo = null;
    const turnosTotales = resolverConfig(config, perfil).turnos;
    if (grabacion) {
      vivo = crearEstadoVivo({ ruta: resolve(o.vivo ?? 'data/vivo/worldbox.json'), participantes, turnos: resolverConfig(config, perfil).turnos, supervivencia: perfil.victoriaSupervivencia === true, especie: o.especie ?? perfil.partida.especie ?? 'human' });
      await vivo.emitir({ fase: 'preparando', turno: 0 }); // la fuente de navegador de OBS ya muestra «preparando» durante la cuenta atras
      config.observador = vivo.emitir;
      // Preludio, DESPUES de generar el mundo y con la camara lejos: espera a que se apague el aviso del juego («Experimental mode is enabled»),
      // y solo entonces dice «Listo para grabar» y cuenta atras. Asi se graba un mundo ya generado y limpio.
      const esperaReal = ms => new Promise(r => setTimeout(r, ms)), dormirCon = deps.dormir ?? esperaReal;
      const preludio = async () => { const aviso = Number(o['aviso-ms'] ?? 6000); if (aviso > 0) await dormirCon(aviso); if (partida === 0) await cuentaAtras(Number(o.cuenta ?? 15), deps); };
      config.presentacion = { preludio, lecturaMs: Number(o['lectura-ms'] ?? 4000), finMs: Number(o['fin-ms'] ?? 8000), dormir: deps.dormir,
        // --zoom=N es un zoom unico y desactiva el automatico por fase.
        ...(o.zoom ? { zoom: Number(o.zoom) } : { zooms: Object.fromEntries(Object.entries(ZOOM_POR_OMISION).map(([k, v]) => [k, Number(o[`zoom-${k}`] ?? v)])) }) };
      if (o.manual === true) {
        const entrada = deps.entrada ?? process.stdin, avisar = deps.avisar ?? (t => console.error(t));
        if (!entrada.isTTY) avisar('Aviso: --manual necesita una consola interactiva; se ignora y se usa la pausa --lectura-ms.');
        else {
          lector ??= crearEsperaEnter(entrada);
          config.presentacion.esperar = async ({ turno, participante }) => {
            const d = vivo.ultimo()?.decision, de = turnosTotales;
            avisar(`Turno ${turno} de ${de} - ${d?.participante ?? participante}: ${d?.texto ?? ''}\nPulsa Enter para continuar`);
            await lector.esperar();
          };
        }
      }
    }
    try { ({ reporte } = await correrCompetencia({ ...config, telemetria })); }
    catch (e) { lector?.cerrar(); if (telemetria.eventos.length === 0) await rm(carpeta, { recursive: true, force: true }); throw e; } // un arranque fallido no deja carpeta vacia
    await vivo?.cerrar();
    await escribirReporte(reporte, carpeta);
    reportes.push({ carpeta, reglas: reporte.reglas, rules_version: reporte.config.rules_version, origen: reporte.origen, determinista: reporte.determinista, completo: reporte.completo, razon: reporte.razon, turnos: reporte.turnos, hash_final: reporte.hash_final,
      ranking: reporte.ranking.map(f => ({ participante: f.participant_id, modelo: f.model_id, puesto: f.puesto, puntos: f.puntos, costo: f.costo })) });
    if (!reporte.completo) break;
  }
  lector?.cerrar();
  return reportes;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(`WorldBox: ${e.codigo ?? 'error_interno'}`); process.exitCode = 1; });
}

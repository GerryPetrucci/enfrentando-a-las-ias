import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { crearAdaptadorHttp } from '../adaptador-http.js';
import { crearPasarela, llamarReal } from '../pasarela.js';
import { crearTelemetria } from '../telemetria.js';
import { exigir } from '../util.js';
import { crearEstadoVivoEra, textoDeAccionesEra } from './vivo-era.js';
import { crearAdaptadorEraSimulado } from './adaptador-era-simulado.js';
import { crearBotEra } from './bots-era.js';
import { correrEra } from './orquestador-era.js';
import { PERFIL_ERA, resolverPartida, validarPartida } from './reglas-era.js';
import { reconstruirReporteEra, escribirReporteEra } from './reporte-era.js';
import { prepararRespuestas, guardarEvidencia } from './respuestas/correr-respuestas.js';
import { crearLectorLineas } from './respuestas/participante-guardado.js';
import { resolverPresentacion } from './presentacion-era.js';

// Opciones del CLI propias del formato era (docs/worldbox-era.md). Los valores de partida que no se pasan salen de PERFIL_ERA.partida.
export const OPCIONES_ERA = ['formato', 'anio-muro', 'anio-limite', 'anios-borrador', 'intervenciones', 'intervenciones-guerra', 'velocidad-desarrollo', 'velocidad-guerra', 'revelar', 'segundos-avance', 'cantidad-minerales', 'ancho-muro', 'sin-vigilante', 'vigilante-modo', 'sin-unico-reino', 'sin-renovar-guerra', 'anios-espera-rasgos', 'segundos-avance-guerra',
  // Práctica con respuestas pegadas a mano, escenario y presentación (docs/worldbox-era-practica.md)
  'respuestas', 'asistido', 'modelo-a', 'modelo-b', 'nombre-a', 'nombre-b', 'canal', 'ignorar-invalidas', 'prompt-completo', 'tamano', 'mapa-guardado', 'sin-camara', 'interfaz-visible',
  // E10: nombre y color de cada reino (docs/worldbox-era.md, «Nombre y color de los reinos»)
  'nombre-reino-a', 'nombre-reino-b', 'color-a', 'color-b', 'colores-juego', 'sin-capa-reinos'];
// Banderas sin valor propias de la era; las dos últimas solo valen con --grabacion.
export const BOOLEANAS_ERA = ['sin-vigilante', 'sin-unico-reino', 'asistido', 'ignorar-invalidas', 'prompt-completo', 'sin-camara', 'interfaz-visible', 'colores-juego', 'sin-capa-reinos'];
export const SOLO_GRABACION_ERA = ['sin-camara', 'interfaz-visible'];
// Tamaños del juego (índice × 64 casillas por lado; el puente redondea al más cercano): tiny 128, small 192, standard 256, large 320, huge 384.
export const TAMANOS_MAPA = Object.freeze({ tiny: 128, small: 192, standard: 256, large: 320, huge: 384 });
export const PLANTILLAS_MAPA = Object.freeze(['continent', 'boring_plains', 'pancake']);
export const NUMERICAS_ERA = ['anio-muro', 'anio-limite', 'anios-borrador', 'segundos-avance', 'cantidad-minerales', 'ancho-muro', 'anios-espera-rasgos', 'segundos-avance-guerra'];
const lista = (texto, clave) => { const v = String(texto).split(',').map(x => Number(x.trim())); exigir(v.length > 0 && v.every(Number.isInteger), 'argumento_invalido'); void clave; return v; };
export function partidaDesdeCli(o) {
  const n = k => o[k] === undefined ? undefined : Number(o[k]);
  const c = { anioMuro: n('anio-muro'), anioLimite: n('anio-limite'), aniosBorrador: n('anios-borrador'), segundosAvance: n('segundos-avance'), segundosAvanceGuerra: n('segundos-avance-guerra'), aniosEsperaRasgos: n('anios-espera-rasgos'), cantidadMinerales: n('cantidad-minerales'), muroAncho: n('ancho-muro'),
    intervencionesDesarrollo: o.intervenciones === undefined ? undefined : lista(o.intervenciones, 'intervenciones'), intervencionesGuerra: o['intervenciones-guerra'] === undefined ? undefined : lista(o['intervenciones-guerra'], 'intervenciones-guerra'),
    velocidadDesarrollo: o['velocidad-desarrollo'], velocidadGuerra: o['velocidad-guerra'], revelar: o.revelar, renovarGuerra: o['sin-renovar-guerra'] === true ? false : undefined, vigilante: o['sin-vigilante'] === true ? false : undefined, vigilanteModo: o['vigilante-modo'], unicoReino: o['sin-unico-reino'] === true ? false : undefined, tamanoMapa: n('mapa'), unidadesIniciales: n('unidades-iniciales'),
    maxTiempoMs: n('tiempo-ms'), timeoutMs: n('timeout-ms') };
  if (o.tamano !== undefined) { exigir(Object.hasOwn(TAMANOS_MAPA, o.tamano) && o.mapa === undefined, 'argumento_invalido'); c.tamanoMapa = TAMANOS_MAPA[o.tamano]; }
  if (o.plantilla !== undefined) { exigir(PLANTILLAS_MAPA.includes(o.plantilla), 'argumento_invalido'); c.plantilla = o.plantilla; }
  if (o['mapa-guardado'] !== undefined) { exigir(/^(slotd{1,3}|[a-z0-9_-]{1,40})$/.test(o['mapa-guardado']), 'argumento_invalido'); c.mapaGuardado = o['mapa-guardado']; }
  // Modo asistido: una persona pega cada prompt en un chat; la espera por llamada es de hasta 1 h y la partida de hasta 24 h (salvo que se pasen --timeout-ms / --tiempo-ms).
  if (o.asistido === true) { c.timeoutMs ??= 3_600_000; c.maxTiempoMs ??= 86_400_000; }
  // Con un año del muro menor y sin pasar el límite, el límite acompaña (anio_muro + años de guerra por omisión), nunca queda por debajo del muro.
  return resolverPartida(c);
}

// Una partida era por corrida. `deps`: llamar (modelo), dormir, avisar, env. `zoomPorOmision`: de correr.js.
export async function correrEraCli({ o, env, deps = {}, nombres, modelos, presupuesto, tarifas, salida, competitionId, zoomPorOmision, cuentaAtras }) {
  const partida = partidaDesdeCli(o);
  validarPartida(partida);
  const grabacion = o.grabacion === true;
  // Respuestas pegadas a mano (o repetidas desde una conversacion.json): participantes que no llaman a ningún modelo. La revisión previa corta aquí si algo es inválido.
  const prep = o.respuestas ? await prepararRespuestas({ o, partida, deps }) : null;
  if (prep) nombres = [prep.modelos.f1, prep.modelos.f2];
  const pasarela = modelos ? crearPasarela({ modo: o.modo, llamar: deps.llamar ?? llamarReal, presupuesto, presupuestoModelo: Number(o['presupuesto-modelo'] ?? presupuesto / nombres.length), tarifas, timeoutMs: Number(o['timeout-ms'] ?? PERFIL_ERA.partida.timeoutMs), limitador: deps.limitador }) : null;
  const semilla = Number(o.semilla ?? 1);
  const participantes = prep ? prep.participantes : nombres.map((modelo, i) => ({ id: `f${i + 1}`, modelo, ...(modelos ? {} : { decidir: crearBotEra(modelo, semilla + i) }) }));
  const minimo = Math.min(...[partida.velocidadDesarrollo, partida.velocidadGuerra].map(v => Number(/^x(\d+)$/.exec(v)[1]) || 1));
  const avanceMs = Math.min(600000, Math.ceil(Math.max(partida.segundosAvance, partida.segundosAvanceGuerra) / (1.2 * minimo)) * 1000 + 60000);
  const adaptador = o.adaptador === 'http' ? crearAdaptadorHttp({ url: env.WORLDBOX_PUENTE_URL, token: env.WORLDBOX_PUENTE_TOKEN, timeoutMs: Number(o['timeout-puente-ms'] ?? Math.max(60000, avanceMs)) }) : crearAdaptadorEraSimulado({ sim: deps.sim });
  // E10: nombre y color de cada reino, decididos UNA vez: van al juego, a la capa de OBS y a la evidencia.
  const reinos = resolverPresentacion({ participantes: participantes.map(x => ({ id: x.id, modelo: x.modelo })), o, declarados: prep ? { f1: prep.nombresDeclarados.f1, f2: prep.nombresDeclarados.f2 } : {} });
  const carpeta = join(salida, `${competitionId}-1`);
  const telemetria = await crearTelemetria(join(carpeta, 'eventos.jsonl'));
  let vivo = null, presentacion, lectorManual = null;
  if (grabacion) {
    vivo = crearEstadoVivoEra({ ruta: resolve(o.vivo ?? 'data/vivo/worldbox.json'), participantes: reinos.participantes.map(r => ({ id: r.id, modelo: r.modelo, nombre: r.nombre, reino: r.reino, color: r.color_marca })), partida });
    await vivo.emitir({ fase: 'preparando', fase_era: 'borrador', etapa: 'Preparando' });
    const esperaReal = ms => new Promise(r => setTimeout(r, ms)), dormirCon = deps.dormir ?? esperaReal;
    const preludio = async ({ listo } = {}) => { const aviso = Number(o['aviso-ms'] ?? 6000); if (aviso > 0) await dormirCon(aviso); listo?.(); await cuentaAtras(Number(o.cuenta ?? 15), deps); };
    // --sin-camara: el script NO toca la cámara (la manejas tú con el ratón). --interfaz-visible: no oculta la interfaz del juego. --manual: un Enter por decisión, para comentar en vivo.
    presentacion = { preludio, lecturaMs: Number(o['lectura-ms'] ?? 4000), finMs: Number(o['fin-ms'] ?? 8000), dormir: deps.dormir, timeoutAvanceMs: avanceMs,
      ...(o['sin-camara'] === true ? {} : o.zoom ? { zoom: Number(o.zoom) } : { zooms: Object.fromEntries(Object.entries(zoomPorOmision).map(([k, v]) => [k, Number(o[`zoom-${k}`] ?? v)])) }),
      ...(o['interfaz-visible'] === true ? { interfazVisible: true } : {}) };
    if (o.manual === true) {
      const entrada = deps.entrada ?? process.stdin, avisar = deps.avisar ?? (x => console.error(x));
      if (!entrada.isTTY && !deps.entrada) avisar('Aviso: --manual necesita una consola interactiva; se ignora y se usa la pausa --lectura-ms.');
      else {
        lectorManual = prep?.lector ?? crearLectorLineas(entrada);
        presentacion.esperar = async info => { avisar(`${info.tipo === 'muro' ? 'Año' : 'Llamada ' + info.llamada + ' de ' + info.de + ', año'} ${info.anio}${info.nombre ? ` - ${info.nombre}` : ''}: ${info.texto}
Pulsa Enter para continuar`); await lectorManual.preguntar(); };
      }
    }
  }
  const observador = vivo ? { emitir: vivo.emitir, colores: vivo.fijarColores, nombre: id => vivo.ids.get(id)?.nombre ?? id, texto: acciones => textoDeAccionesEra(acciones, id => vivo.ids.get(id)?.nombre ?? null) } : undefined;
  let resultado;
  try { resultado = await correrEra({ adaptador, participantes, pasarela, semilla, partida, presupuesto, maxTokens: Number(o['max-tokens'] ?? 1_000_000), competitionId, telemetria, observador, presentacion, reinos }); }
  catch (e) { prep?.cerrar(); lectorManual?.cerrar(); if (telemetria.eventos.length === 0) await (await import('node:fs/promises')).rm(carpeta, { recursive: true, force: true }); throw e; }
  await vivo?.cerrar();
  const reporte = reconstruirReporteEra(resultado.eventos);
  await escribirReporteEra(reporte, carpeta);
  await mkdir(carpeta, { recursive: true });
  await writeFile(join(carpeta, 'linea-de-tiempo.json'), JSON.stringify(resultado.linea.documento({ competition_id: competitionId, rules_version: reporte.rules_version, velocidades: { desarrollo: partida.velocidadDesarrollo, guerra: partida.velocidadGuerra },
    anio_muro: partida.anioMuro, anio_limite: partida.anioLimite, participantes: nombres.map((m, i) => ({ id: `f${i + 1}`, modelo: m })) }), null, 2) + '\n');
  let evidencia = null;
  if (prep) evidencia = await guardarEvidencia({ carpeta, id: `${competitionId}-1`, prep, partida, semilla, o, resultado, reinos });
  prep?.cerrar(); lectorManual?.cerrar();
  return [{ carpeta, formato: 'era', ...(evidencia ? { evidencia } : {}), rules_version: reporte.rules_version, prompt_version: reporte.prompt_version, origen: reporte.origen, completo: reporte.completo, razon: reporte.razon, anio_final: reporte.anio_final, ganador: reporte.ganador,
    ranking: reporte.ranking.map(r => ({ participante: r.participant_id, modelo: r.model_id, puesto: r.puesto, puntos: r.puntos, vivo: r.vivo })), consumo: reporte.consumo }];
}

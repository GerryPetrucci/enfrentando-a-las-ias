import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { exigir, hash } from '../../util.js';
import { CATALOGO_ERA, PROMPT_VERSION_ERA, RULES_VERSION_ERA } from '../reglas-era.js';
import { construirSistemaEra } from '../prompt-era.js';
import { reconstruirReporteEra } from '../reporte-era.js';
import { cargarAlmacen, LETRA } from './almacen.js';
import { construirConversacion, construirResumenPublico, escribirEvidencia } from './evidencia.js';
import { crearLectorLineas, crearParticipantesGuardados } from './participante-guardado.js';
import { informeTexto, verificarRespuestas } from './verificar.js';

// Enlace entre el CLI de la era (correr-era.js) y el modo de respuestas guardadas. Todo es opcional y aditivo: sin `--respuestas` nada de esto se usa.
const MODELO = /^[\w./:-]{1,60}$/;

// El manifiesto que dejó worldbox-era-prompts.mjs (en <carpeta>/prompts/ o en <carpeta>/../prompts/), si existe.
async function leerManifiesto(raiz) {
  for (const ruta of [join(raiz, 'prompts', 'manifiesto.json'), join(raiz, '..', 'prompts', 'manifiesto.json')]) {
    try { return JSON.parse(await readFile(ruta, 'utf8')); } catch { /* probar la siguiente */ }
  }
  return null;
}

// `o`: opciones del CLI. Devuelve { almacen, modelos: {f1,f2}, participantes, registro, lector, informe, nombres, canal, asistido, cerrar() }.
export async function prepararRespuestas({ o, partida, deps = {}, cat = CATALOGO_ERA }) {
  const avisar = deps.avisar ?? (t => console.error(t));
  const almacen = await cargarAlmacen(resolve(o.respuestas));
  const modelos = {
    f1: o['modelo-a'] ?? almacen.participantes.f1?.modelo ?? 'modelo-a',
    f2: o['modelo-b'] ?? almacen.participantes.f2?.modelo ?? 'modelo-b',
  };
  exigir(MODELO.test(modelos.f1) && MODELO.test(modelos.f2) && modelos.f1 && modelos.f2, 'participantes_invalidos');
  const nombresDeclarados = { f1: o['nombre-a'] ?? almacen.participantes.f1?.nombre ?? null, f2: o['nombre-b'] ?? almacen.participantes.f2?.nombre ?? null };
  const canal = o.canal ?? almacen.participantes.f1?.canal ?? 'chat';
  const asistido = o.asistido === true;
  // Revisión previa con el MISMO validador del motor: el error exacto antes de gastar la partida.
  const informe = verificarRespuestas({ almacen, partida, cat });
  // ¿Los modelos leyeron el MISMO texto de sistema que usa esta partida? (si cambiaste el calendario o el catálogo, no)
  const manifiesto = almacen.origen === 'carpeta' ? await leerManifiesto(almacen.raiz) : null;
  if (manifiesto && manifiesto.sistema_hash !== hash(construirSistemaEra(partida, cat))) informe.avisos.push('El texto de sistema que se les pegó a los modelos (manifiesto.json de prompts) NO es el de esta partida: cambió el calendario, el muro, el catálogo o la versión. Las respuestas siguen valiendo, pero los modelos leyeron otras reglas. Regenera los prompts con los mismos parámetros si quieres que coincida.');
  const etiqueta = id => LETRA[id], nombre = id => nombresDeclarados[id] ?? modelos[id];
  avisar(informeTexto(informe, { etiqueta, nombre }));
  const bloqueantes = informe.errores + (asistido ? 0 : informe.faltan);
  if (bloqueantes > 0 && o['ignorar-invalidas'] !== true) {
    throw Object.assign(new Error('Hay respuestas inválidas o que faltan (arriba el detalle). Corrígelas con tu modelo y vuelve a lanzar, o añade --ignorar-invalidas para jugar con la corrección única y la jugada por defecto del reglamento.'), { codigo: 'respuestas_invalidas' });
  }
  let lector = null;
  if (asistido) {
    const entrada = deps.entrada ?? process.stdin;
    exigir(entrada.isTTY || deps.entrada, 'asistido_requiere_consola');
    lector = crearLectorLineas(entrada);
  }
  const registro = [];
  const g = crearParticipantesGuardados({ almacen, modelos, asistido, raiz: almacen.origen === 'carpeta' ? almacen.raiz : null, registro, lector, avisar, nombres: Object.fromEntries(['f1', 'f2'].map(id => [id, nombre(id)])), sistemaSiempre: o['prompt-completo'] === true,
    ...(deps.leerRespuesta ? { leer: deps.leerRespuesta } : {}), ...(deps.escribirPrompt ? { escribir: deps.escribirPrompt } : {}), ...(deps.esperarMs !== undefined ? { esperarMs: deps.esperarMs } : {}) });
  return { almacen, manifiesto, modelos, nombresDeclarados, canal, asistido, participantes: g.participantes, registro, informe, lector, cerrar: () => lector?.cerrar() };
}

// Escribe conversacion.json y resumen-publico.json en la carpeta de la partida. `resultado`: lo que devolvió correrEra. Devuelve las rutas.
export async function guardarEvidencia({ carpeta, id, prep, partida, semilla, o, resultado, reinos = null, ahora = () => new Date(), cat = CATALOGO_ERA }) {
  const eventos = resultado.eventos, inicio = eventos.find(e => e.tipo === 'inicio');
  const reporte = reconstruirReporteEra(eventos);
  const usoAsistido = prep.registro.some(r => r.fuente === 'asistido');
  const origen = prep.almacen.origen === 'conversacion' ? 'repeticion' : usoAsistido ? 'chat-manual-asistido' : 'chat-manual';
  const m = prep.manifiesto, rutaManifiesto = m ? { envoltura: m.envoltura_version ?? null, hash: hash(m), sistema_hash: m.sistema_hash, coincide_con_la_partida: m.sistema_hash === hash(construirSistemaEra(partida, cat)) } : null;
  const escenario = {
    resumen: { tamano_mapa: partida.tamanoMapa, plantilla: partida.plantilla ?? 'continent', mapa_guardado: partida.mapaGuardado ?? null, ancho_muro: partida.muroAncho, anio_muro: partida.anioMuro, anio_limite: partida.anioLimite, velocidad_desarrollo: partida.velocidadDesarrollo, velocidad_guerra: partida.velocidadGuerra,
      minerales: partida.cantidadMinerales, semilla, adaptador: o.adaptador ?? 'simulado' },
    partida, mundo: inicio?.escenario ? { hash_mundo: inicio.escenario.hash_mundo, mundo: inicio.escenario.mundo ?? null, era: inicio.escenario.era ?? null } : null,
  };
  const conv = construirConversacion({ id, creado: ahora().toISOString(), ejemplo: prep.almacen.ejemplo, origen, almacen: prep.almacen, modelos: prep.modelos, nombresDeclarados: prep.nombresDeclarados, canal: prep.canal, partida, escenario, registro: prep.registro, eventos, reporte,
    versiones: { rules_version: RULES_VERSION_ERA, prompt_version: PROMPT_VERSION_ERA, catalogo_version: cat.catalogo_version, catalogo_hash: inicio?.config?.catalogo_hash ?? hash(cat), sistema_hash: inicio?.config?.sistema_hash ?? null }, rutaManifiesto, cat, reinos: inicio?.reinos ?? reinos?.participantes ?? null });
  const resumen = construirResumenPublico(conv, { cat });
  await escribirEvidencia(carpeta, { conversacion: conv, resumen, sistema: construirSistemaEra(partida, cat) });
  return { conversacion: join(carpeta, 'conversacion.json'), resumen: join(carpeta, 'resumen-publico.json') };
}

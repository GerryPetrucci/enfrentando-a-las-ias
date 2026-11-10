import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sanear } from '../../telemetria.js';
import { CATALOGO_ERA, NINGUNO, rasgoPorId } from '../reglas-era.js';
import { LETRA } from './almacen.js';
import { textoDeAccionEra } from '../vivo-era.js';
import { ENVOLTURA_MANUAL_VERSION } from './participante-guardado.js';

// Evidencia de una partida de la era jugada con respuestas pegadas a mano (formato «conversacion-era», versión 1).
//   conversacion.json     TODO: lo que se le pidió a cada modelo, lo que contestó (crudo), lo que se leyó, cómo lo validó el motor, la corrección y lo aplicado.
//   resumen-publico.json  solo elecciones y justificaciones breves, listo para una página FUTURA. Nace con "revisado": false.
// No se publica nada: la carpeta data/era/ está en .gitignore (AGENTS.md: sin datos completos, voz ni grabaciones sin orden).
export const VERSION_CONVERSACION = 1;
const ETIQUETA = { etapa1: 'Etapa 1: raza, mineral y bioma', etapa2: 'Etapa 2: cuerpo y mente', etapa3: 'Etapa 3: infraestructura y política' };
const etiquetaClave = (clave, fase) => ETIQUETA[clave] ?? `Intervención ${clave.split('-')[1]} de ${fase === 'guerra' ? 'la guerra' : 'el desarrollo'}`;

// Una elección de rasgos con el nombre en español (sin ids internos de proveedor).
const rasgoLegible = (slot, id, cat) => ({ casilla: slot, id, nombre: rasgoPorId(id, cat)?.nombre ?? id });

// E10: nombre y color del reino de un participante (lo pedido y lo que el juego aplicó).
const reinoDe = (reinos, pid) => { const r = (reinos ?? []).find(x => x.id === pid); return r ? { nombre: r.reino, color: r.color_juego ?? r.color ?? r.color_marca ?? null, color_pedido: r.color ?? null, color_de_marca: r.color_marca ?? null, regla_color: r.regla_color ?? null, nombre_en_juego: r.reino_juego ?? null, modelo_en_pantalla: r.nombre ?? null } : null; };
export function construirConversacion({ id, creado, ejemplo = false, origen, almacen, modelos, nombresDeclarados = {}, canal = 'chat', partida, escenario, registro, eventos, reporte, versiones, rutaManifiesto = null, cat = CATALOGO_ERA, reinos = null }) {
  const decisiones = eventos.filter(e => e.tipo === 'decision');
  const ejecuciones = eventos.filter(e => e.tipo === 'intervencion');
  const rasgosEv = eventos.filter(e => e.tipo === 'rasgos_aplicados');
  const noAplicados = eventos.filter(e => e.tipo === 'rasgo_no_aplicado');
  const omitidas = eventos.filter(e => e.tipo === 'intervencion_omitida').map(e => ({ llamada: e.llamada, fase: e.fase, indice: e.indice, anio: e.anio, motivo: e.motivo }));
  const fin = eventos.find(e => e.tipo === 'fin');
  const participantes = ['f1', 'f2'].map(pid => ({ id: pid, letra: LETRA[pid], modelo: modelos[pid], nombre_mostrado: nombresDeclarados[pid] ?? null, canal, declarado_por: 'usuario',
    ...(reinoDe(reinos, pid) ? { reino: reinoDe(reinos, pid) } : {}) }));
  const llamadas = [];
  for (const d of decisiones.filter(x => x.intento === 0)) {
    const intentos = decisiones.filter(x => x.participant_id === d.participant_id && x.turn_number === d.turn_number).sort((a, b) => a.intento - b.intento);
    const clave = registro.find(r => r.participante === d.participant_id && r.numero === d.turn_number)?.clave ?? (d.llamada.tipo === 'intervencion' ? `${d.llamada.fase}-${d.llamada.indice}` : `etapa${d.llamada.etapa}`);
    const final = intentos.at(-1);
    llamadas.push({
      llamada: d.turn_number, clave, etiqueta: etiquetaClave(clave, d.llamada.fase), tipo: d.llamada.tipo, fase: d.llamada.fase, anio: d.anio, participante: d.participant_id,
      intentos: intentos.map(ev => {
        const r = registro.find(x => x.participante === ev.participant_id && x.numero === ev.turn_number && x.intento === ev.intento) ?? {};
        return { intento: ev.intento, es_correccion: ev.correccion === true, fuente: r.fuente ?? 'desconocida', archivo: r.archivo ?? null, prompt_usuario: r.prompt_usuario ?? null, prompt_hash: ev.prompt_hash, sistema_hash: ev.sistema_hash,
          respuesta_cruda: r.respuesta_cruda ?? null, texto_entregado: r.entregado ?? null, extraccion: r.extraccion ?? null, json_leido: (() => { try { return JSON.parse(ev.action_raw); } catch { return null; } })(),
          validacion: { ok: (ev.errores ?? []).length === 0 && !ev.error_type, error_type: ev.error_type ?? null, errores: ev.errores ?? [] } };
      }),
      aplicado: { acciones: final.action_validated, razon: (() => { try { return JSON.parse(final.action_raw).reasoning_summary ?? ''; } catch { return ''; } })(),
        jugada_por_defecto: (final.errores ?? []).length > 0 || !!final.error_type,
        correccion_usada: intentos.length > 1 && (final.errores ?? []).length === 0,
        ejecucion: ejecuciones.find(e => e.llamada === d.turn_number && e.participant_id === d.participant_id)?.ejecuciones ?? null,
        rasgos: rasgosEv.filter(e => e.participant_id === d.participant_id && d.llamada.tipo !== 'intervencion' && e.etapa === d.llamada.etapa).map(e => ({ tipo: e.tipo_rasgo, pedidos: e.pedidos, aplicados: e.aplicados, pendientes: e.pendientes, rechazados: e.rechazados })),
        rasgos_no_aplicados: noAplicados.filter(e => e.participant_id === d.participant_id && d.llamada.tipo !== 'intervencion' && e.etapa === d.llamada.etapa).map(e => ({ casilla: e.casilla, id: e.id, motivo: e.motivo, puntos_devueltos: e.puntos_devueltos })) },
    });
  }
  llamadas.sort((a, b) => a.llamada - b.llamada || a.participante.localeCompare(b.participante));
  const elecciones = Object.fromEntries(['f1', 'f2'].map(pid => [pid, fin?.elecciones?.[pid] ?? null]));
  return sanear({
    version: VERSION_CONVERSACION, tipo: 'conversacion-era', id, creado, ejemplo,
    aviso: 'Evidencia COMPLETA y privada de una partida jugada con respuestas pegadas a mano. No se publica sin revisar (AGENTS.md). Para la página usa resumen-publico.json.',
    origen, versiones: { ...versiones, envoltura_manual: ENVOLTURA_MANUAL_VERSION }, manifiesto_prompts: rutaManifiesto,
    escenario, participantes, llamadas, omitidas, elecciones_finales: elecciones,
    resultado: fin ? { completo: fin.completo, razon: fin.razon, anio_final: fin.anio, ganador: fin.ganador, ranking: fin.ranking, puntos: fin.puntos, infracciones: fin.infracciones, anomalias: fin.anomalias, anio_caida_muro: fin.anio_caida_muro } : null,
    reporte_ref: reporte ? { archivo: 'reporte.json', hash_final: reporte.hash_final } : null, archivos: { eventos: 'eventos.jsonl', reporte: 'reporte.json', linea_de_tiempo: 'linea-de-tiempo.json', sistema: 'prompts/sistema.txt' },
    alcance_de_la_partida: { anios: partida.anioLimite, calendario: { borrador: [1, 1 + partida.aniosBorrador, 1 + 2 * partida.aniosBorrador], desarrollo: partida.intervencionesDesarrollo, guerra: partida.intervencionesGuerra.map(d => partida.anioMuro + d), muro: partida.anioMuro } },
  });
}

// Resumen para la página: lo que eligió cada modelo y por qué (frases cortas). Nunca prompts, texto crudo, rutas ni identificadores internos.
export function construirResumenPublico(conv, { cat = CATALOGO_ERA } = {}) {
  const nombre = pid => { const p = conv.participantes.find(x => x.id === pid); return p?.nombre_mostrado ?? p?.modelo ?? pid; };
  const participantes = conv.participantes.map(p => {
    const e = conv.elecciones_finales[p.id];
    const propias = conv.llamadas.filter(l => l.participante === p.id);
    const rasgos = Object.entries(e?.rasgos_aplicados && Object.keys(e.rasgos_aplicados).length ? e.rasgos_aplicados : (e?.rasgos ?? {})).map(([slot, id]) => rasgoLegible(slot, id, cat));
    return {
      letra: p.letra, modelo: p.modelo, nombre: nombre(p.id), ...(p.reino ? { reino: p.reino.nombre, color: p.reino.color } : {}),
      elecciones: e ? { raza: cat.razas.find(r => r.id === e.raza)?.nombre ?? e.raza, mineral: cat.minerales.find(m => m.id === e.mineral)?.nombre ?? e.mineral, bioma: e.bioma ? (cat.biomas.find(b => b.id === e.bioma)?.nombre ?? e.bioma) : null,
        rasgos, rasgos_no_aplicados: (e.rasgos_no_aplicados ?? []).map(r => ({ casilla: r.casilla, nombre: rasgoPorId(r.id, cat)?.nombre ?? r.id, motivo: r.motivo })), rasgos_extra: (e.extras ?? []).map(id => rasgoPorId(id, cat)?.nombre ?? id) } : null,
      decisiones: propias.map(l => ({ etiqueta: l.etiqueta, anio: l.anio, fase: l.fase, accion: (l.aplicado.acciones ?? []).filter(a => a.action !== 'esperar').map(a => textoDeAccionEra(a, id => nombre(id))).join('; ') || 'Espera', frase: l.aplicado.razon || null, valida: !l.aplicado.jugada_por_defecto, corregida: l.aplicado.correccion_usada })),
    };
  });
  return sanear({
    version: 1, tipo: 'resumen-publico-era', id: conv.id, creado: conv.creado, ejemplo: conv.ejemplo, revisado: false,
    aviso: 'Borrador generado por el motor. NO se publica hasta que el dueño del proyecto lo revise y ponga "revisado": true (AGENTS.md).',
    reglas: { rules_version: conv.versiones.rules_version, prompt_version: conv.versiones.prompt_version, catalogo_version: conv.versiones.catalogo_version },
    escenario: conv.escenario?.resumen ?? null, participantes,
    resultado: conv.resultado ? { completo: conv.resultado.completo, razon: conv.resultado.razon, anio_final: conv.resultado.anio_final, ganador: conv.resultado.ganador ? nombre(conv.resultado.ganador) : null,
      ranking: (conv.resultado.ranking ?? []).map(r => ({ nombre: nombre(r.participant_id), puesto: r.puesto, puntos: r.puntos, vivo: r.vivo })) } : null,
  });
}

export async function escribirEvidencia(carpeta, { conversacion, resumen, sistema }) {
  await mkdir(join(carpeta, 'prompts'), { recursive: true });
  await writeFile(join(carpeta, 'conversacion.json'), JSON.stringify(conversacion, null, 2) + '\n');
  await writeFile(join(carpeta, 'resumen-publico.json'), JSON.stringify(resumen, null, 2) + '\n');
  if (sistema) await writeFile(join(carpeta, 'prompts', 'sistema.txt'), sistema);
}
export { NINGUNO };

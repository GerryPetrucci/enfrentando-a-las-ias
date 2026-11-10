import { createHash } from 'node:crypto';
import { hash as hashDelMotor } from '../../util.js'; // el motor identifica el texto de sistema con este hash (sha256 del JSON canónico de la cadena)
import { construirSistemaEra, construirUsuarioEra } from '../prompt-era.js';
import { CATALOGO_ERA, PRESUPUESTO_PUNTOS, PROMPT_VERSION_ERA, RULES_VERSION_ERA, totalLlamadas } from '../reglas-era.js';
import { ENVOLTURA_MANUAL_VERSION, RECORDATORIO_FORMATO } from './participante-guardado.js';

// Textos para PEGAR A MANO en el chat de cada modelo. El texto de sistema y el mensaje de cada llamada son EXACTAMENTE los que el motor le daría a un
// modelo por API (construirSistemaEra / construirUsuarioEra); lo único que añade este módulo es una envoltura corta de organizador (versión `manual-1.0`)
// para el modo «borrador completo» (las tres etapas en un mensaje) y el recordatorio de formato. La envoltura queda registrada en la evidencia.
const SEPARADOR = '--------------------------------------------------------------------------------';
export const hashTexto = t => createHash('sha256').update(t).digest('hex');
export const estimarTokens = t => Math.ceil(Buffer.byteLength(t, 'utf8') / 3.5); // supuesto declarado: 3,5 bytes por token (como estimar-costo-era)

function datosEtapa(p, etapa, { eleccionesPrevias = null } = {}) {
  return { llamada: { numero: etapa, de: totalLlamadas(p), tipo: `etapa${etapa}`, fase: 'borrador', etapa }, anio: etapa === 1 ? 0 : 1 + p.aniosBorrador * (etapa - 1),
    presupuesto: { puntos_etapa: PRESUPUESTO_PUNTOS[`etapa${etapa}`], reserva_rasgos_extra: PRESUPUESTO_PUNTOS.rasgo_extra }, observation: null,
    tus_elecciones: etapa === 1 ? null : eleccionesPrevias, elecciones_del_rival: null, correccion: null };
}

// Mensaje de usuario de UNA etapa (idéntico al que recibiría por API, salvo `observation`: aún no hay mundo, es null).
export function usuarioDeEtapa(p, etapa, opciones) { return construirUsuarioEra(datosEtapa(p, etapa, opciones)); }

export function mensajeBorradorCompleto(p) {
  const u = e => usuarioDeEtapa(p, e);
  return [
    'MENSAJE DEL ORGANIZADOR — BORRADOR COMPLETO (envoltura manual-1.0)',
    `En esta partida el borrador tiene tres etapas (las llamadas 1, 2 y 3 del texto de sistema). Para esta modalidad te pido las TRES ahora, en este único mensaje, antes de que el mundo exista: decide las tres a la vez. La etapa 2 y la 3 también son a ciegas (no ves el mundo ni a tu rival). Tus elecciones de una etapa cuentan para la siguiente: el tope de rasgos FUERTES (sección 5) suma las tres etapas. Lo que en el texto de sistema se llama «observation» (tus cifras) vale null en las tres llamadas porque aún no hay mundo.`,
    'Estas son las tres llamadas tal como las recibirías por separado (JSON de usuario):',
    `Llamada 1 (etapa1):\n${u(1)}`, `Llamada 2 (etapa2, año ${1 + p.aniosBorrador}):\n${u(2)}`, `Llamada 3 (etapa3, año ${1 + 2 * p.aniosBorrador}):\n${u(3)}`,
    'FORMATO DE LA RESPUESTA (sustituye al ejemplo de la sección 9 SOLO para este mensaje): un ÚNICO objeto JSON con tres claves, cada una con el mismo formato de la sección 9 (una sola acción con todos sus parámetros y tu reasoning_summary):',
    '{"etapa1":{"actions":[{"action":"elegir_inicio","parameters":{...}}],"reasoning_summary":"..."},"etapa2":{"actions":[{"action":"elegir_rasgos_etapa2","parameters":{...}}],"reasoning_summary":"..."},"etapa3":{"actions":[{"action":"elegir_rasgos_etapa3","parameters":{...}}],"reasoning_summary":"..."}}',
    'Pon en cada parámetro valores de las listas del texto de sistema (los del ejemplo son inventados). Las intervenciones de más adelante (años de desarrollo y guerra) se te preguntarán después, una a una, con el estado del mundo.',
    RECORDATORIO_FORMATO,
  ].join('\n\n');
}

// Todos los textos y su manifiesto. `partida`: ya resuelta. `eleccionesPrevias`: { etapa2: {...tus_elecciones}, ... } opcional para los mensajes por etapas.
export function generarPrompts({ partida, cat = CATALOGO_ERA }) {
  const sistema = construirSistemaEra(partida, cat);
  const sistemaHash = hashTexto(sistema);
  const completo = [sistema, SEPARADOR, mensajeBorradorCompleto(partida)].join('\n\n');
  const etapa1 = [sistema, SEPARADOR, 'MENSAJE DE ESTA LLAMADA (JSON):', usuarioDeEtapa(partida, 1), RECORDATORIO_FORMATO].join('\n\n');
  const archivos = { 'sistema.txt': sistema, '1-borrador-completo.txt': completo, '2-solo-etapa1.txt': etapa1 };
  const manifiesto = {
    version: 1, tipo: 'manifiesto-prompts-era', envoltura_version: ENVOLTURA_MANUAL_VERSION, rules_version: RULES_VERSION_ERA, prompt_version: PROMPT_VERSION_ERA, catalogo_version: cat.catalogo_version,
    sistema_hash: hashDelMotor(sistema), escenario: { anio_muro: partida.anioMuro, anio_limite: partida.anioLimite, anios_borrador: partida.aniosBorrador, intervenciones_desarrollo: partida.intervencionesDesarrollo, intervenciones_guerra: partida.intervencionesGuerra, ancho_muro: partida.muroAncho, minerales: partida.cantidadMinerales, unidades_iniciales: partida.unidadesIniciales },
    archivos: Object.fromEntries(Object.entries(archivos).map(([n, t]) => [n, { sha256: hashTexto(t), caracteres: t.length, tokens_estimados: estimarTokens(t) }])),
    nota_tokens: 'Estimación con 3,5 bytes por token (no medida con ningún tokenizador). El texto de sistema se pega UNA vez por chat.',
  };
  return { archivos, manifiesto, sistema };
}

// Mensaje de la etapa 2 o 3 para el modo «por etapas» (un chat, un mensaje por etapa): lleva `tus_elecciones` con lo que ese modelo ya eligió.
// `elecciones`: { raza, mineral, bioma, rasgos } de las etapas anteriores (salen de sus respuestas guardadas, ya validadas).
export function mensajeDeEtapa(p, etapa, elecciones) {
  const tus = { raza: elecciones.raza, mineral: elecciones.mineral, bioma: elecciones.bioma ?? null, rasgos: elecciones.rasgos ?? {}, rasgos_aplicados: {}, rasgos_pendientes: {}, rasgos_no_aplicados: [], extras: [] };
  return ['MENSAJE DE ESTA LLAMADA (JSON):', usuarioDeEtapa(p, etapa, { eleccionesPrevias: tus }), RECORDATORIO_FORMATO].join('\n\n');
}

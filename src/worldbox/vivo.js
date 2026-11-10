import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PALETA } from '../../web/paleta.js';
import { ranking as clasificar } from './puntuacion.js';

// Estado EN VIVO de la partida para el modo grabacion (docs/worldbox-grabacion.md). La pagina de OBS lo lee a cada rato:
// aqui solo se arma y se escribe; nada de esto toca las reglas, la puntuacion ni la telemetria.
// NO importa src/modelos.js (cargaria el .env): la tabla de modelos de abajo se contrasta con ese archivo en una prueba.
export const VERSION_VIVO = 1;
export const FASES = Object.freeze(['preparando', 'pensando', 'decidio', 'esperando', 'aplicando', 'turno', 'fin']);
export const MAX_RAZON = 160;

// id de proveedor (el de CONTENDIENTES) -> clave de web/paleta.js, que trae el nombre corto y el color.
export const MODELO_A_PALETA = Object.freeze({
  'anthropic/claude-sonnet-5.5': 'claude', 'openai/gpt-6.1-sol': 'gpt', 'google/gemini-3.8-flash': 'gemini', 'meta-llama/llama-4-maverick': 'llama', 'deepseek/deepseek-v3.2': 'deepseek',
  'nvidia/nemotron-3-ultra-550b-a55b:free': 'nemotron-ultra', 'nvidia/nemotron-3-super-120b-a12b:free': 'nemotron-super', 'poolside/laguna-s-2.1:free': 'laguna', 'inclusionai/ling-3.1-flash': 'ling',
  'anthropic/claude-haiku-5.5': 'haiku', 'openai/gpt-6-luna': 'luna', 'google/gemini-3.5-flash-lite': 'flash-lite', 'mistralai/mistral-medium-3-5': 'mistral', 'x-ai/grok-4.3': 'grok',
  'qwen/qwen3.8-max-0902': 'qwen', 'minimax/minimax-m3': 'minimax', 'z-ai/glm-5.3': 'glm', 'moonshotai/kimi-k3.1-pro': 'kimi', 'mistralai/ministral-8b-2512': 'ministral',
  'qwen/qwen3.7-flash': 'qwen-flash', 'z-ai/glm-5.3-flash': 'glm-flash', 'microsoft/phi-4': 'phi4',
});
export const MODELOS_CONOCIDOS = Object.freeze(Object.keys(MODELO_A_PALETA));
// Participantes sin API: nombre y color propios (no son modelos, no estan en la paleta de la marca) y la razon FIJA que muestran.
const BOTS = Object.freeze({
  'bot-voraz': { nombre: 'Bot Voraz', color: '#E0524D', razon: 'Jugador automático de prueba: ataca en cuanto el reglamento se lo permite.' },
  'bot-aleatorio': { nombre: 'Bot Aleatorio', color: '#9AA0A6', razon: 'Jugador automático de prueba: elige al azar entre las órdenes válidas.' },
  'bot-pasivo': { nombre: 'Bot Pasivo', color: '#7FB069', razon: 'Jugador automático de prueba: siempre espera.' },
  'bot-expansionista': { nombre: 'Bot Expansionista', color: '#F2C14E', razon: 'Jugador automático de prueba: crece sin atacar a nadie.' },
  'bot-roto': { nombre: 'Bot Roto', color: '#C77DFF', razon: 'Jugador automático de prueba: falla a propósito para probar los descartes.' },
});
const COLOR_NEUTRO = '#B8B8B8', RAZON_BOT_GENERICO = 'Jugador automático de prueba.';

const titulo = s => s.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase());
// Identidad de un modelo o bot: nombre corto y color base. Un id desconocido NUNCA se muestra tal cual con su proveedor.
export function identidadBase(modelo) {
  const m = String(modelo ?? '');
  if (Object.hasOwn(BOTS, m)) return { nombre: BOTS[m].nombre, color: BOTS[m].color, bot: m };
  const clave = MODELO_A_PALETA[m];
  if (clave && PALETA[clave]) return { nombre: PALETA[clave].nombre, color: PALETA[clave].color, bot: null };
  const final = m.split('/').at(-1).split(':')[0];
  return { nombre: titulo(final) || 'Participante', color: COLOR_NEUTRO, bot: null };
}
const hex = c => /^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : [184, 184, 184];
// Un mismo modelo repetido comparte color de marca: se separa mezclando con negro/blanco para que no se confundan en pantalla.
export function variarColor(color, indice) {
  if (indice === 0) return color;
  const objetivo = indice % 2 === 1 ? 0 : 255, t = 0.28 + 0.12 * Math.floor((indice - 1) / 2);
  return '#' + hex(color).map(v => Math.round(v + (objetivo - v) * t).toString(16).padStart(2, '0')).join('');
}
// participantes: [{id, modelo}] en orden de asiento. Devuelve Map id -> {id, nombre, color, bot}. Si un nombre se repite lleva letra A, B... por orden.
export function identidades(participantes) {
  // E10: `nombre` y `color` del participante (hex) mandan sobre los de la tabla: la presentación del reino se decide una sola vez (era/presentacion-era.js).
  const base = participantes.map(p => { const i = identidadBase(p.modelo); return { id: p.id, ...i, ...(p.nombre ? { nombre: p.nombre } : {}), ...(p.reino ? { reino: p.reino } : {}), ...(/^#[0-9a-f]{6}$/i.test(p.color ?? '') ? { color: p.color, fijo: true } : {}) }; });
  const veces = new Map(); for (const b of base) veces.set(b.nombre, (veces.get(b.nombre) ?? 0) + 1);
  const visto = new Map();
  return new Map(base.map(b => {
    if (veces.get(b.nombre) === 1) return [b.id, b];
    const i = visto.get(b.nombre) ?? 0; visto.set(b.nombre, i + 1);
    return [b.id, { ...b, nombre: `${b.nombre} ${String.fromCharCode(65 + i)}`, color: b.fijo ? b.color : variarColor(b.color, i) }];
  }));
}

// ---- Textos (funciones puras) ----
const RECURSOS = Object.freeze({ wood: 'madera', stone: 'piedra', gold: 'oro', common_metals: 'metales' });
const bajar = s => s.charAt(0).toLowerCase() + s.slice(1), subir = s => s.charAt(0).toUpperCase() + s.slice(1);
const num = v => Number.isFinite(v) ? v : null;
// Una orden ya validada ({action, parameters}) -> frase en tercera persona, sin sujeto: «Declara la guerra a GPT Luna».
// `nombreDe(idFaccion)` traduce el objetivo al nombre del modelo; nunca sale el id interno.
export function textoDeAccion(accion, { nombreDe = () => null, especie = 'human' } = {}) {
  const a = accion?.action, p = accion?.parameters ?? {}, rival = () => nombreDe(p.objetivo) ?? 'un rival';
  switch (a) {
    case 'crear_unidades': { const n = num(p.cantidad); const humano = especie === 'human' || !especie;
      return n === null ? 'Crea unidades' : `Crea ${n} ${humano ? (n === 1 ? 'aldeano' : 'aldeanos') : (n === 1 ? 'unidad' : 'unidades')}`; }
    case 'bendecir': return 'Bendice a su gente';
    case 'maldecir': return `Maldice a ${rival()}`;
    case 'incendiar': return `Lanza fuego sobre ${rival()}`;
    case 'donar_recursos': { const n = num(p.cantidad); return `Dona ${n === null ? 'recursos' : `${n} de ${RECURSOS[p.recurso] ?? 'recursos'}`}`; }
    case 'declarar_guerra': return `Declara la guerra a ${rival()}`;
    case 'pedir_paz': return `Pide la paz a ${rival()}`;
    case 'esperar': return 'Espera';
    // Simulador
    case 'recolectar': return 'Recolecta recursos';
    case 'expandir': return 'Expande su territorio';
    case 'fundar': return 'Funda una ciudad';
    case 'reclutar': return 'Recluta tropas';
    case 'atacar': return `Ataca a ${rival()}`;
    default: return subir(String(a ?? 'espera').replace(/_/g, ' '));
  }
}
const unir = f => f.length <= 1 ? (f[0] ?? '') : `${f.slice(0, -1).join(', ')} y ${f.at(-1)}`;
// Varias ordenes -> una frase: «Crea 5 aldeanos y bendice a su gente». `esperar` solo cuenta si no hay otra cosa.
export function textoDeAcciones(acciones, opciones) {
  const lista = (acciones ?? []).filter(a => a?.action !== 'esperar');
  if (lista.length === 0) return 'Espera';
  return unir(lista.map((a, i) => { const t = textoDeAccion(a, opciones); return i === 0 ? t : bajar(t); }));
}
// reasoning_summary -> hasta `max` caracteres, cortado en palabra entera (con «…» si se recorta). Espacios y saltos colapsados.
export function recortarRazon(texto, max = MAX_RAZON) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1), espacio = corte.lastIndexOf(' ');
  const base = (espacio > 0 && t[max - 1] !== ' ' ? corte.slice(0, espacio) : corte).replace(/[\s,;:.\-–—(]+$/, '');
  return `${base}…`;
}
export function razonDeBot(modelo) { return BOTS[modelo]?.razon ?? RAZON_BOT_GENERICO; }
const MOTIVO_ERROR = Object.freeze({ tiempo_agotado: 'No respondió a tiempo', proveedor: 'No pudo responder', '429': 'No pudo responder', conexion: 'No pudo responder', circuito_abierto: 'No pudo responder' });
export const textoDeError = error => MOTIVO_ERROR[error] ?? 'No dio una orden válida';

// Decision para el estado en vivo. `p`: {id, modelo}; `evento`: lo que el orquestador avisa en la fase `decidio`.
export function construirDecision(evento, ids, p, especie) {
  const nombreDe = id => ids.get(id)?.nombre ?? null, id = ids.get(p.id);
  const acciones = (evento.acciones ?? []).map(a => ({ accion: a.action, texto: textoDeAccion(a, { nombreDe, especie }) }));
  const bot = id?.bot ?? null;
  const razon = bot ? razonDeBot(bot) : recortarRazon(evento.razon ?? '');
  const texto = evento.error && !acciones.some(a => a.accion !== 'esperar') ? textoDeError(evento.error) : textoDeAcciones(evento.acciones, { nombreDe, especie });
  return { participante: id?.nombre ?? 'Participante', texto, razon, acciones: acciones.length ? acciones : [{ accion: 'esperar', texto: 'Espera' }] };
}

// ---- Estado ----
export function construirRanking(filas, supervivencia) {
  return clasificar(filas, { supervivencia }).map(f => ({ id: f.participant_id, nombre: f.nombre, color: f.color, puesto: f.puesto, puntos: f.puntos, poblacion: f.poblacion, territorio: f.territorio, vivo: f.vivo }));
}
export function construirEstadoVivo({ fase, turno = 0, turnos = 0, tiempo_juego_s = 0, activo = null, facciones = [], decision = null, ultimo_evento = null, ranking = null, ganador = null, ahora = Date.now }) {
  return { version: VERSION_VIVO, actualizado: new Date(ahora()).toISOString(), fase, turno, turnos, tiempo_juego_s, activo, facciones, decision, ultimo_evento, ranking, ganador };
}
export const ganadorDe = ranking => ranking?.length && ranking[0].puesto === 1 && ranking[1]?.puesto !== 1 ? ranking[0].id : null;

// Escritura atomica: archivo temporal en la MISMA carpeta + rename. Un lector nunca ve un JSON a medias. Los reintentos cubren a
// Windows cuando el navegador tiene el archivo abierto justo en ese instante.
export async function escribirAtomico(ruta, valor, { reintentos = 10, esperaMs = 20 } = {}) {
  await mkdir(dirname(ruta), { recursive: true });
  const temporal = `${ruta}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temporal, JSON.stringify(valor, null, 2) + '\n', 'utf8');
  for (let i = 0; ; i++) {
    try { await rename(temporal, ruta); return; }
    catch (e) { if (i >= reintentos) { await rm(temporal, { force: true }); throw e; } await new Promise(r => setTimeout(r, esperaMs * (i + 1))); }
  }
}

// Observador del orquestador: traduce cada aviso de fase al JSON de arriba y lo escribe. Las escrituras van en cola (una a la vez)
// y un fallo al escribir NUNCA detiene la partida (se cuenta en `fallos`). `ids` sale de identidades(participantes).
export function crearEstadoVivo({ ruta, participantes, turnos = 0, supervivencia = false, especie = 'human', ahora = Date.now, escribir = escribirAtomico } = {}) {
  const ids = identidades(participantes), orden = participantes.map(p => p.id);
  let estado = null, cola = Promise.resolve(), fallos = 0, vivosAntes = null, evento = null, decision = null, tiempo = 0, escrituras = 0;
  const tabla = (snapshot, puntos) => orden.map(id => { const f = snapshot.find(x => x.id === id) ?? {}, i = ids.get(id);
    return { id, nombre: i.nombre, color: i.color, poblacion: f.poblacion ?? 0, ciudades: f.ciudades ?? 0, territorio: f.territorio ?? 0, vivo: f.vivo ?? false, puntos: puntos?.[id] ?? 0 }; });
  const guardar = valor => { estado = valor; escrituras++; cola = cola.then(() => escribir(ruta, valor)).catch(() => { fallos++; }); return cola; };
  const eliminados = (snapshot = []) => { const caidos = snapshot.filter(f => vivosAntes?.get(f.id) === true && !f.vivo).map(f => ids.get(f.id)?.nombre).filter(Boolean); vivosAntes = new Map(snapshot.map(f => [f.id, f.vivo])); return caidos; };
  const comun = e => ({ turnos, ahora, turno: e.turno ?? 0, tiempo_juego_s: tiempo, facciones: tabla(e.snapshot ?? [], e.puntos) });
  async function emitir(e) {
    if (e.tiempo_juego_s !== undefined && e.tiempo_juego_s !== null) tiempo = e.tiempo_juego_s;
    const p = participantes.find(x => x.id === e.activo), nombre = ids.get(e.activo)?.nombre;
    if (e.fase === 'preparando') { eliminados(e.snapshot ?? []); decision = null; evento = null; return guardar(construirEstadoVivo({ ...comun(e), fase: 'preparando' })); }
    if (e.fase === 'pensando') { decision = null; return guardar(construirEstadoVivo({ ...comun(e), fase: 'pensando', activo: e.activo, ultimo_evento: evento })); }
    if (e.fase === 'decidio') {
      decision = construirDecision(e, ids, p ?? { id: e.activo, modelo: '' }, especie);
      return guardar(construirEstadoVivo({ ...comun(e), fase: 'decidio', activo: e.activo, decision, ultimo_evento: evento }));
    }
    if (e.fase === 'esperando') { // modo manual: la decision sigue a la vista mientras se espera el Enter
      return guardar(construirEstadoVivo({ ...comun(e), fase: 'esperando', activo: e.activo, decision, ultimo_evento: evento }));
    }
    if (e.fase === 'aplicando') {
      decision = construirDecision(e, ids, p ?? { id: e.activo, modelo: '' }, especie); // con las ordenes ya validadas por el motor
      const caidos = eliminados(e.snapshot ?? []), reales = (e.acciones ?? []).filter(a => a.action !== 'esperar');
      if (caidos.length) evento = `${unir(caidos)} ${caidos.length > 1 ? 'han sido eliminados' : 'ha sido eliminado'}.`;
      else if (e.error && reales.length === 0) evento = `${nombre} ${bajar(decision?.texto ?? textoDeError(e.error))}.`;
      else if (reales.length && (e.rechazadas ?? 0) + (e.invalidas ?? 0) >= reales.length) evento = `${nombre} lo intentó, pero el juego rechazó la orden.`;
      else if (reales.length) evento = `${nombre} ${bajar(decision?.texto ?? '')}.`;
      else evento = `${nombre} espera.`;
      return guardar(construirEstadoVivo({ ...comun(e), fase: 'aplicando', activo: e.activo, decision, ultimo_evento: evento }));
    }
    if (e.fase === 'turno') {
      const caidos = eliminados(e.snapshot ?? []);
      evento = caidos.length ? `${unir(caidos)} ${caidos.length > 1 ? 'han sido eliminados' : 'ha sido eliminado'}.` : `Termina el turno ${e.turno} de ${turnos}.`;
      decision = null; return guardar(construirEstadoVivo({ ...comun(e), fase: 'turno', ultimo_evento: evento }));
    }
    if (e.fase === 'fin') {
      const filas = tabla(e.snapshot ?? [], e.puntos).map(f => ({ ...f, participant_id: f.id })), r = construirRanking(filas, supervivencia), g = ganadorDe(r);
      evento = g ? `Gana ${ids.get(g).nombre}.` : 'La partida termina sin un ganador único.';
      return guardar(construirEstadoVivo({ ...comun(e), fase: 'fin', ultimo_evento: evento, ranking: r, ganador: g }));
    }
    return null;
  }
  return { emitir, ids, cerrar: () => cola, ultimo: () => estado, fallos: () => fallos, escrituras: () => escrituras };
}

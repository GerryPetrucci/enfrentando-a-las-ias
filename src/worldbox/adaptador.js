import { exigir, copiar, objeto, PROTOCOLO, entero, RE_NOMBRE, RE_CODIGO } from './util.js';
import { faccionNormalizada, construirObservacion } from './observacion.js';

export const METODOS = ['info', 'reiniciarEscenario', 'observar', 'ejecutar', 'avanzar', 'estadoTerminal', 'cerrar'];
// Sin estas capacidades no hay competencia posible. `semilla` es opcional: sin ella la partida
// se juega igual, pero queda marcada como NO reproducible (info.determinista = false).
export const CAPACIDADES_OBLIGATORIAS = ['reiniciar', 'avanzar', 'terminal', 'multi_faccion'];

export function normalizarInfo(x) {
  exigir(x?.protocolo === PROTOCOLO, 'protocolo_incompatible');
  exigir(objeto(x.capacidades) && Array.isArray(x.acciones) && objeto(x.limites) && ['cargando', 'listo', 'ejecutando'].includes(x.estado), 'respuesta_invalida');
  // Solo cuentan las acciones que el puente declara verificadas: ninguna se infiere ni se inventa.
  const acciones = x.acciones.filter(a => objeto(a) && a.verificada === true).map(a => {
    exigir(RE_NOMBRE.test(a.nombre) && objeto(a.parametros) && typeof a.descripcion === 'string', 'respuesta_invalida');
    const parametros = {};
    for (const [k, s] of Object.entries(a.parametros)) {
      exigir(RE_NOMBRE.test(k) && objeto(s) && ['entero', 'numero', 'cadena', 'booleano'].includes(s.tipo), 'respuesta_invalida');
      const campo = { tipo: s.tipo };
      for (const n of ['minimo', 'maximo']) if (s[n] !== undefined) { exigir(Number.isFinite(s[n]), 'respuesta_invalida'); campo[n] = s[n]; }
      if (campo.minimo !== undefined && campo.maximo !== undefined) exigir(campo.minimo <= campo.maximo, 'respuesta_invalida');
      if (s.valores !== undefined) { exigir(Array.isArray(s.valores) && s.valores.length > 0 && s.valores.every(v => ['number', 'string', 'boolean'].includes(typeof v)), 'respuesta_invalida'); campo.valores = copiar(s.valores); }
      Object.defineProperty(parametros, k, { value: campo, enumerable: true });
    }
    const accion = { nombre: a.nombre, descripcion: a.descripcion.slice(0, 1000), verificada: true, parametros };
    // Opcionales: costo en puntos de accion y cooldown propios de esa accion; por defecto 1 y 0.
    if (a.puntos !== undefined) { exigir(entero(a.puntos, 0, 100), 'respuesta_invalida'); accion.puntos = a.puntos; }
    if (a.cooldown !== undefined) { exigir(entero(a.cooldown, 0, 1000), 'respuesta_invalida'); accion.cooldown = a.cooldown; }
    return accion;
  });
  exigir(new Set(acciones.map(a => a.nombre)).size === acciones.length, 'respuesta_invalida');
  const capacidades = Object.fromEntries(['reiniciar', 'semilla', 'avanzar', 'terminal', 'multi_faccion'].map(k => [k, x.capacidades[k] === true]));
  // Presentacion para grabar (opcionales): solo se conservan si el puente las anuncia verificadas; sin ellas la forma no cambia.
  for (const k of ['camara', 'interfaz', 'era', 'era_velocidad', 'era_mantener']) if (x.capacidades[k] === true) capacidades[k] = true; // era / era_velocidad: formato «era» (docs/worldbox-era.md)
  const version = v => ({ nombre: String(v?.nombre ?? '').slice(0, 100), version: String(v?.version ?? '').slice(0, 100) });
  // Del juego se conservan tambien el build de Steam y la version de Unity (trazabilidad de la ejecucion).
  const juego = v => ({ ...version(v), ...(typeof v?.build_steam === 'string' ? { build_steam: v.build_steam.slice(0, 100) } : {}), ...(typeof v?.unity === 'string' ? { unity: v.unity.slice(0, 100) } : {}) });
  exigir(Number.isFinite(x.limites.max_segundos_avance) && x.limites.max_segundos_avance > 0, 'respuesta_invalida');
  const max = x.limites.max_acciones_por_turno ?? 3;
  exigir(entero(max, 1, 100), 'respuesta_invalida');
  const origen = x.origen === 'simulado' ? 'simulado' : 'puente';
  // Honestidad sobre la reproducibilidad: solo el simulador es determinista por construccion. Un puente
  // sin semilla NO lo es; con semilla anunciada Node no puede comprobar la trayectoria completa ('desconocido').
  const determinista = origen === 'simulado' ? true : capacidades.semilla ? 'desconocido' : false;
  return { protocolo: PROTOCOLO, origen, determinista, puente: version(x.puente), juego: juego(x.juego), estado: x.estado, capacidades, acciones,
    limites: { max_segundos_avance: x.limites.max_segundos_avance, max_acciones_por_turno: max } };
}
export function normalizarReinicio(x) {
  exigir(objeto(x) && typeof x.escenario_id === 'string' && x.escenario_id.length > 0 && typeof x.hash_mundo === 'string' && Array.isArray(x.facciones), 'respuesta_invalida');
  exigir(x.facciones.every(f => objeto(f) && typeof f.id === 'string' && f.id.length > 0 && f.id.length <= 40), 'respuesta_invalida');
  // semilla_usada solo si el puente la informa: es lo que permite auditar si pidio una y uso otra.
  exigir(x.semilla_usada === undefined || x.semilla_usada === null || Number.isSafeInteger(x.semilla_usada), 'respuesta_invalida');
  // Datos de auditoria que el puente puede aportar por faccion (calidad del sitio inicial, especie) y del mundo generado:
  // solo escalares acotados, nunca objetos del juego. La equidad del terreno NO se supone: se registra para poder revisarla.
  const faccionAuditada = f => {
    const r = { id: f.id };
    if (f.especie !== undefined) { exigir(typeof f.especie === 'string' && /^[a-z_]{1,20}$/.test(f.especie), 'respuesta_invalida'); r.especie = f.especie; }
    if (f.calidad_sitio !== undefined) { exigir(entero(f.calidad_sitio, 0, 1e9), 'respuesta_invalida'); r.calidad_sitio = f.calidad_sitio; }
    return r;
  };
  const salida = { escenario_id: x.escenario_id.slice(0, 100), hash_mundo: x.hash_mundo.slice(0, 128), semilla_usada: x.semilla_usada ?? null, facciones: x.facciones.map(faccionAuditada) };
  if (objeto(x.mundo)) {
    const mundo = {};
    for (const k of ['ancho', 'alto', 'unidades_iniciales', 'intentos_mapa']) if (x.mundo[k] !== undefined) { exigir(entero(x.mundo[k], 0, 1e9), 'respuesta_invalida'); mundo[k] = x.mundo[k]; }
    for (const k of ['plantilla', 'tamano', 'velocidad']) if (x.mundo[k] !== undefined) { exigir(typeof x.mundo[k] === 'string' && /^[A-Za-z0-9_.-]{1,30}$/.test(x.mundo[k]), 'respuesta_invalida'); mundo[k] = x.mundo[k]; }
    salida.mundo = mundo;
  }
  // Formato «era»: lo que el puente informa de la preparacion (espejo, biomas, depositos...). Solo para la traza; acotado.
  if (objeto(x.era)) { const texto = JSON.stringify(x.era); if (texto.length <= 30000) salida.era = JSON.parse(texto); }
  const id = idSolicitud(x); if (id) salida.id_solicitud = id;
  return salida;
}
export function normalizarTerminal(x) {
  exigir(typeof x?.terminal === 'boolean' && Array.isArray(x.resumen_por_faccion), 'respuesta_invalida');
  return { terminal: x.terminal, razon: ['supervivencia', 'turnos', 'ninguna'].includes(x.razon) ? x.razon : 'ninguna', resumen_por_faccion: x.resumen_por_faccion.map(faccionNormalizada) };
}
// Identificador de la solicitud al puente (lo asigna el cliente HTTP): permite cruzar el log con la traza del mod.
export const idSolicitud = x => typeof x?.id_solicitud === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(x.id_solicitud) ? x.id_solicitud : null;
// `efecto` de una orden: SOLO escalares acotados (maximo 20 campos con nombre valido; numeros finitos, booleanos y textos de hasta 100
// caracteres); los objetos anidados del juego se descartan. Es lo que permite distinguir «pedi 5 y se crearon 1» de «se crearon 5».
export function acotarEfecto(e) {
  if (!objeto(e)) return null;
  const r = {};
  for (const [k, v] of Object.entries(e).slice(0, 20)) {
    if (!RE_NOMBRE.test(k)) continue;
    if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') r[k] = v;
    else if (typeof v === 'string') r[k] = v.slice(0, 100);
  }
  return Object.keys(r).length ? r : null;
}
export function normalizarEjecucion(x) {
  exigir(['ejecutada', 'rechazada', 'sin_efecto'].includes(x?.resultado), 'respuesta_invalida');
  const salida = { resultado: x.resultado, codigo: typeof x.codigo === 'string' && RE_CODIGO.test(x.codigo) ? x.codigo : 'sin_codigo' };
  const efecto = acotarEfecto(x.efecto), id = idSolicitud(x);
  if (efecto) salida.efecto = efecto;
  if (id) salida.id_solicitud = id;
  return salida;
}
export function normalizarAvance(x) {
  exigir(objeto(x) && Number.isFinite(x.tiempo_juego_s) && x.tiempo_juego_s >= 0 && typeof x.terminal === 'boolean', 'respuesta_invalida');
  const id = idSolicitud(x);
  return { tiempo_juego_s: x.tiempo_juego_s, terminal: x.terminal, ...(id ? { id_solicitud: id } : {}) };
}
// Comprobador de contrato: cualquier adaptador debe pasarlo. Sin `escenario` solo mira la forma y las
// capacidades; con `escenario` hace ademas una vuelta funcional completa (MODIFICA el escenario de prueba).
export async function comprobarAdaptador(a, { escenario } = {}) {
  exigir(METODOS.every(m => typeof a?.[m] === 'function'), 'adaptador_invalido');
  const info = normalizarInfo(await a.info());
  exigir(info.estado === 'listo' && CAPACIDADES_OBLIGATORIAS.every(k => info.capacidades[k]), 'no_soportado');
  if (escenario) {
    const reinicio = normalizarReinicio(await a.reiniciarEscenario(escenario));
    exigir(escenario.facciones.every(f => reinicio.facciones.some(g => g.id === f.id)), 'respuesta_invalida');
    construirObservacion(await a.observar(escenario.facciones[0].id));
    // `esperar` la resuelve el orquestador sin llamar al adaptador; solo se prueba si el adaptador la anuncia.
    if (info.acciones.some(x => x.nombre === 'esperar')) normalizarEjecucion(await a.ejecutar({ faccion: escenario.facciones[0].id, accion: 'esperar', parametros: {} }));
    normalizarAvance(await a.avanzar({ segundos_juego: 1 }));
    normalizarTerminal(await a.estadoTerminal());
  }
  return info;
}

// El gancho «Próximamente» (decidido el 20 de octubre de 2026): una pieza de unos 20 a 25 s que se sube ANTES de una parte para avisar que viene. Abre con una tarjeta («PRÓXIMAMENTE · juego ·
// partida y parte»), sigue con 2 a 5 cortes rapidos de momentos de ESA parte (cada uno precedido por una tarjeta con su etiqueta: «Traición», «Batalla decisiva»...) y cierra con una tarjeta que
// invita a seguir. Sin voz y sin musica (quien lo sube pone la suya). Sin spoilers: nunca la primera unidad (lleva la tarjeta de arranque) ni la ultima (trae el resultado).
//
// Aqui solo hay funciones puras sobre la lista de beats de la partida (`armarLinea`) y sus destacadas (`destacadasDe`): eligen los cortes y arman la lista de beats del gancho. Las tarjetas las
// dibuja MesaBase (`tarjeta-gancho`) y la pagina (escena.js) pone la velocidad de cada corte. Sin DOM ni red.

import { textoDeJuego } from './textos-juego.js';
import { duracionDeBeat } from './escena-config.js';
import { esc } from './kit.js';

export const GANCHO = {
  APERTURA_MS: 2500, CIERRE_MS: 3000, ETIQUETA_MS: 600, // las tarjetas
  CORTE_MS: 3500, VEL_MAX: 8, MAX_CORTE_MS: 6000, // un corte dura ~3.5 s: se acelera hasta 8x (el tope de la pagina); si ni asi baja de 6 s, no entra (un turno de 41 s a 8x dura 5.1 s: entra)
  MAX_CORTES: 5, PRESUPUESTO_MS: 20000, // lo que suman los cortes con sus etiquetas
};

// 28-10-2026, a pedido del usuario («en los clips de Guerra casi no se ve nada; que se distinga lo que pasa»): en Guerra de territorios un corte dura ~6 s, la aceleracion maxima baja de 8x a 3x, un corte no pasa
// de 12 s y el gancho llega a 4 cortes (hasta 36 s de cortes). Los demas juegos conservan los parametros de siempre.
export const GANCHO_POR_JUEGO = {
  conquista: { CORTE_MS: 6000, VEL_MAX: 3, MAX_CORTE_MS: 12000, MAX_CORTES: 4, PRESUPUESTO_MS: 36000 },
};
export const parametrosDeGancho = (juegoId) => ({ ...GANCHO, ...(GANCHO_POR_JUEGO[juegoId] ?? {}) });

// Del motivo mas fuerte al mas flojo: el corte se llama como el primero que tenga.
const ETIQUETAS = [
  ['traicion', 'Traición'], ['maravilla', 'La Maravilla'], ['batalla decisiva', 'Batalla decisiva'], ['caida', 'Caída de un reino'],
  ['batalla', 'Batalla'], ['conquista', 'Conquista'], ['pacto', 'Pacto'],
];
export function etiquetaDeCorte(motivos) {
  const lista = Array.isArray(motivos) ? motivos : [];
  return ETIQUETAS.find(([motivo]) => lista.includes(motivo))?.[1] ?? 'Momento clave';
}

// Juegos donde una unidad lleva mucho relleno y lo que se quiere ver es el MOMENTO. En Guerra de territorios un turno dura de 30 a 65 s (las ordenes y los mensajes de cada reino) y la batalla o la traicion, 6 a 10 s:
// acelerar el turno entero hasta que cupiera en un corte hacia que no se distinguiera nada. Para esos juegos el corte muestra SOLO el beat que cuenta el momento, a velocidad normal o casi. Cada funcion recibe los beats
// de la unidad y los motivos de su destacada, y devuelve [el beat del momento] o null (no hay momento que mostrar: se usa la unidad entera). El orden de los motivos es el de las etiquetas: la traicion manda.
const FOCO = {
  conquista: (deLaUnidad, motivos) => {
    const de = (tipo) => deLaUnidad.filter((b) => b.tipo === tipo), tiene = (...m) => m.some((x) => motivos.includes(x));
    const decisivas = (bs) => [...bs.filter((b) => b.pasos?.some((p) => p.tipo === 'tarjeta' && p.variante === 'C')), ...bs]; // la decisiva (pantalla VS) primero
    const elegidos = tiene('traicion') ? de('traicion') : tiene('maravilla') ? de('resolucion') : tiene('batalla decisiva') ? decisivas(de('batalla')) : tiene('batalla') ? de('batalla') : tiene('caida', 'conquista') ? de('resolucion') : [];
    return elegidos.length ? [elegidos[0]] : null;
  },
};

// Un corte: el momento de la unidad (con foco) o la unidad entera, acelerado para durar cerca de CORTE_MS (entre 1x y VEL_MAX). { unidad, etiqueta, vel, duracionMs (lo que dura a 1x), ms (lo que dura en el gancho),
// ids (solo con foco: los beats que se muestran) }. La pagina lo usa para armar los cortes que pide la direccion (gancho=1&cortes=...); elegirCortes, para decidir cuales. juegoId: el juego, para su foco.
export function armarCorte(beats, unidad, motivos, juegoId = null) {
  const deLaUnidad = (Array.isArray(beats) ? beats : []).filter((b) => b.mano === unidad);
  const foco = FOCO[juegoId]?.(deLaUnidad, Array.isArray(motivos) ? motivos : []) ?? null;
  const duracionMs = (foco ?? deLaUnidad).reduce((s, b) => s + duracionDeBeat(b, null, 1), 0);
  const P = parametrosDeGancho(juegoId), vel = Math.min(P.VEL_MAX, Math.max(1, duracionMs / P.CORTE_MS));
  return { unidad, etiqueta: etiquetaDeCorte(motivos), vel: Number(vel.toFixed(3)), duracionMs, ms: duracionMs / vel, ...(foco ? { ids: foco.map((b) => b.id) } : {}) };
}

// Los cortes que pide la direccion (gancho=1&cortes=10,6,14), en ese orden. La pagina no se fia de la URL: aunque la pidan, la primera unidad (tarjeta de arranque) y la ultima (resultado) no entran, ni una
// unidad que no existe. La etiqueta sale de los motivos de su destacada (sin ella, «Momento clave»).
export function cortesPedidos(beats, unidades, destacadas, juegoId = null) {
  const lista = Array.isArray(beats) ? beats : [];
  const validas = new Set([...new Set(lista.map((b) => b.mano))].slice(1, -1));
  const vistas = new Set();
  const cortes = [];
  for (const u of Array.isArray(unidades) ? unidades : []) {
    if (!validas.has(u) || vistas.has(u)) continue;
    vistas.add(u);
    cortes.push(armarCorte(lista, u, (Array.isArray(destacadas) ? destacadas : []).find((d) => d?.unidad === u)?.motivos, juegoId));
  }
  return cortes;
}

// Los cortes del gancho de una parte: de las destacadas, las que caen en la parte (`rango` = { mano, hasta } de dividirEnDos), sin la primera ni la ultima unidad de la PARTIDA, de mejor a peor mientras
// quepan en el presupuesto, y luego en orden de partida. Cada uno: { unidad, etiqueta, vel, duracionMs (lo que dura la unidad a 1x), ms (lo que dura en el gancho) }. Nunca lanza.
export function elegirCortes({ beats, destacadas, rango, juegoId = null } = {}) {
  const lista = Array.isArray(beats) ? beats : [];
  const unidades = [...new Set(lista.map((b) => b.mano))];
  const desde = Number.isFinite(rango?.mano) ? rango.mano : -Infinity, hasta = Number.isFinite(rango?.hasta) ? rango.hasta : Infinity;
  const permitidas = new Set(unidades.slice(1, -1).filter((u) => u >= desde && u <= hasta));
  const elegidos = [], P = parametrosDeGancho(juegoId);
  let usado = 0;
  for (const d of Array.isArray(destacadas) ? destacadas : []) {
    if (elegidos.length >= P.MAX_CORTES) break;
    if (!permitidas.has(d?.unidad) || !(d.puntos > 0) || elegidos.some((c) => c.unidad === d.unidad)) continue; // sin puntos no hay momento que ensenar
    const corte = armarCorte(lista, d.unidad, d.motivos, juegoId);
    if (!(corte.ms > 0) || corte.ms > P.MAX_CORTE_MS || usado + corte.ms + P.ETIQUETA_MS > P.PRESUPUESTO_MS) continue;
    elegidos.push(corte);
    usado += corte.ms + P.ETIQUETA_MS;
  }
  return elegidos.sort((a, b) => a.unidad - b.unidad);
}

const AVISO = 'Contenido generado por IA · Proyecto independiente';

// Lo que dicen las tarjetas (publico: con acentos). `de` = cuantas partes tiene el juego; con una sola no se habla de partes. Ya no son «partidas», son juegos (28-10-2026): se dice el numero de
// JUEGO (el jN del paquete, como en el gancho en imagen), no el de la partida dentro del archivo, que casi siempre es 1. Sin numero de juego no se inventa uno.
export function textosDeGancho(contexto) {
  const { juegoId, juegoNumero = null, parte = 1, de = 2 } = contexto ?? {};
  const t = textoDeJuego(juegoId);
  const nombre = t?.nombre ?? 'Enfrentando a las IAs';
  const juego = Number.isInteger(juegoNumero) && juegoNumero >= 1 ? `Juego ${juegoNumero}` : null;
  const varias = Number.isInteger(de) && de > 1;
  const ultima = varias && parte >= de;
  return {
    kicker: 'PRÓXIMAMENTE',
    nombre,
    detalle: varias ? [juego, `Parte ${parte} de ${de}`].filter(Boolean).join(' · ') : (juego ?? ''),
    cierreKicker: 'NO TE LA PIERDAS',
    cierreTitulo: varias ? `Parte ${parte} de ${de}` : (juego ?? nombre),
    cierreDetalle: varias ? [nombre, juego].filter(Boolean).join(' · ') : nombre,
    cierre: ultima ? 'Síguenos para ver el desenlace' : 'Síguenos para no perdértela',
    aviso: AVISO,
  };
}

const tarjeta = (id, modo, minMs, datos) => ({
  id, mano: 0, tipo: 'tarjeta-gancho', registro: 0, asiento: null, camara: [], texto: '', lineas: [], minMs, reemplazo: false,
  pasos: [{ tipo: 'gancho', modo, ...datos }],
});

// La lista de beats del gancho: apertura, [etiqueta + beats del corte]..., cierre. Los beats de cada corte son copias con `vel` (la velocidad del corte) y `corte` (su numero).
export function armarGancho(beats, cortes, contexto = {}) {
  const lista = Array.isArray(beats) ? beats : [];
  const textos = textosDeGancho(contexto);
  const salida = [tarjeta('gancho-apertura', 'apertura', GANCHO.APERTURA_MS, textos)];
  (Array.isArray(cortes) ? cortes : []).forEach((c, i) => {
    salida.push(tarjeta(`gancho-etiqueta-${i + 1}`, 'etiqueta', GANCHO.ETIQUETA_MS, { etiqueta: c.etiqueta, numero: i + 1, total: cortes.length }));
    for (const b of lista) if (c.ids ? c.ids.includes(b.id) : b.mano === c.unidad) salida.push({ ...b, vel: c.vel, corte: i }); // con foco, solo el momento
  });
  salida.push(tarjeta('gancho-cierre', 'cierre', GANCHO.CIERRE_MS, textos));
  return salida;
}

export const IDENTIFICADOR_MS = 2500; // lo que dura la tarjeta que abre cada parte y cada clip

// La tarjeta que abre TODA parte y TODO clip para que se sepa de que juego es (pedido del usuario el 28-10-2026: cada gancho, clip y parte lleva su jN). Es la misma tarjeta de apertura del gancho (marco dorado,
// a pantalla completa dentro de la zona segura) con «JUEGO N», el nombre del juego y, debajo, la pieza: «Parte 1 de 2» o «Clip 2 · Parte 1 de 2». Va en la unidad del primer beat (como el intro) y no lleva voz.
// Sin numero de juego (una direccion vieja) o sin beats, los beats quedan tal cual; si ya la traen, no se duplica. Sin DOM.
export function conIdentificador(beats, contexto) {
  if (!Array.isArray(beats) || !beats.length) return [];
  const { juegoId, juegoNumero, parte = null, de = null, clip = null } = contexto && typeof contexto === 'object' ? contexto : {};
  if (!Number.isInteger(juegoNumero) || juegoNumero < 1 || beats[0]?.id === 'identificador') return beats;
  const entero = (n) => Number.isInteger(n) && n >= 1;
  const detalle = [entero(clip) ? `Clip ${clip}` : null, entero(parte) && entero(de) && de > 1 ? `Parte ${parte} de ${de}` : null].filter(Boolean).join(' · ');
  const datos = { kicker: `Juego ${juegoNumero}`, nombre: textoDeJuego(juegoId)?.nombre ?? 'Enfrentando a las IAs', detalle, aviso: AVISO };
  return [{ ...tarjeta('identificador', 'apertura', IDENTIFICADOR_MS, datos), mano: beats[0].mano }, ...beats];
}

// El HTML de una tarjeta segun su `paso` ({ tipo: 'gancho', modo, ... }); lo pone MesaBase.ejecutarTarjetaGancho dentro de la zona segura. Un modo desconocido da una tarjeta vacia.
export function htmlDeTarjeta(paso) {
  const p = paso && typeof paso === 'object' ? paso : {};
  if (p.modo === 'apertura') return `<div class="tg-kicker">${esc(p.kicker)}</div><div class="tg-nombre">${esc(p.nombre)}</div><div class="tg-detalle">${esc(p.detalle)}</div><div class="tg-pie">${esc(p.aviso)}</div>`;
  if (p.modo === 'etiqueta') return `<div class="tg-num">${esc(p.numero)} / ${esc(p.total)}</div><div class="tg-etiqueta">${esc(p.etiqueta)}</div>`;
  if (p.modo === 'cierre') return `<div class="tg-kicker">${esc(p.cierreKicker)}</div><div class="tg-nombre">${esc(p.cierreTitulo)}</div><div class="tg-detalle">${String(p.cierreDetalle ?? '').split(' · ').map(esc).join('<br>')}</div><div class="tg-cta">${esc(p.cierre)}</div><div class="tg-pie">${esc(p.aviso)}</div>`;
  return '';
}

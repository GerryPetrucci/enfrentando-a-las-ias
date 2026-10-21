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

// Del motivo mas fuerte al mas flojo: el corte se llama como el primero que tenga.
const ETIQUETAS = [
  ['traicion', 'Traición'], ['maravilla', 'La Maravilla'], ['batalla decisiva', 'Batalla decisiva'], ['caida', 'Caída de un reino'],
  ['batalla', 'Batalla'], ['conquista', 'Conquista'], ['pacto', 'Pacto'],
];
export function etiquetaDeCorte(motivos) {
  const lista = Array.isArray(motivos) ? motivos : [];
  return ETIQUETAS.find(([motivo]) => lista.includes(motivo))?.[1] ?? 'Momento clave';
}

// Un corte: la unidad entera acelerada para durar cerca de CORTE_MS (entre 1x y VEL_MAX). { unidad, etiqueta, vel, duracionMs (lo que dura la unidad a 1x), ms (lo que dura en el gancho) }.
// La pagina lo usa para armar los cortes que pide la direccion (gancho=1&cortes=...); elegirCortes, para decidir cuales.
export function armarCorte(beats, unidad, motivos) {
  const duracionMs = (Array.isArray(beats) ? beats : []).filter((b) => b.mano === unidad).reduce((s, b) => s + duracionDeBeat(b, null, 1), 0);
  const vel = Math.min(GANCHO.VEL_MAX, Math.max(1, duracionMs / GANCHO.CORTE_MS));
  return { unidad, etiqueta: etiquetaDeCorte(motivos), vel: Number(vel.toFixed(3)), duracionMs, ms: duracionMs / vel };
}

// Los cortes que pide la direccion (gancho=1&cortes=10,6,14), en ese orden. La pagina no se fia de la URL: aunque la pidan, la primera unidad (tarjeta de arranque) y la ultima (resultado) no entran, ni una
// unidad que no existe. La etiqueta sale de los motivos de su destacada (sin ella, «Momento clave»).
export function cortesPedidos(beats, unidades, destacadas) {
  const lista = Array.isArray(beats) ? beats : [];
  const validas = new Set([...new Set(lista.map((b) => b.mano))].slice(1, -1));
  const vistas = new Set();
  const cortes = [];
  for (const u of Array.isArray(unidades) ? unidades : []) {
    if (!validas.has(u) || vistas.has(u)) continue;
    vistas.add(u);
    cortes.push(armarCorte(lista, u, (Array.isArray(destacadas) ? destacadas : []).find((d) => d?.unidad === u)?.motivos));
  }
  return cortes;
}

// Los cortes del gancho de una parte: de las destacadas, las que caen en la parte (`rango` = { mano, hasta } de dividirEnDos), sin la primera ni la ultima unidad de la PARTIDA, de mejor a peor mientras
// quepan en el presupuesto, y luego en orden de partida. Cada uno: { unidad, etiqueta, vel, duracionMs (lo que dura la unidad a 1x), ms (lo que dura en el gancho) }. Nunca lanza.
export function elegirCortes({ beats, destacadas, rango } = {}) {
  const lista = Array.isArray(beats) ? beats : [];
  const unidades = [...new Set(lista.map((b) => b.mano))];
  const desde = Number.isFinite(rango?.mano) ? rango.mano : -Infinity, hasta = Number.isFinite(rango?.hasta) ? rango.hasta : Infinity;
  const permitidas = new Set(unidades.slice(1, -1).filter((u) => u >= desde && u <= hasta));
  const elegidos = [];
  let usado = 0;
  for (const d of Array.isArray(destacadas) ? destacadas : []) {
    if (elegidos.length >= GANCHO.MAX_CORTES) break;
    if (!permitidas.has(d?.unidad) || !(d.puntos > 0) || elegidos.some((c) => c.unidad === d.unidad)) continue; // sin puntos no hay momento que ensenar
    const corte = armarCorte(lista, d.unidad, d.motivos);
    if (!(corte.ms > 0) || corte.ms > GANCHO.MAX_CORTE_MS || usado + corte.ms + GANCHO.ETIQUETA_MS > GANCHO.PRESUPUESTO_MS) continue;
    elegidos.push(corte);
    usado += corte.ms + GANCHO.ETIQUETA_MS;
  }
  return elegidos.sort((a, b) => a.unidad - b.unidad);
}

// Lo que dicen las tarjetas (publico: con acentos). `de` = cuantas partes tiene el juego; con una sola no se habla de partes.
export function textosDeGancho(contexto) {
  const { juegoId, partidaNumero = 1, parte = 1, de = 2 } = contexto ?? {};
  const t = textoDeJuego(juegoId);
  const varias = Number.isInteger(de) && de > 1;
  const ultima = varias && parte >= de;
  return {
    kicker: 'PRÓXIMAMENTE',
    nombre: t?.nombre ?? 'Enfrentando a las IAs',
    detalle: varias ? `Partida ${partidaNumero} · Parte ${parte} de ${de}` : `Partida ${partidaNumero}`,
    cierreKicker: 'NO TE LA PIERDAS',
    cierreTitulo: varias ? `Parte ${parte} de ${de}` : `Partida ${partidaNumero}`,
    cierreDetalle: varias ? `${t?.nombre ?? 'Enfrentando a las IAs'} · Partida ${partidaNumero}` : (t?.nombre ?? 'Enfrentando a las IAs'),
    cierre: ultima ? 'Síguenos para ver el desenlace' : 'Síguenos para no perdértela',
    aviso: 'Contenido generado por IA · Proyecto independiente',
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
    for (const b of lista) if (b.mano === c.unidad) salida.push({ ...b, vel: c.vel, corte: i });
  });
  salida.push(tarjeta('gancho-cierre', 'cierre', GANCHO.CIERRE_MS, textos));
  return salida;
}

// El HTML de una tarjeta segun su `paso` ({ tipo: 'gancho', modo, ... }); lo pone MesaBase.ejecutarTarjetaGancho dentro de la zona segura. Un modo desconocido da una tarjeta vacia.
export function htmlDeTarjeta(paso) {
  const p = paso && typeof paso === 'object' ? paso : {};
  if (p.modo === 'apertura') return `<div class="tg-kicker">${esc(p.kicker)}</div><div class="tg-nombre">${esc(p.nombre)}</div><div class="tg-detalle">${esc(p.detalle)}</div><div class="tg-pie">${esc(p.aviso)}</div>`;
  if (p.modo === 'etiqueta') return `<div class="tg-num">${esc(p.numero)} / ${esc(p.total)}</div><div class="tg-etiqueta">${esc(p.etiqueta)}</div>`;
  if (p.modo === 'cierre') return `<div class="tg-kicker">${esc(p.cierreKicker)}</div><div class="tg-nombre">${esc(p.cierreTitulo)}</div><div class="tg-detalle">${esc(p.cierreDetalle)}</div><div class="tg-cta">${esc(p.cierre)}</div><div class="tg-pie">${esc(p.aviso)}</div>`;
  return '';
}

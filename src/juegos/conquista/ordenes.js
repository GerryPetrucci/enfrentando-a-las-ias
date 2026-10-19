// Convierte lo que responde un modelo en jugadas utilizables. NUNCA lanza error: lo que no sirve se descarta con un motivo
// y el resto se aplica. Aqui solo se valida la forma del texto; que la region sea tuya o que alcancen los recursos
// se valida despues, con el estado, en las fases del turno.

import { RECURSOS, NOMBRES_REINOS, MAX_ORDENES, MAX_PRIVADOS, LARGO_MENSAJE, LARGO_NOTA, LARGO_RAZON } from './constantes.js';

export const limpiar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const REINOS = NOMBRES_REINOS.map(limpiar);
const RECURSOS_POR_NOMBRE = new Map(RECURSOS.map((r) => [limpiar(r), r]));
const EDIFICIOS = ['granja', 'mercado', 'cuartel', 'maravilla'];

const region = (t) => { const m = /^r0*(\d{1,3})$/.exec(t ?? ''); return m && Number(m[1]) >= 1 ? Number(m[1]) - 1 : null; };

// Los nombres con los que se entiende a un reino en ESTA partida: primero los de sus reinos, en el orden de los asientos, y despues los de siempre que no estan en juego (el indice de esos es de un reino
// que no existe y las fases del turno lo descartan, como siempre). Sin estado, los de siempre.
export const nombresDeLaPartida = (E) => {
  const propios = Array.isArray(E?.reinos) ? E.reinos.map((r) => String(r?.nombre ?? '')) : [];
  return [...propios, ...NOMBRES_REINOS.filter((n) => !propios.includes(n))];
};
const recurso = (t) => RECURSOS_POR_NOMBRE.get(t) ?? null;
const entero = (t) => (/^\d{1,4}$/.test(t ?? '') && Number(t) >= 1 ? Number(t) : null);

const ok = (orden) => ({ ok: true, orden });
const mal = (motivo) => ({ ok: false, motivo });
const uso = (u) => mal(`faltan o sobran datos (uso: ${u})`);
const campo = (que, valor) => mal(`${que} invalido: "${String(valor).slice(0, 30)}"`);

export function parsearOrden(texto, reinos = REINOS) {
  const t = limpiar(texto).split(' ').filter(Boolean);
  const verbo = t[0];
  const reino = (nombre) => { const i = reinos.indexOf(nombre); return i >= 0 ? i : null; };
  switch (verbo) {
    case 'armar':
      return t.length === 1 ? ok({ tipo: 'armar' }) : uso('armar');
    case 'reclutar':
    case 'mercenarios': {
      if (t.length !== 3) return uso(`${verbo} REGION N`);
      const r = region(t[1]), n = entero(t[2]);
      if (r === null) return campo('region', t[1]);
      if (n === null) return campo('cantidad', t[2]);
      return ok({ tipo: verbo, region: r, n });
    }
    case 'mover': {
      if (t.length !== 4) return uso('mover DESDE HASTA N');
      const de = region(t[1]), a = region(t[2]), n = entero(t[3]);
      if (de === null) return campo('region de origen', t[1]);
      if (a === null) return campo('region de destino', t[2]);
      if (n === null) return campo('cantidad', t[3]);
      return ok({ tipo: 'mover', de, a, n });
    }
    case 'fortificar': {
      if (t.length !== 2) return uso('fortificar REGION');
      const r = region(t[1]);
      return r === null ? campo('region', t[1]) : ok({ tipo: 'fortificar', region: r });
    }
    case 'regalar': {
      if (t.length !== 4) return uso('regalar RECURSO CANTIDAD REINO');
      const rec = recurso(t[1]), n = entero(t[2]), re = reino(t[3]);
      if (rec === null) return campo('recurso', t[1]);
      if (n === null) return campo('cantidad', t[2]);
      if (re === null) return campo('reino', t[3]);
      return ok({ tipo: 'regalar', recurso: rec, n, reino: re });
    }
    case 'ofrecer': {
      if (t.length !== 6) return uso('ofrecer REINO RECURSO CANT RECURSO CANT');
      const re = reino(t[1]), doy = recurso(t[2]), dc = entero(t[3]), pido = recurso(t[4]), pc = entero(t[5]);
      if (re === null) return campo('reino', t[1]);
      if (doy === null) return campo('recurso', t[2]);
      if (dc === null) return campo('cantidad', t[3]);
      if (pido === null) return campo('recurso', t[4]);
      if (pc === null) return campo('cantidad', t[5]);
      return ok({ tipo: 'ofrecer', reino: re, doy, dc, pido, pc });
    }
    case 'aceptar':
    case 'romper': {
      if (t.length !== 2) return uso(`${verbo} REINO`);
      const re = reino(t[1]);
      return re === null ? campo('reino', t[1]) : ok({ tipo: verbo, reino: re });
    }
    case 'construir': {
      if (t.length !== 3) return uso('construir REGION EDIFICIO');
      const r = region(t[1]);
      if (r === null) return campo('region', t[1]);
      if (!EDIFICIOS.includes(t[2])) return campo('edificio', t[2]);
      return ok({ tipo: 'construir', region: r, edificio: t[2] });
    }
    default:
      return mal(`orden desconocida: "${String(verbo ?? '').slice(0, 30)}"`);
  }
}

const texto = (x, largo) => (typeof x === 'string' ? x.trim().slice(0, largo) : '');

function normalizar(r, reinos, nombres) {
  const reino = (nombre) => { const i = reinos.indexOf(nombre); return i >= 0 ? i : null; };
  const base = { ordenes: [], descartadas: [], pactoCon: null, mensaje: '', privados: [], nota: undefined, razon: '', invalida: false, motivo: null };
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { ...base, invalida: true, motivo: 'la respuesta no es un objeto JSON' };
  const out = base;
  // ordenes: lista de textos (o un solo texto); las sobrantes se ignoran
  const crudas = Array.isArray(r.ordenes) ? r.ordenes : typeof r.ordenes === 'string' ? [r.ordenes] : [];
  crudas.slice(0, 60).forEach((x, i) => {
    if (typeof x !== 'string') { out.descartadas.push({ texto: `(${typeof x})`, motivo: 'la orden no es texto' }); return; }
    const corto = x.slice(0, 80);
    if (i >= MAX_ORDENES) { out.descartadas.push({ texto: corto, motivo: `mas de ${MAX_ORDENES} ordenes: se ignoran las sobrantes` }); return; }
    const p = parsearOrden(x, reinos);
    if (p.ok) out.ordenes.push({ ...p.orden, texto: corto });
    else out.descartadas.push({ texto: corto, motivo: p.motivo });
  });
  // pacto_con
  if (typeof r.pacto_con === 'string') {
    const n = limpiar(r.pacto_con);
    if (n && !['null', 'ninguno', 'nadie', 'ninguna'].includes(n)) {
      const re = reino(n);
      if (re === null) out.descartadas.push({ texto: `pacto_con ${r.pacto_con.slice(0, 30)}`, motivo: 'ese reino no existe' });
      else out.pactoCon = re;
    }
  }
  out.mensaje = texto(r.mensaje, LARGO_MENSAJE);
  // privados: maximo 2, a reinos distintos
  const vistos = new Set();
  (Array.isArray(r.privados) ? r.privados : []).slice(0, 20).forEach((p) => {
    const re = p && typeof p === 'object' && typeof p.a === 'string' ? reino(limpiar(p.a)) : null, t = p && typeof p === 'object' ? texto(p.texto, LARGO_MENSAJE) : '';
    if (re === null || !t) { out.descartadas.push({ texto: 'privado', motivo: 'destinatario o texto invalido' }); return; }
    if (vistos.has(re) || out.privados.length >= MAX_PRIVADOS) { out.descartadas.push({ texto: `privado a ${nombres[re]}`, motivo: `maximo ${MAX_PRIVADOS} privados a reinos distintos` }); return; }
    vistos.add(re);
    out.privados.push({ a: re, texto: t });
  });
  if (Object.prototype.hasOwnProperty.call(r, 'nota') && typeof r.nota === 'string') out.nota = r.nota.trim().slice(0, LARGO_NOTA);
  out.razon = texto(r.razon, LARGO_RAZON);
  return out;
}

// `E` (opcional) es el estado de la partida: de ahi salen los nombres de reino que entiende esta respuesta (nombres.js). Sin el, los de siempre.
export function normalizarRespuesta(respuesta, E) {
  try {
    const nombres = nombresDeLaPartida(E);
    return normalizar(respuesta, nombres.map(limpiar), nombres);
  } catch {
    return { ordenes: [], descartadas: [], pactoCon: null, mensaje: '', privados: [], nota: undefined, razon: '', invalida: true, motivo: 'la respuesta no se pudo leer' };
  }
}

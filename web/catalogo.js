// La logica del sitio (landing, pagina de un juego, buscador): juegos, partidas sueltas, busqueda libre por juego, IA o seed, y leer o escribir la busqueda en la URL para poder compartirla. Pura: sin DOM, se prueba en Node.
// No hay series: cada juego es independiente y se llena de partidas. Los datos vienen de web/marcador.json (src/marcador.js): `juegos` (tabla por juego) y `partidas` (la lista plana).

export const ESTADOS = { 'por-publicarse': 'Por publicarse', publicada: 'Publicada' };

const lista = (x) => (Array.isArray(x) ? x : []);

// «552 912 962», «552-912-962» y «552912962» son el mismo seed: solo cuentan los digitos.
export const normalizarSeed = (t) => String(t ?? '').replace(/\D/g, '');

// Para comparar textos: sin mayusculas, sin acentos y con un solo espacio entre palabras.
export const normalizarTexto = (t) => String(t ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

// «2026-10-19» (sin hora) se lee como medianoche UTC: en horas negativas saldria el dia anterior, asi que se escribe siempre en UTC.
const escribirFecha = (f, opciones) => {
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es', { ...opciones, timeZone: 'UTC' });
};
export const fechaLarga = (f) => escribirFecha(f, { day: 'numeric', month: 'long', year: 'numeric' });
export const fechaCorta = (f) => escribirFecha(f, { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');

const esPartida = (p) => p && typeof p === 'object' && p.juego?.id;
const porNombre = (a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es');

// Las IAs que aparecen en una lista de partidas, una vez cada una, por nombre.
export function iasDe(partidas) {
  const por = new Map();
  for (const p of lista(partidas)) for (const j of lista(p?.jugadores)) if (j?.id) por.set(j.id, j);
  return [...por.values()].sort(porNombre);
}

// Las partidas de un juego, de la mas nueva a la mas vieja (asi vienen en marcador.json).
export const partidasDeJuego = (datos, id) => lista(datos?.partidas).filter((p) => esPartida(p) && p.juego.id === id);

// Los juegos para la landing y el menu: los de la tabla y los que ya tienen partidas, con sus numeros. El de la partida mas reciente va primero; los que aun no tienen partidas, al final.
export function resumenDeJuegos(datos) {
  const por = new Map();
  for (const j of lista(datos?.juegos)) if (j?.id) por.set(j.id, { id: j.id, nombre: j.nombre ?? j.id, categoria: j.categoria ?? '', versionReglas: j.versionReglas ?? null });
  for (const p of lista(datos?.partidas)) if (esPartida(p) && !por.has(p.juego.id)) por.set(p.juego.id, { id: p.juego.id, nombre: p.juego.nombre ?? p.juego.id, categoria: p.juego.categoria ?? '', versionReglas: p.versionReglas ?? null });
  return [...por.values()].map((j) => {
    const suyas = partidasDeJuego(datos, j.id);
    return {
      ...j,
      publicadas: suyas.filter((p) => p.estado === 'publicada').length,
      porPublicarse: suyas.filter((p) => p.estado !== 'publicada').length,
      ias: iasDe(suyas),
      ultima: suyas.map((p) => p.fecha).filter(Boolean).sort().at(-1) ?? null,
    };
  }).sort((a, b) => (b.ultima ?? '').localeCompare(a.ultima ?? '') || porNombre(a, b));
}

// Un fragmento numerico de 3 o mas digitos puede ser parte de un seed; uno mas corto solo cuenta si es el seed entero.
const coincideSeed = (s, seeds) => seeds.some((x) => (s.length >= 3 ? x.includes(s) : x === s));

// El filtro de la pagina de un juego: IA, estado y seed (lo vacio no filtra).
export function filtrarPartidas(partidas, filtros = {}) {
  const { seed = '', ia = '', estado = '' } = filtros ?? {};
  const s = normalizarSeed(seed);
  return lista(partidas).filter((p) => {
    if (!esPartida(p)) return false;
    if (estado && p.estado !== estado) return false;
    if (ia && !lista(p.jugadores).some((j) => j?.id === ia)) return false;
    if (s && !coincideSeed(s, [normalizarSeed(p.seed)])) return false;
    return true;
  });
}

// Todas las palabras de la busqueda deben cuadrar: las numericas con un seed, las demas con el texto (juego, categoria, IAs).
function coincide(palabras, texto, seeds) {
  return palabras.every((w) => (/^\d+$/.test(w) ? coincideSeed(w, seeds) : texto.includes(w)));
}

export function buscar(datos, texto) {
  const palabras = normalizarTexto(texto).split(' ').filter(Boolean);
  const nombres = (ias) => ias.map((j) => `${j.nombre} ${j.id}`).join(' ');
  const juegos = resumenDeJuegos(datos).filter((j) => {
    const suyas = partidasDeJuego(datos, j.id);
    return coincide(palabras, normalizarTexto(`${j.nombre} ${j.categoria} ${nombres(j.ias)}`), suyas.map((p) => normalizarSeed(p.seed)));
  });
  const partidas = lista(datos?.partidas).filter((p) => esPartida(p)
    && coincide(palabras, normalizarTexto(`${p.juego.nombre} ${p.juego.categoria ?? ''} ${nombres(lista(p.jugadores))} ${p.estado === 'publicada' ? p.ganador ?? '' : ''}`), [normalizarSeed(p.seed)]));
  return { juegos, partidas };
}

// La busqueda viaja en la direccion (?q=); los comentarios de los videos ya publicados llevan ?seed=, y siguen sirviendo.
export function leerBusqueda(search) {
  const q = new URLSearchParams(typeof search === 'string' ? search : '');
  return (q.get('q') ?? q.get('seed') ?? '').trim();
}

export function textoDeBusqueda(texto) {
  const t = String(texto ?? '').trim().replace(/\s+/g, ' ');
  return t ? `?${new URLSearchParams({ q: t })}` : '';
}

// La linea de resultado de una partida: el ganador solo si esta publicada; si no, hasta donde se ha subido.
export function resumenDePartida(p) {
  if (p?.estado === 'publicada') return p.ganador ? `Ganó ${p.ganador}` : 'Empate';
  return p?.hastaTurno ? `Por publicarse · subida hasta el turno ${p.hastaTurno}` : 'Por publicarse';
}

export const enlaceDePartida = (p) => `partida.html?id=${encodeURIComponent(p?.serie ?? '')}&partida=${encodeURIComponent(p?.n ?? 1)}`;

// La logica del buscador del sitio (index.html): filtrar las series por juego, seed, IA y estado, y leer o escribir esos filtros en la URL para poder compartirlos. Pura: sin DOM, se prueba en Node.
// Las series vienen de web/marcador.json (src/marcador.js): cada una con su seed, su estado («por-publicarse» o «publicada») y el detalle de sus partidas.

export const ESTADOS = { 'por-publicarse': 'Por publicarse', publicada: 'Publicada' };

// «552 912 962», «552-912-962» y «552912962» son el mismo seed: solo cuentan los digitos.
export const normalizarSeed = (t) => String(t ?? '').replace(/\D/g, '');

const lista = (x) => (Array.isArray(x) ? x : []);

// «2026-10-19» (sin hora) se lee como medianoche UTC: en horas negativas saldria el dia anterior, asi que se escribe siempre en UTC.
export function fechaLarga(f) {
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Los seeds de una serie: el de la serie y el de cada partida (como texto de digitos).
export const seedsDe = (e) => [...new Set([e?.seedBase, ...lista(e?.detalle).map((d) => d?.seed)].filter((s) => s !== null && s !== undefined).map((s) => normalizarSeed(s)).filter(Boolean))];

// filtros: { juego: id de juego, seed: texto, ia: id de IA, estado: 'por-publicarse' | 'publicada' }; lo vacio no filtra. El seed acepta una parte (a partir de 3 digitos, o el numero entero si es mas corto).
export function filtrarSeries(episodios, filtros = {}) {
  const { juego = '', seed = '', ia = '', estado = '' } = filtros ?? {};
  const s = normalizarSeed(seed);
  return lista(episodios).filter((e) => {
    if (!e || typeof e !== 'object') return false;
    if (juego && e.juego?.id !== juego) return false;
    if (estado && e.estado !== estado) return false;
    if (ia && !lista(e.jugadores).some((j) => j?.id === ia)) return false;
    if (s && !seedsDe(e).some((x) => (s.length >= 3 ? x.includes(s) : x === s))) return false;
    return true;
  });
}

export function leerFiltros(search) {
  const q = new URLSearchParams(typeof search === 'string' ? search : '');
  const estado = q.get('estado') ?? '';
  return { juego: q.get('juego') ?? '', seed: q.get('seed') ?? '', ia: q.get('ia') ?? '', estado: Object.hasOwn(ESTADOS, estado) ? estado : '' };
}

export function textoDeFiltros(filtros) {
  const q = new URLSearchParams();
  for (const k of ['juego', 'seed', 'ia', 'estado']) if (filtros?.[k]) q.set(k, String(filtros[k]).trim());
  const t = q.toString();
  return t ? `?${t}` : '';
}

// Los juegos que hay para el selector: los de las series (aunque aun no tengan resultados), ordenados por nombre.
export function juegosDe(episodios) {
  const por = new Map();
  for (const e of lista(episodios)) if (e?.juego?.id) por.set(e.juego.id, e.juego.nombre ?? e.juego.id);
  return [...por].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function iasDe(episodios) {
  const por = new Map();
  for (const e of lista(episodios)) for (const j of lista(e?.jugadores)) if (j?.id) por.set(j.id, j);
  return [...por.values()].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

// La linea de resultado de una serie para su tarjeta: puntos por partida publicada, o hasta donde se ha subido.
export function resumenDeSerie(e) {
  const detalle = lista(e?.detalle);
  const publicadas = detalle.filter((d) => d?.estado === 'publicada');
  const pendientes = detalle.filter((d) => d?.estado !== 'publicada');
  const partes = [];
  for (const d of publicadas) partes.push(`Partida ${d.n}: ${d.ganador ? `ganó ${d.ganador}` : 'empate'}`);
  for (const d of pendientes) partes.push(d.hastaTurno ? `Partida ${d.n}: por publicarse (se ha subido hasta el turno ${d.hastaTurno})` : `Partida ${d.n}: por publicarse`);
  return partes.join(' · ');
}

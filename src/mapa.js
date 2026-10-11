// Mapa de la Guerra de territorios: un continente de pixel art dividido en regiones (provincias).
// Todo sale de un seed: mismo seed, mismo mapa. Sin variables globales.
// El tamano crece con los reinos: 26, 39, 52 y 65 regiones para 2, 3, 4 y 5.

import { crearRng } from './rng.js';

export const CONFIG = {
  2: { W: 36, H: 50, T: 30, N: 26 },
  3: { W: 45, H: 62, T: 24, N: 39 },
  4: { W: 54, H: 75, T: 20, N: 52 },
  5: { W: 60, H: 83, T: 18, N: 65 },
};
export const REC = ['Comida', 'Madera', 'Roca', 'Hierro', 'Oro', 'Caballos'];
const AGUA_PROFUNDA = 0, AGUA = 1, ARENA = 2, PASTO = 3, BOSQUE = 4, MONTANA = 5;

function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function ruido(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x, y, seed) {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) { v += amp * ruido(x * f, y * f, seed + o * 101); amp *= 0.5; f *= 2; }
  return v / 0.9375;
}

function generarTerreno(semilla, W, H) {
  const t = new Uint8Array(W * H), escala = 0.085 * (54 / W); // misma forma relativa en cualquier tamano
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = fbm(x * escala, y * escala, semilla), h = fbm(x * escala * 1.3 + 50, y * escala * 1.3 + 50, semilla + 999);
    const borde = Math.min(1, Math.min(x, W - 1 - x) / (W * 0.16), Math.min(y, H - 1 - y) / (H * 0.10));
    const el = e - (1 - borde) * 0.30 + 0.04;
    t[y * W + x] = el < 0.30 ? AGUA_PROFUNDA : el < 0.40 ? AGUA : el < 0.44 ? ARENA : el > 0.72 ? MONTANA : h > 0.56 ? BOSQUE : PASTO;
  }
  return t;
}
function vecinos4(i, W, H) {
  const x = i % W, y = (i / W) | 0, v = [];
  if (x > 0) v.push(i - 1);
  if (x < W - 1) v.push(i + 1);
  if (y > 0) v.push(i - W);
  if (y < H - 1) v.push(i + W);
  return v;
}
// deja solo el continente mas grande (las islas se vuelven agua) y devuelve sus celdas
function mayorContinente(terreno, W, H) {
  const n = terreno.length, comp = new Int32Array(n).fill(-1), tam = [];
  for (let s = 0; s < n; s++) {
    if (terreno[s] < ARENA || comp[s] >= 0) continue;
    const id = tam.length; let cuenta = 0; const pila = [s]; comp[s] = id;
    while (pila.length) {
      const i = pila.pop(); cuenta++;
      for (const j of vecinos4(i, W, H)) if (terreno[j] >= ARENA && comp[j] < 0) { comp[j] = id; pila.push(j); }
    }
    tam.push(cuenta);
  }
  let mejor = 0; tam.forEach((c, i) => { if (c > tam[mejor]) mejor = i; });
  for (let i = 0; i < n; i++) if (terreno[i] >= ARENA && comp[i] !== mejor) terreno[i] = AGUA;
  const tiles = []; for (let i = 0; i < n; i++) if (comp[i] === mejor) tiles.push(i);
  return tiles;
}

// Divide la tierra en N regiones conectadas: sitios separados, relajacion de Lloyd y expansion simultanea por capas.
function regionar(tiles, N, rng, W, H) {
  const n = W * H, esTierra = new Uint8Array(n), xy = (i) => [i % W, (i / W) | 0];
  tiles.forEach((i) => { esTierra[i] = 1; });
  let d = Math.sqrt(tiles.length / N) * 0.85; const sitios = [];
  for (let intentos = 0; sitios.length < N && intentos < 60000; intentos++) {
    if (intentos && intentos % 4000 === 0) d *= 0.93;
    const c = tiles[(rng() * tiles.length) | 0], [cx, cy] = xy(c);
    if (sitios.every((s) => { const [sx, sy] = xy(s); return (sx - cx) ** 2 + (sy - cy) ** 2 >= d * d; })) sitios.push(c);
  }
  let region;
  for (let pasada = 0; pasada < 3; pasada++) {
    region = new Int16Array(n).fill(-1); const cola = [];
    sitios.forEach((s, r) => { region[s] = r; cola.push(s); });
    for (let h = 0; h < cola.length; h++) { const i = cola[h]; for (const j of vecinos4(i, W, H)) if (esTierra[j] && region[j] < 0) { region[j] = region[i]; cola.push(j); } }
    if (pasada < 2) {
      const sx = new Float64Array(sitios.length), sy = new Float64Array(sitios.length), cnt = new Int32Array(sitios.length);
      for (const i of tiles) { const r = region[i]; if (r < 0) continue; const [x, y] = xy(i); sx[r] += x; sy[r] += y; cnt[r]++; }
      for (let r = 0; r < sitios.length; r++) if (cnt[r]) {
        const mx = sx[r] / cnt[r], my = sy[r] / cnt[r]; let mejor = sitios[r], md = Infinity;
        for (const i of tiles) if (region[i] === r) { const [x, y] = xy(i), dd = (x - mx) ** 2 + (y - my) ** 2; if (dd < md) { md = dd; mejor = i; } }
        sitios[r] = mejor;
      }
    }
  }
  // regiones con su centro, ordenadas de arriba a abajo para nombrarlas R01, R02...
  const regs = sitios.map((s, r) => ({ viejo: r, tiles: [], centro: s }));
  for (const i of tiles) if (region[i] >= 0) regs[region[i]].tiles.push(i);
  const vivos = regs.filter((r) => r.tiles.length).sort((a, b) => ((a.centro / W) | 0) - ((b.centro / W) | 0) || (a.centro % W) - (b.centro % W));
  const nuevo = new Int16Array(sitios.length).fill(-1);
  vivos.forEach((r, k) => { nuevo[r.viejo] = k; r.id = k; r.nombre = 'R' + String(k + 1).padStart(2, '0'); r.celdas = r.tiles.length; r.vecinos = new Set(); });
  for (const i of tiles) region[i] = region[i] >= 0 ? nuevo[region[i]] : -1;
  for (const i of tiles) for (const j of vecinos4(i, W, H)) if (region[j] >= 0 && region[j] !== region[i]) vivos[region[i]].vecinos.add(region[j]);
  return { region, regs: vivos };
}

// Siembra con minimos: al menos ceil(N/18) nodos de cada recurso; el resto, al azar. Tambien fija el terreno de cada region.
function sembrarRecursos(regs, terreno, rng) {
  const minimo = Math.ceil(regs.length / 18), orden = regs.map((r) => r.id);
  for (let i = orden.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [orden[i], orden[j]] = [orden[j], orden[i]]; }
  let p = 0;
  for (const tipo of REC) for (let k = 0; k < minimo; k++) regs[orden[p++]].rec = tipo;
  for (; p < orden.length; p++) regs[orden[p]].rec = rng() < 0.2 ? REC[(rng() * REC.length) | 0] : null;
  for (const r of regs) {
    r.rec ??= null;
    let m = 0, b = 0;
    for (const i of r.tiles) { m += terreno[i] === MONTANA; b += terreno[i] === BOSQUE; }
    r.terr = m / r.tiles.length >= 0.3 ? 'mo' : b / r.tiles.length >= 0.35 ? 'bo' : 'll';
    r.vecinos = [...r.vecinos].sort((a, c) => a - c);
    delete r.tiles; delete r.viejo;
  }
}

// Salidas simetricas segun cuantos reinos haya: cada reino toma la region mas cercana a su punto ideal y sus 2 vecinas libres mas cercanas.
function objetivosSalida(k, W, H) {
  if (k === 2) return [[0.34, 0.27], [0.66, 0.73]];
  if (k === 4) return [[0.27, 0.25], [0.73, 0.25], [0.27, 0.75], [0.73, 0.75]];
  const R = (k === 3 ? 0.37 : 0.33) * W;
  return Array.from({ length: k }, (_, i) => { const a = ((-90 + (360 / k) * i) * Math.PI) / 180; return [(W / 2 + R * Math.cos(a)) / W, (H / 2 + R * Math.sin(a)) / H]; });
}
function salidas(regs, k, W, H) {
  const dueno = new Int8Array(regs.length).fill(-1), capitales = [];
  objetivosSalida(k, W, H).forEach(([fx, fy], i) => {
    let mejor = -1, md = Infinity;
    for (const r of regs) if (dueno[r.id] < 0) { const dx = (r.centro % W) - fx * W, dy = ((r.centro / W) | 0) - fy * H, d = dx * dx + dy * dy; if (d < md) { md = d; mejor = r.id; } }
    dueno[mejor] = i; capitales.push(mejor);
    const c = regs[mejor], dist = (r) => Math.hypot((r.centro % W) - (c.centro % W), ((r.centro / W) | 0) - ((c.centro / W) | 0));
    c.vecinos.filter((v) => dueno[v] < 0).sort((a, b) => dist(regs[a]) - dist(regs[b])).slice(0, 2).forEach((v) => { dueno[v] = i; });
  });
  return { dueno, capitales };
}

// Distancia en regiones (pasos entre vecinas) desde una region; 99 si no se llega.
export function distancias(regs, desde) {
  const d = new Int16Array(regs.length).fill(99), cola = [desde]; d[desde] = 0;
  for (let h = 0; h < cola.length; h++) for (const v of regs[cola[h]].vecinos) if (d[v] === 99) { d[v] = d[cola[h]] + 1; cola.push(v); }
  return d;
}

// Regla del diseno: cada capital tiene Comida y Madera a 2 regiones o menos. Si falta, se pone en la region cercana
// sin recurso (o, si no hay, en una con un recurso sobrante).
function garantizarCapitales(regs, capitales) {
  const minimo = Math.ceil(regs.length / 18), cuenta = (tipo) => regs.filter((r) => r.rec === tipo).length;
  for (const c of capitales) {
    const d = distancias(regs, c);
    for (const tipo of ['Comida', 'Madera']) {
      const cerca = regs.filter((r) => d[r.id] <= 2);
      if (cerca.some((r) => r.rec === tipo)) continue;
      const orden = (a, b) => d[a.id] - d[b.id] || a.id - b.id;
      const libre = cerca.filter((r) => r.rec === null).sort(orden)[0];
      const sobrante = cerca.filter((r) => r.rec && r.rec !== 'Comida' && r.rec !== 'Madera' && cuenta(r.rec) > minimo).sort(orden)[0];
      (libre ?? sobrante ?? cerca.sort(orden)[0]).rec = tipo;
    }
  }
}

export function crearMapa(seed, k) {
  const c = CONFIG[k];
  if (!c) throw new Error(`Reinos invalidos: ${k} (de 2 a 5)`);
  let terreno, tiles;
  for (let intento = 0; intento < 40; intento++) {
    terreno = generarTerreno((seed + intento * 7919) >>> 0, c.W, c.H);
    tiles = mayorContinente(terreno, c.W, c.H);
    if (tiles.length >= c.N * 32) break;
  }
  const rng = crearRng((seed ^ 0x9e3779b9) >>> 0);
  const { region, regs } = regionar(tiles, c.N, rng, c.W, c.H);
  sembrarRecursos(regs, terreno, rng);
  const inicio = salidas(regs, k, c.W, c.H);
  garantizarCapitales(regs, inicio.capitales);
  return { k, seed, ancho: c.W, alto: c.H, tile: c.T, terreno, region, regs, inicio };
}

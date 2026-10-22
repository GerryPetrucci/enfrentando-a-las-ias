// Los biomas del mapa de la Guerra de territorios (src/mapa.js): ocho formas de tierra (cuatro de siempre y cuatro de la 2.0.0: cordillera, istmo, golfo y peninsulas) que cambian solo la silueta y el aspecto,
// nunca las reglas.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearMapa, CONFIG, REC, BIOMAS, distancias, serializarMapa, restaurarMapa, biomaDeSeed, biomasPara } from '../../mapa.js';
import { crearRng } from '../../rng.js';
import { crearEstado } from '../../juegos/conquista/estado.js';

const REINOS = [2, 3, 4, 5];
const SEEDS_100 = Array.from({ length: 100 }, (_, i) => i + 1);
const huella = (m) => JSON.stringify([Array.from(m.terreno), m.regs.map((r) => [r.centro, r.terr, r.rec, r.vecinos]), m.inicio.capitales]);
const agua = (m) => Array.from(m.terreno).filter((t) => t <= 1).length / m.terreno.length;
const contar = (m, codigo) => Array.from(m.terreno).filter((t) => t === codigo).length / m.terreno.length;
const promedio = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// las propiedades de siempre de un mapa (las mismas que prueba mapa.test.js para el continente)
function propiedades(m, k, etiqueta) {
  assert.equal(m.regs.length, CONFIG[k].N, `${etiqueta}: numero de regiones`);
  assert.ok(distancias(m.regs, 0).every((d) => d < 99), `${etiqueta}: hay regiones aisladas`);
  for (const r of m.regs) for (const v of r.vecinos) assert.ok(m.regs[v].vecinos.includes(r.id), `${etiqueta}: ${r.nombre} no es vecina de vuelta`);
  const minimo = Math.ceil(m.regs.length / 18);
  for (const rec of REC) assert.ok(m.regs.filter((r) => r.rec === rec).length >= minimo, `${etiqueta}: pocos nodos de ${rec}`);
  assert.ok(m.regs.every((r) => ['ll', 'bo', 'mo'].includes(r.terr)), `${etiqueta}: terreno raro`);
  const { dueno, capitales } = m.inicio;
  assert.equal(capitales.length, k, `${etiqueta}: capitales`);
  assert.equal(new Set(capitales).size, k, `${etiqueta}: capitales repetidas`);
  for (let s = 0; s < k; s++) {
    assert.equal(dueno[capitales[s]], s, `${etiqueta}: duena de la capital`);
    const suyas = [...dueno].map((d, r) => (d === s ? r : -1)).filter((r) => r >= 0 && r !== capitales[s]);
    assert.ok(suyas.length >= 1 && suyas.length <= 2, `${etiqueta}: reino ${s} tiene ${suyas.length} vecinas`);
    for (const r of suyas) assert.ok(m.regs[capitales[s]].vecinos.includes(r), `${etiqueta}: vecina que no toca la capital`);
    const d = distancias(m.regs, capitales[s]), cerca = m.regs.filter((r) => d[r.id] <= 2);
    for (const rec of ['Comida', 'Madera']) assert.ok(cerca.some((r) => r.rec === rec), `${etiqueta}: capital ${s} sin ${rec} cerca`);
  }
}

test('hay ocho biomas y el mapa dice cual se uso', () => {
  assert.deepEqual(BIOMAS, ['continente', 'arido', 'mares', 'interior', 'cordillera', 'istmo', 'golfo', 'peninsulas']);
  assert.equal(crearMapa(5, 3).bioma, 'continente');
  for (const b of BIOMAS) assert.equal(crearMapa(5, 3, { bioma: b }).bioma, b);
});

test('un bioma desconocido da un error que lista los validos', () => {
  for (const raro of ['raro', 'ARIDO', '', null, 7, {}]) {
    assert.throws(() => crearMapa(1, 4, { bioma: raro }), /bioma invalido: .*continente.*arido.*mares.*interior.*cordillera.*istmo.*golfo.*peninsulas/, String(raro));
  }
});

test('los ocho biomas generan en los cuatro tamanos sin lanzar y con las propiedades de siempre (100 seeds)', () => {
  for (const bioma of BIOMAS) for (const k of REINOS) for (const seed of SEEDS_100) {
    propiedades(crearMapa(seed, k, { bioma }), k, `${bioma} k=${k} seed=${seed}`);
  }
});

test('el mismo seed y bioma dan el mismo mapa; el mismo seed con otro bioma da otro', () => {
  for (const k of REINOS) for (const seed of [3, 8]) {
    const huellas = BIOMAS.map((bioma) => huella(crearMapa(seed, k, { bioma })));
    assert.deepEqual(huellas, BIOMAS.map((bioma) => huella(crearMapa(seed, k, { bioma }))), `k=${k} seed=${seed}: no es determinista`);
    assert.equal(new Set(huellas).size, BIOMAS.length, `k=${k} seed=${seed}: dos biomas dieron el mismo mapa`);
  }
});

test('los biomas miden lo que dicen: arido con poca agua y casi sin bosque, mares con mas agua, interior con un mar rodeado de tierra', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
  const mapas = (bioma) => seeds.map((s) => crearMapa(s, 4, { bioma }));
  const [cont, ari, mar, int] = BIOMAS.slice(0, 4).map(mapas);
  assert.ok(promedio(ari.map(agua)) < promedio(cont.map(agua)), 'el arido tiene menos agua que el continente');
  assert.ok(promedio(mar.map(agua)) > promedio(cont.map(agua)), 'mucho mar tiene mas agua que el continente');
  assert.ok(promedio(ari.map((m) => contar(m, 4))) < 0.02, 'el arido casi no tiene bosque');
  assert.ok(promedio(cont.map((m) => contar(m, 4))) > promedio(ari.map((m) => contar(m, 4))), 'el continente tiene mas bosque que el arido');
  // agua DENTRO de la caja que rodea a la tierra: un mar interior la tiene de sobra, un continente casi nada
  const aguaInterior = (m) => {
    const { ancho: W, alto: H, terreno } = m; let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let i = 0; i < terreno.length; i++) if (terreno[i] >= 2) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    let n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (terreno[y * W + x] <= 1) n++;
    return n / ((x1 - x0 + 1) * (y1 - y0 + 1));
  };
  assert.ok(promedio(int.map(aguaInterior)) > promedio(cont.map(aguaInterior)), 'el mar interior deja mas agua dentro de la tierra que el continente');
});

// ---- los cuatro biomas de la 2.0.0: cada uno mide lo que dice (4 reinos, 20 seeds) ----
const SEEDS_20 = Array.from({ length: 20 }, (_, i) => i + 1);
const mapasDe = (bioma, k = 4) => SEEDS_20.map((s) => crearMapa(s, k, { bioma }));
const celdaDe = (m, x, y) => m.terreno[y * m.ancho + x];
// fraccion de las celdas de un disco (centro y radio en celdas) que cumplen `f`
function disco(m, cx, cy, r, f) {
  let n = 0, total = 0;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(m.alto - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(m.ancho - 1, Math.ceil(cx + r)); x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { total++; if (f(celdaDe(m, x, y))) n++; }
  }
  return total ? n / total : 0;
}
const tierraEnFila = (m, y) => { let n = 0; for (let x = 0; x < m.ancho; x++) if (celdaDe(m, x, y) >= 2) n++; return n; };

test('cordillera: mas del doble de montana que el continente, juntada en el centro donde se cruzan las cadenas, y las capitales casi nunca arrancan en una region de montana', () => {
  const cord = mapasDe('cordillera'), cont = mapasDe('continente');
  assert.ok(promedio(cord.map((m) => contar(m, 5))) > 2 * promedio(cont.map((m) => contar(m, 5))), 'la cordillera tiene mucha mas montana');
  const centro = (m) => disco(m, m.ancho / 2, m.alto / 2, 0.18 * m.ancho, (t) => t === 5);
  assert.ok(promedio(cord.map(centro)) > 3 * promedio(cont.map(centro)), 'las cadenas se juntan en el centro');
  let enMontana = 0, capitales = 0;
  for (const k of REINOS) for (const seed of SEEDS_100) for (const c of crearMapa(seed, k, { bioma: 'cordillera' }).inicio.capitales) { capitales++; if (crearMapa(seed, k, { bioma: 'cordillera' }).regs[c].terr === 'mo') enMontana++; }
  assert.ok(enMontana / capitales < 0.06, `${enMontana} de ${capitales} capitales arrancan en montana`);
  // con 2 reinos la cadena corre ENTRE las capitales (perpendicular a la linea que las une), no por ellas: mas montana a los lados del centro que sobre la linea de las capitales
  const entre = [], porLasCapitales = [];
  for (const m of mapasDe('cordillera', 2)) {
    const [c0, c1] = m.inicio.capitales.map((c) => [m.regs[c].centro % m.ancho, Math.floor(m.regs[c].centro / m.ancho)]);
    const cx = (c0[0] + c1[0]) / 2, cy = (c0[1] + c1[1]) / 2, largo = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]), ux = (c1[0] - c0[0]) / largo, uy = (c1[1] - c0[1]) / largo;
    for (const d of [-9, 9]) {
      entre.push(disco(m, cx - uy * d, cy + ux * d, 3, (t) => t === 5));
      porLasCapitales.push(disco(m, cx + ux * d * 0.8, cy + uy * d * 0.8, 3, (t) => t === 5));
    }
  }
  assert.ok(promedio(entre) > 0.2 && promedio(entre) > 2 * promedio(porLasCapitales), `entre las capitales ${promedio(entre).toFixed(2)}, sobre su linea ${promedio(porLasCapitales).toFixed(2)}`);
});

test('istmo: dos masas de tierra unidas por un cuello: en la cintura del mapa hay una fraccion chica de la tierra que hay en las demas filas, en cada mapa', () => {
  for (const k of [2, 4]) for (const m of mapasDe('istmo', k)) {
    const cintura = Math.min(...Array.from({ length: Math.round(0.12 * m.alto) + 1 }, (_, i) => tierraEnFila(m, Math.round(0.44 * m.alto) + i)));
    const filas = promedio([0.2, 0.25, 0.3, 0.7, 0.75, 0.8].map((v) => tierraEnFila(m, Math.round(v * m.alto))));
    assert.ok(cintura >= 3, `k=${k}: sin cuello (cintura ${cintura}) las dos masas no se tocan`);
    assert.ok(cintura <= 0.4 * filas, `k=${k}: la cintura tiene ${cintura} celdas de tierra y las demas filas ${filas.toFixed(1)}`);
  }
  const cont = crearMapa(1, 4), y = Math.round(0.5 * cont.alto);
  assert.ok(tierraEnFila(cont, y) > 0.6 * tierraEnFila(cont, Math.round(0.25 * cont.alto)), 'el continente no tiene cintura');
});

test('golfo: una bahia grande entra por el borde (con 4 reinos, por arriba): casi todo mar en esa zona y nada de mar en la de enfrente', () => {
  const golfo = mapasDe('golfo'), cont = mapasDe('continente');
  const agua = (frac) => (m) => disco(m, m.ancho / 2, frac * m.alto, 0.12 * m.ancho, (t) => t <= 1);
  assert.ok(promedio(golfo.map(agua(0.16))) > 0.8, 'la bahia es mar');
  assert.ok(promedio(golfo.map(agua(0.84))) < 0.2, 'enfrente hay tierra');
  assert.ok(promedio(cont.map(agua(0.16))) < 0.5, 'el continente no tiene esa bahia');
});

test('peninsulas: un brazo de tierra hacia cada capital y mar entre los brazos', () => {
  const brazo = [], hueco = [];
  for (const m of mapasDe('peninsulas')) {
    const cx = m.ancho / 2, cy = m.alto / 2;
    for (const c of m.inicio.capitales) { const X = m.regs[c].centro % m.ancho, Y = Math.floor(m.regs[c].centro / m.ancho); brazo.push(disco(m, cx + (X - cx) * 1.3, cy + (Y - cy) * 1.3, 0.07 * m.ancho, (t) => t >= 2)); }
    for (const [dx, dy] of [[0.34 * m.ancho, 0], [-0.34 * m.ancho, 0], [0, 0.30 * m.alto], [0, -0.30 * m.alto]]) hueco.push(disco(m, cx + dx, cy + dy, 0.07 * m.ancho, (t) => t >= 2));
  }
  assert.ok(promedio(brazo) > 0.7, `hay tierra en la direccion de cada capital (${promedio(brazo).toFixed(2)})`);
  assert.ok(promedio(hueco) < 0.25, `y mar entre los brazos (${promedio(hueco).toFixed(2)})`);
});

test('el istmo no sale por sorteo con 3 o 5 reinos (uno quedaria solo en una masa), pero se puede forzar; con 2 y 4 si sale', () => {
  assert.deepEqual(biomasPara(4), BIOMAS);
  assert.deepEqual(biomasPara(2), BIOMAS);
  for (const k of [3, 5]) { assert.ok(!biomasPara(k).includes('istmo')); assert.equal(biomasPara(k).length, BIOMAS.length - 1); }
  const cuenta = (k) => { const c = Object.fromEntries(BIOMAS.map((b) => [b, 0])); for (let s = 1; s <= 800; s++) c[biomaDeSeed(s * 7919, k)]++; return c; };
  for (const k of [3, 5]) { const c = cuenta(k); assert.equal(c.istmo, 0, `k=${k}`); for (const b of biomasPara(k)) assert.ok(c[b] >= 56 && c[b] <= 180, `k=${k} ${b}: ${c[b]} de 800`); }
  assert.ok(cuenta(4).istmo >= 48, 'con 4 reinos si sale');
  assert.equal(crearMapa(5, 3, { bioma: 'istmo' }).bioma, 'istmo', 'forzado, se respeta');
  for (let seed = 1; seed <= 40; seed++) {
    const E = crearEstado(crearRng(seed), { jugadores: 3 });
    assert.notEqual(E.mapa.bioma, 'istmo', `seed ${seed}`);
  }
});

test('el mapa serializado va y vuelve sin perder nada, sin arreglos tipados y cabe en 30 KB', () => {
  for (const bioma of BIOMAS) for (const k of REINOS) {
    const m = crearMapa(7, k, { bioma }), s = serializarMapa(m), texto = JSON.stringify(s);
    assert.deepStrictEqual(restaurarMapa(JSON.parse(texto)), m, `${bioma} k=${k}: la ida y vuelta cambia el mapa`);
    assert.ok(texto.length <= 30000, `${bioma} k=${k}: pesa ${texto.length} bytes`);
    assert.equal(s.bioma, bioma);
    assert.equal(typeof s.terreno, 'string');
    assert.equal(s.terreno.length, s.ancho * s.alto);
    assert.ok(Array.isArray(s.region) && Array.isArray(s.inicio.dueno) && Array.isArray(s.inicio.capitales));
    const tipados = []; // ningun arreglo tipado en todo el objeto
    (function recorrer(x, ruta) { if (ArrayBuffer.isView(x)) tipados.push(ruta); else if (x && typeof x === 'object') for (const [c, v] of Object.entries(x)) recorrer(v, `${ruta}.${c}`); })(s, 'mapa');
    assert.deepEqual(tipados, [], `${bioma} k=${k}: hay arreglos tipados`);
  }
});

// el seed del mapa que crearEstado saca de la partida: su primer sorteo (asi lo hace el motor)
const seedMapaDe = (seed) => Math.floor(crearRng(seed)() * 4294967296) >>> 0;

test('biomaDeSeed es determinista y reparte los ocho biomas (cada uno entre 6 % y 20 % de 800 seeds)', () => {
  const cuenta = Object.fromEntries(BIOMAS.map((b) => [b, 0]));
  for (let s = 1; s <= 800; s++) {
    const b = biomaDeSeed(s * 7919);
    assert.equal(b, biomaDeSeed(s * 7919));
    assert.ok(BIOMAS.includes(b), b);
    cuenta[b]++;
  }
  for (const b of BIOMAS) assert.ok(cuenta[b] >= 48 && cuenta[b] <= 160, `${b}: ${cuenta[b]} de 800 (${JSON.stringify(cuenta)})`);
});

test('elegir el bioma del seed no mueve el rng de la partida: forzar el mismo bioma da la partida identica y el rng queda igual', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const elegido = biomaDeSeed(seedMapaDe(seed));
    const r1 = crearRng(seed), r2 = crearRng(seed);
    const auto = crearEstado(r1, { jugadores: 4 }), forzado = crearEstado(r2, { jugadores: 4, bioma: elegido });
    assert.equal(auto.mapa.bioma, elegido, `seed ${seed}`);
    assert.deepEqual(auto.desempate, forzado.desempate);
    assert.equal(huella(auto.mapa), huella(forzado.mapa));
    assert.equal(r1(), r2(), `seed ${seed}: el rng de la partida quedo en otro punto`);
  }
});

test('un bioma explicito manda sobre el del seed, y un mapa ya creado manda sobre cualquier bioma pedido', () => {
  const seed = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => biomaDeSeed(seedMapaDe(s)) !== 'arido');
  assert.ok(seed, 'hace falta un seed que no elija el arido');
  assert.equal(crearEstado(crearRng(seed), { jugadores: 4, bioma: 'arido' }).mapa.bioma, 'arido');
  const dado = crearMapa(seed, 4);
  assert.equal(crearEstado(crearRng(seed), { jugadores: 4, mapa: dado, bioma: 'arido' }).mapa.bioma, 'continente');
});

test('restaurarMapa con basura no lanza: devuelve null', () => {
  for (const raro of [null, undefined, 7, 'x', {}, { k: 4 }, { terreno: 5 }]) assert.equal(restaurarMapa(raro), null, String(raro));
});

test('restaurarMapa rechaza un mapa guardado truncado o mal formado (devuelve null y nunca lanza): la escena lee archivos que pueden venir rotos', () => {
  const bueno = JSON.parse(JSON.stringify(serializarMapa(crearMapa(7, 3, { bioma: 'mares' }))));
  assert.notEqual(restaurarMapa(bueno), null, 'el mapa sano si se restaura');
  const estropear = {
    'una region nula': (m) => { m.regs[0] = null; },
    'una region sin vecinas': (m) => { delete m.regs[0].vecinos; },
    'terreno mas corto que ancho por alto': (m) => { m.terreno = m.terreno.slice(1); },
    'region mas corta que ancho por alto': (m) => { m.region = m.region.slice(1); },
    'terreno con una letra': (m) => { m.terreno = 'x' + m.terreno.slice(1); },
    'terreno con un digito fuera de 0 a 5': (m) => { m.terreno = '9' + m.terreno.slice(1); },
    'sin ancho': (m) => { delete m.ancho; },
    'inicio sin duenos': (m) => { m.inicio = { capitales: [] }; },
  };
  for (const [que, f] of Object.entries(estropear)) {
    const m = structuredClone(bueno); f(m);
    assert.doesNotThrow(() => restaurarMapa(m), que);
    assert.equal(restaurarMapa(m), null, que);
  }
});

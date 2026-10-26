// En cada casa de la aldea entra EL personaje de su rol (el de la insignia), no un figurante: la apertura de Lobo usa los 6 cuadros de entrada de cada rol
// (web/arte/lobo/entrada-<rol>-01..06.png), recortados por herramientas/recortar-entradas-lobo.mjs de las hojas que dibujo el usuario. Aqui se prueba la herramienta con
// una hoja sintetica y los cuadros que estan en el repositorio.
//
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { decodificarPNG, CUADROS, UMBRAL_ALFA } from '../../../herramientas/recortar-elenco-lobo.mjs';
import { cortarEntrada, cortarTodas, descripcion, archivoDeEntrada, ROLES_ENTRADA, FUNDIDO } from '../../../herramientas/recortar-entradas-lobo.mjs';
import { ENTRADAS, NOCHES, ROLES_LOBO, fotogramasDe } from '../../../web/casino/lobo-arte.js';

const web = (ruta) => new URL(`../../../web/${ruta}`, import.meta.url);
const hoja = (rol) => new URL(`../../../privado/prototipos/lobo-assets/entrada-${rol}.png`, import.meta.url);
const HAY_HOJAS = ROLES_ENTRADA.every((rol) => existsSync(hoja(rol)));

// Hoja de 6 celdas de 40x30 px. En cada celda, un rectangulo de color unico (10x8) algo desplazado, sobre un velo casi invisible (alfa 5), como la real.
function hojaSintetica({ anchoDe = () => 10, vacio = null } = {}) {
  const A = 240, H = 30, datos = new Uint8Array(A * H * 4);
  for (let i = 0; i < A * H; i++) datos.set([255, 255, 255, 5], i * 4);
  for (let c = 0; c < 6; c++) {
    if (vacio === c) continue;
    const x0 = c * 40 + 8 + (c % 3), y0 = 10;
    for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + anchoDe(c); x++) datos.set([10, 10 + c * 30, 200, 255], (y * A + x) * 4);
  }
  return { ancho: A, alto: H, datos };
}
const pixel = (im, x, y) => [...im.datos.subarray((y * im.ancho + x) * 4, (y * im.ancho + x) * 4 + 4)];

test('cortarEntrada: 6 cuadros de la misma ventana, cada dibujo en su sitio y el velo del fondo eliminado', () => {
  const { cuadros, ancho, alto, avisos } = cortarEntrada(hojaSintetica(), 'lobo');
  assert.deepEqual(avisos, []);
  assert.equal(cuadros.length, CUADROS);
  assert.equal(ancho, 10 + 2 + 4 + 0); // 10 de dibujo + el desplazamiento entre cuadros (0..2) + 2 px de margen por lado
  assert.equal(alto, 12);
  for (const [c, cuadro] of cuadros.entries()) {
    assert.deepEqual([cuadro.imagen.ancho, cuadro.imagen.alto], [ancho, alto]);
    // el desplazamiento propio de cada cuadro (c % 3) se conserva: no se recentra
    assert.deepEqual(pixel(cuadro.imagen, 2 + (c % 3), 2), [10, 10 + c * 30, 200, 255], `cuadro ${c + 1}`);
    assert.deepEqual(pixel(cuadro.imagen, 0, 0), [0, 0, 0, 0], 'el velo (alfa 5) queda transparente');
    assert.ok(cuadro.imagen.datos.every((v, i) => i % 4 !== 3 || v === 0 || v >= UMBRAL_ALFA));
  }
});

test('cortarEntrada: el corte busca la columna vacia mas cercana y no parte un dibujo que cruza la frontera', () => {
  // El cuadro 1 mide 37 px (x = 8..44) y pasa de la frontera nominal (x = 40); el cuadro 2 empieza en x = 49: las columnas 45 a 48 estan vacias.
  const { cuadros, avisos } = cortarEntrada(hojaSintetica({ anchoDe: (c) => (c === 0 ? 37 : 10) }), 'lobo');
  assert.deepEqual(avisos, []);
  assert.equal(cuadros[0].corteX1, 45, 'el corte se corrio al primer hueco');
  assert.equal(cuadros[1].corteX0, 45);
  assert.deepEqual(pixel(cuadros[0].imagen, 44 - cuadros[0].x, 10 - cuadros[0].y), [10, 10, 200, 255], 'el ultimo pixel del dibujo ancho sigue en su cuadro');
});

test('cortarEntrada: donde dos casas se tocan y el corte atraviesa dibujo, avisa y difumina el alfa junto al corte (no en los bordes de la hoja)', () => {
  // Una franja continua de color a lo largo de toda la hoja: no hay columna vacia, como en la hierba pegada de la hoja real.
  const A = 240, H = 20, datos = new Uint8Array(A * H * 4);
  for (let i = 0; i < A * H; i++) datos.set([30, 120, 30, 255], i * 4);
  const { cuadros, avisos } = cortarEntrada({ ancho: A, alto: H, datos }, 'vidente');
  assert.equal(avisos.length, 5, 'los cinco cortes atraviesan dibujo');
  assert.match(avisos[0], /vidente: el corte 1 .* atraviesa 20 px de dibujo/);
  const medio = cuadros[2].imagen, h = 5;
  const fila = (im) => Array.from({ length: im.ancho }, (_, x) => pixel(im, x, h)[3]);
  const a = fila(medio);
  assert.ok(a[2] === 0 && a[a.length - 3] === 0, 'el primer y el ultimo pixel junto a los cortes quedan apagados'); // la ventana trae 2 px de margen a cada lado, sin dibujo
  assert.ok(a[Math.floor(a.length / 2)] === 255, 'en el centro el dibujo queda intacto');
  assert.ok(a.every((v) => v === 0 || v >= UMBRAL_ALFA));
  assert.ok(a.slice(0, FUNDIDO).every((v, i, todos) => i === 0 || v >= todos[i - 1]), 'el degradado crece hacia adentro');
  const primero = fila(cuadros[0].imagen), ultimo = fila(cuadros[5].imagen);
  assert.equal(primero[2], 255, 'el borde izquierdo de la hoja no se difumina');
  assert.equal(ultimo[ultimo.length - 3], 255, 'el borde derecho de la hoja tampoco');
  assert.deepEqual(pixel(medio, Math.floor(medio.ancho / 2), h).slice(0, 3), [30, 120, 30], 'los colores no se tocan');
});

test('cortarEntrada: se niega a recortar un cuadro vacio', () => {
  assert.throws(() => cortarEntrada(hojaSintetica({ vacio: 4 }), 'bruja'), /bruja: el cuadro 5 está vacío/);
});

test('ENTRADAS: los seis roles tienen su casa, con 6 cuadros con el nombre que genera la herramienta', () => {
  assert.deepEqual(Object.keys(ENTRADAS).sort(), Object.keys(ROLES_LOBO).sort());
  assert.deepEqual([...ROLES_ENTRADA].sort(), Object.keys(ROLES_LOBO).sort());
  for (const [rol, rutas] of Object.entries(ENTRADAS)) {
    assert.deepEqual(rutas, Array.from({ length: 6 }, (_, i) => `arte/lobo/${archivoDeEntrada(rol, i + 1)}`));
  }
  assert.deepEqual(Object.keys(NOCHES), ['misteriosa'], 'solo la casa misteriosa conserva a su figurante anonimo');
  assert.deepEqual(fotogramasDe({ tipo: 'enamorados' }), ENTRADAS.cupido.slice(3), 'Cupido entra en su casa, de noche');
});

test('los 36 cuadros del repositorio existen, traen dibujo, no tienen velo y cada rol tiene 6 cuadros distintos y una casa distinta de las demas', () => {
  const primeros = new Set();
  for (const [rol, rutas] of Object.entries(ENTRADAS)) {
    const imagenes = rutas.map((r) => decodificarPNG(readFileSync(web(r))));
    assert.equal(new Set(imagenes.map((im) => `${im.ancho}x${im.alto}`)).size, 1, `${rol}: los 6 cuadros miden lo mismo`);
    for (const [c, im] of imagenes.entries()) {
      let opacos = 0;
      for (let i = 3; i < im.datos.length; i += 4) { if (im.datos[i] >= 128) opacos++; assert.ok(im.datos[i] === 0 || im.datos[i] >= UMBRAL_ALFA, 'sin velo de fondo'); }
      assert.ok(opacos > 60000, `${rol} cuadro ${c + 1} trae dibujo (${opacos} px opacos)`);
    }
    assert.equal(new Set(imagenes.map((im) => Buffer.from(im.datos).toString('base64'))).size, 6, `${rol}: los 6 cuadros son distintos`);
    primeros.add(Buffer.from(imagenes[0].datos).toString('base64'));
  }
  assert.equal(primeros.size, 6, 'cada rol tiene su propia casa (su insignia y su personaje)');
});

test('recortes-entradas.json describe los mismos cuadros que usa la escena', () => {
  const j = JSON.parse(readFileSync(web('arte/lobo/recortes-entradas.json'), 'utf8'));
  assert.equal(j.cuadros, CUADROS);
  assert.deepEqual(j.entradas.map((e) => e.rol).sort(), Object.keys(ROLES_LOBO).sort());
  for (const e of j.entradas) {
    assert.deepEqual(e.cuadrosOrigen.map((c) => `arte/lobo/${c.archivo}`), ENTRADAS[e.rol]);
    assert.equal(e.hoja, `entrada-${e.rol}.png`);
    assert.ok(e.cuadrosOrigen.every((c, i) => c.corteX0 < c.corteX1 && (i === 0 || c.corteX0 === e.cuadrosOrigen[i - 1].corteX1)), 'los cortes son contiguos');
    const im = decodificarPNG(readFileSync(web(ENTRADAS[e.rol][0])));
    assert.deepEqual([im.ancho, im.alto], [e.ancho, e.alto]);
  }
});

test('los cuadros del repositorio salen exactamente de las hojas originales (la herramienta es la fuente unica)', { skip: !HAY_HOJAS && 'las hojas originales viven en privado/ y no estan en esta copia' }, () => {
  const hojas = {};
  const { entradas } = cortarTodas((rol) => (hojas[rol] = decodificarPNG(readFileSync(hoja(rol)))));
  for (const e of entradas) {
    for (const c of e.cuadros) {
      const guardado = decodificarPNG(readFileSync(web(`arte/lobo/${archivoDeEntrada(e.rol, c.n)}`)));
      assert.deepEqual([guardado.ancho, guardado.alto], [c.imagen.ancho, c.imagen.alto]);
      assert.equal(Buffer.compare(Buffer.from(guardado.datos), Buffer.from(c.imagen.datos)), 0, `${e.rol} cuadro ${c.n}: el PNG guardado difiere del que sale de la hoja`);
    }
  }
  // Sin importar el fin de linea: en Windows git (core.autocrlf) puede reescribir el archivo con CRLF al hacer checkout, y el contenido es el mismo.
  assert.equal(readFileSync(web('arte/lobo/recortes-entradas.json'), 'utf8').replace(/\r\n/g, '\n'), JSON.stringify(descripcion(entradas, hojas), null, 2) + '\n');
});

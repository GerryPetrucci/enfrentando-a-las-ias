// El elenco de Lobo en la aldea se anima con una tira de 6 cuadros por rol (web/arte/lobo/animacion-<rol>.png), recortada de la hoja de sprites
// por herramientas/recortar-elenco-lobo.mjs. Aqui se prueba la herramienta con una hoja sintetica y las tiras que estan en el repositorio.
//
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { decodificarPNG, codificarPNG, cortarHoja, modulo, ROLES_HOJA, CUADROS, UMBRAL_ALFA } from '../../../herramientas/recortar-elenco-lobo.mjs';
import { PERSONAJES_ANIMADOS, ROLES_LOBO } from '../../../web/casino/lobo-arte.js';

const web = (ruta) => new URL(`../../../web/${ruta}`, import.meta.url);
const HOJA = new URL('../../../privado/prototipos/lobo-assets/hoja-sprites-elenco-2026-10-25.png', import.meta.url);

// Hoja de 6x6 celdas de 20 px. En cada celda, un rectangulo de color unico (6x8) algo desplazado, sobre un velo casi invisible (alfa 5), como la real.
function hojaSintetica({ filas = 6, anchoDe = () => 6, vacio = null } = {}) {
  const A = 120, H = 120, datos = new Uint8Array(A * H * 4);
  for (let i = 0; i < A * H; i++) datos.set([255, 255, 255, 5], i * 4);
  for (let f = 0; f < filas; f++) for (let c = 0; c < 6; c++) {
    if (vacio && vacio[0] === f && vacio[1] === c) continue;
    const x0 = c * 20 + 4 + (c % 3), y0 = f * 20 + 6;
    for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + anchoDe(f, c); x++) datos.set([10 + f * 30, 10 + c * 30, 200, 255], (y * A + x) * 4);
  }
  return { ancho: A, alto: H, datos };
}
const pixel = (tira, x, y) => [...tira.datos.subarray((y * tira.ancho + x) * 4, (y * tira.ancho + x) * 4 + 4)];

test('PNG: codificar y decodificar devuelve los mismos pixeles; lo que no es PNG RGBA de 8 bits se rechaza', () => {
  const imagen = hojaSintetica();
  const vuelta = decodificarPNG(codificarPNG(imagen));
  assert.equal(vuelta.ancho, 120); assert.equal(vuelta.alto, 120);
  assert.deepEqual(Buffer.from(vuelta.datos), Buffer.from(imagen.datos));
  assert.throws(() => decodificarPNG(Buffer.from('no soy un png')), /No es un PNG/);
  const gris = Buffer.from(codificarPNG(imagen)); gris[25] = 0; // tipo de color 0 (grises): no es lo que trae la hoja
  assert.throws(() => decodificarPNG(gris), /RGBA de 8 bits/);
});

test('cortarHoja: una tira por rol, 6 cuadros de la misma ventana, el personaje en su sitio y el velo del fondo eliminado', () => {
  const { personajes, avisos } = cortarHoja(hojaSintetica());
  assert.deepEqual(avisos, []);
  assert.deepEqual(personajes.map((p) => p.rol), ROLES_HOJA);
  for (const [f, p] of personajes.entries()) {
    assert.equal(p.cuadros, CUADROS);
    assert.equal(p.tira.ancho, p.ancho * CUADROS); assert.equal(p.tira.alto, p.alto);
    assert.equal(p.ancho, 12); assert.equal(p.alto, 12); // rectangulo 6x8 + el desplazamiento entre cuadros + 2 px de margen por lado
    for (let c = 0; c < CUADROS; c++) {
      // el desplazamiento propio de cada cuadro (c % 3) se conserva: no se recentra
      assert.deepEqual(pixel(p.tira, c * 12 + 2 + (c % 3), 2), [10 + f * 30, 10 + c * 30, 200, 255], `${p.rol} cuadro ${c + 1}`);
      assert.deepEqual(pixel(p.tira, c * 12, 0), [0, 0, 0, 0], 'el velo (alfa 5) queda transparente');
    }
    assert.ok(p.tira.datos.every((v, i) => i % 4 !== 3 || v === 0 || v >= UMBRAL_ALFA));
  }
});

test('cortarHoja: el corte busca la columna vacia mas cercana y no parte a un personaje que cruza la frontera', () => {
  // Fila 0, cuadro 3: 17 px de ancho (x = 46..62), pasa de la frontera nominal (x = 60). El cuadro 4 empieza en x = 64: la columna 63 esta vacia.
  const { personajes, avisos } = cortarHoja(hojaSintetica({ anchoDe: (f, c) => (f === 0 && c === 2 ? 17 : 6) }));
  assert.deepEqual(avisos, []);
  const lobo = personajes[0], [, , tres, cuatro] = lobo.cuadrosOrigen;
  assert.equal(tres.corteX1, 63, 'el corte se corrio al primer hueco');
  assert.equal(cuatro.corteX0, 63);
  const en = (c, origen, x, y) => pixel(lobo.tira, c * lobo.ancho + (x - origen.x), y - origen.y);
  assert.deepEqual(en(2, tres, 62, 6), [10, 70, 200, 255], 'el ultimo pixel del personaje ancho sigue en su cuadro');
  assert.deepEqual(en(3, cuatro, 62, 6), [0, 0, 0, 0], 'y no se cuela en el cuadro vecino');
});

test('cortarHoja: se niega a recortar una hoja que no trae 6 filas o con un cuadro vacio', () => {
  assert.throws(() => cortarHoja(hojaSintetica({ filas: 5 })), /6 filas de personajes y se hallaron 5/);
  assert.throws(() => cortarHoja(hojaSintetica({ vacio: [2, 4] })), /bruja: el cuadro 5 está vacío/);
});

test('el modulo generado trae el tamaño de cada cuadro y la ruta de cada tira', () => {
  const { personajes } = cortarHoja(hojaSintetica());
  const texto = modulo(personajes);
  assert.match(texto, /^\/\/ Generado por herramientas\/recortar-elenco-lobo\.mjs/);
  const datos = JSON.parse(texto.split('export const PERSONAJES_ANIMADOS = ')[1].replace(/;\s*$/, ''));
  assert.deepEqual(datos.cupido, { cuadros: 6, ancho: 12, alto: 12, archivo: 'arte/lobo/animacion-cupido.png' });
});

test('los seis roles tienen su tira real: 6 cuadros distintos, con dibujo, y el tamaño del modulo coincide con el PNG', () => {
  assert.deepEqual(Object.keys(PERSONAJES_ANIMADOS).sort(), Object.keys(ROLES_LOBO).sort());
  for (const [rol, a] of Object.entries(PERSONAJES_ANIMADOS)) {
    assert.equal(a.cuadros, 6);
    assert.equal(a.archivo, `arte/lobo/animacion-${rol}.png`);
    const tira = decodificarPNG(readFileSync(web(a.archivo)));
    assert.equal(tira.ancho, a.ancho * a.cuadros, `${rol}: ancho de la tira`); assert.equal(tira.alto, a.alto, `${rol}: alto de la tira`);
    const cuadros = Array.from({ length: a.cuadros }, (_, c) => {
      const fila = [];
      for (let y = 0; y < a.alto; y++) fila.push(Buffer.from(tira.datos.subarray((y * tira.ancho + c * a.ancho) * 4, (y * tira.ancho + (c + 1) * a.ancho) * 4)));
      return Buffer.concat(fila);
    });
    for (const [c, bytes] of cuadros.entries()) {
      let opacos = 0;
      for (let i = 3; i < bytes.length; i += 4) { if (bytes[i] >= 200) opacos++; assert.ok(bytes[i] === 0 || bytes[i] >= UMBRAL_ALFA, 'sin velo de fondo'); }
      assert.ok(opacos > 1500, `${rol} cuadro ${c + 1} trae dibujo (${opacos} px opacos)`);
    }
    assert.equal(new Set(cuadros.map((b) => b.toString('base64'))).size, 6, `${rol}: los 6 cuadros son distintos`);
  }
});

test('recortes-personajes.json describe las mismas tiras que usa la escena', () => {
  const j = JSON.parse(readFileSync(web('arte/lobo/recortes-personajes.json'), 'utf8'));
  assert.equal(j.origen, 'Hoja de sprites de fantasía pixel art.png');
  assert.deepEqual(j.hoja.filas, ROLES_HOJA);
  for (const p of j.personajes) {
    const a = PERSONAJES_ANIMADOS[p.rol];
    assert.deepEqual([p.cuadros, p.ancho, p.alto], [a.cuadros, a.ancho, a.alto]);
    assert.equal(p.cuadrosOrigen.length, 6);
    assert.ok(p.cuadrosOrigen.every((c, i) => c.corteX0 < c.corteX1 && (i === 0 || c.corteX0 === p.cuadrosOrigen[i - 1].corteX1)), 'los cortes son contiguos');
  }
});

test('las tiras del repositorio salen exactamente de la hoja original (la herramienta es la fuente unica)', { skip: !existsSync(HOJA) && 'la hoja original vive en privado/ y no esta en esta copia' }, () => {
  const { personajes, avisos } = cortarHoja(decodificarPNG(readFileSync(HOJA)));
  assert.deepEqual(avisos, [], 'todos los cortes caen en columnas vacias');
  for (const p of personajes) {
    const guardada = decodificarPNG(readFileSync(web(`arte/lobo/animacion-${p.rol}.png`)));
    assert.deepEqual([guardada.ancho, guardada.alto], [p.tira.ancho, p.tira.alto]);
    assert.equal(Buffer.compare(Buffer.from(guardada.datos), Buffer.from(p.tira.datos)), 0, `${p.rol}: la tira guardada difiere de la que sale de la hoja`);
  }
  assert.equal(readFileSync(new URL('../../../web/casino/lobo-personajes-animados.js', import.meta.url), 'utf8'), modulo(personajes));
});

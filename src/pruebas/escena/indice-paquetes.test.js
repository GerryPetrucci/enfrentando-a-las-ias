// El indice de paquetes (data/paquetes.json): para cada partida con paquete, su numero de juego (jN) y sus piezas. Sirve para que la pagina de grabacion identifique una pieza aunque su direccion sea de un
// paquete anterior y no traiga `numero=N` (la direccion vieja de un LEEME): sin esto se graba, en silencio, una pieza que no dice de que juego es. Puro y de archivos: sin red, sin navegador y sin API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RUTA_INDICE, claveDeIndice, entradaDePaquete, identidadDeIndice } from '../../../web/casino/indice-paquetes.js';
import { registrarEnIndice, indexarPaquetes } from '../../../herramientas/paquete.mjs';

const PAQUETE = {
  version: 2, juego: 3, partida: 1, archivo: 'pruebas/a.json',
  piezas: [
    { id: 'gancho-1', tipo: 'gancho', parte: 1, desde: null, hasta: null },
    { id: 'parte-1', tipo: 'parte', parte: 1, desde: 1, hasta: 8 },
    { id: 'clip-1', tipo: 'clip', parte: 1, desde: 6, hasta: 6 },
    { id: 'gancho-2', tipo: 'gancho', parte: 2, desde: null, hasta: null },
    { id: 'parte-2', tipo: 'parte', parte: 2, desde: 9, hasta: 17 },
    { id: 'clip-3', tipo: 'clip', parte: 2, desde: 11, hasta: 11 },
  ],
};
const INDICE = Object.fromEntries([entradaDePaquete(PAQUETE)]);
const SIN_PIEZA = { parte: null, de: null, clip: null };

test('el indice vive en data/ y se busca por archivo y partida', () => {
  assert.equal(RUTA_INDICE, 'data/paquetes.json');
  assert.equal(claveDeIndice('pruebas/a.json', 1), 'pruebas/a.json#1');
});

test('entradaDePaquete: del paquete.json sale su clave, su jN y sus piezas; un paquete de la version vieja (sin piezas) sirve para el jN; lo roto no entra', () => {
  const [clave, entrada] = entradaDePaquete(PAQUETE);
  assert.equal(clave, 'pruebas/a.json#1');
  assert.equal(entrada.juego, 3);
  assert.deepEqual(entrada.piezas.map((p) => p.id), ['gancho-1', 'parte-1', 'clip-1', 'gancho-2', 'parte-2', 'clip-3']);
  assert.deepEqual(entrada.piezas[1], { id: 'parte-1', tipo: 'parte', parte: 1, desde: 1, hasta: 8 });
  assert.deepEqual(entradaDePaquete({ juego: 1, partida: 2, archivo: 'x.json' }), ['x.json#2', { juego: 1, piezas: [] }]);
  for (const roto of [null, undefined, 'x', {}, { juego: 0, partida: 1, archivo: 'a.json' }, { juego: 2, partida: 0, archivo: 'a.json' }, { juego: 2, partida: 1 }, { juego: 'tres', partida: 1, archivo: 'a.json' }]) assert.equal(entradaDePaquete(roto), null, JSON.stringify(roto));
});

test('identidadDeIndice: una direccion SIN numero recupera el jN del paquete y, si la pieza esta, su parte y su clip', () => {
  const base = { archivo: 'pruebas/a.json', partida: 1 };
  // el gancho solo necesita el juego: su parte ya viene en la direccion
  assert.deepEqual(identidadDeIndice(INDICE, { ...base, gancho: { cortes: [2, 6, 7], parte: 1, de: 2 } }), { numero: 3, pieza: { parte: 1, de: 2, clip: null } });
  // una parte, por sus rondas
  assert.deepEqual(identidadDeIndice(INDICE, { ...base, desde: 1, hasta: 8 }), { numero: 3, pieza: { parte: 1, de: 2, clip: null } });
  assert.deepEqual(identidadDeIndice(INDICE, { ...base, desde: 9, hasta: 17 }), { numero: 3, pieza: { parte: 2, de: 2, clip: null } });
  // un clip: de que parte es y cual es
  assert.deepEqual(identidadDeIndice(INDICE, { ...base, desde: 11, hasta: 11 }), { numero: 3, pieza: { parte: 2, de: 2, clip: 3 } });
  // una pieza que el paquete no tiene (otras rondas, o sin rango): solo el juego
  assert.deepEqual(identidadDeIndice(INDICE, { ...base, desde: 2, hasta: 4 }), { numero: 3, pieza: SIN_PIEZA });
  assert.deepEqual(identidadDeIndice(INDICE, { ...base, desde: 1, hasta: null }), { numero: 3, pieza: SIN_PIEZA });
  // un paquete de la version vieja (sin piezas) tambien da el juego
  const viejo = Object.fromEntries([entradaDePaquete({ juego: 1, partida: 1, archivo: '2026-10-19-x.json' })]);
  assert.deepEqual(identidadDeIndice(viejo, { archivo: '2026-10-19-x.json', partida: 1, desde: 1, hasta: 8 }), { numero: 1, pieza: SIN_PIEZA });
});

test('identidadDeIndice: sin paquete para esa partida (o con basura) no hay identidad: la pagina no inventa un jN', () => {
  assert.equal(identidadDeIndice(INDICE, { archivo: 'pruebas/otra.json', partida: 1, desde: 1, hasta: 8 }), null);
  assert.equal(identidadDeIndice(INDICE, { archivo: 'pruebas/a.json', partida: 2, desde: 1, hasta: 8 }), null, 'otra partida del mismo archivo');
  for (const indice of [null, undefined, {}, [], 'x', 3, { 'pruebas/a.json#1': null }, { 'pruebas/a.json#1': { juego: 0 } }, { 'pruebas/a.json#1': { juego: 'tres', piezas: [] } }]) assert.equal(identidadDeIndice(indice, { archivo: 'pruebas/a.json', partida: 1, desde: 1, hasta: 8 }), null, JSON.stringify(indice));
  for (const consulta of [undefined, null, {}, { partida: 1 }]) assert.equal(identidadDeIndice(INDICE, consulta), null, JSON.stringify(consulta));
});

function conCarpeta(fn) {
  const raiz = mkdtempSync(join(tmpdir(), 'indice-paquetes-'));
  try { return fn(raiz); } finally { rmSync(raiz, { recursive: true, force: true }); }
}

test('registrarEnIndice agrega o reemplaza la entrada de esa partida y conserva las demas; un indice ilegible se rehace', () => {
  conCarpeta((raiz) => {
    const ruta = join(raiz, 'data', 'paquetes.json');
    registrarEnIndice(ruta, PAQUETE);
    assert.deepEqual(JSON.parse(readFileSync(ruta, 'utf8')), INDICE);
    registrarEnIndice(ruta, { juego: 1, partida: 1, archivo: '2026-10-19-x.json' });
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(ruta, 'utf8'))).sort(), ['2026-10-19-x.json#1', 'pruebas/a.json#1']);
    registrarEnIndice(ruta, { ...PAQUETE, juego: 5, piezas: [] }); // regenerar un paquete (otro jN o piezas): reemplaza, no duplica
    const despues = JSON.parse(readFileSync(ruta, 'utf8'));
    assert.deepEqual([Object.keys(despues).length, despues['pruebas/a.json#1']], [2, { juego: 5, piezas: [] }]);
    registrarEnIndice(ruta, null); // un paquete roto no toca el indice
    assert.equal(Object.keys(JSON.parse(readFileSync(ruta, 'utf8'))).length, 2);
    writeFileSync(ruta, '{esto no es json');
    registrarEnIndice(ruta, PAQUETE);
    assert.deepEqual(JSON.parse(readFileSync(ruta, 'utf8')), INDICE, 'un indice roto se rehace con lo nuevo');
  });
});

test('indexarPaquetes junta los paquete.json de grabaciones/listos de todos los juegos; ignora lo que no es un paquete y lo ilegible', () => {
  conCarpeta((raiz) => {
    const escribir = (ruta, contenido) => { mkdirSync(join(raiz, ruta, '..'), { recursive: true }); writeFileSync(join(raiz, ruta), typeof contenido === 'string' ? contenido : JSON.stringify(contenido)); };
    escribir('guerra-de-territorios/2026-10-28_seed-1/paquete-j3/paquete.json', PAQUETE);
    escribir('duda-y-apuesta/2026-10-22_seed-2/paquete-j1/paquete.json', { juego: 1, partida: 1, archivo: '2026-10-22-duda.json' }); // formato viejo
    escribir('lobo-en-la-aldea/2026-10-25_seed-3/paquete-j1/paquete.json', { version: 2, juego: 1, partida: 1, archivo: 'pruebas/lobo.json', piezas: [] });
    escribir('triple-dado/2026-10-22_seed-4/paquete-j1/paquete.json', '{roto');
    escribir('triple-dado/2026-10-22_seed-4/originales/paquete.json', PAQUETE); // no esta dentro de un paquete-jN
    escribir('triple-dado/2026-10-22_seed-4/paquete-j1/textos/paquete.json', PAQUETE); // ni esta
    const indice = indexarPaquetes(raiz);
    assert.deepEqual(Object.keys(indice).sort(), ['2026-10-22-duda.json#1', 'pruebas/a.json#1', 'pruebas/lobo.json#1']);
    assert.equal(indice['pruebas/a.json#1'].juego, 3);
    assert.deepEqual(indexarPaquetes(join(raiz, 'no-existe')), {}, 'sin carpeta no hay indice, y no lanza');
  });
});

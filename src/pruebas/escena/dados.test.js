// La fisica de los dados de Triple dado (web/casino/dados.js): el rebote y el giro salen del seed y el resultado esta fijado de antemano. Sin DOM, sin red.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trayectoria } from '../../../web/casino/dados.js';

const CAJA = { ancho: 300, alto: 200 };
const MARGEN = 24;
const combinaciones = () => {
  const out = [];
  for (const semilla of [1, 7, 'abc', 123456]) for (const id of ['b1', 'b5', 'b9', 'rojo', 'azul']) for (const cara of [1, 2, 3, 4, 5, 6]) out.push([semilla, id, cara]);
  return out;
};
const cambiosDeSentido = (valores) => { let n = 0; for (let i = 2; i < valores.length; i++) if ((valores[i] - valores[i - 1]) * (valores[i - 1] - valores[i - 2]) < 0) n++; return n; };

test('el dado siempre termina en la cara pedida: el resultado esta fijado de antemano', () => {
  const todas = combinaciones();
  assert.ok(todas.length >= 120);
  for (const [s, id, cara] of todas) {
    const t = trayectoria(s, id, cara, CAJA);
    assert.equal(t.cuadros.at(-1).cara, cara, `${s}/${id}/${cara}`);
    assert.equal(t.final.cara, cara);
    assert.deepEqual({ x: t.cuadros.at(-1).x, y: t.cuadros.at(-1).y, giro: t.cuadros.at(-1).giro }, { x: t.final.x, y: t.final.y, giro: t.final.giro });
  }
});

test('es determinista: la misma entrada da la misma trayectoria y otra entrada da otra', () => {
  assert.deepEqual(trayectoria(7, 'b3', 4, CAJA), trayectoria(7, 'b3', 4, CAJA));
  assert.notDeepEqual(trayectoria(7, 'b3', 4, CAJA).cuadros, trayectoria(7, 'b4', 4, CAJA).cuadros, 'otro id');
  assert.notDeepEqual(trayectoria(7, 'b3', 4, CAJA).cuadros, trayectoria(8, 'b3', 4, CAJA).cuadros, 'otra semilla');
});

test('el dado nunca sale de la caja (con margen de medio dado) y el tiempo va de 0 a 1', () => {
  for (const [s, id, cara] of combinaciones()) {
    const { cuadros } = trayectoria(s, id, cara, CAJA);
    assert.equal(cuadros.length, 30);
    assert.equal(cuadros[0].t, 0);
    assert.equal(cuadros.at(-1).t, 1);
    for (let i = 1; i < cuadros.length; i++) assert.ok(cuadros[i].t > cuadros[i - 1].t);
    for (const c of cuadros) assert.ok(c.x >= MARGEN && c.x <= CAJA.ancho - MARGEN && c.y >= MARGEN && c.y <= CAJA.alto - MARGEN, `${s}/${id}: (${c.x}, ${c.y}) fuera`);
  }
  assert.equal(trayectoria(1, 'b1', 3, CAJA, { cuadros: 12 }).cuadros.length, 12);
});

test('rebota al menos dos veces (visto desde arriba, el dado se agranda al subir) y se queda quieto al final', () => {
  for (const [s, id, cara] of combinaciones()) {
    const { cuadros } = trayectoria(s, id, cara, CAJA);
    assert.ok(cambiosDeSentido(cuadros.map((c) => c.escala)) >= 2, `${s}/${id}: no rebota`);
    assert.equal(cuadros.at(-1).escala, 1, 'termina a ras del suelo');
    assert.equal(cuadros.at(-2).x === cuadros.at(-1).x && cuadros.at(-2).y === cuadros.at(-1).y, false, 'aun se movia en el penultimo cuadro');
  }
});

test('el giro termina en un multiplo de 90 grados y la cara mostrada cambia mientras rueda', () => {
  for (const [s, id, cara] of combinaciones()) {
    const { cuadros, final } = trayectoria(s, id, cara, CAJA);
    assert.equal(Math.abs(final.giro) % 90, 0, `${s}/${id}`);
    assert.ok(new Set(cuadros.map((c) => c.cara)).size >= 2, `${s}/${id}: la cara nunca cambia`);
    for (const c of cuadros) assert.ok(Number.isInteger(c.cara) && c.cara >= 1 && c.cara <= 6);
  }
});

test('no usa Math.random ni el reloj del equipo', () => {
  const fuente = readFileSync(new URL('../../../web/casino/dados.js', import.meta.url), 'utf8');
  for (const prohibido of ['Math.random', 'Date.now', 'performance.now', 'new Date']) assert.ok(!fuente.includes(prohibido), prohibido);
});

test('una entrada ilegible no lanza: da un dado quieto en el centro con la cara 1', () => {
  const raros = [[1, 'b1', 0, CAJA], [1, 'b1', 7, CAJA], [1, 'b1', 'x', CAJA], [1, 'b1', 3, null], [1, 'b1', 3, { ancho: 0, alto: 0 }], [1, 'b1', 3, { ancho: 'x' }], [null, null, null, undefined]];
  for (const args of raros) {
    let t;
    assert.doesNotThrow(() => { t = trayectoria(...args); }, JSON.stringify(args));
    assert.equal(t.final.cara, 1);
    assert.ok(t.cuadros.length >= 1 && t.cuadros.every((c) => c.cara === 1 && c.x === t.final.x && c.y === t.final.y));
  }
});

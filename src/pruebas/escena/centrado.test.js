// Eje del conjunto y de las piezas centrales, sin exigir centrar columnas
// individuales de interfaces que deliberadamente distribuyen informacion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colocar, FORMATOS_ESCENA } from '../../../web/casino/layout.js';
import { colocarLobo } from '../../../web/casino/layout-lobo.js';
import { juegosConEscena } from '../../../web/casino/lineas.js';

const centro = (r) => r.x + r.ancho / 2;
const juegos = { lobo: () => [8, 12].map(n => colocarLobo('9x16', n)) };
test('todos los juegos usan una zona vertical centrada con 130 px de reserva a cada lado', () => {
  assert.deepEqual(Object.keys(juegos).sort(), juegosConEscena().sort());
  const { ancho, zona } = FORMATOS_ESCENA['9x16'];
  assert.equal(zona.x, 130);
  assert.equal(ancho - zona.x - zona.ancho, 130);
  for (const [id, hacer] of Object.entries(juegos)) for (const L of hacer()) {
    for (const r of [L.zona, L.cabecera, L.etiqueta]) assert.equal(centro(r), L.ancho / 2, `${id}: eje comun`);
    assert.equal(centro(L.subtitulos), L.ancho / 2, `${id}: subtitulos`);
    for (const r of [L.escenario, L.anuncio, L.panel?.marco, L.panel?.x !== undefined ? L.panel : null, L.consola?.marco, L.consola?.contador, L.consola?.sello, L.banner, L.regla, L.panelFinal]) if (r) assert.equal(centro(r), L.ancho / 2, `${id}: marco central`);
  }
});

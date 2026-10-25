// Eje del conjunto y de las piezas centrales, sin exigir centrar columnas
// individuales de interfaces que deliberadamente distribuyen informacion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colocar, FORMATOS_ESCENA } from '../../../web/casino/layout.js';
import { colocarFuga } from '../../../web/casino/layout-fuga.js';
import { colocarLobo } from '../../../web/casino/layout-lobo.js';
import { colocarMayorMenor } from '../../../web/casino/layout-mayormenor.js';
import { colocarSolitario } from '../../../web/casino/layout-solitario.js';
import { colocarSubasta } from '../../../web/casino/layout-subasta.js';
import { colocarTripleDado } from '../../../web/casino/layout-tripledado.js';
import { colocarConquista } from '../../../web/casino/layout-conquista.js';
import { CONFIG } from '../../mapa.js';
import { juegosConEscena } from '../../../web/casino/lineas.js';

const centro = (r) => r.x + r.ancho / 2;
const juegos = {
  lobo: () => [8, 12].map((n) => colocarLobo('9x16', n)),
  dudaapuesta: () => [colocar('9x16')], fuga: () => [colocarFuga('9x16')],
  mayormenor: () => [colocarMayorMenor('9x16')], solitario: () => [colocarSolitario('9x16')],
  subasta: () => [colocarSubasta('9x16')], tripledado: () => [colocarTripleDado('9x16')],
  conquista: () => Object.values(CONFIG).map((c) => colocarConquista('9x16', { ancho: c.W, alto: c.H, tile: c.T })),
};
test('todos los juegos usan una zona vertical centrada con 130 px de reserva a cada lado', () => {
  assert.deepEqual(Object.keys(juegos).sort(), juegosConEscena().sort());
  const { ancho, zona } = FORMATOS_ESCENA['9x16'];
  assert.equal(zona.x, 130);
  assert.equal(ancho - zona.x - zona.ancho, 130);
  for (const [id, hacer] of Object.entries(juegos)) for (const L of hacer()) {
    for (const r of [L.zona, L.cabecera, L.etiqueta]) assert.equal(centro(r), L.ancho / 2, `${id}: eje comun`);
    if (id !== 'conquista') assert.equal(centro(L.subtitulos), L.ancho / 2, `${id}: subtitulos`);
    for (const r of [L.escenario, L.anuncio, L.panel?.marco, L.panel?.x !== undefined ? L.panel : null, L.consola?.marco, L.consola?.contador, L.consola?.sello, L.banner, L.regla, L.panelFinal]) if (r) assert.equal(centro(r), L.ancho / 2, `${id}: marco central`);
  }
});
test('Duda y apuesta centra el conjunto de asientos y divide el pozo y el mazo simetricamente', () => {
  const L = colocar('9x16'), cajas = L.asientos.map((a) => a.caja);
  const izquierda = Math.min(...cajas.map((r) => r.x)), derecha = Math.max(...cajas.map((r) => r.x + r.ancho));
  assert.equal((izquierda + derecha) / 2, L.ancho / 2);
  assert.equal(L.pozo.ancho, L.mazo.ancho);
  assert.equal((centro(L.pozo) + centro(L.mazo)) / 2, L.ancho / 2);
});
test('las filas y camaras verticales respetan los mismos margenes que sus cabeceras', () => {
  for (const hacer of [colocarFuga, colocarSolitario, colocarSubasta, colocarTripleDado]) {
    const L = hacer('9x16');
    for (const r of [...(L.filas ?? []).map((f) => f.fila), ...(L.camaras ?? []).map((c) => c.cuadro)]) {
      assert.equal(r.x, L.zona.x); assert.equal(r.ancho, L.zona.ancho);
    }
  }
});
test('Mayor o menor comparte eje entre cartas, indicador, sello, apuesta y escenario', () => {
  for (const formato of ['9x16', '16x9']) {
    const L = colocarMayorMenor(formato), c = L.centro, eje = L.ancho / 2;
    for (const r of [L.escenario, c.indicador, c.apuesta, c.sello]) assert.equal(centro(r), eje, formato);
    assert.equal((centro(c.cartaCrupier) + centro(c.cartaJugada)) / 2, eje);
    assert.equal(centro(c.rotuloCrupier), centro(c.cartaCrupier));
    assert.equal(centro(c.rotuloJugada), centro(c.cartaJugada));
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dividirEnDos } from '../../../web/casino/escena-config.js';
import { construirPaquete } from '../../../web/casino/paquete-textos.js';
import { armarLinea, destacadasDe } from '../../../web/casino/lineas.js';
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import fuga from '../../juegos/fuga.js';
test('un corte editorial conserva las rondas aprobadas aunque no equilibre tiempos', () => {
  const beats = Array.from({ length: 9 }, (_, i) => ({ id: `r${i + 1}`, mano: i + 1, minMs: i < 4 ? 20000 : 10000, texto: '' }));
  const editorial = dividirEnDos(beats, null, 5);
  assert.deepEqual([editorial.parte1.mano, editorial.parte1.hasta, editorial.parte2.mano, editorial.parte2.hasta], [1, 5, 6, 9]);
  assert.equal(editorial.parte1.ms + editorial.parte2.ms, 130000);
  assert.notEqual(dividirEnDos(beats).parte1.hasta, 5);
});
test('un corte desconocido, fraccionario o que vacie la segunda parte se rechaza', () => {
  const beats = [1, 2, 3].map((mano) => ({ id: `r${mano}`, mano, minMs: 1000, texto: '' }));
  for (const corte of [0, 3, 8, 1.5, NaN]) assert.throws(() => dividirEnDos(beats, null, corte), /corte editorial/);
});
test('elegir clips editoriales no borra las candidatas para los ganchos de cada parte', async () => {
  const partida = await correrPartida({ juego: fuga, agentes: ['leal', 'traidor'].map((id) => resolverAgente(id, fuga)), seed: 1 });
  const paquete = construirPaquete({ partida, beats: await armarLinea('fuga', partida), destacadas: await destacadasDe('fuga', partida, 40), archivo: 'prueba.json', corteTras: 5, momentosClips: [4, 8] });
  assert.equal(paquete.piezas.filter((p) => p.tipo === 'gancho').length, 2);
  assert.deepEqual(paquete.piezas.filter((p) => p.tipo === 'parte').map((p) => [p.grabar.desde, p.grabar.hasta]), [[1, 5], [6, 9]]);
});

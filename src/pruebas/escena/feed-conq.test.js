// El feed de la Guerra de territorios aparece con los avisos nuevos y se apaga a los pocos segundos para dejar ver el mapa; con los siguientes vuelve a empezar, sin lo viejo.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEED, msVisibleDelFeed } from '../../../web/casino/feed-conquista.js';

const mesa = readFileSync(new URL('../../../web/casino/mesa-conquista.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'); // con saltos de linea de Windows o de Unix

test('el feed se queda lo que se tarda en leer lo nuevo: de 4 a 7 s, mas tiempo con mas avisos', () => {
  assert.deepEqual(FEED, { MIN_MS: 4000, MAX_MS: 7000, BASE_MS: 3000, POR_AVISO_MS: 900, FUNDIDO_MS: 400 });
  assert.equal(msVisibleDelFeed(1), 4000, 'con un aviso no baja del minimo');
  assert.equal(msVisibleDelFeed(2), 4800);
  assert.equal(msVisibleDelFeed(3), 5700);
  assert.equal(msVisibleDelFeed(4), 6600);
  assert.equal(msVisibleDelFeed(7), 7000, 'ni pasa del maximo');
  for (const raro of [0, -3, NaN, undefined, 'x', null, 2.5]) assert.ok(msVisibleDelFeed(raro) >= 4000 && msVisibleDelFeed(raro) <= 7000, String(raro));
});

// El texto de un metodo de la mesa: desde su firma hasta la llave que lo cierra (todos cierran con dos espacios).
const metodo = (nombre) => { const i = mesa.search(new RegExp(`\\n  (async )?${nombre}\\(`)); assert.ok(i >= 0, `no encuentro ${nombre}`); return mesa.slice(i, mesa.indexOf('\n  }\n', i)); };

test('la mesa muestra el feed con lo nuevo, lo apaga solo (menos en las capturas) y lo reinicia al empezar', () => {
  assert.match(mesa, /import \{[^}]*msVisibleDelFeed[^}]*\} from '\.\/feed-conquista\.js'/);
  assert.match(metodo('agregarFeed'), /if \(lista\?\.length\) this\.mostrarFeed\(lista\.length\)/, 'agregar avisos los muestra');
  const mostrar = metodo('mostrarFeed');
  assert.match(mostrar, /clearTimeout\(this\.feedTimer\)/, 'lo nuevo cancela el apagado pendiente');
  assert.match(mostrar, /if \(!this\.rapido\) this\.feedTimer = setTimeout\(\(\) => this\.apagarFeed\(\), msVisibleDelFeed\(nuevos\) \/ this\.vel\)/, 'se apaga solo, salvo en modo rapido');
  const apagar = metodo('apagarFeed');
  assert.match(apagar, /innerHTML = ''/, 'al apagarse suelta lo viejo');
  assert.match(apagar, /if \(f\.dataset\.feed !== 'oculto'\) return/, 'si llegaron avisos mientras se apagaba, no los borra');
  assert.match(metodo('mostrarEstadoInicial'), /clearTimeout\(this\.feedTimer\)/, 'un turno inicial cancela el apagado pendiente');
});

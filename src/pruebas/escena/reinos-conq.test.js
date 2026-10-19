// Los nombres de reino de la Guerra de territorios (Azur, Ámbar, Violeta, Rosa, Marfil, Iris): los modelos los ven en su prompt y los usan en sus mensajes («Ámbar propone paz a Azur»), pero la escena nombra
// a cada reino con el modelo que lo juega. El marcador muestra los dos para que el publico entienda de quien se habla. Cada partida guarda el reino de cada asiento (`reinos`, nombres.js: el color del
// reino coincide con el de su IA); una partida vieja sin ese dato usa los nombres por asiento de siempre.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOMBRES_REINOS as DEL_MOTOR } from '../../juegos/conquista/constantes.js';
import { NOMBRES_POSIBLES } from '../../juegos/conquista/nombres.js';
import { NOMBRES_PUBLICOS, nombreDeReino } from '../../../web/casino/reinos-conquista.js';

const sinAcentos = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

test('los nombres que ve el publico son los del motor, con sus acentos (la web no importa de src/: esta prueba los ata)', () => {
  assert.deepEqual(Object.keys(NOMBRES_PUBLICOS), NOMBRES_POSIBLES, 'mismos nombres y mismo orden que el motor');
  for (const [motor, publico] of Object.entries(NOMBRES_PUBLICOS)) assert.equal(sinAcentos(publico), motor);
  assert.equal(NOMBRES_PUBLICOS.Ambar, 'Ámbar', 'es texto publico: lleva acento aunque el prompt del motor no');
  assert.deepEqual(DEL_MOTOR.map((n) => NOMBRES_PUBLICOS[n]), ['Azur', 'Ámbar', 'Violeta', 'Rosa', 'Marfil']);
});

test('nombreDeReino da el reino del asiento: el que guardo la partida o, si no hay, el de siempre; y nada si el asiento no existe', () => {
  assert.equal(nombreDeReino(0, ['Ambar', 'Marfil', 'Iris', 'Azur']), 'Ámbar');
  assert.equal(nombreDeReino(2, ['Ambar', 'Marfil', 'Iris', 'Azur']), 'Iris');
  assert.equal(nombreDeReino(0), 'Azur', 'partida vieja, sin `reinos`: por asiento');
  assert.equal(nombreDeReino(1), 'Ámbar');
  assert.equal(nombreDeReino(4, null), 'Marfil');
  assert.equal(nombreDeReino(1, 'no es una lista'), 'Ámbar');
  assert.equal(nombreDeReino(1, ['Ambar', 7]), 'Ámbar', 'un dato roto cae al de siempre');
  assert.equal(nombreDeReino(0, ['Narnia']), 'Narnia', 'un nombre que la web no conoce se muestra tal cual');
  for (const raro of [-1, 5, 1.5, '0', null, undefined, NaN, {}]) assert.equal(nombreDeReino(raro, ['Ambar']), '', String(raro));
});

test('el marcador de la mesa pinta el reino que guardo la partida junto al nombre del modelo (si no, los mensajes de las IAs hablan de reinos que nadie sabe cual es)', () => {
  const mesa = readFileSync(new URL('../../../web/casino/mesa-conquista.js', import.meta.url), 'utf8');
  assert.match(mesa, /import \{[^}]*nombreDeReino[^}]*\} from '\.\/reinos-conquista\.js'/);
  assert.match(mesa, /nombreDeReino\(s, this\.partida\.reinos\)/, 'pintarMarcador usa el reino de la partida para el asiento');
});

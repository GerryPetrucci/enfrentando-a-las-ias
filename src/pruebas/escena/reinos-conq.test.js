// Los nombres de reino de la Guerra de territorios (Azur, Ámbar, Violeta, Rosa, Marfil): los modelos los ven en su prompt y los usan en sus mensajes («Azur propone paz a Violeta»), pero la escena nombra
// a cada reino con el modelo que lo juega. El marcador muestra los dos para que el publico entienda de quien se habla.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOMBRES_REINOS as DEL_MOTOR } from '../../juegos/conquista/constantes.js';
import { NOMBRES_REINOS, nombreDeReino } from '../../../web/casino/reinos-conquista.js';

const sinAcentos = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

test('los nombres de reino que ve el publico son los del motor, con sus acentos (la web no importa de src/: esta prueba los ata)', () => {
  assert.deepEqual(NOMBRES_REINOS.map(sinAcentos), DEL_MOTOR);
  assert.equal(NOMBRES_REINOS[1], 'Ámbar', 'es texto publico: lleva acento aunque el prompt del motor no');
});

test('nombreDeReino da el reino de un asiento y nada si el asiento no existe', () => {
  assert.equal(nombreDeReino(0), 'Azur');
  assert.equal(nombreDeReino(1), 'Ámbar');
  assert.equal(nombreDeReino(4), 'Marfil');
  for (const raro of [-1, 5, 1.5, '0', null, undefined, NaN, {}]) assert.equal(nombreDeReino(raro), '', String(raro));
});

test('el marcador de la mesa pinta el reino junto al nombre del modelo (si no, los mensajes de las IAs hablan de reinos que nadie sabe cual es)', () => {
  const mesa = readFileSync(new URL('../../../web/casino/mesa-conquista.js', import.meta.url), 'utf8');
  assert.match(mesa, /import \{[^}]*nombreDeReino[^}]*\} from '\.\/reinos-conquista\.js'/);
  assert.match(mesa, /nombreDeReino\(s\)/, 'pintarMarcador usa el reino del asiento');
});

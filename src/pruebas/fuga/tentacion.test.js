// La tentacion efectiva de una situacion: acompanado es la que sorteo el estado; solo (su companero fue capturado o ya escapo)
// sale mucho mas botin, porque la oferta del guardia no tiene sentido sin a quien delatar.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tentacionDe, esSolo } from '../../juegos/fuga/tentacion.js';
import { PUNTOS, P_BOTIN_SOLO, OBJETOS_SOLO, RONDAS } from '../../juegos/fuga/constantes.js';
import { nuevoEstado, forzar } from './ayudas.js';

test('acompanado, la tentacion es la que sorteo el estado, con su objeto o su texto; si no salio, no hay', () => {
  const E = nuevoEstado();
  forzar(E, 'celda', { tentacion: { tipo: 'botin', valor: PUNTOS.botin } });
  assert.deepEqual(tentacionDe(E, E.ronda), { tipo: 'botin', valor: PUNTOS.botin, objeto: 'un alambre' });
  forzar(E, 'ronda', { tentacion: { tipo: 'oferta', valor: PUNTOS.delacion } });
  const oferta = tentacionDe(E, E.ronda);
  assert.equal(oferta.tipo, 'oferta');
  assert.equal(oferta.valor, PUNTOS.delacion);
  assert.match(oferta.texto, /guardia/);
  forzar(E, 'celda'); // el catalogo admite botin pero no salio
  assert.equal(tentacionDe(E, E.ronda), null);
});

test('solo, toda situacion que admitia tentacion trae un botin con probabilidad alta, y la oferta se vuelve un objeto', () => {
  const E = nuevoEstado();
  E.libres = [true, false];
  forzar(E, 'ronda'); // el catalogo trae una oferta del guardia; ninguna sorteada
  E.botinSolo[E.ronda] = [0.5, 0.0];
  assert.deepEqual(tentacionDe(E, E.ronda), { tipo: 'botin', valor: PUNTOS.botin, objeto: OBJETOS_SOLO[0] });
  E.botinSolo[E.ronda] = [0.5, 0.99];
  assert.equal(tentacionDe(E, E.ronda).objeto, OBJETOS_SOLO.at(-1));
  E.botinSolo[E.ronda] = [P_BOTIN_SOLO + 0.01, 0.2];
  assert.equal(tentacionDe(E, E.ronda), null, 'el dado dice que esta vez no hay');
  forzar(E, 'celda'); // un botin del catalogo conserva su objeto
  E.botinSolo[E.ronda] = [0.1, 0.9];
  assert.equal(tentacionDe(E, E.ronda).objeto, 'un alambre');
  forzar(E, 'camara'); // el catalogo no admite tentacion aqui
  E.botinSolo[E.ronda] = [0.0, 0.0];
  assert.equal(tentacionDe(E, E.ronda), null);
});

test('esSolo: queda exactamente uno en juego, por captura o por haber escapado', () => {
  const E = nuevoEstado();
  assert.equal(esSolo(E), false);
  E.libres = [true, false];
  assert.equal(esSolo(E), true);
  E.libres = [false, true];
  assert.equal(esSolo(E), true);
  E.libres = [false, false];
  assert.equal(esSolo(E), false, 'si no queda nadie la partida ya termino');
});

test('en solitario sale mucho mas botin que acompanado', () => {
  let solo = 0, acompanado = 0, total = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const A = nuevoEstado(seed), S = nuevoEstado(seed);
    S.libres = [true, false];
    for (let r = 0; r < RONDAS; r++) {
      total++;
      if (tentacionDe(A, r)) acompanado++;
      if (tentacionDe(S, r)) solo++;
    }
  }
  assert.ok(solo / total > 0.6, `en solitario: ${solo / total}`);
  assert.ok(acompanado / total < 0.5, `acompanado: ${acompanado / total}`);
  assert.ok(solo > acompanado * 1.4);
});

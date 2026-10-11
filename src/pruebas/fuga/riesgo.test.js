// La formula de riesgo de La Fuga. Los valores esperados se calculan con las constantes K, para que afinar el balance no rompa
// las pruebas: lo que se prueba es la FORMA de la formula.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probFallo } from '../../juegos/fuga/riesgo.js';
import { K } from '../../juegos/fuga/constantes.js';
import { nuevoEstado, situacion, jug } from './ayudas.js';

// la ronda: mejor engano (x mejor), normal sigilo (x normal), malo fuerza (x malo); peligro 0.2
const sit = situacion('ronda', { peligro: 0.2 });
const par = (a, b) => [jug(a), jug(b)];
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} contra ${b}`);

test('el ejemplo del diseno: A ayuda con engano, B avanza con sigilo, alarma 1', () => {
  const E = nuevoEstado();
  E.alarma = 1;
  const J = par({ postura: 'ayudar', metodo: 'engano' }, { postura: 'avanzar', metodo: 'sigilo' });
  cerca(probFallo(sit, J, 0, E), 0.2 * K.ajusteMejor * K.posturaPropia.ayudar * K.comboComplemento * (1 + K.alarma), 'A');
  cerca(probFallo(sit, J, 1, E), 0.2 * K.ajusteNormal * K.efectoCompanero.ayudar * K.comboComplemento * (1 + K.alarma), 'B');
});

test('la postura del companero mueve el fallo: sacrificarse y ayudar lo bajan, y separarse le quita la ayuda (sin castigo extra si K lo deja en 1)', () => {
  const E = nuevoEstado();
  const con = (p) => probFallo(sit, par({ postura: 'avanzar', metodo: 'fuerza' }, { postura: p, metodo: 'esperar' }), 0, E);
  assert.ok(con('sacrificarse') < con('ayudar'));
  assert.ok(con('ayudar') < con('avanzar'));
  assert.ok(con('avanzar') <= con('separarse'), 'separarse nunca ayuda al companero');
  assert.ok(K.efectoCompanero.separarse >= K.efectoCompanero.avanzar);
  // esperar no combina con nada: queda solo el efecto de la postura
  cerca(con('avanzar'), 0.2 * K.ajusteMalo * K.posturaPropia.avanzar * K.efectoCompanero.avanzar, 'sin efecto');
});

test('quien se separa no recibe ayuda ni combinacion de metodos y paga su ruta propia', () => {
  const E = nuevoEstado();
  const J = par({ postura: 'separarse', metodo: 'engano' }, { postura: 'ayudar', metodo: 'sigilo' });
  cerca(probFallo(sit, J, 0, E), 0.2 * K.ajusteMejor * K.posturaPropia.separarse, 'separado');
  // el companero que ayuda sufre el efecto de que lo dejen solo, y tampoco recibe combinacion
  cerca(probFallo(sit, J, 1, E), 0.2 * K.ajusteNormal * K.posturaPropia.ayudar * K.efectoCompanero.separarse, 'abandonado');
});

test('los metodos que se complementan bajan el fallo, repetir el mismo lo sube y esperar no combina', () => {
  const E = nuevoEstado();
  const f = (a, b) => probFallo(sit, par({ postura: 'avanzar', metodo: a }, { postura: 'avanzar', metodo: b }), 0, E);
  const base = f('sigilo', 'fuerza');
  cerca(f('sigilo', 'engano') / base, K.comboComplemento, 'complemento');
  cerca(f('sigilo', 'sigilo') / base, K.comboRepetido, 'repetido');
  cerca(f('sigilo', 'esperar') / base, 1, 'esperar');
});

test('la alarma, la cohesion, las heridas y el objeto mueven el fallo', () => {
  const J = par({ postura: 'avanzar', metodo: 'sigilo' }, { postura: 'avanzar', metodo: 'fuerza' });
  const base = probFallo(sit, J, 0, nuevoEstado());
  const con = (cambio) => {
    const E = nuevoEstado();
    cambio(E);
    return probFallo(sit, J, 0, E);
  };
  cerca(con((E) => { E.alarma = 5; }) / base, 1 + K.alarma * 5, 'alarma');
  cerca(con((E) => { E.cohesion = 3; }) / base, 1 - K.cohesion * 3, 'cohesion positiva');
  cerca(con((E) => { E.cohesion = -3; }) / base, 1 + K.cohesion * 3, 'cohesion negativa');
  cerca(con((E) => { E.objeto[0] = { nombre: 'x', restan: 1 }; }) / base, K.objeto, 'objeto');
  cerca(con((E) => { E.objeto[0] = { nombre: 'x', restan: 0 }; }) / base, 1, 'objeto agotado');
  cerca(con((E) => { E.heridas[0] = 2; }) - base, 2 * K.herida, 'heridas');
});

test('el fallo nunca baja del minimo ni sube del maximo', () => {
  const E = nuevoEstado();
  const facil = situacion('ronda', { peligro: 0.01 });
  assert.equal(probFallo(facil, par({ postura: 'avanzar', metodo: 'engano' }, { postura: 'sacrificarse', metodo: 'sigilo' }), 0, E), K.minFallo);
  const dificil = situacion('ronda', { peligro: 0.8 });
  E.alarma = 5;
  E.heridas[0] = 3;
  assert.equal(probFallo(dificil, par({ postura: 'sacrificarse', metodo: 'fuerza' }, { postura: 'separarse', metodo: 'fuerza' }), 0, E), K.maxFallo);
});

test('con el companero capturado o ya escapado no hay ayuda ni combinaciones, toda postura cuenta como avanzar y ir solo es mas dificil', () => {
  const E = nuevoEstado();
  E.libres = [true, false];
  const solo = (postura) => probFallo(sit, [jug({ postura, metodo: 'engano' }), null], 0, E);
  const esperado = 0.2 * K.ajusteMejor * K.posturaPropia.avanzar * K.solo;
  for (const p of ['ayudar', 'avanzar', 'sacrificarse', 'separarse']) cerca(solo(p), esperado, p);
  assert.ok(K.solo > 1, 'ir solo tiene que ser mas dificil que ir acompanado');
});

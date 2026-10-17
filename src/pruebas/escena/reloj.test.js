// El reloj de la Subasta de tiempo (web/casino/reloj.js): empieza normal, se acelera y termina normal. Es una funcion pura del tiempo de pantalla. Sin DOM, sin red.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { duracionDeReloj, tiempoDeReloj, instanteDeCruce, perfilDeReloj } from '../../../web/casino/reloj.js';

const APUESTAS = [0.5, 5, 8, 8.1, 9, 12, 30, 100, 600];
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const pendiente = (t, a, dt = 1e-4) => (tiempoDeReloj(t + dt, a) - tiempoDeReloj(t, a)) / dt;

test('las duraciones que dijo el usuario: 30 s son unos 9 s de pantalla, 600 s son 12 s, y de 8 s para abajo todo va a ritmo normal', () => {
  assert.ok(cerca(duracionDeReloj(30), 9), String(duracionDeReloj(30)));
  assert.ok(cerca(duracionDeReloj(600), 12));
  assert.equal(duracionDeReloj(8), 8);
  assert.equal(duracionDeReloj(5), 5);
  assert.equal(duracionDeReloj(0), 0);
  assert.ok(duracionDeReloj(8.1) < 8.1 + 0.001 && duracionDeReloj(8.1) >= 8, 'apenas arriba de 8 casi no cambia');
  for (let a = 9; a <= 700; a += 7.3) assert.ok(duracionDeReloj(a) <= a + 1e-9 && duracionDeReloj(a) >= 8, `a=${a}`);
});

test('es monotona y continua en todo su recorrido', () => {
  for (const a of APUESTAS) {
    const total = duracionDeReloj(a);
    let anterior = 0;
    for (let i = 0; i <= 2000; i++) {
      const t = (total * i) / 2000;
      const c = tiempoDeReloj(t, a);
      assert.ok(c >= anterior - 1e-9, `a=${a} t=${t}: retrocede`);
      assert.ok(c - anterior <= (a / 2000) * 400 + 1e-6 || a > 8 === false, 'sin saltos'); // el salto entre dos puntos de la malla no pasa de lo que da la velocidad maxima
      anterior = c;
    }
  }
});

test('los 3 primeros segundos y los 3 ultimos van a ritmo normal (pendiente 1), y la velocidad nunca baja de 1', () => {
  for (const a of APUESTAS.filter((x) => x > 8)) {
    const total = duracionDeReloj(a);
    for (const t of [0.01, 1, 2.5, 2.95]) assert.ok(cerca(pendiente(t, a), 1, 1e-3), `a=${a} t=${t}: ${pendiente(t, a)}`);
    for (const t of [total - 2.95, total - 2.5, total - 1, total - 0.05]) assert.ok(cerca(pendiente(t, a), 1, 1e-3), `a=${a} t=${t}: ${pendiente(t, a)}`);
    for (let i = 0; i < 500; i++) assert.ok(pendiente((total * i) / 500, a) >= 1 - 1e-3, `a=${a}: va mas lento que lo normal`);
  }
});

test('el cambio de velocidad es una rampa suave de menos de medio segundo: la velocidad no da saltos', () => {
  for (const a of APUESTAS.filter((x) => x > 8)) {
    const p = perfilDeReloj(a);
    assert.ok(p.rampa > 0 && p.rampa < 0.5, `a=${a}: rampa ${p.rampa}`);
    assert.ok(p.velocidad >= 1);
    const total = duracionDeReloj(a);
    const dt = 1 / 120;
    let max = 0;
    for (let t = 0; t + 2 * dt < total; t += dt) max = Math.max(max, Math.abs(pendiente(t + dt, a, dt) - pendiente(t, a, dt)));
    assert.ok(max <= ((p.velocidad - 1) / p.rampa) * dt * 1.1 + 1e-6, `a=${a}: salto de velocidad de ${max}`);
  }
});

test('el reloj llega exactamente a la apuesta al terminar y nunca se pasa', () => {
  for (const a of APUESTAS) {
    const total = duracionDeReloj(a);
    assert.ok(cerca(tiempoDeReloj(total, a), a, 1e-9), `a=${a}`);
    assert.equal(tiempoDeReloj(total + 50, a), a);
    assert.equal(tiempoDeReloj(-3, a), 0);
    for (let i = 0; i <= 300; i++) assert.ok(tiempoDeReloj((total * i) / 300, a) <= a + 1e-9);
  }
});

test('instanteDeCruce es la inversa: cada boton se suelta cuando el contador pasa por su apuesta, en el orden de las apuestas', () => {
  for (const a of APUESTAS) {
    let anterior = -1;
    for (let k = 0; k <= 40; k++) {
      const apuesta = (a * k) / 40;
      const t = instanteDeCruce(apuesta, a);
      assert.ok(cerca(tiempoDeReloj(t, a), apuesta, 1e-3), `a=${a} apuesta=${apuesta}: el contador marca ${tiempoDeReloj(t, a)}`);
      assert.ok(t >= anterior - 1e-9, 'en orden creciente');
      anterior = t;
    }
    assert.equal(instanteDeCruce(0, a), 0);
    assert.ok(cerca(instanteDeCruce(a, a), duracionDeReloj(a), 1e-9));
  }
});

test('no usa el azar del navegador ni el reloj del equipo', () => {
  const fuente = readFileSync(new URL('../../../web/casino/reloj.js', import.meta.url), 'utf8');
  for (const prohibido of ['Math.random', 'Date.now', 'performance', 'new Date']) assert.ok(!fuente.includes(prohibido), prohibido);
});

test('una entrada ilegible no lanza: vale 0', () => {
  for (const raro of [NaN, -5, null, undefined, 'x', {}, Infinity]) {
    assert.equal(duracionDeReloj(raro), 0, String(raro));
    assert.equal(tiempoDeReloj(3, raro), 0);
    assert.equal(instanteDeCruce(3, raro), 0);
  }
  assert.equal(tiempoDeReloj(NaN, 30), 0);
  assert.equal(instanteDeCruce(NaN, 30), 0);
  assert.equal(perfilDeReloj(NaN).acelera, false);
});

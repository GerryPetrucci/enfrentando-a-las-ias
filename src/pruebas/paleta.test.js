// Protege la paleta global (web/paleta.js): que cada contendiente tenga color, que el codigo no tenga
// otra copia, y que dos IAs no se confundan al pintar territorios sobre el mapa.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETA, colorDe, franjasDe, fondoCSS } from '../../web/paleta.js';
import { CONTENDIENTES } from '../modelos.js';

const HEX = /^#[0-9A-Fa-f]{6}$/;
// Colores base del terreno del mapa de pixel art (juego 2). Cada territorio se pinta al 50% encima.
const TERRENOS = { pasto: '#528f42', bosque: '#2e6a37', montana: '#80828c', arena: '#cdb67f' };
const DISTANCIA_MINIMA = 15; // en Lab (CIE76): por debajo, a simple vista se confunden

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function lab([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))];
}
const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sobre = (terreno, color) => lab(rgb(terreno).map((v, i) => Math.round(v * 0.5 + rgb(color)[i] * 0.5)));

test('cada contendiente tiene color en la paleta, con la misma fuente en el codigo', () => {
  for (const [id, c] of Object.entries(CONTENDIENTES)) {
    assert.ok(PALETA[id], `falta ${id} en web/paleta.js`);
    assert.equal(PALETA[id].nombre, c.nombre);
    assert.equal(c.color, PALETA[id].color, `${id}: el color debe venir de la paleta, no estar repetido`);
  }
});

test('los colores son hex validos y las IAs multicolor traen al menos dos', () => {
  for (const [id, p] of Object.entries(PALETA)) {
    assert.match(p.color, HEX, id);
    assert.match(p.texto, HEX, id);
    if (p.multi) {
      assert.ok(p.multi.length >= 2, id);
      p.multi.forEach((c) => assert.match(c, HEX, id));
    }
  }
});

test('ayudantes: respaldo para IAs desconocidas y degradado para las multicolor', () => {
  assert.equal(colorDe('no-existe', '#123456'), '#123456');
  assert.equal(franjasDe('claude'), null);
  assert.match(fondoCSS('gemini'), /^linear-gradient/);
  assert.equal(fondoCSS('claude'), PALETA.claude.color);
});

test('dos IAs de color liso no se confunden sobre ningun terreno, ni con el terreno sin dueno', () => {
  const lisas = Object.entries(PALETA).filter(([, p]) => !p.multi);
  for (const [terreno, base] of Object.entries(TERRENOS)) {
    for (const [id, p] of lisas) {
      assert.ok(distancia(sobre(base, p.color), lab(rgb(base))) >= DISTANCIA_MINIMA, `${id} casi no se nota sobre ${terreno}`);
    }
    for (let i = 0; i < lisas.length; i++) for (let j = i + 1; j < lisas.length; j++) {
      // las variantes economicas comparten color con su familia a proposito: solo se comparan familias distintas
      if ((lisas[i][1].familia ?? lisas[i][0]) === (lisas[j][1].familia ?? lisas[j][0])) continue;
      const d = distancia(sobre(base, lisas[i][1].color), sobre(base, lisas[j][1].color));
      assert.ok(d >= DISTANCIA_MINIMA, `${lisas[i][0]} y ${lisas[j][0]} se confunden sobre ${terreno} (distancia ${d.toFixed(1)})`);
    }
  }
});

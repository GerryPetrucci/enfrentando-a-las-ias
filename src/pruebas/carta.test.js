// La carta de ajuste (herramientas/carta-de-ajuste.html) es una pagina de prueba para OBS: dibuja la hoja maestra con cada
// formato, la zona segura y marcas de sincronia. Se prueba sin navegador: se extraen sus scripts y se corren con un canvas falso.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOJA, FORMATOS, ZONA_SEGURA } from '../../herramientas/formatos.mjs';

const html = readFileSync(new URL('../../herramientas/carta-de-ajuste.html', import.meta.url), 'utf8');
const geometria = /<script id="geometria" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1];
const codigo = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];

test('la carta lleva exactamente la geometria de formatos.mjs', () => {
  assert.ok(geometria, 'falta el bloque <script id="geometria">');
  assert.deepEqual(JSON.parse(geometria), { hoja: HOJA, formatos: FORMATOS, zonaSegura: ZONA_SEGURA });
  assert.match(html, new RegExp(`<canvas id="c" width="${HOJA.ancho}" height="${HOJA.alto}"`));
});

// canvas falso: anota los textos y los rectangulos que se dibujan
function correr(tiempos) {
  const textos = [], rects = [];
  const ctx = new Proxy({}, {
    get: (_, nombre) => {
      if (nombre === 'measureText') return () => ({ width: 100 });
      if (nombre === 'fillText') return (t) => textos.push(String(t));
      if (nombre === 'strokeRect' || nombre === 'fillRect') return (...a) => rects.push([nombre, ...a]);
      return () => {};
    },
    set: () => true,
  });
  const lienzo = { getContext: () => ctx, width: HOJA.ancho, height: HOJA.alto };
  const elementos = { c: lienzo, geometria: { textContent: geometria } };
  let pendiente = null;
  const raf = (cb) => { pendiente = cb; };
  const reloj = { now: () => 0 };
  new Function('document', 'requestAnimationFrame', 'performance', codigo)({ getElementById: (id) => elementos[id] }, raf, reloj);
  for (const t of tiempos) { const cb = pendiente; pendiente = null; reloj.now = () => t; cb(t); }
  return { textos, rects };
}

test('la carta dibuja los formatos y la zona segura, y ya no el recorte 4:5', () => {
  const { textos, rects } = correr([0]);
  const todo = textos.join('\n');
  for (const etiqueta of ['9:16', '16:9', 'ZONA SEGURA']) assert.ok(todo.includes(etiqueta), `falta "${etiqueta}"`);
  assert.ok(!todo.includes('4:5'), 'el 4:5 se quito');
  assert.ok(rects.length > 10, 'dibuja muy poco');
});

test('la carta cuenta los cuadros y el tiempo para poder ver cuadros perdidos y falta de sincronia', () => {
  const { textos } = correr([0, 33, 66, 100]);
  assert.ok(textos.some((t) => /cuadro 3\b/.test(t)), 'no cuenta cuadros');
  assert.ok(textos.some((t) => /00:00\.100/.test(t)), 'no muestra el tiempo con milisegundos');
});

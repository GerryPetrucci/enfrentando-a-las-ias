// Las redes del sitio (web/redes.js): estan todas las del proyecto, con su enlace y su icono, y la documentacion no se queda atras.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REDES, redesHtml } from '../../web/redes.js';
import { REDES as REDES_DEL_PAQUETE } from '../../herramientas/nombres.mjs';
import { menuHtml, pieHtml } from '../../web/menu.js';

const leer = (ruta) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');

test('el sitio lista TODAS las redes del paquete (siglas y nombres), cada una con enlace https y su icono', () => {
  assert.deepEqual(Object.fromEntries(REDES.map((r) => [r.id, r.nombre])), REDES_DEL_PAQUETE, 'una red nueva del paquete debe agregarse tambien en web/redes.js');
  for (const r of REDES) {
    assert.match(r.url, /^https:\/\//, r.id);
    assert.match(r.icono, /^<svg /, r.id);
    assert.match(r.icono, /aria-hidden="true"/, `${r.id}: el icono es adorno, el nombre es lo que se lee`);
  }
  assert.equal(REDES.find((r) => r.id === 'fb').url, 'https://www.facebook.com/profile.php?id=61595387681724');
});

test('cada enlace lleva icono y nombre, y se abre en otra pestana sin pasar el control de la pagina', () => {
  const h = redesHtml();
  for (const r of REDES) assert.ok(h.includes(`<a href="${r.url}" target="_blank" rel="noopener">${r.icono}<span>${r.nombre}</span></a>`), r.id);
  assert.match(h, /^<div class="redes" aria-label="Redes">/);
  assert.match(redesHtml('redes-pie'), /^<div class="redes-pie"/);
});

test('el pie de todas las paginas trae las mismas redes, Facebook incluido', () => {
  const pie = pieHtml();
  for (const r of REDES) assert.ok(pie.includes(r.url), r.id);
  assert.match(pie, /Facebook/);
  assert.doesNotMatch(menuHtml([], {}), /facebook/i, 'la barra de arriba no se llena de redes');
});

test('la landing pinta las redes desde web/redes.js (no las copia a mano)', () => {
  const h = leer('web/index.html');
  assert.match(h, /redesHtml/);
  assert.doesNotMatch(h, /tiktok\.com|instagram\.com|facebook\.com/, 'los enlaces viven solo en redes.js');
});

test('la documentacion tiene al dia los enlaces y Claude importa la fuente comun de redes', () => {
  const perfiles = leer('marca/perfiles.md');
  for (const r of REDES) assert.ok(perfiles.includes(r.url.replace(/^https:\/\/(www\.)?/, '')), `marca/perfiles.md no trae el enlace de ${r.nombre}: ${r.url}`);
  assert.match(leer('CLAUDE.md'), /^@AGENTS\.md$/m, 'Claude importa el contrato comun sin duplicarlo');
  assert.match(leer('AGENTS.md'), /web\/redes\.js/, 'la fuente compartida dice donde viven las redes del sitio');
});

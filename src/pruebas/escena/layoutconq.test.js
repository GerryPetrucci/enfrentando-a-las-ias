// Diseno de pantalla de la escena de la Guerra de territorios (web/casino/layout-conquista.js): rectangulos de cada formato. Sin DOM.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colocarConquista } from '../../../web/casino/layout-conquista.js';
import { FORMATOS_ESCENA } from '../../../web/casino/layout.js';
import { CONFIG } from '../../mapa.js';

const MAPAS = Object.values(CONFIG).map((c) => ({ ancho: c.W, alto: c.H, tile: c.T })); // 2, 3, 4 y 5 reinos
const FORMATOS = Object.keys(FORMATOS_ESCENA);
const RECTS = ['etiqueta', 'cabecera', 'mapa', 'feed', 'marcador', 'subtitulos', 'cartel', 'flashback', 'tarjeta', 'tarjetaAbajo', 'vs', 'vsAbajo', 'panelFinal'];
const dentro = (r, g) => r.x >= g.x && r.y >= g.y && r.x + r.ancho <= g.x + g.ancho && r.y + r.alto <= g.y + g.alto;
const seCruzan = (a, b) => a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto;

test('cada formato trae todos los rectangulos, enteros y dentro del lienzo, y las medidas del lienzo y la zona son las de layout.js', () => {
  for (const formato of FORMATOS) for (const m of MAPAS) {
    const L = colocarConquista(formato, m);
    assert.deepEqual([L.ancho, L.alto, L.zona], [FORMATOS_ESCENA[formato].ancho, FORMATOS_ESCENA[formato].alto, FORMATOS_ESCENA[formato].zona]);
    for (const nombre of RECTS) {
      const r = L[nombre];
      assert.ok(r && [r.x, r.y, r.ancho, r.alto].every((v) => Number.isInteger(v)) && r.ancho > 0 && r.alto > 0, `${formato} ${nombre}: rectangulo`);
      assert.ok(dentro(r, L.mesa), `${formato} ${nombre} se sale del lienzo`);
    }
  }
});

test('lo que hay que leer (tarjetas, cartel, flashback, subtitulos y pantalla final) cabe en la zona segura; las bandas VS son de lado a lado pero su altura cabe', () => {
  for (const formato of FORMATOS) for (const m of MAPAS) {
    const L = colocarConquista(formato, m);
    for (const nombre of ['tarjeta', 'tarjetaAbajo', 'cartel', 'flashback', 'subtitulos', 'panelFinal']) assert.ok(dentro(L[nombre], L.zona), `${formato} ${nombre} sale de la zona segura`);
    for (const nombre of ['vs', 'vsAbajo']) assert.ok(L[nombre].y >= L.zona.y && L[nombre].y + L[nombre].alto <= L.zona.y + L.zona.alto, `${formato} ${nombre}: la banda VS sale de la zona a lo alto`);
  }
  const v = colocarConquista('9x16', MAPAS[2]);
  assert.ok(seCruzan(v.feed, v.mapa), 'el feed va sobre el mapa, pegado a su pie');
});

test('la caja del flashback alcanza para el pacto cumplido: cabecera, y dos privados de 140 caracteres (quien + 3 lineas de cita) con su relleno', () => {
  // cabecera 24 + 2 x (quien 24 x 1.2 + cita 3 x 32 x 1.22) + 4 espacios de 8 + relleno de 32 = unos 345 px (con holgura: 400)
  for (const formato of FORMATOS) for (const m of MAPAS) assert.ok(colocarConquista(formato, m).flashback.alto >= 400, `${formato}: el flashback recorta el segundo privado`);
});

test('las piezas que no se pueden encimar no se tocan: cabecera, mapa, marcador, feed, subtitulos, cartel y flashback', () => {
  const PARES = [['cabecera', 'etiqueta'], ['cabecera', 'mapa'], ['etiqueta', 'mapa'], ['marcador', 'mapa'], ['marcador', 'feed'], ['marcador', 'subtitulos'], ['feed', 'subtitulos'], ['cartel', 'flashback']];
  for (const formato of FORMATOS) for (const m of MAPAS) {
    const L = colocarConquista(formato, m);
    for (const [a, b] of PARES) {
      if (formato === '16x9' && a === 'etiqueta') continue; // en 16:9 la etiqueta va al pie, sobre el fondo, no junto a la cabecera
      assert.equal(seCruzan(L[a], L[b]), false, `${formato}: ${a} y ${b} se encimarian`);
    }
  }
});

test('en 9:16 la cabecera, el aviso, el mapa, el marcador y el feed van dentro de la zona segura y los avisos de batalla no tapan la cabecera (decidido el 20 de octubre de 2026)', () => {
  for (const m of MAPAS) {
    const L = colocarConquista('9x16', m);
    for (const nombre of ['cabecera', 'etiqueta', 'mapa', 'marcador', 'feed', 'subtitulos']) assert.ok(dentro(L[nombre], L.zona), `${m.ancho}x${m.alto}: ${nombre} sale de la zona segura`);
    for (const nombre of ['cartel', 'flashback', 'tarjeta', 'tarjetaAbajo', 'vs', 'vsAbajo', 'panelFinal']) assert.ok(L[nombre].y >= L.etiqueta.y + L.etiqueta.alto, `${m.ancho}x${m.alto}: ${nombre} tapa la cabecera`);
    assert.equal(L.marcador.y + L.marcador.alto, L.zona.y + L.zona.alto, 'el marcador va pegado al pie de la zona');
    assert.ok(L.escalaCelda >= 10, `${m.ancho}x${m.alto}: la celda de ${L.escalaCelda} px deja el mapa ilegible`);
  }
});

test('el mapa se dibuja con una celda entera, conservando su proporcion y sin salirse de su espacio: en 9:16 la mas grande que quepa en la zona segura', () => {
  for (const formato of FORMATOS) for (const m of MAPAS) {
    const L = colocarConquista(formato, m);
    assert.ok(Number.isInteger(L.escalaCelda) && L.escalaCelda >= 1);
    assert.equal(L.mapa.ancho, m.ancho * L.escalaCelda);
    assert.equal(L.mapa.alto, m.alto * L.escalaCelda);
    if (formato === '9x16') { assert.ok(L.escalaCelda <= m.tile, 'en 9:16 la celda no pasa de la del motor'); assert.ok(dentro(L.mapa, L.zona), 'en 9:16 el mapa cabe en la zona segura'); }
    else assert.ok(L.mapa.alto <= L.zona.alto && L.mapa.x >= L.zona.x, '16:9: el mapa cabe en la zona, a la izquierda');
  }
});

test('un formato desconocido o un mapa ilegible dan un error claro', () => {
  for (const raro of [undefined, null, 'cuadrado', 7, '', '__proto__', 'hoja']) assert.throws(() => colocarConquista(raro, MAPAS[2]), /formato desconocido.*9x16 y 16x9/);
  for (const raro of [undefined, null, {}, { ancho: 0, alto: 10 }, { ancho: 'x', alto: 5 }, 7]) assert.throws(() => colocarConquista('9x16', raro), /mapa ilegible/);
});

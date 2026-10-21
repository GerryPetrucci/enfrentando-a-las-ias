// La zona segura del 9:16 vale para TODOS los juegos: arriba y abajo las redes ponen su propia interfaz (descripcion, comentarios, botones, titulo), asi que nada de lo que dibuja una escena
// vertical puede salirse de la zona (herramientas/formatos.mjs: arriba 285, abajo 420, izquierda 60, derecha 130). Decidido el 20 de octubre de 2026 al ver que Guerra de territorios ocupaba
// el lienzo entero. Solo las bandas VS de Guerra van de lado a lado (a lo alto cabe en la zona) y las tarjetas de arranque ya usan la zona.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colocar } from '../../../web/casino/layout.js';
import { colocarConquista } from '../../../web/casino/layout-conquista.js';
import { colocarFuga } from '../../../web/casino/layout-fuga.js';
import { colocarMayorMenor } from '../../../web/casino/layout-mayormenor.js';
import { colocarSolitario } from '../../../web/casino/layout-solitario.js';
import { colocarSubasta } from '../../../web/casino/layout-subasta.js';
import { colocarTripleDado } from '../../../web/casino/layout-tripledado.js';
import { CONFIG } from '../../mapa.js';

const MAPAS = Object.values(CONFIG).map((c) => ({ ancho: c.W, alto: c.H, tile: c.T }));
const JUEGOS = {
  'duda': () => [colocar('9x16')],
  'conquista': () => MAPAS.map((m) => colocarConquista('9x16', m)),
  'fuga': () => [colocarFuga('9x16')],
  'mayormenor': () => [colocarMayorMenor('9x16')],
  'solitario': () => [colocarSolitario('9x16')],
  'subasta': () => [colocarSubasta('9x16')],
  'tripledado': () => [colocarTripleDado('9x16')],
};
const NO_SON_PIEZAS = new Set(['zona', 'mesa', 'formato', 'ancho', 'alto']);
const LADO_A_LADO = new Set(['vs', 'vsAbajo']); // las bandas VS de Guerra cubren todo el ancho a proposito: solo se les pide la altura
const esRect = (v) => v && typeof v === 'object' && ['x', 'y', 'ancho', 'alto'].every((k) => Number.isFinite(v[k]));

function* rectangulos(nombre, valor) {
  if (esRect(valor)) yield [nombre, valor];
  else if (Array.isArray(valor)) for (const [i, v] of valor.entries()) yield* rectangulos(`${nombre}[${i}]`, v);
  else if (valor && typeof valor === 'object') for (const [k, v] of Object.entries(valor)) yield* rectangulos(`${nombre}.${k}`, v);
}

test('en 9:16 ninguna pieza de ningun juego se sale de la zona segura a lo alto (arriba 285 y abajo 420 libres para la interfaz de las redes)', () => {
  for (const [juego, hacer] of Object.entries(JUEGOS)) for (const L of hacer()) {
    const { zona } = L;
    let piezas = 0;
    for (const [campo, valor] of Object.entries(L)) {
      if (NO_SON_PIEZAS.has(campo)) continue;
      for (const [nombre, r] of rectangulos(campo, valor)) {
        piezas++;
        assert.ok(r.y >= zona.y && r.y + r.alto <= zona.y + zona.alto, `${juego} ${nombre} se sale de la zona segura a lo alto: y ${r.y}..${r.y + r.alto} (zona ${zona.y}..${zona.y + zona.alto})`);
        if (!LADO_A_LADO.has(campo)) assert.ok(r.x >= zona.x && r.x + r.ancho <= zona.x + zona.ancho, `${juego} ${nombre} se sale de la zona segura a lo ancho: x ${r.x}..${r.x + r.ancho}`);
      }
    }
    assert.ok(piezas >= 5, `${juego}: la prueba no vio piezas (${piezas})`);
  }
});

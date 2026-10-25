// Diseno de la pantalla de La Fuga (sala de control): donde va cada cosa en 9:16 (barra de medidores, dos camaras una sobre otra y subtitulos) y en 16:9 (dos camaras lado a lado, la barra
// de medidores y los subtitulos debajo). Lo que se lee cabe en la zona segura y nada se pisa.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colocarFuga } from '../../../web/casino/layout-fuga.js';
import { ZONA_SEGURA } from '../../../herramientas/formatos.mjs';

const dentro = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.ancho <= b.x + b.ancho && a.y + a.alto <= b.y + b.alto;
const sinChoque = (a, b) => a.x + a.ancho <= b.x || b.x + b.ancho <= a.x || a.y + a.alto <= b.y || b.y + b.alto <= a.y;
const bandas = (L) => ({ etiqueta: L.etiqueta, cabecera: L.cabecera, panel: L.panel.marco, subtitulos: L.subtitulos, cam0: L.camaras[0].cuadro, cam1: L.camaras[1].cuadro });
const SUPERPUESTAS = ['rotulo', 'puntos', 'rec', 'hora', 'sello', 'mensaje', 'riesgo', 'aviso']; // piezas que se dibujan sobre la imagen de una camara
const FIJAS = ['rotulo', 'puntos', 'rec', 'hora', 'sello']; // las de las bandas de arriba y de abajo: no tocan la escena

test('en 9:16 todo lo que se lee cabe en la zona segura', () => {
  const L = colocarFuga('9x16');
  assert.deepEqual([L.ancho, L.alto], [1080, 1920]);
  assert.deepEqual(L.zona, ZONA_SEGURA);
  for (const [nombre, r] of Object.entries({ ...bandas(L), regla: L.regla })) assert.ok(dentro(r, ZONA_SEGURA), `${nombre} se sale de la zona segura: ${JSON.stringify(r)}`);
});

test('en 16:9 todo lo que se lee cabe en el lienzo, dentro del margen de seguridad', () => {
  const L = colocarFuga('16x9');
  assert.deepEqual([L.ancho, L.alto], [1920, 1080]);
  assert.ok(dentro(L.zona, { x: 0, y: 0, ancho: 1920, alto: 1080 }));
  for (const [nombre, r] of Object.entries({ ...bandas(L), regla: L.regla })) assert.ok(dentro(r, L.zona), `${nombre} se sale de la zona: ${JSON.stringify(r)}`);
});

test('las dos camaras son iguales y no se pisan con nada de la pantalla: ni entre si, ni con la barra de medidores, los subtitulos, la etiqueta ni la cabecera', () => {
  for (const f of ['9x16', '16x9']) {
    const L = colocarFuga(f);
    assert.equal(L.camaras.length, 2, `${f}: dos camaras`);
    const [a, b] = L.camaras.map((c) => c.cuadro);
    assert.deepEqual([a.ancho, a.alto], [b.ancho, b.alto], `${f}: las dos camaras miden lo mismo`);
    const lista = Object.entries(bandas(L));
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) assert.ok(sinChoque(lista[i][1], lista[j][1]), `${f}: ${lista[i][0]} pisa a ${lista[j][0]}`);
  }
});

test('en cada camara las piezas caen dentro del cuadro, las de los bordes no tocan la escena y ninguna de las que se dibujan encima se pisa con otra', () => {
  for (const f of ['9x16', '16x9']) {
    const L = colocarFuga(f);
    for (const [k, c] of L.camaras.entries()) {
      assert.ok(dentro(c.escena, c.cuadro), `${f} cam ${k}: la escena se sale del cuadro`);
      for (const nombre of SUPERPUESTAS) assert.ok(dentro(c[nombre], c.cuadro), `${f} cam ${k}: ${nombre} se sale del cuadro`);
      for (const nombre of FIJAS) assert.ok(sinChoque(c[nombre], c.escena), `${f} cam ${k}: ${nombre} tapa la escena`);
      const visibles = SUPERPUESTAS.filter((n) => n !== 'aviso'); // el aviso de la oferta nunca coincide con el mensaje ni con el riesgo: se prueba aparte
      for (let i = 0; i < visibles.length; i++) for (let j = i + 1; j < visibles.length; j++) assert.ok(sinChoque(c[visibles[i]], c[visibles[j]]), `${f} cam ${k}: ${visibles[i]} pisa a ${visibles[j]}`);
      assert.ok(dentro(c.aviso, c.escena), `${f} cam ${k}: el aviso va sobre la imagen`);
    }
  }
});

test('la escena de cada camara mide lo que piden las mini escenas (entre 2:1 y 3:1) y la barra de medidores guarda la alarma y la cohesion dentro de su marco sin pisarse', () => {
  for (const f of ['9x16', '16x9']) {
    const L = colocarFuga(f);
    for (const c of L.camaras) {
      const razon = c.escena.ancho / c.escena.alto;
      assert.ok(razon >= 2 && razon <= 3, `${f}: la escena mide ${c.escena.ancho} x ${c.escena.alto} (${razon.toFixed(2)}:1)`);
      assert.ok(c.escena.alto >= 290, `${f}: alto de la escena`);
    }
    const piezas = Object.entries({ alarmaRotulo: L.panel.alarma.rotulo, alarmaBarra: L.panel.alarma.barra, cohesionRotulo: L.panel.cohesion.rotulo, cohesionBarra: L.panel.cohesion.barra });
    for (const [nombre, r] of piezas) assert.ok(dentro(r, L.panel.marco), `${f}: ${nombre} se sale del panel`);
    for (let i = 0; i < piezas.length; i++) for (let j = i + 1; j < piezas.length; j++) assert.ok(sinChoque(piezas[i][1], piezas[j][1]), `${f}: ${piezas[i][0]} pisa a ${piezas[j][0]}`);
    assert.ok(L.panel.alarma.barra.ancho >= L.panel.marco.ancho * 0.45 && L.panel.cohesion.barra.ancho >= L.panel.marco.ancho * 0.45, `${f}: las barras aprovechan casi la mitad del panel cada una`);
  }
});

test('los subtitulos tienen alto para los renglones de una decision con dos mensajes (al menos 190 px) y la regla oculta cubre las dos camaras', () => {
  for (const f of ['9x16', '16x9']) {
    const L = colocarFuga(f);
    assert.ok(L.subtitulos.alto >= 190, `${f}: los subtitulos miden ${L.subtitulos.alto}`);
    const [a, b] = L.camaras.map((c) => c.cuadro);
    assert.ok(L.regla.x <= a.x && L.regla.y <= a.y && L.regla.x + L.regla.ancho >= b.x + b.ancho && L.regla.y + L.regla.alto >= b.y + b.alto, `${f}: la regla no cubre las camaras`);
    assert.ok(sinChoque(L.regla, L.subtitulos) && sinChoque(L.regla, L.panel.marco), `${f}: la regla tapa los medidores o los subtitulos`);
  }
});

test('un formato desconocido da un error claro que dice cuales hay', () => {
  for (const raro of [undefined, null, 'cuadrado', 7, '', '__proto__']) assert.throws(() => colocarFuga(raro), /formato desconocido.*9x16 y 16x9/);
});

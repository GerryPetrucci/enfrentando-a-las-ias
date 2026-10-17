// Las acciones de la silueta de La Fuga (web/casino/siluetas.js): funciones puras del tiempo que dicen donde esta la silueta y que pose tiene en cada instante. Sin DOM.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCIONES, NOMBRES_DE_ACCION, accionDeResultado } from '../../../web/casino/siluetas.js';

const CTX = { desde: 0.12, hasta: 0.8, color: '#445566', colorCaido: '#ff5a4d', objeto: 0.5 };
const PASOS = 200;

test('las ocho acciones del plan existen (pasa, tropieza, cae, sale, ayuda, separa, toma y acepta) y cada una es una funcion', () => {
  assert.deepEqual(Object.keys(ACCIONES).sort(), ['acepta', 'ayuda', 'cae', 'pasa', 'sale', 'separa', 'toma', 'tropieza']);
  assert.deepEqual([...NOMBRES_DE_ACCION].sort(), Object.keys(ACCIONES).sort());
  for (const f of Object.values(ACCIONES)) assert.equal(typeof f, 'function');
});

test('cada accion esta definida en t = 0 y t = 1 (y fuera de rango o con basura se acota, sin lanzar) con una posicion, una pose y un color', () => {
  for (const [nombre, f] of Object.entries(ACCIONES)) {
    for (const t of [0, 1, -3, 7, NaN, undefined, null, 'x']) {
      const r = f(t, CTX);
      assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y), `${nombre}(${t}): x e y`);
      assert.ok(Number.isFinite(r.pose.rot) && Number.isFinite(r.pose.paso) && Number.isFinite(r.pose.brazo), `${nombre}(${t}): la pose`);
      assert.equal(typeof r.color, 'string');
    }
    assert.deepEqual(f(-3, CTX), f(0, CTX), `${nombre}: antes de empezar vale lo de t = 0`);
    assert.deepEqual(f(7, CTX), f(1, CTX), `${nombre}: despues de terminar vale lo de t = 1`);
    assert.doesNotThrow(() => f(0.5, undefined), `${nombre}: sin contexto usa los valores por defecto`);
    assert.doesNotThrow(() => f(0.5, null));
  }
});

test('cada accion es pura (misma entrada, misma salida; no cambia el contexto) y continua (ningun salto brusco entre dos instantes cercanos)', () => {
  for (const [nombre, f] of Object.entries(ACCIONES)) {
    const ctx = structuredClone(CTX);
    for (let k = 0; k <= PASOS; k++) {
      const t = k / PASOS;
      assert.deepEqual(f(t, ctx), f(t, ctx), `${nombre}(${t}): no es pura`);
      if (k === 0) continue;
      const a = f((k - 1) / PASOS, ctx), b = f(t, ctx);
      assert.ok(Math.abs(b.x - a.x) < 0.02, `${nombre}(${t}): salto en x de ${Math.abs(b.x - a.x).toFixed(3)}`);
      assert.ok(Math.abs(b.y - a.y) < 0.02, `${nombre}(${t}): salto en y de ${Math.abs(b.y - a.y).toFixed(3)}`);
      assert.ok(Math.abs(b.pose.rot - a.pose.rot) < 6, `${nombre}(${t}): salto de ${Math.abs(b.pose.rot - a.pose.rot).toFixed(1)} grados`);
      assert.ok(Math.abs(b.pose.brazo - a.pose.brazo) < 0.1, `${nombre}(${t}): salto del brazo`);
    }
    assert.deepEqual(ctx, CTX, `${nombre}: cambio el contexto`);
  }
});

test('pasa termina en la meta, sale termina fuera del cuadro, tropieza llega a la meta con un tropiezo en medio y cae no llega: queda en el suelo y de otro color', () => {
  assert.equal(ACCIONES.pasa(0, CTX).x, CTX.desde);
  assert.equal(ACCIONES.pasa(1, CTX).x, CTX.hasta);
  assert.ok(ACCIONES.sale(1, CTX).x > 1, 'sale termina fuera del cuadro');
  assert.ok(ACCIONES.sale(0, CTX).x === CTX.desde && ACCIONES.sale(0.5, CTX).x < 1);
  assert.equal(ACCIONES.tropieza(1, CTX).x, CTX.hasta);
  assert.ok(Math.max(...Array.from({ length: PASOS + 1 }, (_, k) => Math.abs(ACCIONES.tropieza(k / PASOS, CTX).pose.rot))) >= 10, 'el tropiezo se nota');
  assert.equal(ACCIONES.tropieza(1, CTX).pose.rot, 0, 'despues del tropiezo se endereza');
  const cae = ACCIONES.cae(1, CTX);
  assert.ok(cae.x < CTX.hasta, 'el capturado no llega a la meta');
  assert.ok(Math.abs(cae.pose.rot) >= 80, 'queda tumbado');
  assert.equal(cae.color, CTX.colorCaido);
  assert.equal(ACCIONES.cae(0, CTX).color, CTX.color);
  assert.equal(ACCIONES.pasa(1, CTX).color, CTX.color);
});

test('ayudar levanta el brazo y vuelve, separarse se adelanta, tomar se agacha hacia el objeto y aceptar la oferta lleva la mano al oido (y todo termina quieto)', () => {
  const brazo = (f) => Math.max(...Array.from({ length: PASOS + 1 }, (_, k) => f(k / PASOS, CTX).pose.brazo));
  assert.ok(brazo(ACCIONES.ayuda) >= 0.9 && ACCIONES.ayuda(1, CTX).pose.brazo === 0, 'ayuda: levanta y baja');
  assert.ok(ACCIONES.separa(1, CTX).x > CTX.desde, 'separa: se adelanta');
  assert.ok(ACCIONES.toma(0.5, CTX).pose.agacha > 0.8 || brazo(ACCIONES.toma) >= 0.9, 'toma: se agacha');
  assert.ok(Math.abs(ACCIONES.toma(0.5, CTX).x - CTX.objeto) < Math.abs(CTX.desde - CTX.objeto), 'toma: se acerca al objeto');
  assert.ok(ACCIONES.acepta(1, CTX).pose.brazo >= 0.9, 'acepta: la mano queda en el oido');
});

test('accionDeResultado elige la accion del resultado de cada situacion (limpio pasa, tropezo tropieza, cayo cae y quien sale, sale)', () => {
  assert.equal(accionDeResultado({ resultado: 'limpio', sale: false }), 'pasa');
  assert.equal(accionDeResultado({ resultado: 'tropezo', sale: false }), 'tropieza');
  assert.equal(accionDeResultado({ resultado: 'cayo', sale: false }), 'cae');
  assert.equal(accionDeResultado({ resultado: 'limpio', sale: true }), 'sale');
  assert.equal(accionDeResultado({ resultado: 'tropezo', sale: true }), 'sale');
  assert.equal(accionDeResultado(null), 'pasa');
  assert.equal(accionDeResultado({ resultado: 'raro' }), 'pasa');
});

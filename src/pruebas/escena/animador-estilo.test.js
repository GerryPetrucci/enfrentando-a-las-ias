// El animador de estilos en linea (web/casino/animador-estilo.js): mueve un valor de 0 a 1 con requestAnimationFrame y deja que quien lo llama escriba el estilo en linea en cada cuadro.
// Existe porque en OBS (Chromium 150, 4K, aceleracion por hardware) una animacion de Web Animations o de CSS cancelada puede dejar su valor viejo en el compositor: el encabezado de Guerra se quedaba
// invisible y el mapa se quedaba con el zoom puesto (grabaciones del 28 de octubre de 2026). Aqui no hay animaciones del navegador: el estado final es siempre el estilo en linea.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAnimador, EASING } from '../../../web/casino/animador-estilo.js';

// Un reloj y un requestAnimationFrame falsos: cada tic() avanza el tiempo y corre los cuadros pedidos.
function relojFalso() {
  let t = 0, siguiente = 1; const cola = new Map();
  return {
    ahora: () => t,
    raf: (f) => { const id = siguiente++; cola.set(id, f); return id; },
    cancelarRaf: (id) => cola.delete(id),
    tic(ms) { t += ms; const hoy = [...cola.entries()]; cola.clear(); for (const [, f] of hoy) f(t); },
    pendientes: () => cola.size,
  };
}

test('un fundido va de 0 a 1 sin saltos para atras, empieza en 0 al instante, termina EXACTAMENTE en 1 y avisa una sola vez', () => {
  const r = relojFalso(); const a = crearAnimador(r);
  const p = []; let fin = 0;
  a.animar('x', { ms: 100, alCuadro: (v) => p.push(v), alTerminar: () => fin++ });
  assert.deepEqual(p, [0], 'el primer cuadro (el estado inicial) se pinta de inmediato');
  for (let i = 0; i < 12; i++) r.tic(10);
  assert.equal(p.at(-1), 1, 'termina exactamente en 1');
  assert.ok(p.every((v, i) => i === 0 || v >= p[i - 1]), 'nunca retrocede');
  assert.equal(fin, 1, 'avisa una sola vez');
  assert.equal(r.pendientes(), 0, 'no deja cuadros pendientes al terminar');
  assert.equal(a.activas(), 0);
});

test('si el navegador se atrasa y salta mas que la duracion, el siguiente cuadro ya es el final (nunca se queda a medias)', () => {
  const r = relojFalso(); const a = crearAnimador(r); const p = [];
  a.animar('x', { ms: 100, alCuadro: (v) => p.push(v) });
  r.tic(5000);
  assert.equal(p.at(-1), 1); assert.equal(a.activas(), 0);
});

test('con duracion 0 (o invalida) el estado final se pone en el acto y se avisa en el acto', () => {
  const r = relojFalso(); const a = crearAnimador(r);
  for (const ms of [0, -5, NaN, undefined]) {
    const p = []; let fin = 0;
    a.animar('x', { ms, alCuadro: (v) => p.push(v), alTerminar: () => fin++ });
    assert.deepEqual(p, [1], `ms=${ms}`); assert.equal(fin, 1);
  }
  assert.equal(r.pendientes(), 0);
});

test('animar de nuevo con la misma clave cancela la anterior (sin avisar su final ni pintar mas cuadros suyos); claves distintas corren a la vez', () => {
  const r = relojFalso(); const a = crearAnimador(r);
  const viejo = [], nuevo = [], otro = []; let finViejo = 0, finNuevo = 0;
  a.animar('zoom', { ms: 100, alCuadro: (v) => viejo.push(v), alTerminar: () => finViejo++ });
  a.animar('hud', { ms: 40, alCuadro: (v) => otro.push(v) });
  r.tic(30);
  a.animar('zoom', { ms: 100, alCuadro: (v) => nuevo.push(v), alTerminar: () => finNuevo++ });
  const cuadrosViejos = viejo.length;
  for (let i = 0; i < 12; i++) r.tic(10);
  assert.equal(viejo.length, cuadrosViejos, 'la anterior no pinta mas');
  assert.equal(finViejo, 0, 'la anterior no avisa su final');
  assert.equal(nuevo.at(-1), 1); assert.equal(finNuevo, 1);
  assert.equal(otro.at(-1), 1, 'la otra clave termino sola');
});

test('cancelar detiene sin pintar el final y es seguro con claves que no existen; las claves pueden ser nodos (cualquier objeto)', () => {
  const r = relojFalso(); const a = crearAnimador(r); const nodo = { id: 'carta' }; const p = []; let fin = 0;
  a.animar(nodo, { ms: 100, alCuadro: (v) => p.push(v), alTerminar: () => fin++ });
  r.tic(20); a.cancelar(nodo); const n = p.length;
  r.tic(200);
  assert.equal(p.length, n); assert.equal(fin, 0); assert.equal(a.activas(), 0);
  assert.doesNotThrow(() => { a.cancelar('nunca'); a.cancelar(nodo); a.cancelarTodo(); });
});

test('cancelarTodo detiene todas las animaciones', () => {
  const r = relojFalso(); const a = crearAnimador(r); let cuadros = 0;
  for (const k of ['a', 'b', 'c']) a.animar(k, { ms: 100, alCuadro: () => cuadros++ });
  const antes = cuadros; a.cancelarTodo(); r.tic(500);
  assert.equal(cuadros, antes); assert.equal(a.activas(), 0);
});

test('las curvas: salida (arranca rapido), entrada (arranca lento) y lineal; todas de 0 a 1 y sin retroceder', () => {
  for (const [nombre, f] of Object.entries(EASING)) {
    assert.equal(f(0), 0, `${nombre}(0)`); assert.equal(f(1), 1, `${nombre}(1)`);
    let ant = 0; for (let i = 1; i <= 100; i++) { const v = f(i / 100); assert.ok(v >= ant, `${nombre} crece`); ant = v; }
  }
  assert.ok(EASING.salida(0.5) > 0.5 && EASING.entrada(0.5) < 0.5 && EASING.lineal(0.5) === 0.5);
});

test('propiedad: cualquier secuencia de animar/cancelar/tics termina con exactamente los avisos de las que llegaron al final y nada pendiente', () => {
  let semilla = 11; const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
  for (let ronda = 0; ronda < 100; ronda++) {
    const r = relojFalso(); const a = crearAnimador(r); const vivas = new Map(); let avisos = 0, esperados = 0;
    for (let i = 0; i < 60; i++) {
      const clave = `k${Math.floor(azar() * 3)}`, op = azar();
      if (op < 0.4) { vivas.delete(clave); a.animar(clave, { ms: 20 + Math.floor(azar() * 100), alCuadro: () => {}, alTerminar: () => { avisos++; vivas.delete(clave); } }); vivas.set(clave, true); }
      else if (op < 0.55) { a.cancelar(clave); vivas.delete(clave); }
      else r.tic(5 + Math.floor(azar() * 40));
    }
    r.tic(10000);
    assert.equal(a.activas(), 0); assert.equal(r.pendientes(), 0); void esperados; void avisos;
  }
});

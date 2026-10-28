import test from 'node:test';
import assert from 'node:assert/strict';
import juego from '../../juegos/lobo.js';
import { crearEstado } from '../../juegos/lobo/estado.js';
import { MODOS_CUPIDO, VERSION } from '../../juegos/lobo/constantes.js';
import { REGLAS } from '../../juegos/lobo/reglas-texto.js';
import { crearRng } from '../../rng.js';
import { vistaDe, vistaCamara } from '../../juegos/lobo/vista.js';

// Seat 5 es Cupido; 6 y 7 son aldeanos; 0 y 1 son lobos.
const ROLES = ['lobo', 'lobo', 'vidente', 'bruja', 'cazador', 'cupido', 'aldeano', 'aldeano'];
function crear(modo) {
  const E = juego.crear(crearRng(41));
  E.roles = [...ROLES];
  E.modoCupido = modo;
  return E;
}
const paso = (E, fn) => juego.aplicar(E, juego.activos(E).map((a, i) => a ? fn(i) : null));
const cupido = (E, enamorados = [6, 7]) => paso(E, () => ({ enamorados }));
function noche(E, victima, veneno = null) {
  paso(E, () => ({ accion: 'matar', objetivo: victima }));
  paso(E, () => ({ salvar: false, matar: veneno }));
  paso(E, () => ({ accion: 'inspeccionar', objetivo: 0 }));
}
const muertes = (E) => E.eventos.filter((e) => e.tipo === 'muerte');

test('versión de reglas 1.3.0 y cuatro modos de Cupido', () => {
  assert.equal(VERSION, 'lobo-1.3.0');
  assert.deepEqual([...MODOS_CUPIDO], ['pareja', 'cupido', 'ambos', 'nada']);
});

test('el modo sale del seed y no cambia los roles ni los reemplazos de ese seed', () => {
  const base = juego.crear(crearRng(41));
  assert.deepEqual(base.roles, ['lobo', 'cazador', 'lobo', 'cupido', 'vidente', 'aldeano', 'bruja', 'aldeano'], 'los roles de este seed son los de lobo-1.2.0');
  assert.deepEqual(base.reemplazos[0][0], [0.4432110218331218, 0.057588913943618536]);
  assert.deepEqual(base.reemplazos[79].at(-1), [0.25404051318764687, 0.05294106714427471]);
  assert.ok(MODOS_CUPIDO.includes(base.modoCupido));
  assert.equal(juego.crear(crearRng(41)).modoCupido, base.modoCupido, 'mismo seed, mismo modo');
  const vistos = new Set(Array.from({ length: 60 }, (_, s) => juego.crear(crearRng(s + 1)).modoCupido));
  assert.deepEqual([...vistos].sort(), [...MODOS_CUPIDO].sort(), 'con seeds distintos salen los cuatro');
});

test('forzar el modo con la opción consume igual el RNG: mismos roles y reemplazos', () => {
  const libre = crearEstado(crearRng(41)), forzado = crearEstado(crearRng(41), { modoCupido: 'nada' });
  assert.equal(forzado.modoCupido, 'nada');
  assert.deepEqual(forzado.roles, libre.roles);
  assert.deepEqual(forzado.reemplazos, libre.reemplazos);
  assert.throws(() => crearEstado(crearRng(41), { modoCupido: 'todos' }), /modo de Cupido/i);
});

for (const modo of MODOS_CUPIDO) {
  test(`[${modo}] ninguna IA ve quién es Cupido ni la pareja de otro, en ninguna fase`, () => {
    const E = crear(modo);
    const sinCupido = (v, i) => {
      if (i !== 5) assert.ok(v.jugadores.every((j) => j.rol === undefined), `el asiento ${i} ve un rol ajeno`);
      assert.ok(!v.eventos.some((e) => e.tipo === 'enamorados'));
    };
    for (let i = 0; i < 8; i++) sinCupido(vistaDe(E, i), i);
    cupido(E);
    for (let i = 0; i < 8; i++) {
      const v = vistaDe(E, i);
      sinCupido(v, i);
      assert.equal(v.pareja, i === 6 ? 7 : i === 7 ? 6 : null, 'solo los enamorados saben su pareja');
      assert.deepEqual(v.enamoradosElegidos, i === 5 ? [6, 7] : undefined, 'solo Cupido sabe a quién eligió');
    }
  });
}

test('[ambos] el evento público y la cámara muestran a Cupido y a la pareja (como lobo-1.2.0)', () => {
  const E = crear('ambos'), r = cupido(E);
  assert.deepEqual(r.publico.eventos[0], { ronda: 1, tipo: 'enamorados', asientos: [6, 7], cupido: 5, revela: 'ambos' });
  const c = vistaCamara(E);
  assert.equal(c.jugadores[5].rol, 'cupido');
  assert.deepEqual(c.enamorados, [6, 7]);
});

test('[pareja] el público ve a los enamorados pero no a Cupido', () => {
  const E = crear('pareja'), r = cupido(E);
  assert.deepEqual(r.publico.eventos[0], { ronda: 1, tipo: 'enamorados', asientos: [6, 7], revela: 'pareja' });
  const c = vistaCamara(E);
  assert.ok(c.jugadores.every((j) => j.rol === undefined));
  assert.deepEqual(c.enamorados, [6, 7]);
});

test('[cupido] el público ve a Cupido pero no a quién eligió', () => {
  const E = crear('cupido'), r = cupido(E);
  assert.deepEqual(r.publico.eventos[0], { ronda: 1, tipo: 'enamorados', cupido: 5, revela: 'cupido' });
  const c = vistaCamara(E);
  assert.equal(c.jugadores[5].rol, 'cupido');
  assert.deepEqual(c.enamorados, []);
  assert.ok(!JSON.stringify(r.publico).includes('[6,7]'), 'la elección no está en nada público');
});

test('[nada] el público no ve ni a Cupido ni a los enamorados', () => {
  const E = crear('nada'), r = cupido(E);
  assert.deepEqual(r.publico.eventos[0], { ronda: 1, tipo: 'enamorados', revela: 'nada' });
  const c = vistaCamara(E);
  assert.ok(c.jugadores.every((j) => j.rol === undefined));
  assert.deepEqual(c.enamorados, []);
  assert.ok(!JSON.stringify(r.publico).includes('[6,7]'));
  assert.deepEqual(r.privado.acciones[0].enamorados, [6, 7], 'la elección completa queda en el registro privado');
});

test('[nada] al morir el primer enamorado se descubre la pareja, una sola vez', () => {
  const E = crear('nada'); cupido(E);
  noche(E, 6);
  const [primera, segunda] = muertes(E);
  assert.deepEqual([primera.asiento, primera.pareja], [6, 7], 'la primera muerte trae a la pareja');
  assert.deepEqual([segunda.asiento, segunda.causa, segunda.pareja], [7, 'amor', undefined]);
  assert.deepEqual(vistaCamara(E).enamorados, [6, 7]);
  assert.equal(vistaCamara(E).jugadores[5].rol, undefined, 'Cupido sigue oculto: vive');
});

test('[cupido] la pareja se descubre al morir uno; [ambos] y [pareja] no repiten el dato', () => {
  for (const [modo, trae] of [['cupido', true], ['pareja', false], ['ambos', false]]) {
    const E = crear(modo); cupido(E); noche(E, 6);
    assert.equal(muertes(E)[0].pareja, trae ? 7 : undefined, modo);
  }
});

test('dos enamorados que caen en la misma mañana (lobos y veneno) también descubren la pareja', () => {
  const E = crear('nada'); cupido(E);
  noche(E, 6, 7);
  assert.deepEqual(muertes(E).map((m) => [m.asiento, m.pareja]), [[6, 7], [7, undefined]]);
});

test('si muere Cupido su rol queda visible aunque el modo lo ocultara', () => {
  const E = crear('nada'); cupido(E);
  noche(E, 5);
  assert.equal(vistaCamara(E).jugadores[5].rol, 'cupido');
  assert.equal(muertes(E)[0].rol, 'cupido');
  assert.equal(muertes(E)[0].pareja, undefined, 'Cupido no era enamorado');
  assert.deepEqual(vistaCamara(E).enamorados, [], 'la pareja sigue oculta');
});

test('el evento final trae a los enamorados y la cámara los muestra', () => {
  const E = crear('nada'); cupido(E);
  juego.cerrarPorLimiteLlamadas(E, { llamadas: 1 });
  const final = E.eventos.find((e) => e.tipo === 'final');
  assert.deepEqual(final.enamorados, [6, 7]);
  assert.deepEqual(vistaCamara(E).enamorados, [6, 7]);
});

test('el texto de reglas ya no dice que Cupido queda revelado', () => {
  assert.doesNotMatch(REGLAS, /queda revelado públicamente/);
  assert.match(REGLAS, /nadie más sabe quién es Cupido/);
});

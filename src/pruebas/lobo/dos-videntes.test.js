import test from 'node:test';
import assert from 'node:assert/strict';
import lobo from '../../juegos/lobo.js';
import { crearRng } from '../../rng.js';
import { correrPartida } from '../../arena.js';
import { vistaDe, vistaCamara } from '../../juegos/lobo/vista.js';
import { REGLAS } from '../../juegos/lobo/reglas-texto.js';
import { simular } from '../../../herramientas/medir-lobo.mjs';

const asientos = (E, rol) => E.roles.flatMap((r, i) => r === rol ? [i] : []);
const responder = (E, fn) => lobo.aplicar(E, lobo.activos(E).map((activo, i) => activo ? fn(i) : null));

function preparar({ muerenVidentes = 0, seed = 41 } = {}) {
  const E = lobo.crear(crearRng(seed), { jugadores: 12 });
  const videntes = asientos(E, 'vidente'), aldeanos = asientos(E, 'aldeano'), lobos = asientos(E, 'lobo');
  responder(E, () => ({ enamorados: aldeanos.slice(-2) }));
  responder(E, (i) => ({ accion: 'matar', objetivo: muerenVidentes ? videntes[0] : aldeanos[lobos.indexOf(i) % 2] }));
  responder(E, () => ({ salvar: false, matar: muerenVidentes === 2 ? videntes[1] : null }));
  assert.equal(E.fase, 'vidente');
  return { E, videntes, aldeanos, lobos };
}

test('producción 1.3.0 conserva dos Videntes y cuatro aldeanos en 12, reproducibles para cada seed', () => {
  for (let seed = 0; seed < 50; seed++) {
    const a = lobo.crear(crearRng(seed), { jugadores: 12 });
    assert.deepEqual(a, lobo.crear(crearRng(seed), { jugadores: 12 }));
    assert.equal(a.roles.length, 12); assert.equal(asientos(a, 'lobo').length, 3);
    assert.equal(asientos(a, 'vidente').length, 2); assert.equal(asientos(a, 'aldeano').length, 4);
    for (const r of ['bruja', 'cazador', 'cupido']) assert.equal(asientos(a, r).length, 1);
    assert.equal(a.maxRondas, 6); assert.equal(a.versionReglas, 'lobo-1.3.0');
  }
  assert.equal(lobo.versionReglas, 'lobo-1.3.0');
  const ocho = lobo.crear(crearRng(123), { jugadores: 8 });
  assert.deepEqual(ocho.roles, ['lobo', 'bruja', 'cupido', 'cazador', 'aldeano', 'vidente', 'lobo', 'aldeano']);
  assert.equal(ocho.maxRondas, 6);
});

test('ambas inspecciones se resuelven en producción y quedan aisladas en sus vistas y en cámara', () => {
  const { E, videntes: [a, b], aldeanos, lobos } = preparar();
  assert.deepEqual(lobo.activos(E).flatMap((v, i) => v ? [i] : []), [a, b]);
  const registro = responder(E, (i) => ({ accion: 'inspeccionar', objetivo: i === a ? lobos[0] : aldeanos[0] }));
  const va = vistaDe(E, a), vb = vistaDe(E, b), camara = vistaCamara(E);
  assert.deepEqual(va.inspecciones, [{ ronda: 1, objetivo: lobos[0], esLobo: true }]);
  assert.deepEqual(vb.inspecciones, [{ ronda: 1, objetivo: aldeanos[0], esLobo: false }]);
  assert.equal(va.jugadores[b].rol, undefined); assert.equal(vb.jugadores[a].rol, undefined);
  assert.equal(E.puntos[a], 1); assert.equal(E.puntos[b], 0);
  assert.equal(E.stats[a].acciones, 1); assert.equal(E.stats[b].acciones, 1);
  assert.deepEqual(registro.privado.inspecciones, [
    { asiento: a, ronda: 1, objetivo: lobos[0], esLobo: true },
    { asiento: b, ronda: 1, objetivo: aldeanos[0], esLobo: false },
  ]);
  assert.equal(camara.inspecciones, undefined); assert.equal(registro.publico.inspecciones, undefined);
  const cupidoVisible = E.camaraVe.cupido ? asientos(E, 'cupido')[0] : null; // segun el modo del seed, la camara ve o no a Cupido
  assert.ok(camara.jugadores.every((j) => j.rol === (j.asiento === cupidoVisible ? 'cupido' : undefined)));
  assert.deepEqual(vistaDe(E, aldeanos[0]).inspecciones, []);
  va.inspecciones[0].objetivo = -1;
  assert.equal(E.inspecciones[a][0].objetivo, lobos[0]);
  registro.privado.inspecciones[1].objetivo = -1;
  assert.equal(E.inspecciones[b][0].objetivo, aldeanos[0]);
});

test('pueden inspeccionar al mismo lobo: cada una recibe un hallazgo y un punto propios, sin duplicar', () => {
  const { E, videntes, lobos } = preparar();
  responder(E, () => ({ accion: 'inspeccionar', objetivo: lobos[0] }));
  for (const i of videntes) {
    assert.equal(E.inspecciones[i].length, 1); assert.equal(E.puntos[i], 1); assert.equal(E.stats[i].aciertos, 1);
  }
  assert.notEqual(E.inspecciones[videntes[0]], E.inspecciones[videntes[1]]);
});

test('las dos inspeccionan antes del amanecer aunque ambas mueran esa noche', () => {
  const { E, videntes, lobos } = preparar({ muerenVidentes: 2 });
  const r = responder(E, () => ({ accion: 'inspeccionar', objetivo: lobos[0] }));
  assert.equal(E.fase, 'dia');
  for (const i of videntes) { assert.equal(E.vivos[i], false); assert.equal(E.inspecciones[i].length, 1); assert.equal(E.puntos[i], 1); }
  assert.equal(r.publico.eventos.filter((e) => e.tipo === 'amanecer').length, 1);
  assert.equal(r.publico.eventos.filter((e) => e.tipo === 'muerte' && e.rol === 'vidente').length, 2);
  assert.equal(r.privado.inspecciones.length, 2);
});

test('si una muere, solo la superviviente recibe nuevas consultas e inspecciones en la noche siguiente', () => {
  const { E, videntes: [a, b], lobos, aldeanos } = preparar({ muerenVidentes: 1 });
  responder(E, () => ({ accion: 'inspeccionar', objetivo: lobos[0] }));
  const vivos = E.vivos.flatMap((v, i) => v ? [i] : []);
  responder(E, (i) => ({ mensaje: '', voto: vivos[(vivos.indexOf(i) + 1) % vivos.length] }));
  responder(E, (i) => ({ accion: 'matar', objetivo: aldeanos[lobos.indexOf(i) % 2] }));
  responder(E, () => ({ salvar: false, matar: null }));
  assert.deepEqual(lobo.activos(E).flatMap((v, i) => v ? [i] : []), [b]);
  const r = responder(E, () => ({ accion: 'inspeccionar', objetivo: lobos[1] }));
  assert.equal(E.inspecciones[a].length, 1); assert.equal(E.inspecciones[b].length, 2);
  assert.deepEqual(r.privado.inspecciones.map((x) => x.asiento), [b]); assert.equal(r.invalidas[a], null);
});

test('un fallo de una Vidente reemplaza solo su acción; la inspección válida de la otra se conserva', () => {
  const ejecutar = () => {
    const { E, videntes: [a, b], lobos } = preparar();
    const r = responder(E, (i) => i === a ? { accion: 'inspeccionar', objetivo: lobos[0] } : null);
    assert.equal(r.invalidas[a], false); assert.equal(r.invalidas[b], true);
    assert.equal(E.inspecciones[a][0].objetivo, lobos[0]);
    assert.equal(E.inspecciones[a].length, 1); assert.equal(E.inspecciones[b].length, 1);
    assert.notEqual(E.inspecciones[b][0].objetivo, b);
    return E;
  };
  assert.deepEqual(ejecutar(), ejecutar());
});

test('arena consulta a las dos Videntes sin compartir resultados; el corte no permite una fase parcial', async () => {
  for (const limite of [1, 2]) {
    const { E, lobos, videntes } = preparar();
    const entradas = [];
    const agentes = Array.from({ length: 12 }, (_, i) => ({ id: `control-${i}`, async jugar({ vista }) {
      const v = JSON.parse(vista); entradas.push(v);
      assert.equal(v.rol, 'vidente'); assert.deepEqual(v.inspecciones, []);
      return { respuesta: { accion: 'inspeccionar', objetivo: lobos[0] } };
    } }));
    const r = await correrPartida({ juego: { ...lobo, crear: () => E, limiteLlamadasDuro: limite }, agentes, seed: 41 });
    assert.equal(r.llamadas, limite === 1 ? 0 : 2);
    assert.equal(entradas.length, limite === 1 ? 0 : 2);
    for (const i of videntes) assert.equal(E.inspecciones[i].length, limite === 1 ? 0 : 1);
    assert.equal(r.motivoFin, 'llamadas'); assert.equal(r.empate, true);
  }
});

test('reglas de producción informan dos Videntes independientes en doce y conservan una en ocho', () => {
  assert.match(REGLAS, /8 jugadores: 2 lobos, 1 vidente, 1 bruja, 1 cazador, 1 cupido, 2 aldeanos; máximo 6 rondas/);
  assert.match(REGLAS, /12 jugadores: 3 lobos, 2 videntes, 1 bruja, 1 cazador, 1 cupido, 4 aldeanos; máximo 6 rondas/);
  assert.match(REGLAS, /sin reconocerse ni compartir hallazgos automáticamente/);
  assert.equal(lobo.reglas, REGLAS);
});

test('simulador usa las dos Videntes de producción sin adaptador ni una tercera promoción', () => {
  const config = { jugadores: 12, seed: 20261024, perfil: { lobo: 'silencioso', vidente: 'revela', bruja: 'guarda', aldeano: 'mayoria' } };
  const r = simular(config);
  assert.equal(r.videntes, 2); assert.equal(r.segundaVidente, null); assert.equal(r.porVidente.length, 2);
  assert.equal(r.inspecciones, r.porVidente.reduce((n, v) => n + v.inspecciones, 0));
  assert.equal(r.invalidas, 0); assert.ok(r.llamadas <= 100);
});

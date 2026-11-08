import test from 'node:test';
import assert from 'node:assert/strict';
import { crearAdaptadorSimulado } from '../../worldbox/adaptador-simulado.js';
import { crearRng } from '../../rng.js';
import { hash } from '../../worldbox/util.js';

const esc = (extra = {}) => ({ semilla: 5, tamano_mapa: 64, facciones: [{ id: 'a' }, { id: 'b' }], ...extra });
const estado = async (a, ids) => Promise.all(ids.map(id => a.observar(id)));

test('el reinicio valida todo antes de tocar el estado', async () => {
  const a = crearAdaptadorSimulado(); await a.reiniciarEscenario(esc());
  const antes = await a.observar('a');
  for (const mal of [{ semilla: -1 }, { semilla: 1.5 }, { semilla: 2 ** 31 }, { semilla: 2 ** 32 }, { semilla: -1 }, { semilla: '5' }, { tamano_mapa: 11 }, { tamano_mapa: 10001 }, { facciones: [{ id: 'a' }] }, { facciones: ['a', 'b'] },
    { facciones: Array(5).fill(0).map((_, i) => ({ id: `f${i}` })) }, { facciones: [{ id: 'a' }, { id: 'a' }] }, { facciones: [{ id: 'a b' }, { id: 'c' }] }, { facciones: [{ id: 'a' }, { id: 'x'.repeat(41) }] },
    { facciones: [null, { id: 'a' }] }, { opciones: { max_acciones: 0 } }, { opciones: { max_acciones: 11 } }, { opciones: { max_acciones: 1.5 } }]) {
    await assert.rejects(() => a.reiniciarEscenario(esc(mal)), /solicitud_invalida/, JSON.stringify(mal));
  }
  assert.deepEqual(await a.observar('a'), antes, 'un reinicio fallido no deja nada a medias');
  const r = await a.reiniciarEscenario(esc({ semilla: 0 }));
  assert.equal(r.semilla_usada, 0); assert.equal(r.escenario_id, 'simulado-0'); assert.match(r.hash_mundo, /^[0-9a-f]{64}$/);
  await a.reiniciarEscenario(esc({ semilla: 2 ** 31 - 1, tamano_mapa: 12, facciones: ['a', 'b', 'c', 'd'].map(id => ({ id })) }));
  assert.equal((await a.observar('a')).mundo.libres, 0, 'cuatro facciones de 3 celdas llenan un mapa de 12');
});
test('antes de reiniciar o despues de cerrar nada responde; facciones desconocidas se rechazan', async () => {
  const a = crearAdaptadorSimulado();
  for (const f of [() => a.observar('a'), () => a.ejecutar({ faccion: 'a', accion: 'esperar', parametros: {} }), () => a.avanzar({ segundos_juego: 1 }), () => a.estadoTerminal()]) await assert.rejects(f, /no_listo/);
  await a.reiniciarEscenario(esc());
  await assert.rejects(() => a.observar('zzz'), /solicitud_invalida/);
  await assert.rejects(() => a.ejecutar({ faccion: 'zzz', accion: 'esperar', parametros: {} }), /solicitud_invalida/);
  for (const s of [0, 2, 0.5, '1', -1]) await assert.rejects(() => a.avanzar({ segundos_juego: s }), /solicitud_invalida/, String(s));
  assert.deepEqual(await a.cerrar(), { cerrado: true }); await assert.rejects(() => a.estadoTerminal(), /no_listo/);
});
test('mismo mapa para todos: el estado inicial es identico para cada faccion', async () => {
  const a = crearAdaptadorSimulado(), r = await a.reiniciarEscenario(esc({ facciones: ['w', 'x', 'y', 'z'].map(id => ({ id })) }));
  const sinId = r.facciones.map(({ id, ...resto }) => resto);
  for (const f of sinId) assert.deepEqual(f, { vivo: true, poblacion: 20, ciudades: 1, territorio: 3, recursos: 20, objetivos: 0, cooldowns: {} });
  const vistas = await estado(a, ['w', 'x', 'y', 'z']);
  assert.equal(new Set(vistas.map(v => hash({ ...v, faccion: null, rivales: null }))).size, 1, 'las vistas solo difieren en quien es "yo"');
  assert.equal(vistas[0].mundo.libres, 64 - 12);
});
test('determinismo: misma semilla = misma trayectoria; otra semilla cambia el evento comun', async () => {
  const correr = async semilla => {
    const a = crearAdaptadorSimulado(); const h0 = (await a.reiniciarEscenario(esc({ semilla }))).hash_mundo, tray = [];
    for (let t = 0; t < 15; t++) { await a.avanzar({ segundos_juego: 1 }); tray.push((await a.observar('a')).faccion.recursos); }
    return { h0, tray, final: hash((await a.estadoTerminal()).resumen_por_faccion) };
  };
  const a1 = await correr(1), a2 = await correr(1);
  assert.deepEqual(a1, a2);
  const trayectorias = new Set(); for (const s of [2, 3, 4, 5, 6]) trayectorias.add((await correr(s)).tray.join());
  assert.ok(trayectorias.size > 1, 'la semilla gobierna la secuencia de eventos');
  // El evento es comun: la diferencia entre dos facciones identicas nunca cambia.
  const a = crearAdaptadorSimulado(); await a.reiniciarEscenario(esc({ semilla: 9 }));
  for (let t = 0; t < 20; t++) { await a.avanzar({ segundos_juego: 1 }); const v = await a.observar('a'); assert.equal(v.faccion.recursos, v.rivales[0].recursos); assert.equal(v.faccion.poblacion, v.rivales[0].poblacion); }
});
test('el evento comun sale de RNG con semilla: recursos = 2*ciudades + territorio + evento en {-2,0,2}', async () => {
  const rng = crearRng(33), a = crearAdaptadorSimulado(); await a.reiniciarEscenario(esc({ semilla: 33 }));
  let recursos = 20;
  for (let t = 0; t < 30; t++) {
    const evento = (Math.floor(rng() * 3) - 1) * 2;
    await a.avanzar({ segundos_juego: 1 }); recursos = Math.max(0, recursos + 2 + 3 + evento);
    assert.equal((await a.observar('a')).faccion.recursos, recursos);
  }
});
test('invariantes de mundo con acciones legales al azar sobre muchas semillas', async () => {
  const OPCIONES = [['recolectar', () => ({})], ['expandir', r => ({ cantidad: 1 + Math.floor(r() * 3) })], ['fundar', () => ({})], ['reclutar', () => ({})], ['atacar', r => ({ objetivo: ['a', 'b', 'c'][Math.floor(r() * 3)] })], ['esperar', () => ({})]];
  for (let semilla = 1; semilla <= 25; semilla++) {
    const a = crearAdaptadorSimulado(), r = crearRng(semilla), ids = ['a', 'b', 'c'];
    await a.reiniciarEscenario(esc({ semilla, tamano_mapa: 20, facciones: ids.map(id => ({ id })) }));
    for (let t = 0; t < 40; t++) {
      for (const id of ids) for (let k = 0; k < 3; k++) { const [accion, p] = OPCIONES[Math.floor(r() * OPCIONES.length)]; await a.ejecutar({ faccion: id, accion, parametros: p(r) }); }
      await a.avanzar({ segundos_juego: 1 });
      const { resumen_por_faccion: fs } = await a.estadoTerminal(), mundo = (await a.observar('a')).mundo;
      for (const f of fs) {
        for (const k of ['poblacion', 'ciudades', 'territorio', 'recursos', 'objetivos']) assert.ok(Number.isInteger(f[k]) && f[k] >= 0, `${semilla}/${t} ${f.id}.${k}=${f[k]}`);
        assert.equal(f.vivo, f.poblacion > 0, 'vivo exactamente cuando hay poblacion');
        if (!f.vivo) { assert.equal(f.ciudades, 0); assert.equal(f.territorio, 0); }
        assert.ok(f.ciudades <= f.territorio || !f.vivo, 'cada ciudad ocupa al menos una celda');
      }
      assert.equal(mundo.libres, 20 - fs.reduce((s, f) => s + f.territorio, 0)); assert.ok(mundo.libres >= 0);
    }
  }
});
test('eliminar a un rival libera su territorio, lo deja sin producir y le impide actuar', async () => {
  const a = crearAdaptadorSimulado(); await a.reiniciarEscenario(esc({ semilla: 2 }));
  let eliminado = false;
  for (let t = 1; t <= 80 && !eliminado; t++) {
    await a.ejecutar({ faccion: 'a', accion: 'atacar', parametros: { objetivo: 'b' } });
    await a.ejecutar({ faccion: 'a', accion: 'recolectar', parametros: {} });
    const r = await a.avanzar({ segundos_juego: 1 }); eliminado = r.terminal;
  }
  assert.ok(eliminado, 'atacar sin parar termina eliminando');
  const v = await a.observar('a'), b = v.rivales[0];
  assert.deepEqual([b.vivo, b.poblacion, b.ciudades, b.territorio], [false, 0, 0, 0]);
  assert.equal(v.mundo.libres, 64 - v.faccion.territorio, 'las celdas del eliminado quedaron libres');
  const recursos = b.recursos, objetivos = b.objetivos;
  assert.equal((await a.ejecutar({ faccion: 'b', accion: 'recolectar', parametros: {} })).codigo, 'eliminado');
  await a.avanzar({ segundos_juego: 1 }); await a.avanzar({ segundos_juego: 1 }); // vence el cooldown del ultimo ataque
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'atacar', parametros: { objetivo: 'b' } })).codigo, 'objetivo_invalido', 'no se ataca a un eliminado');
  const b2 = (await a.observar('a')).rivales[0]; assert.equal(b2.poblacion, 0); assert.equal(b2.recursos, recursos); assert.equal(b2.objetivos, objetivos);
  const t = await a.estadoTerminal(); assert.equal(t.terminal, true); assert.equal(t.razon, 'supervivencia');
});
test('cada accion cumple su regla exacta de costo, efecto, puntos y cooldown', async () => {
  const a = crearAdaptadorSimulado(); await a.reiniciarEscenario(esc());
  const yo = async () => (await a.observar('a')).faccion;
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'recolectar', parametros: {} })).resultado, 'ejecutada'); assert.equal((await yo()).recursos, 28);
  await a.ejecutar({ faccion: 'a', accion: 'reclutar', parametros: {} });
  assert.deepEqual([(await yo()).poblacion, (await yo()).recursos], [23, 23]);
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'reclutar', parametros: {} })).codigo, 'cooldown', 'reclutar tiene cooldown 1');
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'expandir', parametros: { cantidad: 1 } })).codigo, 'ok', 'recolectar 1 + reclutar 1 + expandir 1 caben en 3 puntos');
  assert.deepEqual([(await yo()).territorio, (await yo()).recursos], [4, 17]);
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'recolectar', parametros: {} })).codigo, 'puntos_insuficientes');
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'fundar', parametros: {} })).codigo, 'puntos_insuficientes', 'fundar cuesta 2 puntos');
});
test('los puntos de accion son 3 por turno, se reinician al avanzar y 6 recursos por celda', async () => {
  const a = crearAdaptadorSimulado(); await a.reiniciarEscenario(esc());
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'expandir', parametros: { cantidad: 3 } })).codigo, 'ok'); // 1 punto, 18 recursos
  const f = (await a.observar('a')).faccion; assert.deepEqual([f.territorio, f.recursos], [6, 2]);
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'expandir', parametros: { cantidad: 1 } })).codigo, 'cooldown');
  await a.ejecutar({ faccion: 'a', accion: 'recolectar', parametros: {} }); await a.ejecutar({ faccion: 'a', accion: 'recolectar', parametros: {} });
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'recolectar', parametros: {} })).codigo, 'puntos_insuficientes');
  await a.avanzar({ segundos_juego: 1 });
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'recolectar', parametros: {} })).codigo, 'ok');
  // Con opciones.max_acciones el presupuesto de puntos cambia.
  await a.reiniciarEscenario(esc({ opciones: { max_acciones: 1 } }));
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'recolectar', parametros: {} })).codigo, 'ok');
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'recolectar', parametros: {} })).codigo, 'puntos_insuficientes');
});
test('un mapa sin celdas libres rechaza expandir y no cobra', async () => {
  const a = crearAdaptadorSimulado(); await a.reiniciarEscenario(esc({ tamano_mapa: 12, facciones: ['a', 'b', 'c', 'd'].map(id => ({ id })) }));
  const antes = await a.observar('a');
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'expandir', parametros: { cantidad: 1 } })).codigo, 'sin_territorio');
  assert.deepEqual(await a.observar('a'), antes);
  assert.equal((await a.ejecutar({ faccion: 'a', accion: 'fundar', parametros: {} })).codigo, 'ok', 'fundar usa una celda propia, no una libre');
  const f = (await a.observar('a')).faccion; assert.deepEqual([f.ciudades, f.objetivos, f.recursos], [2, 1, 5]);
});

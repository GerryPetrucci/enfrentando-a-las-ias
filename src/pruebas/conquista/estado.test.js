import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import { crearEstado, regionesDe, totalTropas, aliado, clasificar, contarEdificios, nombreRegion, instantanea, pila, sumarUni, ponerTropas, limpiarRegion, presentes, totalUnidades, uniDe, N_TIPOS } from '../../juegos/conquista/estado.js';
import { nuevoEstado, mapaDe, tropasDe } from './ayudas.js';

test('el inicio da a cada reino capital, vecinas, tropas, fortaleza, almacen y honor del diseno', () => {
  const E = nuevoEstado(4);
  assert.equal(E.turno, 0);
  assert.equal(E.ganador, null);
  E.reinos.forEach((r, s) => {
    assert.equal(E.dueno[r.capital], s);
    assert.equal(tropasDe(E, r.capital), 10);
    assert.equal(E.fort[r.capital], 1);
    assert.deepEqual(r.stock, { Comida: 6, Madera: 4, Roca: 2, Hierro: 0, Oro: 4, Caballos: 0 });
    assert.equal(r.honor, 5);
    assert.equal(r.vivo, true);
    const otras = regionesDe(E, s).filter((x) => x !== r.capital);
    assert.ok(otras.length >= 1);
    otras.forEach((x) => assert.equal(tropasDe(E, x), 3));
  });
  assert.equal(totalTropas(E, 0), 10 + 3 * (regionesDe(E, 0).length - 1));
});

test('de 2 a 5 reinos: fuera de rango se ajusta', () => {
  assert.equal(crearEstado(crearRng(1), { jugadores: 9, mapa: mapaDe(7, 5) }).k, 5);
  assert.equal(crearEstado(crearRng(1), { jugadores: 1, mapa: mapaDe(7, 2) }).k, 2);
});

test('mismo rng, mismo estado inicial (incluido el desempate); sin mapa dado lo genera del seed', () => {
  const a = crearEstado(crearRng(9), { jugadores: 2 }), b = crearEstado(crearRng(9), { jugadores: 2 });
  assert.deepEqual(a.desempate, b.desempate);
  assert.deepEqual(Array.from(a.dueno), Array.from(b.dueno));
  assert.equal(a.mapa.regs.length, 26);
});

test('aliado solo vale mientras dura el pacto', () => {
  const E = nuevoEstado(3);
  E.reinos[0].pactos[1] = 5;
  assert.equal(aliado(E, 0, 1, 5), true);
  assert.equal(aliado(E, 0, 1, 6), false);
  assert.equal(aliado(E, 0, 0, 1), false);
});

test('contarEdificios cuenta por reino y tipo, sin contar la region excluida', () => {
  const E = nuevoEstado(3);
  const mias = regionesDe(E, 0);
  E.edif[mias[0]] = 'granja'; E.edif[mias[1]] = 'granja'; E.edif[mias[2]] = 'mercado';
  assert.equal(contarEdificios(E, 0, 'granja'), 2);
  assert.equal(contarEdificios(E, 0, 'granja', mias[0]), 1);
  assert.equal(contarEdificios(E, 1, 'granja'), 0);
});

test('clasificar: vivos por regiones, tropas, almacen y sorteo; los caidos por quien cayo mas tarde; el ganador va primero', () => {
  const E = nuevoEstado(4);
  E.reinos[3].vivo = false; E.reinos[3].cayoEn = 5;
  E.reinos[2].vivo = false; E.reinos[2].cayoEn = 9;
  const o = clasificar(E).map((f) => f.s);
  assert.deepEqual(o.slice(2), [2, 3]); // el que cayo en el turno 9 queda mejor que el del turno 5
  E.ganador = o[1];
  assert.equal(clasificar(E)[0].s, o[1]);
});

test('nombreRegion e instantanea producen datos simples para guardar', () => {
  assert.equal(nombreRegion(0), 'R01');
  assert.equal(nombreRegion(51), 'R52');
  const E = nuevoEstado(2);
  const i = instantanea(E);
  assert.equal(i.dueno.length, E.mapa.regs.length);
  assert.ok(Array.isArray(i.dueno) && Array.isArray(i.stock) && i.maravilla === null);
  assert.doesNotThrow(() => JSON.stringify(i));
});

// ---- Modelo de unidades (etapa 2 de Guerra 2.0.0): una pila de 4 tipos por region y por reino presente ----

test('el modelo de unidades guarda una pila por region y reino: ponerTropas, sumarUni, pila, tropasDe, presentes y totalUnidades', () => {
  const E = nuevoEstado(4), r = E.reinos[0].capital;
  assert.equal(E.uni.length, E.mapa.regs.length * E.k * N_TIPOS);
  assert.deepEqual(pila(E, r, 0), [10, 0, 0, 0]);
  assert.equal(tropasDe(E, r), 10);
  sumarUni(E, r, 0, 2, 3); // 3 Jinetes del dueno
  assert.deepEqual(pila(E, r, 0), [10, 0, 3, 0]);
  assert.equal(uniDe(E, r, 0, 2), 3);
  assert.equal(tropasDe(E, r), 13);
  const antes = totalUnidades(E, 1);
  sumarUni(E, r, 1, 1, 2); // 2 Arqueros de un invitado (reino 1)
  assert.deepEqual(presentes(E, r), [0, 1]);
  assert.equal(tropasDe(E, r), 13, 'la guarnicion del dueno no cuenta las unidades de un invitado');
  assert.equal(totalUnidades(E, 1), antes + 2, 'las unidades de visita cuentan para el reino al que pertenecen');
  ponerTropas(E, r, 4); // solo cambia la pila del dueno: Lanceros y nada mas
  assert.deepEqual(pila(E, r, 0), [4, 0, 0, 0]);
  assert.deepEqual(pila(E, r, 1), [0, 2, 0, 0]);
  limpiarRegion(E, r);
  assert.deepEqual(presentes(E, r), []);
  assert.equal(tropasDe(E, r), 0);
});

test('una region sin dueno no tiene guarnicion y ponerTropas se niega a dejar unidades sin dueno (limpiar con 0 si vale)', () => {
  const E = nuevoEstado(4), libre = E.dueno.findIndex((d) => d < 0);
  assert.equal(tropasDe(E, libre), 0);
  assert.throws(() => ponerTropas(E, libre, 3), /no tiene dueno/);
  assert.doesNotThrow(() => ponerTropas(E, libre, 0));
});

test('la instantanea sigue guardando la guarnicion del dueno de cada region en `tropas` (la escena la lee asi)', () => {
  const E = nuevoEstado(4), c = E.reinos[2].capital;
  sumarUni(E, c, 2, 2, 5);
  const t = instantanea(E).tropas;
  assert.equal(t.length, E.mapa.regs.length);
  assert.equal(t[c], 15);
  assert.equal(t[E.dueno.findIndex((d) => d < 0)], 0);
});

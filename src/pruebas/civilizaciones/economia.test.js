import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarReparto, personasPorOficio, produccion, modificadores, espacioDe, estabilidadDe, ceilDiv } from '../../juegos/civilizaciones/economia.js';
import { costoEdificio, costoColonizar } from '../../juegos/civilizaciones/edificios.js';
import { crearCivilizacion } from '../../juegos/civilizaciones/estado.js';
import { REPARTO_INICIAL } from '../../juegos/civilizaciones/constantes.js';
import { crearRng } from '../../rng.js';

const R = REPARTO_INICIAL; // [40, 20, 10, 10, 20, 0]
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test('asignar completo: se redondea a decenas (empate hacia arriba) y la suma queda en 100', () => {
  assert.deepEqual(normalizarReparto(R, { granjeros: 30, lenadores: 10, mineros: 10, mercaderes: 20, sabios: 20, artistas: 10 }), [30, 10, 10, 20, 20, 10]);
  assert.deepEqual(normalizarReparto(R, {}), R, 'sin oficios nombrados no cambia nada');
  // 35 -> 40 (empate hacia arriba), 25 -> 30, 15 -> 20; 40+30+20+0+0+10 = 100
  assert.deepEqual(normalizarReparto(R, { granjeros: 35, lenadores: 25, mineros: 15, mercaderes: 0, sabios: 0, artistas: 10 }), [40, 30, 20, 0, 0, 10]);
});

test('asignar con menos de 6 oficios deja los demas como estaban y ajusta quitando 10 al oficio mas grande hasta cerrar', () => {
  // [60,20,10,10,20,0] suma 120: al mayor (60) se le quita 10 dos veces -> [40,20,10,10,20,0]
  assert.deepEqual(normalizarReparto(R, { granjeros: 60 }), [40, 20, 10, 10, 20, 0]);
  // [0,20,10,10,0,0] suma 40: al mayor (lenadores) se le suman 10 seis veces
  assert.deepEqual(normalizarReparto(R, { granjeros: 0, sabios: 0 }), [0, 80, 10, 10, 0, 0]);
});

test('C07/C08: el empate entre oficios se resuelve por el orden fijo (granjeros primero) y los valores se acotan a 0..100', () => {
  assert.deepEqual(normalizarReparto(R, { granjeros: 10, lenadores: 10, mineros: 10, mercaderes: 10, sabios: 10, artistas: 10 }), [50, 10, 10, 10, 10, 10], 'suma 60: los 40 que faltan van al primero de los empatados');
  assert.deepEqual(normalizarReparto(R, { granjeros: 999 }), [40, 20, 10, 10, 20, 0], '999 se acota a 100 y se recorta hasta cerrar');
  assert.deepEqual(normalizarReparto(R, { granjeros: -50, lenadores: -1, mineros: -1, mercaderes: -1, sabios: -1, artistas: -1 }), [100, 0, 0, 0, 0, 0], 'los negativos pasan a 0 y los 100 que faltan van al primero');
});

test('el peor caso (seis oficios en 100 = 600) cierra en 100 y 1,000 reparticiones al azar siempre quedan en decenas que suman 100', () => {
  const peor = normalizarReparto(R, { granjeros: 100, lenadores: 100, mineros: 100, mercaderes: 100, sabios: 100, artistas: 100 });
  assert.equal(sum(peor), 100);
  const rng = crearRng(5), claves = ['granjeros', 'lenadores', 'mineros', 'mercaderes', 'sabios', 'artistas'];
  for (let i = 0; i < 1000; i++) {
    const parcial = {};
    for (const k of claves) if (rng() < 0.7) parcial[k] = Math.floor(rng() * 400) - 100 + rng();
    const r = normalizarReparto(R, parcial);
    assert.equal(sum(r), 100, JSON.stringify(parcial));
    assert.ok(r.every((x) => x >= 0 && x <= 100 && x % 10 === 0), JSON.stringify([parcial, r]));
  }
});

test('personas por oficio: floor(Poblacion x pct / 100) y las que sobran van a los granjeros', () => {
  assert.deepEqual(personasPorOficio(10, R), [4, 2, 1, 1, 2, 0]);
  assert.deepEqual(personasPorOficio(11, R), [5, 2, 1, 1, 2, 0], '4.4 + 2.2 + 1.1 + 1.1 + 2.2 = 10: la persona 11 va a los granjeros');
  assert.equal(sum(personasPorOficio(37, [30, 10, 10, 20, 20, 10])), 37);
});

// Un mundo y una civilizacion armados a mano para comprobar la produccion con cuentas que se hacen en la cabeza.
const mundoPrueba = () => ({
  regs: [
    { flujo: { Comida: 1, Madera: 0, Roca: 0, Hierro: 0, Oro: 0, Ciencia: 0, Cultura: 0 } },
    { flujo: { Comida: 0, Madera: 1, Roca: 0, Hierro: 0, Oro: 0, Ciencia: 0, Cultura: 0 } },
    { flujo: { Comida: 0, Madera: 0, Roca: 1, Hierro: 2, Oro: 0, Ciencia: 0, Cultura: 0 } },
  ],
});
const civPrueba = (extra = {}) => ({ ...crearCivilizacion(0), regiones: [0, 1, 2], capital: 0, fundada: true, ...extra });

test('produccion = terreno + gente por oficio: 13 Comida, 5 Madera, 3 Roca, 2 Hierro, 2 Oro, 4 Ciencia y 0 Cultura con el reparto inicial', () => {
  assert.deepEqual(produccion(civPrueba(), mundoPrueba(), 1), { Comida: 13, Madera: 5, Roca: 3, Hierro: 2, Oro: 2, Ciencia: 4, Cultura: 0 });
});

test('los bonos porcentuales se SUMAN y el resultado se redondea al entero mas cercano (empate hacia arriba)', () => {
  // granero (+20 %) y Rotacion (+15 %) suman +35 %: 13 x 1.35 = 17.55 -> 18
  const c = civPrueba({ tecnologias: ['T1', 'T3'], edificios: { 0: { tipo: 'granero', desde: 1 } } });
  assert.equal(produccion(c, mundoPrueba(), 2).Comida, 18);
  // eruditos: +20 % Ciencia y -15 % Oro: 4 x 1.2 = 4.8 -> 5; 2 x 0.85 = 1.7 -> 2
  const e = civPrueba({ rasgos: ['eruditos'] });
  const p = produccion(e, mundoPrueba(), 1);
  assert.deepEqual([p.Ciencia, p.Oro], [5, 2]);
  // un empate de .5 sube: 1 sabio da 2 de Ciencia y biblioteca +25 % da 2.5 -> 3
  const b = civPrueba({ poblacion: 10, reparto: [40, 20, 20, 20, 0, 0], tecnologias: ['S2'], edificios: { 1: { tipo: 'biblioteca', desde: 1 } } });
  assert.equal(produccion({ ...b, reparto: [50, 30, 10, 0, 10, 0] }, mundoPrueba(), 2).Ciencia, 3);
});

test('un edificio o una Maravilla solo cuentan desde el turno en que estan activos (se pagan ahora y rigen desde el siguiente)', () => {
  const c = civPrueba({ tecnologias: ['T1'], edificios: { 0: { tipo: 'granero', desde: 5 } } });
  assert.equal(produccion(c, mundoPrueba(), 4).Comida, 13);
  assert.equal(produccion(c, mundoPrueba(), 5).Comida, 16, '13 x 1.2 = 15.6 -> 16');
  assert.equal(modificadores({ ...c, maravillas: [{ id: 'faro', desde: 7 }] }, 6).pct.Oro, 0);
  assert.equal(modificadores({ ...c, maravillas: [{ id: 'faro', desde: 7 }] }, 7).pct.Oro, 0.25);
});

test('un tipo de edificio cuenta una sola vez aunque haya varios y las murallas solo la mejor', () => {
  const doble = civPrueba({ tecnologias: ['T1'], edificios: { 0: { tipo: 'granero', desde: 1 }, 1: { tipo: 'granero', desde: 1 } } });
  assert.equal(modificadores(doble, 2).pct.Comida, 0.2);
  const murallas = civPrueba({ tecnologias: ['D1', 'D2'], edificios: { 0: { tipo: 'muralla de madera', desde: 1 }, 1: { tipo: 'muralla', desde: 1 } } });
  assert.equal(modificadores(murallas, 2).muralla, 0.5);
});

test('bonos planos y especiales: Calendario +1 Ciencia por region, puerto +2 Oro y +1 Comida, Fundicion +1 Hierro por minero, mina +25 % Hierro', () => {
  assert.equal(produccion(civPrueba({ tecnologias: ['S1'] }), mundoPrueba(), 1).Ciencia, 7, '4 + 3 regiones');
  const p = produccion(civPrueba({ tecnologias: ['C2'], edificios: { 0: { tipo: 'puerto', desde: 1 } } }), mundoPrueba(), 2);
  assert.deepEqual([p.Oro, p.Comida], [4, 14]);
  assert.equal(produccion(civPrueba({ tecnologias: ['M2'] }), mundoPrueba(), 1).Hierro, 3, '2 de la region + 1 minero con Fundicion');
  assert.equal(produccion(civPrueba({ tecnologias: ['M2'], edificios: { 0: { tipo: 'mina', desde: 1 } } }), mundoPrueba(), 2).Hierro, 4, '3 x 1.25 = 3.75 -> 4');
});

test('la Estabilidad del cierre anterior por debajo de 40 quita 20 % a toda la produccion', () => {
  assert.equal(produccion(civPrueba({ estabilidad: 40 }), mundoPrueba(), 1).Comida, 13);
  assert.equal(produccion(civPrueba({ estabilidad: 39 }), mundoPrueba(), 1).Comida, 10, '13 x 0.8 = 10.4 -> 10');
});

test('espacio = 6 + 3 por region + bonos de edificios', () => {
  assert.equal(espacioDe(civPrueba(), modificadores(civPrueba(), 1)), 15);
  const c = civPrueba({ tecnologias: ['T1', 'T2'], edificios: { 0: { tipo: 'granero', desde: 1 }, 1: { tipo: 'acueducto', desde: 1 } } });
  assert.equal(espacioDe(c, modificadores(c, 2)), 21);
});

test('Estabilidad = 50 + bonos + floor(Cultura / 5) - 2 por region sobre 6 - 10 si hubo hambre, de 0 a 100', () => {
  assert.equal(estabilidadDe(civPrueba(), 1), 50);
  const c = civPrueba({ regiones: [0, 1, 2, 3, 4, 5, 6, 7, 8], cultura: 12, tecnologias: ['E1', 'E2'], edificios: { 0: { tipo: 'templo', desde: 1 } } });
  assert.equal(estabilidadDe(c, 2), 50 + 5 + 5 + 2 - 6, 'templo +5, Leyes +5, 12 de Cultura = +2, 9 regiones = -6');
  assert.equal(estabilidadDe({ ...c, hambre: true }, 2), 50 + 5 + 5 + 2 - 6 - 10);
  assert.equal(estabilidadDe(civPrueba({ rasgos: ['devotos'] }), 1), 55);
  assert.equal(estabilidadDe(civPrueba({ rasgos: ['pioneros'] }), 1), 45);
  assert.equal(estabilidadDe(civPrueba({ cultura: 9999 }), 1), 100);
  assert.equal(estabilidadDe(civPrueba({ hambre: true, regiones: Array.from({ length: 40 }, (_, i) => i) }), 1), 0);
});

test('costo de un edificio: (3 Madera + 2 Roca) x era y, desde la era 3, (era - 2) Hierro; constructores -20 % redondeado hacia arriba', () => {
  const sin = modificadores(civPrueba(), 1), con = modificadores(civPrueba({ rasgos: ['constructores'] }), 1);
  assert.deepEqual(costoEdificio('granero', sin), { Madera: 3, Roca: 2 });
  assert.deepEqual(costoEdificio('acueducto', sin), { Madera: 6, Roca: 4 });
  assert.deepEqual(costoEdificio('academia', sin), { Madera: 9, Roca: 6, Hierro: 1 });
  assert.deepEqual(costoEdificio('universidad', sin), { Madera: 12, Roca: 8, Hierro: 2 });
  assert.deepEqual(costoEdificio('laboratorio', sin), { Madera: 18, Roca: 12, Hierro: 4 });
  assert.deepEqual(costoEdificio('granero', con), { Madera: 3, Roca: 2 }, '2.4 -> 3 y 1.6 -> 2');
  assert.deepEqual(costoEdificio('acueducto', con), { Madera: 5, Roca: 4 }, '4.8 -> 5 y 3.2 -> 4');
  assert.deepEqual(costoEdificio('academia', con), { Madera: 8, Roca: 5, Hierro: 1 }, '7.2 -> 8, 4.8 -> 5, 0.8 -> 1');
});

test('colonizar cuesta 2 Comida + 2 Madera por cada region que ya tienes (pioneros -30 % hacia arriba)', () => {
  const sin = modificadores(civPrueba(), 1), pioneros = modificadores(civPrueba({ rasgos: ['pioneros'] }), 1);
  assert.deepEqual(costoColonizar(civPrueba(), sin), { Comida: 6, Madera: 6 });
  assert.deepEqual(costoColonizar(civPrueba({ regiones: [0, 1, 2, 3, 4, 5] }), sin), { Comida: 12, Madera: 12 }, 'la septima region cuesta 12 + 12');
  assert.deepEqual(costoColonizar(civPrueba(), pioneros), { Comida: 5, Madera: 5 }, '4.2 -> 5');
  assert.deepEqual(costoColonizar(civPrueba({ regiones: [0, 1, 2, 3, 4, 5] }), pioneros), { Comida: 9, Madera: 9 }, '8.4 -> 9');
});

test('ceilDiv es el techo en aritmetica entera', () => {
  assert.deepEqual([ceilDiv(7, 2), ceilDiv(8, 2), ceilDiv(1, 10), ceilDiv(0, 5), ceilDiv(240, 100)], [4, 4, 1, 0, 3]);
});

// Combinaciones de Triple dado: categoria, fuerza, desempate, reparto EXACTO de puntos (docenos enteros) y tarjetas. Es la pieza donde un error de
// redondeo cambiaria una tarjeta, asi que se prueba con empates de 2, 3 y 4 jugadores y con las fronteras de cada tarjeta.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import {
  evaluarCombinacion, compararClaves, repartirPuntos, aciertaTarjeta, premioRonda, distanciaARango, aPuntos,
} from '../../juegos/tripledado/combinaciones.js';
import { DOCEAVOS, TARJETAS, RANGOS } from '../../juegos/tripledado/constantes.js';

const cat = (v) => evaluarCombinacion(v).categoria;
const fuerza = (a, b) => compararClaves(evaluarCombinacion(a).clave, evaluarCombinacion(b).clave);
// claves de ejemplo de cada categoria, de la mas fuerte a la mas debil
const TRIPLE = [4, 2], ESCALERA = [3, 5], DOBLE = [2, 4, 2], SENCILLO = [1, 6, 3, 1];

test('las constantes son las del spec', () => {
  assert.deepEqual(TARJETAS, ['ZERO', 'MIN', 'MORE', 'MAX']);
  assert.equal(DOCEAVOS, 12);
  assert.deepEqual(RANGOS.MIN, [1, 83]);
  assert.deepEqual(RANGOS.MORE, [84, 131]);
  assert.deepEqual(RANGOS.MAX[0], 132);
});

test('categorias: triple, escalera, doble y sencillo, sin importar el orden de los dados', () => {
  assert.equal(cat([5, 5, 5]), 'triple');
  assert.equal(cat([3, 4, 5]), 'escalera');
  assert.equal(cat([5, 3, 4]), 'escalera');
  assert.equal(cat([1, 2, 3]), 'escalera');
  assert.equal(cat([4, 4, 2]), 'doble');
  assert.equal(cat([2, 4, 4]), 'doble');
  assert.equal(cat([4, 2, 2]), 'doble');
  assert.equal(cat([1, 3, 6]), 'sencillo');
  assert.equal(cat([6, 1, 2]), 'sencillo', 'el 6 y el 1 no son consecutivos');
  assert.equal(cat([6, 5, 1]), 'sencillo');
  assert.equal(cat([1, 2, 4]), 'sencillo', 'dos consecutivos y uno suelto no es escalera');
});

test('jerarquia: cualquier triple supera a cualquier escalera, esta a cualquier doble y esta a cualquier sencillo', () => {
  assert.ok(fuerza([1, 1, 1], [6, 5, 4]) > 0);
  assert.ok(fuerza([4, 5, 6], [6, 6, 5]) > 0);
  assert.ok(fuerza([1, 1, 2], [6, 5, 3]) > 0);
  assert.ok(fuerza([6, 5, 3], [1, 1, 2]) < 0);
});

test('dentro de una categoria gana el numero mayor (escalera por su dado alto; doble por pareja y luego dado suelto; sencillo de mayor a menor)', () => {
  assert.ok(fuerza([4, 5, 6], [3, 4, 5]) > 0);
  assert.ok(fuerza([3, 3, 3], [2, 2, 2]) > 0);
  assert.ok(fuerza([5, 5, 3], [5, 5, 2]) > 0, 'misma pareja: decide el dado suelto');
  assert.ok(fuerza([2, 2, 6], [5, 5, 1]) < 0, 'primero cuenta la pareja, aunque el dado suelto sea alto');
  assert.ok(fuerza([6, 5, 2], [6, 3, 1]) > 0);
  assert.ok(fuerza([6, 5, 2], [6, 5, 1]) > 0);
  assert.equal(fuerza([4, 5, 6], [6, 5, 4]), 0, 'el orden de los dados no importa');
});

test('reparto sin empates: 6, 3, 1 y 0 puntos segun el orden, en docenos', () => {
  const r = repartirPuntos([{ clave: SENCILLO, desempate: 0 }, { clave: ESCALERA, desempate: 0 }, { clave: DOBLE, desempate: 0 }, { clave: TRIPLE, desempate: 0 }]);
  assert.deepEqual(r.puntos, [0, 36, 12, 72]);
  assert.deepEqual(r.puesto, [4, 2, 3, 1]);
  assert.deepEqual(r.porDesempate, [false, false, false, false]);
});

test('reparto con empates: se promedian las posiciones ocupadas y no hay error de redondeo', () => {
  const igual = (c) => ({ clave: c, desempate: 3 });
  // dos primeros: (6 + 3) / 2 = 4.5
  assert.deepEqual(repartirPuntos([igual(TRIPLE), igual(TRIPLE), igual(DOBLE), igual(SENCILLO)]).puntos, [54, 54, 12, 0]);
  // tres primeros: (6 + 3 + 1) / 3 = 3.33
  assert.deepEqual(repartirPuntos([igual(TRIPLE), igual(TRIPLE), igual(TRIPLE), igual(SENCILLO)]).puntos, [40, 40, 40, 0]);
  // cuatro empatados: 10 / 4 = 2.5
  assert.deepEqual(repartirPuntos([igual(DOBLE), igual(DOBLE), igual(DOBLE), igual(DOBLE)]).puntos, [30, 30, 30, 30]);
  // dos ultimos: (1 + 0) / 2 = 0.5
  assert.deepEqual(repartirPuntos([igual(TRIPLE), igual(ESCALERA), igual(SENCILLO), igual(SENCILLO)]).puntos, [72, 36, 6, 6]);
  // dos de en medio: (3 + 1) / 2 = 2
  assert.deepEqual(repartirPuntos([igual(TRIPLE), igual(DOBLE), igual(DOBLE), igual(SENCILLO)]).puntos, [72, 24, 24, 0]);
  assert.deepEqual(repartirPuntos([igual(TRIPLE), igual(TRIPLE), igual(DOBLE), igual(DOBLE)]).puesto, [1, 1, 3, 3]);
});

test('el desempate (dado blanco que sobra) separa combinaciones iguales y se marca; si tambien empatan, comparten', () => {
  const r = repartirPuntos([{ clave: DOBLE, desempate: 5 }, { clave: DOBLE, desempate: 3 }, { clave: SENCILLO, desempate: 0 }, { clave: SENCILLO, desempate: 0 }]);
  assert.deepEqual(r.puntos, [72, 36, 6, 6]);
  assert.deepEqual(r.porDesempate, [true, true, false, false]);
  const e = repartirPuntos([{ clave: DOBLE, desempate: 4 }, { clave: DOBLE, desempate: 4 }, { clave: SENCILLO, desempate: 0 }, { clave: SENCILLO, desempate: 1 }]);
  assert.deepEqual(e.puntos, [54, 54, 0, 12], 'los dobles iguales en todo se reparten 4.5; entre los sencillos el dado sobrante 1 supera al 0');
  assert.deepEqual(e.porDesempate, [false, false, true, true]);
});

test('propiedad: en cualquier enfrentamiento se reparten exactamente 10 puntos (120 docenos) y mejor combinacion nunca cobra menos', () => {
  const rng = crearRng(42);
  const CLAVES = [SENCILLO, DOBLE, ESCALERA, TRIPLE];
  const clave = () => CLAVES[Math.floor(rng() * CLAVES.length)];
  for (let n = 0; n < 3000; n++) {
    const entradas = Array.from({ length: 4 }, () => ({ clave: clave(), desempate: Math.floor(rng() * 7) }));
    const { puntos } = repartirPuntos(entradas);
    assert.equal(puntos.reduce((a, b) => a + b, 0), 120, JSON.stringify(entradas));
    assert.ok(puntos.every((p) => Number.isInteger(p) && p >= 0 && p <= 72));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const mejor = compararClaves([...entradas[i].clave, entradas[i].desempate], [...entradas[j].clave, entradas[j].desempate]) > 0;
      if (mejor) assert.ok(puntos[i] >= puntos[j]);
    }
  }
});

test('tarjetas: fronteras exactas en docenos (0; 0.08; 6.92; 7; 10.92; 11)', () => {
  assert.equal(aciertaTarjeta('ZERO', 0), true);
  assert.equal(aciertaTarjeta('ZERO', 1), false);
  assert.equal(aciertaTarjeta('MIN', 0), false, 'cero no es MIN');
  assert.equal(aciertaTarjeta('MIN', 1), true);
  assert.equal(aciertaTarjeta('MIN', 83), true, '6.92 puntos sigue siendo MIN');
  assert.equal(aciertaTarjeta('MIN', 84), false, '7 puntos ya no');
  assert.equal(aciertaTarjeta('MORE', 83), false);
  assert.equal(aciertaTarjeta('MORE', 84), true, '7 puntos exactos es MORE');
  assert.equal(aciertaTarjeta('MORE', 131), true, '10.92 puntos sigue siendo MORE');
  assert.equal(aciertaTarjeta('MORE', 132), false);
  assert.equal(aciertaTarjeta('MAX', 131), false);
  assert.equal(aciertaTarjeta('MAX', 132), true, '11 puntos exactos es MAX');
  assert.equal(aciertaTarjeta('MAX', 216), true);
  assert.equal(aciertaTarjeta('MAX', 0), false);
});

test('tres empatados en el primer lugar durante tres enfrentamientos suman 10 exacto (sin 9.999...)', () => {
  const tres = repartirPuntos([{ clave: TRIPLE, desempate: 1 }, { clave: TRIPLE, desempate: 1 }, { clave: TRIPLE, desempate: 1 }, { clave: SENCILLO, desempate: 1 }]).puntos[0];
  const total = tres + tres + tres; // 3 x 3.33 = exactamente 10 puntos
  assert.equal(total, 120);
  assert.equal(aciertaTarjeta('MORE', total), true);
  assert.equal(aciertaTarjeta('MAX', total), false);
});

test('premios: ZERO paga 40, las demas duplican, y fallar conserva los puntos de la ronda', () => {
  assert.deepEqual(premioRonda('MORE', 108), { acierto: true, puntos: 216 }, 'MORE con 9 puntos da 18');
  assert.deepEqual(premioRonda('ZERO', 0), { acierto: true, puntos: 480 }, '40 puntos');
  assert.deepEqual(premioRonda('MAX', 132), { acierto: true, puntos: 264 });
  assert.deepEqual(premioRonda('MIN', 36), { acierto: true, puntos: 72 });
  assert.deepEqual(premioRonda('MORE', 60), { acierto: false, puntos: 60 }, 'fallar no resta');
  assert.deepEqual(premioRonda('ZERO', 6), { acierto: false, puntos: 6 });
});

test('distanciaARango: cuanto le falta a una tarjeta fallida (0 si acierta)', () => {
  assert.equal(distanciaARango('MORE', 60), 24);
  assert.equal(distanciaARango('MIN', 84), 1);
  assert.equal(distanciaARango('ZERO', 6), 6);
  assert.equal(distanciaARango('MAX', 100), 32);
  assert.equal(distanciaARango('MORE', 100), 0);
});

test('aPuntos muestra docenos como decimales de 2 cifras', () => {
  assert.equal(aPuntos(54), 4.5);
  assert.equal(aPuntos(40), 3.33);
  assert.equal(aPuntos(6), 0.5);
  assert.equal(aPuntos(0), 0);
  assert.equal(aPuntos(480), 40);
});

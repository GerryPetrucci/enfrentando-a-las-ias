import test from 'node:test';
import assert from 'node:assert/strict';
import { PESOS, puntuar, ranking, eficiencia, robustez } from '../../worldbox/puntuacion.js';

const base = { vivo: true, poblacion: 20, territorio: 3, recursos: 20, objetivos: 0 };
test('las metricas se fijan antes de correr: pesos congelados y formula exacta', () => {
  assert.deepEqual({ ...PESOS }, { supervivencia: 100, poblacion: 1, territorio: 5, recursos: 0.1, objetivos: 20, penalizacion: 5 });
  assert.throws(() => { 'use strict'; PESOS.supervivencia = 0; }, TypeError);
  assert.equal(puntuar(base), 137);
  assert.equal(puntuar({ ...base, vivo: false }), 37, 'sobrevivir aporta exactamente 100');
  assert.equal(puntuar({ ...base, poblacion: 21 }), 138); assert.equal(puntuar({ ...base, territorio: 4 }), 142);
  assert.equal(puntuar({ ...base, recursos: 21 }), 137.1); assert.equal(puntuar({ ...base, objetivos: 1 }), 157);
  assert.equal(puntuar(base, 2), 127); assert.equal(puntuar(base, 100), -363, 'las infracciones pueden dejar la puntuacion negativa');
  assert.equal(puntuar({ vivo: false, poblacion: 0, territorio: 0, recursos: 7, objetivos: 1 }, 2), 10.7);
});
test('el redondeo a una decimal no deja ruido de punto flotante', () => {
  for (let r = 0; r < 200; r++) assert.equal(puntuar({ ...base, recursos: r }), Math.round((137 + 0.1 * (r - 20)) * 10) / 10);
  assert.equal(puntuar({ ...base, recursos: 3 }), 135.3);
});
test('una tabla de pesos explicita manda; los campos ausentes valen 0 y el orden de las claves no cambia el resultado', () => {
  const f = { vivo: true, poblacion: 10, territorio: 4, recursos: 5, edificios: 3 };
  assert.equal(puntuar(f, 0, { supervivencia: 10, poblacion: 2, edificios: 5, penalizacion: 1 }), 10 + 20 + 15);
  assert.equal(puntuar(f, 3, { penalizacion: 1, edificios: 5, supervivencia: 10, poblacion: 2 }), 10 + 20 + 15 - 3);
  assert.equal(puntuar(f, 0, { supervivencia: 0, penalizacion: 0, salud_media_pct: 99 }), 0, 'un campo que el juego no entrega no suma');
  assert.equal(puntuar(f), puntuar(f, 0, PESOS), 'sin tabla se usa la del simulador');
});
test('ranking: puntos, luego poblacion, luego territorio; si persiste comparten puesto', () => {
  const fila = (participant_id, puntos, poblacion, territorio) => ({ participant_id, puntos, poblacion, territorio });
  const r = ranking([fila('d', 10, 5, 5), fila('a', 20, 1, 1), fila('b', 10, 6, 1), fila('c', 10, 5, 6), fila('e', 10, 5, 5)]);
  assert.deepEqual(r.map(x => [x.participant_id, x.puesto]), [['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 4]]);
  assert.deepEqual(ranking([]), []);
  assert.deepEqual(ranking([fila('x', 1, 1, 1)]).map(x => x.puesto), [1]);
  const entrada = [fila('b', 1, 1, 1), fila('a', 2, 1, 1)]; ranking(entrada); assert.equal(entrada[0].participant_id, 'b', 'no modifica la entrada');
  // El siguiente puesto tras un empate salta: 1,1,3.
  assert.deepEqual(ranking([fila('a', 5, 1, 1), fila('b', 5, 1, 1), fila('c', 1, 1, 1)]).map(x => x.puesto), [1, 1, 3]);
});
test('eficiencia: puntos por dolar, nunca infinita', () => {
  assert.equal(eficiencia(100, 0.5), 200); assert.equal(eficiencia(100, 0), null); assert.equal(eficiencia(-5, 1), -5);
});
test('robustez: desviacion entre medias por semilla DISTINTA', () => {
  assert.deepEqual(robustez([]), { semillas: 0, media: null, desviacion: null });
  assert.deepEqual(robustez([{ semilla: 1, puntos: 10 }, { semilla: 2, puntos: 20 }]), { semillas: 2, media: 15, desviacion: 5 });
  assert.equal(robustez([{ semilla: 1, puntos: 10 }, { semilla: 1, puntos: 20 }]).desviacion, null, 'repetir una semilla no cuenta como otra');
  assert.deepEqual(robustez([{ semilla: 1, puntos: 10 }, { semilla: 1, puntos: 20 }]), { semillas: 1, media: 15, desviacion: null });
  assert.deepEqual(robustez([{ semilla: 1, puntos: 10 }, { semilla: 1, puntos: 20 }, { semilla: 2, puntos: 15 }]), { semillas: 2, media: 15, desviacion: 0 });
});

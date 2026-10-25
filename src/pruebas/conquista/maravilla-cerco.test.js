import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoEstado, contexto, capital, fijarTropas } from './ayudas.js';
import { maravillaYVictoria } from '../../juegos/conquista/turno/cierre.js';
import { cercosDeMaravilla } from '../../juegos/conquista/maravilla.js';
import { MARAVILLA } from '../../juegos/conquista/constantes.js';
import { ponerPila } from '../../juegos/conquista/estado.js';
import { vistaTexto } from '../../juegos/conquista/vista.js';
import { resumenPublico } from '../../juegos/conquista/texto.js';

function conCerco(n = MARAVILLA.cerco) {
  const E = nuevoEstado(4), c = capital(E, 0), r = E.mapa.regs[c].vecinos[0];
  E.dueno[r] = 1; fijarTropas(E, r, n);
  E.maravilla = { r: c, k: 0, n: MARAVILLA.turnos - 1, t0: 0 };
  return { E, r };
}
test('un cerco pausa la victoria inminente sin conquistar la capital; despejarlo reanuda el progreso', () => {
  const { E, r } = conCerco(), c = contexto(E);
  maravillaYVictoria(c);
  assert.equal(E.ganador, null); assert.equal(E.maravilla.n, MARAVILLA.turnos - 1);
  assert.equal(E.maravilla.cercada, true);
  assert.equal(E.dueno[E.maravilla.r], 0, 'el defensor conserva su capital');
  assert.ok(c.eventos.some((e) => e.tipo === 'maravilla_cerco'));
  assert.match(vistaTexto(E, 0), /pausada por cerco/);
  assert.match(resumenPublico(c.eventos).join(' '), /cuenta se pausa/);
  const repetido = contexto(E); maravillaYVictoria(repetido);
  assert.equal(repetido.eventos.filter((e) => e.tipo === 'maravilla_cerco').length, 0, 'no repite el aviso cada turno');
  fijarTropas(E, r, 0);
  const libre = contexto(E); maravillaYVictoria(libre);
  assert.equal(E.ganador, 0); assert.equal(E.ganoPorMaravilla, true);
  assert.ok(libre.eventos.some((e) => e.tipo === 'maravilla_libre'));
});
test('el umbral es por pila enemiga; aliados, reinos caidos y tropas lejanas no bloquean', () => {
  const { E, r } = conCerco(MARAVILLA.cerco - 1);
  assert.deepEqual(cercosDeMaravilla(E), []);
  ponerPila(E, r, 2, [MARAVILLA.cerco, 0, 0, 0]);
  assert.ok(cercosDeMaravilla(E).some((c) => c.k === 2), 'incluye otro ejercito presente, no solo el dueno');
  E.reinos[2].vivo = false;
  assert.deepEqual(cercosDeMaravilla(E), []);
  fijarTropas(E, r, MARAVILLA.cerco);
  E.reinos[1].pactos[0] = 3; E.reinos[0].pactos[1] = 3;
  assert.deepEqual(cercosDeMaravilla(E, 3), []);
  assert.equal(cercosDeMaravilla(E, 4).length, 1, 'el pacto vencido ya no impide cercar');
  E.maravilla = null; assert.deepEqual(cercosDeMaravilla(E), []);
});

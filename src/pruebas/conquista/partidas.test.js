import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { jugarCompleta } from './ayudas.js';
import { resultadoDe } from '../../juegos/conquista/resultado.js';
import { instantanea } from '../../juegos/conquista/estado.js';

const COMBOS = [['agresivo', 'pacifico', 'economico', 'azar'], ['economico', 'economico', 'agresivo', 'pacifico'], ['azar', 'azar', 'agresivo', 'economico']];

test('partidas completas con bots de 2 a 5 reinos: un solo ganador, terminan a tiempo y se cumplen las invariantes en cada turno', () => {
  for (const k of [2, 3, 4, 5]) for (const seed of [1, 2, 3]) for (const combo of COMBOS) {
    const { E } = jugarCompleta(k, seed, combo), r = resultadoDe(E);
    assert.ok(E.ganador !== null && E.ganador >= 0 && E.ganador < k, `k=${k} seed=${seed}`);
    assert.ok(E.turno <= 30);
    assert.equal(r.puntos.reduce((a, b) => a + b, 0), k >= 3 ? 9 : 8);
    assert.equal(r.puntos.filter((p) => p === 5).length, 1);
    assert.equal(r.puntos[E.ganador], 5);
  }
});

test('un reino caido deja de recibir llamadas', () => {
  let conCaida = 0;
  for (const seed of [1, 2, 3, 12, 34, 39]) { // 12, 34 y 39 tienen un reino caido con estos bots (verificado en seeds 1 a 40)
    const { E, llamadas, registros } = jugarCompleta(4, seed, ['agresivo', 'agresivo', 'economico', 'azar']);
    const vivosAlInicio = (i) => (i === 0 ? 4 : registros[i - 1].estado.vivo.filter(Boolean).length);
    assert.equal(llamadas, registros.reduce((suma, _, i) => suma + vivosAlInicio(i), 0));
    if (E.reinos.some((r) => r.cayoEn !== null)) { conCaida++; assert.ok(llamadas < 4 * E.turno); }
  }
  assert.ok(conCaida >= 1, 'ninguna de las partidas de prueba tuvo un reino caido: cambiar los seeds');
});

test('mismo seed y mismos bots: la misma partida, turno por turno', () => {
  const a = jugarCompleta(4, 9), b = jugarCompleta(4, 9);
  assert.equal(JSON.stringify(a.registros), JSON.stringify(b.registros));
  assert.equal(JSON.stringify(instantanea(a.E)), JSON.stringify(instantanea(b.E)));
  const c = jugarCompleta(4, 10);
  assert.notEqual(JSON.stringify(a.registros), JSON.stringify(c.registros));
});

test('las respuestas con basura y mal formadas de los bots se descartan sin romper la partida y quedan medidas', () => {
  const { E } = jugarCompleta(4, 2, ['azar', 'azar', 'azar', 'azar']);
  for (const st of E.stats) assert.ok(st.total > 0 && st.validas <= st.total);
  assert.ok(E.stats.some((st) => st.validas < st.total), 'el bot al azar debia mandar alguna orden invalida');
});

function archivos(dir) {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? archivos(p) : [p]; });
}
test('el motor no usa azar ni reloj sin semilla (Math.random, Date.now, new Date)', () => {
  const fuentes = [...archivos('src/juegos/conquista'), 'src/juegos/conquista.js', 'src/juegos/conquista-bots.js', 'src/mapa.js'];
  for (const f of fuentes) {
    const texto = readFileSync(f, 'utf8');
    assert.ok(!/Math\.random|Date\.now|new Date/.test(texto), `${f} usa azar o reloj sin semilla`);
  }
});

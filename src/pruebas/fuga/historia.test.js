import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HISTORIA } from '../../juegos/fuga/historia.js';
import { crearHistoriaInicial, validarHistoria } from '../../juegos/fuga/historia-datos.js';
import { crearEstado } from '../../juegos/fuga/estado.js';
import { aplicarTurno } from '../../juegos/fuga/turno.js';
import { normalizarRespuesta } from '../../juegos/fuga/ordenes.js';
import { vistaTexto } from '../../juegos/fuga/vista.js';
import { resultadoDe } from '../../juegos/fuga/resultado.js';
import { crearRng } from '../../rng.js';
import { exportarTwine, importarTwine } from '../../../herramientas/fuga-twine.mjs';

test('Twine exporta e importa el grafo completo sin perder condiciones, pesos ni texto', () => {
  const html = exportarTwine();
  assert.match(html, /<tw-storydata/);
  assert.equal((html.match(/<tw-passagedata /g) ?? []).length, HISTORIA.nodos.length + 1);
  assert.deepEqual(importarTwine(html), HISTORIA);
  const editada = html.replace('La salida del bloque', 'El trabajo anterior');
  assert.ok(JSON.stringify(importarTwine(editada)).includes('El trabajo anterior'));
});

test('se rechazan bucles, saltos, condiciones ejecutables, escenas incompatibles y pasajes duplicados', () => {
  for (const cambiar of [
    (h) => { h.nodos[0].salidas[0].a = h.inicio; },
    (h) => { h.nodos[0].salidas[0].a = 'no-existe'; },
    (h) => { h.nodos[0].salidas[0].si = { evaluar: 'process.exit()' }; },
    (h) => { h.nodos[0].salidas = h.nodos[0].salidas.filter((s) => Object.keys(s.si).length > 0); },
    (h) => { h.nodos[0].escenas = ['muro', 'camara', 'celda']; },
  ]) { const h = crearHistoriaInicial(); cambiar(h); assert.throws(() => validarHistoria(h)); }
  const html = exportarTwine();
  assert.throws(() => importarTwine(html.replace('name="r2-control"', 'name="r2-mantenimiento"')), /duplicados/);
  const conScript = `<script>globalThis.HISTORIA_EJECUTADA = true</script>${html}`;
  delete globalThis.HISTORIA_EJECUTADA;
  importarTwine(conScript);
  assert.equal(globalThis.HISTORIA_EJECUTADA, undefined, 'solo se leen datos, no se ejecuta HTML');
});

const jugada = (postura, metodo) => normalizarRespuesta({ postura, metodo, aprovechar: false });
function preparado(seed) {
  const rng = crearRng(seed); let cerrado = false;
  const E = crearEstado(() => { if (cerrado) throw new Error('RNG consumido durante el turno'); return rng(); }, { ramificada: true });
  cerrado = true;
  E.dados = E.dados.map(() => [0.999, 0.999]); E.salidas = E.salidas.map(() => [1, 1]);
  return E;
}
test('las decisiones cambian la ruta del mismo mundo sin tirar dados nuevos ni adelantar informacion', () => {
  const a = preparado(73), b = preparado(73);
  assert.deepEqual(a, b);
  aplicarTurno(a, [jugada('avanzar', 'sigilo'), jugada('avanzar', 'sigilo')]);
  aplicarTurno(b, [jugada('avanzar', 'fuerza'), jugada('avanzar', 'fuerza')]);
  assert.equal(a.historia.actual, 'r2-galeria'); assert.equal(b.historia.actual, 'r2-mantenimiento');
  const vista = vistaTexto(a, 0);
  assert.match(vista, /Recorrido:/);
  assert.doesNotMatch(vista, /r2-|prioridad|huella|elecciones|salidas/);
  assert.equal(a.historia.huella, b.historia.huella);
});

test('nueve rondas terminan sin repetir escenas, guardan ramas y conservan reproduccion legacy', () => {
  const rutas = new Set();
  for (let seed = 1; seed <= 35; seed++) {
    const E = preparado(seed);
    while (!E.fin) aplicarTurno(E, [jugada('ayudar', 'sigilo'), jugada('ayudar', 'engano')]);
    assert.equal(E.ronda, 9); assert.equal(new Set(E.historial.map((r) => r.situacion.id)).size, 9);
    assert.ok(E.historial.every((r) => typeof r.situacion.rama === 'string'));
    assert.equal(resultadoDe(E).historia.version, HISTORIA.version);
    rutas.add(E.historial.map((r) => r.situacion.id).join('/'));
  }
  assert.ok(rutas.size > 20, `solo ${rutas.size} recorridos distintos`);
  const legacy = crearEstado(crearRng(73));
  assert.equal(legacy.historia, undefined);
  aplicarTurno(legacy, [jugada('ayudar', 'sigilo'), jugada('ayudar', 'engano')]);
  assert.equal(legacy.historial[0].situacion.rama, undefined);
});

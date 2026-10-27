import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { medir, jugarPartida, ic95, BOTS_ACTIVOS } from '../../juegos/civilizaciones/medicion.js';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));

test('ic95: media +- 1.96 sd / raiz(n) sobre los valores por mundo; con un solo mundo no hay intervalo', () => {
  assert.deepEqual(ic95([0.5]), { media: 0.5, bajo: null, alto: null, n: 1 });
  const r = ic95([0, 1, 0, 1]);
  assert.equal(r.media, 0.5);
  assert.ok(Math.abs(r.alto - r.media - 1.96 * Math.sqrt(1 / 3) / 2) < 1e-9);
  assert.equal(ic95([1, 1, 1, 1]).bajo, 1, 'sin variacion el intervalo es un punto');
});

test('jugarPartida: una partida entre dos bots en un mundo, determinista y con los invariantes comprobados', () => {
  const a = jugarPartida(['cientifico', 'equilibrado'], 4, { invariantes: true }), b = jugarPartida(['cientifico', 'equilibrado'], 4, { invariantes: true });
  assert.deepEqual(a, b);
  assert.deepEqual(a.malos, []);
  assert.ok([0, 1].includes(a.ganador));
  assert.equal(a.civs.length, 2);
  assert.equal(a.bioma, jugarPartida(['pasivo', 'pasivo'], 4).bioma, 'el bioma sale del seed del mundo');
  assert.equal(jugarPartida(['pasivo', 'pasivo'], 4, { bioma: 'arido' }).bioma, 'arido');
});

test('la medicion rapida (8 mundos) cumple las compuertas de la capa 1 de la spec 9.3', () => {
  const R = medir({ mundos: 8, espejos: true, invariantes: true, sin: ['crisis'] });
  assert.equal(R.partidas, 8 * (3 * 2 + 3 * 2), 'por mundo: 3 parejas x 2 asientos y 3 bots x 2 asientos contra el pasivo');
  assert.deepEqual(Object.keys(R.porBot), BOTS_ACTIVOS);
  for (const id of BOTS_ACTIVOS) {
    const b = R.porBot[id];
    assert.ok(b.tecnologias.media >= 15 && b.tecnologias.media <= 36, `${id}: ${b.tecnologias.media} tecnologias al turno 30`);
    assert.equal(b.contraPasivo.media, 1, `${id} gana al pasivo`);
    assert.ok(b.ordenesValidas >= 0.98, `${id}: ordenes validas ${b.ordenesValidas}`);
    assert.ok(b.arbolAgotado < 0.2, `${id}: arbol agotado en ${b.arbolAgotado}`);
  }
  const eq = R.porBot.equilibrado;
  assert.ok(eq.tecnologias.media >= 24 && eq.tecnologias.media <= 28, `equilibrado: ${eq.tecnologias.media}`);
  assert.ok(Object.values(eq.saturados).every((x) => x === 0), 'ningun pilar saturado con el equilibrado');
  assert.equal(R.invariantesRotos, 0);
  assert.equal(R.espejos.partidas, 8, 'un espejo por mundo');
  assert.equal(R.espejos.porSorteo, 1, 'con mundos gemelos un espejo solo lo decide el sorteo del desempate');
});

test('la herramienta de consola imprime la tabla y --json da el mismo resultado; un bot o un bioma desconocido salen con error', () => {
  const salida = execFileSync('node', ['herramientas/medir-civilizaciones.mjs', '--mundos=2'], { cwd: RAIZ, encoding: 'utf8' });
  assert.match(salida, /Carrera de civilizaciones: 2 mundos/);
  assert.match(salida, /cientifico/);
  const json = JSON.parse(execFileSync('node', ['herramientas/medir-civilizaciones.mjs', '--mundos=2', '--json'], { cwd: RAIZ, encoding: 'utf8' }));
  assert.equal(json.mundos, 2);
  assert.equal(json.partidas, 24);
  const mal = spawnSync('node', ['herramientas/medir-civilizaciones.mjs', '--bots=pasivo,cientifico'], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(mal.status, 2);
  assert.match(mal.stderr, /bot no valido/);
  assert.equal(spawnSync('node', ['herramientas/medir-civilizaciones.mjs', '--bioma=luna'], { cwd: RAIZ, encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync('node', ['herramientas/medir-civilizaciones.mjs', '--costos=1,2,3'], { cwd: RAIZ, encoding: 'utf8' }).status, 2);
});

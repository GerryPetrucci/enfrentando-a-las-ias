// ejecutarSerie corre las partidas de una serie, una tras otra (lo de siempre) o todas a la vez (el lote). Se prueba con los
// bots de control de la Guerra de territorios: sin red, sin API, sin gastar nada.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejecutarSerie } from '../ejecutar-serie.js';
import { planDeSerie } from '../serie.js';
import { resolverAgente } from '../agentes.js';
import conquista from '../juegos/conquista.js';
import dilema from '../juegos/dilema.js';

const CLAVES = ['agresivo', 'pacifico', 'economico', 'azar'];
const agentesDe = (juego, claves) => new Map(claves.map((c) => [c, resolverAgente(c, juego)]));
const sinTiempo = ({ duracionMs, ...resto }) => resto; // la duracion real cambia en cada corrida

test('en serie y en paralelo salen las mismas partidas, en el orden del plan', async () => {
  const plan = planDeSerie({ claves: CLAVES, partidas: 4, seedBase: 7, mismoSeed: true });
  const agentes = agentesDe(conquista, CLAVES);
  const uno = await ejecutarSerie({ juego: conquista, plan, agentesPorClave: agentes, maxRondas: 8 });
  const todas = await ejecutarSerie({ juego: conquista, plan, agentesPorClave: agentes, maxRondas: 8, paralelo: true });
  assert.equal(uno.length, 4);
  assert.deepEqual(todas.map(sinTiempo), uno.map(sinTiempo));
  assert.deepEqual(todas.map((r) => r.jugadores[0].id), CLAVES);
});

test('cada partida trae su rotacion, y con 2 jugadores tambien si va invertida', async () => {
  const plan = planDeSerie({ claves: ['tomaydaca', 'siempre-t'], partidas: 2, seedBase: 5 });
  const r = await ejecutarSerie({ juego: dilema, plan, agentesPorClave: agentesDe(dilema, ['tomaydaca', 'siempre-t']) });
  assert.deepEqual(r.map((x) => [x.rotacion, x.invertido]), [[0, false], [1, true]]);
  const c = await ejecutarSerie({ juego: conquista, plan: planDeSerie({ claves: CLAVES, partidas: 2, seedBase: 1, mismoSeed: true }), agentesPorClave: agentesDe(conquista, CLAVES), maxRondas: 1 });
  assert.deepEqual(c.map((x) => [x.rotacion, x.invertido]), [[0, false], [1, false]]);
});

test('avisa cada partida que termina y cada turno que se registra', async () => {
  const plan = planDeSerie({ claves: CLAVES, partidas: 3, seedBase: 2, mismoSeed: true });
  const terminadas = [], turnos = [];
  await ejecutarSerie({
    juego: conquista, plan, agentesPorClave: agentesDe(conquista, CLAVES), maxRondas: 2, paralelo: true,
    alTerminar: (r, p) => terminadas.push(p.n), alRegistrar: (p, registro) => turnos.push([p.n, registro.turno]),
  });
  assert.deepEqual(terminadas.sort(), [0, 1, 2]);
  assert.equal(turnos.length, 6);
});

test('maxRondas corta cada partida y la marca como truncada', async () => {
  const plan = planDeSerie({ claves: CLAVES, partidas: 2, seedBase: 2, mismoSeed: true });
  const r = await ejecutarSerie({ juego: conquista, plan, agentesPorClave: agentesDe(conquista, CLAVES), maxRondas: 3 });
  assert.ok(r.every((x) => x.truncada && x.rondas.length === 3));
});

test('alEmpezar avisa antes de cada partida: en serie una por una, en paralelo todas al arrancar', async () => {
  const plan = planDeSerie({ claves: CLAVES, partidas: 3, seedBase: 2, mismoSeed: true });
  const agentes = agentesDe(conquista, CLAVES);
  for (const paralelo of [false, true]) {
    const eventos = [];
    await ejecutarSerie({
      juego: conquista, plan, agentesPorClave: agentes, maxRondas: 1, paralelo,
      alEmpezar: (p) => eventos.push(`empieza ${p.n}`), alTerminar: (r, p) => eventos.push(`termina ${p.n}`),
    });
    assert.deepEqual(
      eventos,
      paralelo
        ? ['empieza 0', 'empieza 1', 'empieza 2', 'termina 0', 'termina 1', 'termina 2']
        : ['empieza 0', 'termina 0', 'empieza 1', 'termina 1', 'empieza 2', 'termina 2'],
      paralelo ? 'en paralelo' : 'en serie'
    );
  }
});

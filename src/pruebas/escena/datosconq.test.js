// Los datos y las partidas de ejemplo de la escena de la Guerra de territorios (web/casino/conquista-datos.js y src/pruebas/escena/ayudas-conq.js). Sin DOM ni red.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESCENARIOS, ESCENARIOS_NECESARIOS, partidasDeEjemplo, escenariosDe, jugarConqBots, jugarConqConCaido } from './ayudas-conq.js';

test('las partidas de ejemplo son reales del motor y entre todas cubren los escenarios que necesita la escena', async () => {
  const partidas = await partidasDeEjemplo();
  assert.equal(partidas.length, ESCENARIOS.length);
  const vistos = new Set();
  partidas.forEach((p, i) => {
    const cubre = escenariosDe(p);
    for (const c of ESCENARIOS[i].cubre) assert.ok(cubre.has(c), `${ESCENARIOS[i].id} ya no cubre "${c}": el motor cambio, hay que volver a buscar los seeds`);
    cubre.forEach((c) => vistos.add(c));
    assert.ok(Array.isArray(p.rondas) && p.rondas.length > 0 && p.mapa && p.mapa.bioma, `${ESCENARIOS[i].id}: no trae rondas y mapa`);
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(p))).length, JSON.stringify(p).length, 'la partida se guarda sin perder nada');
  });
  for (const necesario of ESCENARIOS_NECESARIOS) assert.ok(vistos.has(necesario), `ninguna partida de ejemplo cubre "${necesario}"`);
});

test('las partidas de ejemplo son deterministas (mismo seed y bots, mismo JSON salvo la duracion)', async () => {
  const sinTiempo = ({ duracionMs, ...resto }) => resto;
  const [a] = await partidasDeEjemplo();
  const b = await jugarConqBots(ESCENARIOS[0].seed, ESCENARIOS[0].bots);
  assert.deepEqual(sinTiempo(b), sinTiempo(a));
});

test('cada llamada recibe su propia copia de la partida: estropear una no afecta a la siguiente', async () => {
  const { seed, bots } = ESCENARIOS[0];
  const a = await jugarConqBots(seed, bots);
  const turnos = a.rondas.length;
  a.rondas.length = 0; a.mapa.bioma = 'roto';
  const b = await jugarConqBots(seed, bots);
  assert.equal(b.rondas.length, turnos);
  assert.notEqual(b.mapa.bioma, 'roto');
});

test('jugarConqBots corre de 2 a 5 reinos con bots de control, y un reino caido de la API (jugarConqConCaido) deja errores y respuestas invalidas', async () => {
  for (const k of [2, 3, 4, 5]) {
    const p = await jugarConqBots(5, ['agresivo', 'pacifico', 'economico', 'azar', 'agresivo'].slice(0, k));
    assert.equal(p.jugadores.length, k);
    assert.equal(p.mapa.k, k);
  }
  const p = await jugarConqConCaido(5, 4, 1);
  assert.ok(p.rondas.some((r) => r.errores[1] && r.respuestas[1].invalida === true), 'el reino 1 debia quedar con error y respuesta invalida');
  assert.ok(p.rondas.every((r) => r.errores[0] === null));
});

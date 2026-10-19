// Reconstruir lo que vio cada IA (src/juegos/conquista/replay.js): rejugando lo guardado se obtiene exactamente el prompt que recibio cada reino. Se prueba contra las vistas reales que ve la arena.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import { construirUsuario } from '../../prompt.js';
import conquista from '../../juegos/conquista.js';
import { reconstruirPrompts } from '../../juegos/conquista/replay.js';

// Corre una partida de bots y anota la vista que la arena le dio a cada reino en cada turno.
async function conVistas(seed, ids) {
  const vistas = [];
  const agentes = ids.map((id, i) => {
    const a = resolverAgente(id === 'claude' || id === 'gpt' ? 'pacifico' : id, conquista);
    return { ...a, id, async jugar(entrada) { (vistas[Math.floor(entrada.contador ?? 0)] ??= []); const turno = vistas.length; void turno; vistas.push({ i, vista: entrada.vista }); return a.jugar(entrada); } };
  });
  const partida = await correrPartida({ juego: conquista, agentes, seed });
  return { partida, vistas: vistas.filter(Boolean) };
}

test('los prompts reconstruidos son EXACTAMENTE los que vio cada reino en cada turno, con nombres de reino por modelo y todo', async () => {
  const { partida, vistas } = await conVistas(18, ['claude', 'gpt', 'economico', 'agresivo']);
  const r = reconstruirPrompts(partida);
  assert.equal(r.fiel, true, 'la rejugada coincide con los estados guardados');
  assert.equal(r.turnos.length, partida.rondas.length);
  const reales = vistas.filter((v) => v && typeof v === 'object' && 'vista' in v);
  let n = 0;
  for (const t of r.turnos) for (const [i, prompt] of t.prompts.entries()) {
    if (prompt === null) continue;
    const real = reales[n++];
    assert.equal(real.i, i, `orden de llamadas en el turno ${t.turno}`);
    assert.equal(prompt, construirUsuario(real.vista), `turno ${t.turno}, reino ${i}`);
  }
  assert.equal(n, reales.length, 'ni una vista de mas ni de menos');
  assert.match(r.turnos[0].prompts[0], /Eres Ambar\./, 'Claude se llama Ambar');
  assert.match(r.turnos[0].prompts[1], /Eres Marfil\./, 'GPT se llama Marfil');
});

test('hasta un turno: solo los turnos pedidos; un reino caido no recibe prompt', async () => {
  const { partida } = await conVistas(61, ['agresivo', 'agresivo', 'agresivo', 'azar']);
  const hasta = reconstruirPrompts(partida, 5);
  assert.deepEqual(hasta.turnos.map((t) => t.turno), [1, 2, 3, 4, 5]);
  assert.equal(hasta.fiel, true);
  const todo = reconstruirPrompts(partida);
  const caido = partida.metricas.findIndex((m) => m.cayoEn);
  if (caido >= 0) {
    const turnoCaida = partida.metricas[caido].cayoEn;
    assert.equal(todo.turnos.find((t) => t.turno === turnoCaida + 1)?.prompts[caido] ?? null, null, 'ya no juega');
  }
  assert.equal(todo.turnos[0].prompts.every((p) => typeof p === 'string'), true);
});

test('si lo guardado no cuadra (un estado cambiado) la reconstruccion lo dice y nunca lanza', async () => {
  const { partida } = await conVistas(18, ['agresivo', 'pacifico', 'economico', 'azar']);
  const manipulada = structuredClone(partida);
  manipulada.rondas[2].estado.dueno[0] = manipulada.rondas[2].estado.dueno[0] === 3 ? 2 : 3;
  assert.equal(reconstruirPrompts(manipulada).fiel, false);
  // sin el mapa guardado el motor lo vuelve a sacar del seed: si coincide con lo jugado la rejugada sigue siendo fiel, y lo que la comprueba son los estados guardados
  assert.equal(reconstruirPrompts({ ...partida, mapa: null }).fiel, true);
  for (const mala of [null, undefined, {}, { ...partida, rondas: 'x' }, { ...partida, jugadores: null }]) {
    assert.doesNotThrow(() => reconstruirPrompts(mala));
    assert.deepEqual(reconstruirPrompts(mala), { fiel: false, turnos: [] });
  }
});

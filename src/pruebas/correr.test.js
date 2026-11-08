import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { correr } from '../correr.js';
const bots = 'agresivo,silencioso,revela,calla,rapida,guarda,mayoria,contradice';
async function local(args, comprobar) {
  const raiz = mkdtempSync(join(tmpdir(), 'w1-correr-'));
  try {
    const r = await correr(args, { raiz, consola: { log() {}, escribir() {} }, crearCliente: () => { throw new Error('red prohibida'); } });
    const datos = JSON.parse(readFileSync(r.ruta, 'utf8')); comprobar(datos, r.ruta);
  } finally { rmSync(raiz, { recursive: true, force: true }); }
}
test('la consola corre una partida reproducible de Lobo con ocho bots', async () => {
  await local(['--juego=lobo', `--jugadores=${bots}`, '--partidas=1', '--seed=3', '--destino=pruebas'], (d, ruta) => {
    assert.equal(d.juego.id, 'lobo'); assert.equal(d.partidas.length, 1);
    assert.equal(d.partidas[0].seed, 3); assert.equal(d.partidas[0].truncada, false);
    assert.deepEqual(d.jugadores, bots.split(',')); assert.equal(d.modo, null);
    assert.match(ruta, /pruebas/); assert.ok(d.partidas[0].rondas.length > 1);
  });
});
test('los valores por defecto son Lobo, ocho controles y una sola partida', async () => {
  await local(['--destino=pruebas', '--seed=3'], d => {
    assert.equal(d.juego.id, 'lobo'); assert.equal(d.partidas.length, 1);
    assert.deepEqual(d.jugadores, bots.split(','));
  });
});
test('la consola rechaza juegos ausentes, cantidad, agente, destino y modo antes de llamar', async () => {
  for (const [args, error] of [
    [['--juego=ausente'], /desconocido/],
    [['--jugadores=agresivo'], /jugadores/],
    [[`--jugadores=ausente,${bots.split(',').slice(1).join(',')}`], /desconocido/],
    [['--destino=cualquiera'], /destino/],
    [[`--jugadores=${Array(8).fill('claude').join(',')}`], /--modo/],
  ]) await assert.rejects(correr(args), error);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { diagnosticar, leerDiagnosticos } from '../../herramientas/diagnostico-editorial.mjs';
import { claveDeCierre, beatDeCierre, duracionDeCierre } from '../../web/casino/cierre.js';
import { IDENTIFICADOR_MS } from '../../web/casino/gancho.js';
import { construirPaquete } from '../../web/casino/paquete-textos.js';
import { armarLinea } from '../../web/casino/lineas.js';
import { jugarMM } from './escena/ayudas-mm.js';

const beatsDe = (duraciones) => duraciones.map((minMs, i) => ({ id: `b${i}`, mano: i + 1, tipo: 'jugada', texto: `Texto ${i}`, minMs }));

test('los cortes conservan cada unidad una sola vez, incluyen cierre y no mutan la linea', () => {
  const beats = beatsDe([35000, 35000, 35000, 35000, 35000]), copia = structuredClone(beats);
  const d = diagnosticar(beats);
  assert.deepEqual(beats, copia);
  assert.equal(d.propuestas.length, 3, 'dos ventanas de 90 s no contienen 175 s mas tres cierres');
  assert.deepEqual(d.propuestas.flatMap((p) => Array.from({ length: p.hasta - p.desde + 1 }, (_, i) => p.desde + i)), [1, 2, 3, 4, 5]);
  assert.ok(d.propuestas.every((p) => p.ms <= 90000 && p.ms === p.contenidoMs + IDENTIFICADOR_MS + p.cierreMs && p.cierreMs > 0), 'cada pieza suma su tarjeta de identificacion y su cierre');
  assert.equal(d.propuestas.reduce((s, p) => s + p.contenidoMs, 0), d.ms);
});

test('el audio vigente cambia los cortes y se mide tambien el audio del cierre', () => {
  const beats = beatsDe([10000, 10000]), cierre = beatDeCierre(claveDeCierre({ seed: 0, partida: 1, desde: 1, hasta: 2 }));
  const voz = { b0: { ms: 44000, fuente: 'Texto 0' }, b1: { ms: 44000, fuente: 'Texto 1' }, [cierre.id]: { ms: 12000, fuente: cierre.texto } };
  const d = diagnosticar(beats, { voz });
  assert.equal(d.propuestas.length, 2, '88 s de contenido mas cierre no caben en 90 s');
  assert.equal(d.actuales.length, 2);
  assert.equal(d.ms, 88000);
  assert.equal(d.sinVoz, 0);
  assert.equal(diagnosticar([beats[0]], { voz }).ms, 44000);
  voz.b0.fuente = 'Otra partida';
  assert.equal(diagnosticar(beats, { voz }).sinVoz, 1);
  assert.equal(diagnosticar(beats, { voz }).ms, 54000, 'audio de otro texto no alarga esta partida');
});

test('una unidad que no cabe queda sola y marcada, incluso si solo el cierre causa el exceso', () => {
  const d = diagnosticar(beatsDe([10000, 89000, 10000]));
  assert.equal(d.propuestas.length, 3);
  assert.deepEqual(d.propuestas.filter((p) => p.excedeObjetivo).map((p) => [p.desde, p.hasta]), [[2, 2]]);
  assert.equal(diagnosticar(beatsDe([200000])).propuestas[0].excedeObjetivo, true);
});

test('el limite exacto incluye el cierre y una linea invalida o un objetivo invalido fallan', () => {
  const cierreMs = duracionDeCierre(claveDeCierre({ seed: 0, partida: 1, desde: 1, hasta: 1 }));
  assert.equal(diagnosticar(beatsDe([90000 - IDENTIFICADOR_MS - cierreMs])).propuestas[0].excedeObjetivo, false);
  assert.equal(diagnosticar(beatsDe([90000 - IDENTIFICADOR_MS - cierreMs + 1])).propuestas[0].excedeObjetivo, true, 'un milisegundo mas ya no cabe');
  for (const objetivoMs of [0, -1, NaN, Infinity]) assert.throws(() => diagnosticar(beatsDe([1]), { objetivoMs }));
  assert.throws(() => diagnosticar([]));
  assert.throws(() => diagnosticar([{ mano: 1, minMs: NaN }]));
  assert.throws(() => diagnosticar([{ mano: 2, minMs: 10 }, { mano: 1, minMs: 10 }]));
});

test('la duracion de las partes actuales coincide con el paquete real, con y sin voz', async () => {
  const partida = await jugarMM(7), beats = await armarLinea('mayormenor', partida);
  for (const voz of [null, Object.fromEntries(beats.map((b) => [b.id, { ms: b.minMs + 2000, fuente: b.texto }]))]) {
    const paquete = construirPaquete({ partida, beats, archivo: 'prueba.json', voz });
    const d = diagnosticar(beats, { voz, seed: partida.seed });
    const partes = paquete.piezas.filter((p) => p.tipo === 'parte');
    assert.equal(partes.length, 2);
    for (let i = 0; i < 2; i++) {
      assert.equal(Math.round(d.actuales[i].ms), partes[i].grabar.ms);
      assert.equal(d.actuales[i].desde, partes[i].grabar.desde);
      assert.equal(d.actuales[i].hasta, partes[i].grabar.hasta);
    }
    assert.equal(d.propuestas.at(-1).hasta, beats.at(-1).mano);
  }
});

test('la CLI explica su uso y rechaza opciones incompatibles antes de leer datos', async () => {
  const ruta = fileURLToPath(new URL('../../herramientas/diagnostico-editorial.mjs', import.meta.url));
  const ayuda = spawnSync(process.execPath, [ruta, '--ayuda'], { encoding: 'utf8' });
  assert.equal(ayuda.status, 0, ayuda.stderr);
  assert.match(ayuda.stdout, /Solo imprime/);
  const error = spawnSync(process.execPath, [ruta, '--archivo=no-existe.json', '--objetivo=0'], { encoding: 'utf8' });
  assert.equal(error.status, 1);
  assert.match(error.stderr, /objetivo/);
  await assert.rejects(leerDiagnosticos({ archivo: 'x', voz: 'x', sinvoz: true }), /no ambos/);
  await assert.rejects(leerDiagnosticos({ archivo: 'x', voz: 'x' }), /necesita --partida/);
});

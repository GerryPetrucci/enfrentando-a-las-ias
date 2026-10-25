import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import fuga from '../../juegos/fuga.js';
import { ambientesDePartida, rotuloAmbiente, LUGARES_PIXEL } from '../../../web/casino/ambiente-fuga.js';
import { OBSTACULOS_PIXEL } from '../../../web/casino/pixel-fuga.js';
import { HISTORIA } from '../../juegos/fuga/historia.js';
import { CATALOGO } from '../../juegos/fuga/catalogo.js';
import { construirLineaDeTiempo } from '../../../web/casino/linea-de-tiempo-fuga.js';

test('puerta y patrulla se revelan en su consecuencia, nunca al abrir la ronda ni al decidir', async () => {
  const p = await correrPartida({ juego: fuga, agentes: ['leal', 'traidor'].map((id) => resolverAgente(id, fuga)), seed: 1 });
  const original = structuredClone(p), a = ambientesDePartida(p);
  assert.equal(a[0].antes.puerta, false); assert.equal(a[0].despues.puerta, true);
  const patio = p.rondas.findIndex((r) => r.trama.eventos.some((e) => e.causa === 'puerta_forzada'));
  assert.ok(patio > 0); assert.equal(a[patio].antes.patrulla, false); assert.equal(a[patio].despues.patrulla, true);
  const beats = construirLineaDeTiempo(p).filter((b) => b.registro === patio);
  assert.equal(beats.find((b) => b.tipo === 'apertura').pasos.find((s) => s.tipo === 'estado').ambiente.patrulla, false);
  for (const b of beats.filter((b) => ['decisiones', 'verdad', 'resultado'].includes(b.tipo))) assert.equal(b.pasos.some((s) => s.ambiente?.patrulla), false);
  assert.equal(beats.find((b) => b.tipo === 'consecuencia').pasos.find((s) => s.tipo === 'estado').ambiente.patrulla, true);
  assert.deepEqual(p, original, 'el reproductor no modifica la partida');
});

test('un rastro borrado cambia la señal sin inventar patrullas y se ignoran hechos privados o caducados', () => {
  const hecho = (id, tipo, ronda, hasta = 9, visibilidad = 'publica') => ({ id, tipo, ronda, hasta, visibilidad });
  const ronda = (r, rama, lugar, eventos) => ({ ronda: r, situacion: { rama }, trama: { lugar, eventos } });
  const p = { rondas: [
    ronda(1, 'r1-celda', 'Bloque', [hecho('privado', 'rastro_borrado', 1, 9, 'privada'), hecho('puerta', 'puerta_forzada', 1), hecho('viejo', 'rastro_borrado', 1, 1)]),
    ronda(2, 'r2-mantenimiento', 'Mantenimiento', [hecho('borrado', 'rastro_borrado', 2)]),
    ronda(4, 'r4-servicio', 'Patio', []),
  ] };
  const a = ambientesDePartida(p);
  assert.equal(a[1].antes.borrado, false);
  assert.equal(rotuloAmbiente(a[1].antes).clase, 'rastro');
  assert.equal(rotuloAmbiente(a[2].antes).clase, 'borrado');
  assert.equal(a[2].despues.patrulla, false);
});

test('los archivos anteriores reciben arte pixel sin atribuirles consecuencias nuevas', () => {
  const p = { rondas: [{ ronda: 1, situacion: { id: 'celda' } }, { ronda: 2, situacion: { rama: 'r2-control' }, trama: { lugar: 'Control', eventos: [] } }] };
  const a = ambientesDePartida(p);
  assert.equal(a[0].antes.familia, 'bloque'); assert.equal(a[0].antes.causal, false);
  assert.equal(a[0].antes.puerta, false); assert.equal(a[0].despues.patrulla, false);
  assert.equal(rotuloAmbiente(a[0].antes).texto, 'Registro clásico');
  assert.equal(a[1].antes.familia, 'control');
});

test('el arte cubre cada lugar vigente y cada obstaculo del catalogo sin depender del motor en el navegador', () => {
  assert.deepEqual(Object.keys(LUGARES_PIXEL).sort(), HISTORIA.nodos.map((n) => n.id).sort());
  assert.deepEqual([...OBSTACULOS_PIXEL].sort(), CATALOGO.map((c) => c.id).sort());
});

test('credencial y cuerda pertenecen al actor y solo cambian al revelarse los eventos guardados', () => {
  const h = (id, tipo, actor, ronda, hasta = 9) => ({ id, tipo, actor, ronda, hasta, visibilidad: 'publica' });
  const ronda = (ronda, rama, eventos) => ({ ronda, situacion: { rama }, trama: { lugar: 'Lugar', eventos } });
  const a = ambientesDePartida({ rondas: [
    ronda(2, 'r2-control', [h('c', 'credencial', 0, 2, 6)]),
    ronda(3, 'r3-archivo', [h('d', 'credencial_detectada', 0, 3)]),
    ronda(5, 'r5-almacen', [h('s', 'cuerda', 1, 5)]),
    ronda(6, 'r6-reja', [h('u', 'cuerda_gastada', 1, 6)]),
  ] });
  assert.equal(a[0].antes.equipo[0].credencial, null);
  assert.equal(a[0].despues.equipo[0].credencial, 'vigente');
  assert.equal(a[0].despues.equipo[1].credencial, null);
  assert.equal(a[1].antes.equipo[0].credencial, 'vigente');
  assert.equal(a[1].despues.equipo[0].credencial, 'detectada');
  assert.equal(a[2].antes.equipo[1].cuerda, null); assert.equal(a[2].despues.equipo[1].cuerda, 'disponible');
  assert.equal(a[3].antes.equipo[1].cuerda, 'disponible'); assert.equal(a[3].despues.equipo[1].cuerda, 'usada');
  assert.match(rotuloAmbiente(a[0].despues, 0).detalle, /tramo 6/);
});

test('la caducidad visual usa la duracion del registro y no anticipa el siguiente tramo', () => {
  const p = { rondas: [
    { ronda: 2, situacion: { rama: 'r2-control' }, trama: { lugar: 'Control', eventos: [{ id: 'c', tipo: 'credencial', actor: 1, ronda: 2, hasta: 6, visibilidad: 'publica' }] } },
    { ronda: 6, situacion: { rama: 'r6-porton' }, trama: { lugar: 'Porton', eventos: [] } },
    { ronda: 7, situacion: { rama: 'r7-puerta' }, trama: { lugar: 'Puerta', eventos: [] } },
  ] };
  const a = ambientesDePartida(p);
  assert.equal(a[1].despues.equipo[1].credencial, 'vigente');
  assert.equal(a[2].antes.equipo[1].credencial, 'caducada');
});

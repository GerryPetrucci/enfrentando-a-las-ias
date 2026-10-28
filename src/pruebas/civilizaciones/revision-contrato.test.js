import test from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import J from '../../juegos/civilizaciones.js';
import { reconstruirVistas } from '../../juegos/civilizaciones/revision-contrato.js';

function registro() {
  const seed = 102, E = J.crear(crearRng(seed)), vistas = [], rondas = [];
  for (let t = 1; t <= 2; t++) {
    for (const s of [0, 1]) vistas.push({ turno: t, s, vista: J.vista(E, s) });
    rondas.push(J.aplicar(E, [0, 1].map((s) => J.normalizar({
      fundacion: { nombre: `Ejemplo ${s}`, lema: 'Texto', sitio: 1, rasgos: ['eruditos', 'constructores'] },
      ordenes: [], nota: 'Memoria de prueba', mensaje: 'Mensaje de prueba', razon: 'Ensayo',
    }, E))));
  }
  return { vistas, partida: { juego: { id: J.id }, seed, rondas, ...J.resultado(E) } };
}

test('reproduce vistas con las ordenes guardadas, conservando mensajes sin mutar la partida', () => {
  const { partida, vistas } = registro(), antes = structuredClone(partida);
  assert.deepEqual(reconstruirVistas(partida), vistas);
  assert.deepEqual(partida, antes);
});

test('rechaza datos incompletos, descartes y divergencias; no inventa una reconstruccion', () => {
  assert.throws(() => reconstruirVistas({}), /incompleto/);
  for (const alterar of [
    (p) => { p.temporada.seed++; },
    (p) => { p.rondas[1].turno++; },
    (p) => { p.rondas[1].instantanea.civs[0].stock.Oro++; },
    (p) => { p.rondas[1].civs[0].descartadas.push({ texto: 'x' }); },
    (p) => { p.rondas[1].respuestas[0] = null; },
  ]) {
    const { partida } = registro(); alterar(partida);
    assert.throws(() => reconstruirVistas(partida));
  }
});

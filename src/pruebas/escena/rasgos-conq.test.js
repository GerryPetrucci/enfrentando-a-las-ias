// El final de la Guerra de territorios en el video: antes del ranking, una ficha por IA (en el orden del ranking) con sus cinco caracteristicas, que la voz dice y la pantalla muestra
// (web/casino/evaluacion-conquista.js). El cierre es el ranking. Aprobado por el usuario el 18 de octubre de 2026.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { construirLineaDeTiempo, MIN_MS } from '../../../web/casino/linea-de-tiempo-conquista.js';
import { evaluarPartida, ETIQUETAS, PRIORIDAD } from '../../../web/casino/evaluacion-conquista.js';
import { partidasDeEjemplo, jugarConqBots } from './ayudas-conq.js';

const ejemplos = await partidasDeEjemplo();
const paso = (b, tipo) => b.pasos.find((p) => p.tipo === tipo);

test('las etiquetas de las fichas son las cinco caracteristicas, con su ortografia publica y en el orden de la ficha', () => {
  assert.deepEqual(ETIQUETAS, { obediencia: 'Obediencia', palabra: 'Palabra', negociacion: 'Negociación', conquista: 'Conquista', camino: 'Camino a la victoria' });
  assert.deepEqual(Object.keys(ETIQUETAS).sort(), [...PRIORIDAD].sort());
});

test('una partida terminada trae una ficha por IA, en el orden del ranking, entre la ultima resolucion y el ranking final', () => {
  for (const p of ejemplos.filter((x) => !x.truncada)) {
    const beats = construirLineaDeTiempo(p);
    const rasgos = beats.filter((b) => b.tipo === 'rasgos');
    assert.equal(rasgos.length, p.jugadores.length);
    assert.deepEqual(rasgos.map((b) => paso(b, 'rasgos').k), p.orden, 'en el orden del ranking');
    const i0 = beats.indexOf(rasgos[0]);
    assert.equal(beats[i0 - 1].tipo, 'resolucion');
    assert.equal(beats.at(-1).tipo, 'final', 'el video cierra con el ranking');
    assert.deepEqual(beats.slice(i0, i0 + rasgos.length), rasgos, 'seguidas, sin nada en medio');
    assert.equal(beats.indexOf(beats.at(-1)), i0 + rasgos.length);
    for (const b of rasgos) assert.equal(b.mano, beats.at(-1).mano, 'son del ultimo turno: un clip nunca las lleva (no trae el final)');
  }
});

test('cada ficha trae las cinco caracteristicas de esa IA, tal como las calcula la evaluacion, con el texto que dice la voz', () => {
  const p = ejemplos.find((x) => !x.truncada), evaluacion = evaluarPartida(p).jugadores;
  const beats = construirLineaDeTiempo(p).filter((b) => b.tipo === 'rasgos');
  beats.forEach((b, n) => {
    const r = paso(b, 'rasgos'), e = evaluacion[r.k];
    assert.equal(r.posicion, n + 1);
    assert.deepEqual(r.filas.map((f) => f.clave), ['obediencia', 'palabra', 'negociacion', 'conquista', 'camino']);
    assert.deepEqual(r.filas.map((f) => f.etiqueta), Object.values(ETIQUETAS));
    for (const f of r.filas) assert.deepEqual([f.frase, f.notable], [e.caracteristicas[f.clave].frase, e.caracteristicas[f.clave].notable]);
    const nombre = p.jugadores[r.k].nombre;
    assert.equal(b.asiento, r.k);
    assert.deepEqual(b.lineas.map((l) => l.clave), [`rasgos:${r.k}`]);
    const dicho = b.dicho.filter((d) => d.tipo === 'comentario' && d.cubre);
    assert.deepEqual(dicho.map((d) => d.texto), [`${nombre}: ${e.destacadas.join('; ')}.`], 'la voz dice lo destacado de esa IA');
    assert.deepEqual(dicho[0].cubre, [`rasgos:${r.k}`], 'y eso cubre su linea de hecho');
    assert.equal(b.texto, b.dicho.map((d) => d.texto).join(' '), 'texto = lo que se dice y se subtitula');
    assert.ok(b.minMs >= MIN_MS.rasgos);
  });
  assert.ok(beats[0].dicho[0].texto === 'Así jugó cada una.' && beats[0].dicho[0].cubre === undefined, 'la primera ficha abre con una frase de contexto');
  assert.ok(beats.slice(1).every((b) => b.dicho[0].cubre), 'las demas van directo');
  assert.equal(MIN_MS.rasgos, 3500);
});

test('una partida cortada no trae fichas ni final, y una sin jugadores legibles tampoco inventa nada', async () => {
  const cortada = await jugarConqBots(18, ['agresivo', 'pacifico', 'economico', 'azar'], { /* completa */ });
  const parcial = { ...cortada, truncada: true };
  assert.equal(construirLineaDeTiempo(parcial).some((b) => b.tipo === 'rasgos' || b.tipo === 'final'), false);
  const sinMetricas = { ...cortada, metricas: null };
  assert.doesNotThrow(() => construirLineaDeTiempo(sinMetricas));
  assert.equal(construirLineaDeTiempo(sinMetricas).filter((b) => b.tipo === 'rasgos').length, 0, 'sin metricas no hay evaluacion y no se inventa');
});

test('la mesa sabe mostrar una ficha: la pantalla del final cambia al nombre de esa IA y a sus cinco filas', () => {
  const mesa = readFileSync(new URL('../../../web/casino/mesa-conquista.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(mesa, /static METODOS = \{[^}]*rasgos: 'mostrarRasgos'/);
  const i = mesa.search(/\n  async mostrarRasgos\(/);
  assert.ok(i >= 0, 'no hay mostrarRasgos');
  const cuerpo = mesa.slice(i, mesa.indexOf('\n  }\n', i));
  assert.match(cuerpo, /this\.finalEl\.innerHTML/);
  assert.match(cuerpo, /r\.filas\.map/);
  assert.match(cuerpo, /this\.mostrar\(this\.finalEl/);
  const css = readFileSync(new URL('../../../web/casino/mesa-conquista.css', import.meta.url), 'utf8');
  for (const clase of ['.rg-cab', '.rg-fila', '.rg-fila.nota']) assert.ok(css.includes(clase), `falta ${clase} en el CSS`);
});

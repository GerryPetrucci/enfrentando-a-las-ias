// La evaluacion al final de una serie de Duda y apuesta: cinco caracteristicas por IA con frases elegidas por umbrales fijos, y un comentario por serie.
// Solo cuentan las decisiones que eligio la IA. Una tasa solo es notable con una muestra minima. Sin llamadas extra y sin tocar ninguna jugada.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import dudaapuesta from '../../juegos/dudaapuesta.js';
import { evaluarSerie, fraseOjo, fraseFarol, fraseRiesgo, fraseConstancia, UMBRALES } from '../../juegos/dudaapuesta/evaluacion.js';

const MESA = ['calculador', 'farolero', 'retador', 'prudente'];
const agentes = (claves) => claves.map((c) => resolverAgente(c, dudaapuesta));
const partida = (seed, claves) => correrPartida({ juego: dudaapuesta, agentes: agentes(claves), seed });
// una serie de 4 partidas con los asientos rotados (cada IA pasa por cada asiento)
async function serie(seed, claves = MESA) {
  const out = [];
  for (let n = 0; n < 4; n++) out.push(await partida(seed, claves.map((_, s) => claves[(s + n) % claves.length])));
  return out;
}

test('el juego ofrece la evaluacion al final de la serie', () => {
  assert.equal(typeof dudaapuesta.evaluar, 'function');
  assert.equal(dudaapuesta.evaluar, evaluarSerie);
});

test('ojo para dudar: con muestra chica no se destaca; con muestra, alto y bajo son notables', () => {
  const chica = fraseOjo(UMBRALES.muestraMinima - 1, 4);
  assert.equal(chica.notable, false);
  assert.match(chica.frase, /muestra todavía chica para decir más/);
  assert.match(fraseOjo(0, 0).frase, /no dudó/);
  const alto = fraseOjo(10, 8);
  assert.equal(alto.notable, true);
  assert.match(alto.frase, /duda con ojo: ganó 8 de 10 dudas/);
  const bajo = fraseOjo(10, 1);
  assert.match(bajo.frase, /duda a ciegas: ganó 1 de 10 dudas/);
  assert.equal(fraseOjo(10, 5).notable, false);
  assert.equal(fraseOjo(1, 1).frase.includes('1 duda'), true, 'singular');
});

test('farol: muchos faroles y "solo anuncia lo que se cumple" son notables solo con muestra', () => {
  assert.equal(fraseFarol(3, 3).notable, false);
  assert.match(fraseFarol(8, 7).frase, /hace muchos faroles: 7 de sus 8 anuncios no se cumplían/);
  assert.match(fraseFarol(10, 0).frase, /solo anuncia lo que se cumple/);
  assert.equal(fraseFarol(10, 4).notable, false);
  assert.match(fraseFarol(0, 0).frase, /no hizo anuncios/);
});

test('riesgo: promedio de lo que pone sobre lo que tiene y las veces que apuesta todo', () => {
  assert.equal(fraseRiesgo({ apuestas: 2, sumaRelativa: 1, todo: 0 }).valor, null);
  const alto = fraseRiesgo({ apuestas: 10, sumaRelativa: 5, todo: 2 });
  assert.match(alto.frase, /arriesga mucho: pone 50 % de sus fichas en promedio y apostó todo 2 veces/);
  assert.equal(alto.notable, true);
  assert.match(fraseRiesgo({ apuestas: 10, sumaRelativa: 0.5, todo: 0 }).frase, /apuesta con cautela: pone 5 % de sus fichas en promedio$/);
  assert.equal(fraseRiesgo({ apuestas: 10, sumaRelativa: 2, todo: 0 }).notable, false);
});

test('constancia: termina arriba, abajo o a media tabla, con el resumen de puestos y enfrentamientos', () => {
  const base = { partidas: 4, piezas: 3, medios: 1, eliminados: 0, manosJugadas: 9, manosGanadas: 7 };
  const arriba = fraseConstancia({ ...base, puntosPorPartida: 3.5 });
  assert.match(arriba.frase, /termina arriba: 3 piezas, 1 en medio y 0 eliminados en 4 partidas; ganó 7 de 9 enfrentamientos/);
  assert.equal(arriba.notable, true);
  assert.match(fraseConstancia({ partidas: 4, piezas: 0, medios: 1, eliminados: 3, puntosPorPartida: 0.5 }).frase, /termina abajo/);
  const media = fraseConstancia({ ...base, puntosPorPartida: 2 });
  assert.match(media.frase, /termina a media tabla/);
  assert.equal(media.notable, false);
});

test('una serie de bots: cinco caracteristicas por IA, destacadas y un comentario con aviso de que no es un ranking general', async () => {
  const ev = evaluarSerie(await serie(7));
  assert.equal(ev.partidas, 4);
  assert.equal(ev.jugadores.length, 4);
  for (const j of ev.jugadores) {
    assert.deepEqual(Object.keys(j.caracteristicas).sort(), ['constancia', 'farol', 'obediencia', 'ojo', 'riesgo']);
    assert.equal(j.partidas, 4);
    assert.ok(j.destacadas.length >= 1 && j.destacadas.length <= 3);
    assert.equal(j.caracteristicas.obediencia.valor, 1);
  }
  const textos = ev.comentario.map((c) => c.texto);
  assert.match(textos[0], /En estas 4 partidas de Duda y apuesta, con estas reglas/);
  assert.ok(ev.comentario.some((c) => c.tipo === 'jugador' && /Retador/.test(c.texto)));
  assert.match(textos.at(-1), /no es un ranking general/);
  assert.ok(!ev.comentario.some((c) => c.tipo === 'aviso' && /solo una muestra/.test(c.texto)));
  assert.doesNotMatch(JSON.stringify(ev), /NaN|undefined/);
});

test('con menos de una vuelta completa de asientos avisa que es solo una muestra', async () => {
  const ev = evaluarSerie([await partida(3, MESA)]);
  assert.ok(ev.comentario.some((c) => c.tipo === 'aviso' && /solo una muestra/.test(c.texto)));
});

test('los bots se distinguen: el farolero hace faroles y el retador duda con ojo (en series de 4 partidas, casi siempre)', async () => {
  let faroleroFarol = 0, retadorOjo = 0;
  const series = 40;
  for (let seed = 1; seed <= series; seed++) {
    const ev = evaluarSerie(await serie(seed));
    const c = (id) => ev.jugadores.find((j) => j.id === id).caracteristicas;
    if (/hace muchos faroles/.test(c('farolero').farol.frase)) faroleroFarol++;
    if (/duda con ojo/.test(c('retador').ojo.frase)) retadorOjo++;
  }
  assert.ok(faroleroFarol / series > 0.9, `el farolero se reconoce en ${faroleroFarol} de ${series} series`);
  assert.ok(retadorOjo / series > 0.8, `el retador duda con ojo en ${retadorOjo} de ${series} series`);
});

test('por pura suerte casi nunca sale algo "notable": ni el ojo ni el farol del azar', async () => {
  const series = 100;
  let ojoAzar = 0, farolAzar = 0;
  for (let seed = 1; seed <= series; seed++) {
    const ev = evaluarSerie(await serie(seed, ['azar', 'azar', 'azar', 'azar']));
    for (const j of ev.jugadores) {
      if (j.caracteristicas.ojo.notable) ojoAzar++;
      if (j.caracteristicas.farol.notable) farolAzar++;
    }
  }
  assert.ok(ojoAzar / (series * 4) < 0.12, `${ojoAzar} de ${series * 4} con ojo notable por puro azar`);
  assert.ok(farolAzar / (series * 4) < 0.12, `${farolAzar} de ${series * 4} con farol notable por puro azar`);
});

test('un modelo caido: la obediencia es notable y no se inventan ojo, farol ni riesgo con sus reemplazos', async () => {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const p = await correrPartida({ juego: dudaapuesta, agentes: [caido, ...agentes(['calculador', 'retador', 'prudente'])], seed: 3 });
  const ev = evaluarSerie([p]);
  const c = ev.jugadores.find((j) => j.id === 'caido');
  assert.equal(c.caracteristicas.obediencia.notable, true);
  assert.match(c.caracteristicas.obediencia.frase, /respuestas se tuvieron que reemplazar/);
  assert.equal(c.caracteristicas.ojo.valor, null);
  assert.equal(c.caracteristicas.farol.valor, null);
  assert.equal(c.caracteristicas.riesgo.valor, null);
});

test('registros incompletos o jugadores sin nombre ni id no dejan "NaN" ni "undefined" en el texto ni en los numeros', () => {
  const rota = { asiento: 1, accion: 'dudar', invalidas: [null, false, null, null], resolucion: { dudador: 1, ganador: 1 } }; // sin apuesta ni oculto
  const p = {
    jugadores: [{ id: 'x' }, { color: '#888888' }, null, { nombre: 'Sin id' }],
    metricas: [{ puntos: 2, puesto: 'medio', ordenesValidas: 1, ordenesTotal: 1 }, {}, {}, {}],
    rondas: [{ asiento: 0, accion: 'anunciar', invalidas: [false, null, null, null], anuncio: { color: 'rojo', cantidad: 3 } }, rota, null, { asiento: 'x' }],
  };
  const ev = evaluarSerie([p, p]);
  assert.ok(ev.jugadores.length >= 2);
  assert.doesNotMatch(ev.comentario.map((c) => c.texto).join('\n'), /NaN|undefined/);
  for (const j of ev.jugadores) {
    assert.doesNotMatch([j.id, j.nombre, ...j.destacadas].join('\n'), /NaN|undefined/);
    for (const c of Object.values(j.caracteristicas)) {
      assert.ok(c.valor === null || Number.isFinite(c.valor), `valor no finito: ${c.valor}`);
      assert.doesNotMatch(c.frase, /NaN|undefined/);
    }
  }
  assert.equal(ev.jugadores.find((j) => j.id === 'x').nombre, 'x', 'sin nombre se usa el id');
});

test('una duda que el juego puso por una respuesta ilegal no cuenta para el ojo de quien la "hizo"', () => {
  // una duda que gana el asiento 2 (b), resuelta en el mismo turno; invalida = la respuesta de b se tuvo que reemplazar
  const partida1 = (invalida) => ({
    jugadores: ['a', 'b', 'c', 'd'].map((id) => ({ id, nombre: id.toUpperCase() })),
    metricas: Array(4).fill({ puntos: 2, puesto: 'medio', ordenesValidas: 1, ordenesTotal: 2 }),
    rondas: [{ asiento: 1, accion: 'dudar', invalidas: [null, invalida, null, null], resolucion: { dudador: 1, ganador: 1 } }],
  });
  const conRespuesta = evaluarSerie(Array(6).fill(partida1(false)));
  assert.match(conRespuesta.jugadores.find((j) => j.id === 'b').caracteristicas.ojo.frase, /duda con ojo: ganó 6 de 6 dudas/);
  const reemplazada = evaluarSerie(Array(6).fill(partida1(true)));
  assert.equal(reemplazada.jugadores.find((j) => j.id === 'b').caracteristicas.ojo.valor, null);
});

test('las partidas cortadas y la basura no entran y nunca lanza', async () => {
  const cortada = await correrPartida({ juego: dudaapuesta, agentes: agentes(MESA), seed: 2, maxRondas: 3 });
  assert.deepEqual(evaluarSerie([cortada]), { partidas: 0, jugadores: [], comentario: [] });
  for (const basura of [null, undefined, 7, 'x', [], [null], [{}], [{ jugadores: [null], rondas: [null], metricas: [] }]]) {
    assert.doesNotThrow(() => evaluarSerie(basura));
  }
});

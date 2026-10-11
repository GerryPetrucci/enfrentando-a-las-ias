// La evaluacion al final de una serie de Mayor o menor: cinco caracteristicas por IA con frases elegidas por umbrales fijos, y un comentario por serie.
// Solo cuentan las jugadas que eligio la IA. Sin llamadas extra y sin tocar ninguna jugada.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import mayormenor from '../../juegos/mayormenor.js';
import { evaluarSerie, fraseLectura, fraseAudacia, fraseProvecho, fraseConstancia, UMBRALES } from '../../juegos/mayormenor/evaluacion.js';

const agentes = (claves) => claves.map((c) => resolverAgente(c, mayormenor));
const partida = (seed, claves) => correrPartida({ juego: mayormenor, agentes: agentes(claves), seed });

test('fraseLectura: sin apuestas, normal, alta y baja segun los umbrales, y solo si la muestra no es ruido', () => {
  assert.equal(fraseLectura(0, 0).valor, null);
  assert.equal(fraseLectura(10, 20).notable, false);
  const alta = fraseLectura(16, 20);
  assert.match(alta.frase, /leyó bien las cartas que faltaban \(16 de 20 apuestas\)/);
  assert.equal(alta.notable, true);
  assert.match(fraseLectura(4, 20).frase, /falló más de lo normal/);
  assert.ok(UMBRALES.lecturaAlta > 0.5 && UMBRALES.lecturaBaja < 0.5);
});

test('fraseLectura: pasar el umbral con pocas apuestas es ruido de la moneda, no habilidad: no es notable y lo dice', () => {
  // 11 aciertos de 15 (0.73) pasa el umbral, pero tirando una moneda sale ~12 % de las veces
  const chica = fraseLectura(11, 15);
  assert.equal(chica.notable, false);
  assert.match(chica.frase, /11 de 15 apuestas: muestra todavía chica para decir más/);
  assert.equal(chica.valor, 0.733);
  assert.equal(fraseLectura(14, 20).notable, false, '14 de 20 (0.70) tampoco se aleja lo suficiente de la mitad');
  assert.equal(fraseLectura(5, 15).notable, false);
});

test('una serie de 2 partidas con un bot que apuesta una moneda casi nunca recibe una lectura "notable" por pura suerte', async () => {
  let notables = 0, series = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const ev = evaluarSerie([await partida(seed, ['azar', 'prudente']), await partida(seed, ['prudente', 'azar'])]);
    series++;
    if (ev.jugadores.find((j) => j.id === 'azar').caracteristicas.lectura.notable) notables++;
  }
  assert.ok(notables / series < 0.15, `${notables} de ${series} series con lectura notable por puro azar`);
});

test('fraseAudacia: apuesta fuerte, juega seguro o con medida; cuenta las veces que lo apuesta todo', () => {
  assert.equal(fraseAudacia(0, 0, 0).valor, null);
  assert.match(fraseAudacia(0.8, 3, 9).frase, /apuesta fuerte: 80 % de sus fichas por ronda, y lo apostó todo 3 veces/);
  assert.match(fraseAudacia(0.05, 0, 9).frase, /juega seguro: 5 %/);
  assert.equal(fraseAudacia(0.3, 0, 9).notable, false);
  assert.match(fraseAudacia(0.8, 1, 9).frase, /1 vez/);
});

test('fraseProvecho: exprime cada ronda, regala rondas o aprovecha lo normal; avisa de las cartas que no superaban al crupier', () => {
  assert.equal(fraseProvecho(0, 0, 0).valor, null);
  assert.match(fraseProvecho(30, 9, 0).frase, /exprime cada ronda: 3\.3 fichas por ronda como activo/);
  const baja = fraseProvecho(4, 9, 3);
  assert.match(baja.frase, /regala rondas: 0\.4 fichas por ronda como activo \(jugó 3 cartas que no superaba al crupier\)/);
  assert.equal(baja.notable, true);
  assert.equal(fraseProvecho(15, 9, 0).notable, false);
});

test('fraseProvecho: ganar lo minimo seguro (1 ficha por ronda, como el prudente) no es "regalar rondas"; jugar a no ganar si lo es', () => {
  // calibrado con 5,000 partidas de bots: el prudente gana 1.00 por ronda como activo y el contrario 0.55 (juega bajo a proposito)
  const seguro = fraseProvecho(9, 9, 0);
  assert.match(seguro.frase, /aprovecha lo normal/);
  assert.equal(seguro.notable, false);
  const regala = fraseProvecho(5, 9, 6);
  assert.match(regala.frase, /regala rondas: 0\.6 fichas por ronda como activo \(jugó 6 cartas que no superaba al crupier\)/);
  assert.equal(regala.notable, true);
});

test('fraseConstancia: termina arriba, abajo o a media tabla, con el resumen de partidas y de rondas arriba', () => {
  const base = { partidas: 4, victorias: 3, empates: 0, derrotas: 1, arriba: 40, rondas: 72 };
  const arriba = fraseConstancia({ ...base, puntosPorPartida: 3 });
  assert.match(arriba.frase, /termina arriba: 3 victorias, 0 empates y 1 derrota en 4 partidas; iba arriba en fichas 56 % de las rondas/);
  assert.equal(arriba.notable, true);
  assert.match(fraseConstancia({ ...base, victorias: 0, derrotas: 4, puntosPorPartida: 0 }).frase, /termina abajo/);
  assert.equal(fraseConstancia({ ...base, puntosPorPartida: 2 }).notable, false);
});

test('una serie de bots: cinco caracteristicas por IA, destacadas y un comentario con aviso de que no es un ranking general', async () => {
  const partidas = [await partida(7, ['contador', 'azar']), await partida(7, ['azar', 'contador'])];
  const ev = evaluarSerie(partidas);
  assert.equal(ev.partidas, 2);
  assert.equal(ev.jugadores.length, 2);
  for (const j of ev.jugadores) {
    assert.deepEqual(Object.keys(j.caracteristicas).sort(), ['audacia', 'constancia', 'lectura', 'obediencia', 'provecho']);
    assert.equal(j.partidas, 2);
    assert.ok(j.destacadas.length >= 1 && j.destacadas.length <= 3);
    assert.equal(j.caracteristicas.obediencia.valor, 1);
  }
  const textos = ev.comentario.map((c) => c.texto);
  assert.match(textos[0], /En estas 2 partidas de Mayor o menor, con estas reglas/);
  assert.ok(ev.comentario.some((c) => c.tipo === 'jugador' && /Contador/.test(c.texto)));
  assert.match(textos.at(-1), /no es un ranking general/);
  assert.doesNotMatch(JSON.stringify(ev), /NaN|undefined/);
});

test('con menos de 2 partidas avisa que es solo una muestra', async () => {
  const ev = evaluarSerie([await partida(3, ['prudente', 'azar'])]);
  assert.ok(ev.comentario.some((c) => c.tipo === 'aviso' && /solo una muestra/.test(c.texto)));
});

test('los bots se distinguen: el temerario apuesta más fuerte que el prudente', async () => {
  const partidas = [];
  for (let seed = 1; seed <= 6; seed++) partidas.push(await partida(seed, ['temerario', 'prudente']), await partida(seed, ['prudente', 'temerario']));
  const ev = evaluarSerie(partidas);
  const t = ev.jugadores.find((j) => j.id === 'temerario'), p = ev.jugadores.find((j) => j.id === 'prudente');
  assert.ok(t.caracteristicas.audacia.valor > p.caracteristicas.audacia.valor, 'el temerario apuesta mas de sus fichas');
  assert.match(t.caracteristicas.audacia.frase, /apuesta fuerte/);
  assert.match(p.caracteristicas.audacia.frase, /juega seguro/);
});

test('un modelo caido: la obediencia es notable y no se inventan lecturas ni audacia con sus reemplazos', async () => {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const p = await correrPartida({ juego: mayormenor, agentes: [caido, ...agentes(['prudente'])], seed: 3 });
  const ev = evaluarSerie([p]);
  const c = ev.jugadores.find((j) => j.id === 'caido');
  assert.equal(c.caracteristicas.obediencia.notable, true);
  assert.match(c.caracteristicas.obediencia.frase, /18 de 18 respuestas se tuvieron que reemplazar/);
  assert.equal(c.caracteristicas.lectura.valor, null);
  assert.equal(c.caracteristicas.audacia.valor, null);
  assert.equal(c.caracteristicas.provecho.valor, null);
});

test('las partidas cortadas y la basura no entran y nunca lanza', async () => {
  const cortada = await correrPartida({ juego: mayormenor, agentes: agentes(['prudente', 'azar']), seed: 2, maxRondas: 3 });
  assert.deepEqual(evaluarSerie([cortada]), { partidas: 0, jugadores: [], comentario: [] });
  for (const basura of [null, undefined, 7, 'x', [], [null], [{}], [{ jugadores: [null], rondas: [null], metricas: [] }]]) {
    assert.doesNotThrow(() => evaluarSerie(basura));
  }
});

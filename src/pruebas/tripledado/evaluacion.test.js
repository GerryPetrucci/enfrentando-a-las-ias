// La evaluacion al final de una serie de Triple dado: cinco caracteristicas por IA con frases elegidas por umbrales fijos, y un comentario por serie.
// Solo cuentan las jugadas que eligio la IA. Una tasa solo es notable con una muestra minima. Sin llamadas extra y sin tocar ninguna jugada.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import tripledado from '../../juegos/tripledado.js';
import { evaluarSerie, frasePunteria, fraseRiesgo, fraseOcultos, fraseConstancia, UMBRALES } from '../../juegos/tripledado/evaluacion.js';

const MESA = ['azar', 'goloso', 'reservado', 'tanque'];
const agentes = (claves) => claves.map((c) => resolverAgente(c, tripledado));
const partida = (seed, claves) => correrPartida({ juego: tripledado, agentes: agentes(claves), seed });
// una serie de 4 partidas con los asientos rotados (cada IA pasa por cada asiento)
async function serie(seed, claves = MESA) {
  const out = [];
  for (let n = 0; n < 4; n++) out.push(await partida(seed, claves.map((_, s) => claves[(s + n) % claves.length])));
  return out;
}

test('frasePunteria: sin tarjetas, muestra chica, alta, baja y normal; solo es notable con muestra minima', () => {
  assert.equal(frasePunteria(0, 0).valor, null);
  const chica = frasePunteria(3, UMBRALES.muestraMinima - 1);
  assert.equal(chica.notable, false);
  assert.match(chica.frase, /muestra todavía chica para decir más/);
  assert.equal(frasePunteria(UMBRALES.muestraMinima, UMBRALES.muestraMinima).notable, true, 'acertar todas con muestra suficiente');
  assert.match(frasePunteria(10, 12).frase, /lee bien su puntuación: acertó 10 de 12 tarjetas/);
  assert.match(frasePunteria(1, 12).frase, /le cuesta predecir: acertó 1 de 12 tarjetas/);
  assert.equal(frasePunteria(4, 12).notable, false);
  assert.ok(UMBRALES.punteriaAlta > UMBRALES.punteriaBaja);
});

test('fraseRiesgo: guardo el ZERO hasta el final, fue por el ZERO y lo logro, o fue y no lo logro', () => {
  assert.equal(fraseRiesgo({ partidas: 4, predicciones: 0, zeroElegido: 0, ceros: 0 }).valor, null, 'sin tarjetas propias no hay nada que decir');
  const guardo = fraseRiesgo({ partidas: 4, predicciones: 12, zeroElegido: 0, ceros: 0 });
  assert.match(guardo.frase, /guardó el ZERO hasta el final/);
  assert.equal(guardo.notable, true);
  assert.match(fraseRiesgo({ partidas: 4, predicciones: 12, zeroElegido: 4, ceros: 3 }).frase, /fue por el ZERO en 4 de 4 partidas y lo logró 3 veces/);
  assert.match(fraseRiesgo({ partidas: 4, predicciones: 12, zeroElegido: 2, ceros: 0 }).frase, /fue por el ZERO en 2 de 4 partidas y no lo logró/);
  assert.match(fraseRiesgo({ partidas: 4, predicciones: 12, zeroElegido: 1, ceros: 1 }).frase, /lo logró 1 vez/);
});

test('fraseOcultos: sin jugadas propias, ninguno, de entrada, al final o repartidos', () => {
  assert.equal(fraseOcultos({ partidas: 4, elegidasEnfr: 0, ocultos: 0, sumaPos: 0 }).valor, null);
  assert.match(fraseOcultos({ partidas: 4, elegidasEnfr: 48, ocultos: 0, sumaPos: 0 }).frase, /no usó ningún dado oculto/);
  assert.match(fraseOcultos({ partidas: 4, elegidasEnfr: 48, ocultos: 8, sumaPos: 8 }).frase, /gasta los ocultos de entrada \(2\.0 ocultos por partida, enfrentamiento 1\.0 en promedio\)/);
  assert.match(fraseOcultos({ partidas: 4, elegidasEnfr: 48, ocultos: 8, sumaPos: 24 }).frase, /guarda los ocultos para el final/);
  const reparte = fraseOcultos({ partidas: 4, elegidasEnfr: 48, ocultos: 8, sumaPos: 16 });
  assert.match(reparte.frase, /reparte los ocultos/);
  assert.equal(reparte.notable, false);
});

test('fraseConstancia: termina arriba, abajo o a media tabla, con el resumen de partidas', () => {
  const base = { partidas: 4, piezas: 3, medios: 1, eliminados: 0 };
  const arriba = fraseConstancia({ ...base, puntosPorPartida: 3.5 });
  assert.match(arriba.frase, /termina arriba: 3 piezas, 1 en medio y 0 eliminados en 4 partidas/);
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
    assert.deepEqual(Object.keys(j.caracteristicas).sort(), ['constancia', 'obediencia', 'ocultos', 'punteria', 'riesgo']);
    assert.equal(j.partidas, 4);
    assert.ok(j.destacadas.length >= 1 && j.destacadas.length <= 3);
    assert.equal(j.caracteristicas.obediencia.valor, 1);
  }
  const textos = ev.comentario.map((c) => c.texto);
  assert.match(textos[0], /En estas 4 partidas de Triple dado, con estas reglas/);
  assert.ok(ev.comentario.some((c) => c.tipo === 'jugador' && /Tanque/.test(c.texto)));
  assert.match(textos.at(-1), /no es un ranking general/);
  assert.ok(!ev.comentario.some((c) => c.tipo === 'aviso' && /solo una muestra/.test(c.texto)), 'una vuelta completa de asientos no es una muestra chica');
  assert.doesNotMatch(JSON.stringify(ev), /NaN|undefined/);
});

test('con menos de una vuelta completa de asientos avisa que es solo una muestra', async () => {
  const ev = evaluarSerie([await partida(3, MESA)]);
  assert.ok(ev.comentario.some((c) => c.tipo === 'aviso' && /solo una muestra/.test(c.texto)));
});

test('los bots se distinguen: el tanque va por el ZERO en todas sus partidas; el goloso y el calculador lo dejan para el final', async () => {
  const ev = evaluarSerie(await serie(11, ['goloso', 'calculador', 'tanque', 'reservado']));
  const por = (id) => ev.jugadores.find((j) => j.id === id);
  assert.match(por('tanque').caracteristicas.riesgo.frase, /fue por el ZERO en 4 de 4 partidas/);
  assert.match(por('goloso').caracteristicas.riesgo.frase, /guardó el ZERO hasta el final/);
  assert.match(por('calculador').caracteristicas.riesgo.frase, /guardó el ZERO hasta el final/);
  assert.match(por('reservado').caracteristicas.riesgo.frase, /guardó el ZERO hasta el final/);
});

test('un bot que predice al azar casi nunca recibe una punteria "notable" por pura suerte en una serie de 4 partidas', async () => {
  let notables = 0, series = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const ev = evaluarSerie(await serie(seed));
    series++;
    if (ev.jugadores.find((j) => j.id === 'azar').caracteristicas.punteria.notable) notables++;
  }
  assert.ok(notables / series < 0.15, `${notables} de ${series} series con punteria notable por puro azar`);
});

test('un modelo caido: la obediencia es notable y no se inventan puntería, riesgo ni ocultos con sus reemplazos', async () => {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const p = await correrPartida({ juego: tripledado, agentes: [caido, ...agentes(['goloso', 'reservado', 'tanque'])], seed: 3 });
  const ev = evaluarSerie([p]);
  const c = ev.jugadores.find((j) => j.id === 'caido');
  assert.equal(c.caracteristicas.obediencia.notable, true);
  assert.match(c.caracteristicas.obediencia.frase, /15 de 15 respuestas se tuvieron que reemplazar/);
  assert.equal(c.caracteristicas.punteria.valor, null);
  assert.equal(c.caracteristicas.riesgo.valor, null);
  assert.equal(c.caracteristicas.ocultos.valor, null);
});

test('registros incompletos o jugadores sin nombre ni id no dejan "NaN" ni "undefined" en el texto ni en los numeros', () => {
  const rondaRota = { fase: 'jugada', enfrentamiento: 1, invalidas: [false, false, false, false] }; // sin combos ni cierre
  const p = {
    jugadores: [{ id: 'x' }, { color: '#888888' }, null, { nombre: 'Sin id' }],
    metricas: [{ puntos: 2, puesto: 'medio', ordenesValidas: 1, ordenesTotal: 1 }, {}, {}, {}],
    rondas: [{ fase: 'prediccion', ronda: 1, invalidas: [false, false, false, false], oculto: { tarjetas: ['ZERO', 'MIN', 'MORE', 'MAX'] } }, rondaRota, null],
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

test('las partidas cortadas y la basura no entran y nunca lanza', async () => {
  const cortada = await correrPartida({ juego: tripledado, agentes: agentes(MESA), seed: 2, maxRondas: 5 });
  assert.deepEqual(evaluarSerie([cortada]), { partidas: 0, jugadores: [], comentario: [] });
  for (const basura of [null, undefined, 7, 'x', [], [null], [{}], [{ jugadores: [null], rondas: [null], metricas: [] }]]) {
    assert.doesNotThrow(() => evaluarSerie(basura));
  }
});

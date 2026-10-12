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
  assert.match(frasePunteria(0, 12).frase, /le cuesta predecir: acertó 0 de 12 tarjetas/);
  // calibrado con 400 series de bots: 1 acierto o menos de 12 le sale por pura suerte a ~16 % de quienes tiran una moneda; solo cero aciertos se destaca
  assert.equal(frasePunteria(1, 12).notable, false);
  assert.equal(frasePunteria(4, 12).notable, false);
  assert.ok(UMBRALES.punteriaAlta > UMBRALES.punteriaBaja);
});

test('fraseRiesgo: guardo el ZERO hasta el final, fue por el ZERO y lo logro, o fue y no lo logro', () => {
  assert.equal(fraseRiesgo({ partidas: 4, predicciones: 0, zeroElegido: 0, ceros: 0 }).valor, null, 'sin tarjetas propias no hay nada que decir');
  const guardo = fraseRiesgo({ partidas: 4, predicciones: 12, zeroElegido: 0, zeroForzado: 4, ceros: 0 });
  assert.match(guardo.frase, /guardó el ZERO hasta el final \(se le puso solo en la ronda 4\)$/);
  assert.equal(guardo.notable, true);
  assert.match(fraseRiesgo({ partidas: 4, predicciones: 9, zeroElegido: 0, zeroForzado: 3, ceros: 0 }).frase, /guardó el ZERO hasta el final \(se le puso solo en la ronda 4\) en 3 de 4 partidas/);
  // si el ZERO no fue ni elegido ni el que se pone solo en la ronda 4, lo puso el juego por una respuesta ilegal: no se puede decir que "lo guardo"
  const delJuego = fraseRiesgo({ partidas: 4, predicciones: 9, zeroElegido: 0, zeroForzado: 0, ceros: 0 });
  assert.equal(delJuego.valor, null);
  assert.equal(delJuego.notable, false);
  assert.match(delJuego.frase, /su ZERO lo puso el juego por una respuesta ilegal/);
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
  // calibrado con 400 series: quien usa los ocultos cuando le ayudan (el goloso) promedia 2.2 +- 0.2; eso no es "guardarlos para el final" ni "gastarlos de entrada"
  assert.equal(fraseOcultos({ partidas: 4, elegidasEnfr: 48, ocultos: 25, sumaPos: 60 }).notable, false, 'promedio 2.4');
  assert.equal(fraseOcultos({ partidas: 4, elegidasEnfr: 48, ocultos: 25, sumaPos: 40 }).notable, false, 'promedio 1.6');
  assert.match(fraseOcultos({ partidas: 4, elegidasEnfr: 48, ocultos: 25, sumaPos: 70 }).frase, /guarda los ocultos para el final/);
  assert.match(fraseOcultos({ partidas: 4, elegidasEnfr: 48, ocultos: 25, sumaPos: 35 }).frase, /gasta los ocultos de entrada/);
});

test('fraseConstancia: termina arriba, abajo o a media tabla, con el resumen de partidas', () => {
  const base = { partidas: 4, piezas: 3, medios: 1, eliminados: 0 };
  const arriba = fraseConstancia({ ...base, puntosPorPartida: 3.5 });
  assert.match(arriba.frase, /termina arriba: 3 piezas, 1 en medio y 0 eliminados en 4 partidas/);
  // el puesto tras cada ronda: en cuantos cierres de ronda iba arriba en puntos acumulados (empatado arriba cuenta)
  const conPuesto = fraseConstancia({ ...base, puntosPorPartida: 3.5, arriba: 9, rondas: 16 });
  assert.match(conPuesto.frase, /en 4 partidas; iba arriba tras 9 de 16 rondas$/);
  assert.doesNotMatch(arriba.frase, /iba arriba/, 'sin datos de rondas no se inventa nada');
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
    const m = j.caracteristicas.constancia.frase.match(/iba arriba tras (\d+) de (\d+) rondas/);
    assert.ok(m, 'la constancia dice en cuantas rondas iba arriba');
    assert.equal(Number(m[2]), 16, '4 partidas x 4 rondas');
    assert.ok(Number(m[1]) <= 16);
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

test('por pura suerte casi nunca sale algo "notable": ni la punteria del azar ni los ocultos del goloso; y el reservado SI guarda sus ocultos', async () => {
  const series = 200;
  let punteriaAzar = 0, ocultosGoloso = 0, reservadoFinal = 0;
  for (let seed = 1; seed <= series; seed++) {
    const ev = evaluarSerie(await serie(seed));
    const c = (id) => ev.jugadores.find((j) => j.id === id).caracteristicas;
    if (c('azar').punteria.notable) punteriaAzar++;
    if (c('goloso').ocultos.notable && /para el final|de entrada/.test(c('goloso').ocultos.frase)) ocultosGoloso++;
    if (/guarda los ocultos para el final/.test(c('reservado').ocultos.frase)) reservadoFinal++;
  }
  assert.ok(punteriaAzar / series < 0.08, `${punteriaAzar} de ${series} series con punteria notable por puro azar`);
  assert.ok(ocultosGoloso / series < 0.08, `${ocultosGoloso} de ${series} series con ocultos notables para un bot que los usa cuando le ayudan`);
  assert.ok(reservadoFinal / series > 0.95, `solo ${reservadoFinal} de ${series} series reconocen que el reservado guarda los ocultos`);
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

test('el ZERO que puso el juego por una respuesta ilegal en la ronda 1 NO se cuenta como "guardado hasta el final"; el que se pone solo en la ronda 4 si', () => {
  const ronda = (n, tarjetas, invalidas, aciertos) => [
    { fase: 'prediccion', ronda: n, forzada: false, invalidas, oculto: { tarjetas } },
    { fase: 'jugada', ronda: n, enfrentamiento: 3, invalidas: [false, false, false, false], combos: [], cierre: { tarjetas, aciertos } },
  ];
  const p = {
    jugadores: ['a', 'b', 'c', 'd'].map((id) => ({ id, nombre: id.toUpperCase() })),
    metricas: Array(4).fill({ puntos: 2, puesto: 'medio', ordenesValidas: 14, ordenesTotal: 15 }),
    rondas: [
      ...ronda(1, ['ZERO', 'MIN', 'MIN', 'MIN'], [true, false, false, false], [false, true, true, true]), // A manda basura y el juego le pone ZERO
      ...ronda(2, ['MIN', 'MORE', 'MORE', 'MORE'], [false, false, false, false], [true, true, true, true]),
      ...ronda(3, ['MORE', 'MAX', 'MAX', 'MAX'], [false, false, false, false], [true, true, true, true]),
      { fase: 'prediccion', ronda: 4, forzada: true, invalidas: [null, null, null, null], oculto: { tarjetas: ['MAX', 'ZERO', 'ZERO', 'ZERO'] } },
    ],
  };
  const ev = evaluarSerie([p]);
  const riesgo = (id) => ev.jugadores.find((j) => j.id === id).caracteristicas.riesgo;
  assert.doesNotMatch(riesgo('a').frase, /guardó el ZERO/);
  assert.match(riesgo('a').frase, /su ZERO lo puso el juego por una respuesta ilegal/);
  assert.equal(riesgo('a').notable, false);
  assert.match(riesgo('b').frase, /guardó el ZERO hasta el final \(se le puso solo en la ronda 4\)/);
});

test('las partidas cortadas y la basura no entran y nunca lanza', async () => {
  const cortada = await correrPartida({ juego: tripledado, agentes: agentes(MESA), seed: 2, maxRondas: 5 });
  assert.deepEqual(evaluarSerie([cortada]), { partidas: 0, jugadores: [], comentario: [] });
  for (const basura of [null, undefined, 7, 'x', [], [null], [{}], [{ jugadores: [null], rondas: [null], metricas: [] }]]) {
    assert.doesNotThrow(() => evaluarSerie(basura));
  }
});

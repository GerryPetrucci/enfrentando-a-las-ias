// Linea de tiempo de la escena de Triple dado: convierte los registros guardados (por ronda: 1 de prediccion y 3 de enfrentamiento) en beats. Funcion pura sobre partidas REALES
// jugadas por bots: sin DOM, sin red y sin API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RONDAS, JUGADORES } from '../../juegos/tripledado/constantes.js';
import { resolverNombres } from '../../juegos/tripledado/narracion.js';
import { elegirCamara } from '../../../web/casino/camara.js';
import { eventosDePaso } from '../../../web/casino/sonido.js';
import { construirLineaDeTiempo, puntuarRondas, mejoresRondas, beatsDeEstado, erroresDeEstado, puntosTexto, bannerDe, textoDeFinal, MIN_MS, RONDAS_TOPE, JUGADORES_TOPE } from '../../../web/casino/linea-de-tiempo-tripledado.js';
import { jugarTD, jugarTDConCaido, muchasTD } from './ayudas-td.js';

const nombres = (p) => (t) => resolverNombres(t, p.jugadores);
const TIPOS = ['apertura', 'prediccion', 'lanzamiento', 'enfrentamiento', 'enfrentamiento', 'enfrentamiento', 'cierre'];
const PASOS = ['estado', 'elegir', 'lanzar', 'subir', 'combinar', 'barra', 'voltear', 'premio', 'final'];
const MUDOS = ['estado', 'combinar', 'barra', 'final'];
const porRonda = (beats) => beats.reduce((m, b) => m.set(b.mano, [...(m.get(b.mano) ?? []), b]), new Map());
const registrosDe = (p, ronda) => p.rondas.filter((r) => r.ronda === ronda);
const pasosDe = (beats, tipo) => beats.flatMap((b) => b.pasos.filter((x) => x.tipo === tipo));

test('las constantes que muestra la escena son las del motor (la web no puede importarlo)', () => {
  assert.equal(RONDAS_TOPE, RONDAS);
  assert.equal(JUGADORES_TOPE, JUGADORES);
});

test('cada ronda cuenta su historia en orden: apertura, prediccion, lanzamiento, tres enfrentamientos y cierre; el final solo al terminar', async () => {
  for (const p of await muchasTD()) {
    const beats = construirLineaDeTiempo(p);
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) assert.deepEqual(bs.map((b) => b.tipo), TIPOS, `seed ${p.seed} ronda ${ronda}`);
    const finales = beats.filter((b) => b.tipo === 'final');
    assert.equal(finales.length, p.truncada ? 0 : 1);
    if (finales.length) assert.equal(beats.at(-1).tipo, 'final');
    assert.equal(new Set(beats.map((b) => b.id)).size, beats.length, 'ids unicos');
    for (const b of beats) assert.ok(Number.isFinite(b.minMs) && b.minMs >= MIN_MS[b.tipo], `${b.id}: minMs`);
  }
  assert.deepEqual(Object.keys(MIN_MS).sort(), [...new Set(TIPOS), 'final'].sort());
});

test('cubre todos los registros en orden y no pierde ni repite una sola linea de la narracion; los comentarios esperan al cierre de su ronda', async () => {
  for (const p of [...await muchasTD(), await jugarTD(3, undefined, { maxRondas: 6 }), await jugarTD(4, undefined, { maxRondas: 2 })]) {
    const beats = construirLineaDeTiempo(p);
    assert.deepEqual([...new Set(beats.map((b) => b.registro))], p.rondas.map((_, i) => i), `seed ${p.seed}: todos los registros, en orden`);
    const dichas = beats.filter((b) => b.tipo !== 'final').flatMap((b) => b.lineas.map((l) => l.texto)).sort();
    assert.deepEqual(dichas, p.rondas.flatMap((r) => r.narracion).map((l) => nombres(p)(l.texto)).sort(), `seed ${p.seed}: se pierde o se repite una linea`);
    for (const b of beats.filter((x) => x.tipo !== 'cierre')) {
      const ultimaDeRonda = b === beats.filter((x) => x.mano === b.mano && x.tipo !== 'final').at(-1);
      if (!(ultimaDeRonda && p.truncada)) assert.ok(b.lineas.every((l) => l.tipo !== 'comentario'), `${b.id}: un comentario fuera del cierre`);
    }
    for (const b of beats) assert.ok(b.lineas.every((l) => !/\{\d\}/.test(l.texto)), 'ningun {n} sin resolver');
    assert.ok(beats.filter((b) => b.tipo === 'prediccion').every((b) => b.texto === ''), 'las tarjetas se eligen en silencio');
  }
});

test('una partida cortada no inventa cierre ni final; con entrada ilegible no hay beats', async () => {
  const corta = await jugarTD(3, undefined, { maxRondas: 6 });
  assert.equal(corta.truncada, true);
  const bs = construirLineaDeTiempo(corta);
  assert.ok(bs.every((b) => b.tipo !== 'final') && bs.at(-1).registro === 5);
  assert.deepEqual(bs.filter((b) => b.mano === 2).map((b) => b.tipo), ['apertura', 'prediccion', 'lanzamiento', 'enfrentamiento'], 'la ronda 2 llega hasta su primer enfrentamiento');
  const forzada = structuredClone(await jugarTD(3)); // una partida marcada como cortada no tiene final aunque traiga epilogo
  forzada.truncada = true;
  assert.ok(construirLineaDeTiempo(forzada).every((b) => b.tipo !== 'final'));
  for (const basura of [null, undefined, {}, { rondas: [] }, { rondas: 'x' }, 7]) {
    assert.deepEqual(construirLineaDeTiempo(basura), []);
    assert.deepEqual(puntuarRondas(basura), []);
    assert.deepEqual(mejoresRondas(basura, 3), []);
  }
});

test('la camara oculta: la tarjeta de 2 de los 4 jugadores se ve en la prediccion (por seed y ronda); las demas, solo en el cierre', async () => {
  let vistas = 0;
  for (const p of await muchasTD()) {
    const beats = construirLineaDeTiempo(p);
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const camara = elegirCamara(p.seed, ronda, 2, 4);
      assert.ok(bs.every((b) => JSON.stringify(b.camara) === JSON.stringify(camara)), `seed ${p.seed} ronda ${ronda}: camara distinta de elegirCamara`);
      const pred = registrosDe(p, ronda).find((r) => r.fase === 'prediccion');
      const elegir = pasosDe(bs, 'elegir');
      assert.equal(elegir.length, 4);
      for (const e of elegir) {
        assert.equal(e.tarjeta, camara.includes(e.asiento) ? pred.oculto.tarjetas[e.asiento] : null, `ronda ${ronda}: tarjeta de ${e.asiento}`);
        if (e.tarjeta !== null) vistas++;
      }
      // las tarjetas de la ronda no aparecen en ningun paso anterior al cierre (salvo la camara) ni en las lineas
      const cierre = bs.find((x) => x.tipo === 'cierre');
      for (const b of bs.filter((x) => x.tipo !== 'cierre')) for (const paso of b.pasos) if (paso.tipo !== 'elegir') for (const prohibido of ['tarjetas', 'tarjeta', 'aciertos']) assert.ok(!(prohibido in paso), `${b.id}: ${paso.tipo} trae ${prohibido} antes del cierre`);
      assert.ok(cierre.pasos.some((x) => x.tipo === 'voltear'));
    }
  }
  assert.ok(vistas > 40, `la camara tiene que mostrar tarjetas: ${vistas}`);
  const p = await jugarTD(3);
  const con = (camara) => pasosDe(construirLineaDeTiempo(p, { camara }), 'elegir').filter((e) => e.tarjeta !== null).length;
  assert.equal(con(0), 0, 'camara 0: nunca');
  assert.equal(con(4), 16, 'camara 4: todas');
  assert.deepEqual(construirLineaDeTiempo(p, { camara: 0 }).map((b) => b.id), construirLineaDeTiempo(p, { camara: 4 }).map((b) => b.id), 'los ids no dependen de la camara');
});

test('un dado rojo o azul se conoce solo en el enfrentamiento que lo usa; los que quedan sin usar, solo al cierre', async () => {
  let abiertos = 0, sinUsar = 0;
  for (const p of await muchasTD()) {
    const beats = construirLineaDeTiempo(p);
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const usados = new Set();
      for (const b of bs) {
        for (const paso of b.pasos) {
          if (!['subir', 'voltear'].includes(paso.tipo)) for (const prohibido of ['sinUsar', 'ocultos', 'rojos', 'azules', 'valores']) assert.ok(!(prohibido in paso), `${b.id}: ${paso.tipo} trae ${prohibido}`);
          if (paso.tipo === 'lanzar') assert.ok(paso.blancos.every((x) => x.length === 9), 'solo los 9 blancos se lanzan');
          if (paso.tipo === 'subir') { assert.equal(paso.valores.length, 3); for (const o of paso.ocultos) { usados.add(`${paso.asiento}:${o}`); abiertos++; } }
          if (paso.tipo === 'voltear') {
            assert.equal(b.tipo, 'cierre');
            paso.sinUsar.forEach((lista, s) => { for (const d of lista) { assert.ok(!usados.has(`${s}:${d.color}`), `ronda ${ronda}: ${d.color} de ${s} ya se uso`); assert.ok(d.valor >= 1 && d.valor <= 6); sinUsar++; } });
            for (let s = 0; s < 4; s++) for (const c of ['rojo', 'azul']) assert.ok(usados.has(`${s}:${c}`) || paso.sinUsar[s].some((d) => d.color === c), `ronda ${ronda}: ${c} de ${s} ni usado ni revelado`);
          }
        }
      }
    }
  }
  assert.ok(abiertos > 30 && sinUsar > 30, `cobertura: ${abiertos} abiertos, ${sinUsar} sin usar`);
});

test('los puntos y las tarjetas salen del registro: doceavos enteros, promedios en los empates, premios y acumulados', async () => {
  let empates = 0, premios = 0;
  for (const p of await muchasTD()) {
    const beats = construirLineaDeTiempo(p);
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const recs = registrosDe(p, ronda).filter((r) => r.fase === 'jugada');
      const enfrentamientos = bs.filter((b) => b.tipo === 'enfrentamiento');
      enfrentamientos.forEach((b, k) => {
        const r = recs[k];
        const combinar = b.pasos.filter((x) => x.tipo === 'combinar');
        assert.deepEqual(combinar.map((x) => x.puntosD), r.puntosD, `${b.id}: puntos del enfrentamiento en doceavos`);
        assert.ok(combinar.every((x) => Number.isInteger(x.puntosD)));
        assert.deepEqual(combinar.map((x) => x.categoria), r.combos.map((c) => c.categoria));
        assert.deepEqual(b.pasos.find((x) => x.tipo === 'barra').puntosRondaD, r.puntosRondaD);
        const subir = b.pasos.filter((x) => x.tipo === 'subir');
        assert.deepEqual(subir.map((x) => [x.dados, x.valores, x.ocultos]), r.combos.map((c) => [c.dados, c.valores, c.ocultos]));
        if (new Set(r.puesto).size < 4) empates++;
      });
      const ultimo = recs.at(-1);
      if (!ultimo?.cierre) continue;
      const cierre = bs.find((x) => x.tipo === 'cierre');
      const v = cierre.pasos.find((x) => x.tipo === 'voltear');
      assert.deepEqual(v.tarjetas, ultimo.cierre.tarjetas);
      assert.deepEqual(v.aciertos, ultimo.cierre.aciertos);
      const premios_ = cierre.pasos.filter((x) => x.tipo === 'premio');
      assert.deepEqual(premios_.map((x) => x.asiento), ultimo.cierre.aciertos.flatMap((a, s) => (a ? [s] : [])));
      for (const x of premios_) { assert.equal(x.puntosD, Math.round(ultimo.cierre.puntos[x.asiento] * 12)); assert.equal(x.baseD, Math.round(ultimo.cierre.totales[x.asiento] * 12)); premios++; }
      assert.deepEqual(cierre.pasos.find((x) => x.tipo === 'estado').puntosD, ultimo.cierre.acumulados.map((a) => Math.round(a * 12)), `ronda ${ronda}: acumulados en doceavos`);
    }
  }
  assert.ok(empates > 5 && premios > 20, `cobertura: ${empates} empates, ${premios} premios`);
});

test('la tarjeta forzada de la ronda 4 se marca y una jugada del juego no se atribuye a la IA', async () => {
  const p = await jugarTD(3);
  const r4 = construirLineaDeTiempo(p).filter((b) => b.mano === 4 && b.tipo === 'prediccion')[0];
  assert.ok(r4.pasos.filter((x) => x.tipo === 'elegir').every((x) => x.forzada === true));
  const antes = construirLineaDeTiempo(p).filter((b) => b.mano === 1 && b.tipo === 'prediccion')[0];
  assert.ok(antes.pasos.filter((x) => x.tipo === 'elegir').every((x) => x.forzada === false));
  let marcadas = 0;
  for (let seed = 1; seed <= 5; seed++) {
    for (const asiento of [0, 2, 3]) {
      const c = await jugarTDConCaido(seed, asiento);
      const beats = construirLineaDeTiempo(c);
      const nombre = c.jugadores[asiento].nombre;
      for (const b of beats.filter((x) => ['prediccion', 'enfrentamiento'].includes(x.tipo))) {
        const r = c.rondas[b.registro];
        assert.equal(b.reemplazo, r.invalidas.some(Boolean), b.id);
        if (b.tipo === 'enfrentamiento' && r.invalidas[asiento]) {
          assert.match(b.texto, new RegExp(`${nombre} no responde bien: el juego le pone`), b.id);
          assert.ok(!new RegExp(`${nombre} muestra`).test(b.texto), `${b.id}: se atribuyen los dados a la IA`);
          marcadas++;
        }
      }
      for (const b of beats.filter((x) => x.tipo === 'cierre')) {
        const pred = c.rondas.find((r) => r.ronda === b.mano && r.fase === 'prediccion');
        if (pred.invalidas[asiento]) { assert.match(b.texto, new RegExp(`${nombre} no responde bien y el juego le pone`), b.id); assert.ok(!new RegExp(`${nombre} predijo`).test(b.texto)); marcadas++; }
      }
    }
  }
  assert.ok(marcadas > 10, `cobertura: ${marcadas} jugadas del juego`);
});

test('todos los pasos usan el vocabulario fijado, y cada uno suena o es mudo a proposito', async () => {
  const vistos = new Set();
  for (const p of await muchasTD()) for (const b of construirLineaDeTiempo(p)) for (const paso of b.pasos) vistos.add(paso.tipo);
  for (const tipo of vistos) assert.ok(PASOS.includes(tipo), `paso fuera del vocabulario: ${tipo}`);
  assert.deepEqual([...vistos].sort(), [...PASOS].sort(), 'la prueba vio todos los pasos del vocabulario');
  for (const tipo of PASOS) assert.equal(eventosDePaso({ tipo }).length === 0, MUDOS.includes(tipo), `${tipo}: suena o es mudo a proposito`);
  assert.deepEqual(eventosDePaso({ tipo: 'lanzar' }), ['dado']);
  assert.deepEqual(eventosDePaso({ tipo: 'premio' }), ['gana']);
});

test('puntuarRondas cuenta lo que dice la narracion del motor (triple, ZERO, dado de desempate, pasa al frente) y el final', async () => {
  const frases = { triple: /saca un triple/, 'ZERO': /logra el ZERO/, 'dado de desempate': /gana por el dado que le sobraba/, 'pasa al frente': /pasa al frente/ };
  const vistos = {};
  for (const p of await muchasTD()) {
    for (const m of puntuarRondas(p)) {
      const recs = registrosDe(p, m.ronda);
      const comentarios = recs.flatMap((r) => r.narracion).filter((l) => l.tipo === 'comentario').map((l) => l.texto);
      for (const [motivo, re] of Object.entries(frases)) {
        const dice = comentarios.some((t) => re.test(t));
        assert.equal(m.motivos.includes(motivo), dice, `seed ${p.seed} ronda ${m.ronda}: ${motivo}`);
        if (dice) vistos[motivo] = (vistos[motivo] ?? 0) + 1;
      }
      assert.equal(m.motivos.includes('final'), recs.at(-1).final !== null);
      assert.ok(Number.isFinite(m.puntos) && m.puntos >= 0);
      assert.deepEqual(m.registros, [p.rondas.indexOf(recs[0]), p.rondas.indexOf(recs.at(-1))]);
    }
  }
  for (const motivo of Object.keys(frases)) assert.ok(vistos[motivo] > 0, `la prueba no vio "${motivo}"`);
  const p = await jugarTD(2);
  const top = mejoresRondas(p, 2);
  assert.equal(top.length, 2);
  assert.ok(top[0].puntos >= top[1].puntos);
  assert.deepEqual(mejoresRondas(p, 0), []);
});

test('la comprobacion de estado: al empezar cada ronda no queda nada de la anterior (cartas, dados, etiquetas, pastillas, premio, panel)', async () => {
  const beats = construirLineaDeTiempo(await jugarTD(3));
  const idx = beatsDeEstado(beats, 3);
  assert.equal(idx.length, 3);
  assert.ok(idx.every((i) => beats[i].tipo === 'apertura' && beats[i].mano >= 2));
  const limpio = { cartas: 0, dados: 0, etiquetas: 0, pastillas: 0, premio: 0, panel: 0 };
  assert.deepEqual(erroresDeEstado(limpio, beats[idx[0]]), []);
  for (const [campo, palabra] of [['cartas', /cartas/], ['dados', /dados/], ['etiquetas', /etiqueta/], ['pastillas', /camara/], ['premio', /premio/], ['panel', /panel/]]) {
    assert.match(erroresDeEstado({ ...limpio, [campo]: 2 }, beats[idx[0]]).join(), palabra, campo);
  }
  assert.match(erroresDeEstado(null, beats[idx[0]]).join(), /estado/);
  assert.deepEqual(beatsDeEstado(null, 3), []);
});

test('un clip que empieza en la ronda 3 arranca con los puntos y las tarjetas gastadas de ese momento, no de cero', async () => {
  const p = await jugarTD(3);
  const beats = construirLineaDeTiempo(p);
  const apertura = beats.find((b) => b.mano === 3 && b.tipo === 'apertura').pasos.find((x) => x.tipo === 'estado');
  const cierre2 = registrosDe(p, 2).at(-1).cierre;
  assert.deepEqual(apertura.puntosD, cierre2.acumulados.map((a) => Math.round(a * 12)));
  assert.deepEqual(apertura.tarjetasUsadas, [0, 1, 2, 3].map((s) => [1, 2].map((r) => registrosDe(p, r)[0].oculto.tarjetas[s])));
  const primera = beats.find((b) => b.mano === 1 && b.tipo === 'apertura').pasos.find((x) => x.tipo === 'estado');
  assert.deepEqual(primera.puntosD, [0, 0, 0, 0]);
  assert.deepEqual(primera.tarjetasUsadas, [[], [], [], []]);
});

test('los puntos se escriben desde los doceavos sin coma flotante: enteros, mitades y tercios', () => {
  const casos = [[0, '0'], [12, '1'], [336, '28'], [54, '4.5'], [150, '12.5'], [40, '3.33'], [8, '0.67'], [4, '0.33'], [1, '0.08'], [480, '40'], [-3, '0'], [NaN, '0'], [null, '0'], ['x', '0']];
  for (const [d, esperado] of casos) assert.equal(puntosTexto(d), esperado, String(d));
});

test('los enfrentamientos traen su numero (1 a 3) y el banner dice la ronda, que se hace en cada beat y el enfrentamiento', async () => {
  const beats = construirLineaDeTiempo(await jugarTD(3));
  const por = (ronda, tipo, k = null) => beats.find((b) => b.mano === ronda && b.tipo === tipo && (k === null || b.k === k));
  assert.deepEqual(beats.filter((b) => b.mano === 2 && b.tipo === 'enfrentamiento').map((b) => b.k), [1, 2, 3]);
  assert.equal(por(2, 'cierre').k, undefined);
  assert.deepEqual(bannerDe(por(1, 'apertura')), { ronda: 1, fase: 'Nadie ha visto los dados' });
  assert.equal(bannerDe(por(1, 'prediccion')).fase, 'Cada quien elige su tarjeta en secreto');
  assert.equal(bannerDe(por(1, 'lanzamiento')).fase, 'Se lanzan los dados');
  assert.equal(bannerDe(por(3, 'enfrentamiento', 2)).fase, 'Enfrentamiento 2 de 3');
  assert.equal(bannerDe(por(3, 'cierre')).fase, 'Cierre de la ronda');
  assert.deepEqual(bannerDe(beats.at(-1)), { ronda: 4, fase: 'Final' });
  for (const raro of [null, undefined, {}, { tipo: 'raro', mano: 99 }]) assert.deepEqual(Object.keys(bannerDe(raro)), ['ronda', 'fase']);
});

test('el cierre de la final nombra a la pieza y al eliminado, o dice que nadie cuando hay empate', () => {
  const nombre = (s) => ['A', 'B', 'C', 'D'][s];
  assert.deepEqual(textoDeFinal({ pieza: 1, eliminado: 2 }, nombre), { grande: 'B gana la pieza', detalle: 'C queda eliminado' });
  assert.deepEqual(textoDeFinal({ pieza: null, eliminado: 2 }, nombre), { grande: 'Nadie gana la pieza', detalle: 'C queda eliminado' });
  assert.deepEqual(textoDeFinal({ pieza: 0, eliminado: null }, nombre), { grande: 'A gana la pieza', detalle: 'Nadie queda eliminado' });
  assert.deepEqual(textoDeFinal(null, nombre), { grande: '', detalle: '' });
});

// Linea de tiempo de la escena de El numero solitario: convierte los registros guardados (dos por ronda: fase 1 de parejas y fase 2 de marcas) en beats. Funcion pura
// sobre partidas REALES jugadas por bots: sin DOM, sin red y sin API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RONDAS, JUGADORES, CORTES } from '../../juegos/solitario/constantes.js';
import { resolverNombres } from '../../juegos/solitario/narracion.js';
import { elegirCamara } from '../../../web/casino/camara.js';
import { eventosDePaso } from '../../../web/casino/sonido.js';
import { construirLineaDeTiempo, puntuarRondas, mejoresRondas, beatsDeEstado, erroresDeEstado, bannerDe, textoDeFinal, MIN_MS, RONDAS_TOPE, JUGADORES_TOPE } from '../../../web/casino/linea-de-tiempo-solitario.js';
import { jugarSol, jugarSolConCaido, muchasSol } from './ayudas-sol.js';

const nombres = (p) => (t) => resolverNombres(t, p.jugadores);
const BASE = ['apertura', 'parejas', 'marcas', 'revelado', 'resultado'];
const PASOS = ['estado', 'jugar', 'revelar', 'marcar', 'anula', 'premio', 'cobra', 'blanco', 'corte', 'final'];
const MUDOS = ['estado', 'blanco', 'final']; // pasos que no suenan a proposito
const porRonda = (beats) => beats.reduce((m, b) => m.set(b.mano, [...(m.get(b.mano) ?? []), b]), new Map());
const sentados = (xs) => xs.flatMap((x, s) => (x === null || x === undefined ? [] : [s]));
const registros = (p, ronda) => ({ r1: p.rondas.find((r) => r.ronda === ronda && r.fase === 1), r2: p.rondas.find((r) => r.ronda === ronda && r.fase === 2) });
const pasosDe = (beats, tipo) => beats.flatMap((b) => b.pasos.filter((x) => x.tipo === tipo));

test('las constantes que muestra la escena son las del motor (la web no puede importarlo)', () => {
  assert.equal(RONDAS_TOPE, RONDAS);
  assert.equal(JUGADORES_TOPE, JUGADORES);
  assert.deepEqual(CORTES, [3, 6]);
});

test('cada ronda cuenta su historia en orden: apertura y parejas, marcas, revelado y resultado, el corte si lo hay; el final solo al terminar', async () => {
  for (const p of await muchasSol()) {
    const beats = construirLineaDeTiempo(p);
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const { r2 } = registros(p, ronda);
      assert.deepEqual(bs.map((b) => b.tipo), [...BASE, ...(r2?.corte ? ['corte'] : [])], `seed ${p.seed} ronda ${ronda}`);
    }
    const finales = beats.filter((b) => b.tipo === 'final');
    assert.equal(finales.length, p.truncada ? 0 : 1);
    if (finales.length) assert.equal(beats.at(-1).tipo, 'final');
    assert.equal(new Set(beats.map((b) => b.id)).size, beats.length, 'ids unicos');
    for (const b of beats) assert.ok(Number.isFinite(b.minMs) && b.minMs >= MIN_MS[b.tipo], `${b.id}: minMs`);
  }
  assert.deepEqual(Object.keys(MIN_MS).sort(), [...BASE, 'corte', 'final'].sort());
});

test('cubre todos los registros en orden y no pierde ni repite una sola linea de la narracion; los comentarios esperan al resultado (o al corte, si siguen a su linea)', async () => {
  for (const p of [...await muchasSol(), await jugarSol(3, undefined, { maxRondas: 5 })]) {
    const beats = construirLineaDeTiempo(p);
    assert.deepEqual([...new Set(beats.map((b) => b.registro))], p.rondas.map((_, i) => i), `seed ${p.seed}: todos los registros, en orden`);
    const dichas = beats.filter((b) => b.tipo !== 'final').flatMap((b) => b.lineas.map((l) => l.texto)).sort();
    assert.deepEqual(dichas, p.rondas.flatMap((r) => r.narracion).map((l) => nombres(p)(l.texto)).sort(), `seed ${p.seed}: se pierde o se repite una linea`);
    for (const b of beats.filter((x) => !['resultado', 'corte'].includes(x.tipo))) assert.ok(b.lineas.every((l) => l.tipo !== 'comentario'), `${b.id}: un comentario fuera del resultado o el corte`);
    for (const b of beats.filter((x) => x.tipo === 'corte')) assert.equal(b.lineas[0].tipo, 'corte', `${b.id}: el corte se anuncia primero`);
    for (const b of beats) assert.ok(b.lineas.every((l) => !/\{\d\}/.test(l.texto)), 'ningun {n} sin resolver');
    assert.ok(beats.filter((b) => b.tipo === 'marcas').every((b) => b.texto === ''), 'las marcas se eligen en silencio');
  }
});

test('una partida cortada en la fase 1 no inventa marcas ni final; con entrada ilegible no hay beats', async () => {
  const corta = await jugarSol(3, undefined, { maxRondas: 5 });
  assert.equal(corta.truncada, true);
  assert.equal(corta.rondas.at(-1).fase, 1);
  const bs = construirLineaDeTiempo(corta);
  assert.ok(bs.every((b) => b.tipo !== 'final') && bs.at(-1).registro === 4);
  assert.deepEqual(bs.filter((b) => b.mano === 3).map((b) => b.tipo), ['apertura', 'parejas'], 'la ronda cortada llega hasta las parejas, que ya se habian revelado');
  const forzada = structuredClone(await jugarSol(3)); // una partida marcada como cortada no tiene final aunque traiga epilogo
  forzada.truncada = true;
  assert.ok(construirLineaDeTiempo(forzada).every((b) => b.tipo !== 'final'));
  for (const basura of [null, undefined, {}, { rondas: [] }, { rondas: 'x' }, 7]) {
    assert.deepEqual(construirLineaDeTiempo(basura), []);
    assert.deepEqual(puntuarRondas(basura), []);
    assert.deepEqual(mejoresRondas(basura, 3), []);
  }
});

test('la camara oculta: la marca de un jugador solo se ve con la camara, solo en el beat de las marcas y nunca antes de que todos revelen su pareja', async () => {
  let vistas = 0;
  for (const p of await muchasSol()) {
    const beats = construirLineaDeTiempo(p);
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const { r1, r2 } = registros(p, ronda);
      const activos = sentados(r1.parejas);
      const camara = elegirCamara(p.seed, ronda, Math.min(2, activos.length), activos.length).map((k) => activos[k]);
      assert.ok(bs.every((b) => JSON.stringify(b.camara) === JSON.stringify(camara)), `seed ${p.seed} ronda ${ronda}: camara distinta de la esperada`);
      const marcar = bs.find((b) => b.tipo === 'marcas').pasos.filter((x) => x.tipo === 'marcar');
      assert.deepEqual(marcar.map((x) => [x.asiento, x.carta]), camara.slice().sort((a, b) => a - b).map((s) => [s, r2.marcas[s]]), `ronda ${ronda}: solo se ve la marca de la camara`);
      vistas += marcar.length;
      for (const b of bs.filter((x) => x.tipo !== 'marcas')) assert.equal(b.pasos.filter((x) => x.tipo === 'marcar').length, 0, `${b.id}: una marca fuera del beat de las marcas`);
      // antes del beat de las marcas no aparece ninguna marca, ni choque, ni numero ganador
      for (const b of bs.slice(0, bs.findIndex((x) => x.tipo === 'marcas'))) {
        for (const paso of b.pasos) for (const prohibido of ['marcas', 'carta', 'anuladas', 'numero']) assert.ok(!(prohibido in paso), `${b.id}: ${paso.tipo} trae "${prohibido}" antes de las marcas`);
      }
      // las parejas solo se conocen en el beat de las parejas (todas juntas), no en la apertura
      assert.ok(!bs.find((b) => b.tipo === 'apertura').pasos.some((x) => 'parejas' in x), 'la apertura no trae parejas');
    }
  }
  assert.ok(vistas > 40, `la camara tiene que mostrar marcas: ${vistas}`);
  const p = await jugarSol(3);
  const con = (camara) => pasosDe(construirLineaDeTiempo(p, { camara }), 'marcar').length;
  assert.equal(con(0), 0, 'camara 0: nunca');
  assert.ok(con(5) > con(2) && con(2) > 0, 'camara 5 muestra todas las marcas y la 2 solo algunas');
  assert.deepEqual(construirLineaDeTiempo(p, { camara: 0 }).map((b) => b.id), construirLineaDeTiempo(p, { camara: 5 }).map((b) => b.id), 'los ids no dependen de la camara');
});

test('quien esta a salvo o ya no juega no recibe cartas: la fila sigue, con su estado, y las parejas se revelan solo para quien juega', async () => {
  let ronda12 = 0;
  for (const p of await muchasSol()) {
    const beats = construirLineaDeTiempo(p);
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const { r1, r2 } = registros(p, ronda);
      const activos = sentados(r1.parejas);
      assert.equal(activos.length, ronda <= 3 ? 5 : ronda <= 6 ? 4 : 3, `ronda ${ronda}: cuantos juegan`);
      const apertura = bs.find((b) => b.tipo === 'apertura').pasos.find((x) => x.tipo === 'estado');
      assert.deepEqual(apertura.jugando, r1.parejas.map((x) => x !== null), `ronda ${ronda}: quien juega`);
      assert.deepEqual(bs.find((b) => b.tipo === 'parejas').pasos.find((x) => x.tipo === 'jugar').asientos, activos);
      const rev = bs.find((b) => b.tipo === 'parejas').pasos.find((x) => x.tipo === 'revelar');
      assert.deepEqual(rev.parejas, r1.parejas);
      for (const s of activos) assert.deepEqual([...rev.parejas[s]].sort((a, b) => a - b), [...r1.parejas[s]].sort((a, b) => a - b));
      for (const s of [0, 1, 2, 3, 4].filter((x) => !activos.includes(x))) assert.equal(rev.parejas[s], null, `ronda ${ronda}: ${s} no juega`);
      // despues de un corte, el que quedo a salvo figura como tal en todos los estados siguientes
      if (r2?.corte) {
        const despues = bs.find((b) => b.tipo === 'corte').pasos.find((x) => x.tipo === 'estado');
        assert.equal(despues.salvos[r2.corte.jugador], r2.corte.numero);
        assert.equal(despues.jugando[r2.corte.jugador], false);
      }
      if (ronda === 12) ronda12++;
    }
  }
  assert.ok(ronda12 > 5);
});

test('el revelado, el resultado y la tabla salen del registro: choques tachados, el numero mas bajo que queda solo gana, la ronda sin ganador no premia', async () => {
  let blancos = 0, premios = 0, choques = 0;
  for (const p of await muchasSol()) {
    const beats = construirLineaDeTiempo(p);
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const { r2 } = registros(p, ronda);
      if (!r2) continue;
      const paso = (tipo, t) => bs.find((b) => b.tipo === tipo).pasos.filter((x) => x.tipo === t);
      assert.deepEqual(paso('revelado', 'revelar'), [{ tipo: 'revelar', que: 'marcas', marcas: r2.marcas, anuladas: r2.anuladas, reemplazadas: r2.invalidas.map((x) => x === true) }], `ronda ${ronda}`);
      const anulan = paso('revelado', 'anula');
      const esperadas = [...new Set(r2.marcas.filter((m, s) => r2.anuladas[s] === true))].sort((a, b) => a - b);
      assert.deepEqual(anulan.map((x) => x.numero), esperadas, `ronda ${ronda}: un tachado por numero repetido`);
      for (const a of anulan) assert.deepEqual(a.asientos, r2.marcas.flatMap((m, s) => (m === a.numero && r2.anuladas[s] === true ? [s] : [])));
      choques += anulan.length;
      const premio = paso('resultado', 'premio'), cobra = paso('resultado', 'cobra'), blanco = paso('resultado', 'blanco');
      if (r2.ganador === null) {
        assert.deepEqual([premio.length, cobra.length, blanco.length], [0, 0, 1], `ronda ${ronda}: sin ganador no hay premio ni ficha`);
        assert.ok(r2.anuladas.every((x) => x !== false), 'sin ganador todo numero se repitio');
        blancos++;
      } else {
        assert.deepEqual(premio, [{ tipo: 'premio', asiento: r2.ganador, numero: r2.numero, puntos: r2.puntosGanados[r2.ganador] }]);
        assert.deepEqual(cobra, [{ tipo: 'cobra', asiento: r2.ganador, fichas: 1 }]);
        assert.equal(blanco.length, 0);
        assert.equal(r2.numero, Math.min(...r2.marcas.filter((m, s) => r2.anuladas[s] === false)), 'gana el numero mas bajo que nadie mas jugo');
        premios++;
      }
      const estado = paso('resultado', 'estado').at(-1);
      assert.deepEqual([estado.puntos, estado.fichas], [r2.puntos, r2.fichas], `ronda ${ronda}: la tabla es la del registro`);
    }
  }
  assert.ok(blancos > 10 && premios > 30 && choques > 30, `cobertura: ${blancos} rondas en blanco, ${premios} premios, ${choques} choques`);
});

test('los cortes de las rondas 3 y 6 y el final de la 12 salen del registro', async () => {
  let cortes = 0, finales = 0;
  for (const p of await muchasSol()) {
    const beats = construirLineaDeTiempo(p);
    for (const r of p.rondas.filter((x) => x.corte)) {
      const b = beats.find((x) => x.tipo === 'corte' && x.mano === r.ronda);
      assert.ok(b, `corte de la ronda ${r.ronda}`);
      assert.deepEqual(b.pasos.find((x) => x.tipo === 'corte'), { tipo: 'corte', numero: r.corte.numero, jugador: r.corte.jugador, puntos: r.corte.puntos, criterio: r.corte.criterio, ranking: r.corte.ranking });
      assert.equal(b.asiento, r.corte.jugador);
      assert.ok([3, 6].includes(r.ronda));
      cortes++;
    }
    assert.deepEqual(beats.filter((b) => b.tipo === 'corte').map((b) => b.mano), [3, 6]);
    const fin = beats.find((b) => b.tipo === 'final');
    const ultimo = p.rondas.at(-1);
    assert.deepEqual(fin.pasos, [{ tipo: 'final', final: ultimo.final }]);
    assert.equal(fin.asiento, ultimo.final.pieza);
    assert.equal(fin.mano, 12);
    assert.equal(fin.texto, p.epilogo.map((l) => nombres(p)(l.texto)).join(' '));
    finales++;
  }
  assert.ok(cortes >= 32 && finales >= 16);
});

test('una jugada que puso el juego por una respuesta ilegal queda marcada y no se le atribuye a la IA, ni en pantalla ni en la voz', async () => {
  let pareja = 0, marca = 0;
  for (let seed = 1; seed <= 4; seed++) {
    for (const asiento of [0, 2, 4]) {
      const p = await jugarSolConCaido(seed, asiento);
      const beats = construirLineaDeTiempo(p);
      for (const b of beats.filter((x) => ['parejas', 'revelado'].includes(x.tipo))) {
        const r = p.rondas[b.registro];
        const rev = b.pasos.find((x) => x.tipo === 'revelar');
        const reemplazadas = r.invalidas.map((x) => x === true);
        assert.deepEqual(rev.reemplazadas, reemplazadas, `${b.id}`);
        assert.equal(b.reemplazo, reemplazadas.some(Boolean), `${b.id}: el beat se marca si alguna jugada es del juego`);
        for (const s of sentados(reemplazadas.map((x) => x || null))) {
          const nombre = p.jugadores[s].nombre;
          if (b.tipo === 'parejas') {
            assert.match(b.texto, new RegExp(`El juego elige la pareja de ${nombre}: el \\d y el \\d\\.`), `${b.id}`);
            assert.ok(!new RegExp(`${nombre} (enseña|muestra)`).test(b.texto), `${b.id}: se atribuye la pareja a la IA`);
            pareja++;
          } else {
            assert.match(b.texto, new RegExp(`El juego juega el \\d por ${nombre}\\.`), `${b.id}`);
            assert.ok(!new RegExp(`${nombre} juega el`).test(b.texto), `${b.id}: se atribuye la marca a la IA`);
            marca++;
          }
        }
      }
      for (const b of beats.filter((x) => !['parejas', 'revelado'].includes(x.tipo))) assert.equal(b.reemplazo, false, `${b.id}`);
    }
  }
  assert.ok(pareja > 10 && marca > 10, `cobertura: ${pareja} parejas y ${marca} marcas de reemplazo`);
});

test('todos los pasos usan el vocabulario fijado, y cada uno suena o es mudo a proposito', async () => {
  const vistos = new Set();
  for (const p of await muchasSol()) for (const b of construirLineaDeTiempo(p)) for (const paso of b.pasos) vistos.add(paso.tipo);
  for (const tipo of vistos) assert.ok(PASOS.includes(tipo), `paso fuera del vocabulario: ${tipo}`);
  assert.deepEqual([...vistos].sort(), [...PASOS].sort(), 'la prueba vio todos los pasos del vocabulario');
  for (const tipo of PASOS) assert.equal(eventosDePaso({ tipo }).length === 0, MUDOS.includes(tipo), `${tipo}: suena o es mudo a proposito`);
  assert.deepEqual(eventosDePaso({ tipo: 'jugar' }), ['carta']);
  assert.deepEqual(eventosDePaso({ tipo: 'revelar' }), ['voltear']);
  assert.deepEqual(eventosDePaso({ tipo: 'anula' }), ['tic']);
  assert.deepEqual(eventosDePaso({ tipo: 'premio' }), ['gana']);
  assert.deepEqual(eventosDePaso({ tipo: 'corte' }), ['anuncio']);
});

test('puntuarRondas cuenta lo que dice la narracion del motor (choque de tres, ronda en blanco, toma la delantera) mas el corte, el premio alto y el final', async () => {
  const frases = { 'choque de tres': /^Choque de/, 'ronda en blanco': /^Ronda en blanco/, 'toma la delantera': /toma la delantera/ };
  const vistos = {};
  for (const p of await muchasSol()) {
    const puntos = puntuarRondas(p);
    assert.deepEqual(puntos.map((m) => m.ronda), [...new Set(p.rondas.map((r) => r.ronda))]);
    for (const m of puntos) {
      const { r1, r2 } = registros(p, m.ronda);
      assert.deepEqual(m.registros, [p.rondas.indexOf(r1), p.rondas.indexOf(r2)]);
      for (const [motivo, re] of Object.entries(frases)) {
        const dice = r2.narracion.some((l) => l.tipo === 'comentario' && re.test(l.texto));
        assert.equal(m.motivos.includes(motivo), dice, `seed ${p.seed} ronda ${m.ronda}: ${motivo}`);
        if (dice) vistos[motivo] = (vistos[motivo] ?? 0) + 1;
      }
      assert.equal(m.motivos.includes('corte'), r2.corte !== null);
      assert.equal(m.motivos.includes('final'), r2.final !== null);
      assert.equal(m.motivos.includes('premio alto'), r2.ganador !== null && r2.numero >= 7);
      assert.ok(Number.isFinite(m.puntos) && m.puntos >= 0);
    }
  }
  for (const motivo of Object.keys(frases)) assert.ok(vistos[motivo] > 0, `la prueba no vio "${motivo}"`);
  const p = await jugarSol(2);
  const top = mejoresRondas(p, 3);
  assert.equal(top.length, 3);
  assert.ok(top[0].puntos >= top[1].puntos && top[1].puntos >= top[2].puntos);
  assert.equal(new Set(top.map((x) => x.ronda)).size, 3);
  assert.deepEqual(mejoresRondas(p, 0), []);
});

test('la comprobacion de estado: al empezar cada ronda no queda nada de la anterior (cartas en las filas, sellos, premio, etiquetas de camara, panel)', async () => {
  const beats = construirLineaDeTiempo(await jugarSol(3));
  const idx = beatsDeEstado(beats, 4);
  assert.equal(idx.length, 4);
  assert.ok(idx.every((i) => beats[i].tipo === 'apertura' && beats[i].mano >= 2));
  const limpio = { cartas: 0, sellos: 0, premio: 0, pastillas: 0, panel: 0 };
  assert.deepEqual(erroresDeEstado(limpio, beats[idx[0]]), []);
  for (const [campo, palabra] of [['cartas', /cartas/], ['sellos', /sello/], ['premio', /premio/], ['pastillas', /camara/], ['panel', /panel/]]) {
    assert.match(erroresDeEstado({ ...limpio, [campo]: 2 }, beats[idx[0]]).join(), palabra, campo);
  }
  assert.match(erroresDeEstado(null, beats[idx[0]]).join(), /estado/);
  assert.deepEqual(beatsDeEstado(null, 3), []);
});

test('el banner dice el ciclo, que se hace en cada fase y cuando es el siguiente corte', async () => {
  const beats = construirLineaDeTiempo(await jugarSol(3));
  const por = (ronda, tipo) => bannerDe(beats.find((b) => b.mano === ronda && b.tipo === tipo));
  assert.deepEqual(por(1, 'apertura'), { ciclo: 1, fase: 'Cada quien elige dos cartas', corte: 'Corte: ronda 3' });
  assert.equal(por(1, 'parejas').fase, 'Cada quien elige dos cartas');
  assert.equal(por(1, 'marcas').fase, 'Cada quien marca la que juega');
  assert.equal(por(2, 'revelado').fase, 'Se revelan las marcas');
  assert.equal(por(2, 'resultado').fase, 'Resultado de la ronda');
  assert.deepEqual([por(3, 'corte').fase, por(3, 'corte').corte], ['Corte 1', '']); // el beat del corte ya dice "Corte": no se repite
  assert.deepEqual([por(4, 'apertura').ciclo, por(4, 'apertura').corte], [1, 'Corte: ronda 6']);
  assert.deepEqual([por(6, 'corte').fase, por(6, 'corte').corte], ['Corte 2', '']);
  assert.deepEqual([por(7, 'apertura').ciclo, por(7, 'apertura').corte], [2, 'Final: ronda 12']);
  assert.deepEqual(bannerDe(beats.at(-1)), { ciclo: 2, fase: 'Final', corte: '' });
  for (const raro of [null, undefined, {}, { tipo: 'raro', mano: 99 }]) assert.deepEqual(Object.keys(bannerDe(raro)), ['ciclo', 'fase', 'corte']);
});

test('una marca de reemplazo que choca no se cuenta como si la IA hubiera pensado lo mismo que los demas: la anulacion y el comentario del choque lo dicen', async () => {
  let anulaciones = 0, choques = 0;
  for (let seed = 1; seed <= 10; seed++) {
    for (const asiento of [0, 1, 2, 3, 4]) {
      const p = await jugarSolConCaido(seed, asiento);
      const beats = construirLineaDeTiempo(p);
      for (const b of beats.filter((x) => x.tipo === 'revelado')) {
        const r = p.rondas[b.registro];
        for (const a of b.pasos.filter((x) => x.tipo === 'anula')) {
          const delJuego = a.asientos.filter((s) => r.invalidas[s] === true);
          if (!delJuego.length) continue;
          const linea = b.lineas.find((l) => l.tipo === 'anulacion' && l.texto.startsWith(`El ${a.numero} se anula`));
          assert.match(linea.texto, /la jugada la puso el juego/, b.id);
          for (const s of delJuego) assert.ok(linea.texto.includes(`en ${p.jugadores[s].nombre} la jugada la puso el juego`) || linea.texto.includes(p.jugadores[s].nombre), b.id);
          anulaciones++;
          const res = beats.find((x) => x.tipo === 'resultado' && x.registro === b.registro);
          const choque = res.lineas.find((l) => l.tipo === 'comentario' && /^Choque de/.test(l.texto) && l.texto.includes(`en el ${a.numero}`));
          if (choque) { assert.match(choque.texto, /una de las jugadas la puso el juego/); assert.doesNotMatch(choque.texto, /demasiados pensaron/); choques++; }
        }
      }
    }
  }
  assert.ok(anulaciones > 10 && choques > 0, `cobertura: ${anulaciones} anulaciones y ${choques} choques de reemplazo`);
});

test('el cierre de la final pone cada criterio de desempate junto a su puesto: el de la pieza a la pieza y el del eliminado al eliminado', () => {
  const nombre = (s) => ['A', 'B', 'C'][s];
  const final = (criterioPieza, criterioEliminado) => ({ pieza: 0, medio: 1, eliminado: 2, criterioPieza, criterioEliminado });
  assert.deepEqual(textoDeFinal(final('fichas', 'puntos'), nombre), { grande: 'A gana la pieza', detalle: 'C queda eliminado · La pieza se decidió por fichas' });
  assert.deepEqual(textoDeFinal(final('puntos', 'sorteo'), nombre), { grande: 'A gana la pieza', detalle: 'C queda eliminado · El eliminado se decidió por sorteo' });
  assert.deepEqual(textoDeFinal(final('ultima victoria', 'fichas'), nombre).detalle, 'C queda eliminado · La pieza se decidió por última victoria · El eliminado se decidió por fichas');
  assert.deepEqual(textoDeFinal(final('puntos', 'puntos'), nombre).detalle, 'C queda eliminado');
  assert.deepEqual(textoDeFinal(null, nombre), { grande: '', detalle: '' });
});

test('puntuarRondas no premia un numero alto que puso el juego', async () => {
  const p = structuredClone(await jugarSol(2));
  const i = p.rondas.findIndex((r) => r.fase === 2 && r.ganador !== null && r.numero >= 7);
  assert.ok(i >= 0, 'la prueba necesita una ronda ganada con 7 u 8');
  const ronda = p.rondas[i].ronda;
  assert.ok(puntuarRondas(p).find((m) => m.ronda === ronda).motivos.includes('premio alto'));
  p.rondas[i].invalidas[p.rondas[i].ganador] = true;
  assert.ok(!puntuarRondas(p).find((m) => m.ronda === ronda).motivos.includes('premio alto'));
});

test('puntuarRondas no premia "toma la delantera" cuando la marca ganadora la puso el juego', async () => {
  let visto = 0;
  for (const original of await muchasSol()) {
    const con = puntuarRondas(original).filter((m) => m.motivos.includes('toma la delantera'));
    for (const m of con) {
      const p = structuredClone(original);
      const r2 = p.rondas.find((r) => r.ronda === m.ronda && r.fase === 2);
      r2.invalidas[r2.ganador] = true;
      assert.ok(!puntuarRondas(p).find((x) => x.ronda === m.ronda).motivos.includes('toma la delantera'), `seed ${p.seed} ronda ${m.ronda}`);
      visto++;
    }
  }
  assert.ok(visto > 0, 'la prueba necesita rondas donde alguien toma la delantera');
});

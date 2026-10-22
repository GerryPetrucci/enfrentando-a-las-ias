// Linea de tiempo de la escena de Mayor o menor: convierte los registros guardados (uno por ronda) en beats. Funcion pura sobre partidas REALES jugadas por bots:
// sin DOM, sin red y sin API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RONDAS } from '../../juegos/mayormenor/constantes.js';
import { resolverNombres } from '../../juegos/mayormenor/narracion.js';
import { elegirCamara } from '../../../web/casino/camara.js';
import { eventosDePaso } from '../../../web/casino/sonido.js';
import { construirLineaDeTiempo, puntuarRondas, mejoresRondas, beatsDeEstado, erroresDeEstado, conRazones, MIN_MS, RONDAS_TOPE } from '../../../web/casino/linea-de-tiempo-mayormenor.js';
import { jugarMM, jugarMMConCaido, muchasMM, REGLAS_2_0 } from './ayudas-mm.js';

const nombres = (p) => (t) => resolverNombres(t, p.jugadores);
const TIPOS = ['apertura', 'crupier', 'jugada', 'apuesta', 'revelado', 'resultado'];
const PASOS = ['roles', 'crupier', 'jugar', 'pregunta', 'apuesta', 'revelar', 'comparar', 'sello', 'cobra', 'paga', 'devuelve', 'estado', 'final'];
const porRonda = (beats) => beats.reduce((m, b) => m.set(b.mano, [...(m.get(b.mano) ?? []), b]), new Map());
const lider = (f) => { const max = Math.max(...f); const q = f.flatMap((x, s) => (x === max ? [s] : [])); return q.length === 1 ? q[0] : null; };

test('el tope de rondas que muestra la escena es el del motor (la web no puede importarlo)', () => {
  assert.equal(RONDAS_TOPE, RONDAS);
});

test('cada ronda cuenta su historia en orden: apertura, crupier, jugada, apuesta, revelado y resultado; el final solo al terminar', async () => {
  for (const p of await muchasMM()) {
    const beats = construirLineaDeTiempo(p);
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) assert.deepEqual(bs.map((b) => b.tipo), TIPOS, `seed ${p.seed} ronda ${ronda}`);
    const finales = beats.filter((b) => b.tipo === 'final');
    assert.equal(finales.length, p.truncada ? 0 : 1);
    if (finales.length) assert.equal(beats.at(-1).tipo, 'final');
    assert.equal(new Set(beats.map((b) => b.id)).size, beats.length, 'ids unicos');
    for (const b of beats) assert.ok(Number.isFinite(b.minMs) && b.minMs >= MIN_MS[b.tipo], `${b.id}: minMs`);
  }
  assert.deepEqual(Object.keys(MIN_MS).sort(), [...TIPOS, 'final'].sort());
});

test('cubre todos los registros en orden y no pierde ni repite una sola linea de la narracion; los comentarios esperan al resultado de su ronda', async () => {
  for (const p of [...await muchasMM(), await jugarMM(3, undefined, { maxRondas: 5 })]) {
    const beats = construirLineaDeTiempo(p);
    assert.deepEqual([...new Set(beats.map((b) => b.registro))], p.rondas.map((_, i) => i), `seed ${p.seed}: todos los registros, en orden`);
    const dichas = beats.filter((b) => b.tipo !== 'final').flatMap((b) => b.lineas.map((l) => l.texto)).sort();
    assert.deepEqual(dichas, p.rondas.flatMap((r) => r.narracion).map((l) => nombres(p)(l.texto)).sort(), `seed ${p.seed}: se pierde o se repite una linea`);
    for (const b of beats.filter((x) => x.tipo !== 'resultado')) assert.ok(b.lineas.every((l) => l.tipo !== 'comentario'), `${b.id}: un comentario fuera del resultado`);
    for (const b of beats) assert.ok(b.lineas.every((l) => !/\{\d\}/.test(l.texto)), 'ningun {n} sin resolver');
  }
});

test('la apuesta se muestra cuando se juega la carta del activo: el paso «pregunta» del beat de la jugada trae la apuesta del predictor, igual a la del beat de la apuesta (con su marca de jugada del juego), y nunca la carta jugada', async () => {
  let reemplazadas = 0, rondas = 0;
  for (const p of [...await muchasMM(), await jugarMMConCaido(2, 0), await jugarMMConCaido(3, 1)]) {
    for (const [ronda, bs] of porRonda(construirLineaDeTiempo(p).filter((b) => b.tipo !== 'final'))) {
      const jugada = bs.find((b) => b.tipo === 'jugada'), apuesta = bs.find((b) => b.tipo === 'apuesta');
      const pregunta = jugada.pasos.find((x) => x.tipo === 'pregunta');
      const { tipo, ...paso } = apuesta.pasos.find((x) => x.tipo === 'apuesta');
      assert.equal(tipo, 'apuesta');
      assert.deepEqual(pregunta.apuesta, { ...paso, reemplazo: apuesta.reemplazo }, `seed ${p.seed} ronda ${ronda}: la apuesta que se muestra con la carta es la del beat de la apuesta`);
      assert.ok(!('carta' in pregunta) && !('carta' in pregunta.apuesta), `ronda ${ronda}: la apuesta no lleva la carta jugada`);
      rondas++;
      if (apuesta.reemplazo) reemplazadas++;
    }
  }
  assert.ok(rondas > 100 && reemplazadas > 0, `la prueba no vio apuestas puestas por el juego (${reemplazadas} de ${rondas})`);
});

test('una partida cortada no inventa final; con entrada ilegible no hay beats', async () => {
  const corta = await jugarMM(3, undefined, { maxRondas: 5 });
  assert.equal(corta.truncada, true);
  const bs = construirLineaDeTiempo(corta);
  assert.ok(bs.every((b) => b.tipo !== 'final') && bs.at(-1).registro === 4);
  for (const basura of [null, undefined, {}, { rondas: [] }, { rondas: 'x' }, 7]) {
    assert.deepEqual(construirLineaDeTiempo(basura), []);
    assert.deepEqual(puntuarRondas(basura), []);
    assert.deepEqual(mejoresRondas(basura, 3), []);
  }
});

test('la camara oculta: la carta jugada solo se ve en las rondas que la camara elige (por seed) y nunca antes de tiempo', async () => {
  let vistas = 0, ocultas = 0;
  for (const p of await muchasMM()) {
    const beats = construirLineaDeTiempo(p);
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const r = p.rondas[bs[0].registro];
      const camara = elegirCamara(p.seed, ronda, 1, 2);
      assert.ok(bs.every((b) => JSON.stringify(b.camara) === JSON.stringify(camara)), `seed ${p.seed} ronda ${ronda}: camara distinta de elegirCamara`);
      const visible = camara.includes(r.activo);
      const jugar = bs.find((b) => b.tipo === 'jugada').pasos.find((x) => x.tipo === 'jugar');
      assert.equal(jugar.carta, visible ? r.carta : null, `ronda ${ronda}: la carta jugada ${visible ? 'debia verse' : 'debia seguir oculta'}`);
      if (visible) vistas++; else ocultas++;
      // antes del reveal, la carta jugada no aparece en ningun otro paso (el crupier y las cartas disponibles son publicos)
      for (const b of bs.slice(0, bs.findIndex((x) => x.tipo === 'revelado'))) {
        for (const paso of b.pasos) if (!['jugar', 'crupier', 'estado'].includes(paso.tipo)) assert.ok(!('carta' in paso), `${b.id}: ${paso.tipo} trae una carta antes del reveal`);
      }
    }
  }
  assert.ok(vistas > 20 && ocultas > 20, `la camara tiene que mezclar: ${vistas} vistas, ${ocultas} ocultas`);
  const p = await jugarMM(3);
  const con = (camara) => construirLineaDeTiempo(p, { camara }).filter((b) => b.tipo === 'jugada').map((b) => b.pasos.find((x) => x.tipo === 'jugar').carta);
  assert.ok(con(0).every((c) => c === null), 'camara 0: nunca');
  assert.ok(con(2).every((c) => typeof c === 'number'), 'camara 2: siempre');
  assert.deepEqual(construirLineaDeTiempo(p, { camara: 0 }).map((b) => b.id), construirLineaDeTiempo(p, { camara: 2 }).map((b) => b.id), 'los ids no dependen de la camara');
});

test('la apuesta, el reveal y las fichas salen del registro: carta igual no mueve fichas, la apuesta total se marca y el estado final de la ronda es el del registro', async () => {
  let iguales = 0, todos = 0, aciertos = 0, fallos = 0;
  for (const p of await muchasMM()) {
    const beats = construirLineaDeTiempo(p);
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const r = p.rondas[bs[0].registro];
      const paso = (tipo, t) => bs.find((b) => b.tipo === tipo).pasos.filter((x) => x.tipo === t);
      assert.deepEqual(paso('apertura', 'roles'), [{ tipo: 'roles', activo: r.activo, predictor: r.predictor, doble: false }], 'las reglas 1.0.0 no tienen rondas dobles');
      const ap = paso('apuesta', 'apuesta')[0];
      assert.deepEqual([ap.asiento, ap.fichas, ap.lado, ap.todo], [r.predictor, r.apuesta, r.lado, r.apostoTodo], `ronda ${ronda}`);
      assert.deepEqual(paso('crupier', 'crupier'), [{ tipo: 'crupier', asiento: r.activo, carta: r.crupier, quedan: r.crupierQuedan[r.activo].length }]);
      const sello = paso('revelado', 'sello')[0].sello;
      assert.equal(sello, r.acierto === true ? 'acierta' : r.acierto === false ? 'falla' : 'igual', `ronda ${ronda}: sello`);
      assert.deepEqual(paso('revelado', 'revelar'), [{ tipo: 'revelar', carta: r.carta }]);
      assert.deepEqual(paso('revelado', 'comparar'), [{ tipo: 'comparar', veredicto: r.veredicto, crupier: r.crupier, carta: r.carta, igual: r.veredicto === 'igual' }]);
      const res = bs.find((b) => b.tipo === 'resultado').pasos;
      const cobra = res.filter((x) => x.tipo === 'cobra'), paga = res.filter((x) => x.tipo === 'paga'), devuelve = res.filter((x) => x.tipo === 'devuelve');
      assert.deepEqual(res.find((x) => x.tipo === 'estado').fichas, r.fichas, `ronda ${ronda}: las fichas de la ronda son las del registro`);
      assert.deepEqual(cobra.filter((x) => x.asiento === r.activo).map((x) => x.fichas), r.ganaActivo > 0 ? [r.ganaActivo] : [], 'el activo cobra de la banca solo si gana algo');
      if (r.veredicto === 'igual') {
        iguales++;
        assert.deepEqual(res.filter((x) => x.tipo !== 'estado'), [{ tipo: 'devuelve', asiento: r.predictor, fichas: r.apuesta }], 'carta igual: solo se devuelve la apuesta');
        assert.deepEqual(r.fichas, r.fichasAntes);
      } else if (r.acierto) {
        aciertos++;
        assert.deepEqual(devuelve, [{ tipo: 'devuelve', asiento: r.predictor, fichas: r.apuesta }]);
        assert.deepEqual(cobra.filter((x) => x.asiento === r.predictor).map((x) => x.fichas), [r.ganaPredictor]);
        assert.equal(paga.length, 0);
      } else {
        fallos++;
        assert.deepEqual(paga, [{ tipo: 'paga', asiento: r.predictor, fichas: r.apuesta }]);
        assert.equal(devuelve.length, 0);
      }
      if (r.apostoTodo) todos++;
    }
  }
  assert.ok(iguales > 0 && todos > 0 && aciertos > 0 && fallos > 0, `la prueba no vio todos los casos: ${iguales} iguales, ${todos} apuestas totales, ${aciertos} aciertos, ${fallos} fallos`);
});

test('las cartas que le quedan a cada jugador (la tira) y el mazo del crupier salen del registro, antes y despues de la ronda', async () => {
  for (const p of await muchasMM()) {
    const beats = construirLineaDeTiempo(p);
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const r = p.rondas[bs[0].registro];
      const antes = bs.find((b) => b.tipo === 'apertura').pasos.find((x) => x.tipo === 'estado');
      const despues = bs.find((b) => b.tipo === 'resultado').pasos.find((x) => x.tipo === 'estado');
      assert.deepEqual(antes.fichas, r.fichasAntes);
      for (const s of [0, 1]) {
        assert.deepEqual(despues.disponibles[s], r.mano[s], `ronda ${ronda} asiento ${s}: despues`);
        assert.deepEqual(antes.disponibles[s], s === r.activo ? [...r.mano[s], r.carta].sort((a, b) => a - b) : r.mano[s], `ronda ${ronda} asiento ${s}: antes (le falta la carta que va a jugar)`);
        assert.equal(despues.crupierQuedan[s], r.crupierQuedan[s].length);
        assert.equal(antes.crupierQuedan[s], r.crupierQuedan[s].length + (s === r.activo ? 1 : 0));
      }
    }
  }
});

test('una jugada que puso el juego por una respuesta ilegal queda marcada en el beat de su jugador y no se atribuye a la IA', async () => {
  let marcadas = 0;
  for (let seed = 1; seed <= 8; seed++) {
    for (const asiento of [0, 1]) {
      const p = await jugarMMConCaido(seed, asiento);
      const beats = construirLineaDeTiempo(p);
      for (const b of beats) {
        const r = p.rondas[b.registro];
        const esperado = b.tipo === 'jugada' ? r.invalidas[r.activo] === true : b.tipo === 'apuesta' ? r.invalidas[r.predictor] === true : false;
        assert.equal(b.reemplazo, esperado, `${b.id}`);
        if (b.reemplazo) { marcadas++; assert.match(b.texto, /no responde bien/, 'el texto dice que la puso el juego'); }
      }
    }
  }
  assert.ok(marcadas > 10, `solo ${marcadas} jugadas de reemplazo`);
});

test('una apuesta que puso el juego nunca se marca como "todo": la audacia no es de la IA (aunque el motor guarde apostoTodo)', async () => {
  let probadas = 0;
  for (let seed = 1; seed <= 8; seed++) {
    for (const asiento of [0, 1]) {
      const p = structuredClone(await jugarMMConCaido(seed, asiento));
      for (const r of p.rondas) r.apostoTodo = true; // el motor lo marca cuando la apuesta (de reemplazo incluida) iguala las fichas del predictor
      for (const b of construirLineaDeTiempo(p).filter((x) => x.tipo === 'apuesta')) {
        const r = p.rondas[b.registro];
        const ap = b.pasos.find((x) => x.tipo === 'apuesta');
        assert.equal(ap.todo, r.invalidas[r.predictor] !== true, `${b.id}: todo = apostoTodo solo si la apuesta la puso la IA`);
        if (b.reemplazo) probadas++;
      }
    }
  }
  assert.ok(probadas > 5, `solo ${probadas} apuestas de reemplazo`);
});

test('todos los pasos usan el vocabulario fijado, y cada uno suena o es mudo a proposito', async () => {
  const vistos = new Set();
  for (const p of await muchasMM()) for (const b of construirLineaDeTiempo(p)) for (const paso of b.pasos) {
    assert.ok(PASOS.includes(paso.tipo), `paso fuera del vocabulario: ${paso.tipo}`);
    assert.ok(Array.isArray(eventosDePaso(paso)));
    vistos.add(paso.tipo);
  }
  assert.deepEqual([...vistos].sort(), [...PASOS].sort());
  assert.deepEqual(eventosDePaso({ tipo: 'devuelve' }), ['ficha']);
  assert.deepEqual(eventosDePaso({ tipo: 'comparar' }), []);
});

test('puntuarRondas cuenta exactamente lo que dice la narracion del motor (apuesta total, carta igual, regala la ronda, cae de golpe, pasa al frente) y el final', async () => {
  const frases = { 'lo apuesta todo': /lo apuesta todo/, 'carta igual': /^Carta igual/, 'regala la ronda': /regala la ronda|juega bajo a propósito/, 'cae de golpe': /buena parte de sus fichas/, 'pasa al frente': /pasa al frente/ };
  const vistos = {};
  for (const p of await muchasMM()) {
    for (const m of puntuarRondas(p)) {
      const r = p.rondas[m.ronda - 1];
      for (const [motivo, re] of Object.entries(frases)) {
        const dice = r.narracion.some((l) => l.tipo === 'comentario' && re.test(l.texto));
        assert.equal(m.motivos.includes(motivo), dice, `seed ${p.seed} ronda ${m.ronda}: ${motivo}`);
        if (dice) vistos[motivo] = (vistos[motivo] ?? 0) + 1;
      }
      assert.equal(m.motivos.includes('final'), r.final !== null);
      assert.ok(Number.isFinite(m.puntos) && m.puntos >= 0);
    }
  }
  for (const motivo of Object.keys(frases)) assert.ok(vistos[motivo] > 0, `la prueba no vio "${motivo}"`);
  const p = await jugarMM(2);
  const top = mejoresRondas(p, 3);
  assert.equal(top.length, 3);
  assert.ok(top[0].puntos >= top[1].puntos && top[1].puntos >= top[2].puntos);
  assert.equal(new Set(top.map((x) => x.ronda)).size, 3);
  assert.deepEqual(mejoresRondas(p, 0), []);
});

test('la comprobacion de estado: al empezar cada ronda no queda nada de la anterior (sello, apuesta, cartas del escenario, etiquetas de camara)', async () => {
  const beats = construirLineaDeTiempo(await jugarMM(3));
  const idx = beatsDeEstado(beats, 4);
  assert.equal(idx.length, 4);
  assert.ok(idx.every((i) => beats[i].tipo === 'apertura' && beats[i].mano >= 2));
  const limpio = { sello: 0, apuesta: 0, cartas: 0, pastillas: 0, papeles: 2, brillos: 0, tituloCortado: false, nombreCortado: false, barraDesbordada: false };
  assert.deepEqual(erroresDeEstado(limpio, beats[idx[0]]), []);
  assert.match(erroresDeEstado({ ...limpio, sello: 1 }, beats[idx[0]]).join(), /sello/);
  assert.match(erroresDeEstado({ ...limpio, apuesta: 1 }, beats[idx[0]]).join(), /apuesta/);
  assert.match(erroresDeEstado({ ...limpio, cartas: 3 }, beats[idx[0]]).join(), /cartas/);
  assert.match(erroresDeEstado({ ...limpio, pastillas: 1 }, beats[idx[0]]).join(), /camara/);
  // el titulo de la cabecera no puede quedar cortado («MAYOR O MEN…» en una ronda doble de dos cifras, en vertical)
  assert.match(erroresDeEstado({ ...limpio, tituloCortado: true }, beats[idx[0]]).join(), /titulo/);
  // al empezar la ronda cada jugador muestra su papel (activo y predictor), y su barra no se corta ni se desborda
  assert.match(erroresDeEstado({ ...limpio, papeles: 1 }, beats[idx[0]]).join(), /papel/);
  assert.match(erroresDeEstado({ ...limpio, papeles: 0 }, beats[idx[0]]).join(), /papel/);
  // y todavia nadie actua: ninguna pastilla brilla con lo de la ronda anterior
  assert.match(erroresDeEstado({ ...limpio, brillos: 1 }, beats[idx[0]]).join(), /brill/);
  assert.match(erroresDeEstado({ ...limpio, nombreCortado: true }, beats[idx[0]]).join(), /nombre/);
  assert.match(erroresDeEstado({ ...limpio, barraDesbordada: true }, beats[idx[0]]).join(), /barra/);
  assert.match(erroresDeEstado(null, beats[idx[0]]).join(), /estado/);
  assert.deepEqual(beatsDeEstado(null, 3), []);
});

test('puntuarRondas no premia una apuesta que puso el juego (apuesta grande, cae de golpe): la audacia no es de la IA', async () => {
  const p = structuredClone(await jugarMM(2));
  const i = p.rondas.findIndex((r) => r.acierto === false && r.apuesta * 2 >= r.fichasAntes[r.predictor]);
  assert.ok(i >= 0, 'la prueba necesita una ronda con apuesta grande que falla');
  assert.ok(puntuarRondas(p)[i].motivos.includes('apuesta grande') && puntuarRondas(p)[i].motivos.includes('cae de golpe'));
  p.rondas[i].invalidas[p.rondas[i].predictor] = true;
  const motivos = puntuarRondas(p)[i].motivos;
  assert.ok(!motivos.includes('apuesta grande') && !motivos.includes('cae de golpe'), motivos.join());
});

test('razon=1 en Mayor o menor: la razon del predictor sale con su apuesta y la del activo despues del reveal (nunca antes: delataria su carta), y no se atribuye a una jugada del juego', async () => {
  const p = await jugarMM(2);
  const beats = construirLineaDeTiempo(p);
  const con = conRazones(beats, p);
  assert.equal(con.length, beats.length);
  let vistas = 0;
  for (const b of con) {
    const r = p.rondas[b.registro];
    const esperado = b.tipo === 'apuesta' ? r.razones[r.predictor] : b.tipo === 'revelado' ? r.razones[r.activo] : null;
    if (esperado) { assert.equal(b.razon, esperado.trim(), b.id); assert.ok(b.minMs > beats.find((x) => x.id === b.id).minMs, `${b.id}: la razon se lee`); vistas++; }
    else assert.equal(b.razon, undefined, `${b.id}: sin razon`);
  }
  assert.ok(vistas > 20, `solo ${vistas} razones`);
  const caido = await jugarMMConCaido(2, 0);
  for (const b of conRazones(construirLineaDeTiempo(caido), caido)) if (b.reemplazo) assert.equal(b.razon, undefined, `${b.id}: nadie penso esa jugada`);
  for (const basura of [null, undefined, 7]) assert.deepEqual(conRazones(basura, p), []);
  assert.doesNotThrow(() => conRazones(beats, null));
});

// ---- las reglas 2.0.0 en la escena: rondas dobles, carta igual que cuenta como menor y manos repartidas (con cartas repetidas) ----
const resta = (mano, jugadas) => { const m = [...mano]; for (const c of jugadas) m.splice(m.indexOf(c), 1); return m; };
const ordenadas = (xs) => [...xs].sort((a, b) => a - b);

test('reglas 2.0.0: la apertura dice si la ronda es doble y todos los estados traen las manos repartidas, de las que salen las cartas que quedan', async () => {
  let dobles = 0;
  for (const p of await muchasMM(REGLAS_2_0)) {
    const beats = construirLineaDeTiempo(p);
    const r0 = p.rondas[0];
    const inicial = [0, 1].map((s) => ordenadas(s === r0.activo ? [...r0.mano[s], r0.carta] : r0.mano[s]));
    const jugadas = [[], []];
    for (const [ronda, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const r = p.rondas[bs[0].registro];
      const apertura = bs.find((b) => b.tipo === 'apertura');
      assert.equal(apertura.pasos.find((x) => x.tipo === 'roles').doble, r.doble === 2, `ronda ${ronda}`);
      if (r.doble === 2) dobles++;
      const antes = apertura.pasos.find((x) => x.tipo === 'estado');
      assert.deepEqual(antes.manoInicial, inicial, `seed ${p.seed} ronda ${ronda}: las manos repartidas`);
      assert.deepEqual(antes.disponibles.map(ordenadas), inicial.map((m, s) => ordenadas(resta(m, jugadas[s]))), `ronda ${ronda}: lo que queda antes de jugar`);
      jugadas[r.activo].push(r.carta);
      const despues = bs.find((b) => b.tipo === 'resultado').pasos.find((x) => x.tipo === 'estado');
      assert.deepEqual(despues.manoInicial, inicial);
      assert.deepEqual(despues.disponibles.map(ordenadas), inicial.map((m, s) => ordenadas(resta(m, jugadas[s]))), `ronda ${ronda}: lo que queda despues`);
    }
  }
  assert.ok(dobles > 0, 'la prueba no vio ninguna ronda doble');
});

test('reglas 2.0.0: la carta igual cuenta como menor: la comparacion lo dice y el sello es el de la apuesta, no «igual»; la doble paga al doble', async () => {
  let iguales = 0, dobles = 0;
  for (const p of await muchasMM(REGLAS_2_0)) {
    for (const [ronda, bs] of porRonda(construirLineaDeTiempo(p).filter((b) => b.tipo !== 'final'))) {
      const r = p.rondas[bs[0].registro];
      const cmp = bs.find((b) => b.tipo === 'revelado').pasos.find((x) => x.tipo === 'comparar');
      assert.equal(cmp.igual, r.igual === true, `ronda ${ronda}`);
      assert.notEqual(cmp.veredicto, 'igual', 'con las reglas 2.0.0 nunca queda «igual»');
      const sello = bs.find((b) => b.tipo === 'revelado').pasos.find((x) => x.tipo === 'sello').sello;
      assert.equal(sello, r.acierto ? 'acierta' : 'falla', `ronda ${ronda}`);
      const ap = bs.find((b) => b.tipo === 'apuesta').pasos.find((x) => x.tipo === 'apuesta');
      assert.equal(ap.maximo, ap.todo && r.apuestaMaxima < r.fichasAntes[r.predictor], `ronda ${ronda}: «Máximo» solo si el tope impide apostar todo lo suyo`);
      const res = bs.find((b) => b.tipo === 'resultado').pasos;
      assert.deepEqual(res.filter((x) => x.tipo === 'cobra' && x.asiento === r.predictor).map((x) => x.fichas), r.acierto ? [r.ganaPredictor] : [], 'el predictor cobra lo del registro (doble en rondas dobles)');
      if (r.igual) iguales++;
      if (r.doble === 2 && r.acierto) { dobles++; assert.equal(r.ganaPredictor, 2 * r.apuesta); }
    }
  }
  assert.ok(iguales > 0 && dobles > 0, `la prueba no vio cartas iguales (${iguales}) o rondas dobles que acierten (${dobles})`);
});

test('reglas 2.0.0: «¡Ronda doble!» se dice al ABRIR la ronda (es una regla de esa ronda y el encabezado ya la muestra), no al final con los comentarios del resultado', async () => {
  let dobles = 0;
  for (const p of await muchasMM(REGLAS_2_0)) {
    for (const [ronda, bs] of porRonda(construirLineaDeTiempo(p).filter((b) => b.tipo !== 'final'))) {
      const r = p.rondas[bs[0].registro];
      const apertura = bs.find((b) => b.tipo === 'apertura'), resultado = bs.find((b) => b.tipo === 'resultado');
      const aviso = (b) => b.lineas.filter((l) => /^¡Ronda doble!/.test(l.texto));
      assert.equal(aviso(apertura).length, r.doble === 2 ? 1 : 0, `seed ${p.seed} ronda ${ronda}: el aviso va en la apertura`);
      assert.equal(aviso(resultado).length, 0, `seed ${p.seed} ronda ${ronda}: ni rastro del aviso al final`);
      if (r.doble === 2) {
        dobles++;
        assert.match(apertura.texto, /^Ronda \d+ de 18\. .+¡Ronda doble! Las ganancias se pagan al doble\.$/, 'despues de decir de quien es la mano, con la apertura por delante');
        assert.ok(apertura.lineas.every((l) => l.tipo === 'apertura'), 'es parte de la apertura: los comentarios siguen esperando al resultado');
      }
    }
  }
  assert.ok(dobles > 0, 'la prueba no vio ninguna ronda doble');
});

test('el comentario «apuesta el máximo permitido» que traen las partidas guardadas el 21 de octubre ya no se dice (con el tope de 6 casi todas las apuestas lo son): la linea de tiempo lo omite y los demas comentarios siguen', async () => {
  const p = await jugarMM(3, ['temerario', 'contador'], { reglas: REGLAS_2_0 });
  p.rondas[0].narracion.push({ tipo: 'comentario', texto: '{1} apuesta el máximo permitido.' }, { tipo: 'comentario', texto: '{0} pasa al frente.' });
  const resultado = construirLineaDeTiempo(p).find((b) => b.tipo === 'resultado' && b.mano === 1);
  assert.doesNotMatch(resultado.texto, /máximo permitido/);
  assert.ok(!resultado.lineas.some((l) => /máximo permitido/.test(l.texto)), 'ni en las lineas que se dicen ni en las que se leen');
  assert.match(resultado.texto, /pasa al frente/, 'los demas comentarios no se tocan');
});

test('reglas 2.0.0: «lo apuesta todo» solo puntua cuando se apuestan TODAS las fichas (apostar el tope no es un momento: casi toda apuesta lo es)', async () => {
  let todas = 0, alTope = 0;
  for (const p of await muchasMM(REGLAS_2_0)) {
    for (const m of puntuarRondas(p)) {
      const r = p.rondas[m.ronda - 1];
      const todo = r.apostoTodo === true && r.invalidas[r.predictor] !== true && !(r.apuestaMaxima < r.fichasAntes[r.predictor]);
      assert.equal(m.motivos.includes('lo apuesta todo'), todo, `seed ${p.seed} ronda ${m.ronda}`);
      if (todo) todas++; else if (r.apostoTodo) alTope++;
    }
  }
  assert.ok(todas > 0 && alTope > 0, `la prueba no vio apuestas de todas las fichas (${todas}) o al tope (${alTope})`);
});

test('reglas 2.0.0: puntuarRondas cuenta la carta igual y la ronda doble igual que las dicen los comentarios del motor', async () => {
  const frases = { 'carta igual': /^Carta igual/, 'ronda doble': /Ronda doble/ };
  const vistos = {};
  for (const p of await muchasMM(REGLAS_2_0)) {
    for (const m of puntuarRondas(p)) {
      const r = p.rondas[m.ronda - 1];
      for (const [motivo, re] of Object.entries(frases)) {
        const dice = r.narracion.some((l) => l.tipo === 'comentario' && re.test(l.texto));
        assert.equal(m.motivos.includes(motivo), dice, `seed ${p.seed} ronda ${m.ronda}: ${motivo}`);
        if (dice) vistos[motivo] = (vistos[motivo] ?? 0) + 1;
      }
    }
  }
  for (const motivo of Object.keys(frases)) assert.ok(vistos[motivo] > 0, `la prueba no vio "${motivo}"`);
});

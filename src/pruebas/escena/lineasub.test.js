// Linea de tiempo de la escena de Subasta de tiempo: convierte los registros guardados (uno por subasta) en beats. Funcion pura sobre partidas REALES jugadas por bots: sin DOM,
// sin red y sin API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUBASTAS as RONDAS, JUGADORES, BANCO } from '../../juegos/subasta/constantes.js';
import { resolverNombres } from '../../juegos/subasta/narracion.js';
import { eventosDePaso } from '../../../web/casino/sonido.js';
import { duracionDeReloj } from '../../../web/casino/reloj.js';
import { construirLineaDeTiempo, puntuarRondas, mejoresRondas, beatsDeEstado, erroresDeEstado, textoDeFinal, textoDeArranque, textoDeSoltar, textoDeGanar, MIN_MS, RONDAS_TOPE, JUGADORES_TOPE, BANCO_S } from '../../../web/casino/linea-de-tiempo-subasta.js';
import { jugarSub, jugarSubConCaido, muchasSub } from './ayudas-sub.js';

const nombres = (p) => (t) => resolverNombres(t, p.jugadores);
const TIPOS = ['apertura', 'reloj', 'apuestas', 'resultado'];
const PASOS = ['estado', 'oprimir', 'correr', 'retirar', 'ganar', 'anular', 'nadie', 'pagar', 'ficha', 'final'];
const MUDOS = ['estado', 'correr', 'retirar', 'final'];
const porRonda = (beats) => beats.reduce((m, b) => m.set(b.mano, [...(m.get(b.mano) ?? []), b]), new Map());
const pasosDe = (beats, tipo) => beats.flatMap((b) => b.pasos.filter((x) => x.tipo === tipo));
const decima = (x) => Math.round(x * 10) / 10;

test('las constantes que muestra la escena son las del motor (la web no puede importarlo)', () => {
  assert.equal(RONDAS_TOPE, RONDAS);
  assert.equal(JUGADORES_TOPE, JUGADORES);
  assert.equal(BANCO_S * 10, BANCO, 'el banco inicial (el motor lo guarda en decimas)');
});

test('cada subasta cuenta su historia en orden: apertura, reloj, apuestas y resultado; el final solo al terminar', async () => {
  for (const p of await muchasSub()) {
    const beats = construirLineaDeTiempo(p);
    for (const [n, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) assert.deepEqual(bs.map((b) => b.tipo), TIPOS, `seed ${p.seed} subasta ${n}`);
    const finales = beats.filter((b) => b.tipo === 'final');
    assert.equal(finales.length, p.truncada ? 0 : 1);
    if (finales.length) assert.equal(beats.at(-1).tipo, 'final');
    assert.equal(new Set(beats.map((b) => b.id)).size, beats.length, 'ids unicos');
    for (const b of beats) assert.ok(Number.isFinite(b.minMs) && b.minMs >= MIN_MS[b.tipo], `${b.id}: minMs`);
  }
  assert.deepEqual(Object.keys(MIN_MS).sort(), [...TIPOS, 'final'].sort());
});

test('cubre todos los registros en orden y no pierde ni repite una sola linea de la narracion; los comentarios esperan al final del resultado', async () => {
  for (const p of [...await muchasSub(), await jugarSub(3, undefined, { maxRondas: 5 })]) {
    const beats = construirLineaDeTiempo(p);
    assert.deepEqual([...new Set(beats.map((b) => b.registro))], p.rondas.map((_, i) => i), `seed ${p.seed}: todos los registros, en orden`);
    const dichas = beats.filter((b) => b.tipo !== 'final').flatMap((b) => b.lineas.map((l) => l.texto)).sort();
    assert.deepEqual(dichas, p.rondas.flatMap((r) => r.narracion).map((l) => nombres(p)(l.texto)).sort(), `seed ${p.seed}: se pierde o se repite una linea`);
    for (const b of beats.filter((x) => x.tipo !== 'resultado')) assert.ok(b.lineas.every((l) => l.tipo !== 'comentario'), `${b.id}: un comentario fuera del resultado`);
    for (const b of beats) assert.ok(b.lineas.every((l) => !/\{\d\}/.test(l.texto)), 'ningun {n} sin resolver');
    assert.ok(beats.filter((b) => b.tipo === 'reloj').every((b) => b.texto === ''), 'el reloj es mudo: el contador y los clics hablan solos');
  }
});

test('una partida cortada no inventa final; con entrada ilegible no hay beats', async () => {
  const corta = await jugarSub(3, undefined, { maxRondas: 5 });
  assert.equal(corta.truncada, true);
  assert.ok(construirLineaDeTiempo(corta).every((b) => b.tipo !== 'final'));
  const forzada = structuredClone(await jugarSub(3)); // una partida marcada como cortada no tiene final aunque traiga epilogo
  forzada.truncada = true;
  assert.ok(construirLineaDeTiempo(forzada).every((b) => b.tipo !== 'final'));
  for (const basura of [null, undefined, {}, { rondas: [] }, { rondas: 'x' }, 7]) {
    assert.deepEqual(construirLineaDeTiempo(basura), []);
    assert.deepEqual(puntuarRondas(basura), []);
    assert.deepEqual(mejoresRondas(basura, 3), []);
  }
});

test('el reloj corre hasta la apuesta mas alta, en el orden de las apuestas, y nada de lo que apostaron aparece antes de que corra', async () => {
  let corridas = 0;
  for (const p of await muchasSub()) {
    const beats = construirLineaDeTiempo(p);
    for (const [n, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const r = p.rondas[n - 1];
      const reloj = bs.find((b) => b.tipo === 'reloj');
      const correr = reloj.pasos.find((x) => x.tipo === 'correr');
      const esperado = r.oculto.apuestas.flatMap((a, s) => (a > 0 ? [{ asiento: s, apuesta: a, todo: r.oculto.todoElBanco[s] === true }] : [])).sort((a, b) => a.apuesta - b.apuesta || a.asiento - b.asiento);
      assert.deepEqual(correr.orden, esperado, `subasta ${n}: orden de las apuestas`);
      assert.equal(correr.max, esperado.length ? esperado.at(-1).apuesta : 0);
      assert.equal(correr.duracionS, duracionDeReloj(correr.max));
      assert.equal(reloj.minMs, correr.max > 0 ? Math.round(duracionDeReloj(correr.max) * 1000) + 400 : 1400, `subasta ${n}: minMs del reloj`);
      if (esperado.length) corridas++;
      // antes del beat del reloj no se sabe ninguna apuesta (la apertura solo dice quienes participan)
      for (const paso of bs.find((b) => b.tipo === 'apertura').pasos) for (const prohibido of ['orden', 'max', 'pagos', 'apuestas']) assert.ok(!(prohibido in paso), `apertura: ${paso.tipo} trae ${prohibido}`);
    }
  }
  assert.ok(corridas > 80, `cobertura: ${corridas} relojes`);
});

test('quien se retira, quien ya no tiene banco y quien respondio mal se ven aparte, y el resultado distingue ganador, empate y subasta en blanco', async () => {
  const vistos = { ganar: 0, anular: 0, nadie: 0, sinTiempo: 0, ilegible: 0 };
  for (const p of [...await muchasSub(), await jugarSubConCaido(1, 2), await jugarSubConCaido(2, 0)]) {
    const beats = construirLineaDeTiempo(p);
    for (const [n, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const r = p.rondas[n - 1];
      const retirar = pasosDe(bs.filter((b) => b.tipo === 'reloj'), 'retirar');
      const esperadosRet = r.oculto.apuestas.flatMap((a, s) => (a === null ? [[s, 'sin tiempo']] : r.invalidas?.[s] === true ? [[s, 'ilegible']] : a === 0 ? [[s, 'se retira']] : []));
      assert.deepEqual(retirar.map((x) => [x.asiento, x.motivo]).sort(), esperadosRet.sort(), `subasta ${n}: retirados`);
      for (const x of retirar) { if (x.motivo === 'sin tiempo') vistos.sinTiempo++; if (x.motivo === 'ilegible') vistos.ilegible++; }
      assert.equal(bs.find((b) => b.tipo === 'reloj').reemplazo, r.invalidas?.some((x) => x === true) === true);
      const res = bs.find((b) => b.tipo === 'resultado').pasos;
      const tipos = res.map((x) => x.tipo).filter((t) => ['ganar', 'anular', 'nadie', 'ficha'].includes(t));
      if (r.ganador !== null) {
        assert.deepEqual(tipos, ['ganar', 'ficha']);
        assert.deepEqual(res.find((x) => x.tipo === 'ganar'), { tipo: 'ganar', asiento: r.ganador, apuesta: r.oculto.apuestas[r.ganador], todo: r.oculto.todoElBanco?.[r.ganador] === true });
        assert.deepEqual(res.find((x) => x.tipo === 'ficha'), { tipo: 'ficha', asiento: r.ganador });
        vistos.ganar++;
      } else if (r.sinGanador === 'empate') {
        assert.deepEqual(tipos, ['anular']);
        assert.deepEqual(res.find((x) => x.tipo === 'anular'), { tipo: 'anular', asientos: r.oculto.empatados, apuesta: Math.max(...r.oculto.apuestas.filter((a) => a !== null)) });
        vistos.anular++;
      } else {
        assert.deepEqual(tipos, ['nadie']);
        vistos.nadie++;
      }
    }
  }
  for (const [k, v] of Object.entries(vistos)) assert.ok(v > 3, `cobertura: ${k} ${v}`);
});

test('los bancos y las fichas salen del registro: el banco de antes es el de despues mas lo apostado, las barras bajan lo que se pago y la tira de ganadas lleva quien gano cada subasta', async () => {
  for (const p of await muchasSub()) {
    const beats = construirLineaDeTiempo(p);
    let ganadas = Array(RONDAS).fill(null);
    for (const [n, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const r = p.rondas[n - 1];
      const antes = bs.find((b) => b.tipo === 'apertura').pasos.find((x) => x.tipo === 'estado');
      assert.deepEqual(antes.bancos, r.oculto.bancos.map((b, s) => decima(b + (r.oculto.apuestas[s] ?? 0))), `subasta ${n}: bancos antes`);
      assert.deepEqual(antes.fichas, n === 1 ? [0, 0, 0, 0, 0] : p.rondas[n - 2].fichas, `subasta ${n}: fichas antes`);
      assert.deepEqual(antes.ganadas, ganadas, `subasta ${n}: la tira antes`);
      assert.deepEqual(bs.find((b) => b.tipo === 'apertura').pasos.find((x) => x.tipo === 'oprimir').asientos, r.oculto.apuestas.flatMap((a, s) => (a === null ? [] : [s])));
      const pagar = bs.find((b) => b.tipo === 'resultado').pasos.find((x) => x.tipo === 'pagar');
      assert.deepEqual(pagar.pagos, r.oculto.apuestas.map((a) => a ?? 0));
      assert.deepEqual(pagar.bancos, r.oculto.bancos);
      ganadas = ganadas.map((x, i) => (i === n - 1 ? (r.ganador === null ? -1 : r.ganador) : x));
      const despues = bs.find((b) => b.tipo === 'resultado').pasos.filter((x) => x.tipo === 'estado').at(-1);
      assert.deepEqual([despues.bancos, despues.fichas, despues.ganadas], [r.oculto.bancos, r.fichas, ganadas], `subasta ${n}: estado final`);
    }
  }
});

test('la final sale del registro y un clip que empieza en la subasta 8 arranca con los bancos y las fichas de ese momento, no de cero', async () => {
  const p = await jugarSub(2);
  const beats = construirLineaDeTiempo(p);
  const fin = beats.find((b) => b.tipo === 'final');
  assert.deepEqual(fin.pasos, [{ tipo: 'final', final: p.rondas.at(-1).final }]);
  assert.equal(fin.mano, 19);
  assert.equal(fin.texto, p.epilogo.map((l) => nombres(p)(l.texto)).join(' '));
  const ocho = beats.find((b) => b.mano === 8 && b.tipo === 'apertura').pasos.find((x) => x.tipo === 'estado');
  const antes = p.rondas[6];
  assert.deepEqual(ocho.fichas, antes.fichas);
  assert.deepEqual(ocho.bancos, antes.oculto.bancos);
  assert.ok(ocho.ganadas.slice(0, 7).every((x) => x !== null) && ocho.ganadas.slice(7).every((x) => x === null));
});

test('una respuesta ilegible se marca como del juego y no se atribuye a la IA', async () => {
  let marcadas = 0;
  for (let seed = 1; seed <= 3; seed++) {
    for (const asiento of [0, 2, 4]) {
      const p = await jugarSubConCaido(seed, asiento);
      const nombre = p.jugadores[asiento].nombre;
      for (const b of construirLineaDeTiempo(p).filter((x) => x.tipo === 'apuestas')) {
        assert.match(b.texto, new RegExp(`${nombre} no responde bien: se cuenta como retirada`), b.id);
        assert.ok(!new RegExp(`${nombre} aguanta`).test(b.texto), `${b.id}: se le atribuye una apuesta`);
        marcadas++;
      }
    }
  }
  assert.ok(marcadas > 10);
});

test('todos los pasos usan el vocabulario fijado, y cada uno suena o es mudo a proposito', async () => {
  const vistos = new Set();
  for (const p of await muchasSub()) for (const b of construirLineaDeTiempo(p)) for (const paso of b.pasos) vistos.add(paso.tipo);
  for (const tipo of vistos) assert.ok(PASOS.includes(tipo), `paso fuera del vocabulario: ${tipo}`);
  assert.deepEqual([...vistos].sort(), [...PASOS].sort(), 'la prueba vio todos los pasos del vocabulario');
  for (const tipo of PASOS) assert.equal(eventosDePaso({ tipo }).length === 0, MUDOS.includes(tipo), `${tipo}: suena o es mudo a proposito`);
  for (const [tipo, esperado] of [['oprimir', ['tic']], ['ganar', ['gana']], ['anular', ['pierde']], ['nadie', ['duda']], ['ficha', ['ficha']], ['pagar', ['ficha']]]) assert.deepEqual(eventosDePaso({ tipo }), esperado, tipo);
});

test('puntuarRondas cuenta lo que dice la narracion del motor (empate, se adelanta en fichas, mas de la mitad del banco, se queda sin tiempo, por casi nada) y el final', async () => {
  const frases = { empate: /^Empate en lo más alto/, 'se adelanta en fichas': /se adelanta en fichas/, 'mitad del banco': /más de la mitad de su banco/, 'sin tiempo': /se queda sin tiempo/, 'casi nada': /por casi nada/ };
  const vistos = {};
  for (const p of await muchasSub()) {
    for (const m of puntuarRondas(p)) {
      const r = p.rondas[m.ronda - 1];
      for (const [motivo, re] of Object.entries(frases)) {
        const dice = r.narracion.some((l) => l.tipo === 'comentario' && re.test(l.texto));
        assert.equal(m.motivos.includes(motivo), dice, `seed ${p.seed} subasta ${m.ronda}: ${motivo}`);
        if (dice) vistos[motivo] = (vistos[motivo] ?? 0) + 1;
      }
      assert.equal(m.motivos.includes('final'), r.final !== null);
      assert.deepEqual(m.registros, [m.ronda - 1, m.ronda - 1]);
      assert.ok(Number.isFinite(m.puntos) && m.puntos >= 0);
    }
  }
  for (const motivo of Object.keys(frases)) assert.ok(vistos[motivo] > 0, `la prueba no vio "${motivo}"`);
  const top = mejoresRondas(await jugarSub(2), 3);
  assert.equal(top.length, 3);
  assert.ok(top[0].puntos >= top[1].puntos && top[1].puntos >= top[2].puntos);
  assert.deepEqual(mejoresRondas(await jugarSub(2), 0), []);
});


test('la comprobacion de estado: al empezar cada subasta no queda nada de la anterior (botones sueltos, sellos, premio, contador, panel)', async () => {
  const beats = construirLineaDeTiempo(await jugarSub(3));
  const idx = beatsDeEstado(beats, 4);
  assert.equal(idx.length, 4);
  assert.ok(idx.every((i) => beats[i].tipo === 'apertura' && beats[i].mano >= 2));
  const limpio = { botones: 0, sellos: 0, premio: 0, contador: 0, panel: 0 };
  assert.deepEqual(erroresDeEstado(limpio, beats[idx[0]]), []);
  for (const [campo, palabra] of [['botones', /botones/], ['sellos', /sello/], ['premio', /premio/], ['contador', /contador/], ['panel', /panel/]]) {
    assert.match(erroresDeEstado({ ...limpio, [campo]: 2 }, beats[idx[0]]).join(), palabra, campo);
  }
  assert.match(erroresDeEstado(null, beats[idx[0]]).join(), /estado/);
  assert.deepEqual(beatsDeEstado(null, 3), []);
});

test('el cierre de la final nombra a la pieza y al eliminado, o dice que nadie cuando hay empate total', () => {
  const nombre = (s) => ['A', 'B', 'C', 'D', 'E'][s];
  assert.deepEqual(textoDeFinal({ pieza: 3, eliminado: 4 }, nombre), { grande: 'D gana la pieza', detalle: 'E queda eliminado' });
  assert.deepEqual(textoDeFinal({ pieza: null, eliminado: 1 }, nombre), { grande: 'Nadie gana la pieza', detalle: 'B queda eliminado' });
  assert.deepEqual(textoDeFinal({ pieza: 0, eliminado: null }, nombre), { grande: 'A gana la pieza', detalle: 'Nadie queda eliminado' });
  assert.deepEqual(textoDeFinal(null, nombre), { grande: '', detalle: '' });
});

test('el texto de una fila al arrancar el reloj no depende de cuanto apuesta: lo de "todo su banco" solo se dice al soltar o al ganar (el banco de antes es publico y delataria la apuesta)', () => {
  assert.equal(textoDeArranque({ asiento: 0, apuesta: 571.9, todo: true }), textoDeArranque({ asiento: 0, apuesta: 12, todo: false }));
  assert.doesNotMatch(textoDeArranque({ apuesta: 571.9, todo: true }), /todo|571|banco/i);
  assert.equal(textoDeSoltar({ apuesta: 12.4, todo: false }), 'Soltó a 12.4 s');
  assert.equal(textoDeSoltar({ apuesta: 571.9, todo: true }), 'Soltó a 571.9 s · ¡todo!');
  assert.equal(textoDeGanar(31.8, false), 'Gana con 31.8 s');
  assert.equal(textoDeGanar(600, true), 'Gana con 600.0 s · ¡todo!');
  for (const raro of [null, undefined, {}]) assert.equal(typeof textoDeSoltar(raro), 'string');
});

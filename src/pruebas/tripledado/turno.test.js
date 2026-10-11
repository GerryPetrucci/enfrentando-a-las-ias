// Un turno de Triple dado: la prediccion, el enfrentamiento (con desempate), el cierre de ronda con premios exactos, la tarjeta forzada de la ronda 4,
// los reemplazos y el cierre de la partida.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarTurno, cerrarPartida } from '../../juegos/tripledado/turno.js';
import { normalizarRespuesta } from '../../juegos/tripledado/ordenes.js';
import { TARJETAS, RONDAS, TURNOS } from '../../juegos/tripledado/constantes.js';
import { nuevoEstado, fijarDados, escenarioBasico, prediccion, enfrentamiento, PRIMEROS, politicaSimple, jugarConBots } from './ayudas.js';

const simples = [politicaSimple, politicaSimple, politicaSimple, politicaSimple];
// un estado en el primer enfrentamiento de la ronda 1, con las cuatro tarjetas elegidas
function enPrimerEnfrentamiento(tarjetas = ['MORE', 'MIN', 'MAX', 'ZERO']) {
  const E = nuevoEstado();
  prediccion(E, tarjetas);
  return E;
}

test('la prediccion guarda las tarjetas en secreto, pasa a los enfrentamientos y el registro trae el lanzamiento', () => {
  const E = nuevoEstado();
  const reg = prediccion(E, ['MORE', 'MIN', 'MAX', 'ZERO']);
  assert.equal(reg.fase, 'prediccion');
  assert.equal(reg.ronda, 1);
  assert.equal(reg.forzada, false);
  assert.deepEqual(E.tarjetaActual, ['MORE', 'MIN', 'MAX', 'ZERO']);
  assert.deepEqual(E.eligio, [true, true, true, true]);
  assert.deepEqual(E.tarjetasUsadas, [[], [], [], []], 'las tarjetas se anotan como usadas al cerrar la ronda');
  assert.equal(E.fase, 'jugada');
  assert.equal(E.enfrentamiento, 1);
  assert.equal(reg.lanzamiento.blancos.length, 4);
  assert.ok(reg.lanzamiento.blancos.every((b) => b.length === 9));
  assert.deepEqual(reg.oculto.tarjetas, ['MORE', 'MIN', 'MAX', 'ZERO']);
  assert.equal(reg.oculto.rojos.length, 4);
  assert.deepEqual(reg.invalidas, [false, false, false, false]);
  assert.deepEqual(E.stats.map((st) => st.respuestas), [1, 1, 1, 1]);
  assert.ok(reg.narracion.length >= 5);
});

test('una tarjeta ilegal se reemplaza por una de las que quedan, sorteada, y queda anotada', () => {
  const E = nuevoEstado();
  E.tarjetasUsadas[0] = ['MORE']; // ya la uso
  E.azar.tarjeta[0] = [0.5, 0.5, 0.5, 0.5]; // floor(0.5 * 3) = 1 -> la segunda de ZERO, MIN, MAX
  const reg = aplicarTurno(E, [
    normalizarRespuesta({ tarjeta: 'MORE' }), normalizarRespuesta({ tarjeta: 'quizas' }), null, normalizarRespuesta({ dados: ['b1', 'b2', 'b3'] }),
  ]);
  assert.deepEqual(reg.motivos, ['tarjeta ya usada', 'tarjeta mal formada', 'sin respuesta legible', 'sin tarjeta']);
  assert.deepEqual(reg.invalidas, [true, true, true, true]);
  assert.equal(E.tarjetaActual[0], 'MIN');
  assert.ok(E.tarjetaActual.slice(1).every((t) => TARJETAS.includes(t)));
  assert.deepEqual(E.eligio, [false, false, false, false]);
  assert.deepEqual(E.stats.map((st) => st.invalidas), [1, 1, 1, 1]);
});

test('los campos de la otra fase se ignoran: un campo mal formado de la otra mitad no invalida la respuesta de este turno', () => {
  const E = nuevoEstado();
  const reg = aplicarTurno(E, Array(4).fill(normalizarRespuesta({ tarjeta: 'MORE', dados: ['b0'] })));
  assert.deepEqual(reg.invalidas, [false, false, false, false]);
  const F = enPrimerEnfrentamiento(['MORE', 'MORE', 'MORE', 'MORE']);
  const reg2 = aplicarTurno(F, Array(4).fill(normalizarRespuesta({ tarjeta: 'nope', dados: ['b1', 'b2', 'b3'] })));
  assert.deepEqual(reg2.invalidas, [false, false, false, false]);
});

test('un enfrentamiento: categorias, puntos 6 / 3 / 1 / 0 en docenos, dados gastados y el registro publico', () => {
  const E = enPrimerEnfrentamiento();
  escenarioBasico(E);
  const reg = enfrentamiento(E, PRIMEROS);
  assert.deepEqual(reg.combos.map((c) => c.categoria), ['doble', 'escalera', 'sencillo', 'doble']);
  assert.deepEqual(reg.combos[0].valores, [5, 5, 2]);
  assert.deepEqual(reg.puntos, [3, 6, 0, 1]);
  assert.deepEqual(reg.puesto, [2, 1, 4, 3]);
  assert.deepEqual(reg.porDesempate, [false, false, false, false]);
  assert.deepEqual(E.puntosRonda, [36, 72, 0, 12], 'el estado guarda docenos');
  assert.deepEqual(reg.puntosRonda, [3, 6, 0, 1]);
  assert.deepEqual(E.gastados[0], { blancos: ['b1', 'b2', 'b3'], rojo: false, azul: false });
  assert.equal(E.enfrentamiento, 2);
  assert.equal(reg.cierre, null);
  assert.equal(reg.fase, 'jugada');
  assert.equal(E.historial[0].tipo, 'enfrentamiento');
  assert.deepEqual(E.historial[0].puntos, [36, 72, 0, 12]);
  assert.doesNotMatch(JSON.stringify(reg), /NaN|undefined/);
});

test('un dado oculto usado se gasta, se cuenta y su valor se revela en el registro', () => {
  const E = enPrimerEnfrentamiento();
  escenarioBasico(E);
  const reg = enfrentamiento(E, [['b1', 'b2', 'rojo'], ...PRIMEROS.slice(1)]);
  assert.deepEqual(reg.combos[0].valores, [5, 5, 6]);
  assert.deepEqual(reg.combos[0].ocultos, ['rojo']);
  assert.equal(E.gastados[0].rojo, true);
  assert.equal(E.gastados[0].azul, false);
  assert.equal(E.stats[0].ocultosUsados, 1);
  assert.equal(E.stats[1].ocultosUsados, 0);
});

test('el desempate mira el dado BLANCO mas alto que sobra: un oculto sin usar no cuenta', () => {
  const E = enPrimerEnfrentamiento(['MORE', 'MORE', 'MORE', 'MORE']);
  // los cuatro juegan 5-5-2 (doble); lo que sobra de cada uno decide
  fijarDados(E, 0, { blancos: [5, 5, 2, 6, 1, 1, 1, 1, 1], rojo: 1 });
  fijarDados(E, 1, { blancos: [5, 5, 2, 3, 1, 1, 1, 1, 1], rojo: 1 });
  fijarDados(E, 2, { blancos: [5, 5, 2, 1, 1, 1, 1, 1, 1], rojo: 6 }); // tiene un rojo de 6 sin usar: NO cuenta
  fijarDados(E, 3, { blancos: [5, 5, 2, 2, 1, 1, 1, 1, 1], rojo: 1 });
  const reg = enfrentamiento(E, PRIMEROS);
  assert.deepEqual(reg.puntos, [6, 3, 0, 1], 'sobrantes 6 > 3 > 2 > 1 (el jugador 3 tiene un rojo de 6 que no se cuenta)');
  assert.deepEqual(reg.porDesempate, [true, true, true, true]);
});

test('un desempate sin blancos que sobren vale 0: quien conserva un blanco supera a quien ya los gasto todos', () => {
  const E = enPrimerEnfrentamiento(['MORE', 'MORE', 'MORE', 'MORE']);
  fijarDados(E, 0, { blancos: Array(9).fill(4), rojo: 1, azul: 1 });
  fijarDados(E, 1, { blancos: Array(9).fill(4), rojo: 4, azul: 1 });
  fijarDados(E, 2, { blancos: [1, 2, 3, 1, 2, 3, 1, 2, 3] });
  fijarDados(E, 3, { blancos: [1, 2, 3, 1, 2, 3, 1, 2, 3] });
  enfrentamiento(E, PRIMEROS);
  enfrentamiento(E, [['b4', 'b5', 'b6'], ['b4', 'b5', 'b6'], ['b4', 'b5', 'b6'], ['b4', 'b5', 'b6']]);
  // enfrentamiento 3: J1 se queda sin blancos (b7 b8 b9); J2 juega b7 b8 y el rojo (4) y le sobra b9 (4)
  const reg = enfrentamiento(E, [['b7', 'b8', 'b9'], ['b7', 'b8', 'rojo'], ['b7', 'b8', 'b9'], ['b7', 'b8', 'b9']]);
  assert.deepEqual(reg.combos[1].valores, [4, 4, 4]);
  assert.equal(reg.puntos[1], 6, 'J2 gana el enfrentamiento por el blanco que le sobra');
  assert.equal(reg.puntos[0], 3, 'J1 queda segundo: sobrante 0');
  assert.deepEqual([reg.porDesempate[0], reg.porDesempate[1]], [true, true]);
  assert.notEqual(reg.cierre, null, 'el tercer enfrentamiento cierra la ronda');
});

test('el cierre de ronda: premios exactos (MORE 9 -> 18; ZERO 0 -> 40; MIN 7.5 falla; MAX 11 -> 22), tarjetas usadas y ronda siguiente', () => {
  const E = enPrimerEnfrentamiento(['MORE', 'ZERO', 'MIN', 'MAX']);
  fijarDados(E, 0, { blancos: [6, 6, 6, 1, 1, 1, 1, 1, 1] });
  fijarDados(E, 1, { blancos: [1, 2, 4, 1, 1, 1, 1, 1, 1] });
  fijarDados(E, 2, { blancos: [5, 5, 1, 1, 1, 1, 1, 1, 1] });
  fijarDados(E, 3, { blancos: [5, 5, 1, 1, 1, 1, 1, 1, 1] });
  E.enfrentamiento = 3; // se salta a la ultima jugada de la ronda con los puntos de las dos primeras ya puestos
  E.puntosRonda = [36, 0, 66, 108];
  const reg = enfrentamiento(E, PRIMEROS);
  assert.deepEqual(reg.puntos, [6, 0, 2, 2], 'triple; sencillo; y los dos dobles iguales se reparten (3 + 1) / 2');
  assert.deepEqual(reg.cierre, {
    tarjetas: ['MORE', 'ZERO', 'MIN', 'MAX'], totales: [9, 0, 7.5, 11], aciertos: [true, true, false, true],
    puntos: [18, 40, 7.5, 22], acumulados: [18, 40, 7.5, 22],
  });
  assert.deepEqual(E.puntos, [216, 480, 90, 264]);
  assert.deepEqual(E.puntosBase, [108, 0, 90, 132]);
  assert.deepEqual(E.rondaPuntos, [[216], [480], [90], [264]]);
  assert.deepEqual(E.tarjetasUsadas, [['MORE'], ['ZERO'], ['MIN'], ['MAX']]);
  assert.deepEqual([E.ronda, E.fase, E.enfrentamiento], [2, 'prediccion', 0]);
  assert.deepEqual(E.tarjetaActual, [null, null, null, null]);
  assert.deepEqual(E.gastados[0], { blancos: [], rojo: false, azul: false });
  assert.deepEqual(E.puntosRonda, [0, 0, 0, 0]);
  assert.deepEqual(E.stats.map((st) => [st.predicciones, st.aciertos, st.ceros]), [[1, 1, 0], [1, 1, 1], [1, 0, 0], [1, 1, 0]]);
  assert.equal(E.historial.at(-1).tipo, 'cierre');
  assert.equal(reg.final, null);
});

test('una jugada de reemplazo no mide a la IA: ni los ocultos que el juego uso ni las tarjetas que puso el juego', () => {
  const E = nuevoEstado();
  aplicarTurno(E, [null, null, null, null]); // todas las tarjetas son de reemplazo
  E.azar.dados[0][0] = Array(4).fill([0.99, 0.99, 0.99]); // el reemplazo toma del final de la lista de disponibles: azul, rojo y b9
  aplicarTurno(E, [null, null, null, null]);
  assert.deepEqual(E.stats.map((st) => st.ocultosUsados), [0, 0, 0, 0]);
  assert.deepEqual(E.eligio, [false, false, false, false]);
  assert.deepEqual(E.gastados[0], { blancos: ['b9'], rojo: true, azul: true });
});

test('dados ilegales se reemplazan por tres distintos de los que quedan, sorteados, y quedan anotados', () => {
  const E = enPrimerEnfrentamiento(['MORE', 'MORE', 'MORE', 'MORE']);
  E.azar.dados[0][0] = Array(4).fill([0, 0, 0]); // siempre los primeros disponibles
  E.gastados[2].blancos = ['b1']; // el jugador 3 ya gasto b1
  const reg = aplicarTurno(E, [
    normalizarRespuesta({ dados: ['b1', 'b1', 'b2'] }), // repetidos: mal formados
    normalizarRespuesta({ dados: ['b1', 'b2'] }), // dos dados
    normalizarRespuesta({ dados: ['b1', 'b2', 'b3'] }), // b1 ya gastado
    normalizarRespuesta({ tarjeta: 'MORE' }), // sin dados
  ]);
  assert.deepEqual(reg.motivos, ['dados mal formados', 'no son tres dados', 'dado no disponible', 'sin dados']);
  assert.deepEqual(reg.invalidas, [true, true, true, true]);
  assert.deepEqual(reg.combos[0].dados, ['b1', 'b2', 'b3']);
  assert.deepEqual(reg.combos[2].dados, ['b2', 'b3', 'b4'], 'sin b1, que ya gasto');
  const nula = aplicarTurno(E, [null, null, null, null]);
  assert.deepEqual(nula.motivos, Array(4).fill('sin respuesta legible'));
});

test('la ronda 4: la tarjeta que queda se pone sola, nadie responde y no se inventa ninguna invalidez', () => {
  const E = nuevoEstado();
  E.ronda = RONDAS;
  E.tarjetasUsadas = [['MIN', 'MORE', 'MAX'], ['ZERO', 'MORE', 'MAX'], ['ZERO', 'MIN', 'MAX'], ['ZERO', 'MIN', 'MORE']];
  const reg = aplicarTurno(E, [null, null, null, null]);
  assert.equal(reg.forzada, true);
  assert.deepEqual(E.tarjetaActual, ['ZERO', 'MIN', 'MORE', 'MAX']);
  assert.deepEqual(reg.invalidas, [null, null, null, null]);
  assert.deepEqual(reg.motivos, [null, null, null, null]);
  assert.deepEqual(E.stats.map((st) => st.respuestas), [0, 0, 0, 0]);
  assert.deepEqual(E.eligio, [false, false, false, false]);
  assert.match(reg.narracion.map((l) => l.texto).join(' '), /una sola tarjeta y se pone sola/);
});

test('partida completa con una politica sencilla: 16 turnos, 60 llamadas, cada tarjeta una vez por jugador y 10 puntos por enfrentamiento', () => {
  const { E, registros, llamadas } = jugarConBots(3, simples);
  assert.equal(registros.length, TURNOS);
  assert.equal(llamadas, 60);
  assert.equal(E.fin, true);
  assert.notEqual(E.final, null);
  for (const usadas of E.tarjetasUsadas) assert.deepEqual([...usadas].sort(), [...TARJETAS].sort());
  assert.deepEqual(registros.map((r) => r.fase), Array.from({ length: TURNOS }, (_, i) => (i % 4 === 0 ? 'prediccion' : 'jugada')));
  assert.equal(registros[12].forzada, true);
  assert.equal(E.puntosBase.reduce((a, b) => a + b, 0), 12 * 120, '12 enfrentamientos x 10 puntos');
  assert.ok(E.puntos.every((p) => Number.isInteger(p)));
  assert.equal(registros.at(-1).final, E.final);
  assert.equal(registros.at(-1).cierre.acumulados.length, 4);
});

test('una politica que siempre contesta basura tambien termina: todo es reemplazo y las tarjetas siguen saliendo una vez', () => {
  const basura = () => ({ tarjeta: 'x', dados: ['b0'], razon: 'basura' });
  const { E, registros, llamadas } = jugarConBots(4, [basura, basura, basura, basura]);
  assert.equal(registros.length, TURNOS);
  assert.equal(llamadas, 60);
  for (const usadas of E.tarjetasUsadas) assert.deepEqual([...usadas].sort(), [...TARJETAS].sort());
  assert.deepEqual(E.stats.map((st) => st.invalidas), [15, 15, 15, 15]);
  assert.deepEqual(E.stats.map((st) => st.respuestas), [15, 15, 15, 15]);
  assert.equal(registros[12].invalidas[0], null);
});

test('el cierre de la partida: pieza para el mas alto en solitario, eliminado el mas bajo en solitario, y los empates dejan a nadie', () => {
  const con = (puntos) => {
    const E = nuevoEstado();
    E.puntos = puntos.map((p) => p * 12);
    cerrarPartida(E);
    return E;
  };
  let E = con([100, 50, 50, 10]);
  assert.deepEqual([E.final.pieza, E.final.eliminado], [0, 3]);
  assert.deepEqual(E.puesto, ['pieza', 'medio', 'medio', 'eliminado']);
  assert.equal(E.fin, true);
  E = con([100, 100, 50, 10]);
  assert.deepEqual([E.final.pieza, E.final.eliminado, E.final.criterioPieza], [null, 3, 'sin pieza']);
  E = con([100, 50, 10, 10]);
  assert.deepEqual([E.final.pieza, E.final.eliminado, E.final.criterioEliminado], [0, null, 'sin eliminado']);
  E = con([30, 30, 30, 30]);
  assert.deepEqual([E.final.pieza, E.final.eliminado], [null, null]);
  assert.deepEqual(E.puesto, ['medio', 'medio', 'medio', 'medio']);
  E = con([40, 90, 60, 20]);
  assert.deepEqual(E.final.ranking, [1, 2, 0, 3]);
});

test('el registro trae lo que la arena y el reproductor esperan; el crudo de una respuesta invalida se recorta; una partida terminada no acepta turnos', () => {
  const E = nuevoEstado();
  const mala = { ...normalizarRespuesta('basura'), crudo: 'x'.repeat(900), error: 'HTTP 500' };
  const reg = aplicarTurno(E, [mala, ...Array(3).fill(normalizarRespuesta({ tarjeta: 'MIN', razon: 'ok' }))]);
  assert.equal(reg.errores.length, 4);
  assert.equal(reg.errores[0], 'HTTP 500');
  assert.equal(reg.crudos[0].length, 400);
  assert.deepEqual(reg.crudos.slice(1), [null, null, null]);
  assert.deepEqual(reg.razones.slice(1), ['ok', 'ok', 'ok']);
  assert.equal(reg.final, null);
  assert.throws(() => aplicarTurno(jugarConBots(3, simples).E, [null, null, null, null]), /ya termino/);
});

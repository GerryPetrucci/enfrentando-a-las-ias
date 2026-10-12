// Duda y apuesta: el turno (una decision de un jugador), el enfrentamiento, las fichas y el final. Sin red y sin API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actorDe, cartasDe, totalCartas, espacios } from '../../juegos/dudaapuesta/estado.js';
import { aplicarTurno, cerrarPartida } from '../../juegos/dudaapuesta/turno.js';
import { COLORES, MANOS, MAZO } from '../../juegos/dudaapuesta/constantes.js';
import { nuevoEstado, fijarCartas, escenarioBasico, paso, anunciar, aceptar, dudar, igualar, retirarse } from './ayudas.js';

const enMano1 = () => { const E = nuevoEstado(); escenarioBasico(E); return E; };

test('estado inicial: 4 jugadores con 3 fichas de juego, 4 de espacio y 5 espacios; abre el asiento 1 y es el unico que decide', () => {
  const E = nuevoEstado();
  assert.deepEqual(E.fichas, [3, 3, 3, 3]);
  assert.deepEqual(E.fichasEspacio, [4, 4, 4, 4]);
  assert.deepEqual([0, 1, 2, 3].map((s) => espacios(E, s)), [5, 5, 5, 5]);
  assert.equal(totalCartas(E), 20);
  assert.deepEqual([E.mano, E.fase, E.inicia, E.decision, actorDe(E)], [1, 'anuncio', 0, 1, 0]);
  for (let s = 0; s < 4; s++) assert.equal(cartasDe(E, s).length, 5);
});

test('las cartas se reparten de antemano por asiento: salen del mazo de 60 y no dependen de las decisiones', () => {
  const A = nuevoEstado(9), B = nuevoEstado(9);
  assert.deepEqual(A.manos, B.manos, 'mismo seed, mismas cartas');
  assert.equal(A.manos.length, MANOS);
  for (const mano of A.manos) {
    const todas = mano.flat();
    assert.equal(todas.length, 20);
    for (const tipo of [...COLORES, 'arcoiris']) assert.ok(todas.filter((c) => c === tipo).length <= 10, 'nunca mas de 10 de un tipo');
  }
  assert.equal(MAZO.length, 60);
  anunciar(A, 'rojo', 3);
  dudar(A);
  retirarse(B); // respuesta ilegal en la fase equivocada: se reemplaza
  assert.deepEqual(A.manos[1], B.manos[1], 'las cartas de la mano 2 no cambian por lo que se decidio en la mano 1');
});

test('anunciar: queda en la cadena, pasa a "respuesta" y le toca al jugador que sigue', () => {
  const E = enMano1();
  const reg = anunciar(E, 'rojo', 7, 2);
  assert.deepEqual(E.cadena.map((c) => ({ asiento: c.asiento, color: c.color, cantidad: c.cantidad, apuesta: c.apuesta })), [{ asiento: 0, color: 'rojo', cantidad: 7, apuesta: { fichas: 2, espacios: 0 } }]);
  assert.deepEqual([E.fase, actorDe(E), E.decision], ['respuesta', 1, 2]);
  assert.deepEqual(reg.invalidas, [false, null, null, null]);
  assert.equal(reg.accion, 'anunciar');
  assert.deepEqual(reg.anuncio, { color: 'rojo', cantidad: 7 });
});

test('un anuncio ilegal se reemplaza por uno legal y se anota: cantidad 0 o de mas, color inexistente o arcoiris, sin color, sin cantidad, sin apuesta, basura', () => {
  const casos = [
    { color: 'rojo', cantidad: 0, fichas: 1 }, { color: 'rojo', cantidad: 21, fichas: 1 }, { color: 'rojo', cantidad: 999999999, fichas: 1 }, { color: 'rojo', cantidad: -2, fichas: 1 }, { color: 'rojo', cantidad: 3, apuesta: 2 }, { color: 'arcoiris', cantidad: 3, fichas: 1 }, { color: 'violeta', cantidad: 3, fichas: 1 },
    { cantidad: 3, fichas: 1 }, { color: 'rojo', fichas: 1 }, { color: 'rojo', cantidad: 3, fichas: 0, espacios: 0 }, { color: 'rojo', cantidad: 3 },
    { accion: 'dudar', color: 'rojo', cantidad: 3, fichas: 1 }, null, 'hola', [],
  ];
  for (const c of casos) {
    const E = enMano1();
    const reg = paso(E, c);
    assert.equal(reg.invalidas[0], true, JSON.stringify(c));
    assert.ok(reg.motivos[0], JSON.stringify(c));
    assert.equal(E.cadena.length, 1);
    assert.equal(E.cadena[0].reemplazo, true);
    assert.ok(COLORES.includes(E.cadena[0].color));
    assert.ok(E.cadena[0].cantidad >= 1 && E.cadena[0].cantidad <= totalCartas(E));
    assert.deepEqual(E.cadena[0].apuesta, { fichas: 1, espacios: 0 });
    assert.equal(E.stats[0].invalidas, 1);
  }
});

test('sin "accion" la decision es invalida en cualquier fase, tambien al abrir la mano (el spec lo exige: seguir el formato se mide)', () => {
  const E = enMano1();
  const reg = paso(E, { color: 'rojo', cantidad: 4, fichas: 1, razon: 'sin accion' });
  assert.equal(reg.invalidas[0], true);
  assert.equal(reg.motivos[0], 'sin accion');
  assert.equal(E.cadena[0].reemplazo, true, 'el anuncio lo puso el juego');
  const reg2 = paso(E, { razon: 'sin accion' });
  assert.equal(reg2.invalidas[1], true);
  assert.equal(reg2.motivos[1], 'sin accion');
});

test('una apuesta de mas se recorta (no es error) y nunca pasa de lo que tiene quien te contesta', () => {
  const E = enMano1();
  E.fichas[1] = 1;
  E.fichasEspacio[1] = 0; // J2 solo tiene 1 ficha en total
  const reg = anunciar(E, 'rojo', 5, 99, 99);
  assert.equal(reg.invalidas[0], false);
  assert.deepEqual(E.cadena[0].apuesta, { fichas: 1, espacios: 0 }, 'J1 no puede apostar mas fichas de las que J2 puede igualar');
  const F = enMano1();
  const reg2 = anunciar(F, 'rojo', 5, 99, 99);
  assert.equal(reg2.invalidas[0], false);
  assert.deepEqual(F.cadena[0].apuesta, { fichas: 3, espacios: 4 }, 'todo lo que tiene, 7 fichas, si J2 tambien tiene 7');
});

test('aceptar: quien anuncio recupera su apuesta (nadie pierde nada) y el nuevo anuncio sube la cantidad, de cualquier color', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 5, 2);
  const reg = aceptar(E, 'azul', 6, 1);
  assert.equal(reg.invalidas[1], false);
  assert.deepEqual(E.fichas, [3, 3, 3, 3]);
  assert.deepEqual(E.cadena.map((c) => `${c.asiento} ${c.color} ${c.cantidad}`), ['0 rojo 5', '1 azul 6']);
  assert.deepEqual([E.fase, actorDe(E)], ['respuesta', 2]);
  assert.equal(reg.resolucion, null);
});

test('aceptar con una cantidad que no sube (igual o menor) es ilegal y el juego duda por ti', () => {
  for (const cantidad of [5, 4]) {
    const E = enMano1();
    anunciar(E, 'rojo', 5, 2);
    const reg = aceptar(E, 'azul', cantidad, 1);
    assert.equal(reg.invalidas[1], true);
    assert.equal(reg.motivos[1], 'cantidad fuera de rango');
    assert.ok(E.cadena.length === 2 || reg.accion === 'dudar', 'o acepta con una cantidad legal o duda');
  }
});

test('el cuarto anuncio obliga a dudar, y tambien un anuncio igual a todas las cartas en juego', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 1);
  aceptar(E, 'rojo', 2);
  aceptar(E, 'rojo', 3);
  aceptar(E, 'rojo', 4);
  assert.equal(E.cadena.length, 4);
  const reg = aceptar(E, 'rojo', 5);
  assert.equal(reg.invalidas[0], true, 'ya no se puede aceptar');
  assert.equal(reg.motivos[0], 'no se puede aceptar');
  assert.equal(reg.accion, 'dudar', 'el juego duda por J1');
  const F = enMano1();
  anunciar(F, 'rojo', 20);
  const reg2 = aceptar(F, 'azul', 21);
  assert.equal(reg2.motivos[1], 'no se puede aceptar', 'hay 20 cartas: no cabe una cantidad mayor');
});

test('dudar sin decir cuanto iguala; "al menos": con exactamente lo anunciado gana quien anuncio', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 6, 1);
  const reg = dudar(E);
  assert.equal(reg.resolucion.tipo, 'recuento');
  assert.equal(reg.resolucion.real, 6);
  assert.deepEqual(reg.resolucion.cuentas, [2, 2, 0, 2]);
  assert.equal(reg.resolucion.ganador, 0);
  assert.deepEqual(E.fichas, [4, 2, 3, 3]);
  assert.deepEqual([E.mano, E.inicia, E.fase, actorDe(E)], [2, 1, 'anuncio', 1], 'la siguiente mano la abre quien perdio');
  assert.equal(reg.finMano, true);
});

test('si hay menos de lo anunciado gana quien duda', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 7, 1);
  const reg = dudar(E);
  assert.equal(reg.resolucion.ganador, 1);
  assert.deepEqual(E.fichas, [2, 4, 3, 3]);
  assert.equal(E.inicia, 0);
  assert.match(reg.narracion.map((l) => l.texto).join(' '), /no se cumplía: era un farol/);
});

test('las arcoiris cuentan como cualquier color (y los espacios que no se tienen no cuentan)', () => {
  const E = nuevoEstado();
  fijarCartas(E, 0, ['azul', 'azul', 'azul', 'azul', 'azul']);
  fijarCartas(E, 1, ['verde', 'verde', 'verde', 'verde', 'verde']);
  fijarCartas(E, 2, ['morado', 'morado', 'morado', 'morado', 'morado']);
  fijarCartas(E, 3, ['arcoiris', 'arcoiris', 'arcoiris', 'arcoiris', 'arcoiris']);
  E.fichasEspacio[3] = 1; // J4 solo tiene 2 espacios: sus 2 primeras cartas
  anunciar(E, 'rojo', 2);
  const reg = dudar(E);
  assert.equal(reg.resolucion.real, 2, 'solo las 2 arcoiris de sus 2 espacios');
  assert.equal(reg.resolucion.ganador, 0);
});

test('dudar subiendo la apuesta pasa a la defensa; igualar completa la apuesta y se revelan las cartas', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 6, 1);
  const reg = dudar(E, 2);
  assert.equal(reg.resolucion, null);
  assert.deepEqual([E.fase, actorDe(E)], ['defensa', 0], 'le toca a quien anuncio');
  assert.deepEqual(E.duda.apuesta, { fichas: 2, espacios: 0 });
  const reg2 = igualar(E);
  assert.equal(reg2.resolucion.tipo, 'recuento');
  assert.deepEqual(reg2.resolucion.apuestaPredictor, { fichas: 2, espacios: 0 }, 'igualo hasta 2');
  assert.deepEqual(E.fichas, [5, 1, 3, 3], 'hay 6: gana J1 las 2 fichas de J2');
  assert.deepEqual(reg2.resolucion.movidas, { fichas: 2, espacios: 0 });
});

test('retirarse: pierde lo que habia apostado, lo gana quien duda y las cartas no se revelan', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 6, 1);
  dudar(E, 3);
  const reg = retirarse(E);
  assert.equal(reg.resolucion.tipo, 'retirada');
  assert.equal(reg.resolucion.cuentas, null);
  assert.equal(reg.resolucion.real, null);
  assert.deepEqual(E.fichas, [2, 4, 3, 3], 'solo la apuesta original de J1 (1), no la subida');
  assert.equal(E.inicia, 0);
  assert.equal(E.stats[0].retiradas, 1);
  assert.match(reg.narracion.map((l) => l.texto).join(' '), /no se revelan/);
});

test('dudar con menos fichas que el anuncio es ilegal: el juego juega por ti (aqui, con el sorteo de reemplazo que elige dudar, igualando)', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 6, 2);
  E.azar[E.turno][0] = 0.9; // el sorteo de reemplazo de este turno: dudar (con menos de 0.5 aceptaria)
  const reg = dudar(E, 1);
  assert.equal(reg.invalidas[1], true);
  assert.equal(reg.motivos[1], 'apuesta menor que la del anuncio');
  assert.equal(reg.resolucion.tipo, 'recuento', 'igualo con 2 y se revelaron las cartas');
  assert.deepEqual(reg.resolucion.apuestaDudador, { fichas: 2, espacios: 0 });
});

test('quien duda no puede subir mas de lo que tiene quien anuncio', () => {
  const E = enMano1();
  E.fichas[0] = 1;
  E.fichasEspacio[0] = 0;
  anunciar(E, 'rojo', 6, 1);
  const reg = dudar(E, 99, 99);
  assert.equal(reg.invalidas[1], false);
  assert.equal(reg.resolucion.tipo, 'recuento', 'el tope es 1 ficha: igualo, no hay subida y se revelan las cartas');
});

test('fichas de espacio: perderlas quita espacios; ganarlas devuelve espacios; con 4 ya al maximo se vuelven fichas de juego', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 6, 0, 2); // J1 apuesta 2 fichas de espacio
  dudar(E); // iguala con la misma composicion: 2 fichas de espacio; hay 6, gana J1
  assert.deepEqual(E.fichasEspacio, [4, 2, 4, 4], 'J2 pierde 2 espacios');
  assert.deepEqual(E.fichas, [5, 3, 3, 3], 'J1 ya tenia 4 fichas de espacio: las 2 ganadas se vuelven fichas de juego');
  const F = enMano1();
  anunciar(F, 'rojo', 7, 0, 2);
  const reg = dudar(F, 0, 2); // J2 duda con 2 fichas de espacio; hay 6 < 7: gana J2
  assert.equal(reg.resolucion.ganador, 1);
  assert.deepEqual(F.fichasEspacio, [2, 4, 4, 4], 'J1 pierde 2 espacios; J2 ya tenia 4 fichas de espacio');
  assert.deepEqual(F.fichas, [3, 5, 3, 3], 'las 2 fichas de espacio ganadas se vuelven fichas de juego');
  assert.equal(espacios(F, 0), 3);
  assert.equal(cartasDe(F, 0).length, 3, 'una carta menos por cada espacio perdido');
  const G = enMano1();
  G.fichasEspacio[1] = 2; // J2 tiene 3 espacios
  anunciar(G, 'rojo', 7, 0, 2);
  dudar(G, 0, 2);
  assert.deepEqual(G.fichasEspacio, [2, 4, 4, 4], 'J2 recupera 2 espacios al ganar');
  assert.deepEqual(G.fichas, [3, 3, 3, 3]);
});

test('comprar un espacio: cuesta 1 ficha de juego, vale desde la mano siguiente, pide al menos 2 fichas y menos de 5 espacios; una respuesta ilegal no lo pide', () => {
  const E = enMano1();
  E.fichasEspacio[0] = 2;
  anunciar(E, 'rojo', 6, 1, 0, { comprar_espacio: true });
  const reg = dudar(E); // gana J1: tiene 4 fichas
  assert.deepEqual(reg.compras, [0]);
  assert.equal(E.fichasEspacio[0], 3);
  assert.equal(E.fichas[0], 3, '4 fichas - 1 del cambio');
  const F = enMano1();
  F.fichasEspacio[0] = 2;
  F.fichas[0] = 1;
  anunciar(F, 'rojo', 7, 1, 0, { comprar_espacio: true });
  dudar(F); // pierde y se queda sin fichas: eliminado, no compra
  assert.equal(F.fichasEspacio[0], 2);
  const G = enMano1();
  anunciar(G, 'rojo', 6, 1, 0, { comprar_espacio: true });
  assert.deepEqual(dudar(G).compras, [], 'con 4 fichas de espacio ya tiene 5 espacios: no se puede');
  const H = enMano1();
  H.fichasEspacio[0] = 2;
  paso(H, { accion: 'anunciar', color: 'violeta', cantidad: 6, fichas: 1, comprar_espacio: true });
  assert.equal(H.pideEspacio[0], false, 'la respuesta ilegal no pide nada');
});

test('el pago a la banca: al terminar la mano 15 cada jugador paga una ficha de juego; en la 14 no', () => {
  const E = enMano1();
  E.mano = 14;
  fijarCartas(E, 0, ['rojo', 'rojo', 'rojo', 'rojo', 'rojo'], 14);
  anunciar(E, 'rojo', 1);
  const reg = dudar(E);
  assert.equal(reg.pago, false);
  assert.deepEqual(E.fichas, [4, 2, 3, 3]);
  anunciar(E, 'rojo', 1); // mano 15 abre J2 (perdio)
  const reg2 = dudar(E);
  assert.equal(reg2.pago, true);
  assert.equal(E.fichas.reduce((a, b) => a + b, 0), 12 - 4, 'pagaron 4 fichas a la banca');
  assert.match(reg2.narracion.map((l) => l.texto).join(' '), /paga una ficha de juego a la banca/);
});

// mano 15 con cartas conocidas: J1 tiene 5 rojas y los demas ninguna, asi que "al menos 1 roja" se cumple
function enMano15(fichas) {
  const E = enMano1();
  E.mano = 15;
  E.fichas = fichas;
  fijarCartas(E, 0, ['rojo', 'rojo', 'rojo', 'rojo', 'rojo'], 15);
  for (const s of [1, 2, 3]) fijarCartas(E, s, ['azul', 'azul', 'azul', 'azul', 'azul'], 15);
  return E;
}

test('si el pago a la banca deja a varios en 0 a la vez, todos quedan eliminados', () => {
  const E = enMano15([3, 2, 1, 1]);
  anunciar(E, 'rojo', 1);
  const reg = dudar(E); // gana J1: J2 pone 1 ficha (2 -> 1); nadie esta en 0 aun, asi que se cobra el pago: J2, J3 y J4 quedan en 0
  assert.equal(reg.pago, true);
  assert.deepEqual(E.fichas, [3, 0, 0, 0], 'J1 4 - 1; los demas pagan su ultima ficha');
  assert.equal(E.fin, true);
  assert.deepEqual(E.final.eliminados, [1, 2, 3]);
  assert.deepEqual(E.puesto, ['pieza', 'eliminado', 'eliminado', 'eliminado']);
});

test('si la mano ya dejo a alguien sin fichas, la partida termina y el pago a la banca no se cobra: nunca hay fichas negativas ni eliminados "de mas"', () => {
  const E = enMano15([1, 1, 1, 1]);
  anunciar(E, 'rojo', 1);
  const reg = dudar(E); // gana J1: J2 pierde su unica ficha y la partida termina ahi
  assert.equal(reg.pago, false, 'la partida ya habia terminado: no hay a quien cobrar');
  assert.deepEqual(E.fichas, [2, 0, 1, 1]);
  assert.ok(E.fichas.every((f) => f >= 0));
  assert.deepEqual(E.final.eliminados, [1], 'J3 y J4 no pierden nada por lo que le paso a J2');
  assert.deepEqual(E.puesto, ['pieza', 'eliminado', 'medio', 'medio']);
  assert.doesNotMatch(reg.narracion.map((l) => l.texto).join(' '), /paga una ficha de juego a la banca/);
});

test('dudar cuenta fichas EN TOTAL: si no tiene las de juego que pide, se completa con las de espacio y la duda no se invalida', () => {
  const E = enMano1();
  E.fichas[1] = 1; // J2: 1 ficha de juego y 4 de espacio
  anunciar(E, 'rojo', 6, 2);
  const reg = dudar(E, 2, 0); // pide 2 fichas de juego, tiene 1: pone 1 de juego y 1 de espacio
  assert.equal(reg.invalidas[1], false, 'el total pedido (2) era legal');
  assert.deepEqual(reg.apuesta, { fichas: 1, espacios: 1 });
  assert.equal(reg.resolucion.tipo, 'recuento');
  const F = enMano1();
  F.fichas[1] = 1;
  anunciar(F, 'rojo', 6, 1);
  const reg2 = dudar(F, 3, 0); // sube a 3: 1 de juego y 2 de espacio
  assert.equal(reg2.invalidas[1], false);
  assert.deepEqual(F.duda.apuesta, { fichas: 1, espacios: 2 });
});

test('quedarse sin fichas de juego termina la partida: eliminado, pieza para el de mas fichas', () => {
  const E = enMano1();
  E.fichas = [1, 3, 3, 3];
  anunciar(E, 'rojo', 7, 1);
  const reg = dudar(E);
  assert.equal(E.fin, true);
  assert.equal(E.final.motivo, 'eliminacion');
  assert.deepEqual(E.final.eliminados, [0]);
  assert.equal(E.final.pieza, 1);
  assert.deepEqual(E.puesto, ['eliminado', 'pieza', 'medio', 'medio']);
  assert.notEqual(reg.final, null);
  assert.throws(() => paso(E, { accion: 'anunciar' }), /ya termino/);
});

test('el tope de manos: en la mano 16 es eliminado el de menos fichas de juego (desempata la de espacio; si no, nadie) y gana la pieza el de mas', () => {
  const caso = (fichas, fe, motivo = 'tope') => { const E = nuevoEstado(); E.fichas = fichas; E.fichasEspacio = fe; cerrarPartida(E, motivo); return E; };
  let E = caso([3, 2, 2, 1], [4, 4, 4, 4]);
  assert.deepEqual([E.final.eliminados, E.final.pieza], [[3], 0]);
  E = caso([2, 2, 3, 3], [4, 4, 4, 4]);
  assert.deepEqual([E.final.eliminados, E.final.pieza], [[], null], 'empate abajo y arriba: nadie');
  E = caso([2, 2, 3, 3], [1, 3, 4, 2]);
  assert.deepEqual([E.final.eliminados, E.final.pieza], [[0], 2], 'desempata la ficha de espacio');
  assert.deepEqual(E.puesto, ['eliminado', 'medio', 'pieza', 'medio']);
  E = caso([2, 3, 3, 3], [4, 4, 4, 4]);
  assert.deepEqual([E.final.eliminados, E.final.pieza], [[0], null], 'tres empatados arriba: nadie gana la pieza');
});

test('la ultima mano cierra la partida por tope', () => {
  const E = enMano1();
  E.mano = MANOS;
  fijarCartas(E, 0, ['rojo', 'rojo', 'rojo', 'rojo', 'rojo'], MANOS);
  anunciar(E, 'rojo', 1);
  const reg = dudar(E);
  assert.equal(reg.final.motivo, 'tope');
  assert.equal(E.fin, true);
});

test('una respuesta de mas en la defensa o fuera de turno se reemplaza: igualar o retirarse al azar, siempre legal', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const E = nuevoEstado(seed);
    anunciar(E, 'rojo', 3, 1);
    dudar(E, 2);
    assert.equal(E.fase, 'defensa');
    const reg = paso(E, null); // el modelo cayo
    assert.equal(reg.invalidas[0], true);
    assert.ok(['igualar', 'retirarse'].includes(reg.accion));
    assert.equal(reg.motivos[0], 'sin respuesta legible');
    assert.equal(E.historial[0].defensa.reemplazo, true, 'la mano termino y quedo anotado en el historial');
  }
});

test('el reemplazo es el mismo para el mismo seed y siempre legal en las tres fases', () => {
  const jugar = (seed) => {
    const E = nuevoEstado(seed);
    const out = [paso(E, null).accion, paso(E, null).accion];
    if (E.fase === 'defensa') out.push(paso(E, null).accion);
    return { out, cadena: JSON.stringify(E.cadena) };
  };
  for (let seed = 1; seed <= 40; seed++) {
    assert.deepEqual(jugar(seed), jugar(seed));
    const E = nuevoEstado(seed);
    paso(E, null);
    assert.ok(E.cadena[0].cantidad <= 2 && E.cadena[0].apuesta.fichas === 1);
  }
});

test('el registro de un turno: un solo jugador responde, las cartas de todos y el conteo por color van en `oculto`', () => {
  const E = enMano1();
  const reg = anunciar(E, 'rojo', 6, 2, 0, { razon: 'prueba', comprar_espacio: false });
  assert.deepEqual([reg.mano, reg.decision, reg.turno, reg.asiento, reg.fase, reg.tenia], [1, 1, 1, 0, 'anuncio', 7]);
  for (const k of ['razones', 'invalidas', 'motivos', 'errores', 'crudos']) assert.equal(reg[k].length, 4, k);
  assert.deepEqual(reg.razones, ['prueba', null, null, null]);
  assert.deepEqual(reg.errores, [null, null, null, null]);
  assert.equal(reg.oculto.cartas.length, 4);
  assert.deepEqual(reg.oculto.cartas[1], ['rojo', 'arcoiris', 'azul', 'azul', 'verde']);
  assert.equal(reg.oculto.cuentas.rojo, 6);
  assert.equal(reg.oculto.cuentas.azul, 6);
  assert.deepEqual(reg.fichas, [3, 3, 3, 3]);
  assert.doesNotMatch(JSON.stringify(reg), /NaN|undefined/);
  assert.ok(reg.narracion.length >= 2);
});

test('la mano terminada queda en el historial publico', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 6, 1);
  dudar(E);
  assert.equal(E.historial.length, 1);
  const h = E.historial[0];
  assert.deepEqual([h.mano, h.inicia, h.cadena.length, h.duda.asiento, h.defensa, h.resolucion.ganador, h.pago, h.compras], [1, 0, 1, 1, null, 0, false, []]);
});

test('un jugador que responde mal en la arena (modelo caido: respuesta nula) no tumba nada: aplicarTurno acepta null', () => {
  const E = enMano1();
  const reg = aplicarTurno(E, [null, null, null, null]);
  assert.equal(reg.invalidas[0], true);
  assert.equal(reg.motivos[0], 'sin respuesta legible');
  assert.equal(E.cadena.length, 1);
});

test('una accion de otra fase se reemplaza y no cambia el estado de forma ilegal: aceptar en la defensa, anunciar al responder, dudar al abrir', () => {
  const E = enMano1();
  const reg = dudar(E); // al abrir la mano solo se puede anunciar
  assert.equal(reg.invalidas[0], true);
  assert.equal(reg.motivos[0], 'accion no permitida ahora');
  assert.equal(E.cadena[0].reemplazo, true);
  const reg2 = anunciar(E, 'rojo', 9, 1); // al responder solo se puede aceptar o dudar
  assert.equal(reg2.invalidas[1], true);
  assert.equal(reg2.motivos[1], 'accion no permitida ahora');
  const F = enMano1();
  anunciar(F, 'rojo', 6, 1);
  dudar(F, 2);
  assert.equal(F.fase, 'defensa');
  const reg3 = aceptar(F, 'azul', 9, 1); // en la defensa solo se puede igualar o retirarse
  assert.equal(reg3.invalidas[0], true);
  assert.equal(reg3.motivos[0], 'accion no permitida ahora');
  assert.equal(F.mano, 2, 'la mano se resolvio con la jugada de reemplazo');
});

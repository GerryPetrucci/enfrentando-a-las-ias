// Duda y apuesta: la vista. Es el UNICO lugar donde se decide que sabe cada jugador: aqui se prueba que no filtra las cartas ajenas.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaTexto } from '../../juegos/dudaapuesta/vista.js';
import { actorDe } from '../../juegos/dudaapuesta/estado.js';
import { aplicarTurno } from '../../juegos/dudaapuesta/turno.js';
import { normalizarRespuesta } from '../../juegos/dudaapuesta/ordenes.js';
import { crearRng } from '../../rng.js';
import { BOTS } from '../../juegos/dudaapuesta-bots.js';
import { nuevoEstado, escenarioBasico, anunciar, aceptar, dudar, igualar, retirarse, paso } from './ayudas.js';

const enMano1 = () => { const E = nuevoEstado(); escenarioBasico(E); return E; };

test('al abrir la mano: tus cartas (y solo las tuyas), la tabla, y exactamente que puedes hacer con sus limites', () => {
  const E = enMano1();
  const v = vistaTexto(E, 0);
  assert.match(v, /^MANO 1 DE 16 - DECISION 1 DE ESTA MANO/);
  assert.ok(v.includes('Eres el Jugador 1 (en el historial apareces como J1)'));
  assert.ok(v.includes('TUS CARTAS (5): rojo rojo azul verde amarillo'));
  assert.ok(!v.includes('rojo arcoiris azul azul verde'), 'no ve las de J2');
  assert.ok(v.includes('J1 (tu) 3f 4e 5c | J2 3f 4e 5c | J3 3f 4e 5c | J4 3f 4e 5c'));
  assert.ok(v.includes('CARTAS EN JUEGO: 20. Esta mano abrio J1.'));
  assert.ok(v.includes('ES TU TURNO: abres la mano. accion "anunciar": un color, una cantidad de 1 a 20 y tu apuesta de 1 a 7 fichas en total.'));
  assert.ok(v.includes('Tienes 3 fichas de juego y 4 de espacio.'));
  assert.ok(v.includes('"comprar_espacio": true') === false, 'con 5 espacios no se puede comprar otro');
});

test('quien no decide ve que debe esperar, sin las cartas de nadie', () => {
  const E = enMano1();
  const v = vistaTexto(E, 2);
  assert.ok(v.includes('Espera: decide J1.'));
  assert.ok(!v.includes('ES TU TURNO'));
  assert.ok(v.includes('TUS CARTAS (5): morado morado amarillo verde verde'));
});

test('al responder: el ultimo anuncio, aceptar con su rango y dudar con el minimo y el tope', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 6, 2);
  const v = vistaTexto(E, 1);
  assert.ok(v.includes('ANUNCIOS DE ESTA MANO:\n1. J1 anuncia al menos 6 rojo, apuesta 2f'));
  assert.ok(v.includes('ES TU TURNO: J1 anuncio al menos 6 rojo y apuesta 2f.'));
  assert.ok(v.includes('accion "aceptar": J1 recupera su apuesta y tu anuncias una cantidad MAYOR (de 7 a 20) con tu apuesta de 1 a 7 fichas en total. Es el anuncio 2 de 4.'));
  assert.ok(v.includes('accion "dudar": apuestas de 2 a 7 fichas en total (si no dices cuanto, igualas con 2).'));
});

test('despues de cuatro anuncios, aceptar no esta permitido', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 1);
  aceptar(E, 'rojo', 2);
  aceptar(E, 'rojo', 3);
  aceptar(E, 'rojo', 4);
  const v = vistaTexto(E, 0);
  assert.ok(v.includes('aceptar NO esta permitido (ya van 4 anuncios): debes dudar.'));
  assert.ok(v.includes('4. J4 acepta y anuncia al menos 4 rojo, apuesta 1f'));
});

test('en la defensa: la subida, la diferencia y las dos salidas', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 6, 1);
  dudar(E, 3);
  const v = vistaTexto(E, 0);
  assert.ok(v.includes('J2 duda con 3f'));
  assert.ok(v.includes('ES TU TURNO: J2 dudo de tu anuncio (al menos 6 rojo) y subio su apuesta a 3f; la tuya es 1f.'));
  assert.ok(v.includes('accion "igualar" (pones 2 fichas mas y se revelan las cartas) o accion "retirarse"'));
});

test('el historial es publico y compacto: anuncios, duda, respuesta, conteo por jugador y quien gana', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 6, 1);
  dudar(E, 2);
  igualar(E);
  const v = vistaTexto(E, 3);
  assert.ok(v.includes('MANOS TERMINADAS:\nM1: J1 6 rojo 1f | J2 duda 2f | J1 iguala | hay 6 (J1 2 J2 2 J3 0 J4 2) | gana J1 +2f'));
  assert.ok(v.includes('MANO 2 DE 16'));
  assert.ok(v.includes('Esta mano abrio J2.'));
});

test('una retirada no revela nada: no hay conteo; y una jugada del juego se marca con *', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 6, 1);
  dudar(E, 3);
  retirarse(E);
  const v = vistaTexto(E, 1);
  assert.ok(v.includes('M1: J1 6 rojo 1f | J2 duda 3f | J1 se retira | gana J2 +1f'), v);
  assert.doesNotMatch(v, /hay \d/);
  const F = enMano1();
  paso(F, null); // J1 no responde: anuncio de reemplazo
  const w = vistaTexto(F, 1);
  assert.match(w, /1\. J1 anuncia al menos \d+ \w+, apuesta 1f\*/);
});

test('con mas de 5 manos terminadas se muestran las ultimas 5 y las demas se resumen', () => {
  const E = nuevoEstado(5);
  const fns = [BOTS.azar, BOTS.azar, BOTS.azar, BOTS.azar];
  const rngs = fns.map((_, s) => crearRng(100 + s));
  E.fichas = [30, 30, 30, 30]; // para que nadie se elimine y la partida llegue lejos
  while (!E.fin && E.historial.length < 9) {
    const s = actorDe(E), r = Array(4).fill(null);
    r[s] = normalizarRespuesta(fns[s](E, s, rngs[s]));
    aplicarTurno(E, r);
  }
  const v = vistaTexto(E, 0);
  assert.match(v, /M1-M4 \(resumen\): enfrentamientos ganados J1 \d+ \| J2 \d+ \| J3 \d+ \| J4 \d+/);
  assert.equal(v.split('\n').filter((l) => /^M\d+:/.test(l)).length, 5);
  assert.ok(v.includes('\nM5:') && v.includes('\nM9:') && !v.includes('\nM4:'));
});

test('la compra de un espacio solo se ofrece a quien puede hacerla', () => {
  const E = enMano1();
  E.fichasEspacio[0] = 2;
  assert.ok(vistaTexto(E, 0).includes('agrega "comprar_espacio": true'));
  E.fichas[0] = 1;
  assert.ok(!vistaTexto(E, 0).includes('comprar_espacio'));
});

test('terminada la partida la vista solo dice las fichas finales', () => {
  const E = enMano1();
  E.fichas = [1, 3, 3, 3];
  anunciar(E, 'rojo', 7, 1);
  dudar(E);
  assert.equal(E.fin, true);
  const v = vistaTexto(E, 0);
  assert.match(v, /^PARTIDA TERMINADA\nFICHAS FINALES: J1 \(tu\) 0f \| J2 4f/);
  assert.doesNotMatch(v, /undefined|NaN/);
});

test('es texto ASCII (forma parte del prompt)', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 6, 1);
  dudar(E, 2);
  igualar(E);
  for (let i = 0; i < 4; i++) assert.match(vistaTexto(E, i), /^[\x00-\x7F]*$/);
});

// La prueba que importa: lo que NO es publico no cambia lo que ve nadie. Se juegan partidas con agentes variados y, en cada turno y para cada asiento,
// se cambian las cartas de TODOS los demas (en todas las manos), los sorteos de reemplazo, la semilla de la narracion y las estadisticas, y la vista no puede variar.
test('no interferencia: cambiar las cartas ajenas, los sorteos y las estadisticas no cambia la vista de nadie (30 partidas)', () => {
  const nombres = ['azar', 'calculador', 'farolero', 'retador', 'prudente'];
  let vistas = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const E = nuevoEstado(seed);
    const fns = [0, 1, 2, 3].map((k) => BOTS[nombres[(seed + k) % 5]]);
    const rngs = fns.map((_, s) => crearRng(seed * 7 + s));
    while (!E.fin) {
      for (let i = 0; i < 4; i++) {
        const base = vistaTexto(E, i);
        const guardado = { manos: E.manos, azar: E.azar, sem: E.semillaNarracion, stats: E.stats };
        E.manos = E.manos.map((mano) => mano.map((cartas, s) => (s === i ? cartas : cartas.map(() => 'arcoiris'))));
        E.azar = E.azar.map(() => [0.99, 0.99, 0.99]);
        E.semillaNarracion = 12345;
        E.stats = E.stats.map((st) => ({ ...st, invalidas: 99, anunciosFalsos: 99 }));
        assert.equal(vistaTexto(E, i), base, `seed ${seed} asiento ${i} mano ${E.mano}`);
        Object.assign(E, { manos: guardado.manos, azar: guardado.azar, semillaNarracion: guardado.sem, stats: guardado.stats });
        vistas++;
      }
      const s = actorDe(E), r = Array(4).fill(null);
      r[s] = normalizarRespuesta(fns[s](E, s, rngs[s]));
      aplicarTurno(E, r);
    }
  }
  assert.ok(vistas > 1000, `solo ${vistas} vistas comprobadas`);
});

test('sensibilidad: cambiar las cartas PROPIAS si cambia la vista (la prueba de arriba no es trivial)', () => {
  const E = enMano1();
  const antes = vistaTexto(E, 0);
  E.manos[0][0] = ['morado', 'morado', 'morado', 'morado', 'morado'];
  assert.notEqual(vistaTexto(E, 0), antes);
});

test('la pista de comprar un espacio no sale en la ultima mano, donde no puede surtir efecto', () => {
  const E = enMano1();
  E.fichasEspacio[0] = 2;
  assert.ok(vistaTexto(E, 0).includes('comprar_espacio'));
  E.mano = 16;
  assert.ok(!vistaTexto(E, 0).includes('comprar_espacio'));
});

test('el singular es singular: "1 ficha", "pones 1 ficha mas"', () => {
  const E = enMano1();
  E.fichas[0] = 1;
  E.fichasEspacio[0] = 1;
  assert.ok(vistaTexto(E, 0).includes('Tienes 1 ficha de juego y 1 de espacio.'));
  const F = enMano1();
  anunciar(F, 'rojo', 6, 1);
  dudar(F, 2);
  const v = vistaTexto(F, 0);
  assert.ok(v.includes('(pones 1 ficha mas y se revelan las cartas)'), v);
  assert.doesNotMatch(v, /\b1 fichas\b/);
});

test('el historial dice lo que GANA el ganador (una ficha de espacio de mas se vuelve ficha de juego) y marca la compra que no se pudo', () => {
  const E = enMano1();
  anunciar(E, 'rojo', 6, 0, 2); // J1 gana 2 fichas de espacio y ya tenia las 4: recibe 2 fichas de juego
  dudar(E);
  assert.ok(vistaTexto(E, 3).includes('gana J1 +2f'), vistaTexto(E, 3));
  const F = enMano1();
  F.fichasEspacio[0] = 2;
  F.fichas[0] = 2;
  anunciar(F, 'rojo', 7, 1, 0, { comprar_espacio: true });
  dudar(F); // J1 pierde 1 ficha y se queda con 1: no puede comprar
  assert.ok(vistaTexto(F, 0).includes('| J1 no compro'), vistaTexto(F, 0));
  assert.ok(!vistaTexto(F, 3).includes('no compro'), 'la peticion que no se pudo cumplir es privada de quien la hizo');
  const G = enMano1();
  G.fichasEspacio[0] = 2;
  anunciar(G, 'rojo', 6, 1, 0, { comprar_espacio: true });
  dudar(G);
  assert.ok(vistaTexto(G, 3).includes('| J1 +espacio'), vistaTexto(G, 3));
});

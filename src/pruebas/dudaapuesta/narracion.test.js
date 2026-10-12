// La historia publica de Duda y apuesta: se cuenta desde el registro, con nombres {0}-{3}, sin palabras duras y sin tocar el juego.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  textoApuesta, narrarAnuncio, narrarDuda, narrarDefensa, narrarResolucion, narrarCierreMano, narrarEpilogo, resolverNombres,
} from '../../juegos/dudaapuesta/narracion.js';
import { cerrarPartida } from '../../juegos/dudaapuesta/turno.js';
import { nuevoEstado, escenarioBasico, paso, anunciar, dudar } from './ayudas.js';

const texto = (lineas) => lineas.map((l) => l.texto).join(' ');
const E0 = nuevoEstado();
const ap = (fichas, espacios = 0) => ({ fichas, espacios });

test('textoApuesta: fichas de juego, de espacio o ambas, con singular y plural', () => {
  assert.equal(textoApuesta(ap(1)), '1 ficha');
  assert.equal(textoApuesta(ap(2)), '2 fichas');
  assert.equal(textoApuesta(ap(1, 1)), '1 ficha y 1 de espacio');
  assert.equal(textoApuesta(ap(0, 1)), '1 ficha de espacio');
  assert.equal(textoApuesta(ap(0, 3)), '3 fichas de espacio');
});

test('un anuncio: la apertura de la mano solo en la primera decision, y quien perdio la anterior', () => {
  const base = { E: E0, mano: 1, decision: 1, s: 0, accion: 'anunciar', anuncio: { color: 'azul', cantidad: 7 }, apuesta: ap(2), reemplazo: false, previo: null };
  const l1 = narrarAnuncio(base);
  assert.equal(l1[0].tipo, 'apertura');
  assert.equal(l1[0].texto, 'Mano 1 de 16. Empieza {0}.');
  assert.match(l1[1].texto, /\{0\} .*al menos 7 cartas azules y apuesta 2 fichas\./);
  assert.match(narrarAnuncio({ ...base, mano: 4, s: 2 })[0].texto, /Mano 4 de 16\. Empieza \{2\}, que perdió la mano anterior\./);
  const l2 = narrarAnuncio({ ...base, decision: 2, s: 1, accion: 'aceptar', previo: { asiento: 0 }, anuncio: { color: 'rojo', cantidad: 8 } });
  assert.equal(l2.length, 1);
  assert.match(l2[0].texto, /\{1\} acepta: \{0\} recupera su apuesta\. .* al menos 8 cartas rojas y apuesta 2 fichas\./);
});

test('una jugada que puso el juego se cuenta como tal, sin atribuirla a la IA', () => {
  const a = narrarAnuncio({ E: E0, mano: 1, decision: 2, s: 1, accion: 'aceptar', anuncio: { color: 'verde', cantidad: 3 }, apuesta: ap(1), reemplazo: true, previo: { asiento: 0 } });
  assert.match(texto(a), /\{1\} no responde bien y el juego acepta y anuncia por \{1\}: al menos 3 cartas verdes/);
  assert.match(texto(narrarDuda({ E: E0, mano: 1, decision: 2, s: 1, p: 0, apuesta: ap(1), subio: false, reemplazo: true })), /no responde bien y el juego duda por \{1\} del anuncio de \{0\}/);
  assert.match(texto(narrarDefensa({ p: 0, accion: 'retirarse', reemplazo: true })), /se retira \(el juego responde por \{0\}\)/);
});

test('la duda: iguala o sube; y la defensa: iguala la subida o se retira sin revelar', () => {
  assert.match(texto(narrarDuda({ E: E0, mano: 1, decision: 2, s: 1, p: 0, apuesta: ap(1), subio: false, reemplazo: false })), /\{1\} .* del anuncio de \{0\} e iguala con 1 ficha\./);
  assert.match(texto(narrarDuda({ E: E0, mano: 1, decision: 2, s: 1, p: 0, apuesta: ap(3), subio: true, reemplazo: false })), /\{1\} duda del anuncio de \{0\} y sube la apuesta a 3 fichas\./);
  assert.equal(texto(narrarDefensa({ p: 0, accion: 'igualar', reemplazo: false })), '{0} iguala la subida.');
  assert.match(texto(narrarDefensa({ p: 0, accion: 'retirarse', reemplazo: false })), /\{0\} se retira y pierde lo que había apostado; las cartas no se revelan\./);
});

test('el desenlace: el conteo por jugador y un comentario segun lo que paso (farol descubierto, justo, anuncio cierto, retirada)', () => {
  const rec = { tipo: 'recuento', color: 'rojo', cantidad: 6, cuentas: [2, 2, 0, 2], real: 6, predictor: 0, dudador: 1, ganador: 0, perdedor: 1, movidas: ap(1) };
  const justo = narrarResolucion({ res: rec });
  assert.match(texto(justo), /Se revelan las cartas: hay 6 rojas \(\{0\} 2, \{1\} 2, \{2\} 0, \{3\} 2\)\. \{0\} gana 1 ficha\./);
  assert.ok(justo.some((l) => l.tipo === 'comentario' && /Justo: había exactamente 6\./.test(l.texto)));
  const cierto = narrarResolucion({ res: { ...rec, cantidad: 4 } });
  assert.ok(cierto.some((l) => l.tipo === 'comentario' && /\{1\} dudó y el anuncio era cierto\./.test(l.texto)));
  const farol = narrarResolucion({ res: { ...rec, cantidad: 8, ganador: 1, perdedor: 0 } });
  assert.ok(farol.some((l) => l.tipo === 'comentario' && /El anuncio de \{0\} no se cumplía: era un farol y \{1\} lo descubre\./.test(l.texto)));
  const retirada = narrarResolucion({ res: { ...rec, tipo: 'retirada', cuentas: null, real: null, ganador: 1, perdedor: 0 } });
  assert.match(texto(retirada), /\{1\} gana 1 ficha sin que se revelen las cartas\./);
  assert.ok(retirada.some((l) => l.tipo === 'comentario' && /\{0\} prefiere no averiguarlo\./.test(l.texto)));
  assert.doesNotMatch(texto(retirada), /hay \d/, 'una retirada no cuenta cartas');
});

test('lo que puso el juego por una respuesta ilegal nunca se le atribuye a la IA en el comentario: ni la duda "descubierta", ni "prefiere no averiguarlo", ni el farol', () => {
  const rec = { tipo: 'recuento', color: 'rojo', cantidad: 8, cuentas: [2, 2, 0, 2], real: 6, predictor: 0, dudador: 1, ganador: 1, perdedor: 0, movidas: ap(1) };
  const comentarios = (res, reemplazos) => narrarResolucion({ res, reemplazos }).filter((l) => l.tipo === 'comentario').map((l) => l.texto).join(' ');
  // el anuncio perdedor lo puso el juego: no es un farol de {0}
  assert.doesNotMatch(comentarios(rec, { anuncio: true, duda: false, defensa: false }), /farol|descubre/);
  assert.match(comentarios(rec, { anuncio: true, duda: false, defensa: false }), /El anuncio que el juego puso por \{0\} no se cumplía\./);
  // la duda la puso el juego: nadie "descubre" nada
  assert.doesNotMatch(comentarios(rec, { anuncio: false, duda: true, defensa: false }), /\{1\} lo descubre/);
  assert.match(comentarios(rec, { anuncio: false, duda: true, defensa: false }), /El anuncio de \{0\} no se cumplía: era un farol\./);
  // lo de siempre cuando las dos jugadas fueron de las IAs
  assert.match(comentarios(rec, { anuncio: false, duda: false, defensa: false }), /era un farol y \{1\} lo descubre\./);
  // el anuncio era cierto y la duda la puso el juego
  const cierto = { ...rec, cantidad: 4, ganador: 0, perdedor: 1 };
  assert.doesNotMatch(comentarios(cierto, { duda: true }), /\{1\} dudó/);
  assert.match(comentarios(cierto, { duda: false }), /\{1\} dudó y el anuncio era cierto\./);
  // la retirada la puso el juego
  const retirada = { ...rec, tipo: 'retirada', cuentas: null, real: null, ganador: 1, perdedor: 0 };
  assert.doesNotMatch(comentarios(retirada, { defensa: true }), /prefiere no averiguarlo/);
  assert.match(comentarios(retirada, { defensa: false }), /\{0\} prefiere no averiguarlo\./);
  // sin banderas (como antes) el comportamiento no cambia
  assert.match(texto(narrarResolucion({ res: rec })), /era un farol y \{1\} lo descubre\./);
});

test('en una partida real, una duda o una retirada de reemplazo no genera comentarios que se las atribuyan a la IA', () => {
  const E = nuevoEstado(5);
  escenarioBasico(E);
  anunciar(E, 'rojo', 6, 1);
  dudar(E, 3);
  const reg = paso(E, null); // la defensa la pone el juego: igualar o retirarse
  const t = texto(reg.narracion.filter((l) => l.tipo === 'comentario'));
  assert.doesNotMatch(t, /prefiere no averiguarlo/);
  const F = nuevoEstado(6);
  escenarioBasico(F);
  anunciar(F, 'rojo', 9, 1);
  F.azar[F.turno][0] = 0.9; // la respuesta de reemplazo de este turno: dudar
  const reg2 = paso(F, null);
  assert.doesNotMatch(texto(reg2.narracion.filter((l) => l.tipo === 'comentario')), /lo descubre|dudó y el anuncio era cierto/);
});

test('el cierre de la mano: el pago a la banca y los espacios comprados', () => {
  assert.deepEqual(narrarCierreMano({ mano: 15, pago: false, compras: [] }), []);
  assert.match(texto(narrarCierreMano({ mano: 15, pago: true, compras: [] })), /Después de la mano 15, cada jugador paga una ficha de juego a la banca\./);
  assert.match(texto(narrarCierreMano({ mano: 3, pago: false, compras: [2] })), /\{2\} cambia una ficha de juego por un espacio más\./);
});

test('el epilogo: eliminacion de uno o de varios, tope con y sin eliminado, y pieza que no se lleva nadie', () => {
  const cierre = (fichas, fe, motivo) => { const E = nuevoEstado(); E.fichas = fichas; E.fichasEspacio = fe; cerrarPartida(E, motivo); return texto(narrarEpilogo(E)); };
  assert.match(cierre([0, 3, 4, 2], [4, 4, 4, 4], 'eliminacion'), /\{0\} se queda sin fichas de juego y queda eliminado\. \{2\} gana la pieza con 4 fichas\. Fichas finales: \{0\} 0, \{1\} 3, \{2\} 4, \{3\} 2\./);
  assert.match(cierre([0, 0, 4, 2], [4, 4, 4, 4], 'eliminacion'), /\{0\} y \{1\} se quedan sin fichas de juego y quedan eliminados\./);
  assert.match(cierre([3, 2, 4, 1], [4, 4, 4, 4], 'tope'), /Se acaban las 16 manos: \{3\} queda eliminado con menos fichas\./);
  assert.match(cierre([2, 2, 3, 3], [4, 4, 4, 4], 'tope'), /los de abajo empatan en fichas: nadie queda eliminado\. Nadie gana la pieza: los de arriba empatan en fichas\./);
  assert.match(cierre([0, 0, 0, 0], [4, 4, 4, 4], 'eliminacion'), /Nadie gana la pieza: todos quedan eliminados\./);
  assert.doesNotMatch(cierre([0, 0, 0, 0], [4, 4, 4, 4], 'eliminacion'), /los de arriba empatan/);
  assert.deepEqual(narrarEpilogo(nuevoEstado()), [], 'sin final no hay epilogo');
});

test('la narracion no cambia el juego: otra semilla de narracion da las mismas fichas, manos y resultado', () => {
  const jugar = (sem) => {
    const E = nuevoEstado(5);
    E.semillaNarracion = sem;
    anunciar(E, 'rojo', 5, 1);
    dudar(E);
    anunciar(E, 'azul', 3, 1);
    dudar(E, 2);
    return { fichas: E.fichas, mano: E.mano, historial: E.historial.map((h) => h.resolucion.ganador) };
  };
  assert.deepEqual(jugar(1), jugar(999999));
});

test('resolverNombres reemplaza {0} a {3} y tiene respaldo', () => {
  const jugadores = [{ nombre: 'Claude' }, { nombre: 'GPT' }, { nombre: 'Gemini' }, { nombre: 'Llama' }];
  assert.equal(resolverNombres('{0} le gana a {3}.', jugadores), 'Claude le gana a Llama.');
  assert.equal(resolverNombres('{1} y {2}', [{ nombre: 'A' }]), 'Jugador 2 y Jugador 3');
  assert.equal(resolverNombres('sin nombres', jugadores), 'sin nombres');
});

test('el singular es singular en la historia publica: "1 carta roja", "hay 1 roja", "2 cartas azules"', () => {
  const base = { E: E0, mano: 1, decision: 2, s: 1, accion: 'anunciar', apuesta: ap(1), reemplazo: false, previo: null };
  assert.match(texto(narrarAnuncio({ ...base, anuncio: { color: 'rojo', cantidad: 1 } })), /al menos 1 carta roja y apuesta 1 ficha\./);
  assert.match(texto(narrarAnuncio({ ...base, anuncio: { color: 'azul', cantidad: 2 } })), /al menos 2 cartas azules/);
  assert.match(texto(narrarAnuncio({ ...base, anuncio: { color: 'morado', cantidad: 1 } })), /1 carta morada/);
  assert.match(texto(narrarAnuncio({ ...base, anuncio: { color: 'verde', cantidad: 1 } })), /1 carta verde/);
  const res = { tipo: 'recuento', color: 'rojo', cantidad: 1, cuentas: [1, 0, 0, 0], real: 1, predictor: 0, dudador: 1, ganador: 0, perdedor: 1, movidas: ap(1) };
  assert.match(texto(narrarResolucion({ res })), /hay 1 roja \(/);
  assert.match(texto(narrarResolucion({ res: { ...res, real: 6, cuentas: [2, 2, 0, 2] } })), /hay 6 rojas \(/);
});

test('la historia dice lo que GANA el ganador (ganado), no solo lo que puso el perdedor', () => {
  const res = { tipo: 'recuento', color: 'rojo', cantidad: 6, cuentas: [2, 2, 0, 2], real: 6, predictor: 0, dudador: 1, ganador: 0, perdedor: 1, movidas: ap(0, 2), ganado: ap(2, 0) };
  assert.match(texto(narrarResolucion({ res })), /\{0\} gana 2 fichas\./);
  assert.match(texto(narrarResolucion({ res: { ...res, ganado: undefined } })), /\{0\} gana 2 fichas de espacio\./, 'sin ganado (registros viejos) se usa movidas');
});

test('comentarios nuevos para la voz: aceptar un anuncio que no se cumplia, quedarse con una sola carta, pasar al frente y la compra que no se pudo', () => {
  const base = { E: E0, mano: 1, decision: 2, s: 1, accion: 'aceptar', anuncio: { color: 'azul', cantidad: 10 }, apuesta: ap(1), reemplazo: false, previo: { asiento: 0 } };
  const comentarios = (lineas) => lineas.filter((l) => l.tipo === 'comentario').map((l) => l.texto).join(' ');
  assert.match(comentarios(narrarAnuncio({ ...base, previoFalso: true })), /El anuncio de \{0\} no se cumplía, pero \{1\} lo acepta\./);
  assert.equal(comentarios(narrarAnuncio({ ...base, previoFalso: false })), '');
  assert.equal(comentarios(narrarAnuncio({ ...base, previoFalso: true, reemplazo: true })), '', 'si la aceptacion la puso el juego no se le atribuye');
  const cierre = comentarios(narrarCierreMano({ mano: 3, pago: false, compras: [], fallidas: [1], sinEspacios: [2], alFrente: 3 }));
  assert.match(cierre, /\{2\} se queda con una sola carta\./);
  assert.match(cierre, /\{3\} pasa al frente en fichas\./);
  assert.match(texto(narrarCierreMano({ mano: 3, pago: false, compras: [], fallidas: [1] })), /\{1\} no puede comprar el espacio: ya no le alcanzan las fichas\./);
  assert.deepEqual(narrarCierreMano({ mano: 3, pago: false, compras: [] }), [], 'sin novedades no hay lineas');
});

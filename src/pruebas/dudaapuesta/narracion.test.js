// La historia publica de Duda y apuesta: se cuenta desde el registro, con nombres {0}-{3}, sin palabras duras y sin tocar el juego.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  textoApuesta, narrarAnuncio, narrarDuda, narrarDefensa, narrarResolucion, narrarCierreMano, narrarEpilogo, resolverNombres,
} from '../../juegos/dudaapuesta/narracion.js';
import { cerrarPartida } from '../../juegos/dudaapuesta/turno.js';
import { nuevoEstado, anunciar, dudar } from './ayudas.js';

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

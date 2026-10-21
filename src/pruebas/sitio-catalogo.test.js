// La logica del sitio (web/catalogo.js): juegos, partidas sueltas (sin series), busqueda libre por juego, IA o seed y filtros de la pagina de un juego. Pura: sin DOM.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS, fechaLarga, fechaCorta, normalizarSeed, normalizarTexto, resumenDeJuegos, partidasDeJuego, iasDe, filtrarPartidas, buscar, leerBusqueda, textoDeBusqueda, resumenDePartida, enlaceDePartida } from '../../web/catalogo.js';

const ia = (id, nombre = id.toUpperCase()) => ({ id, nombre, color: '#111', inicial: nombre[0] });
const juego = (id, nombre, categoria = 'Cat') => ({ id, nombre, categoria });
const CONQ = juego('conquista', 'Guerra de territorios', 'Estrategia y conquista');
const MAYOR = juego('mayormenor', 'Mayor o menor', 'Estrategia de eliminación');
const partida = (serie, n, j, seed, fecha, estado, ids, extra = {}) => ({ serie, n, juego: j, seed, fecha, estado, hastaTurno: estado === 'publicada' ? null : 8, jugadores: ids.map((i) => ia(i)), ganador: null, puntos: null, ...extra });
const P1 = partida('s2', 1, MAYOR, 2991144164, '2026-10-21', 'publicada', ['claude', 'gpt'], { ganador: 'GPT', puntos: [0, 4] });
const P2 = partida('s1', 1, CONQ, 552912962, '2026-10-19', 'publicada', ['claude', 'gpt', 'gemini'], { ganador: 'Claude', puntos: [4, 2, 0] });
const P3 = partida('s1', 2, CONQ, 552912962, '2026-10-19', 'por-publicarse', ['claude', 'gpt', 'gemini']);
const datos = {
  juegos: [
    { ...CONQ, versionReglas: 'conquista-1.1.0', tabla: [{ id: 'claude', nombre: 'Claude', partidas: 1 }] },
    { ...MAYOR, versionReglas: 'mayormenor-1.0.0', tabla: [] },
  ],
  partidas: [P1, P2, P3],
};

test('los seeds se comparan por sus digitos y los textos sin acentos ni mayusculas', () => {
  assert.equal(normalizarSeed('552 912 962'), '552912962');
  assert.equal(normalizarSeed('seed: 552-912-962'), '552912962');
  assert.equal(normalizarSeed(552912962), '552912962');
  for (const raro of [null, undefined, '', 'abc', {}, []]) assert.equal(normalizarSeed(raro), '');
  assert.equal(normalizarTexto('  Eliminación  DE Número '), 'eliminacion de numero');
  assert.equal(normalizarTexto(null), '');
  assert.deepEqual(Object.keys(ESTADOS), ['por-publicarse', 'publicada']);
});

test('las fechas se escriben en UTC: un dia sin hora no se corre al dia anterior', () => {
  assert.match(fechaLarga('2026-10-19'), /19/);
  assert.match(fechaCorta('2026-10-19'), /^19 oct/);
  assert.equal(fechaLarga('basura'), '');
  assert.equal(fechaCorta(undefined), '');
});

test('cada juego trae sus numeros: partidas publicadas, por publicarse, IAs y la ultima fecha; el que mas reciente salio va primero', () => {
  const r = resumenDeJuegos(datos);
  assert.deepEqual(r.map((j) => j.id), ['mayormenor', 'conquista'], 'ordenados por su partida mas reciente');
  const c = r.find((j) => j.id === 'conquista');
  assert.equal(c.publicadas, 1);
  assert.equal(c.porPublicarse, 1);
  assert.equal(c.ultima, '2026-10-19');
  assert.deepEqual(c.ias.map((j) => j.id), ['claude', 'gemini', 'gpt'], 'las IAs que han jugado, por nombre');
  assert.equal(c.categoria, 'Estrategia y conquista');
  assert.equal(c.versionReglas, 'conquista-1.1.0');
  assert.deepEqual(resumenDeJuegos({}), []);
  assert.deepEqual(resumenDeJuegos(null), []);
});

test('un juego sin partidas todavia (solo en la tabla) tambien sale, al final', () => {
  const r = resumenDeJuegos({ juegos: [...datos.juegos, { id: 'fuga', nombre: 'La Fuga', categoria: 'Lealtad', tabla: [] }], partidas: datos.partidas });
  assert.equal(r.at(-1).id, 'fuga');
  assert.equal(r.at(-1).publicadas, 0);
  assert.equal(r.at(-1).ultima, null);
});

test('las partidas de un juego salen de la mas nueva a la mas vieja y sin series', () => {
  assert.deepEqual(partidasDeJuego(datos, 'conquista').map((p) => [p.serie, p.n]), [['s1', 1], ['s1', 2]]);
  assert.deepEqual(partidasDeJuego(datos, 'nada'), []);
  assert.deepEqual(partidasDeJuego(null, 'conquista'), []);
});

test('filtrar las partidas de un juego por IA, estado y seed', () => {
  const todas = [P1, P2, P3];
  assert.equal(filtrarPartidas(todas, {}).length, 3);
  assert.deepEqual(filtrarPartidas(todas, { ia: 'gemini' }), [P2, P3]);
  assert.deepEqual(filtrarPartidas(todas, { estado: 'publicada' }), [P1, P2]);
  assert.deepEqual(filtrarPartidas(todas, { seed: '5529' }), [P2, P3]);
  assert.deepEqual(filtrarPartidas(todas, { seed: '552 912 962', estado: 'por-publicarse' }), [P3]);
  assert.deepEqual(filtrarPartidas(todas, { seed: '7' }), [], 'un digito suelto no es un seed');
  assert.deepEqual(filtrarPartidas(todas, { seed: '9' }), [], 'ni uno que aparece dentro de un seed');
  assert.deepEqual(filtrarPartidas(todas, { seed: 'sin digitos' }), todas, 'un texto sin digitos no filtra');
  assert.deepEqual(filtrarPartidas([null, 5, 'a', {}], { ia: 'x' }), []);
  assert.deepEqual(filtrarPartidas(null, null), []);
});

test('las IAs de una lista de partidas salen una vez, por nombre', () => {
  assert.deepEqual(iasDe([P1, P2]).map((j) => j.id), ['claude', 'gemini', 'gpt']);
  assert.deepEqual(iasDe(null), []);
});

test('la busqueda libre encuentra por nombre de juego, categoria, IA o seed, sin acentos ni mayusculas', () => {
  const ids = (r) => [r.juegos.map((j) => j.id), r.partidas.map((p) => `${p.serie}${p.n}`)];
  assert.deepEqual(ids(buscar(datos, 'GUERRA')), [['conquista'], ['s11', 's12']]);
  assert.deepEqual(ids(buscar(datos, 'eliminacion')), [['mayormenor'], ['s21']], 'sin acento');
  assert.deepEqual(ids(buscar(datos, 'gemini')), [['conquista'], ['s11', 's12']], 'por IA');
  assert.deepEqual(ids(buscar(datos, '552912962')), [['conquista'], ['s11', 's12']], 'por seed');
  assert.deepEqual(ids(buscar(datos, '552 912 962')), [['conquista'], ['s11', 's12']], 'seed con espacios');
  assert.deepEqual(ids(buscar(datos, 'claude mayor')), [['mayormenor'], ['s21']], 'varias palabras: todas deben cuadrar');
  assert.deepEqual(ids(buscar(datos, '99999')), [[], []]);
  assert.deepEqual(ids(buscar(datos, '7')), [[], []], 'un digito suelto no es un seed');
  assert.equal(buscar(datos, '').juegos.length, 2, 'sin texto salen todos los juegos');
  assert.equal(buscar(datos, '   ').partidas.length, 3);
  assert.deepEqual(ids(buscar(null, 'x')), [[], []]);
});

test('la busqueda viaja en la direccion: ?q=, y los enlaces viejos ?seed= siguen sirviendo', () => {
  assert.equal(leerBusqueda('?q=claude'), 'claude');
  assert.equal(leerBusqueda('?seed=552912962'), '552912962', 'los comentarios de los videos ya publicados llevan ?seed=');
  assert.equal(leerBusqueda('?q=a&seed=b'), 'a');
  assert.equal(leerBusqueda(''), '');
  assert.equal(leerBusqueda(undefined), '');
  assert.equal(textoDeBusqueda(' claude  gpt '), '?q=claude+gpt');
  assert.equal(textoDeBusqueda(''), '');
});

test('la linea de resultado de una partida: ganador o hasta donde se ha subido, nunca un resultado sin publicar', () => {
  assert.equal(resumenDePartida(P1), 'Ganó GPT');
  assert.equal(resumenDePartida({ ...P1, ganador: null }), 'Empate');
  assert.equal(resumenDePartida(P3), 'Por publicarse · subida hasta el turno 8');
  assert.equal(resumenDePartida({ ...P3, hastaTurno: 0 }), 'Por publicarse');
  assert.equal(resumenDePartida({ ...P3, ganador: 'Claude', puntos: [1, 2] }), 'Por publicarse · subida hasta el turno 8', 'aunque traiga ganador, no se dice');
});

test('el enlace de una partida lleva a su pagina con la serie y el numero', () => {
  assert.equal(enlaceDePartida(P2), 'partida.html?id=s1&partida=1');
  assert.equal(enlaceDePartida({ serie: 'a b&c', n: 2 }), 'partida.html?id=a%20b%26c&partida=2');
});

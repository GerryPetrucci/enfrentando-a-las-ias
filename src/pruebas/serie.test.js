// Piezas puras de la consola: argumentos, series de rotacion, estimacion de llamadas, modo y destino de los archivos.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearArgumentos, jugadoresDe, errorDeCantidad, planDeSerie, avisosDeSerie, estimarLlamadas, destinoDe, errorDeModo, rutaLibre, errorDeLote, errorDePrimeraRonda, COSTO_MAXIMO_PETICION,
} from '../serie.js';
import conquista from '../juegos/conquista.js';
import dilema from '../juegos/dilema.js';

test('parsearArgumentos lee --clave=valor y --bandera', () => {
  assert.deepEqual(parsearArgumentos(['--a=claude', '--solo', '--x=a=b', 'suelto']), { a: 'claude', solo: true, x: 'a=b' });
});

test('jugadoresDe usa --jugadores si viene y, si no, el duelo --a contra --b', () => {
  assert.deepEqual(jugadoresDe({ jugadores: 'claude, gpt ,gemini' }), ['claude', 'gpt', 'gemini']);
  assert.deepEqual(jugadoresDe({ a: 'claude', b: 'gpt' }), ['claude', 'gpt']);
  assert.deepEqual(jugadoresDe({}), ['tomaydaca', 'siempre-t']);
});

test('errorDeCantidad respeta el minimo y el maximo de cada juego', () => {
  assert.equal(errorDeCantidad(conquista, 2), null);
  assert.equal(errorDeCantidad(conquista, 5), null);
  assert.match(errorDeCantidad(conquista, 1), /entre 2 y 5/);
  assert.match(errorDeCantidad(conquista, 6), /entre 2 y 5/);
  assert.equal(errorDeCantidad(dilema, 2), null);
  assert.match(errorDeCantidad(dilema, 4), /con 2 jugadores/);
});

test('planDeSerie con 2 jugadores alterna asientos como siempre y cambia el seed en cada partida', () => {
  const plan = planDeSerie({ claves: ['a', 'b'], partidas: 3, seedBase: 100 });
  assert.deepEqual(plan.map((p) => p.claves), [['a', 'b'], ['b', 'a'], ['a', 'b']]);
  assert.deepEqual(plan.map((p) => p.seed), [100, 100 + 7919, 100 + 2 * 7919]);
  assert.deepEqual(plan.map((p) => p.rotacion), [0, 1, 0]);
});

test('planDeSerie con 4 jugadores y el mismo seed: cada jugador pasa por cada asiento una vez y el mapa no cambia', () => {
  const plan = planDeSerie({ claves: ['a', 'b', 'c', 'd'], partidas: 4, seedBase: 7, mismoSeed: true });
  assert.ok(plan.every((p) => p.seed === 7));
  for (let asiento = 0; asiento < 4; asiento++) assert.deepEqual(plan.map((p) => p.claves[asiento]).sort(), ['a', 'b', 'c', 'd']);
  for (const clave of ['a', 'b', 'c', 'd']) assert.deepEqual(plan.map((p) => p.claves.indexOf(clave)).sort(), [0, 1, 2, 3]);
  assert.deepEqual(plan[1].claves, ['b', 'c', 'd', 'a']);
});

test('planDeSerie sin rotar deja los asientos fijos', () => {
  const plan = planDeSerie({ claves: ['a', 'b', 'c'], partidas: 3, seedBase: 1, rotar: false });
  assert.ok(plan.every((p) => p.claves.join() === 'a,b,c' && p.rotacion === 0));
});

test('planDeSerie acepta el mismo jugador en varios asientos (para 5 reinos con 4 modelos gratis)', () => {
  const plan = planDeSerie({ claves: ['laguna', 'ling', 'laguna'], partidas: 3, seedBase: 1, mismoSeed: true });
  assert.deepEqual(plan[1].claves, ['ling', 'laguna', 'laguna']);
});

test('avisosDeSerie avisa cuando los asientos no se reparten por igual o no se rotan', () => {
  assert.deepEqual(avisosDeSerie({ k: 4, partidas: 4, rotar: true }), []);
  assert.deepEqual(avisosDeSerie({ k: 4, partidas: 8, rotar: true }), []);
  assert.match(avisosDeSerie({ k: 4, partidas: 3, rotar: true })[0], /desbalanceada.*multiplos de 4/);
  assert.match(avisosDeSerie({ k: 4, partidas: 4, rotar: false })[0], /sin rotar/i);
  assert.deepEqual(avisosDeSerie({ k: 4, partidas: 1, rotar: false }), []);
});

test('estimarLlamadas es el maximo posible: partidas x rondas x jugadores', () => {
  assert.equal(estimarLlamadas(conquista, 4, 4), 4 * 30 * 4);
  assert.equal(estimarLlamadas(dilema, 2, 4), 4 * 10 * 2);
  assert.equal(estimarLlamadas({}, 2, 4), null);
});

test('estimarLlamadas respeta llamadasMax: en un juego por turnos decide un solo jugador, asi que no se multiplica por los jugadores', () => {
  assert.equal(estimarLlamadas({ rondas: 96, llamadasMax: 96 }, 4, 4), 4 * 96);
  assert.equal(estimarLlamadas({ rondas: 96 }, 4, 4), 4 * 96 * 4, 'sin llamadasMax se sigue usando rondas x jugadores');
});

test('destinoDe: los modelos gratis son practica; lo demas es oficial salvo que se pida otra cosa', () => {
  assert.equal(destinoDe({ modo: 'gratis' }), 'pruebas');
  assert.equal(destinoDe({ modo: 'pago' }), 'oficial');
  assert.equal(destinoDe({ modo: null }), 'oficial');
  assert.equal(destinoDe({ modo: 'gratis', destino: 'oficial' }), 'oficial');
  assert.equal(destinoDe({ modo: 'pago', destino: 'pruebas' }), 'pruebas');
  assert.throws(() => destinoDe({ modo: null, destino: 'cualquiera' }), /destino/);
  assert.throws(() => destinoDe({ modo: null, destino: true }), /destino/);
});

test('errorDeModo: sin modelos no hace falta modo; con modelos hay que elegirlo y gratis no admite modelos de pago', () => {
  const contendientes = { claude: { nombre: 'Claude' }, laguna: { nombre: 'Laguna', gratis: true } };
  const modelo = (id, gratis = false) => ({ id, tipo: 'modelo', gratis });
  const bot = { id: 'tomaydaca', tipo: 'bot' };
  assert.equal(errorDeModo({ modo: '', agentes: [bot, bot], contendientes }), null);
  assert.match(errorDeModo({ modo: '', agentes: [modelo('claude'), bot], contendientes }), /--modo=gratis[\s\S]*--modo=pago/);
  assert.match(errorDeModo({ modo: 'barato', agentes: [modelo('laguna', true)], contendientes }), /--modo=gratis/);
  assert.match(errorDeModo({ modo: 'gratis', agentes: [modelo('claude'), modelo('laguna', true)], contendientes }), /claude gasta credito/);
  assert.equal(errorDeModo({ modo: 'gratis', agentes: [modelo('laguna', true), modelo('laguna', true)], contendientes }), null);
  assert.equal(errorDeModo({ modo: 'pago', agentes: [modelo('claude'), modelo('laguna', true)], contendientes }), null);
});

test('rutaLibre nunca pisa un archivo que ya existe: agrega -2, -3...', () => {
  const existentes = new Set(['/d/x.json', '/d/x-2.json']);
  const existe = (r) => existentes.has(r);
  assert.equal(rutaLibre('/d/otro.json', existe), '/d/otro.json');
  assert.equal(rutaLibre('/d/x.json', existe), '/d/x-3.json');
});

test('errorDeLote: el lote exige modelos, modo pago y un tope de gasto positivo', () => {
  const modelos = [{ tipo: 'modelo' }, { tipo: 'bot' }];
  assert.equal(errorDeLote({ lote: false, modo: '', tope: null, agentes: [{ tipo: 'bot' }] }), null, 'sin --lote no se valida nada');
  assert.match(errorDeLote({ lote: true, modo: 'pago', tope: 1, agentes: [{ tipo: 'bot' }, { tipo: 'bot' }] }), /solo aplica a modelos/);
  assert.match(errorDeLote({ lote: true, modo: 'gratis', tope: 1, agentes: modelos }), /--modo=pago/);
  assert.match(errorDeLote({ lote: true, modo: '', tope: 1, agentes: modelos }), /--modo=pago/);
  assert.match(errorDeLote({ lote: true, modo: 'pago', tope: null, agentes: modelos }), /--tope=/);
  assert.match(errorDeLote({ lote: true, modo: 'pago', tope: 0, agentes: modelos }), /--tope=/);
  assert.match(errorDeLote({ lote: true, modo: 'pago', tope: NaN, agentes: modelos }), /--tope=/);
  assert.equal(errorDeLote({ lote: true, modo: 'pago', tope: 0.5, agentes: modelos }), null);
});

test('errorDeLote: un juego que solo se juega en vivo (por turnos, de uno en uno) no admite --lote', () => {
  const modelos = [{ tipo: 'modelo' }, { tipo: 'bot' }];
  const enVivo = { nombre: 'Duda y apuesta', soloEnVivo: true, rondas: 96 };
  assert.match(errorDeLote({ lote: true, modo: 'pago', tope: 0.5, agentes: modelos, juego: enVivo }), /Duda y apuesta.*por turnos.*no admite --lote.*en vivo/);
  assert.equal(errorDeLote({ lote: false, modo: '', tope: null, agentes: modelos, juego: enVivo }), null, 'sin --lote no se valida nada');
  assert.equal(errorDeLote({ lote: true, modo: 'pago', tope: 0.5, agentes: modelos, juego: { nombre: 'Otro' } }), null);
  assert.match(errorDeLote({ lote: true, modo: 'pago', tope: 1, agentes: [{ tipo: 'bot' }], juego: enVivo }), /solo aplica a modelos/, 'con bots sigue mandando el mensaje de siempre');
});

test('errorDeLote: si se le dan los contendientes, exige que alguno tenga variante de lote', () => {
  const contendientes = { claude: { lote: true }, gratis1: { lote: false, gratis: true } };
  const de = (...ids) => ids.map((id) => ({ tipo: 'modelo', id }));
  const base = { lote: true, modo: 'pago', tope: 1, contendientes };
  assert.match(errorDeLote({ ...base, agentes: de('gratis1') }), /variante de lote/);
  assert.equal(errorDeLote({ ...base, agentes: de('gratis1', 'claude') }), null, 'basta con uno: el resto se llama normal');
});

test('destinoDe: los modelos economicos de practica van a pruebas por defecto y no se dejan mandar a oficial', () => {
  assert.equal(destinoDe({ modo: 'pago', practica: true }), 'pruebas');
  assert.equal(destinoDe({ modo: 'pago', destino: 'pruebas', practica: true }), 'pruebas');
  assert.throws(() => destinoDe({ modo: 'pago', destino: 'oficial', practica: true }), /practica/);
  assert.equal(destinoDe({ modo: 'pago' }), 'oficial', 'sin practica nada cambia');
  assert.equal(destinoDe({ modo: 'pago', destino: 'oficial' }), 'oficial');
});

// ---------- huecos que encontro la revision independiente (10 de octubre de 2026) ----------
test('errorDePrimeraRonda: la primera ronda sale entera, asi que se compara su peor caso contra el tope', () => {
  assert.equal(errorDePrimeraRonda({ lote: false, tope: null, peticiones: 100000 }), null, 'sin --lote no se valida nada');
  assert.equal(errorDePrimeraRonda({ lote: true, tope: 0.10, peticiones: 12 }), null);
  assert.equal(errorDePrimeraRonda({ lote: true, tope: 0.10, peticiones: Math.floor(0.10 / COSTO_MAXIMO_PETICION) }), null, 'justo en el limite cabe');
  assert.match(errorDePrimeraRonda({ lote: true, tope: 0.10, peticiones: 1200 }), /primera ronda envia 1200 peticiones.*--tope=0\.1/);
});

test('avisosDeSerie: una serie con el mismo seed es UN mundo, no varias muestras independientes', () => {
  const con = avisosDeSerie({ k: 2, partidas: 4, rotar: true, mismoSeed: true });
  assert.ok(con.some((a) => /mismo mundo/.test(a) && /--seed/.test(a)));
  assert.ok(!avisosDeSerie({ k: 2, partidas: 4, rotar: true }).some((a) => /mismo mundo/.test(a)));
  assert.ok(!avisosDeSerie({ k: 2, partidas: 4, rotar: true, mismoSeed: false }).some((a) => /mismo mundo/.test(a)));
});

// La politica de publicacion (src/publicacion.js): una serie se ve «por publicarse» con su seed y los fragmentos hasta donde llega lo subido; los resultados salen solo con la parte final.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POR_PUBLICARSE, PUBLICADA, numeroDeRonda, ultimaRonda, esParteFinal, partidaParcial, partidaCompleta, registrarParte, armarSeriePublica,
} from '../publicacion.js';
import { jugarConqBots } from './escena/ayudas-conq.js';

const bots = ['agresivo', 'pacifico', 'economico', 'azar'];
const p1 = await jugarConqBots(18, bots), p2 = await jugarConqBots(19, bots);
const serie = () => ({ etiqueta: 'serie-x', fecha: '2026-10-19', seedBase: 18, juego: { id: 'conquista', nombre: 'Guerra de territorios' }, prompt: { version: 'v1.0.0', reglas: 'conquista-1.1.0', hash: 'abc' }, modo: 'pago',
  jugadores: bots, serie: { partidas: 2 }, evaluacion: { partidas: 2, comentario: [{ texto: 'resumen' }] }, partidas: [structuredClone(p1), structuredClone(p2)] });
const SPOILERS = ['puntos', 'ganador', 'empate', 'metricas', 'orden', 'ganoPorMaravilla', 'turnos', 'llamadas', 'avisos', 'usoPorJugador', 'duracionMs', 'tokensUsados', 'epilogo'];

test('numeroDeRonda y ultimaRonda leen el numero de turno o de ronda del registro', () => {
  assert.equal(numeroDeRonda({ turno: 7 }, 0), 7);
  assert.equal(numeroDeRonda({ ronda: 4 }, 0), 4);
  assert.equal(numeroDeRonda({}, 2), 3, 'sin numero, la posicion');
  assert.equal(numeroDeRonda(null, 0), 1);
  assert.equal(ultimaRonda(p1), p1.rondas.at(-1).turno);
  for (const mala of [null, undefined, {}, { rondas: [] }, { rondas: 'x' }]) assert.equal(ultimaRonda(mala), 0);
});

test('es la parte final cuando llega al ultimo turno de una partida terminada; una cortada nunca tiene parte final', () => {
  const ultima = ultimaRonda(p1);
  assert.equal(esParteFinal(p1, ultima), true);
  assert.equal(esParteFinal(p1, ultima + 3), true, 'pasarse tampoco es ir a medias');
  assert.equal(esParteFinal(p1, ultima - 1), false);
  assert.equal(esParteFinal(p1, 8), ultima <= 8);
  assert.equal(esParteFinal({ ...p1, truncada: true }, ultima), false);
  for (const malo of [0, -1, 1.5, '8', null, undefined, NaN]) assert.equal(esParteFinal(p1, malo), false, String(malo));
  assert.equal(esParteFinal(null, 5), false);
  assert.equal(esParteFinal({ rondas: [] }, 5), false);
});

test('una partida por publicarse trae solo hasta el turno subido y NADA del resultado ni de lo que viene despues', () => {
  const parcial = partidaParcial(p1, 8);
  assert.equal(parcial.rondas.length, 8);
  assert.equal(parcial.rondas.at(-1).turno, 8);
  assert.deepEqual(parcial.rondas, p1.rondas.slice(0, 8), 'son los mismos registros, sin tocar');
  assert.equal(parcial.truncada, true);
  assert.deepEqual(parcial.parcial, { hastaTurno: 8 });
  assert.equal(parcial.estadoPublicacion, POR_PUBLICARSE);
  for (const clave of SPOILERS) assert.equal(parcial[clave], undefined, `${clave} adelanta el resultado`);
  assert.equal(parcial.seed, p1.seed);
  assert.deepEqual(parcial.reinos, p1.reinos);
  assert.ok(parcial.mapa && parcial.jugadores.length === 4);
  const texto = JSON.stringify(parcial);
  assert.ok(!texto.includes(`"turno":${9}`) || p1.rondas.length < 9, 'ningun registro del turno 9 en adelante');
  assert.notEqual(parcial.rondas, p1.rondas, 'es una copia');
  parcial.rondas[0].turno = 999;
  assert.notEqual(p1.rondas[0].turno, 999, 'tocar la copia no toca la original');
});

test('antes de subir la parte 1 la partida es solo su seed, y los prompts que se piden se incluyen tal cual', () => {
  const vacia = partidaParcial(p1, 0);
  assert.deepEqual(vacia.rondas, []);
  assert.equal(vacia.seed, p1.seed);
  assert.equal(vacia.parcial.hastaTurno, 0);
  assert.equal(partidaParcial(p1, -3).parcial.hastaTurno, 0);
  const prompts = { turnos: [{ turno: 1, prompts: ['a', 'b', 'c', 'd'] }] };
  assert.deepEqual(partidaParcial(p1, 1, prompts).prompts, prompts);
  assert.equal(partidaParcial(p1, 1).prompts, undefined);
});

test('una partida publicada es la completa, con su resultado, y marcada como publicada', () => {
  const c = partidaCompleta(p1, { turnos: [] });
  assert.equal(c.estadoPublicacion, PUBLICADA);
  assert.deepEqual(c.puntos, p1.puntos);
  assert.equal(c.ganador, p1.ganador);
  assert.deepEqual(c.rondas, p1.rondas);
  assert.deepEqual(c.prompts, { turnos: [] });
  assert.equal(c.truncada, p1.truncada);
});

test('registrarParte lleva la cuenta de las partes subidas sin tocar el registro que recibe; la parte final publica la partida', () => {
  const vacio = { series: {} };
  const a = registrarParte(vacio, { etiqueta: 's', partida: 1, parte: 1, hastaTurno: 8, final: false, fecha: '2026-10-19' });
  assert.deepEqual(vacio, { series: {} });
  assert.deepEqual(a.series.s.partidas[1], { estado: POR_PUBLICARSE, hastaTurno: 8, partes: [{ parte: 1, hastaTurno: 8, final: false, fecha: '2026-10-19' }] });
  const b = registrarParte(a, { etiqueta: 's', partida: 1, parte: 2, hastaTurno: 18, final: true, fecha: '2026-10-22' });
  assert.deepEqual(b.series.s.partidas[1], { estado: PUBLICADA, hastaTurno: 18, partes: [{ parte: 1, hastaTurno: 8, final: false, fecha: '2026-10-19' }, { parte: 2, hastaTurno: 18, final: true, fecha: '2026-10-22' }] });
  const c = registrarParte(b, { etiqueta: 's', partida: 2, parte: 1, hastaTurno: 9, final: false, fecha: '2026-10-26' });
  assert.equal(c.series.s.partidas[1].estado, PUBLICADA, 'la otra partida no se toca');
  assert.equal(c.series.s.partidas[2].estado, POR_PUBLICARSE);
  const d = registrarParte(a, { etiqueta: 's', partida: 1, parte: 1, hastaTurno: 9, final: false, fecha: '2026-10-20' });
  assert.equal(d.series.s.partidas[1].partes.length, 1, 'volver a subir la misma parte la reemplaza');
  assert.equal(d.series.s.partidas[1].hastaTurno, 9);
  assert.equal(registrarParte(null, { etiqueta: 'z', partida: 1, parte: 1, hastaTurno: 2, final: false, fecha: 'f' }).series.z.partidas[1].estado, POR_PUBLICARSE);
});

test('la serie publica: lo publicado completo, lo subido a medias recortado, lo que no se ha subido solo con su seed, y la evaluacion solo cuando todo esta publicado', () => {
  let reg = registrarParte({ series: {} }, { etiqueta: 'serie-x', partida: 1, parte: 1, hastaTurno: 5, final: false, fecha: 'f' });
  const prompts = (n, hasta) => ({ n, hasta });
  let pub = armarSeriePublica(serie(), reg.series['serie-x'], { sistema: 'SISTEMA', porPartida: prompts });
  assert.equal(pub.publicacion.estado, POR_PUBLICARSE);
  assert.equal(pub.evaluacion, undefined, 'sin evaluacion: adelantaria el resultado');
  assert.equal(pub.partidas[0].rondas.length, 5);
  assert.deepEqual(pub.partidas[0].prompts, { n: 1, hasta: 5 });
  assert.deepEqual(pub.partidas[1].rondas, [], 'la 2 aun no tiene partes: solo su seed');
  assert.equal(pub.partidas[1].seed, p2.seed);
  assert.equal(pub.partidas[1].prompts, undefined);
  assert.equal(pub.prompt.sistema, 'SISTEMA');
  assert.equal(pub.prompt.reglas, 'conquista-1.1.0');
  assert.equal(pub.seedBase, 18);
  reg = registrarParte(reg, { etiqueta: 'serie-x', partida: 1, parte: 2, hastaTurno: ultimaRonda(p1), final: true, fecha: 'f' });
  pub = armarSeriePublica(serie(), reg.series['serie-x'], { porPartida: prompts });
  assert.equal(pub.partidas[0].estadoPublicacion, PUBLICADA);
  assert.deepEqual(pub.partidas[0].puntos, p1.puntos);
  assert.deepEqual(pub.partidas[0].prompts, { n: 1, hasta: null });
  assert.equal(pub.partidas[1].estadoPublicacion, POR_PUBLICARSE);
  assert.equal(pub.publicacion.estado, POR_PUBLICARSE, 'una partida pendiente mantiene la serie por publicarse');
  assert.equal(pub.evaluacion, undefined);
  reg = registrarParte(reg, { etiqueta: 'serie-x', partida: 2, parte: 2, hastaTurno: ultimaRonda(p2), final: true, fecha: 'f' });
  pub = armarSeriePublica(serie(), reg.series['serie-x'], {});
  assert.equal(pub.publicacion.estado, PUBLICADA);
  assert.deepEqual(pub.evaluacion, serie().evaluacion, 'con todo publicado, la evaluacion de la serie sale');
  assert.deepEqual(pub.partidas.map((p) => p.estadoPublicacion), [PUBLICADA, PUBLICADA]);
});

test('una partida de Lobo a medio publicar no saca su registro privado (identidades, inspecciones, textos crudos); la completa si lo conserva', async () => {
  const { jugarLobo } = await import('./escena/ayudas-lobo.js');
  const lobo = jugarLobo(3, 8);
  assert.ok(lobo.rondas.every((r) => r.privado), 'el registro de Lobo trae privado en cada turno');
  const parcial = partidaParcial(lobo, 6);
  assert.ok(parcial.rondas.length > 0);
  assert.ok(parcial.rondas.every((r) => r.privado === undefined && r.publico), 'lo que sale a medias es solo lo publico');
  assert.ok(!JSON.stringify(parcial).includes('"privado"'));
  assert.ok(lobo.rondas.every((r) => r.privado), 'no se modifica la partida original');
  assert.ok(partidaCompleta(lobo).rondas.every((r) => r.privado), 'ya publicada la parte final todo es publico');
});

test('sin registro la serie entera esta por publicarse y solo muestra sus seeds; una serie rota no lanza', () => {
  const pub = armarSeriePublica(serie(), null, {});
  assert.equal(pub.publicacion.estado, POR_PUBLICARSE);
  assert.deepEqual(pub.partidas.map((p) => [p.seed, p.rondas.length, p.estadoPublicacion]), [[p1.seed, 0, POR_PUBLICARSE], [p2.seed, 0, POR_PUBLICARSE]]);
  const texto = JSON.stringify(pub);
  for (const clave of SPOILERS) assert.ok(!texto.includes(`"${clave}":`) || clave === 'turnos', `${clave} no debe salir`);
  for (const rota of [null, undefined, {}, { partidas: null }, { partidas: [null] }]) assert.doesNotThrow(() => armarSeriePublica(rota, null, {}));
  assert.equal(armarSeriePublica({}, null, {}).publicacion.estado, POR_PUBLICARSE, 'una serie vacia no se da por publicada');
});
